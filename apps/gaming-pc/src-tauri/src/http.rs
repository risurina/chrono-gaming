//! HTTP gateway to the Chrono device API, mirroring `main-process-http.ts`.
//! Holds the access token + cookie jar in the Rust core (never in the webview),
//! injects `Authorization`/device headers, and unwraps the `{success,data,error}`
//! response envelope. The 401 auto-refresh is driven by the API command layer.

use std::sync::Mutex;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::{Client, Method};
use serde_json::Value;

/// Dev-only API traffic logging (request payload + response). Enabled in debug
/// builds or when NODE_ENV=development; also honored via CHRONO_LOG_API=1.
fn dev_logging() -> bool {
    cfg!(debug_assertions)
        || std::env::var("NODE_ENV").as_deref() == Ok("development")
        || std::env::var("CHRONO_LOG_API").as_deref() == Ok("1")
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let head: String = s.chars().take(max).collect();
        format!("{head}… (+{} chars)", s.chars().count() - max)
    }
}

/// Keys whose values must never appear in logs, in any payload direction.
/// Compared case-insensitively against JSON object keys.
fn is_sensitive_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "password"
            | "token"
            | "tokenhash"
            | "accesstoken"
            | "refreshtoken"
            | "devicetoken"
            | "sessiontoken"
            | "qrtoken"
            | "email"
    )
}

/// Recursively mask sensitive fields in a JSON value before logging.
fn redact_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| {
                    if is_sensitive_key(k) {
                        (k.clone(), Value::String("[redacted]".into()))
                    } else {
                        (k.clone(), redact_json(v))
                    }
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(redact_json).collect()),
        other => other.clone(),
    }
}

/// Auth-ish paths carry credentials (sign-in email/password, device token
/// exchange, refresh) — their bodies are dropped from logs entirely rather
/// than field-masked.
fn is_auth_path(path: &str) -> bool {
    path == "/auth" || path.contains("/auth/") || path == "/pair"
}

/// Sanitize a request body for dev logging: auth paths are fully redacted,
/// everything else gets recursive sensitive-field masking + truncation.
fn sanitize_body_for_log(path: &str, body: &Value) -> String {
    if is_auth_path(path) {
        return "[redacted: auth payload]".to_string();
    }
    truncate(&redact_json(body).to_string(), 2000)
}

/// Sanitize a response body (raw text) for dev logging, same policy as above.
/// Non-JSON responses on non-auth paths are truncated as-is.
fn sanitize_text_for_log(path: &str, text: &str) -> String {
    if is_auth_path(path) {
        return "[redacted: auth response]".to_string();
    }
    match serde_json::from_str::<Value>(text) {
        Ok(v) => truncate(&redact_json(&v).to_string(), 2000),
        Err(_) => truncate(text, 2000),
    }
}

/// Resolve the API base URL, matching `CLIENT_CONFIG.API_BASE_URL`:
/// env `VITE_API_BASE_URL` (or dev/prod defaults), then ensure the
/// `/api/v1/device` suffix is present.
pub fn api_base_url() -> String {
    let dev = std::env::var("NODE_ENV").as_deref() == Ok("development")
        || cfg!(debug_assertions);
    let base = std::env::var("VITE_API_BASE_URL").unwrap_or_else(|_| {
        if dev {
            "http://localhost:3001".to_string()
        } else {
            "https://chrono.api.izur.com.ph".to_string()
        }
    });
    if base.contains("/api/v1/device") {
        base
    } else {
        format!("{}/api/v1/device", base.trim_end_matches('/'))
    }
}

/// Sentinel error returned when a request's 401 refresh is rejected by the
/// server because the device was revoked/disabled. The command layer treats this
/// as a signal to reset the device to unpaired.
pub const DEVICE_REVOKED: &str = "DEVICE_REVOKED";

/// Outcome of a token-refresh attempt.
#[derive(Debug, PartialEq, Eq)]
enum RefreshOutcome {
    /// A fresh access token was obtained.
    Refreshed,
    /// The server rejected the device credential (revoked/disabled) — reset.
    AuthRejected,
    /// Network error or server-side failure — keep credentials, retry later.
    Transient,
}

