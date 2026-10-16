# Chrono PC Client (Tauri)

Secure workstation shell for the Chrono iCafe management system, built with
**Tauri v2** (Rust core) and **React + TypeScript + Vite** (webview UI).

## Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Webview (React, src/)        │  invoke │  Rust core (src-tauri/)       │
│                               │ ───────▶│                               │
│  UI + runtime state machine   │  listen │  identity, kiosk, heartbeat,  │
│  lib/native.ts  ◀─────────────┼─events──┤  commands, store, secure,     │
│  (typed invoke/listen)        │         │  process monitor              │
└──────────────────────────────┘         └──────────────────────────────┘
```

- The renderer never touches the OS directly. It calls the Rust core exclusively
  through **`src/lib/native.ts`** — a typed wrapper over Tauri's `invoke()` /
  `listen()`. There is no `window` bridge global.
- Command request/response DTOs live in **`src/features/api/contract.ts`**.
- The Rust command handlers are in **`src-tauri/src/commands/`**; background
  daemons (heartbeat, process monitor, kiosk) are wired up in
  **`src-tauri/src/lib.rs`**.

## Trust model (anti-tamper)

The station is hardened against a tech-savvy **non-admin customer** at the PC. The
trust boundary is the **`chrono-guard` LocalSystem service**, not the webview UI:

- **Server-authoritative sessions.** The guard derives whether/until-when the
  station is unlocked from the **server** (`GET /api/v1/device/session/active`),
  not from the UI. The UI `/ping` is **liveness-only** — it cannot assert
  `scheduledEndAt`/`activeSessionId`, so a forged or replayed `/ping` (even a
  validly-signed one with a far-future end) can never buy session time.
- **PIN verified in the guard.** The operator recovery PIN is checked inside the
  LocalSystem guard against a salted PBKDF2 record in the ACL'd secret store — the
  non-admin UI never sees or verifies it.
- **Monotonic clock backstop.** The guard anchors remaining time to a monotonic
  clock; a backward wall-clock jump SAFE_LOCKs rather than extending a session.
- **Service + policy hardening.** The service is non-stoppable/non-deletable by
  the customer (`sc sdset` + `failureflag`), runs in Safe Mode, and kiosk policies
  live in admin-only HKLM plus ACL-locked user-hive keys.

Several controls are **OS/deployment-level, not app code** (standard-user account
with a password, admin-write-only install dir, elevated install, Secure Boot /
BitLocker). The station is only tamper-resistant on a correctly-provisioned image
— see **[`docs/deployment-hardening.md`](docs/deployment-hardening.md)** for the
operator prerequisites and the manual Windows validation checklist.

## Prerequisites (Windows)

- **Rust** (stable) via [rustup](https://rustup.rs)
- **MSVC C++ Build Tools** (Visual Studio Build Tools, "Desktop development with C++")
- **WebView2 Runtime** (ships with Windows 11)
- **Node.js** + **pnpm** (workspace package manager)

## Development

Run from the repo root (uses the pnpm workspace filter):

```bash
# Web-only (webview in a browser, no native core) — fast UI iteration
pnpm --filter @chrono/pc-client-tauri dev

# Full Tauri app (Rust core + webview)
pnpm --filter @chrono/pc-client-tauri dev:tauri
```

## Build

```bash
# Type-check + build the webview bundle
pnpm --filter @chrono/pc-client-tauri build

