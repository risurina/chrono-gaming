//! Local audit log with sensitive-field redaction and bounded retention.
//! Mirrors `features/local-state/audit-log.ts`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::store::Store;

const MAX_AUDIT_LOGS: usize = 1000;
const SENSITIVE_KEYS: [&str; 8] = [
    "password",
    "token",
    "secret",
    "key",
    "sessionid",
    "customername",
    "profileurl",
    "authorization",
];

#[derive(Serialize, Deserialize, Clone)]
pub struct AuditEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
    pub severity: String,
}

fn key_is_sensitive(key: &str) -> bool {
    let lower = key.to_lowercase();
    SENSITIVE_KEYS.iter().any(|s| lower.contains(s))
}

/// Recursively redact sensitive keys (matches the JS `SENSITIVE_KEY_PATTERN`).
pub fn redact(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(redact).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, v) in map {
                if key_is_sensitive(k) {
                    out.insert(k.clone(), Value::String("[REDACTED]".to_string()));
                } else if v.is_object() || v.is_array() {
                    out.insert(k.clone(), redact(v));
                } else {
                    out.insert(k.clone(), v.clone());
                }
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
}

/// Append an audit event. `id_suffix` and `timestamp` are injected by the caller
/// (Rust has no ambient wall clock in this layer's tests) — in production they
/// come from the command layer.
pub fn log_event(
    store: &Store,
    id: String,
    event_type: &str,
    timestamp: String,
    payload: Option<Value>,
    severity: &str,
) {
    let event = AuditEvent {
        id,
        event_type: event_type.to_string(),
        timestamp,
        payload: payload.as_ref().map(redact),
        severity: severity.to_string(),
    };

    // Atomic under one lock hold (Store::mutate) — a separate get()-then-set()
    // would lose an event logged by a concurrent caller in between.
    store.mutate("audit_logs", |current| {
        let mut logs: Vec<AuditEvent> = current
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        logs.insert(0, event.clone());
        logs.truncate(MAX_AUDIT_LOGS);
        serde_json::to_value(&logs).unwrap_or(Value::Array(vec![]))
    });
}

pub fn get_logs(store: &Store) -> Vec<AuditEvent> {
    store
        .get("audit_logs")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn redacts_sensitive_keys_recursively() {
        let input = json!({
            "token": "abc",
            "nested": { "customerName": "Jane", "ok": 1 },
            "list": [{ "authorization": "Bearer x" }],
            "keep": "value"
        });
        let out = redact(&input);
        assert_eq!(out["token"], json!("[REDACTED]"));
        assert_eq!(out["nested"]["customerName"], json!("[REDACTED]"));
        assert_eq!(out["nested"]["ok"], json!(1));
        assert_eq!(out["list"][0]["authorization"], json!("[REDACTED]"));
        assert_eq!(out["keep"], json!("value"));
    }
}
