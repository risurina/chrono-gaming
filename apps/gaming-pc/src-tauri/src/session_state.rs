//! Pure state-reconciliation helpers used by the auth/status API commands.
//! Ported from the inline logic in the `main.ts` handlers so it is unit-testable
//! without a live API. All functions take and return `serde_json::Value` objects.

use serde_json::{json, Map, Value};

fn get_str<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str())
}

/// `resolveRuntimeStatusFromState` (main.ts:163).
pub fn resolve_runtime_status(state: &Value) -> String {
    if state.get("isMaintenance").and_then(|v| v.as_bool()).unwrap_or(false) {
        return "MAINTENANCE".into();
    }
    match get_str(state, "approvalStatus") {
        Some("PENDING_APPROVAL") => return "PENDING_APPROVAL".into(),
        Some("UNPAIRED") => return "UNPAIRED".into(),
        _ => {}
    }
    let has_session = state.get("activeSessionId").map(|v| !v.is_null()).unwrap_or(false);
    if has_session && get_str(state, "lockState") == Some("UNLOCKED") {
        return "ACTIVE".into();
    }
    if state.get("activeReservation").map(|v| !v.is_null()).unwrap_or(false) {
        return "RESERVED".into();
    }
    if get_str(state, "lockState") == Some("LOCKED") {
        return "AVAILABLE".into();
    }
    get_str(state, "lastKnownStatus").unwrap_or("LOADING").into()
}

/// Prefer `a` when present and non-null, else `b`, else the current value.
fn prefer<'a>(a: &'a Value, b: Option<&'a Value>, current: Option<&'a Value>) -> Value {
    if !a.is_null() {
        return a.clone();
    }
    if let Some(v) = b {
        if !v.is_null() {
            return v.clone();
        }
    }
    current.cloned().unwrap_or(Value::Null)
}

fn build_session_data(data: &Value, session: Option<&Value>, now_iso: &str) -> Value {
    let s = |k: &str| session.and_then(|s| s.get(k));
    let d = |k: &str| data.get(k).cloned().unwrap_or(Value::Null);

    let customer_name = {
        let c = d("customerName");
        if !c.is_null() {
            c
        } else {
            s("customerName").cloned().unwrap_or(json!("Customer"))
        }
    };
    let started_at = {
        let v = prefer(&d("startedAt"), s("startedAt"), None);
        if v.is_null() { json!(now_iso) } else { v }
    };
    let remaining_balance = {
        let v = prefer(&d("remainingBalance"), s("remainingBalance"), None);
        if v.is_null() { json!("\u{20b1}0.00") } else { v }
    };

    let mut m = Map::new();
    m.insert("customerName".into(), customer_name);
    m.insert("profileUrl".into(), prefer(&d("profileUrl"), s("profileUrl"), None));
    m.insert("startedAt".into(), started_at);
    m.insert("remainingBalance".into(), remaining_balance);
    m.insert("hourlyRate".into(), prefer(&d("hourlyRate"), s("hourlyRate"), None));
    m.insert("creditMinutesRemaining".into(), prefer(&d("creditMinutesRemaining"), s("creditMinutesRemaining"), None));
    m.insert("walletMinutesRemaining".into(), prefer(&d("walletMinutesRemaining"), s("walletMinutesRemaining"), None));
    m.insert("totalMinutesRemaining".into(), prefer(&d("totalMinutesRemaining"), s("totalMinutesRemaining"), None));
    m.insert("sessionCost".into(), prefer(&d("sessionCost"), s("sessionCost"), None));
    Value::Object(m)
}

