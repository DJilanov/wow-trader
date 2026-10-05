# Forever Leveling dungeon release — October 5, 2026

Live entry: https://helper.kfcguild.online/forever/leveling.

## Source and deployment boundary

- Active Helper web: `kfc-helper-leveling-dungeons-20261005-r6`, code `e2beab6`, pushed to
  `origin/main`. This is the existing immutable r5 live baseline plus exactly 73 committed leveling,
  regression and documentation files. All 73 source checksums were verified before activation.
  It is not claimed to be a pristine checkout: existing live catalog/market changes were preserved.
- Only the completed leveling/dungeon work was committed and overlaid. Unrelated local catalog,
  market, ingestion, SEO, addon and other files remain untouched and uncommitted.
- The dependency lockfile is unchanged from r5. No migration, catalog publication, archive/world
  write, addon installation or Collector/ingestion restart was required. Only the protected web
  environment's heap budget changed after the memory verification below; credentials are untouched.
- Built on Linux, packaged static/public files beside the Next standalone server, tested the
  private candidate on loopback 19213 through a local 3004 tunnel, then atomically switched
  `/home/wow-trader-system/current`. Reloaded only `kfc-helper-web` and saved PM2.
- Previous release `kfc-helper-leveling-quality-20261004-r5` remains available for rollback.
  Temporary candidate listener and tunnel are closed. No existing data or releases were deleted.

## Player-facing scope

- Full 1–60 chapter tree, source quest counts/hand-ins, XP coverage and optional personal XP/hour
  timing. Estimates do not update character progress or claim measured travel/clear speed.
- All 32 dungeon variants have scoped faction/geographic preparation, run and hand-in itineraries.
  One prominent checkpoint/XP alternative is visible; other journeys and detailed plans collapse.
  Unknown schedules/access/lifecycles and content beyond the reviewed cap remain references.
- Existing Hall of Thanes / Darkshore 15–16 replacement remains intact. Deadmines and Alliance
  Ruins add source/hash-pinned Redridge 19→20 continuations for the audited Human Warrior at 1×.
  Retained quest chains, Cooking and actual reported level/XP gate the exact Darkshore continuation.
  Other variants retain their full outdoor route until their own bridge is reviewed.
- Deadmines defaults to six core quests; the explosives chain is optional unless prepared/selected.
  Alliance Wailing Caverns is placed in the 21–23 Stonetalon/Ashenvale branch with a strict 21+
  actual-level gate and four core quests. Horde retains its Barrens/At-level placement.
- Independent dungeon progress, Next/Done/Undo, explicit quest states, actual-XP refresh and backups
  preserve original source completion/bookmarks and older optional trips. Estimates never create
  earned XP, and source changes block reuse rather than silently remapping instructions.

## Verification

- Exact Git-index export: full `pnpm check` passed lint, typechecks, **400 unit tests** and all
  package builds, including web and desktop; `pnpm format:check` passed. Web had 182 tests in this
  clean scope; the extra 13 live-baseline market/catalog tests remain outside this feature commit.
- Five reference-importer regressions passed. Full lint initially exposed undeclared globals in
  the new chapter-path browser script; Node URL imports/`globalThis` fixed that without suppression.
- Linux release: leveling/web lint/typechecks, **104 leveling + 195 web tests**, production web
  build (59 generated pages) and full formatting passed. The unchanged lockfile hash matched r5.
- Server dungeon archive audit validated **157 authorized chapters**, 228 source associations and
  271 quest records. Original manifest SHA-256 remains
  `43b8ce0a5286dadbaa89ea9b2d53e6ed328fca613ed5e33429151cf24c226fc5`.
- Private Linux candidate through the tunnel: **27 Chrome regression groups** passed across
  itineraries (5), generic/discovery trips (7), chapter path (5), Thanes (6) and references (4).
  These cover actual-XP/chain return gates, old/competing plans, changed evidence, WC mode/floors,
  source isolation, reload/backup/denied storage, maps, desktop/390/320 px and WCAG A/AA audits.
