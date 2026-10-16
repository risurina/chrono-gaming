//! Authoritative station-state store: an in-memory `StationState` backed by a
//! tamper-sealed file (via `chrono-control`). Every mutation re-seals to disk,
//! and boot is **fail-closed** — a tampered seal, an unreadable file, or a
//! persisted `UNLOCKED` (diskless clones, crash recovery) all resolve to LOCKED.

use std::path::PathBuf;
use std::sync::Mutex;

use crate::state::{LockState, StationState};

pub struct StationStore {
    inner: Mutex<StationState>,
    seal_key: String,
    path: PathBuf,
}

impl StationStore {
    /// Load sealed state fail-closed, then materialize the (possibly reset)
    /// state back to disk so the on-disk seal always matches memory.
    pub fn load_or_default(seal_key: String, path: PathBuf) -> Self {
        let state = match chrono_control::load_sealed_json(&path, &seal_key) {
            chrono_control::Loaded::Verified(value) => match serde_json::from_value::<StationState>(value)
            {
                Ok(mut s) => {
                    if s.lock_state == LockState::Unlocked {
                        log::warn!("boot: persisted UNLOCKED state → resetting to LOCKED (fail-closed)");
                        s = StationState::default();
                    }
                    s
                }
                Err(e) => {
                    log::warn!("boot: unreadable sealed state ({e}) → LOCKED (fail-closed)");
                    StationState::default()
                }
            },
            chrono_control::Loaded::Tampered => {
                log::warn!("boot: state seal invalid → LOCKED (fail-closed)");
                StationState::default()
            }
            chrono_control::Loaded::Missing => StationState::default(),
        };

        let store = StationStore { inner: Mutex::new(state), seal_key, path };
        let current = store.snapshot();
        store.persist(&current);
        store
    }

    /// Enforcement and the watchdog are now supervised (panic → restart, see
    /// `supervise.rs`), but a panic while holding `self.inner`'s lock still
    /// poisons the `Mutex` itself — restarting the *task* doesn't un-poison
    /// the shared `Arc<StationStore>`, so every subsequent lock would panic
    /// forever without this recovery. The station's own data can't be
    /// memory-unsafe here (no unsafe code touches it), so recovering the
    /// guard and carrying on is strictly better than a permanent panic loop
    /// on the highest-privilege, must-keep-enforcing component.
    fn lock(&self) -> std::sync::MutexGuard<'_, StationState> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn snapshot(&self) -> StationState {
        self.lock().clone()
    }

    pub fn last_ping_at(&self) -> Option<i64> {
        self.lock().last_ping_at
    }

    /// Mutate the state under lock, then persist the sealed result.
    pub fn update<R>(&self, f: impl FnOnce(&mut StationState) -> R) -> R {
        let (result, snapshot) = {
            let mut guard = self.lock();
            let result = f(&mut guard);
            (result, guard.clone())
        };
        self.persist(&snapshot);
        result
    }

    fn persist(&self, state: &StationState) {
        match serde_json::to_value(state) {
            Ok(value) => {
                if let Err(e) = chrono_control::save_sealed_json(&self.path, &self.seal_key, &value) {
                    log::error!("failed to persist sealed station state: {e}");
                }
            }
            Err(e) => log::error!("failed to serialize station state: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("station-state.json");
        (dir, path)
    }

    #[test]
    fn fresh_store_defaults_locked() {
        let (_d, path) = temp_path();
        let store = StationStore::load_or_default("seal".into(), path);
        assert_eq!(store.snapshot().lock_state, LockState::Locked);
    }

    #[test]
    fn persisted_unlocked_resets_to_locked_on_reload() {
        let (_d, path) = temp_path();
        {
            let store = StationStore::load_or_default("seal".into(), path.clone());
            store.update(|s| {
                s.lock_state = LockState::Unlocked;
                s.active_session_id = Some("s1".into());
            });
        }
        // Reload: a sealed-but-UNLOCKED state must not be trusted at boot.
        let reloaded = StationStore::load_or_default("seal".into(), path);
        assert_eq!(reloaded.snapshot().lock_state, LockState::Locked);
    }

    #[test]
    fn tampered_seal_resets_to_locked() {
        let (_d, path) = temp_path();
        {
            let store = StationStore::load_or_default("seal".into(), path.clone());
            store.update(|s| s.pc_id = Some("PC-1".into()));
        }
        // Reload with a different seal key ⇒ seal invalid ⇒ fail closed.
        let reloaded = StationStore::load_or_default("rotated-key".into(), path);
        assert_eq!(reloaded.snapshot().lock_state, LockState::Locked);
        assert_eq!(reloaded.snapshot().pc_id, None);
    }
}
