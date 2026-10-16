//! Authoritative, fail-closed session enforcement. A 1s loop evaluates the
//! station state and, when it can no longer trust an UNLOCKED session, drives
//! the workstation to a locked state and triggers the native lock.
//!
//! The decision is a pure function (`evaluate`) so every transition is
//! unit-tested deterministically; the loop only wires it to shared state, the
//! clock, and the `Locker` seam.

use std::sync::Arc;
use std::time::Duration;

use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::control::now_ms;
use crate::locker::Locker;
use crate::state::{LockState, StationState};
use crate::store::StationStore;

/// A UI silent for longer than this (while UNLOCKED) can no longer vouch for a
/// live session. The UI pings ~every 5s and the watchdog relaunches it after
/// ~8s of silence, so 30s is comfortably past a healthy cadence.
pub const STALE_PING_MS: i64 = 30_000;

/// Interval between enforcement evaluations.
const TICK: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, PartialEq)]
pub struct Transition {
    pub target: LockState,
    pub reason: &'static str,
}

/// Parse an RFC3339 timestamp to epoch-ms, or `None` if unparseable.
fn parse_epoch_ms(iso: &str) -> Option<i64> {
    OffsetDateTime::parse(iso, &Rfc3339)
        .ok()
        .map(|dt| (dt.unix_timestamp_nanos() / 1_000_000) as i64)
}

/// Decide whether the station must transition to a locked state. Returns `None`
/// when the current state is acceptable. Fail-closed: any ambiguity while
/// UNLOCKED resolves to `SAFE_LOCKED`.
pub fn evaluate(state: &StationState, now: i64, stale_ping_ms: i64) -> Option<Transition> {
    if state.lock_state != LockState::Unlocked {
        return None;
    }

    // Ambiguous: UNLOCKED without a bounded session.
    if state.active_session_id.is_none() || state.scheduled_end_at.is_none() {
        return Some(Transition {
            target: LockState::SafeLocked,
            reason: "unlocked without an active session",
        });
    }

    // Stale UI liveness: a hung-but-alive UI must not hold the station open.
    if let Some(last_ping) = state.last_ping_at {
        if now - last_ping > stale_ping_ms {
            return Some(Transition {
                target: LockState::SafeLocked,
                reason: "ui liveness ping is stale",
            });
        }
    }

    // Session expiry (authoritative backstop for server-scheduled end).
    match state.scheduled_end_at.as_deref().and_then(parse_epoch_ms) {
        Some(end_ms) if now >= end_ms => Some(Transition {
            target: LockState::Locked,
            reason: "session expired",
        }),
        None => Some(Transition {
            target: LockState::SafeLocked,
            reason: "unparseable session expiry",
        }),
        _ => None,
    }
}

/// Apply a transition to the station state (clearing session fields).
fn apply(state: &mut StationState, transition: &Transition) {
    state.lock_state = transition.target;
    state.active_session_id = None;
    state.scheduled_end_at = None;
}

/// Run one enforcement step against shared state; returns true if a lock was
/// (re-)triggered this tick (used by the loop and tests).
///
/// Level-triggered, not just edge-triggered: `evaluate` only returns a
/// transition on the tick the state flips to locked/safe-locked, so a plain
/// "call `locker.lock()` only when a transition fires" leaves a window where
/// the OS session becomes unlocked again on its own (no Windows password,
/// autologin, or a race with the interactive shell) while our model still
/// says locked — nothing would ever re-assert the OS lock. So this also
/// re-issues `locker.lock()` on every tick the persisted state is already
/// locked/safe-locked, even with no transition. `LockWorkStation` is a cheap,
/// idempotent no-op when the session is already locked.
pub fn tick(station: &StationStore, locker: &dyn Locker) -> bool {
    let snapshot = station.snapshot();
    match evaluate(&snapshot, now_ms(), STALE_PING_MS) {
        Some(transition) => {
            log::warn!(
                "enforcement: {} → {:?} (fail-closed)",
                transition.reason,
                transition.target
            );
            station.update(|s| apply(s, &transition));
            locker.lock();
            true
        }
        None if snapshot.lock_state != LockState::Unlocked => {
            locker.lock();
            true
        }
        None => false,
    }
}

