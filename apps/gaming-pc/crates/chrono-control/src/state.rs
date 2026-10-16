//! Tamper-sealed durable state for the station. The guard persists its
//! authoritative `StationState` here; the seal lets the guard detect tampering
//! (or a rotated key) on read and **fail closed**.
//!
//! The seal key is deliberately **separate** from the control-channel key: a
//! process that can read the control key must not thereby be able to forge a
//! valid on-disk state. Both live under the same base dir but in different files
//! (`control.key` vs `seal.key`), hardened by directory ACLs in Phase 4.

use std::path::PathBuf;

use serde_json::Value;

use crate::canonical::{constant_time_eq_hex, hmac_hex};
use crate::secret::base_dir;

/// Location of the separate state-seal key.
pub fn seal_key_path() -> PathBuf {
    base_dir().join("seal.key")
}

/// Location of the sealed station-state file.
pub fn station_state_path() -> PathBuf {
    base_dir().join("station-state.json")
}

/// Result of loading sealed state.
#[derive(Debug, PartialEq)]
pub enum Loaded {
    /// Seal verified — the inner state can be trusted.
    Verified(Value),
    /// File present but seal missing/invalid — caller must fail closed.
    Tampered,
    /// No state file yet.
    Missing,
}

fn io_err(e: impl std::fmt::Display) -> std::io::Error {
    std::io::Error::other(e.to_string())
}

/// Serialize `state` and write it with an HMAC seal over its canonical JSON.
pub fn save_sealed_json(path: &PathBuf, seal_key: &str, state: &Value) -> std::io::Result<()> {
    let canonical = serde_json::to_string(state).map_err(io_err)?;
    let sig = hmac_hex(seal_key, &canonical).ok_or_else(|| io_err("empty seal key"))?;
    let sealed = serde_json::json!({ "state": state, "sig": sig });
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, serde_json::to_vec_pretty(&sealed).map_err(io_err)?)
}

/// Load and verify sealed state. A missing/rotated key, an unsealed file, or a
/// signature mismatch all resolve to `Tampered` so the caller fails closed.
pub fn load_sealed_json(path: &PathBuf, seal_key: &str) -> Loaded {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Loaded::Missing;
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return Loaded::Tampered;
    };
    let (Some(state), Some(sig)) = (
        parsed.get("state"),
        parsed.get("sig").and_then(|v| v.as_str()),
    ) else {
        return Loaded::Tampered;
    };
    let canonical = serde_json::to_string(state).unwrap_or_default();
    match hmac_hex(seal_key, &canonical) {
        Some(expected) if constant_time_eq_hex(&expected, sig) => Loaded::Verified(state.clone()),
        _ => Loaded::Tampered,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trip_verifies() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let state = json!({ "lockState": "UNLOCKED", "activeSessionId": "s1" });
        save_sealed_json(&path, "seal-k", &state).unwrap();
        assert_eq!(load_sealed_json(&path, "seal-k"), Loaded::Verified(state));
    }

    #[test]
    fn missing_file_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            load_sealed_json(&dir.path().join("nope.json"), "seal-k"),
            Loaded::Missing
        );
    }

    #[test]
    fn wrong_key_is_tampered() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        save_sealed_json(&path, "seal-k", &json!({ "lockState": "LOCKED" })).unwrap();
        assert_eq!(load_sealed_json(&path, "other-key"), Loaded::Tampered);
    }

    #[test]
    fn edited_state_is_tampered() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        save_sealed_json(&path, "seal-k", &json!({ "lockState": "LOCKED" })).unwrap();
        // Tamper: flip LOCKED → UNLOCKED without re-sealing.
        let raw = std::fs::read_to_string(&path).unwrap().replace("LOCKED", "UNLOCKED");
        std::fs::write(&path, raw).unwrap();
        assert_eq!(load_sealed_json(&path, "seal-k"), Loaded::Tampered);
    }
}
