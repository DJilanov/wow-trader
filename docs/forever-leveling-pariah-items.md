# Pariah acquisition and item conversion

The private **V1539 engine / XP revision 217** implements Pariah's complete reference lifecycle: six acquisition fights, the client item conversion and the captured return to the Centaur Pariah. The **V1540 primary candidate** includes that lifecycle. All **4,313 tests in 257 files**, strict typecheck, source lint and all six entrypoint builds pass; all 256 older test files remain unchanged. This candidate is not published, and its full lifecycle remains beyond an unresolved dungeon XP checkpoint in the fresh-party forecast.

## Hand-in semantics

The [current Forever quest page](https://www.wowhead.com/forever/quest=7067/the-pariahs-instructions) lists both amulets. V1472 interpreted that list as two final hand-in requirements. **V1486 corrects that interpretation.** The pinned [QuestieDB schema](https://raw.githubusercontent.com/Questie/QuestieDB/e9a67d1a2753a0e64c4c96bf7864788fac7b765f/src/meta/questMeta.lua) separates field 10 objectives from field 21 acquisition materials. The literal quest row has only **17758, Amulet of Union**, as its item objective; its six source materials are the activation amulet and gems.

The historical template likewise has Union in `ReqItemId1`, with Spirits in the separate `ReqSourceId1`. The exact pinned reference-core delivery function checks only the required item slots. A compiled contract passes six cases, including successful delivery with Union and no remaining Spirits, and rejection with Spirits alone. Both client recipes consume Spirits plus the gems to create Union, so these references agree. This is reference-method evidence, not current-server execution or payout calibration.

The earlier quest-log question is **no longer required for the reference method**. No player confirmation is fabricated. The complete method accepts only the exact captured return eligible for the current plan. Duplicate, early, wrong-zone, inside-instance, unmatched and Hardcore-only returns are rejected. An acquisition-only selection still cannot pass complete-guide export. The old V1472 conflict record remains historical, superseded by `pariah-hand-in-semantics-v1486.json`.

## Implemented acquisition

| Step | Hostile creature | Personal item | Context |
| --- | --- | --- | --- |
| 1 | The Nameless Prophet, 13718 | Amulet of Spirits, 17757 | Outside |
| 2 | Gelk, 13741 | Second Khan gem, 17762 | Outside |
| 3 | Kolk, 13742 | First Khan gem, 17761 | Outside |
| 4 | Magra, 13740 | Third Khan gem, 17763 | Outside |
| 5 | Veng, 13738 | Fifth Khan gem, 17765 | Dungeon |
| 6 | Maraudos, 13739 | Fourth Khan gem, 17764 | Dungeon |

The method binds exact provider hashes, archived phases, hostile transformations, loot identities, personal quantities and action order. Materials have auxiliary item records with **no invented quest-counter indices**. Under the pinned fixed-one shared-loot reference, each fight supplies one item per player. The Prophet drop requires the active quest. These are planning references, not measured current-server rates or payouts.

Every player retains their activation amulet through all five manifestations. Friendly spirits do not supply the hostile creatures' XP. Four outside fights and two dungeon fights keep their separate XP contexts; the already-per-player dungeon reference is not divided by five again.

Conversion requires all five gems and the activation amulet, consumes all six atomically and establishes one Union amulet per player. The instruction book remains. Missing ingredients cannot create output or consume a partial recipe. Repeated completion cannot consume another set. An independently known output makes conversion unnecessary without establishing extra ingredients. Conversion grants no kill or quest XP.

The actual return consumes Union once and leaves the instruction book. In the controlled level-46 component test, the existing 5,450 historical base reward receives the dungeon coefficient once, producing **12,950 XP per player** after the existing rounding. Reporting task completion changes inventory and marks actual XP as needing an update; it does not invent an observed XP bar. An activation amulet without Union grants no delivery reward.

## Primary route placement

The outside pickup, Prophet and three outside Khans share the existing Shadowshard visit before the Theramore hand-in. Their materials are retained across that return trip. The full instance visit includes Veng on the orange side, a separate orange Rod objective, the purple-side Maraudos and Diamond objectives, then conversion. Interior waypoints are not invented from continent coordinates.

After the dungeon, the authored return order is **Pariah → Willow → Nijel's Point**. Talendria and Keeper Marandis are both at Nijel's Point. Twisted Evils is now accepted at Willow before the first outer-cave visit, and Marandis is visited on the return from Theramore before the full dungeon run. The older instruction placing Marandis near the dungeon entrance is corrected from the pinned NPC positions. These are reference-based travel instructions, not measured travel-time or gameplay qualification.

## Shared inventory behavior

`CampaignAction.itemUse` describes required items, consumed inputs and an optional output. The ledger, forecast, task reports and saved projection compatibility use the same definition. A missing item stops shared work before combat or conversion is credited. Source-skipped actions do not produce items.

Explicit ingredient dependencies retain collection tasks across section boundaries; unrelated orphan tasks retain their existing filtering. Native source processing keeps the actual use and collection directives and the eligible captured return. The stale party-policy exclusion is replaced only when the complete physical method qualifies.

Saved conversion models bind their related acquisition and delivery phases, order, source conditions, locations, personal quotas and rewards, as well as the recipe itself. Changed definitions reject the old hypothetical continuation. The current primary model fits the existing 10,000-character bound; that validation limit is unchanged.

Implementation: `.cache/leveling-no-grind-20261031/collateral-loot-engine-v1539/verified-source/campaign-pariah-acquisition.ts`, `campaign-item-use.ts`, `campaign-combat-projection.ts` and their tests. The combat attachment pipeline composes the method. Raw input artifacts and canonical route files remain unchanged.

## Verification and remaining scope

The method's **58 component cases** cover exact client reagents, partial and repeated conversions, personal drops, retained activation items, six consecutive reference fights, source skips, rejected definitions, actual reporting, saved progress, complete native exports and incomplete-export rejection. Controlled level-46 tests qualify the component's reference behavior, not current-server payout or a complete fresh-party run.

The fresh 1+0 primary candidate reaches the Prophet, three outside Khans and Veng, with one personal drop per player from each shared fight. All thirty player forecasts stop at `dungeon-maraudon-objectives-complete-7041`, the unresolved normal Scion payout. The sixth acquisition fight, conversion and Pariah return are later in the route and contribute no future reward to that reached prefix.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 1,310 | 46 + 44,622 | 46 + 84,444 |
| Yes | 46 + 18,118 | 46 + 61,505 | 46 + 101,697 |

These are modeled loot workloads, not guarantees of every possible drop outcome. Explicit grinding remains zero; outdoor incidental combat remains 30%, dungeon incidental combat 10%, and the quest-log peak remains 11 of 40. Twisted Evils retains the user's choice of **25 carvings per player, 125 for the party**.

The current primary audit checks 24 serialized handoffs and 120 player continuations, rejects 24 older hypothetical models, and checks twenty native leader/party exports plus Lua syntax. The required Prophet fight is counted once while incidental carving loot remains unknown. Its numerical forecasts are unchanged by the saved-model compatibility correction. The 750 continuations recorded for V1459 remain historical evidence, not a new full-route claim.

Remaining work includes normal Scion payout, Twisted's actual full-clear yield, the route beyond the current checkpoint through 60, travel and current-game checks, and the original **528 edition/settings, 32 mixed settings and 784 native starter cases**. The public V1394 download and canonical locks remain unchanged. No commit, push or deployment is made for this revision.

Current evidence under `.cache/leveling-no-grind-20261031/`: `pariah-hand-in-semantics-v1486.json`, `pariah-return-validation-v1494.terminal.json`, `pariah-resume-validation-v1503.terminal.json`, `pariah-resume-engine-v1504/scope.json`, `pariah-route-construction-v1496.json`, `pariah-route-validation-v1505.json`, `pariah-route-qualification-v1506.json` and `source-flow-progress-v1507.json`. Earlier failed checks remain preserved; the final checks above pass.

V1521 also binds supplied-parcel delivery definitions, including Seed of Life, within the existing saved-model size limit. [Current Seed lifecycle, route and checks](forever-leveling-seed-of-life.md). The latest receipt is `source-flow-progress-v1546.json`; the earlier V1507 receipt above records the Pariah-only revision. [Current early Willow pickup and collateral-loot regression](forever-leveling-collateral-loot.md).
