mod app_state;
mod audit;
mod command_auth;
mod commands;
mod executor;
mod guard_ping;
mod heartbeat;
mod http;
mod identity;
mod kiosk;
mod kiosk_env;
mod policy;
mod process_monitor;
mod realtime;
mod recovery;
mod secure;
mod service_client;
mod session_state;
mod shortcuts;
mod store;
mod telemetry;
mod tray;
mod updater;

use app_state::AppState;
use kiosk::KioskState;
use tauri::Manager;

/// Phase 1 smoke command: proves the webview ↔ Rust bridge works.
#[tauri::command]
fn shell_info() -> String {
    format!(
        "tauri {} / {} {}",
        tauri::VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

pub fn run() {
    // Load environment (VITE_API_BASE_URL, CHRONO_* toggles, etc.) so the Rust
    // core resolves the same API base URL as the Electron client did via dotenv.
    // In dev the process runs from `src-tauri`, so the app `.env` is one level up.
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::dotenv();

    // Initialize Rust-core Sentry as early as possible. The guard is held for
    // the whole of `run()` (which blocks in `.run()`), so panics and reported
    // errors are captured and flushed until the app exits. No-op without a DSN.
    let _sentry_guard = telemetry::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Kiosk shell must stay a single instance; focus the existing window.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                // Emit to the terminal AND the webview devtools console so API
                // request/response logs are visible wherever you're looking.
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    // Recovery chord opens the operator PIN window; everything
                    // else in the trap set is intercepted (the goal is blocking).
                    if let Ok(recovery) = shortcuts::RECOVERY_SHORTCUT.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                        if shortcut == &recovery {
                            recovery::open_recovery_window(app);
                            return;
                        }
                    }
                    log::warn!("[Security] Blocked restricted keyboard shortcut");
                })
                .build(),
        )
        .manage(KioskState::default())
        .manage(realtime::RealtimeState::default())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            std::fs::create_dir_all(&app_data_dir).ok();
            app.manage(AppState::new(app_data_dir));

            // Auto-provision cloned/diskless images: if unpaired but a seeded
            // provision token is present, adopt it as the device token.
            {
                let state = app.state::<AppState>();
                if state.store.get_string("device_token").is_none() {
                    if let Some(seed) = store::resolve_seeded_provision_token(&state.app_data_dir) {
                        log::info!("[Provisioning] Adopting seeded provision token");
                        state.store.set("device_token", serde_json::Value::String(seed));
                    }
                }
            }

            let handle = app.handle().clone();
            shortcuts::init_recovery(&handle);

            // The kiosk window/tray/policy machine is driven directly by each
            // state-changing command via kiosk::broadcast_state (matching the
            // Electron handlers' direct updateKioskState calls). Apply the
            // initial kiosk state from persisted local client state here.
            let initial = app
                .state::<AppState>()
                .store
                .get("local_client_state")
                .unwrap_or(serde_json::Value::Null);
            kiosk::update_kiosk_state(&handle, &initial);

            // Pre-warm the hidden `widget` webview at boot so its React bundle /
            // runtime finish loading while the station sits on the lockscreen.
            // Without this the widget cold-boots the first time a session goes
            // ACTIVE — a ~10s full-screen white flash while the webview loads.
            kiosk::ensure_widget_window(&handle);

            // Background daemons (parity with the Electron main-process managers):
            // the 30s heartbeat drives session recovery / auto-lock / command
            // delivery; the proactive token refresh renews the access token
            // before its ~8h expiry (401s are also recovered reactively in http).
            heartbeat::start(handle.clone());
            // 5s signed liveness ping feeding the guard's StationStore
            // (lockState / activeSessionId / scheduledEndAt / pcId).
            guard_ping::start(handle.clone());
            updater::spawn(handle.clone());
            let refresh_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(7 * 60 * 60)).await;
                    if !refresh_handle.state::<AppState>().http.refresh_access_token().await {
                        log::warn!("[TokenRefresh] proactive access-token refresh failed");
                        telemetry::capture_error_message(
                            "Proactive access-token refresh failed",
                        );
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shell_info,
            commands::state::get_device_fingerprint,
            commands::state::get_device_info,
            commands::state::get_device_token,
            commands::state::get_local_client_state,
            commands::state::save_local_client_state,
            commands::state::patch_local_client_state,
            commands::api::pair_device,
            commands::api::auth_device,
            commands::api::refresh_access_token,
            commands::api::get_device_status,
            commands::api::send_heartbeat,
            commands::api::generate_qr_token,
            commands::api::fetch_pending_commands,
            commands::api::ack_command,
            commands::api::report_security_alert,
            commands::api::user_login,
            commands::api::start_session,
            commands::api::end_session,
            commands::api::lock_session,
            commands::api::unlock_session,
            commands::api::extend_grace,
            commands::api::leave_grace,
            commands::renderer::execute_allowed_command,
            commands::renderer::restart_client_ui,
            commands::renderer::get_games,
            commands::renderer::launch_game,
            commands::renderer::realtime_initialize,
            commands::renderer::realtime_ack_command,
            recovery::submit_recovery_pin,
            commands::system::process_device_command,
            commands::system::get_audit_logs,
            commands::system::check_service_health,
            commands::system::snapshot_processes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running chrono pc client");
}
