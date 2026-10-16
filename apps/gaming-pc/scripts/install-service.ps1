# install-service.ps1
# Registers the Chrono Station Guard as a native Windows service running the
# compiled Rust enforcer binary (chrono-guard.exe) as LocalSystem.
#
# REQUIRES ADMINISTRATOR PRIVILEGES. Run from an elevated PowerShell prompt.

#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\Chrono Station Guard",
    [string]$KioskUsername = "",
    # Plaintext operator recovery PIN (>= 8 chars). Derived to a salted PBKDF2
    # record at install time (never stored in plaintext). Prefer this.
    [string]$RecoveryPin = "",
    # Advanced: a pre-derived "salt$iterations$hash" record, written as-is.
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

# --- Require the kiosk account to have a password (fail-fast) ---
# LockWorkStation is dismissible on a password-less / autologin-no-password
# account, which silently defeats station lockdown (see
# guard/src/enforcement.rs:150-155). If the operator passes -KioskUsername we
# refuse to install against an account with no password. Domain accounts may not
# resolve via Get-LocalUser; in that case we warn and let the install proceed
# (the operator is responsible for the password). The hard-fail Write-Error is
# kept OUTSIDE the try/catch on purpose: with $ErrorActionPreference='Stop' a
# Write-Error inside the catch would be swallowed, so we only capture the lookup
# in try/catch and evaluate the result afterwards. (hardening plan #1, Phase 4.)
if ($KioskUsername -ne "") {
    $kioskUser = $null
    try {
        $kioskUser = Get-LocalUser -Name $KioskUsername -ErrorAction Stop
    } catch {
        Write-Warning "Could not resolve kiosk account '$KioskUsername' via Get-LocalUser (a domain account won't resolve here): $_. Skipping the local password check - ensure this account has a password set manually."
    }
    if ($null -ne $kioskUser) {
        if (($null -eq $kioskUser.PasswordLastSet) -or (-not $kioskUser.PasswordRequired)) {
            Write-Error "Kiosk account '$KioskUsername' has no password (PasswordLastSet is empty or PasswordRequired is false). LockWorkStation is dismissible on a password-less/autologin account, which defeats station lockdown. Set a password on the kiosk account (e.g. 'net user $KioskUsername *') and re-run this installer."
            exit 1
        }
        Write-Host "Kiosk account '$KioskUsername' password check passed (password set and required)."
    }
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

# Fire the recovery actions on ANY stop, not only a non-zero crash exit — so a
# `sc stop` / `net stop` / `taskkill` that manages to stop the service still
# triggers an automatic restart (hardening plan #1, Phase 1).
& sc.exe failureflag $ServiceName 1 | Out-Host

# Harden the service security descriptor: SYSTEM + Administrators get full
# control; Interactive users and Service-logon users get query/enumerate/
# interrogate only — explicitly NO SERVICE_START / SERVICE_STOP / DELETE. This
# is what stops a standard (customer) account from `sc stop ChronoGuard` /
# `net stop` / `sc delete`, independent of the SCM defaults. SDDL access letters:
# CC=query-config LC=query-status SW=enum-dependents RP=start WP=stop
# DT=pause/continue LO=interrogate CR=user-defined DC=delete-child RC=read-control
# SD=delete WD=write-dac WO=write-owner. IU/SU masks omit RP/WP/DC/SD = no
# start/stop/delete. (DICL audit ACE logs failed stop attempts.)
$HardenedSddl = "D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)S:(AU;FA;WPDT;;;WD)"
& sc.exe sdset $ServiceName $HardenedSddl | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Warning "sc sdset failed (exit $LASTEXITCODE); the service keeps SCM default ACLs. Review manually."
}

# --- Register the guard to start in Safe Mode (Minimal + Network) ---
# A Safe-Mode boot otherwise loads only a minimal service set, which a customer
# could use to bypass enforcement by rebooting into Safe Mode. Registering the
# service under SafeBoot\{Minimal,Network} makes Windows start ChronoGuard there
# too. The (Default) value "Service" tells Safe Mode to load it by service name
# (use "Driver" only for drivers). Idempotent: Test-Path guards New-Item and
# Set-ItemProperty overwrites cleanly on re-run. (hardening plan #1, Phase 4.)
Write-Host "Registering $ServiceName to start in Safe Mode (Minimal + Network)..."
foreach ($safeBootKey in @(
    "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Minimal\$ServiceName",
    "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Network\$ServiceName"
)) {
    if (-not (Test-Path $safeBootKey)) {
        New-Item -Path $safeBootKey -Force | Out-Null
    }
    Set-ItemProperty -Path $safeBootKey -Name "(Default)" -Value "Service" -Type String
}

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
# The operator recovery PIN is verified by the LocalSystem guard, never by the
# non-admin UI. Its salted PBKDF2 record is written to recovery.hash inside the
# ACL'd secret dir (SYSTEM + Administrators only), so the customer can neither
# read it nor brute-force a short PIN. No plaintext PIN is ever persisted, and
# no world-readable machine env var is used (that was the pre-Phase-1b weakness).
$RecoveryHashFile = Join-Path $SecretDir "recovery.hash"
if ($RecoveryPin -ne "") {
    if ($RecoveryPin.Length -lt 8) {
        Write-Error "RecoveryPin must be at least 8 characters."
        exit 1
    }
    Write-Host "Deriving salted recovery PIN record via guard..."
    # Derive through the guard binary (stdin, not argv) so the stored record and
    # the guard's runtime verification use the identical KDF. The PIN never
    # touches disk or the process command line.
    $RecoveryRecord = ($RecoveryPin | & $GuardExe hash-pin)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($RecoveryRecord)) {
        Write-Error "Failed to derive recovery PIN record (guard exit $LASTEXITCODE)."
        exit 1
    }
    [System.IO.File]::WriteAllText($RecoveryHashFile, $RecoveryRecord.Trim())
    Write-Host "Stored recovery PIN record at $RecoveryHashFile."
} elseif ($RecoveryPinHash -ne "") {
    # Advanced: caller supplied a pre-derived "salt$iterations$hash" record.
    Write-Host "Storing supplied recovery PIN record at $RecoveryHashFile..."
    [System.IO.File]::WriteAllText($RecoveryHashFile, $RecoveryPinHash.Trim())
}

# --- Start the service ---
Write-Host "Starting $ServiceName..."
& sc.exe start $ServiceName | Out-Host

Write-Host "$DisplayName installed and started successfully."
