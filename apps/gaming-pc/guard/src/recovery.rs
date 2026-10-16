//! Operator-recovery-PIN verification, owned by the LocalSystem guard.
//!
//! The PIN is never known to the non-admin kiosk UI: the UI forwards the
//! entered PIN to the guard over the authenticated control channel and the
//! guard answers only `valid: true|false` (see `control::recovery_verify`).
//!
//! The stored record is a salted, slow PBKDF2-HMAC-SHA256 hash kept in the
//! ACL'd secret directory (`recovery.hash`), so a short numeric PIN is still
//! expensive to brute-force even if the record were to leak. Records use the
//! format `salt_hex$iterations$hash_hex`; the derived key is SHA-256-sized.
//! Comparison is constant-time and neither the PIN nor the hash is ever logged.

use rand::RngCore;
use subtle::ConstantTimeEq;

/// Per-install iteration count. High enough that guessing a short numeric PIN
/// is costly; both `verify` and `hash_pin` must agree on it.
const PBKDF2_ITERATIONS: u32 = 600_000;
/// Derived-key length in bytes (SHA-256 output).
const DERIVED_LEN: usize = 32;
/// Random salt length in bytes.
const SALT_LEN: usize = 16;

/// Read the configured recovery record and verify `pin` against it. Returns
/// `false` when no record is configured, the file is unreadable, or the PIN is
/// wrong. Never logs the PIN or the record.
pub fn verify_configured_pin(pin: &str) -> bool {
    match read_stored_record() {
        Some(record) => verify(pin, &record),
        None => false,
    }
}

/// Read the salted PBKDF2 record from the ACL'd `recovery.hash` file.
fn read_stored_record() -> Option<String> {
    let raw = std::fs::read_to_string(chrono_control::recovery_hash_path()).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Verify `pin` against a `salt_hex$iterations$hash_hex` record, constant-time.
/// Any malformed field resolves to `false`.
pub fn verify(pin: &str, record: &str) -> bool {
    let mut parts = record.splitn(3, '$');
    let (Some(salt_hex), Some(iter_str), Some(hash_hex)) =
        (parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    let (Ok(salt), Ok(iterations), Ok(expected)) = (
        hex::decode(salt_hex),
        iter_str.parse::<u32>(),
        hex::decode(hash_hex),
    ) else {
        return false;
    };
    if iterations == 0 || expected.len() != DERIVED_LEN {
        return false;
    }
    let mut derived = [0u8; DERIVED_LEN];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pin.as_bytes(), &salt, iterations, &mut derived);
    bool::from(derived.ct_eq(&expected))
}

/// Derive a storable record for `pin` using a fresh random salt and the
/// configured iteration count. Used by the install-time `hash-pin` subcommand
/// and the KDF round-trip tests. Never stores or returns the plaintext PIN.
pub fn hash_pin(pin: &str) -> String {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    format_record(pin, &salt, PBKDF2_ITERATIONS)
}

fn format_record(pin: &str, salt: &[u8], iterations: u32) -> String {
    let mut derived = [0u8; DERIVED_LEN];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pin.as_bytes(), salt, iterations, &mut derived);
    format!("{}${}${}", hex::encode(salt), iterations, hex::encode(derived))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_pin_verifies() {
        let record = hash_pin("12345678");
        assert!(verify("12345678", &record));
    }

    #[test]
    fn wrong_pin_rejected() {
        let record = hash_pin("12345678");
        assert!(!verify("00000000", &record));
    }

    #[test]
    fn record_is_salted_unique_per_call() {
        // Same PIN, different salt ⇒ different stored record.
        assert_ne!(hash_pin("12345678"), hash_pin("12345678"));
    }

    #[test]
    fn record_shape_is_salt_iters_hash() {
        let record = hash_pin("12345678");
        let parts: Vec<&str> = record.split('$').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].len(), SALT_LEN * 2); // salt hex
        assert_eq!(parts[1], PBKDF2_ITERATIONS.to_string()); // iterations
        assert_eq!(parts[2].len(), DERIVED_LEN * 2); // hash hex
    }

    #[test]
    fn empty_record_never_verifies() {
        assert!(!verify("12345678", ""));
    }

    #[test]
    fn malformed_record_rejected() {
        assert!(!verify("12345678", "not-a-record"));
        assert!(!verify("12345678", "deadbeef$notanumber$deadbeef"));
        assert!(!verify("12345678", "zz$600000$zz")); // non-hex salt/hash
    }

    #[test]
    fn zero_iterations_rejected() {
        // A record claiming 0 rounds must never verify, regardless of hash.
        let salt = "00112233445566778899aabbccddeeff";
        let record = format!("{salt}$0${}", "00".repeat(DERIVED_LEN));
        assert!(!verify("12345678", &record));
    }
}
