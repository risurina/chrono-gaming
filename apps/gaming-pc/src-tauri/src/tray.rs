//! System tray, mirroring `createTray`/`destroyTray` in `main.ts`.
//! Menu: Show Control Panel (reveal widget) + End Session. Present only during
//! an active session; removed while locked/idle.

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

const TRAY_ID: &str = "chrono-tray";

/// Event the frontend listens for to run the end-session flow with its context.
pub const TRAY_END_SESSION_EVENT: &str = "tray:end-session";

pub fn ensure_tray(app: &AppHandle) {
    if app.tray_by_id(TRAY_ID).is_some() {
        return;
    }
    let show_item = MenuItemBuilder::with_id("show_control_panel", "Show Control Panel")
        .build(app)
        .ok();
    let end_item = MenuItemBuilder::with_id("end_session", "End Session")
        .build(app)
        .ok();
    let (Some(show_item), Some(end_item)) = (show_item, end_item) else {
        return;
    };
    let Ok(menu) = MenuBuilder::new(app)
        .item(&show_item)
        .separator()
        .item(&end_item)
        .build()
    else {
        return;
    };

    let _ = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("CHRONO by IZUR")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_control_panel" => {
                if let Some(widget) = app.get_webview_window("widget") {
                    let _ = widget.show();
                    let _ = widget.set_focus();
                }
            }
            "end_session" => {
                // The renderer owns the device token + session id, so it runs the
                // end-session command; we just signal intent.
                let _ = app.emit(TRAY_END_SESSION_EVENT, ());
            }
            _ => {}
        })
        .build(app);
}

pub fn destroy_tray(app: &AppHandle) {
    let _ = app.remove_tray_by_id(TRAY_ID);
}
