//! Realtime device-command channel. The Rust core owns the Socket.IO
//! connection (never the webview — see `lib/realtime.ts`'s comment); this
//! module connects, authenticates, and bridges `device-command` events into
//! the same authoritative pipeline the 30s heartbeat drain already uses
//! (`commands::system::run_server_command`), closing the latency gap between
//! an operator action on the server and the station reacting to it.
//!
//! ## Ack-delivery limitation (read before touching this file)
//!
//! The server (`apps/chrono-api/src/realtime/socket.ts` `emitDeviceCommand`)
//! sends commands via `target.timeout(ackTimeoutMs).emit('device-command',
//! payload, ackCallback)` — a Socket.IO-protocol-level ack that resolves only
//! when the *client's own transport* invokes the implicit per-message ack
//! callback (the same mechanism the JS client exposes as the last argument to
//! an `.on()` listener). The `rust_socketio` crate (checked against its 0.6
//! docs) exposes `emit_with_ack` for *outgoing* client-initiated acks but has
//! no public API to reply to an *incoming* server-initiated ack request. So
//! `emitDeviceCommand` will always hit its ack timeout and log/report the
//! command as "not confirmed delivered" server-side, even though this client
//! received and executed it immediately.
//!
//! This is a cosmetic server-side telemetry gap, not a functional one: the
//! command still arrives on this event listener and is executed right away
//! (the actual latency win), and the heartbeat/pending-command drain remains
//! as a backstop that will redeliver the same command — safely idempotent via
//! the existing replay-nonce guard in `command_auth`/`Store::try_mutate`, so
//! double-delivery never double-applies a command.
//!
//! Separately, after executing a command this module emits the plain
//! (non-ack) `device-command-ack` event so branch staff still see the
//! execution result in the admin UI — that path does not depend on the
//! protocol-level ack above at all.

use futures_util::FutureExt;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::Payload;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex as AsyncMutex;

use crate::app_state::AppState;

pub const COMMAND_EVENT: &str = "realtime:command";
pub const STATUS_EVENT: &str = "realtime:status-change";

/// Holds the live connection, if any, so a later `ack_command` call (or a
/// future re-init) can reach it. An async `Mutex` because it's held across
/// `.emit().await`.
#[derive(Default)]
pub struct RealtimeState {
    client: AsyncMutex<Option<Client>>,
}

fn emit_status(app: &AppHandle, status: &str, error: Option<&str>) {
    let _ = app.emit(STATUS_EVENT, json!({ "status": status, "error": error }));
}

/// Connect to the realtime channel and wire the `device-command` bridge.
/// `config` carries `{ apiUrl, deviceToken, fingerprint }` from the renderer
/// (see `lib/realtime.ts`) — the server's device-auth path
/// (`apps/chrono-api/src/realtime/socket.ts`) only needs `token` +
/// `fingerprint` in the handshake `auth` payload, nothing else.
pub async fn initialize(app: AppHandle, config: Value) -> Result<(), String> {
    let api_url = config
        .get("apiUrl")
        .and_then(|v| v.as_str())
        .ok_or("realtime config missing apiUrl")?
        .to_string();
    let device_token = config
        .get("deviceToken")
        .and_then(|v| v.as_str())
        .ok_or("realtime config missing deviceToken")?
        .to_string();
    let fingerprint = config
        .get("fingerprint")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let command_app = app.clone();
    let status_app = app.clone();
    let open_app = app.clone();
    let close_app = app.clone();

    let builder = ClientBuilder::new(api_url)
        .auth(json!({ "token": device_token, "fingerprint": fingerprint }))
        .reconnect(true)
        .reconnect_delay(1_000, 30_000)
        .on("device-command", move |payload, socket| {
            let app = command_app.clone();
            async move {
                handle_device_command(app, socket, payload).await;
            }
            .boxed()
        })
        // Socket.IO lifecycle: "open" fires on every (re)connect, "close" on
        // every disconnect — these drive the renderer's connected/disconnected
        // branches in `lib/realtime.ts` via `realtime:status-change`.
        .on("open", move |_, _| {
            let app = open_app.clone();
            async move {
                log::info!("realtime: connection opened");
                emit_status(&app, "connected", None);
            }
            .boxed()
        })
        .on("close", move |_, _| {
            let app = close_app.clone();
            async move {
                log::warn!("realtime: connection closed");
                emit_status(&app, "disconnected", None);
            }
            .boxed()
        })
        .on("error", move |payload, _| {
            let app = status_app.clone();
            async move {
                let msg = match payload {
                    Payload::Text(v) => v.iter().map(|x| x.to_string()).collect::<Vec<_>>().join(", "),
                    _ => "unknown realtime error".to_string(),
                };
                log::error!("realtime: transport error: {msg}");
                emit_status(&app, "error", Some(&msg));
            }
            .boxed()
        });

    match builder.connect().await {
        Ok(client) => {
            log::info!("realtime: connected");
            emit_status(&app, "connected", None);
            let state = app.state::<RealtimeState>();
            *state.client.lock().await = Some(client);
            Ok(())
        }
        Err(e) => {
            log::error!("realtime: connect failed: {e}");
            emit_status(&app, "error", Some(&e.to_string()));
            Err(e.to_string())
        }
    }
}

/// Handle one `device-command` event: run it through the authoritative
/// pipeline immediately, forward it to the webview for UI-side effects (game
/// launcher, toasts — parity with the previous renderer-owned flow), and
/// report the execution result back to the server for branch-staff visibility.
async fn handle_device_command(app: AppHandle, socket: Client, payload: Payload) {
    let Payload::Text(values) = payload else {
        log::warn!("realtime: device-command payload was not JSON text; ignoring");
        return;
    };
    let Some(command) = values.into_iter().next() else {
        log::warn!("realtime: device-command payload was empty; ignoring");
        return;
    };

    // INVARIANT (verified against the renderer): this forwards the raw,
    // as-yet-unverified command to the webview for COSMETIC UI side-effects ONLY
    // — the renderer's `realtime:command` handler (`lib/realtime.ts` →
    // `features/commands/executor.ts`) dispatches only toasts and local UI-status
    // hints ("Enforcement moved to Tauri core"). It never performs a privileged
    // OS action. All authoritative enforcement runs below in
    // `run_server_command`, which re-validates and HMAC-verifies the command
    // first. Do NOT let the renderer act on this event in a privileged way; keep
    // it cosmetic so emitting pre-verification stays safe.
    let _ = app.emit(COMMAND_EVENT, command.clone());

    let cmd_id = command.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let state = app.state::<AppState>();
    let (raw_success, raw_error) =
        crate::commands::system::run_server_command(&app, state.inner(), &command);
    // Same replay mapping as the heartbeat drain: a redelivered (already
    // executed) command acks as a successful no-op, not a failure.
    let (success, error) = crate::heartbeat::ack_result_for(raw_success, raw_error);

    let ack = json!({
        "id": cmd_id,
        "success": success,
        "errorMessage": error,
    });
    if let Err(e) = socket.emit("device-command-ack", ack).await {
        log::warn!("realtime: failed to emit device-command-ack: {e}");
    }
}

/// Explicit ack from the renderer path (kept for API compatibility with the
/// existing `realtime_ack_command` invoke — the Rust core already acks
/// autoritatively right after executing a command in `handle_device_command`,
/// so this is a best-effort supplementary emit, not the primary ack path).
pub async fn ack_command(realtime: &RealtimeState, ack: Value) -> bool {
    let guard = realtime.client.lock().await;
    let Some(client) = guard.as_ref() else {
        return false;
    };
    client.emit("device-command-ack", ack).await.is_ok()
}
