# WoW Trader fixes and recovery context

Last updated: 2026-10-04

This file records completed fixes and the evidence needed to resume debugging in a later session.
Read it together with `context.md` for the wider product history. Do not store collector tokens,
database credentials, SavedVariables contents, or other secrets here.

## Leveling bookmarks, undo, backup safety and reader quality (2026-10-04; local)

- Saved the reading position independently of checkmarks, per character/chapter/version/build.
  Next-only visits now resume in a fresh tab and from Continue playing, not the first pending step.
  Explicit anchors take precedence; stale/excluded steps cannot select an invalid card.
- Previous is progress-neutral. Undo Done restores the previous pending or skipped status and
  returns to that instruction; it is intentionally local to the current visit/release/character.
- Older backup ticks cannot undo a recent undo: existing saved chapter releases win in full on
  explicit merge. Validated private backups require preview/confirmation and successful storage
  before acknowledgment; identity conflicts, corrupt files and size/character limits fail safely.
- Report retries are matched through schema-normalized profiles, avoiding PostgreSQL JSONB key-order
  false conflicts. The bounded same-origin API validates published step identities and only confirms
  committed insertions or identical retries. New storage migration: `0016_white_runaways.sql`.
  Reports do not edit source evidence. Maintainers review with `pnpm leveling:feedback --help`.
- Added bounded map pan/zoom/fit, instruction-revealing markers, current+next focus mode, larger text
  and source-only chapter handoffs. Screenshot review caught controls wrapping and shrinking mobile
  maps; compact accessible labels, adequate split-map height and landscape-specific sizing fix it.
- Web/database lint/typecheck and 165 web tests passed. Isolated-feature `pnpm check`/production build
  and all 30 Chrome regressions passed; final responsive/map-size/mobile-focus/keyboard checks passed
  after the visual adjustment. No new dependency, commit, push or production deployment this turn.
- Local PostgreSQL at localhost:5432 is stopped, so `pnpm db:migrate` and the report review query could
  not complete; real local submissions correctly return 503 without false success. Apply/verify the
  migration during a separately authorized deployment. r4 and the production database are unchanged.
- Complete contracts, operator commands, known source gaps and backup rollback caveats:
  `docs/forever-leveling-player-quality.md`. Discord account sync is not enabled; private manual
  export/import works now and the account-auth/revision-conflict phase is documented separately.

## Explicit Next step / Done chapter navigation (deployed 2026-10-04)

- Replaced Follow and Resume with the owner's requested manual controls in both reader editions.
  Next moves to the next visible applicable instruction without completing anything. Done first
  completes the selected step, then advances. A standalone checkbox remains independent of navigation.
- Controls remain visible in every mobile focus mode; hidden quest panes defer scrolling until they
  reopen. At the final step Next is disabled, while Done can complete it without looping to earlier
  pending instructions. Completion requires a saved matching character and an incomplete resolved
  card. Valid scoped anchors and legacy browser history remain compatible across refresh.
- Code/plans `640091a`, sibling browser regressions `4f05376`, active Helper release
  `kfc-helper-leveling-workspace-20261004-r4`. The existing progress schema and database are unchanged.
- Passed 138 web tests, lint/typecheck/build, clean-index `pnpm check`/formatting and all 23 staged
  browser regressions. Exact step 51, undo/hide/refresh, final-step completion, independent checkboxes,
  both editions, map-focus advancement and unsaved completion guards are covered. All 23 public HTTPS
  regressions and six representative API/page checks passed; Helper stayed at PID `1542399`, restart
  count 70, post-check RSS 231 MiB. Ingestion and other applications were not restarted.
- Candidate packaging must copy the contents of static/public directories into the standalone roots
  using source/destination trailing slashes, then start the process. Copying `public` into an already
  populated `public` directory nested it under `public/public`, leaving the header icon missing. This
  was caught in the staged full-image decode test and corrected before activation. Existing deployment
  script already uses the correct `rsync` convention. Immediate rollback is the previous r3 release;
  full pre-feature rollback is documented in `docs/forever-leveling-release-2026-10-04.md`.

