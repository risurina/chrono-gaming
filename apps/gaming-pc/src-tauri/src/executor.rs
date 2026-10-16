//! Command executor, mirroring `features/commands/main-executor.ts`.
//! Split into a pure `state_update_for` (unit-tested) and OS-action dispatch
//! (`run_os_action`, platform `Command` spawns). Lock/session state patches must
//! match the Electron switch arms exactly.

use serde_json::{json, Map, Value};

/// Command types that are pure state transitions (no OS side effect) plus the
/// ones the renderer is allowed to originate.
pub fn is_internal_state_sync(command_id: &str) -> bool {
    command_id.starts_with("hb-")
        || command_id.starts_with("local-auto-lock-")
        || command_id.starts_with("clock-drift-safe-lock-")
}

/// Returns the local-state patch for a command type, or `None` for commands that
/// have no state effect (pure OS actions / renderer-handled). `payload` is the
/// command's `payloadJson`. `now_iso` supplies the UNLOCK `startedAt` default.
pub fn state_update_for(command_type: &str, payload: &Value, now_iso: &str) -> Option<Value> {
    let p = |k: &str| payload.get(k).cloned().unwrap_or(Value::Null);
    let mut m = Map::new();
    match command_type {
        "LOCK" => {
            m.insert("lockState".into(), json!("LOCKED"));
            m.insert("lastKnownStatus".into(), json!("AVAILABLE"));
            m.insert("activeSessionId".into(), Value::Null);
            m.insert("scheduledEndAt".into(), Value::Null);
            m.insert("activeSessionData".into(), Value::Null);
        }
        "SAFE_LOCK" => {
            m.insert("lockState".into(), json!("SAFE_LOCKED"));
            m.insert("lastKnownStatus".into(), json!("ERROR_SAFE_LOCKED"));
            m.insert("activeSessionId".into(), Value::Null);
            m.insert("scheduledEndAt".into(), Value::Null);
            m.insert("activeSessionData".into(), Value::Null);
        }
        "UNLOCK" => {
            m.insert("lockState".into(), json!("UNLOCKED"));
            let lks = p("lastKnownStatus");
            m.insert(
                "lastKnownStatus".into(),
                if lks.is_null() { json!("ACTIVE") } else { lks },
            );
            m.insert("activeSessionId".into(), p("sessionId"));
            m.insert("scheduledEndAt".into(), p("scheduledEndAt"));

            let started = p("startedAt");
            let balance = p("remainingBalance");
            let customer = p("customerName");
            let mut sd = Map::new();
            sd.insert(
                "customerName".into(),
                if customer.is_null() { json!("Customer") } else { customer },
            );
            sd.insert("profileUrl".into(), p("profileUrl"));
            sd.insert(
                "startedAt".into(),
                if started.is_null() { json!(now_iso) } else { started },
            );
            sd.insert(
                "remainingBalance".into(),
                if balance.is_null() { json!("\u{20b1}0.00") } else { balance },
            );
            sd.insert("hourlyRate".into(), p("hourlyRate"));
            sd.insert("creditMinutesRemaining".into(), p("creditMinutesRemaining"));
            sd.insert("walletMinutesRemaining".into(), p("walletMinutesRemaining"));
            sd.insert("totalMinutesRemaining".into(), p("totalMinutesRemaining"));
            sd.insert("sessionCost".into(), p("sessionCost"));
            m.insert("activeSessionData".into(), Value::Object(sd));
        }
        "PLAYER_AWAY_LOCK" => {
            m.insert("lockState".into(), json!("AWAY_LOCKED"));
            m.insert("lastKnownStatus".into(), json!("AWAY_LOCKED"));
        }
        "PLAYER_AWAY_UNLOCK" => {
            m.insert("lockState".into(), json!("UNLOCKED"));
            m.insert("lastKnownStatus".into(), json!("ACTIVE"));
        }
        "END_SESSION" => {
            m.insert("lockState".into(), json!("LOCKED"));
            m.insert("activeSessionId".into(), Value::Null);
            m.insert("scheduledEndAt".into(), Value::Null);
            m.insert("activeSessionData".into(), Value::Null);
        }
        "MAINTENANCE_ON" => {
            m.insert("isMaintenance".into(), json!(true));
        }
        "MAINTENANCE_OFF" => {
            m.insert("isMaintenance".into(), json!(false));
        }
        _ => return None,
    }
    Some(Value::Object(m))
}

