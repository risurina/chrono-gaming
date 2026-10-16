//! Background auto-update daemon (parity with the Electron client's
//! autoUpdater manager). Periodically checks the update endpoint configured
//! in `tauri.conf.json` (`/api/v1/device/updates/{{target}}/{{arch}}/{{current_version}}`)
//! and applies new builds only while the station is idle, then relaunches.

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppState;
use crate::telemetry;

/// Renderer event: an update download/install has begun, so the UI should
/// switch to the SYSTEM_UPDATE screen until the app relaunches.
pub const UPDATE_STARTED_EVENT: &str = "system-update:started";

const INITIAL_DELAY_SECS: u64 = 90;
const DEFAULT_CHECK_INTERVAL_SECS: u64 = 60 * 60;
/// Retry sooner when an update is pending but a customer session is active.
const BUSY_RETRY_SECS: u64 = 5 * 60;

pub fn spawn(handle: AppHandle) {
    // Kill switch / interval override for operators and dev machines.
    if std::env::var("CHRONO_DISABLE_AUTO_UPDATE").ok().as_deref() == Some("1") {
        log::info!("[Updater] auto-update disabled via CHRONO_DISABLE_AUTO_UPDATE");
        return;
    }
    let interval = std::env::var("CHRONO_UPDATE_CHECK_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .filter(|v| *v >= 60)
        .unwrap_or(DEFAULT_CHECK_INTERVAL_SECS);

    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(INITIAL_DELAY_SECS)).await;
        loop {
            let delay = match tick(&handle).await {
                TickOutcome::DeferredBusy => BUSY_RETRY_SECS,
                TickOutcome::Idle => interval,
            };
            tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
        }
    });
}

enum TickOutcome {
    Idle,
    DeferredBusy,
}

async fn tick(handle: &AppHandle) -> TickOutcome {
    let updater = match handle.updater() {
        Ok(updater) => updater,
        Err(err) => {
            log::warn!("[Updater] updater unavailable: {err}");
            return TickOutcome::Idle;
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return TickOutcome::Idle,
        Err(err) => {
            // Expected while offline; the next tick retries.
            log::warn!("[Updater] update check failed: {err}");
            return TickOutcome::Idle;
        }
    };

    // Never pull the rug out from under a paying customer: defer the install
    // while a session is active and retry on the short interval.
    if session_active(handle) {
        log::info!(
            "[Updater] update {} available, deferring install: session active",
            update.version
        );
        return TickOutcome::DeferredBusy;
    }

    log::info!("[Updater] installing update {}", update.version);
    let _ = handle.emit(UPDATE_STARTED_EVENT, update.version.clone());

    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => {
            log::info!("[Updater] update installed; relaunching");
            handle.restart();
        }
        Err(err) => {
            log::error!("[Updater] update install failed: {err}");
            telemetry::capture_error_message(&format!("Auto-update install failed: {err}"));
            TickOutcome::Idle
        }
    }
}

/// True when the persisted local client state shows an in-progress customer
/// session (mirrors `session_state::resolve_runtime_status`'s ACTIVE branch).
fn session_active(handle: &AppHandle) -> bool {
    let state = handle.state::<AppState>();
    let Some(local) = state.store.get("local_client_state") else {
        return false;
    };
    local
        .get("activeSessionId")
        .map(|v: &Value| !v.is_null())
        .unwrap_or(false)
}
