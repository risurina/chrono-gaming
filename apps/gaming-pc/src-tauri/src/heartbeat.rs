//! Background heartbeat daemon, porting `features/api/heartbeat-manager.ts`.
//! Runs every 30s: sends a heartbeat, then reconciles local state with the
//! server response — reservation transitions, server-driven session UNLOCK,
//! reconciliation LOCK, server clock-drift SAFE_LOCK, and draining/executing
//! pending commands.
//!
//! Local-clock-jump detection across ticks and a bounded offline security-event
//! queue with `/sync-events` replay are ported here (see `OFFLINE_QUEUE_KEY`).

use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::app_state::AppState;
use crate::commands::system::run_server_command;
use crate::{executor, kiosk};

const HEARTBEAT_INTERVAL_SECS: u64 = 30;
const MAX_CLOCK_DRIFT_MS: i64 = 60_000;
/// Divergence between wall-clock and monotonic elapsed across two ticks beyond
/// which we treat the wall clock as having jumped (local tamper / NTP step).
const LOCAL_CLOCK_JUMP_MS: i64 = 10_000;
/// Store key holding the bounded offline security-event queue (JSON array).
const OFFLINE_QUEUE_KEY: &str = "offline_events";
/// Upper bound on queued offline events; oldest are dropped past this.
const OFFLINE_QUEUE_LIMIT: usize = 100;

/// True when wall-clock elapsed diverges from monotonic elapsed by more than
/// `threshold` — i.e. the system clock was stepped between ticks. Pure for tests.
fn clock_jump_exceeds(mono_delta_ms: i64, wall_delta_ms: i64, threshold: i64) -> bool {
    (wall_delta_ms - mono_delta_ms).abs() > threshold
}

/// Append `event` to the bounded offline queue, dropping the oldest when full.
/// Atomic under one lock hold (`Store::mutate`) — a separate `get()` then
/// `set()` would lose an event pushed by a concurrent caller in between.
fn enqueue_offline_event(store: &crate::store::Store, event: Value) {
    store.mutate(OFFLINE_QUEUE_KEY, |current| {
        let mut queue: Vec<Value> = current
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        queue.push(event.clone());
        if queue.len() > OFFLINE_QUEUE_LIMIT {
            let overflow = queue.len() - OFFLINE_QUEUE_LIMIT;
            queue.drain(0..overflow);
            log::warn!("[heartbeat] offline queue full; dropped {overflow} oldest event(s)");
        }
        json!(queue)
    });
}

fn offline_queue_len(store: &crate::store::Store) -> usize {
    store
        .get(OFFLINE_QUEUE_KEY)
        .and_then(|v| serde_json::from_value::<Vec<Value>>(v).ok())
        .map(|q| q.len())
        .unwrap_or(0)
}

/// Replay queued offline events via `/sync-events` on reconnect. Clears the queue
/// only when the server accepts them (server dedupes on `idempotencyKey`).
async fn drain_offline_events(state: &AppState, device_token: &str) {
    let queue: Vec<Value> = match state.store.get(OFFLINE_QUEUE_KEY) {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => return,
    };
    if queue.is_empty() {
        return;
    }
    let headers = [
        ("X-Device-Token", device_token.to_string()),
        ("X-Device-Fingerprint", state.fingerprint.clone()),
    ];
    let body = json!({ "events": queue });
    let res = state
        .http
        .request(reqwest::Method::POST, "/sync-events", Some(&body), &headers)
        .await;
    if res.success {
        state.store.delete(OFFLINE_QUEUE_KEY);
        log::info!("[heartbeat] replayed {} offline event(s)", queue.len());
    }
}

/// Spawn the heartbeat loop (immediate first tick, then every 30s).
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tick(&app).await;
            tokio::time::sleep(Duration::from_secs(HEARTBEAT_INTERVAL_SECS)).await;
        }
    });
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn parse_iso_ms(s: &str) -> Option<i64> {
    // Reuse the tolerant parser via a throwaway; keep it simple: use time crate.
    time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
        .ok()
        .map(|t| (t.unix_timestamp_nanos() / 1_000_000) as i64)
}

