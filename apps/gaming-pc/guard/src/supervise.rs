//! Panic-supervised background loops.
//!
//! Both `enforcement::spawn` and `watchdog::spawn` used a bare `tokio::spawn`
//! with the `JoinHandle` dropped. A single panic in either loop (e.g. a
//! poisoned mutex from an earlier panic) silently ends that task forever —
//! for `chrono-guard`, the highest-privilege, "must survive everything else
//! failing" component, a dead enforcement task means the station stays
//! unlocked past session expiry with nothing enforcing it and nothing
//! reporting the failure. `spawn_supervised` restarts the task on panic
//! instead of letting it die.

use std::future::Future;
use std::time::Duration;

/// Backoff between a panic and the next restart attempt.
const RESTART_BACKOFF: Duration = Duration::from_secs(1);

/// Spawn `make_task()`, and if the resulting task panics, log it and spawn a
/// fresh one after a short backoff. `make_task` is called again on every
/// restart, so it must be cheap and side-effect-free itself (the real work
/// belongs in the returned future, typically an infinite tick loop) — a clean
/// (non-panicking) return from that future is treated as an intentional stop
/// and is not restarted.
pub fn spawn_supervised<F, Fut>(name: &'static str, mut make_task: F)
where
    F: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tokio::spawn(async move {
        loop {
            let handle = tokio::spawn(make_task());
            match handle.await {
                Ok(()) => {
                    log::warn!("supervised task '{name}' returned; not restarting");
                    break;
                }
                Err(e) => {
                    log::error!("supervised task '{name}' panicked ({e}); restarting in {RESTART_BACKOFF:?}");
                    tokio::time::sleep(RESTART_BACKOFF).await;
                }
            }
        }
    });
}
