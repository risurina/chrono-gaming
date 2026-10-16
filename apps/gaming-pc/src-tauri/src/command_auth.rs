//! Server command authentication — HMAC-SHA256 over a canonical field encoding.
//! Byte-for-byte parity with `features/security/command-auth.ts` and
//! `command-schema.ts`; the signing key is `sha256hex(device_token)` and the
//! canonical string is `signedFields.map(stableStringify).join("|")`.

use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

pub const COMMAND_AUTH_VERSION: &str = "v1:hmac-sha256";

pub const COMMAND_SIGNED_FIELDS: [&str; 11] = [
    "version",
    "id",
    "tenantId",
    "branchId",
    "deviceId",
    "pcId",
    "type",
    "payloadJson",
    "issuedAt",
    "expiresAt",
    "nonce",
];

pub const ALLOWED_RENDERER_COMMANDS: [&str; 4] =
    ["LOCK", "SHOW_MESSAGE", "RESTART_CLIENT_UI", "SYNC_CONFIG"];

/// Deterministic JSON encoding with lexicographically sorted object keys,
/// matching the TS `stableStringify`.
pub fn stable_stringify(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            serde_json::to_string(value).unwrap_or_else(|_| "null".to_string())
        }
        Value::Array(items) => {
            let inner: Vec<String> = items.iter().map(stable_stringify).collect();
            format!("[{}]", inner.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let inner: Vec<String> = keys
                .iter()
                .map(|k| {
                    let key_json = serde_json::to_string(k).unwrap_or_default();
                    format!("{}:{}", key_json, stable_stringify(&map[*k]))
                })
                .collect();
            format!("{{{}}}", inner.join(","))
        }
    }
}

pub fn hash_device_token(token: &str) -> String {
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    hex::encode(h.finalize())
}

