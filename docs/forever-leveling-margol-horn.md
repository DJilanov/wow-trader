# Margol's Horn: acquisition, parcels and route qualification

The private V1456 route with frozen V1459 engine adds **The Horn of the Beast → Proof of Deed → At Last!** before Maraudon. It closes the remaining modeled entry gap for the primary five-Human Warrior/Priest/Mage/Rogue/Warlock group from level 1 with zero XP. These are reference calculations; current Forever payouts, travel time, the completed 1–60 route and the original wider matrix remain unverified. This revision is not published.

## Actual item and travel sequence

1. After the Thorium Point hand-ins, travel to Margol in southeastern Searing Gorge. Defeat him together and collect **one Margol's Horn, item 10000, per player**.
2. Each player uses the starter to accept quest **3181**. The pinned historical pickup rule consumes this distinct starter and supplies **one Gigantic Horn, item 10005**.
3. Reach Mountaineer Pebblebitty on the Loch Modan side of Stonewrought Pass through the open Badlands route. Hand in 3181 with each player's Gigantic Horn.
4. Accept **3182** from Pebblebitty. Each player receives another required Gigantic Horn for Curator Thorius in Ironforge. Travel there and hand it in.
5. Accept **3201** from Thorius. Keep each player's **Proof of Deed, item 10022**, return to Pebblebitty and hand it in. The gate key belongs to the end of this chain.
6. Return through Ironforge and the Deeprun Tram to Stormwind, continuing the existing northern Kalimdor leg.

The earlier Searing Gorge approach now explicitly uses **Loch Modan → Badlands → Searing Gorge**. It does not require the key before earning it. The captured source also describes an interact-key gate method; this selected route uses the open road. Exact travel time and final route optimality remain unfinished.

## Evidence and accounting

The literal provider identifies Margol as a **level-48 elite**. The historical database has a fixed-one, 100-chance starter drop with shared-loot flags, conditioned on an Alliance player. The method checks the matching provider, archive, source phases and condition before adopting that reference. It prices **one shared outdoor fight**, with nonzero group XP; every player still receives a personal starter. This is not a measured current-server drop rate.

The three existing reward facts remain **5,450 / 4,400 / 4,400 XP**, totaling **14,250 per player** at the modeled hand-in levels. No reward table, probability, incidental percentage or unrelated quest quantity changes. The supplied items are tracked as real pickup events and consumed at their own recipients, including across saved-state resumes. A recorded accepted quest alone does not establish an unobserved parcel inventory.

The source library had marked 3181 complete while selecting its early hand-in before its late pickup. The reviewed method uses the captured collection and early pickup in their proper order. A regression test also found that the final quest could receive **4,400 XP without the earlier hand-ins**. Explicit intrinsic prerequisites now prevent that payout. Existing source guards remain intact.

The main implementation is isolated in `margol-preview-v1449/src/campaign-margol-horn.ts`, composed by `attachCampaignCombat`. Shared pickup inventory transfers are implemented by the item ledger and used by both forecasting and actual guide task reports. Pickup definitions and their prerequisite IDs are included in saved projection compatibility checks. The party policy reflects the qualified acquisition instead of retaining its old unsupported-quota rejection.

## Current primary lower bars

Every row starts the same five-Human party at **1+0**, under the experienced-premade policy. Each reaches Maraudon's level-46 requirement with **no explicit grinding** and a quest-log peak of eleven. Each then stops at the unresolved normal Scion fight in Vyletongue Corruption.

| Optional mallet confirmed | Workload | Lower bar before unresolved Scion XP |
| --- | --- | --- |
| No | Fast | 46 + 849 |
| No | Expected | 46 + 44,185 |
| No | Slow | 46 + 84,018 |
| Yes | Fast | 46 + 17,681 |
| Yes | Expected | 46 + 61,068 |
| Yes | Slow | 46 + 101,272 |

Fast/expected/slow are modeled drop workloads, not guarantees of every possible loot outcome. The optional mallet confirmation does not create an item or prove possession.

## Checks and remaining scope

The frozen engine passes **4,203 tests in 250 files**, strict typecheck, full source lint and all six entrypoint builds. All **248 older test files** remain byte-identical. The twenty-five new cases cover pickup accounting, the complete reviewed chain, missing-stock and prerequisite failures, native output, faction-conditioned acquisition, actual guide reports, resumes and changed-definition rejection.

Independent checks pass **twenty native class/difficulty/role exports**, Lua syntax, **thirty source cases with zero warnings or violations**, and **150 actual saved handoffs / 750 player continuations**. The handoffs cover eighteen previously moved quest phases and seven new Margol boundaries. Every later event, endpoint, XP bound and personal inventory matches the fresh run. All six worker processes exit successfully. Freeze verification checks **25,659 pins** and excludes the synthetic normal-Scion test calibration from runtime JavaScript.

The remaining work includes normal Scion XP calibration, the Pariah activation/gem/conversion sequence, the full Twisted Evils quota and clear yield, later route funding, travel review, current-game checks, then all **528 edition/settings, 32 mixed settings and 784 native starter cases**. No full-guide or actual-payout readiness is claimed. The canonical segment index and public V1394 download remain unchanged.

Evidence under `.cache/leveling-no-grind-20261031/`: `margol-preflight-v1446.json`, `prepare-margol-fixtures-v1450.mjs`, `margol-route-v1456.json`, `margol-validation-v1457.terminal.json`, `margol-validation-v1458.terminal.json`, `margol-engine-v1459/scope.json`, `margol-native-v1460.json`, `margol-source-v1460.json`, `margol-handoffs-v1462-*.json`, `margol-handoffs-v1462.terminal.json`, `margol-qualification-v1463.json` and `source-flow-progress-v1464.json`.
