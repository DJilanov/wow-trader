# Forever Leveling feedback release — October 4, 2026

Live entry: https://helper.kfcguild.online/forever/leveling.
The community site's desktop/mobile **Leveling** link opens this same product.

## Verified release

- Helper: `kfc-helper-leveling-workspace-20261004-r3`, implementation `1811348`, bounded-validation
  fix `b89e0a3`. Source overlays preserve the existing live research/catalog/market baseline;
  production is not claimed to be a pristine checkout of these commits alone.
- Community: `.next-release-leveling-20261004-r4`, navigation/tests `b2e8bab`, responsive rule
  `7247a02`. Only `components/site-nav.tsx`, `content/community-tools.ts` and the 1280px navigation
  rule in `app/(site)/site.css` changed over its existing live baseline.
- Both repositories' code commits were pushed to `origin/main`; unrelated local edits remain.

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
  `WOW_TRADER_WORLD_PREFER_ARTIFACT=true`. World evidence remains review-only. No database import,
  confirmed loot/source publication, migration, addon/payment/token change or worker restart.

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

## Feedback boundary and next request

This is browser-guide feedback, not proof of a seamless/playtested live 1–60 route. Source
conditions, missing continuations and warnings above beta cap 30 remain visible. Progress is
browser-local. The original 31-step Westfall edition remains available with `?edition=kfc`.
No new feedback form or Discord announcement was sent.

The owner subsequently requested explicit **Next step** (move without completion) and **Done**
(complete current, move forward), replacing Follow/Resume. That follow-up is pending implementation.
