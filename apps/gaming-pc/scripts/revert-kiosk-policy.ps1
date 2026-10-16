param (
    [Parameter(Mandatory=$true)]
    [string]$Username
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

# Strip the kiosk-user Deny ACE that apply-kiosk-policy.ps1's
# Lock-PolicyKeyAgainstUser added to a policy subkey. This MUST run before we try
# to delete the per-user policy values below: with the deny ACE in place the
# kiosk user (and anything running as them) cannot modify/delete those values.
# SYSTEM/Administrators (this elevated script) can still edit the ACL itself.
# (hardening plan #1, Phase 5 — revert/verify parity with the Phase 1b lock.)
function Unlock-PolicyKeyForUser($regProviderPath, $userSid) {
    try {
        if (-not (Test-Path $regProviderPath)) { return }
        $acl = Get-Acl -Path $regProviderPath
        $sid = New-Object System.Security.Principal.SecurityIdentifier($userSid)
        $removed = $false
        # Snapshot the rule list with @() so removing from the ACL doesn't mutate
        # the collection we're iterating.
        foreach ($rule in @($acl.Access)) {
            if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Deny) { continue }
            $ruleSid = $null
            try {
                $ruleSid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
            } catch {
                $ruleSid = $rule.IdentityReference.Value
            }
            if ($ruleSid -eq $sid.Value) {
                [void]$acl.RemoveAccessRule($rule)
                $removed = $true
            }
        }
        if ($removed) { Set-Acl -Path $regProviderPath -AclObject $acl }
    } catch {
        Write-Warning "Could not unlock policy key $regProviderPath for ${Username}: $_. Remove the kiosk-user deny ACE manually if value removal fails."
    }
}

Write-Host "Reverting Kiosk Policy for user: $Username"

$sid = Get-UserSid $Username
if (-not $sid) { exit 1 }

$mountedHive = Mount-UserHive $sid

$basePath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Policies"
$explorerPath = "$basePath\Explorer"
$systemPath = "$basePath\System"
$winSystemPath = "Registry::HKEY_USERS\$sid\Software\Policies\Microsoft\Windows\System"
$winLogonPath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"

# Remove the kiosk-user deny ACE from each locked policy subkey FIRST, otherwise
# the per-user value removals below are blocked by the lock. (hardening plan #1,
# Phase 5.)
Unlock-PolicyKeyForUser $systemPath $sid
Unlock-PolicyKeyForUser $winSystemPath $sid
Unlock-PolicyKeyForUser $explorerPath $sid

# Remove Restrictions
$policies = @(
    @{ Path=$systemPath; Name="DisableTaskMgr" },
    @{ Path=$winSystemPath; Name="DisableCMD" },
    @{ Path=$explorerPath; Name="NoRun" },
    @{ Path=$explorerPath; Name="NoWinKeys" },
    @{ Path=$explorerPath; Name="NoClose" },
    @{ Path=$explorerPath; Name="NoLogoff" }
)

foreach ($p in $policies) {
    if (Test-Path $p.Path) {
        Remove-ItemProperty -Path $p.Path -Name $p.Name -ErrorAction SilentlyContinue
    }
}

# Revert Shell
if (Test-Path $winLogonPath) {
    Set-ItemProperty -Path $winLogonPath -Name "Shell" -Value "explorer.exe" -Type String
}

if ($mountedHive) {
    Dismount-UserHive $sid
}

# --- Remove the machine-wide (HKLM) policy baseline written by
#     apply-kiosk-policy.ps1, so uninstall fully reverts enforcement. These are
#     machine-scope (independent of the user hive above). (hardening plan #1,
#     Phase 5.) ---
$hklmSystem    = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Policies\System"
$hklmExplorer  = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"
$hklmWinSystem = "HKLM:\Software\Policies\Microsoft\Windows\System"
$hklmValues = @(
    @{ Path=$hklmSystem;    Name="DisableTaskMgr" },
    @{ Path=$hklmWinSystem; Name="DisableCMD" },
    @{ Path=$hklmExplorer;  Name="NoRun" },
    @{ Path=$hklmExplorer;  Name="NoWinKeys" },
    @{ Path=$hklmExplorer;  Name="NoClose" },
    @{ Path=$hklmExplorer;  Name="NoLogoff" }
)
foreach ($v in $hklmValues) {
    if (Test-Path $v.Path) {
        Remove-ItemProperty -Path $v.Path -Name $v.Name -ErrorAction SilentlyContinue
    }
}

Write-Host "Kiosk Policy reverted successfully for $Username."
Write-Host "Note: Policy changes may require a re-login of $Username to take effect."