/// Classify a failed `/auth` refresh by HTTP status. Only an explicit
/// unauthorized/forbidden means the device credential is no longer valid; a
/// network error (status 0) or 5xx is transient and must not reset the device.
fn classify_refresh_failure(status: u16) -> RefreshOutcome {
    match status {
        401 | 403 => RefreshOutcome::AuthRejected,
        _ => RefreshOutcome::Transient,
    }
}

/// Normalized result mirroring `IpcApiResponse<T>` returned to the webview.
#[derive(serde::Serialize, Clone, Debug)]
pub struct ApiResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ApiResult {
    pub fn ok(data: Option<Value>) -> Self {
        ApiResult { success: true, data, error: None }
    }
    pub fn err(msg: impl Into<String>) -> Self {
        ApiResult { success: false, data: None, error: Some(msg.into()) }
    }
}

pub struct HttpGateway {
    client: Client,
    access_token: Mutex<Option<String>>,
    // Needed to perform the 401 token refresh (POST /auth) — parity with
    // `performTokenRefresh` registered as the unauthorized handler in Electron.
    store: std::sync::Arc<crate::store::Store>,
    fingerprint: String,
}

impl HttpGateway {
    pub fn new(store: std::sync::Arc<crate::store::Store>, fingerprint: String) -> Self {
        let client = Client::builder()
            .cookie_store(true)
            .build()
            .expect("build reqwest client");
        HttpGateway {
            client,
            access_token: Mutex::new(None),
            store,
            fingerprint,
        }
    }

    pub fn set_access_token(&self, token: Option<String>) {
        *self.access_token.lock().unwrap() = token;
    }

    pub fn access_token(&self) -> Option<String> {
        self.access_token.lock().unwrap().clone()
    }

    /// Re-authenticate with the stored device token to obtain a fresh access
    /// token (parity with `performTokenRefresh`). Returns true on success.
    pub async fn refresh_access_token(&self) -> bool {
        matches!(self.try_refresh().await, RefreshOutcome::Refreshed)
    }

    /// Attempt a token refresh and classify the result so callers can tell a
    /// revoked device (server says 401/403 on `/auth`) from a transient failure
    /// (network / 5xx). Only the former should reset the device to unpaired; a
    /// transient failure must keep credentials so a flaky network never bricks a
    /// provisioned station.
    async fn try_refresh(&self) -> RefreshOutcome {
        let Some(token) = self.store.get_string("device_token") else {
            return RefreshOutcome::Transient;
        };
        if self.store.get("local_client_state").is_none() {
            return RefreshOutcome::Transient;
        }
        let payload = serde_json::json!({
            "tokenHash": token,
            "fingerprintV1": self.fingerprint,
            "hostname": sysinfo::System::host_name().unwrap_or_default(),
        });
        let (status, res) = self.send_once(Method::POST, "/auth", Some(&payload), &[]).await;
        if res.success {
            if let Some(tok) = res
                .data
                .as_ref()
                .and_then(|d| d.get("accessToken"))
                .and_then(|t| t.as_str())
            {
                self.set_access_token(Some(tok.to_string()));
                return RefreshOutcome::Refreshed;
            }
        }
        classify_refresh_failure(status)
    }

