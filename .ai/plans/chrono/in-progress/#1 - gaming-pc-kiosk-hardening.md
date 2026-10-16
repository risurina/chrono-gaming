# Chrono — `gaming-pc-kiosk-hardening`

**Sessions:**
- Planning: Claude Code (main session)
- Audit: _(unclaimed)_
- Implementation: Claude Code (main session, worktree `worktree-gaming-pc-hardening`)

**Status:** IN PROGRESS — accepted. Phase 1 underway.
- Phase 1 (quick wins): env-var lockdown bypass fixed (machine-only `kiosk_env`); SCM
  `sdset`/`failureflag` + PIN salt/relocation + HKLM policies + `/ping` cap pending.
- Correction: the recovery-PIN code is `src-tauri/src/recovery.rs` (not `guard/src/recovery.rs`).

## What this is

Raise the `apps/gaming-pc` kiosk (Tauri client + `chrono-guard` Windows service) to a
**high-grade, defense-in-depth anti-tamper bar** against a determined, tech-savvy
**non-administrator** customer seated at the PC. Driven by the 2026-10 defensive security
review (recorded inline below). Two developer decisions are locked in and shape this plan:

1. **Keystone (unlock trust) = server-authoritative guard.** The guard validates session
   state with `chrono-api` using the device bearer token; the UI `/ping` becomes
   **liveness-only** and can no longer assert `scheduledEndAt`/`activeSessionId`. A leaked
   `control.key` can therefore never buy session time.
2. **Plan-first**, then implement Critical/High + quick wins in a worktree.

## Current posture (what already works — do NOT regress)

Verified in the review; these are the load-bearing strengths every phase must preserve:

- Guard is a separate LocalSystem process; boots **fail-closed** (`guard/src/store.rs:20-47`,
  default `LOCKED` `guard/src/state.rs:38`) and re-asserts `LockWorkStation` every tick in
  any non-session state (`guard/src/enforcement.rs:100-119`) — killing the UI leaves the
  machine **locked, not free**.
- Loopback control channel is HMAC-SHA256 signed, 60s freshness window, nonce replay cache,
  constant-time compare (`guard/src/control.rs:78-135`, `crates/chrono-control/src/canonical.rs:54-86`),
  loopback-bind only (`guard/src/main.rs:127-128`).
- Watchdog relaunch + 5/60s circuit breaker + panic-supervised loops + SCM crash recovery
  (`guard/src/watchdog.rs:69-142`, `guard/src/supervise.rs`, `scripts/install-service.ps1:82`).
- Offline = fail-closed (`guard/src/enforcement.rs:44-78`); tampered/`UNLOCKED` sealed state
  boots `LOCKED` (`guard/src/store.rs:24-41`).
- Minimal Tauri capability allowlist (`src-tauri/capabilities/default.json`, no fs/shell/http/process
  to the webview), renderer command allowlist + protected state fields
  (`src-tauri/src/command_auth.rs:29-30`, `src-tauri/src/commands/state.rs:47-55`).

## Pass 1 — Workflow Analysis

- **Who / threat model:** a non-admin customer (possibly tech-savvy) at the kiosk trying to
  get free time or escape the lockdown. Operators (café staff/admin) deploy the machine and
  hold admin. The server (`chrono-api`) is the source of truth for sessions/time/balance.
- **Workflow enabled:** a hardened station that (a) cannot be uninstalled/stopped/killed by
  the customer, (b) self-restarts and re-locks on any force-close, (c) cannot be cheated by
  clock, env-var, registry, key-leak, or device-clone tampering, and (d) reports every tamper
  attempt to the server.
- **Failure cases to cover:** backward/forward clock change; `HKCU` env/policy edits; killing
  UI or guard; pulling the network; Safe-Mode boot; password-less kiosk account; reading the
  device token / control key off disk; forging a `/ping`.
- **Audit/notifications:** every tamper detection raises a server security-alert
  (`POST /api/v1/device/security-alert`, already live) and a bounded offline event queue
  replays on reconnect (`guard/src/heartbeat.rs:38-84`).

## Pass 2 — Technical Planning