## Leveling Follow / Resume returned to the chapter beginning (deployed 2026-10-04)

- Reproduction: select Elwynn `#guide-source-step-0051`, then click **Follow next step** with
  earlier instructions still unchecked. The old handler cleared the pin and used the chapter-wide
  first pending step, incorrectly discarding the reader's selected place.
- The r3 fix retained an ordered reading cursor; r4's explicit actions above supersede its UI.
  Follow searched pending applicable
  steps at/after that cursor; Resume used the same cursor and enabled following. Completing or
  skipping advances; undoing earlier progress does not rewind it, and reaching the end never wraps.
  No earlier prerequisite is automatically completed. Explicitly selecting an earlier step returns
  there. Current-step anchors and validated browser-history mode survive refresh without modifying
  progress storage or losing Next.js history state; cursor scope includes character/chapter/build.
- Code: `apps/web/src/components/leveling-reader-selection.ts` and
  `apps/web/src/lib/leveling-reader-navigation.ts`, wired into imported/original readers and the
  shared viewport workspace. Committed/pushed in `1811348` and deployed as
  `kfc-helper-leveling-workspace-20261004-r3`.
- Regression coverage: navigation unit tests and `tests/e2e/leveling-workspace.spec.ts` in the
  sibling community repository, including the exact step-51 case, finish/undo, hide-completed,
  refresh, final-step no-wrap and pane-only Resume. Passed 136 web tests, lint, typecheck, production
  build and all 20 Chrome/Playwright leveling regressions; details are recorded in `context.md`.

## Leveling feedback-release memory guard (2026-10-04)

- The first broad public crawl passed its browser assertions but reached 649 MiB RSS and triggered
  one restart at the existing 600 MiB PM2 guard. Browser success alone did not prove process stability.
- Set `NODE_OPTIONS=--max-old-space-size=320` only in the protected Helper web environment, also
  documented in `infra/pm2/web.env.example`. This bounds V8's old heap and encourages earlier GC;
  it does not change the process guard or ingestion's environment.
- Heap limiting alone still crossed the guard. World startup validation opened all 3,386 image
  checksum streams; it now checks every tile in batches of 16. The concurrency regression fails
  without this fix and a corrupted final-batch tile still rejects the snapshot.
- Final r3 passed 20 public HTTPS browser tests and two full sitemap/API crawls at the same PID and
  restart count, warmed RSS 392–413 MiB. Rollback: `docs/forever-leveling-release-2026-10-04.md`.

## Forever upload HTTP 500 caused by Nginx temporary-file permissions

### User-visible problem

Forever scan `78751705-721a-4873-9339-1532d7e385b7` was present in the correct Beta
SavedVariables file, but **Check for scans now** repeatedly returned HTTP 500 and the live Trader
remained on the previous scan. The installed Companion `0.3.1` then incorrectly replaced the error
with **All saved scans are up to date**.

### Root cause

The request never reached `kfc-helper-ingest`. Nginx logged repeated failures opening
`/var/lib/nginx/body/*` with `Permission denied` while buffering the multi-megabyte request body.
The same stale-worker condition affected Nginx proxy temporary files for several unrelated virtual
hosts. The directory ownership and modes were correct when inspected, and the `www-data` user could
create files there; a graceful Nginx reload replaced the affected workers and immediately allowed
the pending Companion retry to reach Fastify.

### Permanent repair

- The Helper `/v1/` Nginx location now sets `proxy_request_buffering off` and
  `proxy_buffering off`, streaming authenticated uploads directly to the loopback ingestion API.
  The Helper UI location also disables response proxy buffering. Helper uploads and pages therefore
  no longer depend on the server's failing Nginx body/proxy temporary directories.
- `scripts/deploy-production-nginx.sh` stages the tracked config, preserves a timestamped rollback
  copy, validates with `nginx -t`, reloads only after validation, restores on activation failure,
  and sends a valid 1 MiB JSON request through the public hostname. Fastify's exact HTTP 422
  `validation_failed` response proves the body reached application validation; an edge 500 or any
  other response fails the deployment.
