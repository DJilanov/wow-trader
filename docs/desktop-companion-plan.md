# WoW Trader Desktop Companion Plan

## Implementation status — 2026-09-16

Phases A through C are implemented for maintainer alpha. `packages/companion-core` owns the shared,
serialized multi-product scan service and the CLI is a thin adapter. `apps/desktop` now provides the
Electron Forge shell, local React dashboard, sandboxed custom-protocol renderer, validated narrow
IPC, utility-process parsing/upload work, OS-encrypted credentials, product discovery, verified
addon install/update, tray lifecycle, login startup, notifications, manual check/retry, bounded
activity history, rotating redacted logs, resume reconciliation, and legacy LaunchAgent removal.

The current macOS x64 package has passed a packaged runtime smoke: the local renderer loaded, its
preload API was present, TBC/Auctionator/collector discovery rendered without horizontal overflow,
the utility process remained alive, a manual reconciliation crossed IPC successfully, closing the
window left the process running, and a second launch focused the single existing instance. Core and
desktop regression suites cover v1 state migration, one-time upload/idempotency, IPC rejection, and
checksum-verified addon installation.

This is deliberately an **unsigned maintainer-alpha package**, not the public release. Phase D
(one-time per-installation pairing and revocation) and Phase E (branded artwork, signing,
notarization, Windows packaging validation, and controlled rollout) remain required. The alpha token
field accepts only a dedicated revocable ingestion token and must never be populated with a shared
secret in a distributed build.

## 1. Product decision

Build a local, signed Electron application named **WoW Trader Companion**. It becomes the supported
player-facing upload path and reuses the validated TypeScript SavedVariables pipeline already in the
repository.

The normal interface has one persistent `Automatic uploads` toggle. It does not expose a technical
`Start watcher` button. A secondary `Check for scans now` action immediately reconciles stable files
and uploads anything pending; it cannot see a scan that WoW has not written through `/reload` or
logout.

Closing the window hides it to the tray. Choosing `Quit WoW Trader Companion` stops the background
service. `Start at login` uses Electron's operating-system integration. The current macOS
LaunchAgent remains a maintainer fallback during migration and must not run beside the packaged app.

## 2. Player experience

### First run

1. Detect TBC and Forever product directories where possible; allow `Choose WoW folder` for custom
   installations.
2. Check each product for Auctionator and `WowTraderCollector`, including the collector version.
3. Offer a scoped `Install collector` or `Update collector` action. Copy only the packaged addon,
   verify its manifest/checksums, and never modify `WTF` or another addon.
4. Pair the desktop installation with the ingestion service. Never ship a shared bearer key in the
   application.
5. Enable `Automatic uploads` and optionally `Start at login`.
6. Show the exact in-game flow: open the AH, run an Auctionator full scan, then `/reload` or log out.

### Main window

The compact dashboard contains:

- Overall state and the next player action.
- One card per configured WoW product: installation/addon health, accounts discovered, latest file
  flush, pending scans, and last processed upload.
- The private source character, realm, market count, scan time, and server receipt for the last scan.
- `Automatic uploads`, `Check for scans now`, and contextual `Retry upload` controls.
- A bounded activity list with redacted diagnostic details.
- Links to Trader, logs, installation settings, and privacy information.

The status vocabulary is fixed and shared between the engine, tray, and renderer:

| State                    | Meaning                                                   | Primary action                   |
| ------------------------ | --------------------------------------------------------- | -------------------------------- |
| `setup_required`         | No valid product/addon or no paired credential            | Complete setup                   |
| `paused`                 | Automatic uploads are disabled                            | Enable automatic uploads         |
| `waiting_for_saved_scan` | Files are current; a new in-memory scan is not observable | Scan in game, then `/reload`     |
| `scan_detected`          | An unseen stable scan exists                              | None; transition immediately     |
| `uploading`              | Payload is being sent                                     | Wait/cancel only on app quit     |
| `processing`             | API accepted it and normalization is pending              | Wait                             |
| `up_to_date`             | All visible scan IDs are processed                        | None                             |
| `offline`                | Network is unavailable; data remains queued               | Retry automatically/manual check |
| `error`                  | Configuration, parse, auth, rejection, or server failure  | Contextual repair/retry          |

