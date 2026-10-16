# install-service.ps1
# Registers the Chrono Station Guard as a native Windows service running the
# compiled Rust enforcer binary (chrono-guard.exe) as LocalSystem.
#
# REQUIRES ADMINISTRATOR PRIVILEGES. Run from an elevated PowerShell prompt.

#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\Chrono Station Guard",
    [string]$KioskUsername = "",
    [string]$RecoveryPinHash = "",
    [string]$CodeSignCertPath = ""
)

$ErrorActionPreference = "Stop"

$ServiceName = "ChronoGuard"
$DisplayName = "Chrono Station Guard"
$Description = "LocalSystem station enforcer: control channel, watchdog, and kiosk enforcement for the Chrono station."

Write-Host "Installing $DisplayName ($ServiceName)..."

# --- Resolve paths for the Tauri 'resources' bundle layout ---
$ResourcesDir = Join-Path $InstallDir "resources"
$GuardDir     = Join-Path $ResourcesDir "guard"
$GuardExe     = Join-Path $GuardDir "chrono-guard.exe"

# The Tauri app executable (station UI). Matches tauri.conf.json productName
# "Chrono PC Client"; the guard watchdog's default CHRONO_UI_PROCESS match is the
# lowercased form of this name.
$UiExe        = Join-Path $InstallDir "Chrono PC Client.exe"
$UiProcess    = "Chrono PC Client"

if (-not (Test-Path $GuardExe)) {
    Write-Error "Could not find the compiled guard binary at $GuardExe"
    exit 1
}

if (-not (Test-Path $UiExe)) {
    Write-Error "Could not find the Chrono station executable at $UiExe"
    exit 1
}

# --- Idempotent teardown: stop + delete any existing service ---
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Service $ServiceName already exists. Stopping and removing..."
    if ($existing.Status -ne 'Stopped') {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        # Wait for the service to fully stop before deleting.
        try {
            (Get-Service -Name $ServiceName).WaitForStatus('Stopped', (New-TimeSpan -Seconds 15))
        } catch {
            Write-Warning "Timed out waiting for $ServiceName to stop; continuing with delete."
        }
    }
    & sc.exe delete $ServiceName | Out-Host
    # sc.exe delete can lag; give the SCM a moment to release the name.
    Start-Sleep -Seconds 2
}

# --- Create the native Windows service running the compiled Rust binary ---
# binPath points directly at chrono-guard.exe. No wrapper .exe, no wrapper .xml.
# start=auto, run as LocalSystem (obj= LocalSystem).
Write-Host "Registering native Windows service..."
$binPath = "`"$GuardExe`""
& sc.exe create $ServiceName `
    binPath= $binPath `
    start= auto `
    obj= "LocalSystem" `
    DisplayName= $DisplayName | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create service $ServiceName (sc.exe exit $LASTEXITCODE)."
    exit 1
}

# Set the service description.
& sc.exe description $ServiceName $Description | Out-Host

# Restart the guard automatically on crash (60s delay, reset counter daily).
& sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Host

# --- Machine environment the service needs ---
Write-Host "Setting machine environment variables..."
[Environment]::SetEnvironmentVariable("CHRONO_ENV", "production", "Machine")
[Environment]::SetEnvironmentVariable("CHRONO_UI_EXE", $UiExe, "Machine")
[Environment]::SetEnvironmentVariable("CHRONO_UI_PROCESS", $UiProcess, "Machine")

# --- Harden secret storage under %ProgramData%\Chrono ---
# This is the fix that stops a standard user from reading control.key / seal.key.
$SecretDir = Join-Path $env:ProgramData "Chrono"
if (-not (Test-Path $SecretDir)) {
    Write-Host "Creating secret storage directory $SecretDir..."
    New-Item -ItemType Directory -Path $SecretDir -Force | Out-Null
}

Write-Host "Hardening ACLs on $SecretDir (SYSTEM + Administrators only)..."
# Disable inheritance and drop inherited ACEs.
& icacls $SecretDir /inheritance:r | Out-Host
# Grant full control to SYSTEM and Administrators, inheritable to children.
& icacls $SecretDir /grant "*S-1-5-18:(OI)(CI)F" | Out-Host          # NT AUTHORITY\SYSTEM
& icacls $SecretDir /grant "*S-1-5-32-544:(OI)(CI)F" | Out-Host       # BUILTIN\Administrators
# Explicitly remove broad principals in case they were granted elsewhere.
& icacls $SecretDir /remove:g "*S-1-5-32-545" | Out-Host              # BUILTIN\Users
& icacls $SecretDir /remove:g "*S-1-5-11" | Out-Host                  # NT AUTHORITY\Authenticated Users

# --- Optional: trust the code-signing cert used to sign this installer ---
# Self-signed builds (see sign-installer.ps1 / CHRONO_SIGN_CERT_PATH) are not
# chained to a public CA, so Windows won't trust the signature until the
# public certificate is imported into this machine's Trusted Publisher store.
# Only the public .cer is ever handled here - never the .pfx/private key.
if ($CodeSignCertPath -eq "") {
    $DefaultCertPath = Join-Path $ResourcesDir "codesign\chrono-codesign.cer"
    if (Test-Path $DefaultCertPath) {
        $CodeSignCertPath = $DefaultCertPath
    }
}

if ($CodeSignCertPath -ne "") {
    if (Test-Path $CodeSignCertPath) {
        Write-Host "Importing code-signing certificate into TrustedPublisher: $CodeSignCertPath..."
        Import-Certificate -FilePath $CodeSignCertPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Host
    } else {
        Write-Warning "Code-signing certificate not found at $CodeSignCertPath; skipping trust import. The installed binary's signature may show as untrusted."
    }
} else {
    Write-Warning "No code-signing certificate path provided or found at the default location; skipping trust import."
}

# --- Optional: kiosk policy ---
# apply-kiosk-policy.ps1 is a sibling of this script (both bundled directly
# under $INSTDIR\scripts, not under resources\scripts) - resolve via
# $PSScriptRoot so this works regardless of how install-service.ps1 is invoked.
if ($KioskUsername -ne "") {
    Write-Host "Applying kiosk policy for user $KioskUsername..."
    $PolicyScript = Join-Path $PSScriptRoot "apply-kiosk-policy.ps1"
    if (Test-Path $PolicyScript) {
        & powershell.exe -ExecutionPolicy Bypass -File $PolicyScript -Username $KioskUsername -ShellPath $UiExe
        # Persist the kiosk username so uninstall can revert the same user's
        # policy without requiring an operator to remember/pass it manually.
        [Environment]::SetEnvironmentVariable("CHRONO_KIOSK_USERNAME", $KioskUsername, "Machine")
    } else {
        Write-Warning "Kiosk policy script not found at $PolicyScript; skipping."
    }
}

# --- Optional: recovery PIN hash ---
# Persisted as a machine env var so the LocalSystem guard can read it without a
# world-readable file on disk.
if ($RecoveryPinHash -ne "") {
    Write-Host "Storing recovery PIN hash..."
    [Environment]::SetEnvironmentVariable("CHRONO_RECOVERY_PIN_HASH", $RecoveryPinHash, "Machine")
}

# --- Start the service ---
Write-Host "Starting $ServiceName..."
& sc.exe start $ServiceName | Out-Host

Write-Host "$DisplayName installed and started successfully."