- Companion retry failures are now stored with their retry key. An automatic cooldown restores that
  exact failure and stops reconciliation before another enabled installation can replace it with a
  success state. Stale retry state is removed when a file changes or disappears.
- A two-installation regression test proves a deferred failure cannot be masked by work from another
  product.
- Companion `0.3.4` was built and published for macOS Intel, macOS Apple Silicon, Windows x64, and
  Linux x64. This Mac was upgraded from `0.3.1` to `0.3.4`; its settings, scan state, and
  OS-encrypted 0600 credential file were preserved. The old application remains as the recoverable
  `/Applications/WoW Trader Companion 0.3.1 backup 20260930.app` copy.

### Recovery and verification

- After the graceful reload, the unchanged saved scan retried automatically and processed without
  editing or recreating its payload.
- PostgreSQL and the public scan-status endpoint both return scan
  `78751705-721a-4873-9339-1532d7e385b7`, completed at `2026-09-30T12:21:15Z`, with 2,357 item
  markets and 8,112 price levels for `UNKNOWN / ClassicBetaPvP / alliance`.
- The live Forever Trader uses the exact published build-70124 catalog and reports a fresh scan.
- The production Nginx config contains all three streaming directives. A 1 MiB public smoke request
  returned HTTP 422, and no later Helper body/proxy temporary-file error was present.
- Both Helper PM2 processes remained online. No application restart, database migration, or token
  replacement was required.
- The public release manifest reports `0.3.4`; all four download endpoints return HTTP 200 with
  content lengths matching the manifest.
- Full `pnpm check`, `pnpm format:check`, `git diff --check`, deployment-script shell syntax, both
  DMG verifications, both ZIP integrity checks, and HTTP 206 range requests for all four public
  artifacts passed.
- Commit `87f9101` is pushed to `origin/main`. Immutable application release
  `kfc-helper-nginx-streaming-20260930-r18` repeated the full check and formatting gates on the
  server before activation. PM2 reloaded and saved only the two Helper processes; `kfc-website`
  remained online and was not restarted. Release r17 remains the immediate rollback.

## Forever scan upload failure after Save and `/reload`

### User-visible problem

After completing and saving a Forever Auction House scan, reloading WoW, and pressing **Check for
scans now** in the desktop Companion, the live Trader remained on the previous scan. The Companion
briefly attempted the upload and then incorrectly displayed **All saved scans are up to date**.

This was not a file-discovery, addon-save, token, endpoint, or realm-selection failure. The Companion
found the new SavedVariables file and uploaded the correct scan. The production ingestion transaction
failed while rebuilding derived price signals.

### Incident evidence

- SavedVariables file:
  `/Applications/World of Warcraft/_classic_beta_/WTF/Account/411412029#1/SavedVariables/WowTraderCollector.lua`
- Failed and later recovered scan ID: `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f`
- Market: `UNKNOWN / ClassicBetaPvP / alliance`
- Scan completion time: `2026-09-29T02:19:14Z`
- Accepted result: 2,378 item markets and 8,458 price levels
- Local Companion activity initially showed `scan_detected`, `uploading`, HTTP 500 `error`, and then
  the misleading `up_to_date` state.
- PostgreSQL reported: `value "9999998990000" is out of range for type integer`.

Item 43, Squire's Boots, caused the overflow. Its historical normal ask was approximately 100 copper,
while the new scan contained two listings at 99,999,990,000 copper. The resulting valid difference
was 9,999,998,990,000 basis points, which cannot fit in PostgreSQL's signed 32-bit `integer` type.

### Implemented fixes

#### Database and market calculations

- Migration `packages/db/migrations/0015_market_signal_bigint.sql` changes both unbounded derived
  columns on `market_item_signal` from `integer` to `bigint`:
  - `difference_basis_points`
  - `supply_ratio_basis_points`
- `packages/db/src/schema.ts` maps both columns with Drizzle `bigint(..., { mode: "number" })`.
  Current values remain below JavaScript's safe-integer limit, including the incident value.
