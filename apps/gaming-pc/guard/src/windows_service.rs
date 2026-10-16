//! Windows Service Control Manager (SCM) entry point. When `chrono-guard` is
//! launched by the SCM (as the `ChronoGuard` LocalSystem service), it registers
//! a control handler, reports Running, and serves the control channel until the
//! SCM sends Stop/Shutdown — then reports Stopped. When launched from a console
//! (dev), `try_run_as_service` returns false and the caller runs interactively.

use std::ffi::OsString;
use std::sync::mpsc;
use std::time::Duration;

use windows_service::service::{
    ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType,
};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::{define_windows_service, service_dispatcher};

pub const SERVICE_NAME: &str = "ChronoGuard";

define_windows_service!(ffi_service_main, service_main);

/// Hand off to the SCM. Returns `true` if we ran as a service, `false` if not
/// launched by the SCM (the caller should then run interactively).
pub fn try_run_as_service() -> bool {
    match service_dispatcher::start(SERVICE_NAME, ffi_service_main) {
        Ok(()) => true,
        Err(e) => {
            // Not started by the SCM (ERROR_FAILED_SERVICE_CONTROLLER_CONNECT).
            log::info!("not started by the SCM ({e}); running interactively");
            false
        }
    }
}

fn service_main(_args: Vec<OsString>) {
    // `run_service` reports Stopped itself on every reachable exit path (see
    // its doc comment); a bare `Err` here means status registration itself
    // failed, so there is no handle left to report through — logging is all
    // that's left to do.
    if let Err(e) = run_service() {
        log::error!("service failed: {e}");
    }
}

fn status(state: ServiceState) -> ServiceStatus {
    status_with_exit_code(state, 0)
}

/// Same as [`status`] but with an explicit Win32 exit code, so the SCM (and
/// `sc query` / Event Viewer) can distinguish a clean stop from a failure
/// instead of every exit looking identical.
fn status_with_exit_code(state: ServiceState, exit_code: u32) -> ServiceStatus {
    ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: state,
        controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
        exit_code: ServiceExitCode::Win32(exit_code),
        checkpoint: 0,
        wait_hint: Duration::default(),
        process_id: None,
    }
}

/// Runs the guard under the SCM. Every reachable exit path reports a final
/// status back to the SCM — previously a failed tokio runtime build `.expect`'d
/// (panicking without ever reporting `Stopped`, leaving the SCM showing the
/// service as hung/Running indefinitely); that path now reports `Stopped` with
/// a non-zero exit code instead.
fn run_service() -> windows_service::Result<()> {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let event_handler = move |control| -> ServiceControlHandlerResult {
        match control {
            ServiceControl::Stop | ServiceControl::Shutdown => {
                let _ = stop_tx.send(());
                ServiceControlHandlerResult::NoError
            }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    };

    let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;
    status_handle.set_service_status(status_with_exit_code(ServiceState::StartPending, 0))?;

    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(e) => {
            log::error!("failed to build tokio runtime for service: {e}");
            status_handle.set_service_status(status_with_exit_code(ServiceState::Stopped, 1))?;
            return Ok(());
        }
    };

    status_handle.set_service_status(status(ServiceState::Running))?;

    // Serve on a dedicated runtime until the SCM asks us to stop.
    runtime.block_on(crate::serve(async move {
        // Wait for the stop signal off the async worker threads.
        let _ = tokio::task::spawn_blocking(move || {
            let _ = stop_rx.recv();
        })
        .await;
    }));

    status_handle.set_service_status(status(ServiceState::Stopped))?;
    Ok(())
}
