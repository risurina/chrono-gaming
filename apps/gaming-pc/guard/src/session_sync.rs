//! Server-authoritative session sync — the Phase 3 keystone.
//!
//! The guard no longer trusts the UI's `/ping` to decide whether the station is
//! unlocked and until when. Instead, this supervised loop asks `chrono-api` the
//! authoritative question — `GET {apiBaseUrl}/session/active` with the device
//! bearer token + fingerprint — and drives the authoritative `StationState` from
//! the server's answer. A holder of the control key can forge a `/ping`, but it
//! cannot forge the server's answer, so it can no longer buy session time.
//!
//! The server credentials are learned from the UI over the already-signed
//! control channel (`control::session_credentials`), stored in-memory only, and
//! re-sent by the UI periodically so a guard restart recovers. The device token
//! is never logged.
//!
//! Fail-closed on error: a request failure / unreachable server leaves the
//! last server-validated window untouched — enforcement (`enforcement.rs`) still
//! expires it at `scheduled_end_at`, the stale-ping backstop still fires, and
//! the Phase-2 monotonic clock backstop still applies. We never *extend* on
//! error.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;

use crate::state::LockState;
use crate::store::StationStore;

/// How often the guard re-validates session state against the server.
const POLL_INTERVAL: Duration = Duration::from_secs(15);

/// Per-request timeout for the server call.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Server credentials the guard uses to authenticate its own API calls. Learned
/// from the UI over the signed control channel; held in memory only.
#[derive(Clone)]
pub struct ServerCredentials {
    /// Device-scoped API base (already includes `/api/v1/device`), as resolved
    /// by the UI's `http::api_base_url()`.
    pub api_base_url: String,
    /// Device bearer token. NEVER logged.
    pub device_token: String,
    /// Device hardware fingerprint (`x-device-fingerprint`).
    pub fingerprint: String,
}

// Manual Debug so a stray `{:?}` can never leak the bearer token.
impl std::fmt::Debug for ServerCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServerCredentials")
            .field("api_base_url", &self.api_base_url)
            .field("device_token", &"[redacted]")
            .field("fingerprint", &self.fingerprint)
            .finish()
    }
}

/// Shared, lock-guarded slot the control channel writes and the sync loop reads.
pub type SharedCredentials = Arc<Mutex<Option<ServerCredentials>>>;

/// Create an empty credentials slot (shared by `AppState` and the sync loop).
pub fn shared_credentials() -> SharedCredentials {
    Arc::new(Mutex::new(None))
}

/// The server's `/session/active` envelope: `{ "session": {...} | null }`.
#[derive(Debug, Deserialize)]
struct ActiveSessionEnvelope {
    #[serde(default)]
    session: Option<ServerSession>,
}

/// The subset of the server session the guard enforces on. Extra fields the
/// server returns (`memberName`, `rateSnapshot`, ...) are ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerSession {
    id: String,
    status: String,
    #[serde(default)]
    scheduled_end_at: Option<String>,
}

/// The authoritative state transition derived from one server answer.
#[derive(Debug, Clone, PartialEq)]
pub enum SessionSyncOutcome {
    /// Server reports an active session → unlock for this id/end. A `None` end
    /// is an open-ended session: unlocked with no wall-clock expiry, relying on
    /// the next poll + the stale-ping/enforcement backstops.
    Active {
        session_id: String,
        scheduled_end_at: Option<String>,
    },
    /// Server reports no active session (or a non-active one) → lock and clear.
    Inactive,
    /// Request failed / server unreachable → do not change state (fail-closed:
    /// keep the last server-validated window; never extend).
    Unchanged,
}

/// Pure mapping from a parsed server answer to the authoritative outcome.
/// `None` means the request failed / could not be parsed (unreachable server,
/// non-2xx, malformed body) → `Unchanged`. Kept pure so every transition is
/// unit-tested without a real network.
fn outcome_from_response(parsed: Option<&ActiveSessionEnvelope>) -> SessionSyncOutcome {
    match parsed {
        None => SessionSyncOutcome::Unchanged,
        Some(env) => match &env.session {
            Some(s) if s.status == "active" => SessionSyncOutcome::Active {
                session_id: s.id.clone(),
                scheduled_end_at: s.scheduled_end_at.clone(),
            },
            // Session absent or not active → lock.
            _ => SessionSyncOutcome::Inactive,
        },
    }
}

/// Apply an outcome to the authoritative station store. `Unchanged` is a no-op
/// so an offline poll never disturbs the last server-validated window.
fn apply_outcome(station: &StationStore, outcome: &SessionSyncOutcome) {
    match outcome {
        SessionSyncOutcome::Unchanged => {}
        SessionSyncOutcome::Active { session_id, scheduled_end_at } => {
            station.update(|s| {
                s.lock_state = LockState::Unlocked;
                s.active_session_id = Some(session_id.clone());
                s.scheduled_end_at = scheduled_end_at.clone();
            });
        }
        SessionSyncOutcome::Inactive => {
            station.update(|s| {
                s.lock_state = LockState::Locked;
                s.active_session_id = None;
                s.scheduled_end_at = None;
            });
        }
    }
}

