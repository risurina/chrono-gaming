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

# Apply Restrictions
Set-ItemProperty -Path $systemPath -Name "DisableTaskMgr" -Value 1 -Type DWord
Set-ItemProperty -Path $winSystemPath -Name "DisableCMD" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoRun" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoWinKeys" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoClose" -Value 1 -Type DWord
Set-ItemProperty -Path $explorerPath -Name "NoLogoff" -Value 1 -Type DWord

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
