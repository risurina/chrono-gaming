//! Canonical request signing/verification for the station control channel,
//! shared by the Tauri client and the guard service.

use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq)]
pub struct SignedHeaders {
    pub timestamp: String,
    pub nonce: String,
    pub signature: String,
}

/// Build the canonical string that both signer and verifier HMAC over.
fn canonical(method: &str, request_path: &str, timestamp: &str, nonce: &str, body: &str) -> String {
    format!("{method}:{request_path}:{timestamp}:{nonce}:{body}")
}

/// HMAC-SHA256 of `message` under `secret`, hex-encoded. `None` for an empty
/// secret. Shared by the control-channel signer and the sealed-state module.
pub fn hmac_hex(secret: &str, message: &str) -> Option<String> {
    if secret.is_empty() {
        return None;
    }
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(message.as_bytes());
    Some(hex::encode(mac.finalize().into_bytes()))
}

/// Sign a control-channel request. Returns `None` when no key is provisioned.
pub fn sign_request(
    method: &str,
    request_path: &str,
    body: &str,
    secret: &str,
    timestamp: &str,
    nonce: &str,
) -> Option<SignedHeaders> {
    if secret.is_empty() {
        return None;
    }
    let signature = hmac_hex(secret, &canonical(method, request_path, timestamp, nonce, body))?;
    Some(SignedHeaders {
        timestamp: timestamp.to_string(),
        nonce: nonce.to_string(),
        signature,
    })
}

/// Constant-time verification of a received signature. The guard service uses
/// this to authenticate inbound requests.
pub fn verify_request(
    method: &str,
    request_path: &str,
    body: &str,
    secret: &str,
    timestamp: &str,
    nonce: &str,
    received_signature_hex: &str,
) -> bool {
    if secret.is_empty() {
        return false;
    }
    let Some(expected) = hmac_hex(secret, &canonical(method, request_path, timestamp, nonce, body))
    else {
        return false;
    };
    constant_time_eq_hex(&expected, received_signature_hex)
}

/// Compare two hex strings in constant time.
pub fn constant_time_eq_hex(a_hex: &str, b_hex: &str) -> bool {
    let (Ok(a), Ok(b)) = (hex::decode(a_hex), hex::decode(b_hex)) else {
        return false;
    };
    if a.len() != b.len() {
        return false;
    }
    let mut diff: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_signature_matches_reference() {
        // Reference HMAC-SHA256 hex of `GET:/health:1700000000000:abcdef:`
        // keyed with `test-secret`.
        let signed = sign_request("GET", "/health", "", "test-secret", "1700000000000", "abcdef")
            .unwrap();
        assert_eq!(
            signed.signature,
            "1dcb1dcfaf02e3287efe14dc515f2fce635e8308ad37d500880b116e551dc03b"
        );
    }

    #[test]
    fn no_secret_returns_none() {
        assert!(sign_request("GET", "/health", "", "", "1", "n").is_none());
    }

    #[test]
    fn verify_accepts_a_signature_it_produced() {
        let s = sign_request("POST", "/ping", "{\"pid\":1}", "k", "1", "n").unwrap();
        assert!(verify_request("POST", "/ping", "{\"pid\":1}", "k", "1", "n", &s.signature));
    }

    #[test]
    fn verify_rejects_tampered_signature_and_body() {
        let s = sign_request("POST", "/ping", "{\"pid\":1}", "k", "1", "n").unwrap();
        // tampered body
        assert!(!verify_request("POST", "/ping", "{\"pid\":2}", "k", "1", "n", &s.signature));
        // tampered signature
        assert!(!verify_request("POST", "/ping", "{\"pid\":1}", "k", "1", "n", "deadbeef"));
        // empty secret
        assert!(!verify_request("POST", "/ping", "{\"pid\":1}", "", "1", "n", &s.signature));
    }
}
