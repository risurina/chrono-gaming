//! System-level commands: authoritative server-command processing (verify →
//! audit → execute), audit-log access, watchdog health, and process snapshot.
//! These are the entry points that wire the tested `command_auth`, `audit`,
//! `executor`, `service_client`, and `process_monitor` modules into live use.

use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::app_state::AppState;
use crate::audit;
use crate::command_auth::{record_if_new, validate_command, verify_command, REPLAY_SET_CAP};
use crate::executor;
use crate::process_monitor;
use crate::service_client;

static AUDIT_SEQ: AtomicU64 = AtomicU64::new(0);

/// Error string returned when the replay guard rejects a redelivered command.
/// Callers ACK such redeliveries as a successful no-op (the command already
/// executed once) rather than marking an executed command FAILED server-side.
pub const REPLAY_ERROR: &str = "replayed command";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn audit_id() -> String {
    format!("audit-{}-{}", now_ms(), AUDIT_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn audit(state: &AppState, event_type: &str, payload: Value, severity: &str) {
    audit::log_event(&state.store, audit_id(), event_type, now_iso(), Some(payload), severity);
}

/// Authoritatively process a signed server command: structural validation →
/// HMAC/envelope verification → audit → state transition + OS action.
/// Mirrors the Electron main-process command handling and is the sink the
/// realtime bridge routes incoming commands through.
#[tauri::command]
pub fn process_device_command(app: AppHandle, state: State<AppState>, command: Value) -> Value {
    let (success, error) = run_server_command(&app, state.inner(), &command);
    match error {
        Some(e) => json!({ "success": success, "error": e }),
        None => json!({ "success": success }),
    }
}

/// Full authoritative server-command pipeline (validate → verify → audit →
/// state transition + OS action), reusable by the realtime/webhook path and the
/// heartbeat pending-command drain. Returns (success, error).
pub fn run_server_command(
    app: &AppHandle,
    state: &AppState,
    command: &Value,
) -> (bool, Option<String>) {
    let cmd_id = command.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let ctype = command.get("type").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let internal = executor::is_internal_state_sync(&cmd_id);

    if let Err(e) = validate_command(command, "server") {
        audit(state, "COMMAND_REJECTED", json!({ "commandId": cmd_id, "error": e }), "WARN");
        return (false, Some(e));
    }

    let local_state = state.store.get("local_client_state").unwrap_or(json!({}));
    let device_token = state.store.get_string("device_token").unwrap_or_default();
    if let Err(e) = verify_command(command, &local_state, &device_token, now_ms()) {
        audit(state, "COMMAND_REJECTED", json!({ "commandId": cmd_id, "error": e }), "WARN");
        return (false, Some(e));
    }

    // Replay guard: a signed command stays valid for its whole expiry window, so
    // a captured envelope could be re-sent. Reject any nonce we've already
    // executed. Internal state-sync commands are locally generated (unsigned) and
    // exempt.
    if !internal {
        let nonce = command.get("nonce").and_then(|v| v.as_str()).unwrap_or("").to_string();
        // Defense in depth: an empty nonce can't be replay-guarded, so reject it
        // outright (same as a failed verification) instead of silently skipping
        // the replay set — otherwise an unguarded command could slip through.
        if nonce.is_empty() {
            audit(
                state,
                "COMMAND_REJECTED",
                json!({ "commandId": cmd_id, "error": "MISSING_NONCE" }),
                "WARN",
            );
            return (false, Some("missing nonce".into()));
        }
        // Check-and-record atomically under one lock hold (Store::try_mutate)
        // so two concurrent deliveries of the same nonce (e.g. the realtime
        // path and the heartbeat drain racing) can't both read the replay
        // set before either writes back and both pass.
        let accepted = state.store.try_mutate("command_replay", |current| {
            let mut seen: Vec<String> = current
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            if record_if_new(&mut seen, &nonce, REPLAY_SET_CAP) {
                Some(json!(seen))
            } else {
                None
            }
        });
        if accepted.is_none() {
            audit(
                state,
                "COMMAND_REJECTED",
                json!({ "commandId": cmd_id, "error": "REPLAY" }),
                "WARN",
            );
            return (false, Some(REPLAY_ERROR.into()));
        }
    }

    if !internal {
        audit(state, "COMMAND_ACCEPTED", json!({ "commandId": cmd_id, "type": ctype }), "INFO");
    }

    let payload = command.get("payloadJson").cloned().unwrap_or(json!({}));
    if let Some(patch) = executor::state_update_for(&ctype, &payload, &now_iso()) {
        let merged = state.store.patch_local_client_state(&patch);
        crate::kiosk::broadcast_state(app, &merged);
    }
    match executor::run_os_action(&ctype, &payload) {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e)),
    }
}

#[tauri::command]
pub fn get_audit_logs(state: State<AppState>) -> Vec<audit::AuditEvent> {
    audit::get_logs(&state.store)
}

/// Probe the local watchdog service `/health` with an HMAC-signed request.
/// Returns `None` when no control key is provisioned or signing fails (i.e. the
/// health is genuinely unknown), else `Some(healthy)`. Reused by the heartbeat
/// to report a real `serviceHealth` instead of a hardcoded value.
pub async fn probe_service_health(state: &AppState) -> Option<bool> {
    let secret = service_client::read_control_key()?;
    let ts = now_ms().to_string();
    // Vary the nonce with a monotonic seq + time (no RNG dependency).
    let nonce = format!("{}-{}", ts, AUDIT_SEQ.fetch_add(1, Ordering::Relaxed));
    let sig = service_client::sign_request("GET", "/health", "", &secret, &ts, &nonce)?;
    let url = format!("{}/health", service_client::service_url());
    let headers = [
        ("x-timestamp", sig.timestamp),
        ("x-nonce", sig.nonce),
        ("x-signature", sig.signature),
    ];
    Some(state.http.get_ok(&url, &headers).await)
}

/// Poll the local watchdog service `/health` with an HMAC-signed request.
#[tauri::command]
pub async fn check_service_health(state: State<'_, AppState>) -> Result<Value, ()> {
    match probe_service_health(state.inner()).await {
        Some(healthy) => Ok(json!({ "healthy": healthy, "url": service_client::service_url() })),
        None => Ok(json!({ "healthy": false, "reason": "no control key provisioned" })),
    }
}

/// Snapshot of running (non-system) processes, with launched/closed diff vs the
/// last snapshot held in app state.
#[tauri::command]
pub fn snapshot_processes(state: State<AppState>) -> Value {
    let current = process_monitor::snapshot_names();
    let mut prev = state.last_processes.lock().unwrap();
    let diff = process_monitor::diff(&prev, &current);
    *prev = current.clone();
    json!({
        "processes": current.iter().collect::<Vec<_>>(),
        "launched": diff.launched,
        "closed": diff.closed,
    })
}
