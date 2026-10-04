# Forever Leveling feedback release — October 4, 2026

Live entry: https://helper.kfcguild.online/forever/leveling.
The community site's desktop/mobile **Leveling** link opens this same product.

## Current release: player quality r5

- Helper is now `kfc-helper-leveling-quality-20261004-r5`, code `f81bc5c`, copied from r4 with only
  the reviewed leveling source files overlaid. Existing live catalog/market changes were preserved.
  Browser test-only commits `7f8a1d1` and `68ae79f` were pushed in sibling `discord-website`.
- Added exact reading bookmarks, Previous/Undo Done, bounded map controls, focus/larger-text modes,
  explicit chapter review, private progress backups and durable private step feedback.
- Applied additive migration `0016_white_runaways.sql` after a verified custom-format backup:
  `shared/backups/wow_trader-pre-leveling-feedback-20261004-r5.dump`, 83,087,657 bytes.
  Runtime `wow_trader_web` gets SELECT/INSERT on the new table, never UPDATE/DELETE. Review status
  uses the protected owner environment and `pnpm leveling:feedback`.
- Linux lint/typecheck/build and 165 web tests passed. Staged Chrome: 29 cases passed initially;
  the only failure was a test expecting no anchor while the reader correctly added its initial
  bookmark. Corrected assertion and focused rerun passed, covering all 30 cases. Seven additional
  public HTTPS Chrome cases passed after activation.
- Real database/API checks passed durable insertion, schema-normalized JSONB retry, conflict,
  evidence/origin validation and rate limiting. Public Nginx/HTTPS durable insertion/retry checks
  also passed. Six exact synthetic reports were removed; player reports were not touched.
- Reloaded only `kfc-helper-web`, PID `1555476`, planned restart count 72, warmed RSS about 321 MiB.
  Ingestion stayed PID `1169337`/restarts 0; guild `1024920`/89 and community `1535288`/39 stayed
  unchanged. Public Leveling/Trader/TBC/world/status routes returned 200 with no catalog regression.
  Archive/world/environment references are unchanged. No addon/auth/payment or dungeon feature shipped.
- The r5 staged listener on 19213 and its local 3004 tunnel were closed after testing. The protected
  maintainer feedback-list command succeeded. Disk remains about 89% used / 8.1 GiB free; existing
  unrelated data and prior rollback releases were not deleted as part of this deployment.
- Rollback: repoint `current` to `kfc-helper-leveling-workspace-20261004-r4`, reload only Helper web,
  verify health and save PM2. Retain the additive migration and live market data. Export a private
  progress backup before opening r4: its strict older parser cannot read the new bookmark fields.

Dungeon follow-up is research/plan only: `forever-leveling-dungeon-integration-plan.md`.

## Earlier verified releases: r1–r4

- Helper: `kfc-helper-leveling-workspace-20261004-r4`, base implementation `1811348`, bounded-validation
  fix `b89e0a3`, explicit Next/Done actions `640091a`. Source overlays preserve the existing live research/catalog/market baseline;
  production is not claimed to be a pristine checkout of these commits alone.
- Community: `.next-release-leveling-20261004-r4`, navigation/tests `b2e8bab`, responsive rule
  `7247a02`. Only `components/site-nav.tsx`, `content/community-tools.ts` and the 1280px navigation
  rule in `app/(site)/site.css` changed over its existing live baseline.
- Both repositories' code commits were pushed to `origin/main`; unrelated local edits remain.
  Next/Done browser regressions are in sibling test-only commit `4f05376`; its runtime did not require
  another rebuild for the reader update.

## Separately provisioned data

- Authorized archive:
  `/home/wow-trader-system/shared/leveling/releases/forever-guide-v2-70205-43b8ce0a`.
  Parser `forever-guide-v2`, target 70205, 157 variants, 22,604 steps, 2,394 distinct quest IDs.
  Manifest SHA-256: `43b8ce0a5286dadbaa89ea9b2d53e6ed328fca613ed5e33429151cf24c226fc5`.
  Only manifest/audit and active manifest-listed chapters were uploaded, not the decoded source or
  account bundle. Every chapter's checksum/schema/identity/version/source hash/build/count was
  reverified on the server before activation.
- World:
  `/home/wow-trader-system/shared/world-snapshots/releases/wow-classic-beta-70205-extractor-0.4.0-fb8e9cb7`.
  Includes normalized records, raw checksummed overlay tables, map-media manifest and all 3,386
  decoded PNGs; zero unavailable images. Server-side `pnpm world:audit` passed. Raw overlay tables
  are required for reveal layers; syncing normalized files alone is insufficient.
