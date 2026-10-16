# verify-install.ps1
# Verifies the Chrono Station Guard installation:
#   - ChronoGuard service exists, is Running, StartType Automatic, runs as LocalSystem
#   - chrono-guard.exe is present in the bundle
#   - %ProgramData%\Chrono ACLs do NOT grant Users/Authenticated Users any access
#
# REQUIRES ADMINISTRATOR PRIVILEGES (reading service account + ACLs).

#Requires -RunAsAdministrator

param(
    [string]$InstallDir = "C:\Program Files\Chrono Station Guard"
)

$ServiceName = "ChronoGuard"

$Status = @{
    ServiceInstalled = $false
    ServiceRunning   = $false
    StartTypeAuto    = $false
    RunsAsLocalSystem = $false
    GuardExeExists   = $false
    SecretDirExists  = $false
    SecretAclSafe    = $false
    # Phase 4/5 hardening checks (hardening plan #1):
    SddlHardened      = $false  # best-effort: IU/SU lack stop, SY has full control
    FailureFlagSet    = $false  # recovery fires on any stop, not only a crash
    SafeBootRegistered = $false # guard still runs after a Safe-Mode boot
    RecoveryHashExists = $false # optional (PIN), so warn-only below
}

Write-Host "Verifying $ServiceName installation at $InstallDir..."

# --- Service checks ---
$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Service) {
    $Status.ServiceInstalled = $true
    if ($Service.Status -eq 'Running') { $Status.ServiceRunning = $true }
    if ($Service.StartType -eq 'Automatic') { $Status.StartTypeAuto = $true }
}

# Service logon account (LocalSystem) via WMI/CIM.
$svcCim = Get-CimInstance -ClassName Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
if ($svcCim) {
    $account = $svcCim.StartName
    if ($account -eq 'LocalSystem' -or $account -eq '.\LocalSystem') {
        $Status.RunsAsLocalSystem = $true
    }
}

# --- Guard binary check (Tauri 'resources' layout) ---
$GuardExe = Join-Path $InstallDir "resources\guard\chrono-guard.exe"
if (Test-Path $GuardExe) { $Status.GuardExeExists = $true }

# --- Secret storage ACL check ---
$SecretDir = Join-Path $env:ProgramData "Chrono"
$UnsafeGrants = @()
if (Test-Path $SecretDir) {
    $Status.SecretDirExists = $true
    $acl = Get-Acl -Path $SecretDir
    foreach ($ace in $acl.Access) {
        $id = $ace.IdentityReference.Value
        # Match BUILTIN\Users and *\Authenticated Users regardless of localization
        # by resolving well-known SIDs where possible.
        $sid = $null
        try {
            $sid = ($ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier])).Value
        } catch {
            $sid = $null
        }
        $isUsers = ($sid -eq 'S-1-5-32-545') -or ($id -match 'Users$')
        $isAuthUsers = ($sid -eq 'S-1-5-11') -or ($id -match 'Authenticated Users$')
        if (($isUsers -or $isAuthUsers) -and $ace.AccessControlType -eq 'Allow') {
            $UnsafeGrants += "$id => $($ace.FileSystemRights)"
        }
    }
    if ($UnsafeGrants.Count -eq 0) { $Status.SecretAclSafe = $true }
}

# --- Service security descriptor (best-effort) ---
# The hardened descriptor (install-service.ps1 `sc sdset`) grants SYSTEM (SY) and
# Administrators (BA) full control and restricts Interactive (IU) / Service (SU)
# users to query/enumerate/interrogate only - crucially NO WP (SERVICE_STOP),
# RP (SERVICE_START), or SD (DELETE). This is a heuristic string check: if SY has
# the full mask we set and neither IU nor SU is granted WP, call it hardened.
# Best-effort only (string match can false-negative on reordered output), so a
# miss WARNS rather than failing the whole install below.
$svcSddl = ""
try {
    $svcSddl = ((& sc.exe sdshow $ServiceName) | Out-String).Trim()
} catch {
    $svcSddl = ""
}
if ($svcSddl) {
    $hasSystemFull = $svcSddl -match 'A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY'
    $iuGrantsStop  = $svcSddl -match '\(A;[^)]*WP[^)]*;;;IU\)'
    $suGrantsStop  = $svcSddl -match '\(A;[^)]*WP[^)]*;;;SU\)'
    if ($hasSystemFull -and (-not $iuGrantsStop) -and (-not $suGrantsStop)) {
        $Status.SddlHardened = $true
    }
}