/// Spawn the enforcement loop, supervised: a panic mid-tick (e.g. a poisoned
/// mutex) restarts the loop instead of silently ending enforcement forever.
pub fn spawn(station: Arc<StationStore>, locker: Arc<dyn Locker>) {
    crate::supervise::spawn_supervised("enforcement", move || {
        let station = station.clone();
        let locker = locker.clone();
        async move {
            log::info!("enforcement loop started");
            loop {
                tick(&station, locker.as_ref());
                tokio::time::sleep(TICK).await;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locker::test_support::SpyLocker;

    fn unlocked(session: Option<&str>, end: Option<&str>, last_ping: Option<i64>) -> StationState {
        StationState {
            lock_state: LockState::Unlocked,
            active_session_id: session.map(String::from),
            scheduled_end_at: end.map(String::from),
            pc_id: None,
            last_ping_at: last_ping,
        }
    }

    const NOW: i64 = 1_700_000_000_000;

    #[test]
    fn unlocked_without_session_safe_locks() {
        let t = evaluate(&unlocked(None, None, Some(NOW)), NOW, STALE_PING_MS).unwrap();
        assert_eq!(t.target, LockState::SafeLocked);
    }

    #[test]
    fn stale_ping_safe_locks() {
        let st = unlocked(Some("s1"), Some("2999-01-01T00:00:00Z"), Some(NOW - 40_000));
        let t = evaluate(&st, NOW, STALE_PING_MS).unwrap();
        assert_eq!(t.target, LockState::SafeLocked);
        assert_eq!(t.reason, "ui liveness ping is stale");
    }

    #[test]
    fn expired_session_locks() {
        let st = unlocked(Some("s1"), Some("2000-01-01T00:00:00Z"), Some(NOW));
        let t = evaluate(&st, NOW, STALE_PING_MS).unwrap();
        assert_eq!(t.target, LockState::Locked);
        assert_eq!(t.reason, "session expired");
    }

    #[test]
    fn unparseable_expiry_safe_locks() {
        let st = unlocked(Some("s1"), Some("not-a-date"), Some(NOW));
        let t = evaluate(&st, NOW, STALE_PING_MS).unwrap();
        assert_eq!(t.target, LockState::SafeLocked);
    }

    #[test]
    fn healthy_active_session_no_transition() {
        let st = unlocked(Some("s1"), Some("2999-01-01T00:00:00Z"), Some(NOW));
        assert!(evaluate(&st, NOW, STALE_PING_MS).is_none());
    }

    #[test]
    fn already_locked_no_transition() {
        assert!(evaluate(&StationState::default(), NOW, STALE_PING_MS).is_none());
    }

    #[test]
    fn tick_relocks_when_already_locked_with_no_transition() {
        // Default state is already LOCKED (no transition needed), but the OS
        // session may have become unlocked on its own (no password/autologin)
        // — tick() must keep re-asserting the OS lock, not just on transitions.
        let dir = tempfile::tempdir().unwrap();
        let store = StationStore::load_or_default("seal".into(), dir.path().join("s.json"));
        assert_eq!(store.snapshot().lock_state, LockState::Locked);

        let locker = SpyLocker::default();
        assert!(tick(&store, &locker));
        assert!(tick(&store, &locker));
        assert_eq!(locker.count(), 2, "lock() must re-assert every tick while locked");
    }

    #[test]
    fn tick_applies_transition_and_locks() {
        let dir = tempfile::tempdir().unwrap();
        let store = StationStore::load_or_default("seal".into(), dir.path().join("s.json"));
        // Seed an ambiguous UNLOCKED-without-session state.
        store.update(|s| *s = unlocked(None, None, None));

        let locker = SpyLocker::default();
        assert!(tick(&store, &locker));
        assert_eq!(store.snapshot().lock_state, LockState::SafeLocked);
        assert_eq!(store.snapshot().active_session_id, None);
        assert_eq!(locker.count(), 1);
    }
}
