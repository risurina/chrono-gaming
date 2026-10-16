//! Shared application state managed by Tauri and injected into commands.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::http::HttpGateway;
use crate::store::Store;

pub struct AppState {
    pub store: Arc<Store>,
    pub http: HttpGateway,
    /// Cached at startup; the fingerprint is stable for the machine's lifetime.
    pub fingerprint: String,
    pub app_data_dir: PathBuf,
    /// Last process snapshot, for launched/closed diffing.
    pub last_processes: Mutex<BTreeSet<String>>,
    /// Process start instant, for real heartbeat `uptime` reporting.
    pub started_at: Instant,
    /// Last (monotonic, wall-clock-ms) sample, for local clock-jump detection
    /// across heartbeat ticks.
    pub last_clock_sample: Mutex<Option<(Instant, i64)>>,
}

// `RealtimeState` (the live Socket.IO client handle, if connected) is managed
// separately via `app.manage()` rather than as an `AppState` field — it's
// optional/lazily-created only once realtime initializes, unlike everything
// else here which exists from the first tick of `AppState::new`.

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let store = Arc::new(Store::open(&app_data_dir));
        let fingerprint = crate::identity::get_persistent_fingerprint();
        AppState {
            http: HttpGateway::new(store.clone(), fingerprint.clone()),
            store,
            fingerprint,
            app_data_dir,
            last_processes: Mutex::new(BTreeSet::new()),
            started_at: Instant::now(),
            last_clock_sample: Mutex::new(None),
        }
    }

    /// Device headers common to authenticated device calls.
    pub fn device_headers(&self, device_token: &str) -> Vec<(&'static str, String)> {
        let mut h = vec![
            ("X-Device-Token", device_token.to_string()),
            ("X-Device-Fingerprint", self.fingerprint.clone()),
        ];
        if let Some(branch) = self
            .store
            .get("local_client_state")
            .and_then(|s| s.get("branchId").and_then(|b| b.as_str()).map(String::from))
        {
            h.push(("X-Branch-ID", branch));
        }
        h
    }
}
