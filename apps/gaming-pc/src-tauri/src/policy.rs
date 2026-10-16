//! Windows registry kiosk policies, mirroring `features/security/policy-manager.ts`.
//! Uses the `winreg` crate instead of shelling out to `reg`. Policies are applied
//! per-toggle (admin-controlled); nothing is applied by default.
//!
//! The relative HKCU subkeys + value names are the parity surface and are
//! unit-tested via `policies_to_apply` / `policies_to_revert` on all platforms;
//! the actual registry writes are `cfg(windows)`.
//!
//! On non-Windows hosts `apply`/`revert` are no-op stubs, so the pure helpers
//! below are exercised only by tests and the Windows build — allow dead_code
//! there rather than force a fake caller.
#![cfg_attr(not(windows), allow(dead_code))]

#[derive(Debug, Clone, Copy, Default, Hash, Eq, PartialEq)]
pub struct KioskPolicy {
    pub disable_task_manager: bool,
    pub disable_cli: bool,
}

impl KioskPolicy {
    pub fn from_value(v: &serde_json::Value) -> Self {
        KioskPolicy {
            disable_task_manager: v
                .get("disableTaskManager")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
            disable_cli: v.get("disableCli").and_then(|b| b.as_bool()).unwrap_or(false),
        }
    }
}

/// `(relative HKCU subkey, value name)` pairs to set to DWORD 1 for a policy.
pub fn policies_to_apply(policy: &KioskPolicy) -> Vec<(&'static str, &'static str)> {
    let mut out = Vec::new();
    if policy.disable_task_manager {
        out.push((
            r"Software\Microsoft\Windows\CurrentVersion\Policies\System",
            "DisableTaskMgr",
        ));
    }
    if policy.disable_cli {
        // PowerShell intentionally NOT blocked (parity with the TS comment).
        out.push((r"Software\Policies\Microsoft\Windows\System", "DisableCMD"));
    }
    out
}

/// `(relative HKCU subkey, value name)` pairs deleted on revert — a superset of
/// apply so machines upgraded from older builds are cleaned up.
pub fn policies_to_revert() -> Vec<(&'static str, &'static str)> {
    vec![
        (r"Software\Microsoft\Windows\CurrentVersion\Policies\System", "DisableTaskMgr"),
        (r"Software\Policies\Microsoft\Windows\System", "DisableCMD"),
        (r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoRun"),
        (r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoWinKeys"),
        (r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoClose"),
        (r"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoLogoff"),
    ]
}

/// True when policies should be skipped (non-Windows or dev mode). Dev status
/// comes from the machine-only detector (`kiosk_env`), never a user-writable env
/// var — see the hardening-plan #1 Phase 1 note in `kiosk_env.rs`.
pub fn should_skip() -> bool {
    !cfg!(windows) || crate::kiosk_env::is_dev()
}

/// `apply`/`revert` run on every kiosk state broadcast — including from
/// `heartbeat::tick` on the async runtime every 30s — and each call used to
/// shell out to `net localgroup administrators` synchronously, blocking a
/// tokio worker thread on a subprocess every time. Session membership can't
/// change without a fresh logon, so it's safe to compute this once per
/// process and cache it rather than re-shelling on every kiosk update.
#[cfg(windows)]
fn is_administrator() -> bool {
    static CACHED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *CACHED.get_or_init(is_administrator_uncached)
}

#[cfg(windows)]
fn is_administrator_uncached() -> bool {
    use std::process::Command;
    let output = Command::new("net")
        .args(["localgroup", "administrators"])
        .output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_lowercase();
            let user = whoami_lower();
            !user.is_empty() && stdout.contains(&user)
        }
        Err(_) => false,
    }
}

#[cfg(windows)]
fn whoami_lower() -> String {
    std::env::var("USERNAME").unwrap_or_default().to_lowercase()
}

/// Apply kiosk policies. No-op off Windows / in dev / for admin users / when the
/// current user does not match `CHRONO_KIOSK_USER`.
#[cfg(windows)]
pub fn apply(policy: &KioskPolicy) {
    if should_skip() {
        return;
    }
    if is_administrator() {
        log::warn!("PolicyManager: refusing to apply on an Administrator account");
        return;
    }
    if let Ok(target) = std::env::var("CHRONO_KIOSK_USER") {
        if !target.is_empty() && whoami_lower() != target.to_lowercase() {
            log::warn!("PolicyManager: current user does not match CHRONO_KIOSK_USER");
            return;
        }
    }
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for (subkey, value) in policies_to_apply(policy) {
        match hkcu.create_subkey_with_flags(subkey, KEY_WRITE) {
            Ok((key, _)) => {
                if let Err(e) = key.set_value(value, &1u32) {
                    log::error!("PolicyManager: failed to set {subkey}\\{value}: {e}");
                }
            }
            Err(e) => log::error!("PolicyManager: failed to open {subkey}: {e}"),
        }
    }
}

#[cfg(not(windows))]
pub fn apply(_policy: &KioskPolicy) {
    // No-op on non-Windows (dev hosts).
}

/// Revert kiosk policies (delete the value names).
#[cfg(windows)]
pub fn revert(allow_admin: bool) {
    if should_skip() {
        return;
    }
    if is_administrator() && !allow_admin {
        return;
    }
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for (subkey, value) in policies_to_revert() {
        if let Ok(key) = hkcu.open_subkey_with_flags(subkey, KEY_WRITE) {
            // Ignore "not found" — the value may never have been set.
            let _ = key.delete_value(value);
        }
    }
}

#[cfg(not(windows))]
pub fn revert(_allow_admin: bool) {}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn nothing_applied_by_default() {
        assert!(policies_to_apply(&KioskPolicy::default()).is_empty());
    }

    #[test]
    fn task_manager_toggle_maps_to_correct_key() {
        let p = KioskPolicy { disable_task_manager: true, disable_cli: false };
        assert_eq!(
            policies_to_apply(&p),
            vec![(
                r"Software\Microsoft\Windows\CurrentVersion\Policies\System",
                "DisableTaskMgr"
            )]
        );
    }

    #[test]
    fn cli_toggle_maps_to_disablecmd() {
        let p = KioskPolicy { disable_task_manager: false, disable_cli: true };
        assert_eq!(
            policies_to_apply(&p),
            vec![(r"Software\Policies\Microsoft\Windows\System", "DisableCMD")]
        );
    }

    #[test]
    fn from_value_parses_flags() {
        let p = KioskPolicy::from_value(&json!({ "disableTaskManager": true }));
        assert!(p.disable_task_manager);
        assert!(!p.disable_cli);
    }

    #[test]
    fn revert_superset_covers_legacy_keys() {
        let names: Vec<&str> = policies_to_revert().iter().map(|(_, v)| *v).collect();
        for legacy in ["NoRun", "NoWinKeys", "NoClose", "NoLogoff"] {
            assert!(names.contains(&legacy), "revert must clean up {legacy}");
        }
    }
}