- Server authority for sessions already exists: **`GET /api/v1/device/session/active`**
  (`apps/gaming-api/src/modules/device/status-routes.ts`) returns the device-station's active
  session incl. `scheduledEndAt`, authenticated by `requireDeviceBearerAuth()` (bearer device
  token + `x-device-fingerprint`). The guard will consume this directly — **no new server
  route required** for Phase 3 (a signed-time addition is optional, see Phase 2).
- The guard can already reach the DPAPI secret store (`guard/src/store.rs`,
  `crates/chrono-control/src/secret.rs`) where the device token lives, so it can authenticate
  its own server calls without the UI handing it anything.
- OS/deployment-level controls (standard-user account + password, HKLM Group Policy, Safe-Mode
  service registration, `sc sdset`, code-signing) live in `scripts/*.ps1` + documented GPO,
  **not** app code alone. The plan calls these out explicitly per phase; "customer truly can't
  remove it" is only true on a correctly-provisioned machine.

### Boundaries touched
- `apps/gaming-pc/guard/src/**` (Rust service — most changes)
- `apps/gaming-pc/src-tauri/src/**` (Tauri core — env-source, ping shape)
- `apps/gaming-pc/scripts/*.ps1` (install/policy hardening)
- `apps/gaming-pc/crates/chrono-control/src/**` (secret scope)
- `apps/gaming-api/src/modules/device/**` (only IF Phase 2 adds signed server time — optional)
- `apps/gaming-pc/README.md` + a new `docs/` deployment-prerequisites note

---

## Phases

### Phase 1 — Quick wins (no architecture change) — DRAFT

Close the cheap, high-value gaps that don't need re-architecture.

- **Files to update:**
  - `src-tauri/src/kiosk.rs` (`is_dev`/`lockdown_enabled` env reads `:51-64`),
    `src-tauri/src/policy.rs` (`:63-65`), `src-tauri/src/shortcuts.rs` (`:26-28`) — stop reading
    dev/lockdown from the **user-inheritable** `NODE_ENV`/`KIOSK_LOCKDOWN_ENABLED`. Decide from a
    **compile-time** `cfg!(debug_assertions)`/Cargo feature OR the machine-scoped `CHRONO_ENV`
    the guard already trusts (machine env, not HKCU). Lockdown must default **ON** in release.
  - `src-tauri/src/policy.rs` (`:33-46`) + `scripts/apply-kiosk-policy.ps1` (`:79-95`) — write
    `DisableTaskMgr`/`DisableCMD`/`NoRun` to **HKLM\SOFTWARE\Policies** (admin-only to revert),
    not `HKCU`.
  - `guard/src/recovery.rs` (`:14-25`) + `scripts/install-service.ps1` (`:151-154`) — **salt**
    the recovery PIN hash (random per-install salt), require ≥8 chars, and store the hash where a
    standard user cannot read it (not a world-readable machine env var).
  - `scripts/install-service.ps1` (`:82`) — add `sc sdset` denying `SERVICE_STOP`/`DELETE` to
    everyone but SYSTEM/Admins, and set `sc failureflag= 1` so recovery fires on any stop, not
    only a crash. Reflect checks in `scripts/verify-install.ps1`.
  - `guard/src/control.rs` (`/ping` handler `:167-192`) — **interim cap**: reject any
    `scheduledEndAt` more than N minutes beyond `now` (bounds blast radius before Phase 3
    removes UI-asserted end-time entirely).
- **Step-by-step tasks:** (1) env-source refactor + release-default-on; (2) HKLM policy move
  (+ revert script); (3) salted PIN + protected hash storage; (4) SCM SD + failure-flag hardening
  + verify-install assertions; (5) `/ping` end-time cap.
- **Acceptance criteria:** setting `HKCU\Environment\NODE_ENV=development` no longer disables
  lockdown on relaunch; Task-Mgr/CMD/Run stay disabled after a non-admin reverts their own HKCU;
  recovery PIN hash is salted and not in a world-readable location; a non-admin `sc stop`/delete
  is denied and any stop triggers restart; a forged `/ping` cannot assert an end-time beyond the cap.
- **Verification:** `cargo check` (guard + src-tauri) in `apps/gaming-pc/src-tauri`;
  `pnpm --filter @chrono/pc-client-tauri typecheck`; PowerShell lint of changed scripts;
  manual `sc sdset`/`verify-install.ps1` dry-read (documented, needs a Windows box).
