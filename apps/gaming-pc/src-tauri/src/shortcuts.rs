//! Global-shortcut escape-key trapping, mirroring `manageKioskShortcuts`.
//! Registers common kiosk-escape accelerators so the OS/other apps don't act on
//! them while locked; also binds the operator recovery chord. Only active in a
//! production lockdown build.

use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Escape shortcuts trapped while the station is locked (parity with the TS list;
/// `Super` → `Meta` in the Tauri accelerator grammar).
const TRAPPED: [&str; 9] = [
    "Alt+Tab",
    "Alt+F4",
    "CmdOrCtrl+Escape",
    "Alt+Escape",
    "Meta+D",
    "Meta+E",
    "Meta+R",
    "Alt+Space",
    "Ctrl+Shift+Escape",
];

/// The operator recovery chord (always registered in production lockdown).
pub const RECOVERY_SHORTCUT: &str = "CmdOrCtrl+Alt+Shift+U";

/// Register/unregister the escape-shortcut traps. No-op in dev (keeps the box
/// escapable) — the recovery chord is bound once at startup by `init_recovery`.
/// Dev status comes from the machine-only detector (`kiosk_env`), never a
/// user-writable env var — see the hardening-plan #1 Phase 1 note.
pub fn set_trapping(app: &AppHandle, enable: bool) {
    if crate::kiosk_env::is_dev() {
        return;
    }
    let gs = app.global_shortcut();
    for s in TRAPPED {
        if enable {
            // Handler is registered globally in init_recovery; register just traps.
            let _ = gs.register(s);
        } else {
            let _ = gs.unregister(s);
        }
    }
}

/// Bind the recovery chord + install the shared handler. Call once at setup.
pub fn init_recovery(app: &AppHandle) {
    if crate::kiosk_env::is_dev() {
        return;
    }
    let gs = app.global_shortcut();
    let _ = gs.register(RECOVERY_SHORTCUT);
}
