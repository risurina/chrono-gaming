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

Write-Host "------------------------------------"
Write-Host "Service Installed:    $($Status.ServiceInstalled)"
Write-Host "Service Running:      $($Status.ServiceRunning)"
Write-Host "StartType Automatic:  $($Status.StartTypeAuto)"
Write-Host "Runs As LocalSystem:  $($Status.RunsAsLocalSystem)"
Write-Host "Guard EXE Exists:     $($Status.GuardExeExists)"
Write-Host "Secret Dir Exists:    $($Status.SecretDirExists)"
Write-Host "Secret ACL Safe:      $($Status.SecretAclSafe)"
if ($UnsafeGrants.Count -gt 0) {
    Write-Host "------------------------------------"
    Write-Warning "UNSAFE: %ProgramData%\Chrono grants access to standard users:"
    foreach ($g in $UnsafeGrants) { Write-Warning "  $g" }
}
Write-Host "------------------------------------"

if ($Status.ServiceInstalled -and $Status.ServiceRunning -and $Status.StartTypeAuto `
    -and $Status.RunsAsLocalSystem -and $Status.GuardExeExists `
    -and $Status.SecretDirExists -and $Status.SecretAclSafe) {
    Write-Host "Installation looks HEALTHY."
    exit 0
} else {
    Write-Error "Installation looks INCOMPLETE, MISCONFIGURED, or INSECURE."
    exit 1
}