/// Call `GET {apiBaseUrl}/session/active` with the device bearer + fingerprint.
/// Returns the parsed envelope, or `None` on any network error, non-2xx status,
/// or unparseable body (all of which map to `Unchanged`). The token is never
/// logged.
async fn fetch_active_session(
    client: &reqwest::Client,
    creds: &ServerCredentials,
) -> Option<ActiveSessionEnvelope> {
    let url = format!("{}/session/active", creds.api_base_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", creds.device_token))
        .header("x-device-fingerprint", &creds.fingerprint)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<ActiveSessionEnvelope>().await.ok()
}

/// Spawn the supervised session-sync loop. Shares the authoritative station
/// store and the credentials slot the control channel populates.
pub fn spawn(station: Arc<StationStore>, credentials: SharedCredentials) {
    crate::supervise::spawn_supervised("session-sync", move || {
        let station = station.clone();
        let credentials = credentials.clone();
        async move {
            log::info!("session sync loop started");
            let client = reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            loop {
                // Snapshot the credentials under the lock, then release it
                // before any `.await` on the network call.
                let creds = {
                    let guard = credentials.lock().unwrap_or_else(|e| e.into_inner());
                    guard.clone()
                };
                if let Some(creds) = creds {
                    let parsed = fetch_active_session(&client, &creds).await;
                    let outcome = outcome_from_response(parsed.as_ref());
                    match &outcome {
                        SessionSyncOutcome::Unchanged => {
                            log::debug!("session-sync: server unreachable; keeping last window")
                        }
                        SessionSyncOutcome::Active { .. } => {
                            log::debug!("session-sync: server reports active session → UNLOCKED")
                        }
                        SessionSyncOutcome::Inactive => {
                            log::debug!("session-sync: server reports no active session → LOCKED")
                        }
                    }
                    apply_outcome(&station, &outcome);
                }
                tokio::time::sleep(POLL_INTERVAL).await;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn envelope(value: serde_json::Value) -> ActiveSessionEnvelope {
        serde_json::from_value(value).expect("valid envelope")
    }

    #[test]
    fn active_session_maps_to_unlock_with_end() {
        let env = envelope(json!({
            "session": {
                "id": "sess-1",
                "status": "active",
                "scheduledEndAt": "2030-01-01T00:00:00Z"
            }
        }));
        assert_eq!(
            outcome_from_response(Some(&env)),
            SessionSyncOutcome::Active {
                session_id: "sess-1".into(),
                scheduled_end_at: Some("2030-01-01T00:00:00Z".into()),
            }
        );
    }

    #[test]
    fn active_session_with_null_end_is_open_ended_unlock() {
        let env = envelope(json!({
            "session": { "id": "sess-2", "status": "active", "scheduledEndAt": null }
        }));
        assert_eq!(
            outcome_from_response(Some(&env)),
            SessionSyncOutcome::Active { session_id: "sess-2".into(), scheduled_end_at: None }
        );
    }

    #[test]
    fn null_session_maps_to_inactive() {
        let env = envelope(json!({ "session": null }));
        assert_eq!(outcome_from_response(Some(&env)), SessionSyncOutcome::Inactive);
    }

    #[test]
    fn non_active_status_maps_to_inactive() {
        let env = envelope(json!({
            "session": { "id": "sess-3", "status": "paused", "scheduledEndAt": null }
        }));
        assert_eq!(outcome_from_response(Some(&env)), SessionSyncOutcome::Inactive);
    }

    #[test]
    fn request_error_maps_to_unchanged() {
        // `None` models an unreachable server / non-2xx / unparseable body.
        assert_eq!(outcome_from_response(None), SessionSyncOutcome::Unchanged);
    }

    fn test_store() -> StationStore {
        let dir = tempfile::tempdir().unwrap();
        StationStore::load_or_default("seal".into(), dir.path().join("s.json"))
    }

    #[test]
    fn apply_active_unlocks_and_sets_fields() {
        let store = test_store();
        apply_outcome(
            &store,
            &SessionSyncOutcome::Active {
                session_id: "sess-1".into(),
                scheduled_end_at: Some("2030-01-01T00:00:00Z".into()),
            },
        );
        let s = store.snapshot();
        assert_eq!(s.lock_state, LockState::Unlocked);
        assert_eq!(s.active_session_id.as_deref(), Some("sess-1"));
        assert_eq!(s.scheduled_end_at.as_deref(), Some("2030-01-01T00:00:00Z"));
    }

    #[test]
    fn apply_inactive_locks_and_clears_fields() {
        let store = test_store();
        // Seed an unlocked window first.
        apply_outcome(
            &store,
            &SessionSyncOutcome::Active {
                session_id: "sess-1".into(),
                scheduled_end_at: Some("2030-01-01T00:00:00Z".into()),
            },
        );
        apply_outcome(&store, &SessionSyncOutcome::Inactive);
        let s = store.snapshot();
        assert_eq!(s.lock_state, LockState::Locked);
        assert_eq!(s.active_session_id, None);
        assert_eq!(s.scheduled_end_at, None);
    }

    #[test]
    fn apply_unchanged_keeps_last_window() {
        let store = test_store();
        apply_outcome(
            &store,
            &SessionSyncOutcome::Active {
                session_id: "sess-1".into(),
                scheduled_end_at: Some("2030-01-01T00:00:00Z".into()),
            },
        );
        // An error poll must NOT disturb the last server-validated window.
        apply_outcome(&store, &SessionSyncOutcome::Unchanged);
        let s = store.snapshot();
        assert_eq!(s.lock_state, LockState::Unlocked);
        assert_eq!(s.active_session_id.as_deref(), Some("sess-1"));
        assert_eq!(s.scheduled_end_at.as_deref(), Some("2030-01-01T00:00:00Z"));
    }

    #[test]
    fn credentials_debug_redacts_token() {
        let creds = ServerCredentials {
            api_base_url: "https://api.example/api/v1/device".into(),
            device_token: "super-secret-token".into(),
            fingerprint: "fp-1".into(),
        };
        let rendered = format!("{creds:?}");
        assert!(!rendered.contains("super-secret-token"));
        assert!(rendered.contains("[redacted]"));
    }
}