- Public HTTPS: **four Chrome groups** passed for full path/XP/discovery, plan activation/reload and
  source isolation, Alliance WC's actual-level gate, mobile layout and automated WCAG A/AA checks.
  A fresh ephemeral browser context rejected non-GET/HEAD requests; no server writes or JavaScript
  errors occurred. No player browser profile or saved progress was used.
- Public leveling/Horde/Westfall/Thanes/reference, both Trader, catalog/maps/data/status/API, robots
  and root sitemap routes returned HTTP 200. The Forever Trader retained the published catalog
  without database/catalog-under-review warnings. All four robot-advertised catalog shards and a
  real build-70205 reward preview were checked; unknown rewards correctly returned HTTP 404.
  Root sitemap has 32,549 entries; catalog shards contain 8,000 / 8,000 / 8,000 / 2,101 entries.
  Smoke discovery uses the shared Thanes chapter constant and `robots.txt`, not guessed chapter IDs
  or an assumed root sitemap index.

## Runtime and remaining evidence

- The broader initial public crawl exposed a real SIGABRT at the existing 320 MiB V8 heap limit.
  A private replay at **384 MiB** passed two full leveling/Trader/world/API/root/four-shard rounds;
  sampled RSS was at most 360 MiB. After explicit GC at each round's end, retained heap was 97 MiB
  both times. This is bounded replay evidence, not a guarantee under arbitrary traffic.
- Preserved the previous protected environment as mode-0600
  `shared/env/web.env.pre-dungeon-heap-20261005-r6`, atomically changed only
  `NODE_OPTIONS=--max-old-space-size=384`, and reloaded Helper web. PM2's 600 MiB RSS guard remains
  unchanged; inspector access was temporary, loopback-only, and closed without heap snapshots.
  The matching environment example is committed with this receipt.
- Final public replay at that budget passed **two complete 20-route rounds** plus the unknown-reward
  404 check, with no forced GC. PID `1650837` and restart count 77 remained unchanged; warmed RSS
  was 280 MiB after the first round and 423 MiB after the second, below the unchanged PM2 guard.
- Separately, the existing authorized catalog guardian published compatible hotfix `2e7cbb94…`
  for build 70205 and triggered an expected web reload during verification. No catalog operation
  was initiated by this code deployment; the world/guide archive remains the pinned reviewed source.
- Helper web is online with PID `1650837`, restart count 77 after the recovery/configuration reloads.
  Ingestion retains PID `1169337`
  / zero restarts; guild retains `1024920` / 89 and community `1535288` / 39. The existing worker
  processes were not changed. Ingestion health remains `ok`.
- The original authorized archive/world assets and production credentials remain in place.
  Disk is about 91% used / 6.6 GiB free after staging; capacity cleanup remains separate work.
- Travel/clear measurements and more race/class/wing replacement adapters still need review. This
  release is not a claim of a seamless, optimized, in-game-playtested 1–60 route or guaranteed XP.

## Rollback

Export browser progress first. r5's strict parser does not understand the new dungeon-plan fields;
retain the current backup/browser data so it can be restored when the new schema is available.
An application rollback does not require restoring the database or reverting the archive/world data.

```bash
ssh root@89.167.46.193
set -eu
test "$(readlink -f /home/wow-trader-system/current)" = \
  /home/wow-trader-system/releases/kfc-helper-leveling-dungeons-20261005-r6
ln -s /home/wow-trader-system/releases/kfc-helper-leveling-quality-20261004-r5 \
  /home/wow-trader-system/current-leveling-r6-rollback
mv -Tf /home/wow-trader-system/current-leveling-r6-rollback /home/wow-trader-system/current
pm2 reload kfc-helper-web
curl --fail http://127.0.0.1:19210/api/v1/data-status
pm2 save
```

Do not use the generic two-process activation script for this web-only rollback. Leave ingestion,
guild/community/workers, production secrets and live market data unchanged.