# Build the full installer (NSIS, Windows)
pnpm --filter @chrono/pc-client-tauri build:tauri
```

## Checks

```bash
pnpm --filter @chrono/pc-client-tauri typecheck
pnpm --filter @chrono/pc-client-tauri lint
```

## Configuration

- Copy `.env.example` to `.env` and set the API base URL and Sentry DSN.
- Tauri app/window/bundle config: `src-tauri/tauri.conf.json`.

## Versioning (single source of truth)

The app version is defined **once** in `package.json` (`"version"`). Everything
else derives from it — bump `package.json` and rebuild; do not edit the others:

- `src-tauri/tauri.conf.json` sets `"version": "../package.json"`, so Tauri reads
  it for the installer filename, exe metadata, the NSIS `${VERSION}`, and the
  updater's `{{current_version}}`.
- `vite.config.ts` reads `package.json` and injects it as
  `import.meta.env.VITE_APP_VERSION`, which `CLIENT_CONFIG.VERSION` exposes and
  the footer status bar (`FooterStatusBar`) shows on screen.
- The NSIS installer prints `Installing Chrono PC Client v<version>` during
  install (`src-tauri/nsis/hooks.nsi`).

The `version` fields in `src-tauri/Cargo.toml` and `guard/Cargo.toml` are Rust
crate versions (build-internal, not user-facing); keep them aligned when bumping
for consistency, but nothing reads them as the app version.

## Updater & code signing (required before shipping a release build)

**Auto-update** (`plugin.updater` in `tauri.conf.json`, checked autonomously
every 6h by `src-tauri/src/updater.rs` — the station has no interactive user
to click "update now"):
1. Generate a real signing keypair once: `pnpm tauri signer generate -w ~/.tauri/chrono-updater.key`.
   **Done** (2026-07-09) — the public key is already live in `plugins.updater.pubkey`
   in `tauri.conf.json`. The private key + password are held outside the repo
   (secrets manager) — set them as CI/release secrets `TAURI_SIGNING_PRIVATE_KEY` /
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (`tauri build` reads these automatically).
2. The update-manifest endpoint the `endpoints` URL points at is **done** —
   `GET /api/v1/device/updates/{target}/{arch}/{current_version}` on `chrono-api`
   (see `apps/chrono-api/src/modules/device/routes.ts`). It reads a global
   `Setting` (`scope='pc-client'`, `key='release-manifest'`) that must be
   populated with the actual release URL/signature after each signed build —
   no publishing tool exists yet, do this manually via a DB script until one
   is built.

**Code signing** (`bundle.windows.signCommand` → `scripts/sign-installer.ps1`):
- A purchased CA-issued Authenticode cert is the eventual goal for public trust,
  but for an internally-provisioned kiosk fleet a **self-signed** cert is a
  legitimate free alternative: sign with it, then import the public `.cer` into
  each kiosk's Trusted Publisher store during install so Windows trusts it
  without a CA chain.
  - `install-service.ps1` now does this automatically: pass `-CodeSignCertPath`,
    or bundle the cert at `src-tauri/codesign/chrono-codesign.cer` before
    `tauri build` (staged by `hooks.nsi` into `resources\codesign\`, same
    pattern as the guard binary) and it's picked up by default.
  - Missing cert is non-fatal — the script warns and continues; the binary just
    shows as untrusted until a cert is imported.
- Set `CHRONO_SIGN_CERT_PATH` / `CHRONO_SIGN_CERT_PASSWORD` in the release
  environment to the `.pfx` (never commit it, self-signed or CA-issued).
- Without both set, `sign-installer.ps1` logs a warning and ships an **unsigned**
  installer (fine for local testing; for kiosk distribution, prefer the
  self-signed + Trusted Publisher import path above over shipping unsigned).

## Releases

Client releases are published to the **public** repo
[`izur-it/chrono/releases`](https://github.com/izur-it/chrono/releases) — **not**
the private `risurina/oikos` code repo. The distribution repo must be public so the
Tauri auto-updater (which fetches the installer URL unauthenticated) can download it.

Release assets follow the naming `Chrono-PC-Client_<version>_x64-setup.exe` (hyphens),
and the release is tagged `v<version>` targeting that repo's `main`.

To cut a release (or run `/release-tauri`):

1. **Bump** `package.json` `version` (single source of truth) and align the crate
   versions in `src-tauri/Cargo.toml`, `guard/Cargo.toml`,
   `crates/chrono-control/Cargo.toml`; refresh the lock with
   `cargo update -p chrono-pc-client -p chrono-guard -p chrono-control --precise <version>`.
   Typecheck, then commit `chore(pc-client): bump ... v<version>`.
2. **Build** the signed installer: `pnpm --filter @chrono/pc-client-tauri build:installer`
   (needs the signing env vars, see above). Output lands in
   `target/release/bundle/nsis/` as `Chrono PC Client_<version>_x64-setup.exe`
   plus a `.exe.sig` updater signature.
3. **Publish** to `izur-it/chrono`, renaming the asset to the hyphenated convention:
   `gh release create v<version> --repo izur-it/chrono --title "Chrono PC Client v<version>" --latest <exe> <exe>.sig`.
4. **Point the updater at it** — populate the global `release-manifest` Setting
   (`scope='pc-client'`, `key='release-manifest'`, `tenantId`/`branchId` null) with
   `{ version, notes, pubDate, platforms: { "windows-x86_64": { url, signature } } }`,
   where `url` is the public `izur-it/chrono` asset download URL and `signature` is the
   full contents of the `.exe.sig`. The production `chrono-api`
   (`GET /api/v1/device/updates/{target}/{arch}/{current}`) reads this row and serves
   it only when the manifest version is greater than the requesting client's version.
   Verify with
   `curl https://chrono.api.izur.com.ph/api/v1/device/updates/windows/x86_64/<older-version>`.
