//! UI watchdog. The Tauri client pings the control channel while alive; if it
//! goes silent the watchdog inspects the process table and relaunches (or kills
//! a hung instance and relaunches) so the station never sits without its shell.
//!
//! OS interaction is behind the `UiSupervisor` seam so the decision logic is
//! unit-tested off-Windows; the real supervisor uses `sysinfo` + process spawn.

use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::control::now_ms;
use crate::store::StationStore;

/// UI silence (vs last ping) that triggers a process-table investigation. The
/// UI pings ~every 5s, so 8s means ~2 missed pings.
pub const SILENCE_MS: i64 = 8_000;

/// Interval between watchdog checks.
const TICK: Duration = Duration::from_secs(5);

/// After a relaunch, give the fresh process this long before it's eligible to
/// be judged "present but hung" again. Without this, the just-launched
/// process hasn't pinged yet (station `last_ping_at` is still stale from
/// before the restart), so the very next tick's `ever_pinged=true` +
/// "present" reading calls it hung and kills it — a permanent kill/relaunch
/// loop that never lets the UI actually start.
const RELAUNCH_GRACE: Duration = Duration::from_secs(20);

/// Circuit breaker: more than this many relaunches inside `RESTART_WINDOW`
/// trips the breaker for the rest of the window instead of relaunching
/// forever — guards against e.g. `CHRONO_UI_PROCESS`/the exe path not
/// matching the real UI, which would otherwise make `find_ui` always report
/// "missing" and spawn a fresh process every tick indefinitely.
const MAX_RESTARTS_PER_WINDOW: u32 = 5;
const RESTART_WINDOW: Duration = Duration::from_secs(60);

/// OS actions the watchdog needs, abstracted for testing.
pub trait UiSupervisor: Send + Sync {
    /// PID of a running UI process, if any.
    fn find_ui(&self) -> Option<u32>;
    /// Launch the UI shell.
    fn relaunch(&self);
    /// Terminate a (hung) UI process.
    fn kill(&self, pid: u32);
}

#[derive(Debug, PartialEq)]
pub enum Action {
    /// UI healthy, first-boot-present, or within the post-relaunch grace
    /// period — do nothing.
    None,
    /// No UI process found — launch one.
    Relaunch,
    /// UI present but unresponsive — kill it, then relaunch.
    KillAndRelaunch(u32),
}

/// Tracks relaunch history across ticks: the post-relaunch grace period and
/// the restart-storm circuit breaker. Lives for the lifetime of one watchdog
/// loop instance (reset on supervisor restart, which is fine — a restart of
/// the watchdog task itself is already the rarer, logged case).
#[derive(Default)]
pub struct RestartBreaker {
    last_relaunch: Option<Instant>,
    restarts_in_window: Vec<Instant>,
}

impl RestartBreaker {
    fn in_grace_period(&self, now: Instant) -> bool {
        self.last_relaunch.is_some_and(|t| now.saturating_duration_since(t) < RELAUNCH_GRACE)
    }

    /// Record an intended relaunch and report whether it's allowed. Prunes
    /// restarts outside the rolling window before checking the cap, so the
    /// breaker naturally resets once activity quiets down.
    fn allow_relaunch(&mut self, now: Instant) -> bool {
        self.restarts_in_window.retain(|t| now.saturating_duration_since(*t) < RESTART_WINDOW);
        if self.restarts_in_window.len() as u32 >= MAX_RESTARTS_PER_WINDOW {
            return false;
        }
        self.restarts_in_window.push(now);
        self.last_relaunch = Some(now);
        true
    }
}

/// True when the UI has been silent long enough to warrant a check. A UI that
/// has never pinged (first boot) is always investigated.
pub fn should_investigate(last_ping_ms: Option<i64>, now: i64, silence_ms: i64) -> bool {
    match last_ping_ms {
        Some(t) => now - t > silence_ms,
        None => true,
    }
}

/// Decide the watchdog action from liveness + process presence. `ever_pinged`
/// distinguishes first boot (a present UI is healthy, not hung) from a UI that
/// pinged before but has since gone silent (present ⇒ hung). `in_grace_period`
/// suppresses the "present but hung" verdict right after a relaunch, since the
/// fresh process legitimately hasn't had time to ping yet.
pub fn decide(ui_pid: Option<u32>, ever_pinged: bool, in_grace_period: bool) -> Action {
    match ui_pid {
        None => Action::Relaunch,
        Some(_) if in_grace_period => Action::None,
        Some(pid) if ever_pinged => Action::KillAndRelaunch(pid),
        Some(_) => Action::None,
    }
}

