//! Kiosk window state machine, mirroring `updateKioskState` in `main.ts`.
//! Drives the main (lockscreen) window + widget window + tray + registry
//! policies + shortcut trapping from the resolved `lastKnownStatus`.
//!
//! Window/tray/shortcut behavior is best verified on Windows; this compiles and
//! runs on macOS for the fullscreen/always-on-top/show-hide transitions.

use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::commands::state::STATE_UPDATED_EVENT;
use crate::policy::{self, KioskPolicy};

/// Push a new local-client-state everywhere it must go: the webview event
/// (so the React runtime re-renders) AND the kiosk window/tray/policy machine.
/// Mirrors the Electron handlers' `broadcastStateRef` + `updateKioskStateRef`
/// pair, called directly at each state change (Rust event loopback is not relied
/// upon).
pub fn broadcast_state(app: &AppHandle, state: &Value) {
    let _ = app.emit(STATE_UPDATED_EVENT, state.clone());
    update_kiosk_state(app, state);
}

/// Tracks the last applied (status, kioskPolicy) so we no-op on true repeats
/// (parity with `lastStatus`) — but a policy change (e.g. the server toggling
/// `disableTaskManager`) must still re-apply even when the status label
/// itself hasn't changed, so the dedupe key includes a hash of the policy.
pub struct KioskState {
    last_applied: Mutex<Option<(String, u64)>>,
}

impl Default for KioskState {
    fn default() -> Self {
        KioskState { last_applied: Mutex::new(None) }
    }
}

/// Cheap structural hash of the raw `kioskPolicy` value (order-independent
/// would be nicer, but `KioskPolicy::from_value` already normalizes to a
/// fixed field set before `policy::apply` sees it, so hashing the parsed
/// struct — not the raw JSON — gives a stable, semantically-meaningful key).
fn kiosk_policy_hash(kp: &KioskPolicy) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    kp.hash(&mut hasher);
    hasher.finish()
}

fn is_dev() -> bool {
    cfg!(debug_assertions) || std::env::var("NODE_ENV").as_deref() == Ok("development")
}

/// `KIOSK_LOCKDOWN_ENABLED`: prod defaults ON (opt out with `=false`),
/// dev defaults OFF (opt in with `=true`).
fn lockdown_enabled() -> bool {
    let v = std::env::var("KIOSK_LOCKDOWN_ENABLED").ok();
    if is_dev() {
        v.as_deref() == Some("true")
    } else {
        v.as_deref() != Some("false")
    }
}

/// Build the hidden `widget` webview if it does not already exist. Called both
/// at boot (to pre-warm the webview so the active-session shell shows instantly)
/// and lazily from the ACTIVE/LOW_TIME arm as a fallback.
pub fn ensure_widget_window(app: &AppHandle) {
    if app.get_webview_window("widget").is_some() {
        return;
    }
    // The active-session shell now maximizes to fill the screen (see the
    // ACTIVE/LOW_TIME arm), so the startup `inner_size` is just a sane fallback.
    // `min_inner_size` guards the left game-menu region + right timer rail split
    // from ever rendering below its usable width. The dark `background_color`
    // matches the app background (#070706) so the webview never flashes white
    // before React paints.
    let _ = WebviewWindowBuilder::new(
        app,
        "widget",
        WebviewUrl::App("index.html?windowMode=widget".into()),
    )
    .title("Chrono")
    .inner_size(1200.0, 800.0)
    .min_inner_size(1024.0, 600.0)
    .decorations(false)
    .always_on_top(false)
    .background_color(tauri::window::Color(7, 7, 6, 255))
    .visible(false)
    .build();
}

/// Apply the window/tray/policy transition for a state value.
pub fn update_kiosk_state(app: &AppHandle, state: &Value) {
    let status = state
        .get("lastKnownStatus")
        .and_then(|v| v.as_str())
        .unwrap_or("LOADING")
        .to_string();
    let kp = state
        .get("kioskPolicy")
        .map(KioskPolicy::from_value)
        .unwrap_or_default();

    // Dedupe on repeated (status, kioskPolicy) — a status-only key would miss
    // a policy change (e.g. the server toggling `disableTaskManager`) that
    // arrives without the status label itself changing, silently leaving the
    // old policy in place until an unrelated transition happens to occur.
    {
        let kiosk = app.state::<KioskState>();
        let mut last = kiosk.last_applied.lock().unwrap();
        let key = (status.clone(), kiosk_policy_hash(&kp));
        if last.as_ref() == Some(&key) {
            return;
        }
        *last = Some(key);
    }

    let Some(main) = app.get_webview_window("main") else {
        return;
    };

    match status.as_str() {
        // 1. Active session → full-screen non-blocking shell, release the
        // lockscreen. The widget is maximized (borderless "max screen", NOT
        // exclusive fullscreen) and deliberately NOT always-on-top, so a launched
        // game or the desktop can take the foreground — the customer alt-tabs back
        // to Chrono to see the timer rail / game menu.
        "ACTIVE" | "LOW_TIME" => {
            ensure_widget_window(app);
            crate::tray::ensure_tray(app);
            policy::revert(false);
            if let Some(widget) = app.get_webview_window("widget") {
                let _ = widget.set_always_on_top(false);
                let _ = widget.set_decorations(false);
                let _ = widget.maximize();
                let _ = widget.show();
            }
            let _ = main.set_fullscreen(false);
            let _ = main.set_always_on_top(false);
            crate::shortcuts::set_trapping(app, false);
            let _ = main.hide();
        }
        // 2. Setup / diagnostics → normal centered window. Deliberately does
        // NOT include "LOADING": that status means "we don't know the real
        // state yet" (the boot default before the trusted core has heard
        // from the server), and nothing legitimate requires an escapable
        // window during it — unlike UNPAIRED (technician enters a pairing
        // code) or DIAGNOSTICS (operator-facing screen), which do need to
        // stay interactive/non-fullscreen. Falling through to the lockdown
        // arm below closes the previously-escapable boot window.
        "UNPAIRED" | "DIAGNOSTICS" => {
            crate::tray::destroy_tray(app);
            if let Some(widget) = app.get_webview_window("widget") {
                let _ = widget.hide();
            }
            let _ = main.set_fullscreen(false);
            let _ = main.set_always_on_top(false);
            crate::shortcuts::set_trapping(app, false);
            let _ = main.set_min_size(Some(tauri::LogicalSize::new(1024.0, 768.0)));
            let _ = main.set_size(tauri::LogicalSize::new(1200.0, 800.0));
            let _ = main.center();
            let _ = main.show();
            policy::revert(false);
        }
        // 3. Lockdown / warning / blocked → fullscreen kiosk.
        _ => {
            crate::tray::destroy_tray(app);
            if let Some(widget) = app.get_webview_window("widget") {
                let _ = widget.hide();
            }
            let _ = main.show();
            let _ = main.set_fullscreen(true);
            if !is_dev() && lockdown_enabled() {
                let _ = main.set_always_on_top(true);
                crate::shortcuts::set_trapping(app, true);
                policy::apply(&kp);
            } else {
                let _ = main.set_always_on_top(false);
            }
        }
    }
}
