# chrono-guard

`chrono-guard` is the standalone Windows enforcer for the Chrono station. It runs
as a separate LocalSystem process — deliberately isolated from the desktop app so
that station lockdown survives even if the user-facing window is closed or crashes.

This binary replaces the deleted Node-based service that previously shipped under
`chrono-pc-client-service/dist/`. All of that old service tree is gone; the
compiled `chrono-guard` binary is the sole enforcer going forward.

## What it does

- Runs under LocalSystem with the Windows service name **`ChronoGuard`**.
- Owns station lockdown/enforcement decisions independently of the desktop UI.
- Reads its secrets from `%ProgramData%\Chrono`:
  - `control.key` — HMAC key for the local control channel.
  - `seal.key` — station seal secret.
  - `recovery.hash` — salted PBKDF2 record of the operator recovery PIN.

## Trust model

The guard is the trust boundary, not the desktop UI. It does **not** trust the UI
for whether the station is unlocked:

- **Server-authoritative.** The guard reads the device bearer token from the ACL'd
  store and polls the server (`GET /api/v1/device/session/active`) for the
  authoritative session + `scheduledEndAt`. The control-channel `/ping` is
  **liveness-only**: it updates the last-seen timestamp and ignores any
  client-supplied end-time, so a leaked `control.key` cannot buy session time.
- **PIN in the guard.** The operator recovery PIN is verified here (salted PBKDF2
  against `recovery.hash`), never by the non-admin UI.
- **Monotonic clock backstop.** Remaining time is anchored to a monotonic clock; a
  backward wall-clock jump SAFE_LOCKs instead of extending a session.
- **Fail-closed.** Boots `LOCKED`, re-asserts `LockWorkStation` every tick in any
  non-session state, and locks when the server reports no active session or the
  last server-validated window ends while offline.

The service- and OS-level hardening that protects the guard itself (non-stoppable
service via `sc sdset`/`failureflag`, Safe-Mode registration, ACL-locked secret
store, standard-user-with-password kiosk account, HKLM policies) is applied by the
installer scripts and documented in
[`../docs/deployment-hardening.md`](../docs/deployment-hardening.md) — read it
before deploying to a real kiosk.

## Control channel

The desktop app talks to `chrono-guard` over the local control channel:

- Bound to `127.0.0.1:3202` (loopback only).
- Every request is signed with HMAC using `control.key`.
- Required headers: `x-signature`, `x-timestamp`, `x-nonce` (timestamp + nonce
  guard against replay).

## How it is bundled (packaging-time assembly)

`chrono-guard` is **not** a Tauri `externalBin` sidecar (that's for binaries
the app *spawns* at runtime and requires the target-suffixed binary to exist
for every `cargo build`/`check`) — and it's deliberately **not** a
`tauri.conf.json` `bundle.resources` entry either: `tauri-build`'s build.rs
checks every `resources` path for existence on *every* `cargo build`/
`cargo check`/`cargo test` of the src-tauri crate (confirmed directly — adding
a resources entry for the guard broke `cargo test` on this crate whenever the
guard hadn't been cross-compiled yet), so that would still couple day-to-day
app development to the guard build.

Instead it's staged purely at real packaging time via a `File` instruction in
the NSIS installer hook (`src-tauri/nsis/hooks.nsi`), using NSIS's
`${__FILEDIR__}` preprocessor variable to resolve the path relative to the
hook file itself:

```nsis
File "${__FILEDIR__}\..\..\target\x86_64-pc-windows-msvc\release\chrono-guard.exe"
```

This only runs when `makensis` actually processes the installer (i.e. during
`tauri build`'s bundling step) — `cargo build`/`check`/`test` of any crate in
this workspace never touches it.

`install-service.ps1` and `verify-install.ps1` expect the guard at, relative to
the install dir (this is exactly where the `File` instruction above lands it):

```
<InstallDir>\resources\guard\chrono-guard.exe
```

### Release orchestration (do this before shipping)

1. Compile the guard for the Windows MSVC target (from the
   `apps/chrono-pc-client-tauri` workspace root, so the output lands at
   `target/x86_64-pc-windows-msvc/release/chrono-guard.exe` where the NSIS
   hook expects it):

   ```sh
   cargo build -p chrono-guard --release --target x86_64-pc-windows-msvc
   ```

2. Build the app installer — the NSIS hook stages the compiled binary into the
   bundle during packaging:

   ```sh
   pnpm tauri build
   ```

## How it is installed

The bundled installer scripts register `chrono-guard` as the `ChronoGuard`
Windows service (LocalSystem) via `scripts/install-service.ps1`, which is shipped
through the `bundle.resources` `scripts/` entry. Once installed, the service
starts, provisions/reads `control.key` and `seal.key` under `%ProgramData%\Chrono`,
and begins listening on the control channel at `127.0.0.1:3202`.

Kiosk lockdown and the operator recovery PIN are configured at install time via
installer command-line switches (see `src-tauri/nsis/hooks.nsi`):

```
ChronoStationSetup.exe /KIOSKUSER=cashier1 /PINHASH=<sha256-hex-of-pin>
```

Both are optional; omitting them installs the guard without kiosk lockdown or
operator recovery configured. `uninstall-service.ps1` reverts kiosk policy for
whichever user it was applied to (persisted in `CHRONO_KIOSK_USERNAME`) and
removes the service, its machine env vars, and `%ProgramData%\Chrono`.
