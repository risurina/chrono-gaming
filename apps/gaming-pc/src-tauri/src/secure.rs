//! At-rest encryption for secret store keys, mirroring Electron `safeStorage`.
//!
//! Electron's `safeStorage` uses OS-level encryption when available (DPAPI on
//! Windows) and stores the ciphertext base64-encoded; when unavailable (typical
//! in dev), it stores plaintext. We reproduce that behavior so an existing
//! `chrono-pc-client.json` written by the Electron client can be decrypted, and
//! so newly written secrets stay encrypted at rest on Windows.

/// Returns true when OS-level encryption is available (Windows only, matching
/// `safeStorage.isEncryptionAvailable()` in the deployment environment).
pub fn is_encryption_available() -> bool {
    cfg!(windows)
}

/// Encrypt a UTF-8 string for at-rest storage. On Windows this uses DPAPI and
/// returns base64 ciphertext; elsewhere it returns the plaintext unchanged
/// (mirroring the Electron fallback which stores the raw string).
pub fn encrypt_string(plaintext: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        use base64::Engine;
        let bytes = dpapi_protect(plaintext.as_bytes())?;
        Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
    }
    #[cfg(not(windows))]
    {
        Ok(plaintext.to_string())
    }
}

/// Decrypt a stored value produced by `encrypt_string` (or by Electron
/// `safeStorage`). On Windows, treats the input as base64 DPAPI ciphertext;
/// on failure (or non-Windows) returns the value as-is so plaintext values
/// written in dev migrate seamlessly — same fallback path as `main-store.ts`.
pub fn decrypt_string(stored: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        use base64::Engine;
        match base64::engine::general_purpose::STANDARD.decode(stored) {
            Ok(cipher) => match dpapi_unprotect(&cipher) {
                Ok(plain) => String::from_utf8(plain)
                    .map_err(|e| format!("decrypted bytes not utf8: {e}")),
                // Not DPAPI ciphertext (e.g. legacy plaintext) — return raw.
                Err(_) => Ok(stored.to_string()),
            },
            Err(_) => Ok(stored.to_string()),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(stored.to_string())
    }
}

#[cfg(windows)]
fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        )
        .map_err(|e| format!("CryptProtectData failed: {e}"))?;

        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let owned = slice.to_vec();
        let _ = windows::Win32::Foundation::LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(owned)
    }
}

#[cfg(windows)]
fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::HLOCAL;
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let mut in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(
            &mut in_blob,
            None,
            None,
            None,
            None,
            0,
            &mut out_blob,
        )
        .map_err(|e| format!("CryptUnprotectData failed: {e}"))?;

        let slice = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize);
        let owned = slice.to_vec();
        let _ = windows::Win32::Foundation::LocalFree(HLOCAL(out_blob.pbData as *mut _));
        Ok(owned)
    }
}
