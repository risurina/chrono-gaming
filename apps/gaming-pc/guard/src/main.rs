//! `chrono-guard` — the Chrono station guard.
//!
//! Runs as a separate always-on process (a Windows service as LocalSystem in
//! production; a plain process in dev) so station enforcement survives the user
//! closing the Tauri UI. Phase 1 stands up the loopback **station control
//! channel**; watchdog + enforcement (Phase 2) and durable sealed state
//! (Phase 3) build on this state.

mod control;
mod enforcement;
mod locker;
mod recovery;
#[cfg(windows)]
mod session;
mod session_sync;
mod state;
mod store;
mod supervise;
mod watchdog;
#[cfg(windows)]
mod windows_service;

use std::path::PathBuf;
use std::sync::Arc;

use store::StationStore;

use std::net::{Ipv4Addr, SocketAddr};

use control::AppState;
use rand::RngCore;

/// Read a provisioned key from `path`, or generate + persist a fresh 32-byte
/// one. Storage goes through `chrono_control::{read,write}_secret`, so the key
/// is DPAPI machine-scope encrypted at rest on Windows (identity in dev).
fn provision_key(path: &PathBuf, label: &str) -> std::io::Result<String> {
    if let Some(existing) = chrono_control::read_secret(path) {
        return Ok(existing);
    }
    let mut raw = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw);
    let key = hex_encode(&raw);
    chrono_control::write_secret(path, &key)?;
    log::info!("provisioned new {label} at {}", path.display());
    Ok(key)
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

/// Control-channel bind port (loopback only). Overridable for dev/tests.
fn control_port() -> u16 {
    std::env::var("CHRONO_CONTROL_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3202)
}

fn main() {
    // Install-time helper, invoked by `install-service.ps1` *before* the service
    // runs: read an operator recovery PIN from stdin (never argv, so it can't
    // leak via the process table) and print its salted PBKDF2 record. Sharing
    // this code path with verification guarantees the stored record and the
    // runtime check derive identically. Checked before logger init so stdout
    // carries only the record. The PIN is never logged or persisted here.
    if std::env::args().nth(1).as_deref() == Some("hash-pin") {
        std::process::exit(run_hash_pin());
    }

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    // On Windows, if launched by the Service Control Manager, run under it;
    // otherwise (dev / manual launch) run interactively.
    #[cfg(windows)]
    {
        if windows_service::try_run_as_service() {
            return;
        }
    }

    run_interactive();
}

/// `chrono-guard hash-pin`: derive the salted recovery record for a PIN read
/// from stdin. Rejects PINs shorter than 8 characters. Returns a process exit
/// code (0 = success).
fn run_hash_pin() -> i32 {
    use std::io::Read;
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        eprintln!("hash-pin: failed to read PIN from stdin");
        return 1;
    }
    let pin = input.trim_end_matches(['\r', '\n']);
    if pin.chars().count() < 8 {
        eprintln!("hash-pin: recovery PIN must be at least 8 characters");
        return 2;
    }
    println!("{}", recovery::hash_pin(pin));
    0
}

/// Run the guard in the foreground until Ctrl-C (dev / manual launch).
fn run_interactive() {
    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(e) => {
            log::error!("failed to build tokio runtime: {e}");
            std::process::exit(1);
        }
    };
    runtime.block_on(serve(async {
        let _ = tokio::signal::ctrl_c().await;
        log::info!("ctrl-c received; stopping");
    }));
}

/// Provision keys, load sealed state, start the enforcers, and serve the control
/// channel until `shutdown` resolves. Shared by the interactive and (Windows)
/// service entry points.
pub(crate) async fn serve<S>(shutdown: S)
where
    S: std::future::Future<Output = ()> + Send + 'static,
{
    let control_key =
        match provision_key(&chrono_control::control_key_path(), "station control key") {
            Ok(k) => k,
            Err(e) => {
                log::error!("failed to provision control key: {e}");
                return;
            }
        };
    let seal_key = match provision_key(&chrono_control::seal_key_path(), "state seal key") {
        Ok(k) => k,
        Err(e) => {
            log::error!("failed to provision seal key: {e}");
            return;
        }
    };

    // Durable, tamper-sealed station state (fail-closed on boot).
    let station = Arc::new(StationStore::load_or_default(
        seal_key,
        chrono_control::station_state_path(),
    ));

    // Server credentials the UI hands the guard over the signed control channel;
    // shared with the session-sync loop so the guard can ask the server the
    // authoritative "is there an active session?" question itself.
    let credentials = session_sync::shared_credentials();

    // Background enforcers share the authoritative station state.
    enforcement::spawn(station.clone(), Arc::new(locker::WorkstationLocker));
    watchdog::spawn(station.clone(), Arc::new(watchdog::SystemSupervisor::default()));
    session_sync::spawn(station.clone(), credentials.clone());

    let state = AppState::new(control_key, station, credentials);
    let app = control::router(state);
    // Loopback-only: the control channel must never be reachable off-host.
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, control_port()));

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("failed to bind control channel on {addr}: {e}");
            return;
        }
    };
    log::info!("station control channel listening on {addr}");

    if let Err(e) = axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
    {
        log::error!("control channel server error: {e}");
    }
}
