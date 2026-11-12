# World quest reward references and overlevel coverage

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The later **V1627 candidate** retains the twenty-one corrections below and admits eleven additional curves. [Latest qualification and recalculated bars](forever-leveling-orientation-reward-references.md). The V1610 results below describe the preceding world-reference component.

The private **V1610 candidate** corrects twenty-one inherited historical XP bases and supplies their source-qualified overlevel curves. It uses the unchanged **V1592 engine / XP revision 219**. The physical route, source bindings, item requirements, quest quantities and captured probabilities stay unchanged. This candidate is not published, and its historical references are not observed Forever payouts.

## What the full audit found

The audit covers every pinned reward fact: **1,641 quests × player levels 1–60 = 98,460 checks**. There are no arithmetic mismatches. The **654 client-derived facts** also match both pinned client caches and the QuestXP table.

An unknown result remains unknown in that matrix. The first pass found **136 quests / 2,911 overlevel cells** with insufficient evidence. Forty of those quests appear in the raw route. Passing the arithmetic check does not establish those missing values or actual hand-in levels.

Twenty-two ordinary-class cases matched the current quest identity, reward level and objective text, and had no historical reward script; only their inherited full XP differed. Twenty-one have two explicit Classic correction values that both match the pinned database rule. The remaining case, **The Horn of the Beast (3181)**, has conflicting alternatives and stays unchanged.

## Adopted historical corrections

The original values and complete source lines are retained in `world-base-reference-review-v1610.json`. All published, observed and client-final facts remain untouched. Historical Type 0/1 applies to these cases; no dungeon coefficient is added.

| Quest | Previous inherited base | Corroborated Classic base |
| --- | ---: | ---: |
| 176 · Wanted: “Hogger” | 880 | 875 |
| 305 · In Search of The Excavation Team | 970 | 975 |
| 306 · In Search of The Excavation Team | 485 | 490 |
| 599 · The Bloodsail Buccaneers | 820 | 825 |
| 663 · Land Ho! | 690 | 700 |
| 1260 · Morgan Stern | 710 | 700 |
| 1450 · Gryphon Master Talonaxe | 890 | 900 |
| 1477 · Vital Supplies | 970 | 975 |
| 2606 · In Good Taste | 455 | 460 |
| 2661 · Delivery for Marin | 455 | 460 |
| 3444 · The Stone Circle | 4,900 | 4,700 |
| 3448 · Passing the Burden | 510 | 500 |
| 3661 · Favored of Elune? | 6,300 | 6,000 |
| 3881 · Expedition Salvation | 3,950 | 4,200 |
| 3883 · Alien Ecology | 2,550 | 3,050 |
| 4127 · Boat Wreckage | 375 | 380 |
| 4130 · Psychometric Reading | 375 | 380 |
| 4267 · Rise of the Silithid | 405 | 410 |
| 4493 · March of the Silithid | 530 | 525 |
| 4494 · March of the Silithid | 530 | 525 |
| 5215 · The Scourge Cauldrons | 530 | 525 |

Sixteen corrected quests occur in the raw route; nine hand-ins are reached before the current Scion checkpoint. All other corrections receive no early XP.

The [pinned inherited support input](https://github.com/Questie/QuestieDB/blob/365537a340473291f5af3b7a53a5eca94e2a5f1a/support/Forever/QuestXP/xpDB-classic.lua) explicitly documents the Classic alternatives. Its [Forever provenance](https://github.com/Questie/QuestieDB/blob/e9a67d1a2753a0e64c4c96bf7864788fac7b765f/docs/forever-data.md) identifies the Era seed. Database identity, exact source bytes and the [historical XP rule](https://raw.githubusercontent.com/cmangos/mangos-classic/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Quests/QuestDef.cpp) remain pinned. This source hierarchy is applied in both directions, rather than selecting whichever value grants more XP.

## Arithmetic and replay

All six primary five-Human scenarios are recalculated from 1+0. The reached corrected quests are 176, 1260, 663, 599, 1450, 1477, 4127, 4130 and 4267. Their reference hand-ins add a net 30 XP. Subsequent combat rewards and correlated bounds are recalculated, so the endpoint change differs by scenario.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 7,723 | 46 + 48,058 | 46 + 90,636 |
| Yes | 46 + 24,424 | 46 + 64,877 | 46 + 107,833 |

For the expected scenario without mallet confirmation, quest contributions change by **+30**, combat contributions by **+6**, and lower-bound tightening by **−2**, giving **+34 XP** at the checkpoint. These are modeled workload bounds, not observed bars or guarantees for every loot outcome.

The prefix before the first changed hand-in is identical. Fresh independent conservation checks cover **60 old/new player forecasts and 141,600 steps**, including continuity, contribution bounds and endpoint reconciliation. Incidental XP is already included in combat XP and is never added again. Saved-state checks cover **24 handoffs / 120 player continuations**, reject older hypothetical route models and preserve the 10,000-character model limit.

An independent binary32 oracle checks all **21 × 59 = 1,239** new curve cells using integer fractions and nearest-even rounding, separately from the historical helper's `Math.fround` expressions. A first audit simplification using exact decimal tenths was rejected: the pinned float division/multiplication/ceiling can differ by one XP. For example, the historical expression returns 421 for Land Ho! at player level 42, while the simplified calculation gives 420. The diagnostic is retained; the runtime and candidate were not changed to satisfy the incorrect oracle.

The final 98,460-cell matrix passes, along with **18,045 reached ordinary reward records / 602 quest identities**, **240 dungeon slots**, **80 native role exports / 40 Lua syntax checks**, and the eight-setting static flow audit. The unchanged runtime's **4,352 tests / 259 files**, typecheck, lint and six builds are reused from their recorded successful run; they are not rerun here.

## Remaining qualification

The corrections resolve **227** previously unknown overlevel cells. **115 quests / 2,684 cells** remain unsupported. Published evidence, scripts, class restrictions, identity/level differences and ambiguous bases are not silently overridden. These are data-coverage limits; the guide does not assign them zero XP or skip required work to obtain a passing forecast.

Every primary forecast still stops at `dungeon-maraudon-objectives-complete-7041` because normal Noxxious Scion payout is unresolved. The existing elite calibration is not applied to normal enemies. Twisted Evils remains **25 carvings per player / 125 for the party** without a qualified single-clear yield.

Later arrival levels/funding through 60, current-server payouts, physical travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. The public V1394 download and canonical indexes are unchanged. No commit, push or deployment is made.

Evidence under `.cache/leveling-no-grind-20261031/`: `all-reward-levels-v1608.json`, `reward-coverage-gaps-v1609.json`, `world-base-reference-review-v1610.json`, `world-base-route-construction-v1610.json`, `world-base-route-validation-v1611.json`, `naive-world-xp-oracle-rejected-v1612.json`, `all-reward-levels-v1612.json`, `world-base-conservation-v1613.json`, `world-base-native-validation-v1614.json`, `later-quest-flow-v1615.json`, `world-base-qualification-v1616.json` and `source-flow-progress-v1617.json`.
