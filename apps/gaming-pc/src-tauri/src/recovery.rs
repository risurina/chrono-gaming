//! Operator recovery, mirroring `handleRecoveryPin` in `main.ts`.
//! A recovery chord opens a PIN window; a correct PIN (SHA-256 matched against
//! `CHRONO_RECOVERY_PIN_HASH`, constant-time) reverts kiosk policies and drops
//! the station into maintenance.

use serde_json::json;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::app_state::AppState;

/// Verify a recovery PIN against the configured SHA-256 hex hash, constant-time.
pub fn verify_pin(pin: &str, expected_hash: &str) -> bool {
    if expected_hash.is_empty() {
        return false;
    }
    let mut h = Sha256::new();
    h.update(pin.as_bytes());
    let got = h.finalize();
    match hex::decode(expected_hash) {
        Ok(expected) if expected.len() == got.len() => got.as_slice().ct_eq(&expected).into(),
        _ => false,
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

/// Submit a recovery PIN from the recovery window. On success reverts policies
/// and sets maintenance state.
#[tauri::command]
pub fn submit_recovery_pin(app: AppHandle, state: tauri::State<AppState>, pin: String) -> bool {
    let expected = std::env::var("CHRONO_RECOVERY_PIN_HASH").unwrap_or_default();
    if !verify_pin(&pin, &expected) {
        log::warn!("[Security] Operator recovery failed: invalid PIN");
        return false;
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
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sha256_hex(s: &str) -> String {
        let mut h = Sha256::new();
        h.update(s.as_bytes());
        hex::encode(h.finalize())
    }

    #[test]
    fn correct_pin_verifies() {
        let hash = sha256_hex("1234");
        assert!(verify_pin("1234", &hash));
    }

    #[test]
    fn wrong_pin_rejected() {
        let hash = sha256_hex("1234");
        assert!(!verify_pin("0000", &hash));
    }

    #[test]
    fn empty_hash_never_verifies() {
        assert!(!verify_pin("anything", ""));
    }

    #[test]
    fn malformed_hash_rejected() {
        assert!(!verify_pin("1234", "not-hex"));
    }
}