# --- Failure flag (recovery actions fire on any stop, not only a crash) ---
try {
    $ffOut = ((& sc.exe qfailureflag $ServiceName) | Out-String)
    if ($ffOut -match 'TRUE') { $Status.FailureFlagSet = $true }
} catch {
    # leave FailureFlagSet = $false
}

# --- Safe-Mode registration (guard runs after a Safe-Mode boot) ---
$safeBootMinimal = "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Minimal\$ServiceName"
$safeBootNetwork = "HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot\Network\$ServiceName"
if ((Test-Path $safeBootMinimal) -and (Test-Path $safeBootNetwork)) {
    $Status.SafeBootRegistered = $true
}

# --- Recovery PIN record present in the ACL'd store (optional) ---
$RecoveryHashFile = Join-Path $SecretDir "recovery.hash"
if (Test-Path $RecoveryHashFile) { $Status.RecoveryHashExists = $true }

Write-Host "------------------------------------"
Write-Host "Service Installed:    $($Status.ServiceInstalled)"
Write-Host "Service Running:      $($Status.ServiceRunning)"
Write-Host "StartType Automatic:  $($Status.StartTypeAuto)"
Write-Host "Runs As LocalSystem:  $($Status.RunsAsLocalSystem)"
Write-Host "Guard EXE Exists:     $($Status.GuardExeExists)"
Write-Host "Secret Dir Exists:    $($Status.SecretDirExists)"
Write-Host "Secret ACL Safe:      $($Status.SecretAclSafe)"
Write-Host "SDDL Hardened:        $($Status.SddlHardened)"
Write-Host "Failure Flag Set:     $($Status.FailureFlagSet)"
Write-Host "Safe-Mode Registered: $($Status.SafeBootRegistered)"
Write-Host "Recovery Hash Exists: $($Status.RecoveryHashExists)"
if ($UnsafeGrants.Count -gt 0) {
    Write-Host "------------------------------------"
    Write-Warning "UNSAFE: %ProgramData%\Chrono grants access to standard users:"
    foreach ($g in $UnsafeGrants) { Write-Warning "  $g" }
}

# Warn-only signals (do NOT fail the install on their own):
#  - SDDL check is a best-effort string match; a miss may be a false negative.
#  - recovery.hash is optional (operator recovery PIN is an opt-in feature).
if (-not $Status.SddlHardened) {
    Write-Warning "Service security descriptor does not look hardened (or sc sdshow output was unrecognised). Verify with: sc.exe sdshow $ServiceName - Interactive/Service users must NOT have SERVICE_STOP."
}
if (-not $Status.RecoveryHashExists) {
    Write-Warning "No recovery.hash in $SecretDir - operator recovery PIN is not configured (optional)."
}
Write-Host "------------------------------------"

# Fold the concrete hardening guarantees (failure flag + Safe-Mode) into the
# pass/fail decision alongside the original checks. The SDDL and recovery.hash
# signals are warn-only (see above). (hardening plan #1, Phase 5.)
if ($Status.ServiceInstalled -and $Status.ServiceRunning -and $Status.StartTypeAuto `
    -and $Status.RunsAsLocalSystem -and $Status.GuardExeExists `
    -and $Status.SecretDirExists -and $Status.SecretAclSafe `
    -and $Status.FailureFlagSet -and $Status.SafeBootRegistered) {
    Write-Host "Installation looks HEALTHY."
    exit 0
} else {
    Write-Error "Installation looks INCOMPLETE, MISCONFIGURED, or INSECURE."
    exit 1
}
