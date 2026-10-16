//! Location + retrieval of the station control key. Phase 0b used a plaintext
//! file (`control.key`); Phase 4 layers DPAPI-at-rest protection on top so the
//! on-disk secret is machine-scope encrypted (`CRYPTPROTECT_LOCAL_MACHINE`).
//!
//! On disk the secret is stored as hex-encoded DPAPI ciphertext. On non-Windows
//! hosts (dev on macOS) `protect`/`unprotect` are identity functions so the
//! hex round-trip still works end to end.
//!
//! `seal_key_path()` for the sealed-state key lives in `state.rs`; it is not
//! moved here.

use std::path::PathBuf;

pub const DEFAULT_SERVICE_URL: &str = "http://127.0.0.1:3202";

pub fn service_url() -> String {
    std::env::var("CHRONO_SERVICE_URL").unwrap_or_else(|_| DEFAULT_SERVICE_URL.to_string())
}

/// Base directory holding station control state + key.
///
/// This used to be gated by a `CHRONO_ENV`/`NODE_ENV` "is production" check,
/// but that is unreliable for exactly the case that matters most: a Windows
/// service process's environment is inherited from the SCM's own environment
/// block at boot, so a machine env var set by `install-service.ps1`
/// immediately before `sc.exe start` is *not* visible to the freshly started
/// service until the next reboot. On that first start the guard would have
/// silently fallen back to `cwd/.chrono` (cwd defaults to `C:\Windows\System32`
/// for a service with no explicit working directory) — bypassing the ACL
/// hardening `install-service.ps1` just applied to `%ProgramData%\Chrono` and
/// letting a standard user read/write the control key.
///
/// So this is now unconditional per-target: `%ProgramData%\Chrono` on
/// Windows (app dev and guard prod resolve the same path — no divergence is
/// possible), `.chrono` under the cwd on non-Windows dev hosts. An explicit
/// `CHRONO_CONTROL_DIR` override remains available for tests.
pub fn base_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("CHRONO_CONTROL_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(windows)]
    {
        PathBuf::from(std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".into()))
            .join("Chrono")
    }
    #[cfg(not(windows))]
    {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".chrono")
    }
}

/// Location of the station control key file.
pub fn control_key_path() -> PathBuf {
    base_dir().join("control.key")
}

/// Location of the operator-recovery-PIN hash file. Lives in the same ACL'd
/// directory as `control.key`/`seal.key` (SYSTEM + Administrators only), so the
/// non-admin kiosk user cannot read it. Unlike the control/seal keys this holds
/// a salted PBKDF2 record (`salt$iterations$hash`), not a DPAPI-sealed secret —
/// the ACL is the confidentiality boundary and the KDF resists brute force even
/// if the record leaks.
pub fn recovery_hash_path() -> PathBuf {
    base_dir().join("recovery.hash")
}

/// Read the provisioned control key, or `None` when absent/empty.
pub fn read_control_key() -> Option<String> {
    read_secret(&control_key_path())
}

/// Encrypt `plaintext` at rest. On Windows this is DPAPI machine scope
/// (`CryptProtectData` + `CRYPTPROTECT_LOCAL_MACHINE`); elsewhere it is the
/// identity transform so development on non-Windows hosts still round-trips.
#[cfg(windows)]
pub fn protect(plaintext: &[u8]) -> std::io::Result<Vec<u8>> {
    win_dpapi::protect(plaintext)
}

/// See [`protect`]. Identity transform on non-Windows hosts.
#[cfg(not(windows))]
pub fn protect(plaintext: &[u8]) -> std::io::Result<Vec<u8>> {
    Ok(plaintext.to_vec())
}

/// Decrypt a blob produced by [`protect`]. On Windows this is
/// `CryptUnprotectData`; elsewhere it is the identity transform.
#[cfg(windows)]
pub fn unprotect(blob: &[u8]) -> std::io::Result<Vec<u8>> {
    win_dpapi::unprotect(blob)
}

/// See [`unprotect`]. Identity transform on non-Windows hosts.
#[cfg(not(windows))]
pub fn unprotect(blob: &[u8]) -> std::io::Result<Vec<u8>> {
    Ok(blob.to_vec())
}

/// Write `value` to `path` as hex-encoded DPAPI ciphertext, creating parent
/// directories as needed.
pub fn write_secret(path: &PathBuf, value: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let sealed = protect(value.as_bytes())?;
    std::fs::write(path, hex::encode(sealed))
}

/// Read and decrypt a secret written by [`write_secret`]. Returns `None` when
/// the file is absent, empty, malformed hex, undecryptable, or non-UTF8.
pub fn read_secret(path: &PathBuf) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let blob = hex::decode(trimmed).ok()?;
    let plaintext = unprotect(&blob).ok()?;
    let value = String::from_utf8(plaintext).ok()?;
    let value = value.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(windows)]
mod win_dpapi {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_LOCAL_MACHINE, CRYPT_INTEGER_BLOB,
    };

    fn in_blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    /// Copy the DPAPI-owned output buffer into an owned `Vec` and release it
    /// with `LocalFree`.
    unsafe fn take_out_blob(out: &CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let copied = if out.pbData.is_null() {
            Vec::new()
        } else {
            std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec()
        };
        if !out.pbData.is_null() {
            let _ = LocalFree(HLOCAL(out.pbData as *mut core::ffi::c_void));
        }
        copied
    }

    pub fn protect(plaintext: &[u8]) -> std::io::Result<Vec<u8>> {
        let data_in = in_blob(plaintext);
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &data_in,
                PCWSTR::null(),
                None,
                None,
                None,
                CRYPTPROTECT_LOCAL_MACHINE,
                &mut data_out,
            )
            .map_err(std::io::Error::other)?;
            Ok(take_out_blob(&data_out))
        }
    }

    pub fn unprotect(blob: &[u8]) -> std::io::Result<Vec<u8>> {
        let data_in = in_blob(blob);
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &data_in,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_LOCAL_MACHINE,
                &mut data_out,
            )
            .map_err(std::io::Error::other)?;
            Ok(take_out_blob(&data_out))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nested").join("control.key");
        write_secret(&path, "super-secret-value").expect("write");
        assert_eq!(read_secret(&path).as_deref(), Some("super-secret-value"));
    }

    #[test]
    fn missing_file_returns_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("does-not-exist.key");
        assert_eq!(read_secret(&path), None);
    }
}
