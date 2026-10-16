//! Device API commands, mirroring the `ipcMain.handle(IPC_CHANNELS.*)` handlers
//! in `main.ts`. Endpoint paths, headers, and post-response state merges match
//! the Electron implementation.
//!
//! NOTE (deferred to Phase 8 live-API verification): the centralized 401
//! auto-refresh from `main-process-http.ts` is represented by the explicit
//! `refresh_access_token` command; per-request transparent retry is a follow-up.

use reqwest::Method;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::app_state::AppState;
use crate::http::ApiResult;
use crate::session_state;

fn now_iso() -> String {
    // Client-side default for `startedAt` when the server omits it.
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn device_token(state: &AppState) -> Option<String> {
    state.store.get_string("device_token")
}

fn emit_state(app: &AppHandle, state: &AppState, new_state: Value) {
    state.store.set("local_client_state", new_state.clone());
    crate::kiosk::broadcast_state(app, &new_state);
}

#[tauri::command]
pub async fn pair_device(state: State<'_, AppState>, payload: Value) -> Result<ApiResult, ()> {
    let res = state
        .http
        .request(Method::POST, "/pair", Some(&payload), &[])
        .await;
    if res.success {
        if let Some(token) = res
            .data
            .as_ref()
            .and_then(|d| d.get("tokenHash"))
            .and_then(|t| t.as_str())
        {
            state.store.set("device_token", json!(token));
            crate::store::write_provision_token_seed(&state.app_data_dir, token);
        }
    }
    Ok(res)
}

#[tauri::command]
pub async fn auth_device(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: Value,
) -> Result<ApiResult, ()> {
    let mut res = state
        .http
        .request(Method::POST, "/auth", Some(&payload), &[])
        .await;
    if res.success {
        if let Some(data) = &res.data {
            if let Some(tok) = data.get("accessToken").and_then(|t| t.as_str()) {
                state.http.set_access_token(Some(tok.to_string()));
            }
            let current = state.store.get("local_client_state").unwrap_or(json!({}));
            let merged =
                session_state::merge_auth_state(&current, data, &state.fingerprint, &now_iso());
            emit_state(&app, &state, merged);
        }
        // The bearer credential stays in the trusted Rust core (`http.rs`);
        // never hand it to the webview — a compromised renderer must not be
        // able to lift the device access token.
        if let Some(obj) = res.data.as_mut().and_then(|d| d.as_object_mut()) {
            obj.remove("accessToken");
            obj.remove("accessTokenExpiresIn");
        }
    } else {
        // Auth failure resets to unpaired (parity with resetToUnpairedState).
        state.http.set_access_token(None);
        state.store.delete("device_token");
        let reset = session_state::unpaired_state(&state.fingerprint);
        emit_state(&app, &state, reset);
    }
    Ok(res)
}

#[tauri::command]
pub async fn refresh_access_token(state: State<'_, AppState>) -> Result<bool, ()> {
    Ok(state.http.refresh_access_token().await)
}

#[tauri::command]
pub async fn get_device_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ApiResult, ()> {
    // Read the credential from the trusted core store rather than trusting a
    // renderer-supplied token — a compromised webview must not be able to
    // substitute an arbitrary device credential into an authenticated request.
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let res = state.http.get_status("/status", &headers).await;
    if res.success {
        if let Some(data) = &res.data {
            let current = state.store.get("local_client_state").unwrap_or(json!({}));
            let merged =
                session_state::merge_status_state(&current, data, &state.fingerprint, &now_iso());
            emit_state(&app, &state, merged);
        }
    } else if res.error.as_deref() == Some(crate::http::DEVICE_REVOKED) {
        // The server rejected the device credential (revoked/disabled). Reset to
        // unpaired promptly rather than riding out the token — same reset the
        // auth_device failure path performs.
        state.http.set_access_token(None);
        state.store.delete("device_token");
        let reset = session_state::unpaired_state(&state.fingerprint);
        emit_state(&app, &state, reset);
    }
    Ok(res)
}

#[tauri::command]
pub async fn send_heartbeat(
    state: State<'_, AppState>,
    payload: Value,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    Ok(state
        .http
        .request(Method::POST, "/heartbeat", Some(&payload), &headers)
        .await)
}

#[tauri::command]
pub async fn generate_qr_token(
    state: State<'_, AppState>,
    fingerprint: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let body = json!({ "fingerprint": fingerprint });
    Ok(state
        .http
        .request(Method::POST, "/qr/generate", Some(&body), &headers)
        .await)
}

#[tauri::command]
pub async fn fetch_pending_commands(state: State<'_, AppState>) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    Ok(state.http.get_status("/commands/pending", &headers).await)
}

#[tauri::command]
pub async fn ack_command(
    state: State<'_, AppState>,
    command_id: String,
    result: Value,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/commands/{command_id}/ack");
    Ok(state
        .http
        .request(Method::POST, &path, Some(&result), &headers)
        .await)
}

#[tauri::command]
pub async fn report_security_alert(
    state: State<'_, AppState>,
    payload: Value,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    Ok(state
        .http
        .request(Method::POST, "/alerts/report", Some(&payload), &headers)
        .await)
}

#[tauri::command]
pub async fn user_login(state: State<'_, AppState>, payload: Value) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    Ok(state
        .http
        .request(Method::POST, "/auth/sign-in/email", Some(&payload), &headers)
        .await)
}

