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

Write-Host "Reverting Kiosk Policy for user: $Username"

$sid = Get-UserSid $Username
if (-not $sid) { exit 1 }

$mountedHive = Mount-UserHive $sid

$basePath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Policies"
$explorerPath = "$basePath\Explorer"
$systemPath = "$basePath\System"
$winSystemPath = "Registry::HKEY_USERS\$sid\Software\Policies\Microsoft\Windows\System"
$winLogonPath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"

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

Write-Host "Kiosk Policy reverted successfully for $Username."
Write-Host "Note: Policy changes may require a re-login of $Username to take effect."
