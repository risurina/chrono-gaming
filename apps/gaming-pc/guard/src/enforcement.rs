//! Authoritative, fail-closed session enforcement. A 1s loop evaluates the
//! station state and, when it can no longer trust an UNLOCKED session, drives
//! the workstation to a locked state and triggers the native lock.
//!
//! The decision is a pure function (`evaluate`) so every transition is
//! unit-tested deterministically; the loop only wires it to shared state, the
//! clock, and the `Locker` seam.

use std::sync::Arc;
use std::time::{Duration, Instant};

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

/// How far the wall clock may move BACKWARD relative to the monotonic clock
/// between ticks before it is treated as tampering. Generous enough to absorb a
/// small NTP step; a customer rolling the clock back to extend a paid session
/// moves it far more than this.
pub const CLOCK_BACKWARD_TOLERANCE_MS: i64 = 10_000;

/// Pure core of clock-tamper detection: given the monotonic elapsed and the
/// wall-clock elapsed between two consecutive observations, report how far the
/// wall clock ran BACKWARD relative to monotonic time (`mono_delta - wall_delta`,
/// positive = wall lagged/went back). Forward jumps (wall ran ahead, e.g. resume
/// from suspend — monotonic QPC doesn't advance while suspended) return ≤ 0 and
/// are deliberately ignored: setting the clock forward only expires a session
/// early, it never buys time.
fn backward_skew_ms(mono_delta_ms: i64, wall_delta_ms: i64) -> i64 {
    mono_delta_ms - wall_delta_ms
}

/// Stateful monotonic-vs-wall clock monitor, owned by the enforcement loop. The
/// guard previously trusted the wall clock alone for expiry, so a backward
/// system-clock change (with `SeSystemtimePrivilege`) extended a live session
/// without the guard noticing (the UI had this check, the guard did not).
pub struct ClockMonitor {
    last: Option<(Instant, i64)>,
    tolerance_ms: i64,
}

impl ClockMonitor {
    pub fn new(tolerance_ms: i64) -> Self {
        ClockMonitor { last: None, tolerance_ms }
    }

    /// Record the current `(monotonic, wall)` pair and report whether the wall
    /// clock jumped backward beyond tolerance since the previous observation.
    pub fn check(&mut self, wall_now_ms: i64) -> bool {
        let mono_now = Instant::now();
        let jumped = match self.last {
            Some((mono_prev, wall_prev)) => {
                let mono_delta = mono_now.saturating_duration_since(mono_prev).as_millis() as i64;
                let wall_delta = wall_now_ms - wall_prev;
                backward_skew_ms(mono_delta, wall_delta) > self.tolerance_ms
            }
            None => false,
        };
        self.last = Some((mono_now, wall_now_ms));
        jumped
    }
}

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

    // Ambiguous: UNLOCKED with no server-validated session at all. A session
    // WITHOUT a scheduled end is now valid (an open-ended server session — see
    // below); only the complete absence of a session id is ambiguous.
    if state.active_session_id.is_none() {
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

    // Session expiry (authoritative backstop for the server-scheduled end).
    // A `None` end is an open-ended server session (Phase 3): no wall-clock
    // expiry — it stays unlocked, relying on the next server poll + the
    // stale-ping backstop above. A present-but-unparseable end fails closed.
    match state.scheduled_end_at.as_deref() {
        None => None,
        Some(iso) => match parse_epoch_ms(iso) {
            Some(end_ms) if now >= end_ms => Some(Transition {
                target: LockState::Locked,
                reason: "session expired",
            }),
            Some(_) => None,
            None => Some(Transition {
                target: LockState::SafeLocked,
                reason: "unparseable session expiry",
            }),
        },
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
            let mut clock = ClockMonitor::new(CLOCK_BACKWARD_TOLERANCE_MS);
            loop {
                // Clock-tamper backstop: a backward wall-clock jump (vs the
                // monotonic clock) while a session is open is treated as an
                // attempt to extend paid time — fail closed to SAFE_LOCKED
                // before the wall-clock expiry check in tick() can be fooled.
                if clock.check(now_ms()) && station.snapshot().lock_state == LockState::Unlocked {
                    log::warn!(
                        "enforcement: wall clock moved backward > {CLOCK_BACKWARD_TOLERANCE_MS}ms vs monotonic — SAFE_LOCK (clock tamper)"
                    );
                    station.update(|s| {
                        apply(
                            s,
                            &Transition {
                                target: LockState::SafeLocked,
                                reason: "system clock moved backward",
                            },
                        )
                    });
                    locker.lock();
                }
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
    fn open_ended_active_session_no_transition() {
        // Phase 3: a server session with no scheduled end (null) stays unlocked
        // with no wall-clock expiry — relying on the next server poll + the
        // stale-ping backstop, NOT a safe-lock.
        let st = unlocked(Some("s1"), None, Some(NOW));
        assert!(evaluate(&st, NOW, STALE_PING_MS).is_none());
    }

    #[test]
    fn open_ended_session_still_safe_locks_on_stale_ping() {
        // The open-ended allowance must not defeat the stale-ping backstop.
        let st = unlocked(Some("s1"), None, Some(NOW - 40_000));
        let t = evaluate(&st, NOW, STALE_PING_MS).unwrap();
        assert_eq!(t.target, LockState::SafeLocked);
        assert_eq!(t.reason, "ui liveness ping is stale");
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
    fn backward_clock_jump_detected() {
        // Monotonic advanced ~1s while the wall clock jumped back 30s.
        assert!(backward_skew_ms(1000, -30_000) > CLOCK_BACKWARD_TOLERANCE_MS);
    }

    #[test]
    fn forward_clock_jump_ignored() {
        // Resume-from-suspend: wall advanced 60s but monotonic (QPC) only 1s.
        // Forward skew must NOT trip the backstop — it never buys session time.
        assert!(backward_skew_ms(1000, 60_000) <= CLOCK_BACKWARD_TOLERANCE_MS);
    }

    #[test]
    fn normal_and_jittery_ticks_do_not_trip() {
        assert!(backward_skew_ms(1000, 1000) <= CLOCK_BACKWARD_TOLERANCE_MS);
        assert!(backward_skew_ms(1000, 980) <= CLOCK_BACKWARD_TOLERANCE_MS);
        // A small backward NTP step (<10s) is tolerated.
        assert!(backward_skew_ms(1000, -4000) <= CLOCK_BACKWARD_TOLERANCE_MS);
    }

    #[test]
    fn clock_monitor_first_check_never_trips() {
        let mut m = ClockMonitor::new(CLOCK_BACKWARD_TOLERANCE_MS);
        assert!(!m.check(NOW), "first observation has no baseline to compare");
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
