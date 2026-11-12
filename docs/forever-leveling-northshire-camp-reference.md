# Northshire bandana camp reference

The shared-five route selects **Defias Thug (NPC 38)** for Brotherhood of Thieves (18), at the archived Northshire vineyard loop. This is a positive source-location match, not a same-name identity merge. The separate NPC 246263 remains a name-only record with unknown levels and zones.

## Inputs

| Input                           | Pinned identity                                                    |
| ------------------------------- | ------------------------------------------------------------------ |
| Source build                    | 70205                                                              |
| Archive SHA-256                 | `af3fec7909e0b5a1dd8659f87e67171f8984af40a22b997e630a0052a11c871e` |
| Source chapter                  | `chapter-115-1-6-northshire`                                       |
| Source version / step           | `import-v2-a9efdb7422cc4125` / `source-step-0049`                  |
| Provider revision               | `e9a67d1a2753a0e64c4c96bf7864788fac7b765f`                         |
| NPC export SHA-256              | `9ef0d0c232ccfc58f8caeb28094e3332e8cf01e2c035ea5b2502c55301b81232` |
| Map-assignment artifact SHA-256 | `391a4c7a19dd8e4c95e483fc91f45176e18f8e1b91c31a52d5c921a3d963720f` |
| Map assignment                  | 46739; UI map 1429, area 12, world map 0                           |

The provider identifies NPC 38 as a normal level 3–4 creature in Elwynn Forest, with 72 historical spawn-reference positions. The archived source has seven original loop waypoints. Matching-build game geometry maps every waypoint within **3.734226341645817 world-coordinate units** of an NPC 38 reference position. The acceptance bound is four units. Repeated waypoints are retained.

The map region is `[-10254.166015625, -1935.4166259765625, -1000000, -7939.5830078125, 1535.4166259765625, 1000000]`, with UI bounds `[0, 0, 1, 1]`. Archived `position.x` is world Y and `position.y` is world X, matching the existing application map conversion. This orientation is checked rather than guessed.

## Selection and XP contract

`campaign-reviewed-loot-targets.ts` declares the exact source, provider, creature levels/rank/area, quantity and seven original waypoints. `attachCampaignLootTargets` applies the declaration only when all qualifiers and the captured item/creature relationship match. It retains the original possible-source IDs separately, narrows this actual action to NPC 38 and emits the same target in browser and native instructions. The generic ambiguity guard remains unchanged.

Red Burlap Bandana (752) requires **12 per player / 60 for five**. The actual capture is **9/19 = 47.368421%**, sample size 19, captured October 20, 2026 at 07:02:34.980 UTC. The captured estimate takes precedence over the historical 80% context. No owner-entered 50% override is used. The resulting cost is **127 expected / 142 slow-reference kills**, retaining the full party quota. See the [drop probability contract](forever-leveling-quest-drop-probability.md).

Seventy-two historical reference points do not mean seventy-two simultaneously living mobs. The location check establishes neither respawn speed, camp throughput, actual server payout nor guaranteed collection time. It does not assign any missing fact to NPC 246263 or qualify continuous 1–60 funding.

## Verification

Run the focused production regression:

```sh
pnpm --filter @wow-trader/leveling test src/campaign-reviewed-bandana-camp.test.ts
```

It rejects absent or mismatched provider identity, archive/version, waypoints, build, levels, rank, area, quantity and capture. It checks idempotence, original positions/quotas, native target hints and preservation of the unknown alternative.

The independent literal-source/map derivation is sealed in `.cache/leveling-no-grind-20261031/verification-northshire-bandana-camp-v112.json`; v113 and v114 repeat the spatial check against their frozen runtimes. The current [audit](forever-leveling-no-grind-audit-2026-10-31.md#current-status) identifies the latest receipt and remaining route work.
