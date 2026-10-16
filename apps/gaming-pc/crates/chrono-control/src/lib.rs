//! Shared **station control channel** contract for the Chrono client (Tauri
//! core) and the guard service. Both sides compile this crate, so the auth
//! contract is parity-by-construction rather than parity-by-convention.
//!
//! Canonical string: `method:path:timestamp:nonce:body`, HMAC-SHA256, hex.
//! The `canonical_signature_matches_reference` test pins the reference vector.

pub mod canonical;
pub mod secret;
pub mod state;

pub use canonical::{sign_request, verify_request, SignedHeaders};
pub use secret::{
    control_key_path, protect, read_control_key, read_secret, service_url, unprotect,
    write_secret, DEFAULT_SERVICE_URL,
};
pub use state::{
    load_sealed_json, save_sealed_json, seal_key_path, station_state_path, Loaded,
};
