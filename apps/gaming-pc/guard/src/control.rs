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

use crate::state::LockState;
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
}

impl AppState {
    pub fn new(key: String, station: Arc<StationStore>) -> Self {
        AppState {
            key: Arc::new(key),
            nonces: Arc::new(Mutex::new(HashMap::new())),
            station,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PingState {
    lock_state: Option<String>,
    active_session_id: Option<String>,
    scheduled_end_at: Option<String>,
    pc_id: Option<String>,
}

/// UI liveness ping. Records the ping time and applies the narrow set of
/// UI-driven state changes the guard trusts: session-gated UNLOCKED, and LOCKED
/// when the UI reports the session ended. The guard remains authoritative for
/// everything else (enforcement lands in Phase 2).
async fn ping(State(st): State<AppState>, Json(body): Json<PingBody>) -> Response {
    let snapshot = st.station.update(|station| {
        station.last_ping_at = Some(now_ms());

        if let Some(s) = body.state {
            if let Some(pc) = s.pc_id {
                station.pc_id = Some(pc);
            }
            match (s.lock_state.as_deref(), s.active_session_id) {
                (Some("UNLOCKED"), Some(session)) => {
                    station.lock_state = LockState::Unlocked;
                    station.active_session_id = Some(session);
                    station.scheduled_end_at = s.scheduled_end_at;
                }
                (Some("LOCKED"), None) => {
                    station.lock_state = LockState::Locked;
                    station.active_session_id = None;
                    station.scheduled_end_at = None;
                }
                _ => {}
            }
        }
        station.clone()
    });
    Json(json!({ "success": true, "state": snapshot })).into_response()
}

async fn audit(Json(body): Json<serde_json::Value>) -> Response {
    let kind = body.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
    log::info!("audit event from UI: {kind}");
    Json(json!({ "success": true })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
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
        AppState::new(KEY.to_owned(), test_store())
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
    async fn ping_records_liveness_and_session_unlock() {
        let state = test_state();
        let app = router(state.clone());
        let body = json!({ "state": { "lockState": "UNLOCKED", "activeSessionId": "s1", "scheduledEndAt": "2030-01-01T00:00:00Z" } }).to_string();
        let resp = app.oneshot(signed_request("POST", "/ping", &body)).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let station = state.station.snapshot();
        assert_eq!(station.lock_state, LockState::Unlocked);
        assert_eq!(station.active_session_id.as_deref(), Some("s1"));
        assert!(station.last_ping_at.is_some());
    }
}
