# Chrono station deployment hardening

The Chrono station's anti-tamper design is **defense-in-depth**: the app code
(the Tauri UI + the `chrono-guard` LocalSystem service) is only as strong as the
Windows image it runs on. Several controls are **OS/deployment-level, not app
code** — the guard cannot create them for you. This document is the operator
checklist that makes the anti-tamper real. "The customer truly cannot remove it"
is only true on a correctly-provisioned machine.

Threat model: a determined, tech-savvy **non-administrator** customer seated at
the PC, trying to get free time or escape the lockdown. Café staff/admins deploy
the machine and hold the only administrator credentials. The server
(`chrono-api`) is the source of truth for sessions, time, and balance.

## Operator prerequisites (do these on the kiosk image)

### 1. The customer runs as a STANDARD (non-admin) user, WITH a password

- Create a dedicated, **standard (non-administrator)** Windows account for the
  customer. A customer who is a local administrator can undo everything below;
  this is the single most important control.
- **The account MUST have a password.** `LockWorkStation` (the guard's core
  enforcement primitive, re-asserted every tick in any non-session state) is
  **dismissible on a password-less or autologin-no-password account** — the lock
  screen just dismisses itself and the customer is back on the desktop. See
  `guard/src/enforcement.rs` (the `tick()` doc comment). `install-service.ps1`
  **fails the install** if `-KioskUsername` points at a local account with no
  password (`PasswordLastSet` empty or `PasswordRequired` false); set one with
  `net user <kioskuser> *` and re-run. Domain accounts can't be checked locally,
  so the installer warns instead — ensure the password there yourself.

### 2. Admin-write-only install directory

- Install under **`C:\Program Files\Chrono Station Guard`** (the installer
  default). `Program Files` is writable only by administrators, so the customer
  cannot replace `chrono-guard.exe` or the UI binary with a tampered build.
- Do **not** install into a user-writable location (`%LOCALAPPDATA%`, the
  Desktop, a data drive with loose ACLs, etc.).

### 3. Run the installer elevated

- `install-service.ps1`, `verify-install.ps1`, and `uninstall-service.ps1` are
  marked `#Requires -RunAsAdministrator`. Run them from an **elevated** PowerShell
  prompt. Creating the LocalSystem service, setting the service security
  descriptor, writing the HKLM policy baseline, and ACL-locking the secret store
  all require administrator rights.

### 4. HKLM policies + user-hive ACL lock (what they do)

`apply-kiosk-policy.ps1` (invoked by the installer when `-KioskUsername` is set)
applies two layers so a standard customer cannot revert the lockdown:

- A **machine-wide HKLM baseline** under `HKLM\...\Policies` — `DisableTaskMgr`,
  `DisableCMD`, and the Explorer restrictions `NoRun` / `NoWinKeys` / `NoClose` /
  `NoLogoff`. HKLM is admin-write-only, so a non-admin cannot clear it.
- **Per-user policy values** written into the customer's own hive, with the
  policy subkeys **ACL-locked** against the customer (a Deny ACE via
  `Lock-PolicyKeyAgainstUser`). `DisableTaskMgr` / `DisableCMD` are User-Config
  policies with no reliable HKLM equivalent, so the ACL lock is their real
  protection: the customer can see the values but cannot change or delete them;
  only SYSTEM/Administrators can.

`revert-kiosk-policy.ps1` reverses both layers — it strips the Deny ACE first
(`Unlock-PolicyKeyForUser`), then removes the per-user values and the HKLM
baseline — so uninstall fully restores the account.

### 5. Safe-Mode registration

- A Safe-Mode boot normally starts only a minimal set of services — a customer
  could reboot into Safe Mode to bypass enforcement. The installer registers the
  guard under `HKLM\SYSTEM\CurrentControlSet\Control\SafeBoot\Minimal\ChronoGuard`
  and `...\Network\ChronoGuard` (each `(Default) = "Service"`), so Windows starts
  `ChronoGuard` in Safe Mode too. `verify-install.ps1` checks both keys exist;
  `uninstall-service.ps1` removes them.

### 6. Service cannot be stopped or deleted by the customer

- The installer applies a **hardened service security descriptor** via
  `sc.exe sdset`: SYSTEM and Administrators get full control; Interactive and
  Service-logon users get query/enumerate/interrogate **only** — no
  `SERVICE_START`, `SERVICE_STOP`, or `DELETE`. A customer's `sc stop` /
  `net stop` / `sc delete` is denied.
- `sc.exe failureflag ChronoGuard 1` makes the SCM recovery actions (automatic
  restart) fire on **any** stop, not only a crash exit — so even a stop that
  somehow succeeds is immediately restarted. `verify-install.ps1` checks both.

### 7. Recovery PIN (operator unlock)