- `apps/web/src/lib/market-item-browser-data.ts` uses the PostgreSQL `bigint` maximum as its null-last
  sorting sentinel instead of the old signed-32-bit maximum.
- `packages/market/src/price-intelligence.test.ts` contains a regression using the incident-sized
  listing jump. It expects a `spike_risk` signal and the exact 9,999,998,990,000 basis-point delta.

#### Companion status accuracy

- `packages/companion-core/src/service.ts` now tracks when an automatic retry is deferred by its
  cooldown. It preserves the current error snapshot instead of overwriting it with a false
  **All saved scans are up to date** state.
- `packages/companion-core/src/service.test.ts` verifies that an upload error remains visible during
  the automatic retry backoff.
- Companion `0.3.4` now contains this correction, is published for all four supported platform/
  architecture combinations, and is installed on this Mac. Its token and settings were preserved.

#### Ingestion logging

- `apps/ingest-api/src/app.ts` logs a bounded error summary containing the error name, first message
  line, code, and selected database-cause fields.
- It no longer serializes the entire Drizzle query and many thousands of bound parameters into the
  PM2 error log when ingestion fails.

### Production rollout and recovery

- Active release: `kfc-helper-market-bigint-20260929-r17`
- Active release path:
  `/home/wow-trader-system/releases/kfc-helper-market-bigint-20260929-r17`
- Immediate application rollback: `kfc-helper-companion-arm64-20260928-r16`
- Verified pre-migration backup:
  `/home/wow-trader-system/shared/backups/wow_trader-pre-market-bigint-20260929.dump`
- Backup size: 15,826,451 bytes
- The custom-format archive passed `pg_restore --list`.
- Migration `0015` was first tested against a disposable database restored from that production
  backup. Both columns reported `bigint`; the disposable database was then removed.
- Migration `0015` was applied to production using the database owner environment.
- PM2 reloaded `kfc-helper-web` and `kfc-helper-ingest`, saved its process list, and both loopback
  health checks passed.
- The unchanged original saved scan retried successfully after activation. No scan payload was
  edited or recreated.

### Final verification evidence

- Production `market_scan` contains scan `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f` as accepted.
- Production signal for item 43 is:
  - signal: `spike_risk`
  - current price: 99,999,990,000 copper
  - normal price: 100 copper
  - difference: 9,999,998,990,000 basis points
  - observation count: 7
  - as-of scan: `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f`
- Public status endpoint returns that exact scan for product `wow_classic_beta`, region `UNKNOWN`,
  realm `ClassicBetaPvP`, and Auction House type `alliance`.
- The live Forever Trader renders **Fresh scan · 2,378 markets** for that market.
- Local Companion `state.json` records the scan ID as uploaded and its activity log reports
  **Scan processed successfully**.
- Production release pointer resolves to r17; both Helper PM2 processes are online and the ingestion
  error log was empty after activation.

### Checks run successfully

- Full staged production `pnpm check`: lint, typecheck, tests, and builds
- Staged production `pnpm format:check`
- `@wow-trader/market` focused tests: 5 passed
- `@wow-trader/companion-core` service tests: 3 passed
- `@wow-trader/ingest-api` tests: 9 passed
- Typechecks for database, Companion core, ingestion API, and web
- `git diff --check`
- Disposable production-backup restore and migration rehearsal
- Production schema inspection, PM2 health checks, public API check, and live page check

One initial local focused-test invocation used a repository-relative path after pnpm had already
changed into the package directory, so Vitest found no files. It was immediately rerun with
`src/price-intelligence.test.ts` and all five tests passed.

## Important continuation notes

- The repository worktree contains multiple intentional, uncommitted changes from the wider
  cross-platform Companion and Trader work. Do not reset, revert, or discard them.
- The incident fix and migration are deployed but not committed or pushed. The user did not request
  a commit for this fix.
- Before the next schema migration, take another custom-format PostgreSQL backup and rehearse the
  migration on a disposable restore when practical.
