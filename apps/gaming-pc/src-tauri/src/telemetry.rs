//! Rust-core Sentry telemetry.
//!
//! Captures panics in the Tauri core automatically (via the `panic` feature's
//! default integration) and exposes helpers to report handled errors from the
//! core — HTTP failures, command handlers, and background daemons — which are
//! otherwise only written to the log and never surfaced.
//!
//! This complements the webview's `@sentry/react` layer: the two report the
//! same project from different processes/layers.

use std::env;

const CLIENT_VERSION: &str = "0.1.0";

/// Resolve the Rust-core Sentry DSN. Prefers `SENTRY_DSN`; falls back to the
/// webview's `VITE_SENTRY_DSN` so a single project DSN can serve both layers.
fn resolve_dsn() -> Option<String> {
    for key in ["SENTRY_DSN", "VITE_SENTRY_DSN"] {
        if let Ok(value) = env::var(key) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Initialize Sentry for the Rust core.
///
/// Returns a guard that MUST be held for the lifetime of the process — dropping
/// it flushes pending events and disables further reporting. Returns `None`
/// (a no-op) when no DSN is configured, so telemetry stays opt-in.
#[must_use]
pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = resolve_dsn()?;
    let environment = if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    };

    let guard = sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(format!("pc-client@{CLIENT_VERSION}").into()),
            environment: Some(environment.into()),
            // Never attach IPs / usernames; station context is added explicitly.
            send_default_pii: false,
            ..Default::default()
        },
    ));

    log::info!("[Sentry] Rust core telemetry initialized ({environment})");
    Some(guard)
}

/// Report a handled error condition to Sentry at error level. Use for failures
/// the core recovers from but that should still be visible (e.g. a background
/// daemon whose result is otherwise discarded).
pub fn capture_error_message(message: &str) {
    sentry::capture_message(message, sentry::Level::Error);
}

/// Report a handled `std::error::Error` to Sentry, preserving its source chain.
#[allow(dead_code)]
pub fn capture_error<E: std::error::Error + ?Sized>(error: &E) {
    sentry::capture_error(error);
}