- Protected web environment points `LEVELING_ARCHIVE_ROOT`, `WOW_TRADER_WORLD_SNAPSHOT` and
  `WOW_TRADER_WORLD_MEDIA_ROOT` to these immutable releases, with
  `WOW_TRADER_WORLD_PREFER_ARTIFACT=true`. World evidence remains review-only. The original r1–r4
  rollout did not import world evidence, publish confirmed loot, migrate the database or change
  addons/payment/tokens/workers. r5's separate additive feedback migration is recorded above.

## Verification and memory correction

- Exact Git-index export: `pnpm check` and formatting passed. Linux release: web/dependency
  lint/typecheck/tests/build/formatting passed (136 web, 39 leveling, four world-data tests).
- Initial public crawls passed browser assertions but crossed the existing 600 MiB PM2 guard.
  Heap limiting alone was insufficient. World startup validation opened thousands of streams;
  it now checks every tile in batches of 16. Its regression fails without the fix; a corrupt final
  tile still rejects the snapshot. Web-only `NODE_OPTIONS=--max-old-space-size=320` complements it.
- Final r3 passed all 20 public HTTPS Chrome/Playwright tests and two full root/four-shard sitemap,
  Trader/TBC/world/public API crawls. Helper stayed at PID `1535399`, restart count 69, warmed RSS
  392–413 MiB. Community staged/live navigation passed 360/768/1100/1281/1440px, Linux build,
  local typecheck/targeted lint and all 312 tests.
- Ingestion retained PID `1169337`, zero restarts; guild retained PID `1024920`, restart count 89.
  Only named web applications were reloaded. Temporary listeners/tunnels are closed after checks.

## Rollback

For only the Next/Done update, repoint Helper `current` to
`releases/kfc-helper-leveling-workspace-20261004-r3`, reload only `kfc-helper-web`, verify health
and save PM2. Keep the current archive/world/environment/database intact.

For full pre-feature Helper rollback, restore
`shared/env/web.env.pre-leveling-workspace-20261004-r2` to `shared/env/web.env` with mode 0600,
repoint `shared/world-snapshots/current` to
`shared/world-snapshots/releases/wow-classic-beta-69893-extractor-0.2.3`, and repoint `current` to
`releases/kfc-helper-leveling-preview-20261004-r1`. Reload only `kfc-helper-web`, verify health,
then save PM2. Do not restart ingestion or restore the live database. The separate
`shared/env/web.env.pre-leveling-heap-20261004-r2` retains the new data configuration without the
heap option. r2 also remains available, but restores unbounded tile-stream validation.

For community rollback, restore its three original source files from
`.data/private/leveling-navigation-source-20261004-r2` (CSS backup: `site.css`), retain
`wowforever:wowforever` ownership and activate `.next-release-leveling-20261004-r1` through the
existing named PM2 declaration with `FOREVER_BUILD_DIR`. Verify `/api/health` and `/addons`; save
PM2. Do not restart workers or roll back the shared database.

## Feedback boundary and explicit reader actions

This is browser-guide feedback, not proof of a seamless/playtested live 1–60 route. Source
conditions, missing continuations and warnings above beta cap 30 remain visible. Progress is
browser-local. The original 31-step Westfall edition remains available with `?edition=kfc`.
r1–r4 did not add a feedback form or send a Discord announcement. r5 adds the private report form;
no announcement was sent.

The requested **Next step** (move without completion) and **Done** (complete current, move forward)
replace Follow/Resume in both editions. Checkbox-only completion remains independent of navigation.
Buttons stay visible in all mobile focus modes; a hidden pane scrolls to the new step when reopened.
Final-step completion does not wrap to earlier unfinished steps, and Done respects the existing saved
character/resolved-instruction guards. Progress storage is unchanged; legacy history stays readable.

r4 passed full clean-index `pnpm check`/formatting, Linux web/dependency checks/build/formatting,
138 web tests and all 23 staged Chrome regressions. Before activation, the full-image check caught
a nested-public-directory packaging omission; static/public contents were copied to the correct roots
and the candidate restarted. All 23 public HTTPS Chrome regressions and six representative
Leveling/Trader/TBC/maps/status/sitemap checks passed. Only Helper web was reloaded, retaining PID
`1542399`, planned restart count 70 throughout the live tests, post-check RSS 231 MiB. Community,
ingestion, guild and database state were unchanged. Temporary listeners/tunnels were closed afterward.