The application cannot truthfully distinguish “the player has not scanned” from “the scan exists
only in WoW memory.” Therefore the UI says `Waiting for a saved scan`, with the `/reload` boundary,
instead of claiming it can see scan progress.

### Tray

- Left click opens/hides the dashboard.
- Menu shows the current state, `Check for scans now`, automatic-upload toggle, Trader link, logs,
  and Quit.
- Icon states: neutral/waiting, active upload, success, warning/error, paused.
- Optional notifications are limited to upload success, actionable failure, addon update, and a
  configurable “scan due” reminder. A reminder never claims it can start the AH scan.

## 3. Repository architecture

```text
packages/companion-core/
  src/contracts.ts       # public commands, events, snapshots, settings
  src/service.ts         # single serialized watcher/upload state machine
  src/discovery.ts       # product/account/addon discovery
  src/saved-variables.ts # safe Lua parser
  src/uploads.ts         # checksum, POST, processing receipt polling
  src/state.ts           # versioned atomic state/settings migrations
  src/retry.ts           # bounded retry scheduler
  src/logging.ts         # redacted structured events

apps/companion/
  src/cli.ts             # thin diagnostic adapter over companion-core

apps/desktop/
  src/main/              # Electron lifecycle, tray, safe storage, dialogs, IPC
  src/utility/           # companion-core host; filesystem, parsing, upload work
  src/preload/           # narrow contextBridge API
  src/renderer/          # local React UI
  src/shared/            # IPC schemas/types only
  assets/                # icons and packaged addon
  forge.config.ts        # makers, signing hooks, fuses
```

`@wow-trader/companion-core` must have no Electron or renderer dependency. The CLI and Electron main
process consume the same public service, ensuring that parser, stability, retry, checksum, and
idempotency behavior cannot drift.

### Core service surface

The exported surface should remain narrow:

```ts
interface CompanionService {
  start(): Promise<void>;
  stop(): Promise<void>;
  setAutomaticUploads(enabled: boolean): Promise<void>;
  checkNow(): Promise<CompanionSnapshot>;
  retryFailed(scanId?: string): Promise<CompanionSnapshot>;
  updateProducts(products: readonly ProductConfiguration[]): Promise<void>;
  getSnapshot(): CompanionSnapshot;
  subscribe(listener: (snapshot: CompanionSnapshot) => void): () => void;
}
```

Implementation rules:

- Serialize reconciliation passes; timer, filesystem signal, resume, and manual check cannot upload
  concurrently.
- Discover every account-wide collector file under every enabled product root.
- Require stable size and modification time before parsing.
- Use immutable scan/payload IDs and the server uniqueness constraints for replay safety.
- Mark a scan locally complete only after `processed` or an identical processed duplicate receipt.
- Keep rejected and uncertain requests retryable with the existing five-second-to-five-minute
  bounded schedule.
- Use `AbortController` for shutdown; never leave an upload or status poll detached on app exit.
- Reconcile immediately after system resume and network restoration.
- Retain a periodic reconciliation even if filesystem notifications are added, because native file
  events can be coalesced or lost.

The first desktop release should retain the proven polling implementation. A later power-usage pass
may add filesystem hints plus a slower reconciliation interval, but must keep the polling fallback.

### Durable local data

Use atomic, Zod-validated JSON rather than SQLite for the first release; the state is small and does
not need relational queries.

- `settings.json`: schema version, configured product roots, enabled products, automatic uploads,
  notification preference, and non-secret UI settings.
- `state.json`: processed scan IDs, bounded activity summaries, last successful scan, and retry
  metadata needed across restart.