/// Compute the canonical HMAC signature (hex) for a command object using `key`.
pub fn compute_signature(command: &Value, key: &str) -> String {
    let signed_fields: Vec<String> = command
        .get("signedFields")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_else(|| COMMAND_SIGNED_FIELDS.iter().map(|s| s.to_string()).collect());

    let data = signed_fields
        .iter()
        .map(|field| stable_stringify(command.get(field).unwrap_or(&Value::Null)))
        .collect::<Vec<_>>()
        .join("|");

    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).expect("hmac accepts any key length");
    mac.update(data.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn signatures_match(received: &str, expected: &str) -> bool {
    match (hex::decode(received), hex::decode(expected)) {
        (Ok(a), Ok(b)) if a.len() == b.len() => a.ct_eq(&b).into(),
        _ => false,
    }
}

/// Structural validation, mirroring `validateCommand(command, source)`.
pub fn validate_command(command: &Value, source: &str) -> Result<(), String> {
    if !command.is_object() {
        return Err("Command must be an object".into());
    }
    let s = |k: &str| command.get(k).and_then(|v| v.as_str());
    if s("id").is_none() {
        return Err("Invalid command ID".into());
    }
    if s("type").is_none() {
        return Err("Invalid command type".into());
    }
    if source == "renderer" {
        let t = s("type").unwrap();
        if !ALLOWED_RENDERER_COMMANDS.contains(&t) {
            return Err(format!("Unauthorized command type from renderer: {t}"));
        }
    }
    if source == "server" {
        for (field, msg) in [
            ("version", "Server command must have a signature version"),
            ("tenantId", "Server command must have tenantId"),
            ("branchId", "Server command must have branchId"),
            ("deviceId", "Server command must have deviceId"),
            ("pcId", "Server command must have pcId"),
            ("expiresAt", "Server command must have expiresAt"),
            ("signature", "Server command must have a signature"),
            ("nonce", "Server command must have a nonce"),
            ("issuedAt", "Server command must have issuedAt"),
        ] {
            if s(field).is_none() {
                return Err(msg.into());
            }
        }
        if !command.get("signedFields").map(|v| v.is_array()).unwrap_or(false) {
            return Err("Server command must have signedFields".into());
        }
    }
    if let Some(pj) = command.get("payloadJson") {
        if !pj.is_null() && !pj.is_object() {
            return Err("payloadJson must be an object if provided".into());
        }
    }
    Ok(())
}

/// Cryptographic + envelope verification, mirroring `CommandAuth.verify` minus
/// the replay-set bookkeeping (the caller owns the persistent/in-memory replay
/// maps). `now_ms` is injected for testability.
pub fn verify_command(
    command: &Value,
    local_state: &Value,
    device_token: &str,
    now_ms: i64,
) -> Result<(), String> {
    let s = |k: &str| command.get(k).and_then(|v| v.as_str());

    if s("signature").is_none()
        || s("nonce").is_none()
        || s("issuedAt").is_none()
        || s("expiresAt").is_none()
    {
        return Err("Missing security envelope".into());
    }
    if s("version") != Some(COMMAND_AUTH_VERSION) {
        return Err("Unsupported command signature version".into());
    }

    let signed_fields: Vec<&str> = command
        .get("signedFields")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    if signed_fields.join("|") != COMMAND_SIGNED_FIELDS.join("|") {
        return Err("Unsupported command signed field set".into());
    }

    let issued_at = parse_iso_ms(s("issuedAt").unwrap());
    let expires_at = parse_iso_ms(s("expiresAt").unwrap());
    let (issued_at, expires_at) = match (issued_at, expires_at) {
        (Some(i), Some(e)) => (i, e),
        _ => return Err("Invalid command timestamp".into()),
    };
    if now_ms > expires_at {
        return Err("Command expired".into());
    }
    if issued_at > now_ms + 120_000 {
        return Err("Command clock drift too high (future)".into());
    }

    // Target validation (tenant / pc / branch / device isolation).
    let ls = |k: &str| local_state.get(k).and_then(|v| v.as_str());
    for (field, err) in [
        ("tenantId", "Tenant mismatch"),
        ("pcId", "Target PC mismatch"),
        ("branchId", "Branch mismatch"),
        ("deviceId", "Target device mismatch"),
    ] {
        if let Some(v) = s(field) {
            if !v.is_empty() && ls(field) != Some(v) {
                return Err(err.into());
            }
        }
    }

    if device_token.is_empty() {
        return Err("Device not provisioned".into());
    }
    let signing_key = hash_device_token(device_token);
    let expected = compute_signature(command, &signing_key);
    if !signatures_match(s("signature").unwrap(), &expected) {
        return Err("Invalid cryptographic signature".into());
    }
    Ok(())
}

/// Upper bound on the persisted replay set. Old nonces are evicted oldest-first
/// once the cap is exceeded; command expiry (≤ a few minutes) means an evicted
/// nonce can no longer be replayed anyway.
pub const REPLAY_SET_CAP: usize = 512;

/// Record `nonce` into the bounded, oldest-first replay set `seen`.
/// Returns `true` if the nonce is new (the command may proceed) and `false` if
/// it is a replay of an already-executed command. On accept, entries beyond
/// `cap` are evicted from the front. The caller owns loading/persisting `seen`.
pub fn record_if_new(seen: &mut Vec<String>, nonce: &str, cap: usize) -> bool {
    if seen.iter().any(|n| n == nonce) {
        return false;
    }
    seen.push(nonce.to_string());
    if seen.len() > cap {
        let overflow = seen.len() - cap;
        seen.drain(0..overflow);
    }
    true
}

/// Parse an ISO-8601 / RFC-3339 timestamp to epoch millis without a date crate.
/// Handles the `YYYY-MM-DDTHH:MM:SS(.sss)?(Z|±HH:MM)?` shape the server emits.
fn parse_iso_ms(s: &str) -> Option<i64> {
    let bytes = s.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let min: i64 = s.get(14..16)?.parse().ok()?;
    let sec: i64 = s.get(17..19)?.parse().ok()?;

    let mut millis = 0i64;
    let mut rest = &s[19..];
    if let Some(stripped) = rest.strip_prefix('.') {
        let frac: String = stripped.chars().take_while(|c| c.is_ascii_digit()).collect();
        rest = &rest[1 + frac.len()..];
        let mut f = frac.clone();
        f.truncate(3);
        while f.len() < 3 {
            f.push('0');
        }
        millis = f.parse().unwrap_or(0);
    }

    // Days since Unix epoch (civil calendar algorithm, Howard Hinnant).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;

    let mut epoch_ms = ((days * 24 + hour) * 3600 + min * 60 + sec) * 1000 + millis;

    // Timezone offset.
    if !rest.is_empty() && rest != "Z" {
        let sign = if rest.starts_with('-') { 1 } else { -1 };
        let off = &rest[1..];
        if let Some((h, m)) = off.split_once(':') {
            let oh: i64 = h.parse().ok()?;
            let om: i64 = m.parse().ok()?;
            epoch_ms += sign * (oh * 3600 + om * 60) * 1000;
        }
    }
    Some(epoch_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn stable_stringify_sorts_keys() {
        let v = json!({ "b": 1, "a": { "d": 4, "c": 3 } });
        assert_eq!(stable_stringify(&v), r#"{"a":{"c":3,"d":4},"b":1}"#);
    }

    #[test]
    fn stable_stringify_handles_primitives_and_arrays() {
        assert_eq!(stable_stringify(&json!(null)), "null");
        assert_eq!(stable_stringify(&json!("x")), "\"x\"");
        assert_eq!(stable_stringify(&json!(42)), "42");
        assert_eq!(stable_stringify(&json!([1, "a", null])), r#"[1,"a",null]"#);
    }

    fn signed_command(token: &str) -> Value {
        // Build a command then sign it exactly as the server would.
        let mut cmd = json!({
            "version": COMMAND_AUTH_VERSION,
            "id": "cmd-1",
            "tenantId": "t1",
            "branchId": "b1",
            "deviceId": "d1",
            "pcId": "pc1",
            "type": "LOCK",
            "payloadJson": { "reason": "manual" },
            "issuedAt": "2026-07-04T00:00:00.000Z",
            "expiresAt": "2026-07-04T00:05:00.000Z",
            "nonce": "n1",
            "signedFields": COMMAND_SIGNED_FIELDS,
        });
        let key = hash_device_token(token);
        let sig = compute_signature(&cmd, &key);
        cmd["signature"] = json!(sig);
        cmd
    }

    fn local_state() -> Value {
        json!({ "tenantId": "t1", "branchId": "b1", "deviceId": "d1", "pcId": "pc1" })
    }

    // 2026-07-04T00:02:00Z in epoch ms.
    const NOW: i64 = 1_783_123_320_000;

    #[test]
    fn verify_accepts_valid_signed_command() {
        let cmd = signed_command("device-token-xyz");
        assert!(verify_command(&cmd, &local_state(), "device-token-xyz", NOW).is_ok());
    }

    #[test]
    fn verify_rejects_tampered_signature() {
        let mut cmd = signed_command("device-token-xyz");
        cmd["payloadJson"] = json!({ "reason": "TAMPERED" });
        let err = verify_command(&cmd, &local_state(), "device-token-xyz", NOW).unwrap_err();
        assert_eq!(err, "Invalid cryptographic signature");
    }

    #[test]
    fn verify_rejects_wrong_key() {
        let cmd = signed_command("device-token-xyz");
        let err = verify_command(&cmd, &local_state(), "different-token", NOW).unwrap_err();
        assert_eq!(err, "Invalid cryptographic signature");
    }

    #[test]
    fn verify_rejects_expired() {
        let cmd = signed_command("device-token-xyz");
        let later = NOW + 10 * 60 * 1000;
        assert_eq!(
            verify_command(&cmd, &local_state(), "device-token-xyz", later).unwrap_err(),
            "Command expired"
        );
    }

    #[test]
    fn verify_rejects_pc_mismatch() {
        let cmd = signed_command("device-token-xyz");
        let mut ls = local_state();
        ls["pcId"] = json!("other-pc");
        assert_eq!(
            verify_command(&cmd, &ls, "device-token-xyz", NOW).unwrap_err(),
            "Target PC mismatch"
        );
    }

    #[test]
    fn parse_iso_ms_matches_known_epoch() {
        assert_eq!(parse_iso_ms("2026-07-04T00:00:00.000Z"), Some(1_783_123_200_000));
        assert_eq!(parse_iso_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso_ms("2000-01-01T00:00:00Z"), Some(946_684_800_000));
    }

    #[test]
    fn record_if_new_accepts_once_then_rejects_replay() {
        let mut seen: Vec<String> = Vec::new();
        assert!(record_if_new(&mut seen, "n1", 512));
        assert!(!record_if_new(&mut seen, "n1", 512)); // replay
        assert!(record_if_new(&mut seen, "n2", 512)); // distinct nonce still accepted
    }

    #[test]
    fn record_if_new_survives_reload() {
        let mut seen: Vec<String> = Vec::new();
        assert!(record_if_new(&mut seen, "n1", 512));
        // Simulate restart: rebuild the set from persisted contents.
        let mut reloaded = seen.clone();
        assert!(!record_if_new(&mut reloaded, "n1", 512));
    }

    #[test]
    fn record_if_new_evicts_oldest_beyond_cap() {
        let mut seen: Vec<String> = Vec::new();
        for i in 0..5 {
            assert!(record_if_new(&mut seen, &format!("n{i}"), 3));
        }
        assert_eq!(seen.len(), 3);
        // Oldest ("n0"/"n1") evicted; a fresh nonce is still accepted.
        assert!(!seen.iter().any(|n| n == "n0"));
        assert!(record_if_new(&mut seen, "n-fresh", 3));
    }

    #[test]
    fn validate_command_renderer_allowlist() {
        assert!(validate_command(&json!({"id":"x","type":"LOCK"}), "renderer").is_ok());
        assert!(validate_command(&json!({"id":"x","type":"SHUTDOWN"}), "renderer").is_err());
    }
}
