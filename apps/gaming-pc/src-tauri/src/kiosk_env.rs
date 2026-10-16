//! Machine-level dev / lockdown detection.
//!
//! SECURITY (hardening plan #1, Phase 1): dev and lockdown status MUST NOT be
//! read from the **process environment** (`NODE_ENV` / `KIOSK_LOCKDOWN_ENABLED`).
//! The guard's watchdog relaunches the UI with the kiosk user's own profile
//! environment block (`guard/src/session.rs`), so a non-admin customer who sets
//! `HKCU\Environment\NODE_ENV=development` (or `KIOSK_LOCKDOWN_ENABLED=false`)
//! would otherwise disable the entire UI-side lockdown on the next relaunch.
//!
//! Instead, dev mode is decided from a **compile-time** flag OR the machine-only
//! `CHRONO_ENV` value read **directly from `HKLM`** (world-readable, but only an
//! administrator can write it) — never the inherited process env. There is no
//! runtime opt-out of lockdown in a release build.

/// Read `CHRONO_ENV` from the HKLM machine-environment key directly (NOT the
/// process env, which inherits user `HKCU` overrides).
#[cfg(windows)]
fn machine_chrono_env_is_dev() -> bool {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;
    RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            KEY_READ,
        )
        .and_then(|k| k.get_value::<String, _>("CHRONO_ENV"))
        .map(|v| v.trim().eq_ignore_ascii_case("development"))
        .unwrap_or(false)
}

/// Non-Windows dev hosts have no HKLM; fall back to the process env so a
/// developer can still run in dev mode. This branch never ships to a kiosk.
#[cfg(not(windows))]
fn machine_chrono_env_is_dev() -> bool {
    std::env::var("CHRONO_ENV").as_deref() == Ok("development")
}

/// True in a debug build, or when an administrator has set the machine
/// `CHRONO_ENV=development`. Never influenced by a user-writable env var.
pub fn is_dev() -> bool {
    cfg!(debug_assertions) || machine_chrono_env_is_dev()
}

/// Whether kiosk lockdown (always-on-top + shortcut trapping + registry
/// policies) is active. ON by default in every release Windows build; OFF only
/// in dev. There is deliberately NO process-env opt-out — that was the
/// customer-exploitable bypass this module exists to remove.
pub fn lockdown_active() -> bool {
    cfg!(windows) && !is_dev()
}
