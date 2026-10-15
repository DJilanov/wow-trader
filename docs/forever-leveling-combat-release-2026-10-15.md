# Forever leveling combat XP release — October 15, 2026

Live: https://helper.kfcguild.online/forever/leveling/routes/alliance-human?plan=premade&class=warrior.

## Scope and source boundary

- Implementation `35137da` is pushed to `origin/main`: 33 scoped files, including the calculator,
  combat adapter/ledger, source-reader panels, campaign breakdown, tests, offline tools and passive
  observer source. Unrelated dirty-worktree files were neither committed nor shipped.
- Active web: `kfc-helper-combat-20261015-r9`; Next build `1cFoZCia2MeGyO-m4y_ip`. The deployment
  preserves the actual immutable `kfc-helper-xp-repair-20261015-r8` baseline and overlays only this
  feature. Thirty-two complete overlay files matched the staged export's SHA-256 values before
  activation. The root package manifest merged only two combat command entries, preserving the
  baseline's other scripts. Deployment documentation was updated after verification.
- This is deliberately not represented as a pristine checkout. Existing live catalog/market
  changes and the v2 quest-XP reader remain intact. The reference parser and quest-XP contracts
  matched r8 byte-for-byte. The lockfile and installed dependency versions are unchanged.
- No database migration/publication, reference worker update, queue reset, game installation,
  NPC/quest scan, collector change or protected environment-file change was performed.

## Public data limitation

The private local QuestieDB-derived import was **not uploaded or authorized by this deployment**.
No synthetic test archive/data was installed on production. The loader remains fail-closed for
unauthorized, corrupt and mismatched-build data. Public routes show the new quest/outdoor/dungeon
breakdown, but unavailable combat is explicitly unmeasured, not an invented buffer.

Local reference coverage remains 13,391 named NPCs, 5,232 quests and 205 distinct quests with
reconciled kill quotas. There are no reviewed dungeon populations or calibrated kill contexts.
Those local counts are not live public coverage and do not certify a funded 1–60 route. More quest
rewards, approved source publication and dungeon combat evidence remain separate pending inputs.

## Executed verification

- Clean scoped Git-index export: 221 leveling + 198 web tests, strict TypeScript checks, leveling/web
  and tool lint, focused formatting and package/dependency builds passed.
- Linux candidate on the preserved live baseline: 221 leveling + 220 web tests, leveling lint/types,
  web lint and optimized webpack production build passed, including TypeScript and 59 static pages.
  The production font pipeline was used; no local font-response fixture was used for Linux.
- Packaged the generated static/public assets beside the standalone server, then served the
  candidate privately on loopback 19213 through local tunnel 3014 before activation.
- Private and public HTTPS Chrome checks passed real published rewards (including quest 9's
  1,050 XP at level 13), correct hand-in level, per-player breakdown, evidence refresh, continuation,
  preserved actual saves and 320/390px overflow/accessibility checks. The test browser blocked
  all non-GET/HEAD requests; no application/feedback/order/upload data was submitted.
- Twelve private and twelve public URL checks passed: home, leveling, Human campaign, Undead
  source route, Elwynn source chapter, Forever/TBC Traders, Encyclopedia, maps, quest 9, data status
  and robots. The new outdoor/dungeon metrics and missing-combat notice were present; published
  reward evidence remained configured. Forever Trader had no database or catalog-review warning.
- Only Helper web reloaded. Active PID 2895170, restart count 109. Ingestion 1169337, reference
  crawler 2874710, reference publisher 2871067, guild 2507624 and community 1998783 were preserved.
  Ingestion health was `ok`; PM2 process state was saved. The private candidate/tunnel were closed.

## Operational notes

The existing quest-XP feed is `/home/wow-trader-reference-worker/shared/published`. It is stored in
the web process's saved PM2 environment rather than `web.env`. The candidate explicitly matched
that non-secret setting. Activation used `pm2 reload kfc-helper-web` without replacing its
environment; no other process was restarted.

The recovery checkpoint was running at 165/317 at 11:42:57 UTC, with unchanged crawler PID. This
does not mean all archive quests are collected; recovery, priority and full-archive phases remain
serialized. No crawl-rate or access-control changes were made. The previous web release is retained.
Only the new release's generated build cache was removed after packaging; runtime assets and
previous releases were retained.

## Web-only rollback

Use r8, not a pre-v2 reader. Confirm the current pointer, create a fresh rollback symlink and
atomically replace it; never reload ingestion or the crawler for this application rollback.

```sh
ssh root@89.167.46.193
set -eu
test "$(readlink -f /home/wow-trader-system/current)" = /home/wow-trader-system/releases/kfc-helper-combat-20261015-r9
test ! -e /home/wow-trader-system/current-combat-r9-manual-rollback
test ! -L /home/wow-trader-system/current-combat-r9-manual-rollback
ln -s /home/wow-trader-system/releases/kfc-helper-xp-repair-20261015-r8 /home/wow-trader-system/current-combat-r9-manual-rollback
mv -Tf /home/wow-trader-system/current-combat-r9-manual-rollback /home/wow-trader-system/current
pm2 reload kfc-helper-web
curl --fail http://127.0.0.1:19210/api/v1/data-status
pm2 save
```