- `credential.bin`: only an Electron `safeStorage` encrypted installation token.
- `logs/*.jsonl`: rotating structured logs with scan IDs and error codes, never the token, raw
  payload, item links, or full character GUID.

State migration must import the existing CLI `uploadedScanIds` so installing Electron cannot replay
all locally visible scans. The uninstall path retains state by default and offers an explicit
`Remove local data` action separately.

## 4. Electron boundary

### Main process

The main process owns all privileged behavior:

- Companion service lifecycle.
- Product and addon discovery/installation.
- Network requests and credentials.
- Tray, notifications, native folder dialog, login startup, updater, and logs.
- Single-instance enforcement; a second launch focuses the existing window.

The window loads packaged local renderer code only. Do not load the Helper website as the Electron
renderer.

The existing raw envelopes are several megabytes, so SavedVariables parsing, normalization,
checksum work, and uploads must not execute on the Electron main/renderer thread. Host
`CompanionService` in an Electron utility process and exchange validated commands/snapshots with the
main process. The main process decrypts the installation token and transfers it in memory after the
utility process starts; the token never appears in command arguments or environment variables. If
the utility process crashes, expose an error, restart it with bounded backoff, and preserve queued
work through durable core state.

### Preload and IPC

Expose one typed operation per use case through `contextBridge`; never expose `ipcRenderer`, file
paths, Node APIs, or a generic `send` function.

```ts
interface WowTraderDesktopApi {
  getSnapshot(): Promise<CompanionSnapshot>;
  checkNow(): Promise<CompanionSnapshot>;
  retryFailed(scanId?: string): Promise<CompanionSnapshot>;
  setAutomaticUploads(enabled: boolean): Promise<CompanionSnapshot>;
  setStartAtLogin(enabled: boolean): Promise<CompanionSnapshot>;
  chooseProductRoot(product: ProductKind): Promise<CompanionSnapshot>;
  installCollector(product: ProductKind): Promise<CompanionSnapshot>;
  openTrader(): Promise<void>;
  openLogs(): Promise<void>;
  subscribe(listener: (snapshot: CompanionSnapshot) => void): () => void;
}
```

Every IPC request and response uses shared Zod schemas. Main-process handlers validate the sender,
allow only the packaged application origin, reject unexpected arguments, and return stable error
codes rather than stack traces.

### Renderer

Use React and the existing KFC/Helper visual language, but keep this a focused utility rather than a
miniature website. The renderer receives serializable snapshots only. It has no direct filesystem,
network-token, shell, or Electron access.

Required complete states: onboarding, loading, empty/no installation, missing addon, addon outdated,
waiting, uploading, processing, success, paused, offline, auth expired, payload rejected, generic
error, and update available.

## 5. Authentication and privacy

### Internal alpha

Allow a maintainer to paste or import a dedicated, separately revocable ingestion token once. Send
it directly to the main process and encrypt it immediately with Electron `safeStorage`; never put it
in renderer state, settings JSON, logs, crash data, or process arguments.

### Guild/public release

Do not embed the existing shared ingestion key. Add one-time pairing:

1. An approved operator generates a short-lived, single-use pairing code.
2. The player enters the code in the desktop app.
3. The API exchanges it for a random installation token scoped to `auction_scan:write` and allowed
   products.
4. The app stores the token with `safeStorage`; the server stores only a hash and display prefix.
5. Tokens are individually rate limited, auditable, expirable/revocable, and rotate without an app
   update.

Suggested server tables are `companion_installation` and `companion_pairing_code`; add last-seen,
revoked-at, allowed-product, token-hash, and audit metadata. Keep the current static API-key path
during migration, then reserve it for maintainers.

Character name, realm, faction, and GUID remain private ingestion provenance. UI may show them
locally; public market and status endpoints must not expose them. Diagnostic export replaces the
name/GUID with a local pseudonym unless the player explicitly includes private detail.