    /// Perform a request and unwrap the standard envelope, with transparent 401
    /// refresh-and-retry (once), mirroring `mainProcessHttp`. `extra_headers`
    /// carries device headers (`X-Device-Token`, `X-Device-Fingerprint`, `X-Branch-ID`).
    ///
    /// On a 401 whose refresh is *rejected* by the server (revoked/disabled
    /// device) the stale bearer is dropped and `DEVICE_REVOKED` is returned so
    /// the command layer can reset the device to unpaired. A transient refresh
    /// failure returns the original result and keeps credentials.
    pub async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
        extra_headers: &[(&str, String)],
    ) -> ApiResult {
        let (status, result) = self.send_once(method.clone(), path, body, extra_headers).await;
        // 401 on a non-auth path → refresh once and retry.
        if status == 401 && path != "/auth" {
            match self.try_refresh().await {
                RefreshOutcome::Refreshed => {
                    let (_, retried) = self.send_once(method, path, body, extra_headers).await;
                    return retried;
                }
                RefreshOutcome::AuthRejected => {
                    self.set_access_token(None);
                    return ApiResult::err(DEVICE_REVOKED);
                }
                RefreshOutcome::Transient => return result,
            }
        }
        result
    }

    /// Single request attempt; returns (http status code, unwrapped result).
    async fn send_once(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
        extra_headers: &[(&str, String)],
    ) -> (u16, ApiResult) {
        let url = format!("{}{}", api_base_url(), path);
        let method_str = method.to_string();
        if dev_logging() {
            let payload = body
                .map(|b| sanitize_body_for_log(path, b))
                .unwrap_or_else(|| "(none)".to_string());
            log::info!("[api] → {method_str} {url} payload={payload}");
        }
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if let Some(token) = self.access_token() {
            if path != "/auth" {
                if let Ok(v) = HeaderValue::from_str(&format!("Bearer {token}")) {
                    headers.insert(AUTHORIZATION, v);
                }
            }
        }
        for (k, v) in extra_headers {
            if let (Ok(name), Ok(val)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v)) {
                headers.insert(name, val);
            }
        }

        let mut req = self.client.request(method, &url).headers(headers);
        if let Some(b) = body {
            req = req.json(b);
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => return (0, ApiResult::err(format!("Network error: {e}"))),
        };

        let status = resp.status();
        let code = status.as_u16();
        let text = resp.text().await.unwrap_or_default();
        if dev_logging() {
            log::info!(
                "[api] ← {} {} {} {}",
                method_str,
                url,
                code,
                sanitize_text_for_log(path, &text)
            );
        }
        let parsed: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => {
                let snippet: String = text.chars().take(100).collect();
                return (code, ApiResult::err(format!("HTTP {code}: {snippet}")));
            }
        };

        (code, unwrap_envelope(&parsed, status.is_success()))
    }

    /// Send a bare POST with an exact pre-serialized JSON body and the given
    /// headers, returning whether the response status was success. The body is
    /// sent byte-for-byte as provided because the guard control channel signs
    /// over the exact body string (see `guard_ping`).
    pub async fn post_ok(
        &self,
        url: &str,
        body: String,
        extra_headers: &[(&str, String)],
    ) -> bool {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        for (k, v) in extra_headers {
            if let (Ok(name), Ok(val)) =
                (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v))
            {
                headers.insert(name, val);
            }
        }
        match self.client.post(url).headers(headers).body(body).send().await {
            Ok(r) => r.status().is_success(),
            Err(_) => false,
        }
    }

    /// Send a bare GET with the given headers, returning whether the response
    /// status was success. Used for the watchdog `/health` probe.
    pub async fn get_ok(&self, url: &str, extra_headers: &[(&str, String)]) -> bool {
        let mut headers = HeaderMap::new();
        for (k, v) in extra_headers {
            if let (Ok(name), Ok(val)) =
                (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_str(v))
            {
                headers.insert(name, val);
            }
        }
        match self.client.get(url).headers(headers).send().await {
            Ok(r) => r.status().is_success(),
            Err(_) => false,
        }
    }

    /// True when the last request should trigger a 401 refresh — callers inspect
    /// the raw status via `request_status` when they need retry semantics.
    pub async fn get_status(
        &self,
        path: &str,
        extra_headers: &[(&str, String)],
    ) -> ApiResult {
        self.request(Method::GET, path, None, extra_headers).await
    }
}