/// Run one watchdog step against shared liveness + a supervisor.
pub fn tick(
    station: &StationStore,
    supervisor: &dyn UiSupervisor,
    silence_ms: i64,
    breaker: &mut RestartBreaker,
) {
    let last_ping = station.last_ping_at();
    if !should_investigate(last_ping, now_ms(), silence_ms) {
        return;
    }
    let now = Instant::now();
    let action = decide(supervisor.find_ui(), last_ping.is_some(), breaker.in_grace_period(now));
    match action {
        Action::None => {}
        Action::Relaunch | Action::KillAndRelaunch(_) => {
            if !breaker.allow_relaunch(now) {
                log::error!(
                    "watchdog: restart circuit breaker tripped ({MAX_RESTARTS_PER_WINDOW}+ \
                     relaunches within {RESTART_WINDOW:?}); skipping this tick"
                );
                return;
            }
            if let Action::KillAndRelaunch(pid) = action {
                log::warn!("watchdog: UI {pid} unresponsive; killing and relaunching");
                supervisor.kill(pid);
            } else {
                log::warn!("watchdog: UI not found; relaunching");
            }
            supervisor.relaunch();
        }
    }
}

/// Spawn the watchdog loop, supervised: a panic mid-tick restarts the loop
/// instead of silently ending the watchdog forever.
pub fn spawn(station: Arc<StationStore>, supervisor: Arc<dyn UiSupervisor>) {
    crate::supervise::spawn_supervised("watchdog", move || {
        let station = station.clone();
        let supervisor = supervisor.clone();
        async move {
            log::info!("watchdog loop started");
            let mut breaker = RestartBreaker::default();
            loop {
                tick(&station, supervisor.as_ref(), SILENCE_MS, &mut breaker);
                tokio::time::sleep(TICK).await;
            }
        }
    });
}

/// Production supervisor: matches the UI by process name (`CHRONO_UI_PROCESS`)
/// via `sysinfo` and launches `CHRONO_UI_EXE`. Spawning/killing is gated to
/// Windows so developing the guard on macOS never touches real processes.
pub struct SystemSupervisor {
    process_match: String,
    ui_exe: Option<String>,
}

impl Default for SystemSupervisor {
    fn default() -> Self {
        SystemSupervisor {
            process_match: std::env::var("CHRONO_UI_PROCESS")
                .unwrap_or_else(|_| "chrono pc client".to_string())
                .to_lowercase(),
            ui_exe: std::env::var("CHRONO_UI_EXE").ok(),
        }
    }
}