## 6. Security baseline

- Current stable Electron version, updated routinely.
- Electron Forge for packaging; use its stable Webpack integration rather than the currently
  experimental Forge Vite plugin.
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- Restrictive CSP and a privileged custom local protocol rather than permissive `file://` access.
- Deny permissions, unexpected navigation, new windows, downloads, and unapproved protocols.
- `shell.openExternal` accepts only hardcoded HTTPS Helper/KFC origins.
- Package with ASAR, embedded ASAR integrity validation, and `OnlyLoadAppFromAsar`.
- Disable `RunAsNode`, `NODE_OPTIONS`, and production inspector fuses when compatible with packaged
  smoke testing.
- Never disable TLS validation. Production uploads target the allowlisted Helper HTTPS origin.
- Sign and notarize macOS builds and sign Windows installers before any public distribution.

Ship the collector addon and its checksum manifest as a read-only Forge `extraResource` rather than
trying to copy a directory from inside ASAR. Addon installation stages into a temporary sibling,
verifies every file, then renames into the chosen product's `Interface/AddOns` directory so a failed
update cannot leave a partial addon.

Electron officially recommends context isolation, renderer sandboxing, sender validation, a narrow
bridge, current releases, code signing, and Forge-based packaging. Its `safeStorage` asynchronous API
uses operating-system key providers and should be used only after the app is ready/signed so macOS
recognizes successive builds consistently.

## 7. Packaging and updating

Use Electron Forge makers:

- macOS: signed/notarized arm64 and x64 (or a verified universal build), DMG for installation, and
  ZIP update artifact.
- Windows: signed x64 Squirrel installer and update artifacts.
- Linux: explicitly deferred until there is a supported desktop/keyring target.

CI builds each operating system on its native runner, runs unit/integration/UI tests, packages, then
validates signatures and artifacts before publishing. Signing/notarization secrets live only in CI
secret storage.

Automatic updates are a separate release gate. Electron's built-in updater supports macOS and
Windows, and macOS updating requires a signed app. The app checks periodically, downloads in the
background, then asks the player to restart; never replace a running build during an active upload.

## 8. Delivery phases

### Phase A — Extract and stabilize the reusable engine

- Create `@wow-trader/companion-core` and move parser, discovery, state, upload, and retry code with
  history preserved where practical.
- Add `CompanionService`, snapshot contracts, serialized reconciliation, cancellation, multi-product
  roots, and state v1-to-v2 migration.
- Reduce `apps/companion` to argument parsing and console presentation.
- Keep every existing test and add fake-clock/filesystem/HTTP service tests.

Exit gate: CLI behavior remains compatible; two product roots and multiple accounts reconcile
without duplicate/concurrent uploads; uncertain HTTP outcomes survive restart.

### Phase B — Secure Electron shell and onboarding

- Add `apps/desktop` with Electron Forge, Webpack, React, main/preload/renderer separation, CSP, IPC
  validation, utility-process hosting for companion-core, single-instance handling, and local-only
  rendering.
- Implement discovery, folder selection, addon health, collector install/update, credential import,
  and safe storage.
- Add the full dashboard/status states without updater complexity.

Exit gate: a clean macOS account can install the app, locate TBC, install/update the collector, pair,
and reach `waiting_for_saved_scan` without using Terminal.

### Phase C — Automatic background operation

- Add tray lifecycle, close-to-tray, automatic upload toggle, immediate check, retry, login startup,
  offline/resume behavior, rotating logs, and redacted diagnostic export.
- Detect and offer to unload the legacy LaunchAgent before enabling desktop automatic uploads.
- Add first-run migration of the old companion state and protected key when explicitly requested.

Exit gate: after an in-game scan and `/reload`, exactly one processed database scan appears and an
already-open Trader refreshes, with the Electron window closed to tray and after a machine restart.

### Phase D — Per-installation pairing

