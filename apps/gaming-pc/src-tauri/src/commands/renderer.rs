//! Commands invoked directly by the renderer bridge that aren't part of the
//! device HTTP API: renderer-originated allowed commands, UI restart, the game
//! launcher, and realtime lifecycle (see `realtime.rs` for the connection).

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;
use crate::command_auth::validate_command;
use crate::executor;
use crate::realtime::{self, RealtimeState};

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// Execute a renderer-originated command. Validates against the renderer
/// allowlist, applies any state transition, and dispatches OS actions.
#[tauri::command]
pub fn execute_allowed_command(
    app: AppHandle,
    state: State<AppState>,
    command: Value,
) -> Value {
    if let Err(e) = validate_command(&command, "renderer") {
        return json!({ "success": false, "error": e });
    }
    let ctype = command.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let payload = command.get("payloadJson").cloned().unwrap_or(json!({}));

    // Apply state transition (LOCK etc.) if the command has one.
    if let Some(patch) = executor::state_update_for(ctype, &payload, &now_iso()) {
        let merged = state.store.patch_local_client_state(&patch);
        crate::kiosk::broadcast_state(&app, &merged);
    }

    // Dispatch any OS-level action.
    match executor::run_os_action(ctype, &payload) {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

/// Reload the main webview (parity with the Electron `restart-client-ui`).
#[tauri::command]
pub fn restart_client_ui(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.location.reload()");
    }
}

/// Game launcher — reads `games.json` from the bundled resource dir, returning
/// only games whose executable exists (parity with `loadGamesConfig` + GET_GAMES).
#[tauri::command]
pub fn get_games(app: AppHandle) -> Value {
    let path = app
        .path()
        .resource_dir()
        .map(|d| d.join("games.json"))
        .ok();
    let Some(path) = path else {
        return json!([]);
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return json!([]);
    };
    let games: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
    let available: Vec<Value> = games
        .into_iter()
        .filter(|g| {
            g.get("exePath")
                .and_then(|p| p.as_str())
                .map(|p| std::path::Path::new(p).exists())
                .unwrap_or(false)
        })
        .collect();
    json!(available)
}

#[tauri::command]
pub fn launch_game(app: AppHandle, id: String) -> Value {
    let games = get_games(app);
    let Some(game) = games
        .as_array()
        .and_then(|arr| arr.iter().find(|g| g.get("id").and_then(|i| i.as_str()) == Some(&id)))
    else {
        return json!({ "success": false, "error": format!("Game \"{id}\" not found in config") });
    };
    let exe = game.get("exePath").and_then(|p| p.as_str()).unwrap_or("");
    let args: Vec<String> = game
        .get("args")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    match std::process::Command::new(exe).args(&args).spawn() {
        Ok(_) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": format!("Failed to launch: {e}") }),
    }
}

// --- Realtime lifecycle ---
// The Rust core owns the Socket.IO connection (see `realtime.rs`); the
// renderer only triggers init and gets events forwarded back via
// `realtime:command` / `realtime:status-change`.

#[tauri::command]
pub async fn realtime_initialize(app: AppHandle, config: Value) -> Value {
    match realtime::initialize(app, config).await {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub async fn realtime_ack_command(
    realtime_state: State<'_, RealtimeState>,
    payload: Value,
) -> Result<Value, ()> {
    let success = realtime::ack_command(realtime_state.inner(), payload).await;
    Ok(json!({ "success": success }))
}
