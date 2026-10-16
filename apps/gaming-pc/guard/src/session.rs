//! Launch a process into the active interactive console session, under that
//! session's own user token — the Windows-service equivalent of "run this on
//! the user's desktop", not "run this as SYSTEM in session 0".
//!
//! The guard runs as LocalSystem in session 0, which has no desktop a human
//! ever sees. A plain `Command::spawn()` from a LocalSystem service launches
//! the child as SYSTEM in session 0 too — it never appears on the kiosk
//! user's screen. This module instead: finds the active console session,
//! duplicates that session's user token into a primary token, builds that
//! user's environment block, and calls `CreateProcessAsUserW` so the process
//! is created with an identity and desktop the user can actually see.
//!
//! Windows-only; not exercised by `cargo check`/`cargo test` on non-Windows
//! hosts. Needs verification on a real Windows box (see the plan's Windows
//! validation checklist).

#![cfg(windows)]

use std::ffi::c_void;
use std::path::Path;

use windows::core::{Error as WinError, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Security::{
    DuplicateTokenEx, SecurityImpersonation, TokenPrimary, TOKEN_ALL_ACCESS,
};
use windows::Win32::System::Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock};
use windows::Win32::System::RemoteDesktop::{WTSGetActiveConsoleSessionId, WTSQueryUserToken};
use windows::Win32::System::Threading::{
    CreateProcessAsUserW, CREATE_UNICODE_ENVIRONMENT, NORMAL_PRIORITY_CLASS, PROCESS_INFORMATION,
    STARTUPINFOW,
};

fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Launch `exe_path` (no arguments) in the currently active console session.
/// Returns the new process's PID on success.
///
/// Rejects relative paths and paths that don't exist on disk up front — this
/// is defense-in-depth, not the primary trust boundary (only an admin-held
/// machine env var feeds `exe_path` in practice).
pub fn launch_in_active_session(exe_path: &str) -> Result<u32, String> {
    let path = Path::new(exe_path);
    if !path.is_absolute() {
        return Err(format!("refusing to launch non-absolute path: {exe_path}"));
    }
    if !path.exists() {
        return Err(format!("UI executable does not exist: {exe_path}"));
    }

    unsafe {
        let session_id = WTSGetActiveConsoleSessionId();
        if session_id == 0xFFFF_FFFF {
            return Err("no active console session (station may be at the logon screen \
                         with fast user switching, or locked with no session)"
                .to_string());
        }

        let mut user_token = HANDLE::default();
        WTSQueryUserToken(session_id, &mut user_token)
            .map_err(|e| format!("WTSQueryUserToken failed: {e}"))?;
        // Ensure the query token is closed even if a later step errors.
        let _user_token_guard = HandleGuard(user_token);

        let mut primary_token = HANDLE::default();
        DuplicateTokenEx(
            user_token,
            TOKEN_ALL_ACCESS,
            None,
            SecurityImpersonation,
            TokenPrimary,
            &mut primary_token,
        )
        .map_err(|e| format!("DuplicateTokenEx failed: {e}"))?;
        let _primary_token_guard = HandleGuard(primary_token);

        let mut env_block: *mut c_void = std::ptr::null_mut();
        // Best-effort: fall back to CreateProcessAsUserW inheriting no custom
        // env block (None) if this fails, rather than aborting the relaunch.
        let have_env_block =
            CreateEnvironmentBlock(&mut env_block, primary_token, false).is_ok();

        let mut cmdline = to_wide_null(&format!("\"{exe_path}\""));
        let mut desktop = to_wide_null("winsta0\\default");

        let mut startup_info = STARTUPINFOW {
            cb: std::mem::size_of::<STARTUPINFOW>() as u32,
            lpDesktop: PWSTR(desktop.as_mut_ptr()),
            ..Default::default()
        };
        let mut process_info = PROCESS_INFORMATION::default();

        let creation_flags = NORMAL_PRIORITY_CLASS | CREATE_UNICODE_ENVIRONMENT;
        let result = CreateProcessAsUserW(
            primary_token,
            None,
            PWSTR(cmdline.as_mut_ptr()),
            None,
            None,
            false,
            creation_flags,
            if have_env_block {
                Some(env_block)
            } else {
                None
            },
            None,
            &mut startup_info,
            &mut process_info,
        );

        if have_env_block {
            let _ = DestroyEnvironmentBlock(env_block);
        }

        result.map_err(|e: WinError| format!("CreateProcessAsUserW failed: {e}"))?;

        let pid = process_info.dwProcessId;
        let _ = CloseHandle(process_info.hProcess);
        let _ = CloseHandle(process_info.hThread);
        Ok(pid)
    }
}

/// RAII guard that closes a Windows handle on drop, so an early `?` return
/// still releases tokens acquired earlier in `launch_in_active_session`.
struct HandleGuard(HANDLE);

impl Drop for HandleGuard {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}
