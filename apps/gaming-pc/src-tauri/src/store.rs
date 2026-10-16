//! File-backed key/value store, mirroring the Electron `electron-store`
//! (`chrono-pc-client.json`) shape and its `safeStorage` encryption for the
//! `device_token` and `local_client_state` keys.
//!
//! Kept as a plain JSON object of arbitrary keys so unknown fields written by
//! other parts of the client round-trip losslessly.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

use crate::secure;

/// Keys whose values are encrypted at rest (parity with `SecureStore`).
const SECURE_KEYS: [&str; 2] = ["device_token", "local_client_state"];

fn is_secure_key(key: &str) -> bool {
    SECURE_KEYS.contains(&key)
}

pub struct Store {
    path: PathBuf,
    data: Mutex<BTreeMap<String, Value>>,
}

impl Store {
    /// Open (or create) the store at `<app_data_dir>/chrono-pc-client.json`,
    /// importing an existing Electron store on first run if present.
    pub fn open(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("chrono-pc-client.json");
        let data = Self::read_file(&path).unwrap_or_default();
        let store = Store {
            path,
            data: Mutex::new(data),
        };
        store.migrate_from_electron_if_needed(app_data_dir);
        store
    }

    fn read_file(path: &Path) -> Option<BTreeMap<String, Value>> {
        let raw = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&raw).ok()
    }

    fn persist(&self, data: &BTreeMap<String, Value>) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(data) {
            let _ = std::fs::write(&self.path, json);
        }
    }

    /// Decrypt a raw stored value for `key` (identity for non-secure keys).
    fn decode_value(key: &str, raw: Value) -> Value {
        if !is_secure_key(key) {
            return raw;
        }
        // Secure keys are stored as encrypted base64 strings.
        let Value::String(s) = &raw else {
            return raw;
        };
        match secure::decrypt_string(s) {
            Ok(plain) => {
                if key == "local_client_state" {
                    // Stored as JSON string inside the encrypted blob.
                    serde_json::from_str(&plain).unwrap_or(Value::String(plain))
                } else {
                    Value::String(plain)
                }
            }
            Err(_) => raw,
        }
    }

    /// Encrypt `value` for storage under `key` (identity for non-secure keys).
    /// Returns `Err` when `key` is secure, encryption is available, and the
    /// encrypt call itself failed — callers must NOT fall back to persisting
    /// plaintext for a secure key (that would silently write the device token
    /// or local client state unencrypted to disk).
    fn encode_value(key: &str, value: &Value) -> Result<Value, ()> {
        if !is_secure_key(key) || !secure::is_encryption_available() {
            return Ok(value.clone());
        }
        let plaintext = if key == "local_client_state" {
            value.to_string()
        } else {
            match value {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            }
        };
        secure::encrypt_string(&plaintext).map(Value::String).map_err(|_| ())
    }

    /// Get a raw (already-decrypted for secure keys) value.
    pub fn get(&self, key: &str) -> Option<Value> {
        let data = self.data.lock().unwrap();
        let raw = data.get(key)?.clone();
        Some(Self::decode_value(key, raw))
    }

    pub fn get_string(&self, key: &str) -> Option<String> {
        match self.get(key)? {
            Value::String(s) => Some(s),
            other => Some(other.to_string()),
        }
    }

    /// Set a value, encrypting secure keys at rest when encryption is
    /// available. Refuses to write (keeping the previous on-disk value) if a
    /// secure key fails to encrypt, rather than silently persisting plaintext.
    pub fn set(&self, key: &str, value: Value) {
        let mut data = self.data.lock().unwrap();
        match Self::encode_value(key, &value) {
            Ok(stored) => {
                data.insert(key.to_string(), stored);
                self.persist(&data);
            }
            Err(()) => {
                log::error!(
                    "refusing to persist unencrypted value for secure key '{key}' \
                     (encryption failed); keeping previous on-disk value"
                );
            }
        }
    }

    pub fn delete(&self, key: &str) {
        let mut data = self.data.lock().unwrap();
        data.remove(key);
        self.persist(&data);
    }

    /// Atomically read-modify-write `key`: the whole decode → `f` → encode →
    /// persist sequence runs under a single lock hold. Plain `get()` then
    /// `set()` calls are two separate lock acquisitions, so two concurrent
    /// callers (e.g. the heartbeat drain and a renderer-originated command
    /// racing on `command_replay`, the offline queue, or the audit log) can
    /// both read the same prior value before either writes back — the second
    /// writer's update clobbers the first's, silently dropping data or (for
    /// the replay-nonce set) defeating replay protection entirely.
    pub fn mutate<F>(&self, key: &str, f: F) -> Value
    where
        F: FnOnce(Option<Value>) -> Value,
    {
        let mut data = self.data.lock().unwrap();
        let current = data.get(key).cloned().map(|raw| Self::decode_value(key, raw));
        let next = f(current);
        match Self::encode_value(key, &next) {
            Ok(stored) => {
                data.insert(key.to_string(), stored);
                self.persist(&data);
            }
            Err(()) => {
                log::error!(
                    "refusing to persist unencrypted value for secure key '{key}' \
                     (encryption failed); keeping previous on-disk value"
                );
            }
        }
        next
    }

    /// Like [`mutate`], but `f` can veto the write by returning `None` (e.g. a
    /// replay check that rejects a duplicate nonce) — nothing is written and
    /// `try_mutate` returns `None` in that case. This keeps the
    /// check-and-record atomic under one lock hold instead of the caller doing
    /// a separate `get()` then `set()`.
    pub fn try_mutate<F>(&self, key: &str, f: F) -> Option<Value>
    where
        F: FnOnce(Option<Value>) -> Option<Value>,
    {
        let mut data = self.data.lock().unwrap();
        let current = data.get(key).cloned().map(|raw| Self::decode_value(key, raw));
        let next = f(current)?;
        match Self::encode_value(key, &next) {
            Ok(stored) => {
                data.insert(key.to_string(), stored);
                self.persist(&data);
            }
            Err(()) => {
                log::error!(
                    "refusing to persist unencrypted value for secure key '{key}' \
                     (encryption failed); keeping previous on-disk value"
                );
            }
        }
        Some(next)
    }

    /// Shallow-merge `patch` (an object) into the decrypted `local_client_state`.
    pub fn patch_local_client_state(&self, patch: &Value) -> Value {
        let patch_map = match patch {
            Value::Object(m) => m.clone(),
            _ => serde_json::Map::new(),
        };
        self.mutate("local_client_state", |current| {
            let mut map = match current {
                Some(Value::Object(m)) => m,
                _ => serde_json::Map::new(),
            };
            for (k, v) in &patch_map {
                map.insert(k.clone(), v.clone());
            }
            Value::Object(map)
        })
    }

    /// One-time import of an Electron `chrono-pc-client.json` from the platform
    /// appData path, so migrated devices stay paired. Idempotent via the
    /// `migrated_from_electron` marker.
    fn migrate_from_electron_if_needed(&self, tauri_data_dir: &Path) {
        {
            let data = self.data.lock().unwrap();
            if data.contains_key("migrated_from_electron") {
                return;
            }
        }

        let mut imported = false;
        if let Some(electron_path) = electron_store_path() {
            // Don't import from ourselves if the paths happen to coincide.
            if electron_path != self.path.join("") && electron_path.exists() {
                if let Some(electron_data) = Self::read_file(&electron_path) {
                    let mut data = self.data.lock().unwrap();
                    for (k, v) in electron_data {
                        data.entry(k).or_insert(v);
                    }
                    self.persist(&data);
                    imported = true;
                }
            }
        }

        let mut data = self.data.lock().unwrap();
        data.insert(
            "migrated_from_electron".to_string(),
            Value::Bool(imported),
        );
        self.persist(&data);
        let _ = tauri_data_dir; // reserved for future per-dir logic
    }
}

