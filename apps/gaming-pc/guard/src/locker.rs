//! The workstation-lock seam. Enforcement depends only on the `Locker` trait so
//! the fail-closed transition logic is unit-testable off-Windows (with a spy),
//! while production uses the native `LockWorkStation` API.

/// Something that can lock the physical workstation.
pub trait Locker: Send + Sync {
    fn lock(&self);
}

/// Production locker: native Windows `LockWorkStation`. On non-Windows (dev on
/// macOS/Linux) it logs instead of performing an OS action, so `chrono-guard`
/// runs for development without locking the developer's screen.
pub struct WorkstationLocker;

impl Locker for WorkstationLocker {
    #[cfg(windows)]
    fn lock(&self) {
        use windows::Win32::System::Shutdown::LockWorkStation;
        // SAFETY: LockWorkStation takes no arguments and only signals the
        // session to lock; it has no memory-safety preconditions.
        unsafe {
            if let Err(e) = LockWorkStation() {
                log::error!("LockWorkStation failed: {e}");
            }
        }
    }

    #[cfg(not(windows))]
    fn lock(&self) {
        log::info!("[dev] workstation lock requested (no-op off Windows)");
    }
}

#[cfg(test)]
pub mod test_support {
    use super::Locker;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Counts lock invocations for assertions.
    #[derive(Default)]
    pub struct SpyLocker {
        pub calls: AtomicUsize,
    }

    impl Locker for SpyLocker {
        fn lock(&self) {
            self.calls.fetch_add(1, Ordering::Relaxed);
        }
    }

    impl SpyLocker {
        pub fn count(&self) -> usize {
            self.calls.load(Ordering::Relaxed)
        }
    }
}