/// Merge an `/auth` response `data` into current local state (main.ts:833-866).
pub fn merge_auth_state(current: &Value, data: &Value, fingerprint: &str, now_iso: &str) -> Value {
    let mut m: Map<String, Value> = current.as_object().cloned().unwrap_or_default();
    let cur = |k: &str| current.get(k).cloned().unwrap_or(Value::Null);
    let d = |k: &str| data.get(k).cloned().unwrap_or(Value::Null);

    m.insert("fingerprintV1".into(), json!(fingerprint));
    m.insert("deviceId".into(), prefer(&d("deviceId"), None, Some(&cur("deviceId"))));
    m.insert("tenantId".into(), prefer(&d("tenantId"), None, Some(&cur("tenantId"))));
    m.insert("branchId".into(), prefer(&d("branchId"), None, Some(&cur("branchId"))));
    m.insert(
        "pcId".into(),
        prefer(&d("pcId"), Some(&d("stationId")), Some(&cur("pcId"))),
    );
    m.insert(
        "stationName".into(),
        prefer(&d("stationName"), Some(&d("name")), Some(&cur("stationName"))),
    );
    m.insert("branchName".into(), prefer(&d("branchName"), None, Some(&cur("branchName"))));
    m.insert("approvalStatus".into(), prefer(&d("status"), None, Some(&cur("approvalStatus"))));

    if !d("activeSessionId").is_null() {
        m.insert("activeSessionId".into(), d("activeSessionId"));
        m.insert("scheduledEndAt".into(), d("scheduledEndAt"));
        m.insert("lockState".into(), json!("UNLOCKED"));
        m.insert("activeSessionData".into(), build_session_data(data, None, now_iso));
    } else if get_str(data, "status") == Some("APPROVED") {
        let lock = if cur("lockState").is_null() { json!("LOCKED") } else { cur("lockState") };
        m.insert("lockState".into(), lock);
    }

    let merged = Value::Object(m);
    let status = resolve_runtime_status(&merged);
    let mut m = merged.as_object().cloned().unwrap();
    m.insert("lastKnownStatus".into(), json!(status));
    Value::Object(m)
}

/// Merge a `/status` response `data` into current local state (main.ts:920-968).
pub fn merge_status_state(current: &Value, data: &Value, fingerprint: &str, now_iso: &str) -> Value {
    let mut m: Map<String, Value> = current.as_object().cloned().unwrap_or_default();
    let cur = |k: &str| current.get(k).cloned().unwrap_or(Value::Null);
    let d = |k: &str| data.get(k).cloned().unwrap_or(Value::Null);

    m.insert("fingerprintV1".into(), json!(fingerprint));
    m.insert("approvalStatus".into(), prefer(&d("status"), None, Some(&cur("approvalStatus"))));
    m.insert("pcId".into(), prefer(&d("pcId"), None, Some(&cur("pcId"))));
    m.insert(
        "stationName".into(),
        prefer(&d("stationName"), Some(&d("name")), Some(&cur("stationName"))),
    );
    m.insert("branchId".into(), prefer(&d("branchId"), None, Some(&cur("branchId"))));
    m.insert("branchName".into(), prefer(&d("branchName"), None, Some(&cur("branchName"))));
    m.insert("uiConfig".into(), prefer(&d("uiConfig"), None, Some(&cur("uiConfig"))));
    m.insert("tenantHeroSlide".into(), prefer(&d("tenantHeroSlide"), None, Some(&cur("tenantHeroSlide"))));
    m.insert("activeReservation".into(), {
        let r = d("activeReservation");
        if r.is_null() { Value::Null } else { r }
    });
    m.insert("specs".into(), prefer(&d("specs"), None, Some(&cur("specs"))));
    m.insert("deviceGroup".into(), prefer(&d("deviceGroup"), None, Some(&cur("deviceGroup"))));
    m.insert("pricingRules".into(), prefer(&d("pricingRules"), None, Some(&cur("pricingRules"))));
    // cleanupPolicy / kioskPolicy use `!== undefined` semantics: presence of the
    // key (even null) overrides current.
    m.insert(
        "cleanupPolicy".into(),
        if data.get("cleanupPolicy").is_some() { d("cleanupPolicy") } else { cur("cleanupPolicy") },
    );
    m.insert(
        "kioskPolicy".into(),
        if data.get("kioskPolicy").is_some() { d("kioskPolicy") } else { cur("kioskPolicy") },
    );

    if !d("activeSessionId").is_null() {
        m.insert("activeSessionId".into(), d("activeSessionId"));
        m.insert("scheduledEndAt".into(), d("scheduledEndAt"));
        m.insert("lockState".into(), json!("UNLOCKED"));
        let session = data.get("activeSession");
        m.insert("activeSessionData".into(), build_session_data(data, session, now_iso));
    } else if !cur("activeSessionId").is_null() {
        m.insert("activeSessionId".into(), Value::Null);
        m.insert("activeSessionData".into(), Value::Null);
        m.insert("scheduledEndAt".into(), Value::Null);
        m.insert("lockState".into(), json!("LOCKED"));
    }

    let merged = Value::Object(m);
    let status = resolve_runtime_status(&merged);
    let mut m = merged.as_object().cloned().unwrap();
    m.insert("lastKnownStatus".into(), json!(status));
    Value::Object(m)
}