- **Out of scope:** the server-authoritative rewrite (Phase 3); token binding (Phase 4).
- **Execution start point:** read `src-tauri/src/{kiosk,policy,shortcuts}.rs`,
  `guard/src/recovery.rs`, `scripts/{install-service,apply-kiosk-policy,verify-install}.ps1` in full.

### Phase 2 — Guard-side monotonic clock-jump detection — DRAFT

Remove the guard's sole reliance on the wall clock for expiry.

- **Files to update:** `guard/src/enforcement.rs` (`:44-78`, `tick` `:102`), `guard/src/control.rs`
  (`now_ms` `:51-56`). Capture a `(std::time::Instant, SystemTime)` anchor at unlock; compute
  remaining time from the **monotonic** `Instant` delta, and on each tick compare monotonic vs
  wall-clock delta — SAFE_LOCK + `CLOCK_DRIFT_DETECTED` security-alert on >~10s divergence,
  mirroring the UI's existing check (`src-tauri/src/heartbeat.rs:31-33,176-205`).
- **Optional server signed-time:** if we want cryptographic trust, add a signed `serverTime` to
  the device status response (`apps/gaming-api/.../device/status-routes.ts`) and have the guard
  anchor to it. Flag as optional; the monotonic check alone closes the named gap.
- **Acceptance criteria:** moving the system clock backward while a session is active does NOT
  extend the guard-enforced session (guard SAFE_LOCKs); normal NTP drift (<10s) does not trip it.
- **Verification:** `cargo check`; a guard unit test simulating an injected wall-clock jump
  against a fake monotonic source.
- **Out of scope:** UI cosmetic countdown (`pc-client-runtime.ts:419-446`) — authoritative
  expiry is guard+server; optionally re-anchor the UI countdown as a follow-up.
- **Execution start point:** read `guard/src/{enforcement,control}.rs` + `src-tauri/src/heartbeat.rs`.

### Phase 3 — Keystone: server-authoritative session state — DRAFT

Make the guard trust the **server**, not the UI, for whether/until-when the station is unlocked.

- **Files to update:**
  - New `guard/src/session_sync.rs` — a guard-side HTTPS client that reads the device bearer
    token from the DPAPI store (`guard/src/store.rs`), calls
    `GET /api/v1/device/session/active` (bearer + `x-device-fingerprint`) on a short interval,
    and derives the authoritative `scheduled_end_at`/`activeSessionId`.
  - `guard/src/control.rs` (`/ping` `:167-192`) — make `/ping` **liveness-only**: it updates the
    last-seen timestamp and MUST ignore any client-supplied `scheduledEndAt`/`activeSessionId`
    (remove that acceptance path entirely). The interim cap from Phase 1 is superseded.
  - `guard/src/enforcement.rs` — enforce from the server-derived session state (+ Phase 2
    monotonic anchor), not from a UI-asserted end-time.
  - `src-tauri/src/guard_ping.rs` + the webview ping path — stop sending session end-time; send
    liveness only.
  - Confirm `apps/gaming-api/.../device/status-routes.ts` returns everything the guard needs
    (it already returns `scheduledEndAt`); add fields only if a gap is found.
- **Acceptance criteria:** with a VALID server session the station unlocks for exactly the
  server's `scheduledEndAt`; a holder of `control.key` forging `/ping` CANNOT unlock or extend
  (the guard ignores client end-time and re-derives from the server); when the server reports no
  active session, the guard locks; offline, the guard keeps the last server-validated window and
  then fail-closes at its end (no indefinite free time).
- **Verification:** `cargo check`; guard test: a signed `/ping` with a far-future `scheduledEndAt`
  does not change `lock_state`/`scheduled_end_at`; manual pairing→approve→session→kill-UI→forge-ping
  smoke on a dev box (documented; needs a running `chrono-api`).
- **Dependencies:** Phase 2's monotonic anchor; the guard must be able to read the device token
  from the store (verify `store.rs` exposes it to the guard process).
- **Out of scope:** control-key *distribution* to the UI is now moot for unlock power, but still
  resolve the UI's read-access contradiction (Top Risk #1) — either hand the UI a per-boot
  ephemeral liveness key over the authenticated channel, or run the UI under a dedicated non-customer
  identity. Pick during implementation; it no longer gates session time.
