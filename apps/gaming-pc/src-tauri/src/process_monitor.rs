//! Running-process snapshot + change detection, mirroring
//! `features/app-usage/process-monitor.ts`. Uses `sysinfo` instead of `ps-list`.
//! The reporting cadence and HTTP POST are driven by the frontend runtime via a
//! command; this module provides the pure snapshot + diff.

use std::collections::BTreeSet;

/// System/utility process names filtered out to reduce noise (matched as
/// case-insensitive substrings). The client's own binary is excluded
/// dynamically via `self_exe_name()` rather than a hardcoded name, since the
/// Tauri product binary ("Chrono PC Client.exe") differs from the old Electron
/// name; the `chrono` substrings below are a static backstop.
const DENYLIST: [&str; 7] = [
    "system idle",
    "registry",
    "smss.exe",
    "svchost.exe",
    "conhost.exe",
    "chrono pc client",
    "chrono-pc-client",
];

/// Lowercased file name of the currently running executable, used to exclude the
/// client from its own process snapshot regardless of how the binary is named.
fn self_exe_name() -> Option<String> {
    std::env::current_exe()
        .ok()?
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
}

fn is_denied(name: &str, self_name: Option<&str>) -> bool {
    let lower = name.to_lowercase();
    if let Some(self_name) = self_name {
        if !self_name.is_empty() && lower == self_name {
            return true;
        }
    }
    DENYLIST.iter().any(|d| lower.contains(d))
}

/// Current filtered process names.
pub fn snapshot_names() -> BTreeSet<String> {
    use sysinfo::System;
    let self_name = self_exe_name();
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .map(|p| p.name().to_string_lossy().to_string())
        .filter(|n| !is_denied(n, self_name.as_deref()))
        .collect()
}

pub struct ProcessDiff {
    pub launched: Vec<String>,
    pub closed: Vec<String>,
}

/// Diff the current snapshot against the last reported set.
pub fn diff(previous: &BTreeSet<String>, current: &BTreeSet<String>) -> ProcessDiff {
    ProcessDiff {
        launched: current.difference(previous).cloned().collect(),
        closed: previous.difference(current).cloned().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denylist_filters_system_processes() {
        assert!(is_denied("svchost.exe", None));
        assert!(is_denied("System Idle Process", None));
        assert!(!is_denied("chrome.exe", None));
        // Own product binary filtered by static substring…
        assert!(is_denied("Chrono PC Client.exe", None));
        // …and dynamically by the running exe name regardless of naming.
        assert!(is_denied("weird-renamed.exe", Some("weird-renamed.exe")));
        assert!(!is_denied("weird-renamed.exe", Some("something-else.exe")));
    }

    #[test]
    fn diff_detects_launched_and_closed() {
        let prev: BTreeSet<String> = ["a", "b"].iter().map(|s| s.to_string()).collect();
        let cur: BTreeSet<String> = ["b", "c"].iter().map(|s| s.to_string()).collect();
        let d = diff(&prev, &cur);
        assert_eq!(d.launched, vec!["c".to_string()]);
        assert_eq!(d.closed, vec!["a".to_string()]);
    }

    #[test]
    fn snapshot_returns_some_processes() {
        // The dev host always has processes; just assert the call works.
        let names = snapshot_names();
        assert!(!names.is_empty());
    }
}
