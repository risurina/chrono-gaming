param (
    [Parameter(Mandatory=$true)]
    [string]$Username,

    [Parameter(Mandatory=$false)]
    [string]$ShellPath = "",

    [Parameter(Mandatory=$false)]
    [switch]$AllowAdministratorTarget
)

$ErrorActionPreference = "Stop"

function Get-UserSid($name) {
    try {
        $user = New-Object System.Security.Principal.NTAccount($name)
        return $user.Translate([System.Security.Principal.SecurityIdentifier]).Value
    } catch {
        Write-Error "Could not find SID for user: $name"
        return $null
    }
}

function Test-AdministratorTarget($name) {
    try {
        $members = Get-LocalGroupMember -Group "Administrators" -ErrorAction Stop
        return $members.Name -contains $name -or $members.Name -contains "$env:COMPUTERNAME\$name"
    } catch {
        Write-Warning "Could not verify administrator group membership for $name. Continuing with caution."
        return $false
    }
}

function Mount-UserHive($sid) {
    $hiveRoot = "Registry::HKEY_USERS\$sid"
    if (Test-Path $hiveRoot) {
        return $false
    }

    $profile = Get-CimInstance Win32_UserProfile | Where-Object { $_.SID -eq $sid } | Select-Object -First 1
    if (-not $profile -or -not $profile.LocalPath) {
        Write-Error "Could not find a Windows profile path for $Username. Log in once as that user, then retry."
        exit 1
    }

    $ntUserDat = Join-Path $profile.LocalPath "NTUSER.DAT"
    if (-not (Test-Path $ntUserDat)) {
        Write-Error "Could not find user registry hive at $ntUserDat"
        exit 1
    }

    & reg.exe load "HKU\$sid" "$ntUserDat" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to load registry hive for $Username"
        exit 1
    }

    return $true
}

function Dismount-UserHive($sid) {
    [gc]::Collect()
    Start-Sleep -Milliseconds 250
    & reg.exe unload "HKU\$sid" | Out-Null
}

# Deny the kiosk user the ability to change/delete a policy subkey in their own
# hive, so a standard customer cannot revert DisableTaskMgr/DisableCMD/NoRun etc.
# Only SYSTEM/Administrators (inherited) can modify these afterwards.
# (hardening plan #1, Phase 1b — VALIDATE on a real Windows image per Phase 5.)
function Lock-PolicyKeyAgainstUser($regProviderPath, $userSid) {
    try {
        if (-not (Test-Path $regProviderPath)) { return }
        $acl = Get-Acl -Path $regProviderPath
        $sid = New-Object System.Security.Principal.SecurityIdentifier($userSid)
        $rights = [System.Security.AccessControl.RegistryRights]"SetValue,CreateSubKey,Delete,ChangePermissions,TakeOwnership"
        $deny = New-Object System.Security.AccessControl.RegistryAccessRule(
            $sid, $rights,
            [System.Security.AccessControl.InheritanceFlags]"ContainerInherit",
            [System.Security.AccessControl.PropagationFlags]"None",
            [System.Security.AccessControl.AccessControlType]"Deny"
        )
        $acl.AddAccessRule($deny)
        Set-Acl -Path $regProviderPath -AclObject $acl
    } catch {
        Write-Warning "Could not lock policy key $regProviderPath against ${Username}: $_. Validate registry ACLs manually."
    }
}

Write-Host "Applying Kiosk Policy for user: $Username"

$sid = Get-UserSid $Username
if (-not $sid) { exit 1 }

if ((Test-AdministratorTarget $Username) -and -not $AllowAdministratorTarget) {
    Write-Error "Refusing to apply kiosk policy to administrator account $Username. Use -AllowAdministratorTarget only for recovery testing."
    exit 1
}

$mountedHive = Mount-UserHive $sid

$basePath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Policies"
$explorerPath = "$basePath\Explorer"
$systemPath = "$basePath\System"
$winSystemPath = "Registry::HKEY_USERS\$sid\Software\Policies\Microsoft\Windows\System"

# Ensure keys exist
if (-not (Test-Path $explorerPath)) { New-Item -Path $explorerPath -Force | Out-Null }
if (-not (Test-Path $systemPath)) { New-Item -Path $systemPath -Force | Out-Null }
if (-not (Test-Path $winSystemPath)) { New-Item -Path $winSystemPath -Force | Out-Null }

# Apply Restrictions (per-user hive)
Set-ItemProperty -Path $systemPath -Name "DisableTaskMgr" -Value 1 -Type DWord
Set-ItemProperty -Path $winSystemPath -Name "DisableCMD" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoRun" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoWinKeys" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoClose" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoLogoff" -Value 1 -Type DWord

# Lock the per-user policy subkeys so the standard customer account cannot revert
# them (DisableTaskMgr/DisableCMD are User-Config policies with no reliable HKLM
# equivalent, so the ACL lock is their real protection).
Lock-PolicyKeyAgainstUser $systemPath $sid
Lock-PolicyKeyAgainstUser $winSystemPath $sid
Lock-PolicyKeyAgainstUser $explorerPath $sid

# --- Machine-wide (HKLM) baseline: cannot be reverted by a non-admin customer ---
# Explorer restrictions are honored machine-wide here; DisableTaskMgr/DisableCMD
# are set too (belt-and-suspenders) but the user-hive lock above is their
# authoritative enforcement. (hardening plan #1, Phase 1b.)
$hklmSystem    = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Policies\System"
$hklmExplorer  = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"
$hklmWinSystem = "HKLM:\Software\Policies\Microsoft\Windows\System"
foreach ($p in @($hklmSystem, $hklmExplorer, $hklmWinSystem)) {
    if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
}
Set-ItemProperty -Path $hklmSystem    -Name "DisableTaskMgr" -Value 1 -Type DWord
Set-ItemProperty -Path $hklmWinSystem -Name "DisableCMD"     -Value 1 -Type DWord
Set-ItemProperty -Path $hklmExplorer  -Name "NoRun"     -Value 1 -Type DWord
Set-ItemProperty -Path $hklmExplorer  -Name "NoWinKeys" -Value 1 -Type DWord
Set-ItemProperty -Path $hklmExplorer  -Name "NoClose"   -Value 1 -Type DWord
Set-ItemProperty -Path $hklmExplorer  -Name "NoLogoff"  -Value 1 -Type DWord

# Shell Replacement (Optional)
if ($ShellPath -ne "") {
    Write-Host "Setting custom shell: $ShellPath"
    $winLogonPath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
    if (-not (Test-Path $winLogonPath)) { New-Item -Path $winLogonPath -Force | Out-Null }
    Set-ItemProperty -Path $winLogonPath -Name "Shell" -Value $ShellPath -Type String
}

if ($mountedHive) {
    Dismount-UserHive $sid
}

Write-Host "Kiosk Policy applied successfully for $Username."
Write-Host "Note: Policy changes may require a re-login of $Username to take effect."