- **Execution start point:** read `guard/src/{control,store,enforcement}.rs`,
  `src-tauri/src/guard_ping.rs`, `apps/gaming-api/src/modules/device/{status-routes,device-auth-middleware}.ts`.

### Phase 4 — Device-token binding + boot/account hardening — DRAFT

- **Files to update:**
  - `src-tauri/src/secure.rs` (`:67-75`) / `crates/chrono-control/src/secret.rs` — move the
    device token / provision token from **user-scope** DPAPI to **machine-scope** DPAPI (or TPM),
    so the logged-in customer cannot `CryptUnprotectData` it; treat the hardware fingerprint
    (`src-tauri/src/identity.rs`) as **non-secret** and add a server-side device-binding check.
  - `scripts/install-service.ps1` — register the service to run in **Safe Mode**
    (`SYSTEM\CurrentControlSet\Control\SafeBoot\{Minimal,Network}\chrono-guard`); require the
    kiosk Windows account to **have a password** (fail install / `verify-install.ps1` otherwise,
    since `LockWorkStation` is dismissible on a password-less account —
    `guard/src/enforcement.rs:92-99`).
  - New `apps/gaming-pc/docs/deployment-hardening.md` — the deployment prerequisites that make the
    anti-tamper real: customer = standard (non-admin) user with a password, admin-write-only
    install dirs, HKLM policies, optional Secure Boot/BitLocker to resist offline disk edits,
    code-signing (`scripts/sign-installer.ps1`).
  - (Server, optional) `apps/gaming-api/src/modules/device/*` — strengthen device-token binding
    (bind to additional attested signals) so a copied token from one machine is rejected.
- **Acceptance criteria:** the device token on disk is not decryptable by the kiosk user; a token
  copied to another machine is rejected server-side; a Safe-Mode boot still starts the guard; the
  installer refuses a password-less kiosk account; deployment doc merged.
- **Verification:** `cargo check`; `pnpm --filter @chrono/gaming-api typecheck` (if server touched)
  + `pnpm --filter @chrono/gaming-api rls:proof` if any tenant-scoped query/schema changes; manual
  machine-scope DPAPI + Safe-Mode checks (documented, Windows box).
- **Out of scope:** TPM attestation beyond machine-scope DPAPI if TPM isn't guaranteed on target
  hardware (decide during implementation); the Node `apps/gaming-pc-service` (no source in repo).

### Phase 5 — Verification & docs — DRAFT

- `cargo check`/`cargo test` for guard + src-tauri; `pnpm --filter @chrono/pc-client-tauri typecheck`
  + `build`; `pnpm -r typecheck` workspace-green; server checks if Phase 2/4 touched the API.
- A manual Windows-box smoke matrix (the review's "could not assess" list): SCM SD, Safe-Mode,
  password-less lock UX, Ctrl+Alt+Del/SAS, UAC/secondary-monitor escape, devtools-in-release,
  USB/autorun — run on a real kiosk image and record results before closing.
- Update `apps/gaming-pc/README.md` + `guard/README.md` with the new trust model + prerequisites.

## Out of Scope (whole plan)

- `apps/gaming-pc-service` (Node) — no source in the repo; nothing to harden here yet.
- Full TPM/remote-attestation stack beyond machine-scope DPAPI + server binding.
- Webview `uiConfig` "JSON Render" XSS surface (`local-client-state.ts:63-65`) — separate review
  if that path can inject active content.
- Anything requiring a running Windows kiosk image is **verified manually in Phase 5**, not in CI.

## Open Questions

1. Phase 2 optional signed server-time: worth the server change, or is the guard monotonic check
   sufficient? (Default: monotonic check only.)
2. Phase 3 UI liveness-key distribution: per-boot ephemeral key vs dedicated UI service account —
   decide at implementation (no longer gates session time).
3. Phase 4: machine-scope DPAPI sufficient, or require TPM? (Depends on guaranteed target hardware.)

## Findings reference

Full 2026-10 review (8-threat assessment with `file:line` evidence, top risks, quick wins) is the
basis for the phases above; key anchors are cited inline per phase.
