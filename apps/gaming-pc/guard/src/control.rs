//! The **station control channel**: a loopback-only HTTP surface the Tauri
//! client uses to talk to the guard. Every request is authenticated with an
//! HMAC signature over `method:path:timestamp:nonce:body` (shared
//! `chrono-control` contract), guarded by a freshness window and a nonce replay
//! cache, compared in constant time.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::session_sync::{ServerCredentials, SharedCredentials};
use crate::store::StationStore;

/// Requests older/newer than this (vs the guard clock) are rejected.
const FRESHNESS_WINDOW_MS: i64 = 60_000;
/// Cap on buffered request bodies (control payloads are tiny).
const MAX_BODY_BYTES: usize = 64 * 1024;

#[derive(Clone)]
pub struct AppState {
    /// The station control key (shared secret) provisioned at startup.
    pub key: Arc<String>,
    /// Seen nonces → expiry instant, for replay rejection within the window.
    pub nonces: Arc<Mutex<HashMap<String, Instant>>>,
    /// Authoritative, sealed-on-disk station state.
    pub station: Arc<StationStore>,
    /// Server credentials the UI hands the guard over this channel, read by the
    /// session-sync loop. In-memory only; the device token is never persisted
    /// here or logged.
    pub credentials: SharedCredentials,
}

