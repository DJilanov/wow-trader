# WoW Trader fixes and recovery context

Last updated: 2026-09-29

This file records completed fixes and the evidence needed to resume debugging in a later session.
Read it together with `context.md` for the wider product history. Do not store collector tokens,
database credentials, SavedVariables contents, or other secrets here.

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
- The installed local Companion is still version `0.3.1`. The repository and published download are
  currently version `0.3.3`. The status-presentation fix exists in source but still needs a new
  desktop version to be packaged, published, and installed. This does not block successful uploads
  now that the server-side overflow is fixed.

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
- A future Companion release should bump the version beyond `0.3.3`, package all supported
  platforms, publish the immutable release manifest, and update the locally installed macOS app so
  the retry-state presentation fix is active on the user's machine.
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
