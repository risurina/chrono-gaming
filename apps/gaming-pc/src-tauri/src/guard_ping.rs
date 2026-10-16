//! Guard liveness ping + server-credential handoff.
//!
//! Every ~5s this POSTs two signed requests to the local `chrono-guard` control
//! channel:
//!
//! - `/ping` — **liveness-only** (Phase 3). It carries at most `{ pcId }`; it no
//!   longer asserts `lockState`/`activeSessionId`/`scheduledEndAt`, because the
//!   guard is now server-authoritative for session validity (see
//!   `guard/src/control.rs::ping`). Without this feed the guard's watchdog
//!   considers the UI dead.
//! - `/session/credentials` — hands the guard the device bearer token +
//!   fingerprint + API base so its `session_sync` loop can ask the server the
//!   authoritative session question itself. Re-sent every tick so a guard
//!   restart recovers within one interval. The device token is never logged.
//!
//! Failure policy: never crash, never spam. Outcomes are logged only on state
//! *transitions* (e.g. guard not installed → reachable → failing), so a machine
//! without the guard service logs one warning, not one every 5 seconds.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::service_client;

const PING_INTERVAL_SECS: u64 = 5;

static NONCE_SEQ: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// One tick's outcome, tracked so logging only happens on transitions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PingOutcome {
    /// Guard answered the signed ping.
    Ok,
    /// No station control key on disk — guard service not installed/provisioned.
    NoControlKey,
    /// Key present but the ping failed (guard down, signature rejected, ...).
    Failed,
}

/// Build the exact liveness `/ping` body the guard expects (`PingBody { state }`
/// with camelCase fields — see `guard/src/control.rs`). Phase 3: this carries
/// ONLY `pcId`; session validity is no longer asserted by the UI, so the old
/// `lockState`/`activeSessionId`/`scheduledEndAt` fields are deliberately gone.
/// Returned as a string because the control-channel HMAC signs over the exact
/// body bytes.
pub(crate) fn build_ping_body(local: &Value) -> String {
    let g = |k: &str| local.get(k).cloned().unwrap_or(Value::Null);
    json!({
        "state": {
            "pcId": g("pcId"),
        }
    })
    .to_string()
}

/// Spawn the 5s guard ping loop (alongside `heartbeat::start` in lib.rs setup).
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last: Option<PingOutcome> = None;
        loop {
            let outcome = tick(&app).await;
            if last != Some(outcome) {
                match outcome {
                    PingOutcome::Ok => {
                        log::info!("[guard-ping] guard reachable; liveness ping active")
                    }
                    PingOutcome::NoControlKey => log::warn!(
                        "[guard-ping] no station control key provisioned (guard service not installed?); will keep checking quietly"
                    ),
                    PingOutcome::Failed => log::warn!(
                        "[guard-ping] signed /ping to the guard is failing; retrying every {PING_INTERVAL_SECS}s (further failures logged on state change only)"
                    ),
                }
                last = Some(outcome);
            }
            tokio::time::sleep(Duration::from_secs(PING_INTERVAL_SECS)).await;
        }
    });
}

async fn tick(app: &AppHandle) -> PingOutcome {
    let state_guard = app.state::<AppState>();
    let state = state_guard.inner();

    let Some(secret) = service_client::read_control_key() else {
        return PingOutcome::NoControlKey;
    };

    // Hand the guard its server credentials every tick so a guard restart
    // recovers within one interval. Best-effort: a failure here never affects
    // the liveness outcome below.
    send_credentials(state, &secret).await;

    let local = state.store.get("local_client_state").unwrap_or(json!({}));
    let body = build_ping_body(&local);

    let ts = now_ms().to_string();
    let nonce = format!("{}-{}", ts, NONCE_SEQ.fetch_add(1, Ordering::Relaxed));
    let Some(sig) = service_client::sign_request("POST", "/ping", &body, &secret, &ts, &nonce)
    else {
        return PingOutcome::Failed;
    };

    let url = format!("{}/ping", service_client::service_url());
    let headers = [
        ("x-timestamp", sig.timestamp),
        ("x-nonce", sig.nonce),
        ("x-signature", sig.signature),
    ];
    if state.http.post_ok(&url, body, &headers).await {
        PingOutcome::Ok
    } else {
        PingOutcome::Failed
    }
}

/// POST the guard its server credentials (API base + device token + fingerprint)
/// over the signed control channel. Best-effort and silent: no control key, no
/// device token, a signing failure, or the guard being unreachable all return
/// without touching the ping outcome. The device token is NEVER logged.
async fn send_credentials(state: &AppState, secret: &str) {
    let Some(device_token) = state.store.get_string("device_token") else {
        return; // unpaired — nothing to hand the guard yet
    };
    let body = json!({
        "apiBaseUrl": crate::http::api_base_url(),
        "deviceToken": device_token,
        "fingerprint": state.fingerprint,
    })
    .to_string();

    let ts = now_ms().to_string();
    let nonce = format!("{}-{}", ts, NONCE_SEQ.fetch_add(1, Ordering::Relaxed));
    let Some(sig) =
        service_client::sign_request("POST", "/session/credentials", &body, secret, &ts, &nonce)
    else {
        return;
    };
    let url = format!("{}/session/credentials", service_client::service_url());
    let headers = [
        ("x-timestamp", sig.timestamp),
        ("x-nonce", sig.nonce),
        ("x-signature", sig.signature),
    ];
    let _ = state.http.post_ok(&url, body, &headers).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_body_is_liveness_only() {
        // Phase 3: the ping carries ONLY pcId. Session fields the UI may still
        // hold locally must NOT be sent — the guard would ignore them anyway,
        // but not sending them is the contract.
        let local = json!({
            "lockState": "UNLOCKED",
            "activeSessionId": "sess-1",
            "scheduledEndAt": "2030-01-01T00:00:00Z",
            "pcId": "pc-9",
            "unrelated": "ignored",
        });
        let body: Value = serde_json::from_str(&build_ping_body(&local)).unwrap();
        assert_eq!(body["state"]["pcId"], json!("pc-9"));
        assert!(body["state"].get("lockState").is_none(), "must not send lockState");
        assert!(body["state"].get("activeSessionId").is_none(), "must not send activeSessionId");
        assert!(body["state"].get("scheduledEndAt").is_none(), "must not send scheduledEndAt");
        assert!(body["state"].get("unrelated").is_none());
    }

    #[test]
    fn ping_body_uses_null_for_missing_pc_id() {
        let body: Value = serde_json::from_str(&build_ping_body(&json!({}))).unwrap();
        assert_eq!(body["state"]["pcId"], Value::Null);
    }

    #[test]
    fn ping_body_signature_roundtrips_via_control_contract() {
        // The guard verifies the HMAC over the exact body string; prove the
        // shared `chrono-control` sign/verify pair accepts what we produce.
        let body = build_ping_body(&json!({ "lockState": "LOCKED" }));
        let ts = now_ms().to_string();
        let sig = chrono_control::sign_request("POST", "/ping", &body, "test-key", &ts, "n-1")
            .expect("sign");
        assert!(chrono_control::verify_request(
            "POST",
            "/ping",
            &body,
            "test-key",
            &sig.timestamp,
            &sig.nonce,
            &sig.signature
        ));
    }
}
