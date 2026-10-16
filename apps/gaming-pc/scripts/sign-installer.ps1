# sign-installer.ps1
# Authenticode-signs the NSIS installer produced by `tauri build`. Invoked by
# Tauri via bundle.windows.nsis.signCommand with the installer path as %1.
#
# Requires ops-provided secrets (not present in this repo, by design - a
# code-signing certificate is a purchased business asset, never committed):
#   CHRONO_SIGN_CERT_PATH      Path to the .pfx certificate file.
#   CHRONO_SIGN_CERT_PASSWORD  Certificate password.
#
# Without both set, this script logs a warning and exits 0 rather than
# failing the build - so a local/dev `tauri build` still produces an
# (unsigned) installer for testing. CI/release pipelines must set both.

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath
)

$CertPath = $env:CHRONO_SIGN_CERT_PATH
$CertPassword = $env:CHRONO_SIGN_CERT_PASSWORD

if (-not $CertPath -or -not $CertPassword) {
    Write-Warning "CHRONO_SIGN_CERT_PATH/CHRONO_SIGN_CERT_PASSWORD not set; shipping an UNSIGNED installer. This is only acceptable for local/dev builds - release builds must set both (see comment header)."
    exit 0
}

if (-not (Test-Path $CertPath)) {
    Write-Error "Signing certificate not found at $CertPath"
    exit 1
}

# signtool.exe ships with the Windows SDK but is not on PATH by default; fall
# back to the newest SDK's x64 copy so builds work from a plain terminal.
$SignTool = "signtool.exe"
if (-not (Get-Command signtool.exe -ErrorAction SilentlyContinue)) {
    $KitsBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    $Found = Get-ChildItem $KitsBin -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" } |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1
    if (-not $Found) {
        Write-Error "signtool.exe not found on PATH or under $KitsBin - install the Windows SDK or add signtool to PATH."
        exit 1
    }
    $SignTool = $Found
}

& $SignTool sign /f $CertPath /p $CertPassword /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $InstallerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "signtool failed to sign $InstallerPath (exit $LASTEXITCODE)"
    exit 1
}

Write-Host "Signed $InstallerPath"
