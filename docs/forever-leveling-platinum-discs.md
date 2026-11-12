# Uldaman follow-up and independent reward audit

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The current private engine is V1592, now used by V1627. The Uldaman action order remains unchanged. [Latest reference curves and recalculated bars](forever-leveling-orientation-reward-references.md); [world corrections](forever-leveling-world-reward-references.md); [source-binding checks](forever-leveling-later-quest-flow.md). The V1549 results below describe the preceding Uldaman component.

The private **V1549 candidate** accepts quest **2279, The Platinum Discs**, immediately after the existing inside-Uldaman hand-in of 2278. The old order placed this acceptance after Zul'Farrak, even though its giver remains inside Uldaman. The correction removes that unintended return to the dungeon. The frozen **V1539 engine / XP revision 217** is unchanged, and the candidate is not published.

## Source and route

The exact archived `chapter-31-44-48-feralas`, step `source-step-0127`, turns in 2278 and accepts 2279 at the Discs of Norgannon. The pinned literal quest and object records agree: object **131474** starts 2279 inside Uldaman, and 2278 is its prerequisite. The giver's instance association supplies context; no interior coordinates are invented. The current [Uldaman source guide](https://www.wowhead.com/forever/guide/uldaman-dungeon-overview-location-rewards) also describes the post-Archaedas disc conversation and follow-up.

The moved action keeps its original identity and exact source step. It now belongs to the Uldaman leg, directly after `dungeon-uldaman-rewarded-2278`, with an explicit 2278 prerequisite. All other actions, hand-ins, reward facts, item requirements and captured probabilities are unchanged. Only the two affected legs change their action membership; unrelated leg metadata is preserved.

The literal provider identifies **6064, Miniature Platinum Discs**, as the supplied item. The narrow historical reference supplies one and requires the same one at delivery, with no additional items, kills, spells or scripts. Players keep it for High Explorer Magellas at the existing later Ironforge visit. Existing implicit courier handling is retained; this revision does not add explicit inventory minima or a new item-ledger implementation. The subsequent voucher quest, 2439, stays at its existing Magellas/Dinita visits.

The disc and voucher continuations are historical **Type 0**, whereas the preceding dialogue quest is **Type 81**. Starting inside a dungeon does not by itself prove a dungeon reward coefficient. No coefficient is added to the two continuations on that basis. Both checked client-cache files lack these three quest records, and direct Forever quest pages return a verification page, so no newly observed reward is claimed.

## Independent arithmetic

The new audit does not call the engine's quest-reward resolver. It checks each reached hand-in against its pinned per-level table, raw client calculation reference or historical base, including every level in the recorded hand-in interval. It separately checks rounding and a single 2.375 coefficient for the already classified unscaled dungeon rewards; client-final amounts receive no second coefficient.

Across six primary scenarios and five players, checks pass for **18,045 ordinary quest-reward records covering 602 distinct quest identities**, plus **240 owner-confirmed dungeon quest slots**. The latter comprise all four Drowned City and all four Krol'dok slots per player in each scenario. Their sequential level crossings and final XP bounds are recomputed from the raw XP curve. These slot amounts remain planning estimates, not measured payouts or newly discovered quest IDs.

The complete reward totals reconcile with section totals, with no repeated ordinary quest reward or repeated bundle slot. This proves arithmetic against the current inputs; it does not independently establish their current-server classifications or payout assumptions.

Thirty primary player forecasts retain the previous XP totals and bounds. The existing disc and voucher hand-ins retain their rewards and actual hand-in level ranges. Eighteen serialized handoffs preserve **90 player continuations** and reject older hypothetical route models. Twenty native role exports pass source/manifest review, and ten generated addon artifacts pass Lua 5.1 syntax. Each export accepts 2279 before the first outside-Uldaman hand-in, then emits each actual disc/voucher phase once. No new package unit, typecheck, lint or build run is claimed: the frozen engine is unchanged and its earlier 4,313-test validation remains pinned.

## Parcel and classification census

All **189** selected supplied-item identities are checked against literal provider quest rows. Every literal object starter is checked against its object's quest list. The **124** narrow historical parcel matches classify as:

| Classification | Quests |
| --- | ---: |
| Existing source-qualified courier | 49 |
| NPC-supplied parcel reference | 35 |
| Object-supplied parcel reference | 22 |
| Item-start acquisition needing its separate method | 6 |
| Not active in the default primary selection | 9 |
| Existing explicit parcel ledger | 3 |

The other 65 supplied-item quests fall outside the narrow parcel criteria. This classification grants no free inventory and does not establish that every courier's gameplay or inventory reporting is qualified. The earlier census also located phases too broadly within mixed-quest source steps; the new audit matches both quest ID and state. It finds no reversed pickup/return order in the exact parcel cohort. The genuinely misplaced Uldaman pickup was chronologically before its return but in the wrong physical visit.

A separate historical-type audit covers **all 796 selected quest identities**, with 754 historical rows available. It identifies **11 unscaled classification review candidates**: 2864, 721, 722, 3801, 4242, 4264, 4282, 4342, 4361, 5281 and 4363. Their historical Type 81 is absent from the current dungeon association table. This is a concrete review queue, not proof that current Forever applies a multiplier to each. No rewards or classifications are changed by that audit. The arithmetic check must not be presented as resolving these candidates.

## Remaining qualification

All six primary forecasts still stop at the unresolved normal Scion payout, with the same lower bars as V1540. Twisted Evils retains **25 carvings per player / 125 for the party**, with no verified single-clear yield. The 11 classification candidates, later route through 60, current-server payouts/travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. The public V1394 download and canonical locks are unchanged; no commit, push or deployment was made.

Evidence under `.cache/leveling-no-grind-20261031/`: `route-parcel-classification-v1556.json`, `platinum-route-construction-v1549.json`, `platinum-route-validation-v1555.json`, `platinum-native-validation-v1552.json`, `quest-type-review-v1557.json`, `platinum-route-qualification-v1559.json` and `source-flow-progress-v1560.json`. The V1548 broad-metadata draft and the V1551 audit that omitted bundle totals are retained as nonqualifying attempts; V1549 and V1555 supersede them.
