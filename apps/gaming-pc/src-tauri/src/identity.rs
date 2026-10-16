//! Persistent hardware-derived device fingerprint.
//!
//! Byte-for-byte parity with `features/local-state/main-store.ts`
//! `getPersistentFingerprint()` so devices paired under the Electron client keep
//! their identity after migrating. The seed strings and the SHA-256-hex output
//! must match exactly per platform.

use serde::Serialize;
use sha2::{Digest, Sha256};

fn sha256_hex(seed: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hex::encode(hasher.finalize())
}

/// Reproduces JS `String.prototype.replace(pattern, "").trim()`.
/// Used by the Windows `wmic` parser and its test; unused on other hosts.
#[cfg_attr(not(windows), allow(dead_code))]
fn strip_and_trim(raw: &str, needle: &str) -> String {
    raw.replace(needle, "").trim().to_string()
}

/// Windows hardware id via `wmic`, matching the Electron implementation exactly.
#[cfg(windows)]
fn hardware_id() -> Option<String> {
    use std::process::Command;
    let uuid_out = Command::new("wmic")
        .args(["csproduct", "get", "uuid"])
        .output()
        .ok()?;
    let bios_out = Command::new("wmic")
        .args(["bios", "get", "serialnumber"])
        .output()
        .ok()?;

    let uuid = strip_and_trim(&String::from_utf8_lossy(&uuid_out.stdout), "UUID");
    let bios = strip_and_trim(
        &String::from_utf8_lossy(&bios_out.stdout),
        "SerialNumber",
    );

    if uuid.len() > 5 && !uuid.contains("00000000-0000-0000-0000-000000000000") {
        Some(format!("win-hw-{uuid}-{bios}"))
    } else {
        None
    }
}

/// macOS hardware id via `ioreg`, matching the Electron implementation.
#[cfg(target_os = "macos")]
fn hardware_id() -> Option<String> {
    use std::process::Command;
    // Electron uses a shell pipe; reproduce via `sh -c` so the trimmed output is
    // identical (the grep'd multi-line block, trimmed).
    let out = Command::new("sh")
        .arg("-c")
        .arg("ioreg -rd1 -c IOPlatformExpertDevice | grep -E '(uuid|serial-number)'")
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
fn hardware_id() -> Option<String> {
    None
}

/// Sorted, pipe-joined non-internal MAC addresses (fallback seed only).
fn mac_addresses() -> String {
    let mut macs: Vec<String> = Vec::new();
    if let Ok(Some(mac)) = mac_address::get_mac_address() {
        let s = mac.to_string();
        if !s.is_empty() && s != "00:00:00:00:00:00" {
            macs.push(s);
        }
    }
    macs.sort();
    macs.join("|")
}

fn cpu_model() -> String {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_default()
}

/// Resolve the persistent fingerprint. Prefers a stable hardware id; falls back
/// to cpu/mac/machine-id when hardware queries fail (parity with the Electron
/// `chrono-mfp-*` fallback seed).
pub fn get_persistent_fingerprint() -> String {
    if let Some(hw) = hardware_id() {
        return sha256_hex(&format!("chrono-pfp-{hw}"));
    }
    let machine_id = machine_uid::get().unwrap_or_default();
    let seed = format!(
        "chrono-mfp-{}-{}-{}",
        cpu_model(),
        mac_addresses(),
        machine_id
    );
    sha256_hex(&seed)
}

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub hostname: String,
    pub platform: String,
    pub arch: String,
    pub fingerprint: String,
}

pub fn get_device_info() -> DeviceInfo {
    DeviceInfo {
        hostname: sysinfo::System::host_name().unwrap_or_default(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        fingerprint: get_persistent_fingerprint(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_hashing_matches_node_sha256() {
        // Reference computed with `printf 'chrono-pfp-win-hw-ABC-XYZ' | shasum -a 256`,
        // which is identical to Node `crypto.createHash('sha256')` output.
        assert_eq!(
            sha256_hex("chrono-pfp-win-hw-ABC-XYZ"),
            "abb6e85d394b84a273f115980e034a577501ccfe8951e3691ca5b87b41230b75"
        );
    }

    #[test]
    fn strip_and_trim_matches_js_replace_trim() {
        // wmic-style output block.
        let raw = "UUID    \r\r\n4C4C4544-0034-1234-8000-ABCDEF012345  \r\r\n\r\r\n";
        assert_eq!(
            strip_and_trim(raw, "UUID"),
            "4C4C4544-0034-1234-8000-ABCDEF012345"
        );
    }

    #[test]
    fn fingerprint_is_stable_and_hex_64() {
        let a = get_persistent_fingerprint();
        let b = get_persistent_fingerprint();
        assert_eq!(a, b, "fingerprint must be stable across calls");
        assert_eq!(a.len(), 64, "sha256 hex is 64 chars");
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