/// `mapLockStateToStatus` (heartbeat-manager.ts:340).
fn map_lock_state_to_status(state: &Value) -> String {
    let s = |k: &str| state.get(k).and_then(|v| v.as_str());
    match s("approvalStatus") {
        Some("UNPAIRED") => return "UNPAIRED".into(),
        Some("PENDING_APPROVAL") => return "PENDING_APPROVAL".into(),
        _ => {}
    }
    if state.get("isMaintenance").and_then(|v| v.as_bool()).unwrap_or(false) {
        return "MAINTENANCE".into();
    }
    match s("lockState") {
        Some("UNLOCKED") => "ACTIVE".into(),
        Some("SAFE_LOCKED") => "SAFE_LOCKED".into(),
        Some("AWAY_LOCKED") => "AWAY_LOCKED".into(),
        _ => {
            if state.get("activeReservation").map(|v| !v.is_null()).unwrap_or(false) {
                "RESERVED".into()
            } else {
                "AVAILABLE".into()
            }
        }
    }
}

/// Coalesce data[key] → session[key] → prev activeSessionData[key].
fn pick(data: &Value, session: Option<&Value>, prev: Option<&Value>, key: &str) -> Value {
    let d = data.get(key).cloned().unwrap_or(Value::Null);
    if !d.is_null() {
        return d;
    }
    if let Some(v) = session.and_then(|s| s.get(key)) {
        if !v.is_null() {
            return v.clone();
        }
    }
    prev.and_then(|p| p.get(key)).cloned().unwrap_or(Value::Null)
}

fn apply_internal(app: &AppHandle, state: &AppState, ctype: &str, payload: &Value) {
    if let Some(patch) = executor::state_update_for(ctype, payload, &now_iso()) {
        let merged = state.store.patch_local_client_state(&patch);
        kiosk::broadcast_state(app, &merged);
    }
}