- Add server token/pairing schema, API, operator issuance, hashing, revocation, rotation, and per-token
  limits/audit fields.
- Replace alpha credential import with pairing in release builds.
- Add auth-expired and revoked-device recovery.

Exit gate: no shared ingestion secret exists in the app, installer, update, renderer, logs, or local
plaintext files; revoking one installation does not interrupt another.

### Phase E — Packaging, signing, and controlled rollout

- Add application/tray artwork, macOS entitlements, signing/notarization, Windows signing, Forge
  makers, fuse verification, artifact checksums, and download documentation.
- Add auto-update only after signed manual upgrades preserve settings, credential, pending retries,
  and processed IDs.
- Roll out to maintainers, then a small guild cohort, then broader approved collectors.

Exit gate: signed installers pass clean-machine install/update/uninstall drills on current macOS and
Windows, and the server can revoke each installation independently.

### Phase F — Forever activation

- Add the released Forever product folder, interface number, client product/build validation, and
  its collector package only after live-client compatibility is proven.
- Show TBC and Forever independently in the same app and state store.

Exit gate: a scan from either product is attributed, validated, and routed to the correct market
without cross-product catalog contamination.

## 9. Verification matrix

Automated coverage:

- Unit: Lua safety, schemas, checksum, backoff, state migrations, redaction, product discovery, addon
  manifest verification, status reducer, and IPC schemas.
- Service integration: multiple accounts/products, mid-write file, duplicate event, offline/restart,
  delayed processing, rejection, token revocation, corrupted state, and concurrent manual/timer
  trigger.
- Electron main: sender/origin rejection, safe-storage failure, login-startup settings, second
  instance, close-to-tray, update deferral during upload, and allowlisted external links.
- Renderer: keyboard/focus, screen reader labels, loading/empty/error/success states, narrow window,
  reduced motion, and high DPI.
- Playwright Electron smoke: onboarding, fake native-folder dialog, automatic toggle, manual check,
  tray-to-window restoration, and visual snapshots. Playwright's Electron support is experimental,
  so core correctness must not depend solely on these tests.
- Packaged smoke: ASAR/fuse/signature inspection, fresh install, upgrade, rollback, uninstall with
  retained data, and explicit full-data removal.

Manual acceptance scenarios:

1. Scan on two different characters, `/reload` after each, and receive two private attributions with
   no duplicate market scans.
2. Quit during upload, reopen offline, then reconnect and reach one processed receipt.
3. Close the window, leave the tray running, scan and `/reload`, and see Trader refresh automatically.
4. Restart the machine and repeat without opening the window.
5. Pause automatic uploads, create a saved scan, verify it remains local, then use `Check for scans
now` or re-enable automation.
6. Revoke the installation token and verify a clear pairing recovery instead of an infinite retry.
7. Run on paths containing spaces/non-ASCII account names and with WoW installed outside defaults.

Release measurements should include idle CPU, wakeups, memory, startup time, scan-detection latency,
upload duration, retry count, and crash-free sessions. Initial targets are under 1% average idle CPU,
no repeated disk reads after an unchanged signature, scan detection within ten seconds of a stable
flush, and no renderer pause during parsing/upload.

## 10. Dependencies and sequencing constraints

New production dependencies should be limited to Electron/Forge packaging and React rendering. Reuse
Zod and the existing core; do not introduce a second HTTP client, generic Electron settings package,
native SQLite module, or alternate updater without a demonstrated need.

The clean implementation order is Phase A, then B/C, then D/E. Do not distribute the alpha shared
token mechanism publicly. Do not enable unattended 30-minute production uploads until the existing
market summary/retention/storage gate is complete; the desktop app automates delivery, not server
capacity. Forever activation remains a distinct live-client validation step.

## 11. References

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron process sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron IPC guidance](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron distribution overview](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)
- [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Playwright Electron automation](https://playwright.dev/docs/api/class-electron)
