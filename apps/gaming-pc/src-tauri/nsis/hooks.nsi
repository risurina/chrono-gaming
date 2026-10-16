; Tauri NSIS installer hooks — port of the Electron `scripts/installer.nsh`.
; Registers/unregisters the Chrono watchdog service via the bundled PowerShell
; scripts. Tauri places `bundle.resources` under $INSTDIR (preserving the mapped
; sub-paths), so the scripts land in $INSTDIR\scripts.
;
; The guard binary (chrono-guard.exe) is deliberately NOT a tauri.conf.json
; `bundle.resources` entry: tauri-build's build.rs checks resource paths for
; existence on *every* `cargo build`/`cargo check`/`cargo test` of the
; src-tauri crate (confirmed: adding it there broke local builds whenever the
; guard hadn't been cross-compiled yet), which would couple day-to-day app
; development to the guard build. Instead it's staged here via a `File`
; instruction that only runs at real packaging time (`tauri build`).
;
; Path resolution (verified on a real Windows build, 2026-07-10): because
; `File` sits inside a `!macro`, `${__FILEDIR__}` expands at the
; `!insertmacro` site — Tauri's *generated* installer script at
; `target\<triple>\release\nsis\x64\installer.nsi` — NOT this include file.
; So `..\..` resolves to `target\<triple>\release\`, which is exactly where
; cargo puts chrono-guard.exe when the guard is built for the same target
; triple as the app. Build order/target must match: compile chrono-guard
; with the same `--target` used for `tauri build` (see guard/README.md).
;
; Kiosk deployments are provisioned by IT/ops running the installer
; non-interactively, so the kiosk username and recovery-PIN hash are taken as
; installer command-line switches rather than an interactive wizard page:
;   ChronoStationSetup.exe /KIOSKUSER=cashier1 /PINHASH=<sha256-hex>
; Both are optional — omit them to install without kiosk lockdown/recovery
; configured (matching today's default behavior).

!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  ; The public code-signing certificate (chrono-codesign.cer) is NOT staged
  ; here: it is committed to the repo, so the tauri-build existence check that
  ; rules out a resources entry for the guard binary doesn't apply. It ships
  ; via `bundle.resources` in tauri.conf.json and lands at
  ; $INSTDIR\resources\codesign\chrono-codesign.cer, where install-service.ps1
  ; picks it up for the Trusted Publisher import.
  DetailPrint "Installing ${PRODUCTNAME} v${VERSION}..."
  DetailPrint "Staging Chrono Station Guard binary..."
  SetOutPath "$INSTDIR\resources\guard"
  File "${__FILEDIR__}\..\..\chrono-guard.exe"
  SetOutPath "$INSTDIR"

  ; Parse optional /KIOSKUSER= and /PINHASH= switches from the install command line.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} "$R0" "/KIOSKUSER=" $R1
  IfErrors 0 +2
    StrCpy $R1 ""
  ClearErrors
  ${GetOptions} "$R0" "/PINHASH=" $R2
  IfErrors 0 +2
    StrCpy $R2 ""

  DetailPrint "Registering Chrono PC Service..."
  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -File "$INSTDIR\scripts\install-service.ps1" -InstallDir "$INSTDIR" -KioskUsername "$R1" -RecoveryPinHash "$R2"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; uninstall-service.ps1 stops/removes the ChronoGuard service, clears its
  ; machine env vars and secret storage, and reverts kiosk policy itself
  ; (using the username persisted at install time) — no separate revert call
  ; is needed here.
  DetailPrint "Unregistering Chrono PC Service..."
  nsExec::ExecToLog 'powershell.exe -ExecutionPolicy Bypass -File "$INSTDIR\scripts\uninstall-service.ps1" -InstallDir "$INSTDIR"'
!macroend