/// OS-level actions dispatched by command type. Returns Ok(true) when an action
/// was run, Ok(false) when the type has no OS action here. Platform commands
/// mirror the Electron `execFile`/`spawn` calls.
pub fn run_os_action(command_type: &str, payload: &Value) -> Result<bool, String> {
    use std::process::Command;
    let spawn = |program: &str, args: &[&str]| -> Result<(), String> {
        Command::new(program)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("failed to spawn {program}: {e}"))
    };

    match command_type {
        "RESTART" => {
            #[cfg(windows)]
            spawn("shutdown", &["/r", "/t", "0"])?;
            #[cfg(not(windows))]
            spawn("reboot", &[])?;
            Ok(true)
        }
        "SHUTDOWN" => {
            #[cfg(windows)]
            spawn("shutdown", &["/s", "/t", "0"])?;
            #[cfg(target_os = "macos")]
            spawn("shutdown", &["-h", "now"])?;
            #[cfg(all(not(windows), not(target_os = "macos")))]
            spawn("shutdown", &["-h", "now"])?;
            Ok(true)
        }
        "SLEEP" => {
            #[cfg(windows)]
            spawn("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"])?;
            #[cfg(target_os = "macos")]
            spawn("pmset", &["sleepnow"])?;
            #[cfg(all(not(windows), not(target_os = "macos")))]
            spawn("systemctl", &["suspend"])?;
            Ok(true)
        }
        "HIBERNATE" => {
            #[cfg(windows)]
            spawn("rundll32.exe", &["powrprof.dll,SetSuspendState", "1,1,0"])?;
            #[cfg(not(windows))]
            spawn("systemctl", &["hibernate"])?;
            Ok(true)
        }
        "KILL_PROCESS" => {
            if let Some(pid) = payload.get("pid").and_then(|v| v.as_i64()) {
                #[cfg(windows)]
                spawn("taskkill", &["/F", "/PID", &pid.to_string(), "/T"])?;
                #[cfg(not(windows))]
                spawn("kill", &["-9", &pid.to_string()])?;
                return Ok(true);
            }
            if let Some(name) = payload.get("processName").and_then(|v| v.as_str()) {
                let sanitized: String = name
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
                    .collect();
                if !sanitized.is_empty() {
                    #[cfg(windows)]
                    spawn("taskkill", &["/F", "/IM", &sanitized, "/T"])?;
                    #[cfg(not(windows))]
                    spawn("pkill", &["-9", "-f", &sanitized])?;
                    return Ok(true);
                }
            }
            Ok(false)
        }
        "OPEN_URL" => {
            let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("");
            if url.starts_with("http://") || url.starts_with("https://") {
                #[cfg(windows)]
                spawn("cmd", &["/C", "start", "", url])?;
                #[cfg(target_os = "macos")]
                spawn("open", &[url])?;
                #[cfg(all(not(windows), not(target_os = "macos")))]
                spawn("xdg-open", &[url])?;
                return Ok(true);
            }
            Err("Blocked invalid URL open attempt".into())
        }
        // Deprecated / disabled for safety (parity with the Electron guard).
        "RUN_SHELL" => Err("RUN_SHELL is disabled for security reasons.".into()),
        _ => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lock_patch_clears_session() {
        let p = state_update_for("LOCK", &json!({}), "2026-07-04T00:00:00Z").unwrap();
        assert_eq!(p["lockState"], json!("LOCKED"));
        assert_eq!(p["lastKnownStatus"], json!("AVAILABLE"));
        assert_eq!(p["activeSessionId"], Value::Null);
    }

    #[test]
    fn unlock_patch_builds_session_data_with_defaults() {
        let p = state_update_for(
            "UNLOCK",
            &json!({ "sessionId": "s1" }),
            "2026-07-04T00:00:00Z",
        )
        .unwrap();
        assert_eq!(p["lockState"], json!("UNLOCKED"));
        assert_eq!(p["lastKnownStatus"], json!("ACTIVE"));
        assert_eq!(p["activeSessionId"], json!("s1"));
        assert_eq!(p["activeSessionData"]["customerName"], json!("Customer"));
        assert_eq!(p["activeSessionData"]["startedAt"], json!("2026-07-04T00:00:00Z"));
    }

    #[test]
    fn maintenance_toggles() {
        assert_eq!(state_update_for("MAINTENANCE_ON", &json!({}), "").unwrap()["isMaintenance"], json!(true));
        assert_eq!(state_update_for("MAINTENANCE_OFF", &json!({}), "").unwrap()["isMaintenance"], json!(false));
    }

    #[test]
    fn os_only_commands_have_no_state_patch() {
        assert!(state_update_for("SHUTDOWN", &json!({}), "").is_none());
        assert!(state_update_for("SCREENSHOT", &json!({}), "").is_none());
    }

    #[test]
    fn run_shell_is_disabled() {
        assert_eq!(
            run_os_action("RUN_SHELL", &json!({})).unwrap_err(),
            "RUN_SHELL is disabled for security reasons."
        );
    }

    #[test]
    fn open_url_rejects_non_http() {
        assert!(run_os_action("OPEN_URL", &json!({ "url": "file:///etc/passwd" })).is_err());
    }

    #[test]
    fn unknown_os_action_is_noop() {
        assert_eq!(run_os_action("MAINTENANCE_ON", &json!({})).unwrap(), false);
    }
}