- The operator recovery PIN (used at the kiosk recovery chord to reach
  maintenance) is **verified inside the LocalSystem guard**, never by the
  non-admin UI. It is stored as a **salted PBKDF2 record** (`recovery.hash`) in
  the ACL'd secret store `%ProgramData%\Chrono` (SYSTEM + Administrators only),
  so the customer can neither read it nor brute-force a short PIN offline.
- Require **≥ 8 characters** (the installer enforces this for `-RecoveryPin`).
  **Never** store or log the plaintext PIN; the installer derives the record via
  the guard over stdin so the PIN never hits disk or the process command line.
- The PIN is optional — if you don't configure one, `recovery.hash` is absent and
  `verify-install.ps1` warns (does not fail).

### 8. Code-signing

- Sign the installer with `scripts/sign-installer.ps1`
  (`bundle.windows.signCommand`). For an internally-provisioned fleet a
  **self-signed** cert is acceptable: sign with it, then import the public `.cer`
  into each kiosk's Trusted Publisher store (the installer does this automatically
  from `-CodeSignCertPath` or the bundled `resources\codesign\chrono-codesign.cer`).
  A purchased CA-issued Authenticode cert is the eventual goal for public trust.
  See the "Updater & code signing" section of the main `README.md`.

## Recommended: resist offline-disk tampering

The controls above assume the machine boots the provisioned Windows image. A
customer with physical access could otherwise **boot another OS** (USB/live Linux)
and edit files or registry hives offline, bypassing every ACL. To resist this:

- **Enable Secure Boot** (UEFI) so only the signed boot chain can run — this
  blocks booting an unsigned live OS to edit the disk.
- **Enable BitLocker** full-disk encryption (ideally TPM-backed) so the disk
  cannot be read or modified from another OS without the key.

These are strongly recommended for any unattended, physically-exposed kiosk.

## DEVICE TOKEN — known limitation / follow-up

The station's **device token** (the bearer credential the station uses to call
`chrono-api`) is currently stored **user-scope** by the UI (user-scope DPAPI).

- Moving it to **machine-scope DPAPI would NOT protect it** from the logged-in
  customer: *any* local user can `CryptUnprotectData` a machine-scope DPAPI blob.
  So machine-scope DPAPI is **not** a fix and is deliberately **not changed** here.
- The real fix is to have the **LocalSystem guard own the token** in the ACL'd
  secret store (`%ProgramData%\Chrono`, SYSTEM + Administrators only), out of the
  customer's reach entirely. That is a tracked **follow-up**, not in this change.
- **Today's mitigation:** the server already rejects a token **replayed from
  another machine** via the `x-device-fingerprint` binding enforced in
  `apps/gaming-api` `device-auth-middleware`. A copied token does not buy a
  session on a different device.

## Manual Windows validation checklist

These can only be verified on a **real kiosk image** (they depend on live Windows
behavior and a running `chrono-api`). Run them as the **customer (standard user)**
unless noted, and record results before signing off a build:

- [ ] **Service can't be stopped/deleted as the customer** — `sc stop ChronoGuard`,
      `net stop ChronoGuard`, and `sc delete ChronoGuard` are all **Access denied**.
- [ ] **Killing the UI re-locks + the watchdog relaunches it** — `taskkill` the
      station UI; the machine stays/locks (not free) and the UI is relaunched.
- [ ] **Backward clock change SAFE_LOCKs** — set the system clock **backward**
      during an active session; the guard SAFE_LOCKs instead of extending time.
      (Normal forward NTP drift < ~10s does not trip it.)
- [ ] **`HKCU` `NODE_ENV=development` no longer disables lockdown** — set it in the
      customer hive, relaunch; lockdown stays ON (decided from machine scope /
      compile-time, not the user-inheritable env var).
- [ ] **Task Mgr / CMD / Run stay disabled and can't be reverted by the customer**
      — confirm each is blocked, and that the customer cannot clear the policy
      values (ACL-locked) in their own hive.
- [ ] **Recovery chord → PIN → maintenance works** — the operator recovery chord
      prompts for the PIN, a correct PIN reaches maintenance, a wrong PIN does not.
- [ ] **A signed `/ping` with a far-future end can't unlock** — forge a valid
      signed `/ping` asserting a far-future `scheduledEndAt`; the guard does **not**
      unlock/extend (`/ping` is liveness-only; session state comes from the server).
- [ ] **Safe-Mode boot still runs the guard** — reboot into Safe Mode (Minimal and
      Network); `ChronoGuard` is running and enforcing.
- [ ] **`recovery.hash` is unreadable by the customer** — as the standard user,
      attempting to read `%ProgramData%\Chrono\recovery.hash` (and the rest of the
      secret store) is **Access denied**.