- Companion `0.3.4` is the current published and locally installed release. Keep future release
  manifests immutable and continue checking every artifact checksum before switching `latest.json`.
- Never log or commit the private collector token. Local credentials remain in the operating
  system-backed Companion credential store.

## Local “Start PostgreSQL” fallback and Forever build 70058 bootstrap

### User-visible problem

The local Forever Trader rendered:

> Start PostgreSQL, apply the migrations, import a validated catalog snapshot, and set DATABASE_URL.
> No sample prices are shown as real market data.

Production was not affected. All checked live routes and both production PM2 processes remained
healthy. The local `wow-trader-postgres-1` container had exited, and the default local bootstrap was
still targeting `wow_anniversary`, so it could not supply a current Forever catalog/scan after the
Beta client updated.

### Recovery and build update

- Restarted `wow-trader-postgres-1`; its persistent volume was intact.
- Applied all 16 migrations, including migration `0015` from the preceding incident.
- Confirmed the local database retained seven catalog builds, 210,931 item-version rows, 15,162
  recipes, and the existing market scans before the new build import.
- Set the ignored local `.env` to `WOW_PRODUCT=wow_classic_beta`, making the existing single
  `pnpm dev` command target the active Forever development client and SavedVariables folder.
- The installed Beta client had advanced to `1.60.1.70058`. The old catalog WoWDBDefs pin did not
  contain a matching `Item` layout, so catalog extraction correctly stopped instead of guessing.
- Updated the catalog and world extractor defaults to exact WoWDBDefs revision
  `c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1`, whose upstream commit is **Merge 1.60.1.70058** and
  contains exact build entries for every catalog table used by the extractor.
- Catalog parser failures now name the DB2 table, client version, and definitions revision instead
  of reporting only `No definition found for this file`.
- `--definitions-revision` now requires an exact 40-character Git SHA.

### Immutable world snapshot fix

World snapshot paths previously included product, build, locale, hotfix hash, schema, and extractor
version, but omitted the WoWDBDefs revision even though the manifest recorded it. Re-extracting the
same client/hotfix with corrected definitions therefore collided with the preserved old directory.

New snapshots include `definitions-<revision>` before `extractor-<version>`. The previous snapshot
was not deleted or overwritten. The build-70058 snapshot using the new reviewed definitions is:

`artifacts/local-world/world-snapshots/wow_classic_beta/70058/enUS/3055d2ff81ef7d72d4c25e5087d3e2eecd97a4ba49a765eb3080b7eab77ff519/world-snapshot-manifest.v1/definitions-c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1/extractor-0.3.0`

### Verified local result

- Catalog `wow_classic_beta 1.60.1.70058` is published locally with:
  - 23,605 named items
  - 12 professions
  - 2,239 valid recipes
  - 2,948 decoded item icons and no unavailable icon assets
- The catalog integrity audit verified all 102 artifacts with no normalized-field or raw-record
  mismatches. Relationship validation passed with no issues.
- The updated world snapshot audit passed with 72 maps, 1,672 decoded map tiles, 342 encounters, 73
  criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints.
- The local watcher processed all eight saved Forever scans, including current build-70058 scan
  `d833de11-c1d2-457b-ad5d-a30f3a79d810`.
- That scan contains 2,362 item markets and 8,477 price levels with 100% reported coverage.
- `http://localhost:3000/forever/trader` renders **Fresh scan · 2,362 markets**, catalog
  `1.60.1.70058 · build 70058`, and no longer contains the PostgreSQL fallback.
- `pnpm dev` remains running with Next.js on port 3000, the local ingestion API on port 4000, the
  Forever SavedVariables watcher, and healthy PostgreSQL on port 5432.

### Production follow-up

The same build mismatch then appeared in production: scan
`d833de11-c1d2-457b-ad5d-a30f3a79d810` had processed successfully, but production only had a
published build-70009 catalog. The Trader correctly exposed **Build 70058 · review pending** and
**No published catalog matches Auction House build 70058**, so it could not calculate crafting
results from a mismatched recipe graph.

- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70058-catalog-20260929.dump`
  (16,063,818 bytes).
- Diffed build 70009 to 70058: 27 item IDs added; zero removed or changed items; no spell,
  profession, recipe, or transformation changes.
- Synchronized the immutable 13 MiB catalog release to
  `/home/wow-trader-system/shared/catalog-releases/wow_classic_beta-70058-enUS-3055d2ff-c79f208`.
- Re-ran the complete 102-artifact catalog audit and relationship validation on the production
  server, then imported it as `review_required`.
- Synchronized, checksum-verified, and activated media release
  `wow_classic_beta-70058-enUS-3055d2ff-c79f208` with 2,948 icons.
- Published catalog build ID `457e6227-85f5-4053-ab39-5f6898c0cf17` only after the media gate passed.
- Reloaded only `kfc-helper-web` to clear its prior catalog cache; ingestion remained online.

Final production verification:

- Live Trader reports catalog `1.60.1.70058 · build 70058` and scan `2,362 markets`.
- The catalog gate and PostgreSQL fallback are absent.
- The unfiltered crafting view renders 50 opportunity rows.
- Auction House item search for `scroll` returns actual listings and market-history panels.
- A newly added build-70058 item icon (`Wail of Death`, file-data ID 135474) returns a valid PNG.
- Production contains 23,605 build-70058 item rows and 2,239 recipe rows.
- PM2 reports both Helper processes online; the active application release remains r17 because this
  correction was a catalog/media publication, not an application-code deployment.

## Forever build 70124 exact-catalog gate

### User-visible problem

Forever scan `41c16940-f286-43e0-ba25-705aca0ccfe8` uploaded and processed successfully, but the
Trader displayed:

> Build 70124 catalog is under review

This was not another upload failure. Production intentionally refused to calculate profits from the
older build-70058 recipe graph because the new scan identified client build 70124.

### Recovery

- Confirmed the installed Beta client is `1.60.1.70124` and the saved scan contains 2,366 markets
  and 8,369 price levels with accepted scan quality.
- Pinned both local catalog and world extraction to exact WoWDBDefs revision
  `005c13a9a101e64014eeb02af3a42ccbeaf8513d`, the reviewed `Merge 1.60.1.70124` revision. It contains
  an exact 70124 layout for all 36 catalog tables used by the extractor.
- Extracted and audited 23,605 named items, 12 professions, 2,239 recipes, and 2,948 item icons.
  All 102 catalog artifacts passed integrity verification and all catalog relationships validated.
- Diffed build 70058 to build 70124. No player-facing items, spells, professions, recipes, or
  transformations were added, removed, or changed.
- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70124-catalog-20260930.dump`
  (22,101,567 bytes).
- Synchronized immutable catalog release
  `/home/wow-trader-system/shared/catalog-releases/wow_classic_beta-70124-enUS-3055d2ff-005c13a`,
  then repeated the audit and relationship validation on production.
- Imported the catalog as `review_required`, synchronized and independently verified all 2,948
  icons in media release `wow_classic_beta-70124-enUS-3055d2ff-005c13a`, and only then published
  catalog build ID `196c3b07-ca1e-49d3-b919-208401b4887e`.
- Reloaded only `kfc-helper-web` to clear its 30-second catalog cache. The ingestion service remained
  online and retained its restart count.

### Production verification

- The exact build-70124 database row is `published` with 23,605 item rows and 2,239 recipe rows.
- The accepted scan remains build 70124 with 2,366 markets and 8,369 price levels.
- The public crafting page resolves `1.60.1.70124 · build 70124`, renders 50 opportunity cards, and
  contains neither the review gate nor the no-matching-catalog limitation.
- Auction House item search for `scroll` returns 30 results, and a build-70124 item-media request
  returns a valid PNG.
- `kfc-helper-web` and `kfc-helper-ingest` are both online. The application release remains r17;
  this correction published data and media rather than changing the deployed server code.

## Forever build 70205 exact-catalog gate

### User-visible problem

The latest Forever scan uploaded and processed successfully, but the Trader displayed:

