# uninstall-service.ps1
# Stops and removes the Chrono Station Guard (ChronoGuard) LocalSystem service,
# cleans up the machine environment variables and secret storage it left
# behind, and reverts kiosk policy for whichever user it was applied to.
#
# REQUIRES ADMINISTRATOR PRIVILEGES. Run from an elevated PowerShell prompt.

#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\Chrono Station Guard"
)

$ServiceName = "ChronoGuard"

Write-Host "Uninstalling $ServiceName..."

# --- Stop + delete the native Windows service ---
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -ne 'Stopped') {
        Write-Host "Stopping service $ServiceName..."
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        try {
            (Get-Service -Name $ServiceName).WaitForStatus('Stopped', (New-TimeSpan -Seconds 15))
        } catch {
            Write-Warning "Timed out waiting for $ServiceName to stop; continuing with delete."
        }
    }

    Write-Host "Removing service $ServiceName..."
    & sc.exe delete $ServiceName | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Service $ServiceName removed successfully."
    } else {
        Write-Warning "Failed to remove service $ServiceName. It might require a reboot to fully disappear."
    }
} else {
    Write-Host "Service $ServiceName is not installed."
}

# --- Remove the Safe-Mode service registrations ---
# install-service.ps1 registers the guard under SafeBoot\{Minimal,Network} so it
# still runs after a Safe-Mode boot; strip those so uninstall fully reverts.
# (hardening plan #1, Phase 4/5.)
Write-Host "Removing Safe-Mode registrations for $ServiceName..."
foreach ($safeBootKey in @(
    "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Minimal\$ServiceName",
    "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Network\$ServiceName"
)) {
    if (Test-Path $safeBootKey) {
        Remove-Item -Path $safeBootKey -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- Revert kiosk policy for whichever user it was applied to, before we
#     erase the env var that remembers who that was. ---
$kioskUsername = [Environment]::GetEnvironmentVariable("CHRONO_KIOSK_USERNAME", "Machine")
if ($kioskUsername) {
    Write-Host "Reverting kiosk policy for $kioskUsername..."
    $RevertScript = Join-Path $PSScriptRoot "revert-kiosk-policy.ps1"
    if (Test-Path $RevertScript) {
        & powershell.exe -ExecutionPolicy Bypass -File $RevertScript -Username $kioskUsername
    } else {
        Write-Warning "Kiosk revert script not found at $RevertScript; skipping."
    }
} else {
    Write-Host "No kiosk username recorded; skipping kiosk policy revert."
}

# --- Remove machine environment variables set by install-service.ps1 ---
# CHRONO_RECOVERY_PIN_HASH is no longer written (the recovery PIN now lives as a
# salted record in recovery.hash, removed with the secret dir below) but stays in
# this list to clean it up on machines upgraded from a pre-Phase-1b install.
Write-Host "Removing Chrono machine environment variables..."
foreach ($var in @(
    "CHRONO_ENV",
    "CHRONO_UI_EXE",
    "CHRONO_UI_PROCESS",
    "CHRONO_RECOVERY_PIN_HASH",
    "CHRONO_KIOSK_USERNAME"
)) {
    [Environment]::SetEnvironmentVariable($var, $null, "Machine")
}

# --- Remove secret storage (control.key / seal.key / recovery.hash / sealed
#     station state) ---
$SecretDir = Join-Path $env:ProgramData "Chrono"
if (Test-Path $SecretDir) {
    Write-Host "Removing secret storage at $SecretDir..."
    Remove-Item -Path $SecretDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "$ServiceName uninstalled."