async fn tick(app: &AppHandle) {
    let state_guard = app.state::<AppState>();
    let state = state_guard.inner();
    let Some(device_token) = state.store.get_string("device_token") else {
        return;
    };
    let Some(local) = state.store.get("local_client_state") else {
        return;
    };

    let local_now = now_ms();
    let mono_now = Instant::now();
    let uptime = state.started_at.elapsed().as_secs() as i64;

    // Local clock-jump detection: compare wall-clock vs monotonic elapsed since
    // the last tick. A large divergence means the system clock was stepped
    // (tamper / NTP jump) — SAFE_LOCK and queue a security event for sync.
    {
        let mut sample = state.last_clock_sample.lock().unwrap();
        if let Some((prev_mono, prev_wall)) = *sample {
            let mono_delta = mono_now.duration_since(prev_mono).as_millis() as i64;
            let wall_delta = local_now - prev_wall;
            if clock_jump_exceeds(mono_delta, wall_delta, LOCAL_CLOCK_JUMP_MS) {
                *sample = Some((mono_now, local_now));
                drop(sample);
                let divergence = (wall_delta - mono_delta).abs();
                log::warn!("[heartbeat] local clock jump {divergence}ms → SAFE_LOCK");
                enqueue_offline_event(
                    &state.store,
                    json!({
                        "idempotencyKey": format!("clockjump-{local_now}"),
                        "type": "CLOCK_DRIFT_DETECTED",
                        "occurredAt": now_iso(),
                        "metadata": { "divergenceMs": divergence, "source": "local_clock_jump" },
                    }),
                );
                if local.get("lockState").and_then(|v| v.as_str()) != Some("SAFE_LOCKED") {
                    apply_internal(app, state, "SAFE_LOCK", &json!({ "reason": "local_clock_jump" }));
                }
                return;
            }
        }
        *sample = Some((mono_now, local_now));
    }

    // Build the payload, OMITTING optional fields when absent rather than sending
    // `null` — the server schema accepts string-or-missing, and a null value
    // fails validation (400), which would stop the heartbeat reconciling at all.
    let mut payload_map = serde_json::Map::new();
    payload_map.insert(
        "lockState".into(),
        json!(local.get("lockState").and_then(|v| v.as_str()).unwrap_or("LOCKED")),
    );
    payload_map.insert("runtimeStatus".into(), json!(map_lock_state_to_status(&local)));
    if let Some(v) = local.get("activeSessionId").filter(|v| !v.is_null()) {
        payload_map.insert("activeSessionId".into(), v.clone());
    }
    if let Some(v) = local.get("lastTrustedServerAt").filter(|v| !v.is_null()) {
        payload_map.insert("lastTrustedServerAt".into(), v.clone());
    }
    payload_map.insert("localTime".into(), json!(now_iso()));
    payload_map.insert("uptime".into(), json!(uptime));
    payload_map.insert("queuedEventCount".into(), json!(offline_queue_len(&state.store)));
    let service_health = match crate::commands::system::probe_service_health(state).await {
        Some(true) => "HEALTHY",
        Some(false) => "UNHEALTHY",
        None => "UNKNOWN",
    };
    payload_map.insert("serviceHealth".into(), json!(service_health));
    payload_map.insert("uiHealth".into(), json!("RUNNING"));
    let payload = Value::Object(payload_map);

    let headers = [
        ("X-Device-Token", device_token.clone()),
        ("X-Device-Fingerprint", state.fingerprint.clone()),
    ];
    let started = Instant::now();
    let res = state
        .http
        .request(reqwest::Method::POST, "/heartbeat", Some(&payload), &headers)
        .await;
    let latency_ms = started.elapsed().as_millis() as i64;

    if !res.success {
        return;
    }
    // Reconnected: replay any events queued while offline before reconciling.
    drain_offline_events(state, &device_token).await;
    let Some(data) = res.data else { return };

    // Server clock-drift → SAFE_LOCK (skip if already safe-locked).
    if let Some(server_ms) = data.get("timestamp").and_then(|v| v.as_str()).and_then(parse_iso_ms) {
        if (server_ms - local_now).abs() > MAX_CLOCK_DRIFT_MS {
            if local.get("lockState").and_then(|v| v.as_str()) != Some("SAFE_LOCKED") {
                log::warn!("[heartbeat] server clock drift {}ms → SAFE_LOCK", (server_ms - local_now).abs());
                apply_internal(app, state, "SAFE_LOCK", &json!({ "reason": "server_clock_drift" }));
            }
            return;
        }
    }

    let active_session_id = data.get("activeSessionId").cloned().unwrap_or(Value::Null);
    let has_session = !active_session_id.is_null();
    let session = data.get("activeSession");
    let prev_sd = local.get("activeSessionData");

    let prev_res_id = local.get("activeReservation").and_then(|r| r.get("id")).cloned();
    let next_res_id = data.get("activeReservation").and_then(|r| r.get("id")).cloned();

    // Build the merged persistent state (heartbeat-manager.ts:145-173).
    let mut m = local.as_object().cloned().unwrap_or_default();
    m.insert("lastHeartbeatAt".into(), json!(now_iso()));
    m.insert("lastTrustedServerAt".into(), data.get("timestamp").cloned().unwrap_or(Value::Null));
    m.insert("lastHeartbeatLatencyMs".into(), json!(latency_ms));
    m.insert("activeReservation".into(), data.get("activeReservation").cloned().unwrap_or(Value::Null));
    if let Some(sched) = data.get("scheduledEndAt") {
        m.insert("scheduledEndAt".into(), sched.clone());
    }

    if has_session {
        let total = data.get("totalMinutesRemaining").and_then(|v| v.as_f64());
        let status = if total.map(|t| t < 15.0).unwrap_or(false) { "LOW_TIME" } else { "ACTIVE" };
        let mut sd = serde_json::Map::new();
        let cn = pick(&data, session, prev_sd, "customerName");
        sd.insert("customerName".into(), if cn.is_null() { json!("Customer") } else { cn });
        sd.insert("profileUrl".into(), pick(&data, session, prev_sd, "profileUrl"));
        let started_at = pick(&data, session, prev_sd, "startedAt");
        sd.insert("startedAt".into(), if started_at.is_null() { json!(now_iso()) } else { started_at });
        let bal = pick(&data, session, prev_sd, "remainingBalance");
        sd.insert("remainingBalance".into(), if bal.is_null() { json!("\u{20b1}0.00") } else { bal });
        for k in ["hourlyRate", "creditMinutesRemaining", "walletMinutesRemaining", "totalMinutesRemaining", "sessionCost"] {
            sd.insert(k.into(), pick(&data, session, prev_sd, k));
        }
        m.insert("activeSessionId".into(), active_session_id.clone());
        m.insert("scheduledEndAt".into(), data.get("scheduledEndAt").cloned().unwrap_or(Value::Null));
        m.insert("activeSessionData".into(), Value::Object(sd));
        m.insert("lastKnownStatus".into(), json!(status));
    } else {
        m.insert("activeSessionId".into(), Value::Null);
        m.insert("scheduledEndAt".into(), Value::Null);
        m.insert("activeSessionData".into(), Value::Null);
    }
    let updated = Value::Object(m);
    state.store.set("local_client_state", updated.clone());

    // Reservation transition → drive RESERVED/AVAILABLE (only when no session,
    // and only on change).
    if !has_session && next_res_id != prev_res_id {
        kiosk::broadcast_state(app, &updated);
    }

    // Server-driven session → UNLOCK to ACTIVE (post-boot recovery).
    if has_session {
        let total = data.get("totalMinutesRemaining").and_then(|v| v.as_f64());
        let lks = if total.map(|t| t < 15.0).unwrap_or(false) { "LOW_TIME" } else { "ACTIVE" };
        let unlock_payload = json!({
            "sessionId": active_session_id,
            "scheduledEndAt": data.get("scheduledEndAt").cloned().unwrap_or(Value::Null),
            "customerName": pick(&data, session, prev_sd, "customerName"),
            "profileUrl": pick(&data, session, prev_sd, "profileUrl"),
            "startedAt": pick(&data, session, prev_sd, "startedAt"),
            "remainingBalance": pick(&data, session, prev_sd, "remainingBalance"),
            "hourlyRate": pick(&data, session, prev_sd, "hourlyRate"),
            "creditMinutesRemaining": pick(&data, session, prev_sd, "creditMinutesRemaining"),
            "walletMinutesRemaining": pick(&data, session, prev_sd, "walletMinutesRemaining"),
            "totalMinutesRemaining": pick(&data, session, prev_sd, "totalMinutesRemaining"),
            "sessionCost": pick(&data, session, prev_sd, "sessionCost"),
            "lastKnownStatus": lks,
        });
        apply_internal(app, state, "UNLOCK", &unlock_payload);
    }

    // Reconciliation: local thinks UNLOCKED but server has no session → LOCK.
    if local.get("lockState").and_then(|v| v.as_str()) == Some("UNLOCKED") && !has_session {
        log::warn!("[heartbeat] reconciliation: server has no session → LOCK");
        apply_internal(app, state, "LOCK", &json!({ "reason": "heartbeat_reconciliation" }));
    }

    // Drain pending commands if the server flagged any.
    if data.get("commandsPending").and_then(|v| v.as_i64()).unwrap_or(0) > 0 {
        drain_pending_commands(app, &device_token).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_state_status_mapping() {
        assert_eq!(map_lock_state_to_status(&json!({ "approvalStatus": "UNPAIRED" })), "UNPAIRED");
        assert_eq!(map_lock_state_to_status(&json!({ "isMaintenance": true })), "MAINTENANCE");
        assert_eq!(map_lock_state_to_status(&json!({ "lockState": "UNLOCKED" })), "ACTIVE");
        assert_eq!(map_lock_state_to_status(&json!({ "lockState": "AWAY_LOCKED" })), "AWAY_LOCKED");
        // Locked with a reservation reports RESERVED, else AVAILABLE.
        assert_eq!(
            map_lock_state_to_status(&json!({ "lockState": "LOCKED", "activeReservation": { "id": "r1" } })),
            "RESERVED"
        );
        assert_eq!(map_lock_state_to_status(&json!({ "lockState": "LOCKED" })), "AVAILABLE");
    }

    #[test]
    fn pick_coalesces_data_then_session_then_prev() {
        let data = json!({ "customerName": "FromData" });
        let session = json!({ "customerName": "FromSession", "hourlyRate": 40 });
        let prev = json!({ "hourlyRate": 20, "sessionCost": "₱1.00" });
        assert_eq!(pick(&data, Some(&session), Some(&prev), "customerName"), json!("FromData"));
        // data null → session
        assert_eq!(pick(&data, Some(&session), Some(&prev), "hourlyRate"), json!(40));
        // data + session null → prev
        assert_eq!(pick(&data, Some(&session), Some(&prev), "sessionCost"), json!("₱1.00"));
        // none → null
        assert_eq!(pick(&data, Some(&session), Some(&prev), "missing"), Value::Null);
    }

    #[test]
    fn parse_iso_ms_parses_rfc3339() {
        assert_eq!(parse_iso_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso_ms("2000-01-01T00:00:00Z"), Some(946_684_800_000));
    }

    #[test]
    fn clock_jump_detected_only_on_large_divergence() {
        // Normal ~30s tick: wall and monotonic advance together → no jump.
        assert!(!clock_jump_exceeds(30_000, 30_100, LOCAL_CLOCK_JUMP_MS));
        // Wall clock stepped forward 1h while only 30s of monotonic elapsed.
        assert!(clock_jump_exceeds(30_000, 30_000 + 3_600_000, LOCAL_CLOCK_JUMP_MS));
        // Wall clock stepped backward.
        assert!(clock_jump_exceeds(30_000, -5_000, LOCAL_CLOCK_JUMP_MS));
        // Small jitter under threshold is tolerated.
        assert!(!clock_jump_exceeds(30_000, 39_000, LOCAL_CLOCK_JUMP_MS));
    }

    #[test]
    fn replayed_command_acked_as_successful_noop() {
        // A replay-rejected redelivery already executed once — never FAILED.
        assert_eq!(
            ack_result_for(false, Some(crate::commands::system::REPLAY_ERROR.into())),
            (true, None)
        );
        // Real failures and successes pass through unchanged.
        assert_eq!(
            ack_result_for(false, Some("boom".into())),
            (false, Some("boom".into()))
        );
        assert_eq!(ack_result_for(true, None), (true, None));
    }

    #[test]
    fn offline_queue_enqueues_and_bounds() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::store::Store::open(dir.path());
        assert_eq!(offline_queue_len(&store), 0);
        for i in 0..(OFFLINE_QUEUE_LIMIT + 5) {
            enqueue_offline_event(&store, json!({ "idempotencyKey": format!("k{i}"), "type": "T" }));
        }
        // Bounded at the cap; oldest dropped.
        assert_eq!(offline_queue_len(&store), OFFLINE_QUEUE_LIMIT);
        let queue: Vec<Value> =
            serde_json::from_value(store.get(OFFLINE_QUEUE_KEY).unwrap()).unwrap();
        assert_eq!(queue.first().unwrap()["idempotencyKey"], json!("k5"));
    }
}

