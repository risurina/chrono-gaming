//! Client for the local guard service (`chrono-guard` on 127.0.0.1:3202) over
//! the station control channel. The signing contract lives in the shared
//! `chrono-control` crate, which both this Tauri core and the guard binary
//! compile — so parity is guaranteed by construction.

pub use chrono_control::{read_control_key, service_url, sign_request};