#[tauri::command]
pub async fn start_session(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: Value,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let res = state
        .http
        .request(Method::POST, "/sessions", Some(&payload), &headers)
        .await;

    // On success, auto-UNLOCK to ACTIVE (parity with the Electron START_SESSION
    // handler invoking MainCommandExecutor UNLOCK): build the UNLOCK payload from
    // the returned session and apply the executor's UNLOCK state transition.
    if res.success {
        if let Some(session) = res.data.as_ref().and_then(|d| d.get("session")) {
            let g = |k: &str| session.get(k).cloned().unwrap_or(Value::Null);
            let scheduled = {
                let e = g("expiresAt");
                if e.is_null() { g("scheduledEndAt") } else { e }
            };
            let unlock_payload = json!({
                "sessionId": g("id"),
                "scheduledEndAt": scheduled,
                "startedAt": g("startedAt"),
                "customerName": g("customerName"),
                "profileUrl": g("profileUrl"),
                "remainingBalance": g("remainingBalance"),
                "hourlyRate": g("hourlyRate"),
                "creditMinutesRemaining": g("creditMinutesRemaining"),
                "walletMinutesRemaining": g("walletMinutesRemaining"),
                "totalMinutesRemaining": g("totalMinutesRemaining"),
                "sessionCost": g("sessionCost"),
            });
            if let Some(patch) =
                crate::executor::state_update_for("UNLOCK", &unlock_payload, &now_iso())
            {
                let merged = state.store.patch_local_client_state(&patch);
                crate::kiosk::broadcast_state(&app, &merged);
            }
        }
    }
    Ok(res)
}

#[tauri::command]
pub async fn end_session(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/sessions/{session_id}/end");
    let res = state.http.request(Method::POST, &path, None, &headers).await;
    if res.success {
        let current = state.store.get("local_client_state").unwrap_or(json!({}));
        let mut m = current.as_object().cloned().unwrap_or_default();
        m.insert("lockState".into(), json!("LOCKED"));
        m.insert("lastKnownStatus".into(), json!("AVAILABLE"));
        m.insert("activeSessionId".into(), Value::Null);
        m.insert("scheduledEndAt".into(), Value::Null);
        m.insert("activeSessionData".into(), Value::Null);
        emit_state(&app, &state, Value::Object(m));
    }
    Ok(res)
}

#[tauri::command]
pub async fn lock_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/sessions/{session_id}/away-lock");
    Ok(state.http.request(Method::POST, &path, None, &headers).await)
}

#[tauri::command]
pub async fn unlock_session(
    state: State<'_, AppState>,
    session_id: String,
    password: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/sessions/{session_id}/away-unlock");
    let body = json!({ "password": password });
    Ok(state
        .http
        .request(Method::POST, &path, Some(&body), &headers)
        .await)
}

#[tauri::command]
pub async fn extend_grace(
    state: State<'_, AppState>,
    reservation_id: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/reservations/{reservation_id}/extend-grace");
    Ok(state.http.request(Method::POST, &path, None, &headers).await)
}

#[tauri::command]
pub async fn leave_grace(
    state: State<'_, AppState>,
    reservation_id: String,
) -> Result<ApiResult, ()> {
    let Some(token) = device_token(&state) else {
        return Ok(ApiResult::err("Device not provisioned"));
    };
    let headers = state.device_headers(&token);
    let path = format!("/reservations/{reservation_id}/leave-grace");
    Ok(state.http.request(Method::POST, &path, None, &headers).await)
}