/// Map a command execution result to the (success, error) pair to ACK.
/// A replay-rejected redelivery already executed once — ACK it as a
/// successful no-op instead of marking the executed command FAILED.
pub(crate) fn ack_result_for(success: bool, error: Option<String>) -> (bool, Option<String>) {
    if !success && error.as_deref() == Some(crate::commands::system::REPLAY_ERROR) {
        return (true, None);
    }
    (success, error)
}

async fn drain_pending_commands(app: &AppHandle, device_token: &str) {
    let state_guard = app.state::<AppState>();
    let state = state_guard.inner();
    let headers = [
        ("X-Device-Token", device_token.to_string()),
        ("X-Device-Fingerprint", state.fingerprint.clone()),
    ];
    let res = state.http.get_status("/commands/pending", &headers).await;
    if !res.success {
        return;
    }
    let Some(Value::Array(commands)) = res.data else { return };
    for command in commands {
        let (raw_success, raw_error) = run_server_command(app, state, &command);
        let (success, error) = ack_result_for(raw_success, raw_error);
        let command_id = command.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let result = json!({
            "success": success,
            "error": error,
            "timestamp": now_iso(),
        });
        let path = format!("/commands/{command_id}/ack");
        let ack_res = state
            .http
            .request(reqwest::Method::POST, &path, Some(&result), &headers)
            .await;
        if !ack_res.success {
            log::warn!(
                "[heartbeat] failed to ACK command {command_id}: {}",
                ack_res.error.as_deref().unwrap_or("unknown error")
            );
        }
    }
}
