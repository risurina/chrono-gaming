//! In-memory station state. Phase 3 replaces this with a durable, HMAC-sealed
//! store; the shape here is the authoritative model the control channel and
//! (Phase 2) the enforcement loop read and mutate.

use serde::{Deserialize, Serialize};

/// The lock disposition of the workstation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LockState {
    Locked,
    Unlocked,
    /// Fail-closed lock entered when the guard can no longer trust the session
    /// (ambiguous state, stale UI liveness). Produced by the Phase 2
    /// enforcement loop.
    #[allow(dead_code)]
    SafeLocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StationState {
    pub lock_state: LockState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_end_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pc_id: Option<String>,
    /// Epoch-ms of the last authenticated UI ping (liveness signal).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_ping_at: Option<i64>,
}

impl Default for StationState {
    /// Fail-closed default: a freshly-started guard holds the station LOCKED
    /// until an authenticated session says otherwise.
    fn default() -> Self {
        StationState {
            lock_state: LockState::Locked,
            active_session_id: None,
            scheduled_end_at: None,
            pc_id: None,
            last_ping_at: None,
        }
    }
}