impl AppState {
    pub fn new(key: String, station: Arc<StationStore>, credentials: SharedCredentials) -> Self {
        AppState {
            key: Arc::new(key),
            nonces: Arc::new(Mutex::new(HashMap::new())),
            station,
            credentials,
        }
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Build the control-channel router with the auth middleware applied to every
/// route.
pub fn router(state: AppState) -> Router {
    let auth_state = state.clone();
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/ping", post(ping))
        .route("/session/credentials", post(session_credentials))
        .route("/recovery/verify", post(recovery_verify))
        .route("/audit", post(audit))
        .layer(middleware::from_fn(move |req: Request, next: Next| {
            let st = auth_state.clone();
            async move { authenticate(st, req, next).await }
        }))
        .with_state(state)
}

fn deny(status: StatusCode, error: &str) -> Response {
    (status, Json(json!({ "success": false, "error": error }))).into_response()
}

/// Authenticate a control-channel request: required headers → freshness window
/// → replay rejection → constant-time signature check. On success the request
/// (with its buffered body restored) proceeds to the handler.
async fn authenticate(st: AppState, req: Request, next: Next) -> Response {
    let method = req.method().as_str().to_string();
    let path = req.uri().path().to_string();

    // Extract the auth headers into owned values in a scope so the borrow of
    // `req` is released before we buffer the body across an `.await`.
    let (timestamp, nonce, signature) = {
        let header = |name: &str| {
            req.headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        };
        match (header("x-timestamp"), header("x-nonce"), header("x-signature")) {
            (Some(t), Some(n), Some(s)) => (t, n, s),
            _ => return deny(StatusCode::UNAUTHORIZED, "missing control authentication"),
        }
    };

    let Ok(request_ms) = timestamp.parse::<i64>() else {
        return deny(StatusCode::UNAUTHORIZED, "invalid timestamp");
    };
    if (now_ms() - request_ms).abs() > FRESHNESS_WINDOW_MS {
        return deny(StatusCode::UNAUTHORIZED, "request expired");
    }

    // Replay rejection (purge expired entries, then reject a repeat).
    {
        let now = Instant::now();
        // Recover from poison rather than panicking forever on this shared
        // lock — see the matching comment on StationStore::lock in store.rs.
        let mut seen = st.nonces.lock().unwrap_or_else(|e| e.into_inner());
        seen.retain(|_, exp| *exp > now);
        if seen.contains_key(&nonce) {
            return deny(StatusCode::UNAUTHORIZED, "replay detected");
        }
        seen.insert(nonce.clone(), now + Duration::from_millis(FRESHNESS_WINDOW_MS as u64));
    }

    // Buffer the body so it can be both signed-over and forwarded.
    let (parts, body) = req.into_parts();
    let bytes = match to_bytes(body, MAX_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return deny(StatusCode::BAD_REQUEST, "body too large"),
    };
    let body_str = String::from_utf8_lossy(&bytes);

    if !chrono_control::verify_request(
        &method, &path, &body_str, &st.key, &timestamp, &nonce, &signature,
    ) {
        return deny(StatusCode::FORBIDDEN, "invalid signature");
    }

    next.run(Request::from_parts(parts, Body::from(bytes))).await
}

// ---- Handlers -------------------------------------------------------------

async fn health() -> Response {
    Json(json!({ "success": true, "status": "RUNNING" })).into_response()
}

async fn status(State(st): State<AppState>) -> Response {
    let station = st.station.snapshot();
    Json(json!({ "success": true, "state": station })).into_response()
}

#[derive(Deserialize)]
struct PingBody {
    #[serde(default)]
    state: Option<PingState>,
}

/// Phase 3: `/ping` is **liveness-only**. The UI can no longer assert session
/// validity through it — the only client-supplied field the guard still records
/// is `pcId` (an identifier, not an unlock grant). Any `lockState` /
/// `activeSessionId` / `scheduledEndAt` the UI sends is ignored by construction
/// (the struct has no fields for them), so a holder of `control.key` forging a
/// `/ping` can neither unlock the station nor set an end-time. The authoritative
/// session window comes exclusively from the server via `session_sync`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PingState {
    pc_id: Option<String>,
}

/// UI liveness ping. Records `last_ping_at` (feeding the watchdog + the
/// enforcement stale-ping backstop) and, at most, `pcId`. It makes NO lock-state
/// decision — see [`PingState`].
async fn ping(State(st): State<AppState>, Json(body): Json<PingBody>) -> Response {
    let snapshot = st.station.update(|station| {
        station.last_ping_at = Some(now_ms());
        if let Some(s) = body.state {
            if let Some(pc) = s.pc_id {
                station.pc_id = Some(pc);
            }
        }
        station.clone()
    });
    Json(json!({ "success": true, "state": snapshot })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsBody {
    api_base_url: String,
    device_token: String,
    fingerprint: String,
}

/// Receive the server credentials the guard needs to poll `chrono-api` for
/// authoritative session state. Authenticated by the same signed-channel layer
/// as every other control route, so only the holder of `control.key` (the UI)
/// can set them. Stored in memory only; the device token is never logged or
/// persisted by the guard. The session-sync loop reads this slot each poll, so a
/// guard restart recovers as soon as the UI re-sends.
async fn session_credentials(State(st): State<AppState>, Json(body): Json<CredentialsBody>) -> Response {
    {
        let mut guard = st.credentials.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(ServerCredentials {
            api_base_url: body.api_base_url,
            device_token: body.device_token,
            fingerprint: body.fingerprint,
        });
    }
    log::info!("[session-sync] server credentials updated from UI");
    Json(json!({ "success": true })).into_response()
}

#[derive(Deserialize)]
struct RecoveryVerifyBody {
    #[serde(default)]
    pin: String,
}

/// Verify an operator recovery PIN against the salted PBKDF2 record in the ACL'd
/// secret store. The guard owns verification so the PIN hash is never readable
/// by the non-admin UI; the UI still drives the policy-revert + maintenance
/// transition on a `valid: true` answer. The entered PIN is never logged.
async fn recovery_verify(Json(body): Json<RecoveryVerifyBody>) -> Response {
    let valid = crate::recovery::verify_configured_pin(&body.pin);
    if valid {
        log::info!("[Security] Operator recovery PIN accepted");
    } else {
        log::warn!("[Security] Operator recovery PIN rejected");
    }
    Json(json!({ "success": true, "valid": valid })).into_response()
}

async fn audit(Json(body): Json<serde_json::Value>) -> Response {
    let kind = body.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
    log::info!("audit event from UI: {kind}");
    Json(json!({ "success": true })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::LockState;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tower::ServiceExt; // oneshot

    const KEY: &str = "test-key";
    static NONCE_SEQ: AtomicU64 = AtomicU64::new(0);

    fn unique_nonce() -> String {
        format!("n-{}-{}", now_ms(), NONCE_SEQ.fetch_add(1, Ordering::Relaxed))
    }

    fn test_store() -> Arc<StationStore> {
        let n = NONCE_SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("chrono-guard-test-{}-{}.json", now_ms(), n));
        Arc::new(StationStore::load_or_default("seal".to_owned(), path))
    }

    fn test_state() -> AppState {
        AppState::new(
            KEY.to_owned(),
            test_store(),
            crate::session_sync::shared_credentials(),
        )
    }

    fn signed_request(method: &str, path: &str, body: &str) -> Request<Body> {
        let ts = now_ms().to_string();
        let nonce = unique_nonce();
        let sig = chrono_control::sign_request(method, path, body, KEY, &ts, &nonce).unwrap();
        Request::builder()
            .method(method)
            .uri(path)
            .header("x-timestamp", sig.timestamp)
            .header("x-nonce", sig.nonce)
            .header("x-signature", sig.signature)
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[tokio::test]
    async fn valid_signed_health_returns_200() {
        let app = router(test_state());
        let resp = app.oneshot(signed_request("GET", "/health", "")).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn missing_headers_rejected_401() {
        let app = router(test_state());
        let req = Request::builder().uri("/health").body(Body::empty()).unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn bad_signature_rejected_403() {
        let app = router(test_state());
        let ts = now_ms().to_string();
        let req = Request::builder()
            .uri("/health")
            .header("x-timestamp", &ts)
            .header("x-nonce", "n1")
            .header("x-signature", "deadbeef")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn stale_timestamp_rejected_401() {
        let app = router(test_state());
        let old = (now_ms() - 5 * 60_000).to_string();
        let nonce = "n-old";
        let sig = chrono_control::sign_request("GET", "/health", "", KEY, &old, nonce).unwrap();
        let req = Request::builder()
            .uri("/health")
            .header("x-timestamp", old)
            .header("x-nonce", nonce)
            .header("x-signature", sig.signature)
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn replayed_nonce_rejected_401() {
        let app = router(test_state());
        let ts = now_ms().to_string();
        let nonce = "n-replay";
        let sig = chrono_control::sign_request("GET", "/health", "", KEY, &ts, nonce).unwrap();
        let build = || {
            Request::builder()
                .uri("/health")
                .header("x-timestamp", &ts)
                .header("x-nonce", nonce)
                .header("x-signature", &sig.signature)
                .body(Body::empty())
                .unwrap()
        };
        let first = app.clone().oneshot(build()).await.unwrap();
        assert_eq!(first.status(), StatusCode::OK);
        let second = app.oneshot(build()).await.unwrap();
        assert_eq!(second.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn recovery_verify_returns_valid_for_correct_pin_and_false_otherwise() {
        // Point the secret dir at a unique temp dir and write a known record.
        // (This is the only guard test that touches CHRONO_CONTROL_DIR.)
        let n = NONCE_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("chrono-rec-test-{}-{}", now_ms(), n));
        std::env::set_var("CHRONO_CONTROL_DIR", &dir);
        let path = chrono_control::recovery_hash_path();
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, crate::recovery::hash_pin("87654321")).unwrap();

        let app = router(test_state());

        let good = json!({ "pin": "87654321" }).to_string();
        let resp = app
            .clone()
            .oneshot(signed_request("POST", "/recovery/verify", &good))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = to_bytes(resp.into_body(), MAX_BODY_BYTES).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["valid"], json!(true));

        let bad = json!({ "pin": "00000000" }).to_string();
        let resp = app
            .oneshot(signed_request("POST", "/recovery/verify", &bad))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = to_bytes(resp.into_body(), MAX_BODY_BYTES).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["valid"], json!(false));

        std::env::remove_var("CHRONO_CONTROL_DIR");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn recovery_verify_rejects_unsigned_request() {
        let app = router(test_state());
        let req = Request::builder()
            .method("POST")
            .uri("/recovery/verify")
            .header("content-type", "application/json")
            .body(Body::from(json!({ "pin": "87654321" }).to_string()))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn ping_is_liveness_only_and_cannot_unlock() {
        // Phase 3 keystone: a correctly SIGNED /ping that tries to assert an
        // UNLOCKED session with a far-future end must NOT change lock state. A
        // holder of control.key therefore cannot buy session time by forging a
        // ping — the only authority is the server (via session_sync).
        let state = test_state();
        let app = router(state.clone());
        let body = json!({
            "state": {
                "lockState": "UNLOCKED",
                "activeSessionId": "s1",
                "scheduledEndAt": "2030-01-01T00:00:00Z",
                "pcId": "pc-9"
            }
        })
        .to_string();
        let resp = app.oneshot(signed_request("POST", "/ping", &body)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let station = state.station.snapshot();
        assert_eq!(station.lock_state, LockState::Locked, "forged ping must not unlock");
        assert_eq!(station.active_session_id, None, "forged ping must not set a session");
        assert_eq!(station.scheduled_end_at, None, "forged ping must not set an end-time");
        assert!(station.last_ping_at.is_some(), "ping still records liveness");
        assert_eq!(station.pc_id.as_deref(), Some("pc-9"), "ping may record pcId");
    }

    #[tokio::test]
    async fn session_credentials_are_stored_in_state() {
        let state = test_state();
        let app = router(state.clone());
        let body = json!({
            "apiBaseUrl": "https://api.example/api/v1/device",
            "deviceToken": "tok-secret",
            "fingerprint": "fp-1"
        })
        .to_string();
        let resp = app
            .oneshot(signed_request("POST", "/session/credentials", &body))
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let creds = state
            .credentials
            .lock()
            .unwrap()
            .clone()
            .expect("credentials stored");
        assert_eq!(creds.api_base_url, "https://api.example/api/v1/device");
        assert_eq!(creds.device_token, "tok-secret");
        assert_eq!(creds.fingerprint, "fp-1");
    }

    #[tokio::test]
    async fn session_credentials_rejects_unsigned_request() {
        let app = router(test_state());
        let req = Request::builder()
            .method("POST")
            .uri("/session/credentials")
            .header("content-type", "application/json")
            .body(Body::from(
                json!({ "apiBaseUrl": "x", "deviceToken": "y", "fingerprint": "z" }).to_string(),
            ))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }
}
