//! Operator recovery, mirroring `handleRecoveryPin` in `main.ts`.
//! A recovery chord opens a PIN window; the entered PIN is verified by the
//! LocalSystem **guard** (over the signed control channel), never by this
//! non-admin UI. The PIN hash lives in the guard's ACL'd store and is never
//! readable here. On a `valid: true` answer the UI reverts kiosk policies and
//! drops the station into maintenance (unchanged from before).

use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::json;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::app_state::AppState;
use crate::service_client;

static NONCE_SEQ: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Ask the guard to verify a recovery PIN over the signed control channel.
/// Returns `false` when no control key is provisioned, signing fails, the guard
/// is unreachable, or the PIN is wrong. The PIN is sent only to the loopback
/// guard and is never logged.
async fn verify_pin_via_guard(state: &AppState, pin: &str) -> bool {
    let Some(secret) = service_client::read_control_key() else {
        return false;
    };
    let body = json!({ "pin": pin }).to_string();
    let ts = now_ms().to_string();
    let nonce = format!("{}-{}", ts, NONCE_SEQ.fetch_add(1, Ordering::Relaxed));
    let Some(sig) =
        service_client::sign_request("POST", "/recovery/verify", &body, &secret, &ts, &nonce)
    else {
        return false;
    };
    let url = format!("{}/recovery/verify", service_client::service_url());
    let headers = [
        ("x-timestamp", sig.timestamp),
        ("x-nonce", sig.nonce),
        ("x-signature", sig.signature),
    ];
    match state.http.post_json(&url, body, &headers).await {
        Some(resp) => resp.get("valid").and_then(|v| v.as_bool()).unwrap_or(false),
        None => false,
    }
}

/// Open the recovery PIN window (renderer route `?windowMode=recovery`).
pub fn open_recovery_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("recovery") {
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(
        app,
        "recovery",
        WebviewUrl::App("index.html?windowMode=recovery".into()),
    )
    .title("Operator Recovery")
    .inner_size(400.0, 220.0)
    .resizable(false)
    .always_on_top(true)
    .build();
}

/// Submit a recovery PIN from the recovery window. The guard verifies the PIN;
/// on a valid answer the UI reverts policies and sets maintenance state.
#[tauri::command]
pub async fn submit_recovery_pin(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    pin: String,
) -> Result<bool, ()> {
    if !verify_pin_via_guard(state.inner(), &pin).await {
        log::warn!("[Security] Operator recovery failed: invalid PIN or guard unavailable");
        return Ok(false);
    }
    log::info!("[Security] Operator recovery PIN accepted; entering maintenance");
    crate::policy::revert(true);

    let patch = json!({
        "lockState": "LOCKED",
        "isMaintenance": true,
        "lastKnownStatus": "MAINTENANCE"
    });
    let merged = state.store.patch_local_client_state(&patch);
    crate::kiosk::broadcast_state(&app, &merged);

    if let Some(win) = app.get_webview_window("recovery") {
        let _ = win.close();
    }
    Ok(true)
}
