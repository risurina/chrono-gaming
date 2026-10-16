//! State & device-identity commands, mirroring the `ipcMain.handle` handlers in
//! `main.ts` (`get-device-fingerprint`, `get-device-info`, `*-device-token`,
//! `*-local-client-state`).

use serde_json::Value;
use tauri::{AppHandle, State};

use crate::app_state::AppState;
use crate::identity;

/// Event emitted to all windows when local client state changes
/// (parity with `broadcastStateRef` in the Electron main process).
pub const STATE_UPDATED_EVENT: &str = "local-client-state:updated";

#[tauri::command]
pub fn get_device_fingerprint(state: State<AppState>) -> String {
    state.fingerprint.clone()
}

#[tauri::command]
pub fn get_device_info() -> identity::DeviceInfo {
    identity::get_device_info()
}

// `get_device_token` is renderer-facing on purpose: the pairing/auth handshake
// (`pair_device` → `auth_device`) genuinely needs the renderer to hold the
// credential briefly to submit it as `tokenHash`. `save_device_token`,
// `clear_device_token`, and `clear_local_client_state` used to be exposed here
// too, but nothing in the frontend calls them (`pair_device`/`auth_device`
// already manage `device_token` server-side via `state.store` directly) — pure
// unused attack surface letting a compromised renderer overwrite/erase the
// device credential or wipe local client state. Removed from the invoke
// handler entirely.
#[tauri::command]
pub fn get_device_token(state: State<AppState>) -> Option<String> {
    state.store.get_string("device_token")
}

#[tauri::command]
pub fn get_local_client_state(state: State<AppState>) -> Option<Value> {
    state.store.get("local_client_state")
}

/// Fields the renderer is NOT allowed to write directly — these are owned by the
/// trusted core (auth/session/kiosk lifecycle). Parity with the Electron
/// `restrictedFields` guard in `save/patch-local-client-state`.
const RESTRICTED_FIELDS: [&str; 7] = [
    "lockState",
    "activeSessionId",
    "scheduledEndAt",
    "deviceId",
    "tenantId",
    "pcId",
    "isMaintenance",
];

#[tauri::command]
pub fn save_local_client_state(app: AppHandle, state: State<AppState>, new_state: Value) {
    // Preserve restricted fields from the current state; the renderer cannot
    // overwrite them (e.g. cannot self-unlock by writing lockState).
    let current = state.store.get("local_client_state").unwrap_or(Value::Null);
    let mut incoming = new_state.as_object().cloned().unwrap_or_default();
    if let Some(cur) = current.as_object() {
        for f in RESTRICTED_FIELDS {
            match cur.get(f) {
                Some(v) => {
                    incoming.insert(f.to_string(), v.clone());
                }
                None => {
                    incoming.remove(f);
                }
            }
        }
    }
    let guarded = Value::Object(incoming);
    state.store.set("local_client_state", guarded.clone());
    // Electron only updates kiosk/window state here (the renderer owns the value
    // it just wrote) — do NOT echo a state-updated event back to the renderer.
    crate::kiosk::update_kiosk_state(&app, &guarded);
}

#[tauri::command]
pub fn patch_local_client_state(
    app: AppHandle,
    state: State<AppState>,
    partial_state: Value,
) -> Value {
    // Strip restricted fields from the incoming patch before merging.
    let mut patch = partial_state.as_object().cloned().unwrap_or_default();
    for f in RESTRICTED_FIELDS {
        patch.remove(f);
    }
    let merged = state.store.patch_local_client_state(&Value::Object(patch));
    crate::kiosk::update_kiosk_state(&app, &merged);
    merged
}
