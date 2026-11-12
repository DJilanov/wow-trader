# Consolidating the Southsea visit

## Qualified revision — November 5

V1349 / frozen scope V1350 moves ten existing actions into the already planned Southsea Shakedown visit before Krol’dok. The engine is unchanged from the previously qualified V1341 runtime, compiler 106. Every quest phase, source identity, reward fact, personal quota and drop probability is retained. Its exact prefix through The Borrower is now published in the V1361 levels 1–44 download. Later continuation remains unfinished. [Publication evidence and rollback](forever-leveling-download-deployment-2026-11-04.md).

The original route killed the Southsea pirates for Shakedown before Krol’dok but delayed Firebeard, the cargo and hats until after Maraudon. These tasks now share one circuit:

1. Pick up Firebeard at the Gadgetzan poster during the existing Tran’rek return.
2. Return Stoley’s Debt at Steamwheedle Port and collect the shipment and hats quests alongside Shakedown.
3. Follow the existing Southsea approach and complete its four shared kill counters. Finish the hats, Firebeard and upstairs cargo on that visit.
4. Return the rewards at Steamwheedle Port and pick up Deliver to MacKinley.
5. Retain the actual later Booty Bay hand-in for MacKinley. That courier reward does not fund the earlier Maraudon gate.

The moved actions remain required source work. Assigning them to an XP-bridge leg without backbone metadata would turn Firebeard into a conditional XP filler; the first rejected trial exposed that distinction. The final data preserves its earlier required behavior rather than changing XP thresholds or source guards.

## Personal loot and combat

The hat requirement remains **20 per player / 100 for five players**. The chosen source’s captured probability remains **35.3264%**, with its existing fixed-one stack reference; this exceeds the owner’s 25% collection cutoff. The historical 10% reference does not replace the captured Forever sample. Neither rate is a live payout observation. Shared Shakedown kills and each player’s loot progress retain their existing accounting; the four ten-kill counters are not multiplied by five.

Every character still needs Firebeard’s head and one cargo item. The ship cargo retains its captured upstairs-object instructions. The existing reference reward is 3,900 for each of these three quests; reordering also brings their required combat forward before further overleveling. Reference lower-bar gains before Maraudon are **28,650 / 30,944 / 31,710 XP** for fast/expected/slow without manual mallet confirmation. These are full-route replay differences, not a simple sum of listed rewards.

The original Firebeard and cargo markers are checked against the pinned map assignment and provider spawn records, using a conservative 70-unit review buffer. Nearby references top out at 45, requiring **41 under the unchanged +4 rule**. Possible holiday actors at levels 45 and 5 are included as preparation guards. They add no kills or XP. The original marker positions and instructions are unchanged; the review buffer is not a new native movement radius. Current spawns, terrain, patrols and completion time remain unobserved.

## Verification

The unchanged runtime retains its **4,114-test / 243-file** qualification, strict checking, lint and declaration build. All 243 source test files remain identical. Fresh checks for this data revision pass:

- Six fresh and six restored five-class forecasts, preserving every previously reached reward.
- **603 saved handoffs / 3,015 player continuations**: every prior handoff and all new moved-action and Shakedown boundaries are covered.
- **320 native exports / 640 roles**, with independent review and Lua syntax; all three camp programs appear once and in the intended order.
- Thirty source-flow cases with no warnings or violations.
- All **19,216 pins**, with unchanged canonical segment files.

The initial saved-state verifier incorrectly selected the first of Shakedown’s four objective events. The handoff contract includes the entire action. A pure boundary selector now uses its terminal numerical/inventory event; six new verifier tests cover multiple counters, item consumption, separate players and unrelated later steps. No runtime or numerical rule changes to satisfy this check. The original failure and terminal result remain preserved, and qualification explicitly requires all six corrected shards to pass.

The corrected handoff workload runs in six independent processes. It completed in approximately **105 seconds** on the local 11-core, 18-GiB machine. This is an observed audit duration, not a controlled speedup comparison against another revision.

## Current frontier

| Workload | No confirmed mallet: lower bar | XP required before 46 | Manually confirmed mallet: lower bar | XP required before 46 |
| --- | --- | --- | --- | --- |
| Fast | 44 + 90,852 | 138,448 | 44 + 107,752 | 121,548 |
| Expected | 45 + 17,539 | 99,961 | 45 + 34,653 | 82,847 |
| Slow | 45 + 55,419 | 62,081 | 45 + 72,797 | 44,703 |

All primary cases still stop before Maraudon 46. Full 1–60, final travel, actual-game verification and the original wider-group matrix remain unfinished. Alcaz’s pending quest identities and access do not justify lowering its entry requirement to fund this gap.

## Next missing core chain

The dungeon coverage census still finds **The Lost Tablets of Will (1139)** missing from Uldaman. Its catalog prerequisite is **An Ambassador of Evil (762)**, following the already selected Hammertoe/Prospect of Faith chain. The current route performs that preparation after its first Uldaman clear.

The [Wowhead Uldaman guide](https://www.wowhead.com/forever/guide/uldaman-dungeon-overview-location-rewards) and [licensed historical map](https://ptgmedia.pearsoncmg.com/imprint_downloads/brady/wow/uldaman/uldaman_lr.pdf) place Hammertoe and Magregan before the instance portal. This supports investigating earlier preparation; it does not establish current Forever enemy levels or quest availability. The tablet itself remains inside the instance. The complete prerequisite method, city returns, earlier party level and actual pickup must be qualified before adding any XP. Missing records in the sampled client caches do not prove a quest was removed.

Evidence under `.cache/leveling-no-grind-20261031/`: `southsea-spatial-v1346.json`, `southsea-order-route-v1349.json`, `southsea-order-engine-v1350/scope.json`, `southsea-order-delivery-audit-v1351/summary.json`, `handoffs-v1352.terminal.json` in that audit directory, `uldaman-tablets-discovery-v1352.json`, and `uldaman-preparation-scope-v1352.json`. Progress receipt: `source-flow-progress-v1354.json`.