impl UiSupervisor for SystemSupervisor {
    fn find_ui(&self) -> Option<u32> {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        // Prefer an exact image-path match (case-insensitive — Windows paths
        // aren't case-sensitive) over a bare process-name substring: a user
        // process merely *named* to contain "chrono pc client" must not be
        // able to spoof UI liveness (suppressing a needed relaunch) or become
        // an unintended kill target. Only fall back to the name match when we
        // don't know the expected path (CHRONO_UI_EXE unset).
        if let Some(exe_path) = &self.ui_exe {
            let expected = exe_path.to_lowercase();
            return sys.processes().values().find_map(|p| {
                let actual = p.exe()?.to_string_lossy().to_lowercase();
                (actual == expected).then(|| p.pid().as_u32())
            });
        }
        sys.processes().values().find_map(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            if name.contains(&self.process_match) {
                Some(p.pid().as_u32())
            } else {
                None
            }
        })
    }

    fn relaunch(&self) {
        let Some(exe) = &self.ui_exe else {
            log::warn!("watchdog: CHRONO_UI_EXE not set; cannot relaunch");
            return;
        };
        #[cfg(windows)]
        {
            // The guard runs as LocalSystem in session 0. A plain
            // `Command::spawn` would launch the UI as SYSTEM in session 0 too
            // — invisible on the interactive user's desktop, and a SYSTEM
            // code-execution primitive for anything that can influence
            // CHRONO_UI_EXE. Launch into the active console session instead,
            // under that session's own (de-privileged) user token.
            match crate::session::launch_in_active_session(exe) {
                Ok(pid) => log::info!("watchdog: relaunched UI in active session (pid {pid})"),
                Err(e) => log::error!("watchdog: failed to relaunch UI in active session: {e}"),
            }
        }
        #[cfg(not(windows))]
        {
            log::info!("[dev] watchdog would relaunch UI: {exe}");
        }
    }

    fn kill(&self, pid: u32) {
        #[cfg(windows)]
        {
            use sysinfo::{Pid, System};
            let mut sys = System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            if let Some(proc_) = sys.process(Pid::from_u32(pid)) {
                proc_.kill();
            }
        }
        #[cfg(not(windows))]
        {
            log::info!("[dev] watchdog would kill UI pid {pid}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct SpySupervisor {
        pid: Option<u32>,
        relaunches: AtomicUsize,
        kills: AtomicUsize,
    }
    impl UiSupervisor for SpySupervisor {
        fn find_ui(&self) -> Option<u32> {
            self.pid
        }
        fn relaunch(&self) {
            self.relaunches.fetch_add(1, Ordering::Relaxed);
        }
        fn kill(&self, _pid: u32) {
            self.kills.fetch_add(1, Ordering::Relaxed);
        }
    }

    #[test]
    fn investigates_when_silent_or_never_pinged() {
        assert!(should_investigate(None, 1_000, SILENCE_MS));
        assert!(should_investigate(Some(0), 20_000, SILENCE_MS));
        assert!(!should_investigate(Some(19_000), 20_000, SILENCE_MS));
    }

    #[test]
    fn decide_relaunch_when_absent() {
        assert_eq!(decide(None, true, false), Action::Relaunch);
        assert_eq!(decide(None, false, false), Action::Relaunch);
    }

    #[test]
    fn decide_kill_when_present_but_previously_pinged() {
        assert_eq!(decide(Some(42), true, false), Action::KillAndRelaunch(42));
    }

    #[test]
    fn decide_noop_when_present_on_first_boot() {
        assert_eq!(decide(Some(42), false, false), Action::None);
    }

    #[test]
    fn decide_noop_during_grace_period_even_if_ever_pinged() {
        // A just-relaunched process hasn't pinged yet; ever_pinged is stale
        // from before the restart. The grace period must suppress the
        // otherwise-correct "present but hung" verdict.
        assert_eq!(decide(Some(42), true, true), Action::None);
    }

    #[test]
    fn tick_relaunches_a_missing_ui() {
        let dir = tempfile::tempdir().unwrap();
        // Fresh store ⇒ last_ping None ⇒ investigate; supervisor finds no UI.
        let store = StationStore::load_or_default("seal".into(), dir.path().join("s.json"));
        let sup = SpySupervisor { pid: None, ..Default::default() };
        let mut breaker = RestartBreaker::default();
        tick(&store, &sup, SILENCE_MS, &mut breaker);
        assert_eq!(sup.relaunches.load(Ordering::Relaxed), 1);
        assert_eq!(sup.kills.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn tick_suppresses_kill_during_grace_period_after_relaunch() {
        let dir = tempfile::tempdir().unwrap();
        let store = StationStore::load_or_default("seal".into(), dir.path().join("s.json"));
        store.update(|s| s.last_ping_at = Some(0)); // ever_pinged = true, stale
        let sup = SpySupervisor { pid: Some(42), ..Default::default() };
        let mut breaker = RestartBreaker::default();
        // Prime the breaker as if a relaunch just happened this instant.
        breaker.allow_relaunch(Instant::now());

        tick(&store, &sup, SILENCE_MS, &mut breaker);
        assert_eq!(sup.kills.load(Ordering::Relaxed), 0, "must not kill within the grace period");
        assert_eq!(sup.relaunches.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn tick_breaker_trips_after_max_restarts_in_window() {
        let dir = tempfile::tempdir().unwrap();
        let store = StationStore::load_or_default("seal".into(), dir.path().join("s.json"));
        let sup = SpySupervisor { pid: None, ..Default::default() };
        let mut breaker = RestartBreaker::default();
        for _ in 0..(MAX_RESTARTS_PER_WINDOW + 3) {
            tick(&store, &sup, SILENCE_MS, &mut breaker);
        }
        assert_eq!(
            sup.relaunches.load(Ordering::Relaxed),
            MAX_RESTARTS_PER_WINDOW as usize,
            "relaunches must stop once the breaker trips"
        );
    }
}
