# Actual-XP zone handoffs

Implemented, committed, pushed and deployed for browser testing on October 20, 2026 from
`d4390d397975ba7624e48630e17293338414bfd3`. See the
[verified deployment and rollback receipt](forever-leveling-test-deployment-2026-10-20.md).
The October 19 release remains the immediate rollback, not the active web version.

## Local follow-up: quest-funded pickup checks (October 20)

Implemented locally after that deployment; not committed, pushed or deployed yet. The live
version above does not include this follow-up.

The compiler now checks earlier required hand-ins before inserting a pickup-level XP gate.
For Human/Warrior quest 18, the nine preceding hand-ins provide 1,040 XP; level 2 requires
400 XP. The separate level-2 instruction is therefore removed and its old bookmark resolves to
the actual quest pickup. The real-data check removed 332 such gate instances across the 28
supported exact race/class editions, using 61 checksummed chapters and 1,652 reward records.

This is a conservative minimum-level proof, not a saved XP-bar estimate:

- Use only earlier required, applicable route rewards; deduplicate hand-ins. Future rewards,
  explicitly XP-optional/raid work, unidentified bundles and estimated kills cannot remove a pickup gate.
- Check each threshold against the lowest verified reward at every eligible hand-in level
  below it, including overlevel reductions. Missing/conflicting/historical evidence cannot
  establish paid XP. Conflicting minimum levels remain conservative.
- Keep leader-only and shared budgets separate. Leader starter XP is not party XP.
- At execution time, only an observed sufficient level or already reported hand-ins can prove
  eligibility. Reports have no timestamps, so their order is treated conservatively rather than
  inferred from quest IDs. Merely planning a hand-in does not satisfy the actual pickup.
- Preserve genuine shortfall gates and all prerequisite checks. Fresh actual bars are still
  required for outdoor observations and real dungeon/finish checks. No proof or bookmark
  migration changes saved levels, XP, or quest reports.

Local revisions are `workflow-20261020-v8`, `checkpoint-ledger-20261020-v12`, and
`campaign-addon-20261020-v11`. Existing audit/review artifacts remain historical; no addon is
installed or published by this change.

Local automated verification: 346 leveling tests (22 new funding regressions), 691 web tests,
both strict typechecks, leveling/touched-script lint, formatting and the leveling build pass.
The extended browser regression also passes at widths 1440 and 390 on a local development
preview: level-5 Elwynn handoff, the old quest-18 bookmark, no redundant level-2 card, confirmed
earlier rewards with a stale level-1 bar, pickup/report persistence after reload, unchanged saved
XP and other party members, no overflow and no browser errors. Browser assertions wait up to
30 seconds for development hydration; the initial five-second check was too short. Screenshots:
`/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-adaptive-handoffs-dqcwSH`.
The follow-up has not received a new production Next.js build or deployment. The local preview
was stopped after verification.
The checks below describe the earlier deployed handoff work unless explicitly updated here.

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

The initial local preview was stopped after verification. The subsequent authorized deployment
restarted only Helper web; published data, installed addons and public downloads were unchanged.
The clean release independently passed 324 leveling and 552 web tests; the larger development
count above includes unrelated workspace tests that were deliberately excluded from deployment.
Real in-game route validation remains open.

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