/// `resetToUnpairedState` shape (main.ts:173).
pub fn unpaired_state(fingerprint: &str) -> Value {
    json!({
        "deviceId": "",
        "tenantId": "",
        "branchId": "",
        "fingerprintV1": fingerprint,
        "approvalStatus": "UNPAIRED",
        "lockState": "LOCKED",
        "offlineQueue": [],
        "tamperFlags": [],
        "uiConfig": null,
        "lastKnownStatus": "UNPAIRED",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_status_priorities() {
        assert_eq!(resolve_runtime_status(&json!({ "isMaintenance": true })), "MAINTENANCE");
        assert_eq!(resolve_runtime_status(&json!({ "approvalStatus": "UNPAIRED" })), "UNPAIRED");
        assert_eq!(
            resolve_runtime_status(&json!({ "activeSessionId": "s1", "lockState": "UNLOCKED" })),
            "ACTIVE"
        );
        assert_eq!(resolve_runtime_status(&json!({ "lockState": "LOCKED" })), "AVAILABLE");
        assert_eq!(resolve_runtime_status(&json!({})), "LOADING");
    }

    #[test]
    fn auth_merge_reflects_active_session_and_unlocks() {
        let current = json!({ "lockState": "LOCKED", "deviceId": "old" });
        let data = json!({
            "status": "APPROVED",
            "deviceId": "d1",
            "tenantId": "t1",
            "branchId": "b1",
            "stationId": "pc1",
            "activeSessionId": "sess-1",
            "scheduledEndAt": "2026-07-04T01:00:00Z",
            "customerName": "Jane"
        });
        let out = merge_auth_state(&current, &data, "fp123", "2026-07-04T00:00:00Z");
        assert_eq!(out["pcId"], json!("pc1")); // stationId fallback
        assert_eq!(out["lockState"], json!("UNLOCKED"));
        assert_eq!(out["activeSessionData"]["customerName"], json!("Jane"));
        assert_eq!(out["lastKnownStatus"], json!("ACTIVE"));
        assert_eq!(out["fingerprintV1"], json!("fp123"));
    }

    #[test]
    fn status_merge_clears_session_when_server_has_none() {
        let current = json!({
            "activeSessionId": "old-sess",
            "lockState": "UNLOCKED",
            "branchId": "b1"
        });
        let data = json!({ "status": "APPROVED" });
        let out = merge_status_state(&current, &data, "fp", "2026-07-04T00:00:00Z");
        assert_eq!(out["activeSessionId"], Value::Null);
        assert_eq!(out["lockState"], json!("LOCKED"));
        assert_eq!(out["lastKnownStatus"], json!("AVAILABLE"));
    }

    #[test]
    fn status_merge_kiosk_policy_null_override() {
        let current = json!({ "kioskPolicy": { "disableCli": true } });
        // Server explicitly sends null → clears.
        let data = json!({ "status": "APPROVED", "kioskPolicy": null });
        let out = merge_status_state(&current, &data, "fp", "2026-07-04T00:00:00Z");
        assert_eq!(out["kioskPolicy"], Value::Null);
        // Server omits key → keeps current.
        let data2 = json!({ "status": "APPROVED" });
        let out2 = merge_status_state(&current, &data2, "fp", "2026-07-04T00:00:00Z");
        assert_eq!(out2["kioskPolicy"], json!({ "disableCli": true }));
    }
}