> Build 70205 catalog is under review

The accepted scan was already in PostgreSQL. Profit calculation was deliberately gated because the
new client build did not yet have an exact published item-and-recipe catalog.

### Recovery and verification

- Matched client `1.60.1.70205` to exact WoWDBDefs revision
  `3e46d21a41a07ce7e63835fd79c561e0d5dce92b` (`Merge 1.60.1.70205`) and extracted the installed
  hotfix cache with SHA-256
  `eba98a15545c5390353d1c3f3b7e55c1a466f098adc390873a3ebaa2ab81f295`.
- The local and production audits verified all 102 artifacts. Relationship validation passed with
  23,740 items, 31,731 spells, 12 professions, 2,239 recipes, 7,448 recipe inputs, and no issues.
- Compared build 70124 with 70205. The item catalog has 138 additions, three removals, and 183
  normalized record changes; the spell catalog has 44 additions, 16 removals, and 768 normalized
  record changes. The recipe inputs and outputs are unchanged and no recipes were added or removed.
  Only recipe spells `1249107`, `1249112`, and `1249114` gained a three-second craft time; the
  remaining 28 changed recipe records differed only in retained raw evidence.
- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70205-catalog-20261004.dump`
  (29,049,471 bytes).
- Synchronized immutable catalog release
  `wow_classic_beta-70205-enUS-eba98a15-3e46d21`, imported it as `review_required`, then
  checksum-verified and activated its 2,949-icon media release before publication.
- Published build ID `ccb5edd9-8494-4352-ac91-7deab04904b1` and reloaded only
  `kfc-helper-web`; the ingestion process remained online without a restart.
- Production retains accepted scan `1309b399-ca4b-4c57-a13c-fa34eee3a2c7`: build 70205,
  `ClassicBetaPvP` Alliance, 2,940 item markets, 12,468 price levels, and 100% accepted coverage.
- The live Trader resolves catalog `1.60.1.70205`, exposes crafting results, and no longer contains
  the review gate. Forever item media returns HTTP 200 from the newly activated release.

## Automatic catalog guardian and build-70205 hotfix refresh

- Added a semantic promotion classifier that ignores retained raw-record drift and harmless
  item/spell metadata or craft-time updates, while blocking profession changes and any recipe or
  transformation reagent, output, yield, cooldown, or requirement change. Missing hotfixes, unknown
  definitions, extractor changes, backwards builds, and item/spell count drift above 10% also stop
  automatic promotion.
- Added an idempotent maintainer-only guardian that detects both numbered client builds and same-build
  `DBCache.bin` changes, resolves the exact `Merge <client-version>` WoWDBDefs revision, extracts,
  audits, validates, classifies, generates media, takes a unique verified production backup, stages
  immutable catalog/media releases, repeats validation on the server, publishes, and reloads only
  `kfc-helper-web`.
- Installed macOS LaunchAgent `online.kfcguild.wow-trader-catalog-guardian`. It watches the Forever
  build manifest and hotfix cache and has a five-minute retry interval. It uses the existing batch
  SSH identity; no collector token or database owner credential is stored in the agent.
- The first real run detected a same-build hotfix change from `eba98a15…` to `f1e43a57…`. The new
  snapshot passed all 102 artifact checks and relationship validation with 23,819 items, 31,731
  spells, 12 professions, and 2,239 unchanged recipes. The compatible delta added 79 items and no
  recipe-economy changes.
- Created verified rollback backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-wow_classic_beta-70205-f1e43a57-catalog-20261004.dump`
  (35,029,084 bytes), activated release `wow_classic_beta-70205-enUS-f1e43a57-3e46d21` with 2,951
  verified icons, and published build ID `3df286a3-8940-4f42-93c0-6ede4ff28076`.
- A second guardian run was a no-op and recorded `current`, proving idempotence. The live Trader still
  shows build 70205, 2,940 markets, and crafting results with neither exact-catalog warning; Forever
  icon media returns HTTP 200. Web and ingestion processes remain online, and ingestion retained zero
  restarts.
