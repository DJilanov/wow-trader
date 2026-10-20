# Actual-XP zone handoffs

Implemented on October 20, 2026. Commit/push and deployment for browser testing are authorized and
in progress. Until activation is verified, the
[October 19 deployment receipt](forever-leveling-test-deployment-2026-10-19.md) describes the live site.

## Behavior

- Chapter names such as “1–6 Northshire” and “6–11 Elwynn Forest” describe the source route,
  not mandatory departure or entry levels. Starter chapter summaries no longer demand those levels.
- Before entering the next outdoor phase, record fresh actual level and XP. Personal starter
  handoffs check the leader only; shared preparation and dungeon entry check all five participants.
- Imported source `.xp` grinding steps become actual-XP observations with an explicitly advisory
  source recommendation. They keep their action/source identities, but do not force a level,
  forecast an arbitrary grind to it, or emit a mandatory addon `.xp` directive for it.
- Quest pickup minimum levels and prerequisite checks remain enforced. If the next required
  pickup needs more levels, its explicit XP gate remains immediately before the pickup.
- Dungeon departure/entry and optional catch-up targets follow the current selected difficulty
  policy and selected quest requirements. They no longer use the maximum across every policy.
- Excluding a pending optional dungeon removes its preceding departure check too. Catch-up work
  then uses the next included stop, not the skipped dungeon or the outdoor chapter's upper range.
- Level 60 remains a real final goal. Required unlocks and already accepted quest chains remain;
  being ahead on XP does not falsely complete or discard them.
- Old zone-entry, starter-departure and conservative dungeon-departure bookmarks resolve to the
  updated checks. Actual XP and reported quest states are never changed by migration or forecasting.

Example: a Human with a fresh level-5 bar can proceed into Goldshire. The published Forever
records give minimum level 4 for The Fargodeep Mine, 3 for Kobold Candles, 4 for Gold Dust Exchange
and 5 for Lost Necklace. A later quest with a genuine level-6 minimum still requires level 6 when
its pickup is reached; that is not a reason to grind to 6 before entering the zone.

## Forecast and evidence boundaries

Forecasts carry the actual starting bar and modeled earned XP across chapter boundaries; they
do not reset the player to a chapter's reference level. A remaining gap at a real pickup/stop may
still be projected as adaptive XP work, explicitly labeled as unmeasured until reviewed evidence
exists. This projection does not update saved XP or certify an in-game camp, kill mix or duration.

Revisions are `workflow-20261020-v7`, `checkpoint-ledger-20261020-v11`, and
`campaign-addon-20261020-v10`. Old audit reports and review ZIPs remain historical artifacts, not
evidence for the new workflow. Rebuild and review a new addon before publishing it; this change
does not install an addon or alter the live download.

## Verification

- Passed: 324 leveling tests, 691 web tests, strict typechecks, leveling and touched-file lint,
  formatting, the leveling build, and the production Next.js build
  `FBio4R7iu9wxb-s1-3Rpw`. The default fully parallel web run hit existing five-second test
  timeouts under load; the complete rerun with two workers passed without changing test limits.
- Regression coverage: level-5 Goldshire, fractional source grind recommendations, genuine quest
  minima, fresh/stale bars, personal versus group checks, old bookmarks, both dungeon policies,
  a lagging player, excluded optional dungeons, unchanged saved XP, and addon directives.
- A checksummed local source/data matrix compiles 28 exact race/class editions under both
  difficulty policies and both raid-goal settings (112 combinations); imported source-only XP
  suggestions remain advisory and each active stop target matches its selected policy.
- The browser regression uses real local archive, world and published reward artifacts. It saves
  the leader at level 5 + 123 XP through Settings, opens Elwynn, completes its handoff, reloads,
  and checks persisted completion, unchanged party bars, desktop/mobile overflow and browser
  errors. It passed against the production build at widths 1440 and 390. Screenshots:
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-pE19le`.
- The existing guaranteed-bundle browser regression also passed on the local production build:
  four default slots, level override, slot skip, reload, dungeon exclusion/restore, unchanged
  earned XP, mobile controls and first-run save. Screenshots:
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-guaranteed-bundles-cPFOoA`.

The temporary localhost preview was stopped after verification. No production process, published
data, installed addon or public download was changed. Real in-game route validation remains open.

Run the focused checks from the repository root:

```sh
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/leveling typecheck
pnpm --filter @wow-trader/leveling lint
pnpm --filter @wow-trader/leveling build
pnpm --filter @wow-trader/web exec vitest run src --maxWorkers=2
pnpm --filter @wow-trader/web typecheck
```

For a running local web preview provisioned with the existing world/archive/reward artifacts:

```sh
LEVELING_TEST_HELPER=http://127.0.0.1:3317 \
  node scripts/check-leveling-adaptive-handoffs.mjs \
  --playwright-package=/absolute/path/to/installed/@playwright/test/package.json
```

The browser check refuses non-local targets and blocks non-GET/HEAD requests. Test state stays in
an isolated browser context; screenshots go to a temporary output directory printed on success.