/// Unwrap the `{success,data,error,message}` envelope into an `ApiResult`,
/// mirroring the branching in `main-process-http.ts`.
pub fn unwrap_envelope(result: &Value, http_ok: bool) -> ApiResult {
    if let Some(obj) = result.as_object() {
        if obj.contains_key("success") {
            let success = obj.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            if !success {
                let err = obj
                    .get("error")
                    .and_then(|e| {
                        e.as_str()
                            .map(String::from)
                            .or_else(|| e.get("message").and_then(|m| m.as_str()).map(String::from))
                            .or_else(|| e.get("code").and_then(|m| m.as_str()).map(String::from))
                    })
                    .or_else(|| obj.get("message").and_then(|m| m.as_str()).map(String::from))
                    .unwrap_or_else(|| "API Error".to_string());
                return ApiResult::err(err);
            }
            return ApiResult::ok(obj.get("data").cloned());
        }
    }
    // Non-standard response.
    if !http_ok {
        let err = result
            .get("message")
            .and_then(|m| m.as_str())
            .or_else(|| result.get("error").and_then(|m| m.as_str()))
            .unwrap_or("Request failed")
            .to_string();
        return ApiResult::err(err);
    }
    ApiResult::ok(Some(result.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn base_url_appends_device_prefix() {
        std::env::set_var("VITE_API_BASE_URL", "https://example.com/");
        assert_eq!(api_base_url(), "https://example.com/api/v1/device");
        std::env::set_var("VITE_API_BASE_URL", "https://example.com/api/v1/device");
        assert_eq!(api_base_url(), "https://example.com/api/v1/device");
        std::env::remove_var("VITE_API_BASE_URL");
    }

    #[test]
    fn envelope_success_extracts_data() {
        let r = unwrap_envelope(&json!({ "success": true, "data": { "x": 1 } }), true);
        assert!(r.success);
        assert_eq!(r.data.unwrap()["x"], json!(1));
    }

    #[test]
    fn envelope_error_prefers_error_message() {
        let r = unwrap_envelope(
            &json!({ "success": false, "error": { "code": "BAD", "message": "nope" } }),
            true,
        );
        assert!(!r.success);
        assert_eq!(r.error.as_deref(), Some("nope"));
    }

    #[test]
    fn classify_refresh_failure_only_401_403_reset() {
        assert_eq!(classify_refresh_failure(401), RefreshOutcome::AuthRejected);
        assert_eq!(classify_refresh_failure(403), RefreshOutcome::AuthRejected);
        assert_eq!(classify_refresh_failure(0), RefreshOutcome::Transient); // network
        assert_eq!(classify_refresh_failure(500), RefreshOutcome::Transient);
        assert_eq!(classify_refresh_failure(502), RefreshOutcome::Transient);
        assert_eq!(classify_refresh_failure(400), RefreshOutcome::Transient); // don't nuke on bad-request
    }

    #[test]
    fn non_standard_failure_uses_message() {
        let r = unwrap_envelope(&json!({ "message": "boom" }), false);
        assert!(!r.success);
        assert_eq!(r.error.as_deref(), Some("boom"));
    }

    #[test]
    fn redact_json_masks_sensitive_fields_recursively() {
        let payload = json!({
            "email": "player@example.com",
            "password": "hunter2",
            "nested": {
                "deviceToken": "abc123",
                "accessToken": "jwt-value",
                "keep": "visible",
            },
            "list": [{ "refreshToken": "rt", "ok": 1 }],
            "tokenHash": "deadbeef",
        });
        let redacted = redact_json(&payload);
        assert_eq!(redacted["email"], json!("[redacted]"));
        assert_eq!(redacted["password"], json!("[redacted]"));
        assert_eq!(redacted["nested"]["deviceToken"], json!("[redacted]"));
        assert_eq!(redacted["nested"]["accessToken"], json!("[redacted]"));
        assert_eq!(redacted["nested"]["keep"], json!("visible"));
        assert_eq!(redacted["list"][0]["refreshToken"], json!("[redacted]"));
        assert_eq!(redacted["list"][0]["ok"], json!(1));
        assert_eq!(redacted["tokenHash"], json!("[redacted]"));
    }

    #[test]
    fn auth_paths_fully_redacted_in_request_and_response_logs() {
        let body = json!({ "email": "a@b.c", "password": "pw" });
        assert_eq!(sanitize_body_for_log("/auth", &body), "[redacted: auth payload]");
        assert_eq!(
            sanitize_body_for_log("/auth/sign-in/email", &body),
            "[redacted: auth payload]"
        );
        assert_eq!(sanitize_body_for_log("/pair", &body), "[redacted: auth payload]");
        assert_eq!(
            sanitize_text_for_log("/auth", "{\"data\":{\"accessToken\":\"x\"}}"),
            "[redacted: auth response]"
        );
    }

    #[test]
    fn non_auth_paths_mask_fields_but_keep_structure() {
        let body = json!({ "lockState": "LOCKED", "password": "pw" });
        let logged = sanitize_body_for_log("/heartbeat", &body);
        assert!(logged.contains("LOCKED"));
        assert!(!logged.contains("pw"));
        assert!(logged.contains("[redacted]"));

        // JSON responses on non-auth paths are field-masked too (e.g. qrToken).
        let resp = sanitize_text_for_log("/qr/generate", "{\"qrToken\":\"secret\",\"expiresIn\":300}");
        assert!(!resp.contains("secret"));
        assert!(resp.contains("300"));

        // Non-JSON responses pass through (truncated only).
        assert_eq!(sanitize_text_for_log("/status", "plain text"), "plain text");
    }
}