/// Path to the Electron client's `electron-store` file, per platform.
/// Electron `app.getPath('userData')` = `<appData>/chrono-pc-client`.
fn electron_store_path() -> Option<PathBuf> {
    let app_data = electron_app_data_dir()?;
    Some(app_data.join("chrono-pc-client").join("chrono-pc-client.json"))
}

#[cfg(windows)]
fn electron_app_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(target_os = "macos")]
fn electron_app_data_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(|h| PathBuf::from(h).join("Library").join("Application Support"))
}

#[cfg(not(any(windows, target_os = "macos")))]
fn electron_app_data_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
}

// --- Provision-token seed (diskless imaging) ---

fn provision_token_seed_path(app_data_dir: &Path) -> PathBuf {
    if let Some(over) = std::env::var("CHRONO_PROVISION_TOKEN_FILE")
        .ok()
        .filter(|s| !s.trim().is_empty())
    {
        return PathBuf::from(over.trim());
    }
    app_data_dir.join("provision-token.txt")
}

/// Precedence: inline env `CHRONO_PROVISION_TOKEN`, then the seed file.
///
/// The seed file is DPAPI-encrypted at rest on Windows (via `secure`). Legacy
/// plaintext seed files (from the Electron client or an older build) still read
/// correctly — `secure::decrypt_string` returns non-ciphertext unchanged — and
/// are migrated to encrypted at rest on read when encryption is available.
pub fn resolve_seeded_provision_token(app_data_dir: &Path) -> Option<String> {
    if let Ok(inline) = std::env::var("CHRONO_PROVISION_TOKEN") {
        let t = inline.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    let path = provision_token_seed_path(app_data_dir);
    let raw = std::fs::read_to_string(&path).ok()?.trim().to_string();
    if raw.is_empty() {
        return None;
    }
    let token = secure::decrypt_string(&raw).unwrap_or_else(|_| raw.clone());
    let token = token.trim().to_string();
    if token.is_empty() {
        return None;
    }
    // Migrate-on-read: a legacy plaintext seed (decrypt returned it unchanged) is
    // re-written encrypted once encryption is available.
    if secure::is_encryption_available() && token == raw {
        if let Ok(enc) = secure::encrypt_string(&token) {
            let _ = std::fs::write(&path, enc);
        }
    }
    Some(token)
}

pub fn write_provision_token_seed(app_data_dir: &Path, token: &str) {
    let t = token.trim();
    if t.is_empty() {
        return;
    }
    let path = provision_token_seed_path(app_data_dir);
    let to_write = if secure::is_encryption_available() {
        secure::encrypt_string(t).unwrap_or_else(|_| t.to_string())
    } else {
        t.to_string()
    };
    let _ = std::fs::write(path, to_write);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path());
        (dir, store)
    }

    #[test]
    fn set_get_roundtrip_plain_key() {
        let (_d, store) = temp_store();
        store.set("branchId", json!("branch-123"));
        assert_eq!(store.get_string("branchId").as_deref(), Some("branch-123"));
    }

    #[test]
    fn device_token_roundtrips() {
        let (_d, store) = temp_store();
        store.set("device_token", json!("secret-token"));
        assert_eq!(store.get_string("device_token").as_deref(), Some("secret-token"));
    }

    #[test]
    fn local_client_state_roundtrips_as_object() {
        let (_d, store) = temp_store();
        store.set("local_client_state", json!({ "branchId": "b1", "lockState": "LOCKED" }));
        let got = store.get("local_client_state").unwrap();
        assert_eq!(got["branchId"], json!("b1"));
        assert_eq!(got["lockState"], json!("LOCKED"));
    }

    #[test]
    fn patch_merges_shallow() {
        let (_d, store) = temp_store();
        store.set("local_client_state", json!({ "branchId": "b1", "lockState": "LOCKED" }));
        let merged = store.patch_local_client_state(&json!({ "lockState": "UNLOCKED" }));
        assert_eq!(merged["branchId"], json!("b1"));
        assert_eq!(merged["lockState"], json!("UNLOCKED"));
    }

    #[test]
    fn mutate_is_atomic_across_concurrent_callers() {
        // Regression test for R4: plain get()-then-set() lets two concurrent
        // callers both read the same prior array before either writes back,
        // so one caller's append clobbers the other's. `mutate` holds the
        // lock across the whole read-modify-write, so N concurrent appends
        // must all land.
        let dir = tempfile::tempdir().unwrap();
        let store = std::sync::Arc::new(Store::open(dir.path()));
        let threads: Vec<_> = (0..16)
            .map(|i| {
                let store = store.clone();
                std::thread::spawn(move || {
                    store.mutate("concurrent_list", move |current| {
                        let mut list: Vec<i32> =
                            current.and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default();
                        list.push(i);
                        json!(list)
                    });
                })
            })
            .collect();
        for t in threads {
            t.join().unwrap();
        }
        let list: Vec<i32> = store
            .get("concurrent_list")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        assert_eq!(list.len(), 16, "every concurrent mutate() must land: {list:?}");
    }

    #[test]
    fn try_mutate_veto_does_not_write() {
        let (_d, store) = temp_store();
        store.set("gate", json!(1));
        let result = store.try_mutate("gate", |_current| None::<Value>);
        assert_eq!(result, None);
        assert_eq!(store.get("gate"), Some(json!(1)));
    }

    #[test]
    fn migration_marker_written_once() {
        let (_d, store) = temp_store();
        // With no Electron file present, marker is written as false.
        assert_eq!(store.get("migrated_from_electron"), Some(json!(false)));
    }

    #[test]
    fn provision_token_from_seed_file() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("provision-token.txt"), "  seed-abc  ").unwrap();
        // Ensure env override is absent for this test.
        std::env::remove_var("CHRONO_PROVISION_TOKEN");
        std::env::remove_var("CHRONO_PROVISION_TOKEN_FILE");
        assert_eq!(
            resolve_seeded_provision_token(dir.path()).as_deref(),
            Some("seed-abc")
        );
    }

    #[test]
    fn provision_token_write_then_read_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        std::env::remove_var("CHRONO_PROVISION_TOKEN");
        std::env::remove_var("CHRONO_PROVISION_TOKEN_FILE");
        write_provision_token_seed(dir.path(), "  seed-xyz  ");
        // On Windows the on-disk bytes are DPAPI ciphertext; on non-Windows they
        // are plaintext. Either way resolve returns the original trimmed token.
        assert_eq!(
            resolve_seeded_provision_token(dir.path()).as_deref(),
            Some("seed-xyz")
        );
    }

    #[test]
    fn provision_token_legacy_plaintext_still_readable() {
        // A plaintext seed written by the Electron client / older build must
        // still resolve (migrate-on-read must not break it).
        let dir = tempfile::tempdir().unwrap();
        std::env::remove_var("CHRONO_PROVISION_TOKEN");
        std::env::remove_var("CHRONO_PROVISION_TOKEN_FILE");
        std::fs::write(dir.path().join("provision-token.txt"), "legacy-plain").unwrap();
        assert_eq!(
            resolve_seeded_provision_token(dir.path()).as_deref(),
            Some("legacy-plain")
        );
    }
}
