# Doomed Fleet in the five-player route

The complete chain is integrated locally for the primary Human-led party after Excavation. [Current route validation](forever-leveling-product-plan.md#current-local-review--group-program-boundaries-v200). Primary 1–60 is still unfinished; nothing is deployed.

| Quest | Physical work | Full-band reference XP/player | Expected prefix |
| --- | --- | --- | --- |
| 288 The Third Fleet | Accept from Fitzsimmons; each player buys one item 2594 from Helbrek; return it | 220 | Reached |
| 289 The Cursed Crew | 13 shared sailors + 5 shared marines; defeat Snellig and each player loots the trophy | 1,750 | Reached |
| 290 Lifting the Curse | Return to Menethil; defeat Halyndor for each player's key; open the strongbox | 1,200 | Reached |
| 292 The Eye of Paleth | Take the Eye from the strongbox and carry it to Glorin in Menethil | 1,200 | Reached |
| 293 Cleansing the Eye | Carry the Eye to Benedictus during the actual Stormwind transit toward Lakeshire | 2,450 | Reached |

All five accept and complete the tasks. One successful shared-roll Snellig/Halyndor drop supplies each eligible nearby player; the model does not multiply either named enemy by five. Every player buys their own drink. The vendor may call item 2594 Flagon of Dwarven Honeymead while the quest and legacy export call it Flagon of Mead. Keep enough coin to buy it; no free stock is seeded. No purchase, carry or object interaction is converted into kill XP.

The nearby Wetlands returns finish first, followed by both wreck visits and their Menethil return before the city trip. The actual route continues through Ironforge, Stormwind for Benedictus, and Lakeshire for Dorin. The wreck visits remain real travel. Use the shore-facing breach to reach Snellig's lower hull; watch breath and regroup. Reach Halyndor along the northern ship's rudder and pause damaging spells during Ward of the Eye. Open strongbox 112948 with the key and keep the Eye through the later handoffs. No instant respawn, free travel, automatic item possession or measured completion time is assumed. Authored positions use the reviewed provider/source records. Benedictus uses the Forever recipient endpoint at Stormwind 50.31, 45.47; no older Classic map coordinate is substituted. These remain references rather than a fresh in-game calibration.

The current expected prefix reaches all five rewards: 6,820 quest XP + 663 shared outdoor combat XP per player from 20 physical deaths. The final 2,450 pays only at the actual Stormwind hand-in. Both combat activities remain outdoor even though their tasks now sit in the dungeon return chapter. All 6,820 quest XP is the full-band reference total; hand-in-level curves and future source changes still apply. Client-derived rewards and historical loot sharing/rates remain reference assumptions, not current-server payout measurements.

Sources: matching 70205/70450 client records from [Efficient Games](https://github.com/JIVESCORP/eg-link-output-wowf/tree/9c3f82fc7c8ce60760e933db529fd629c2f682d7), CC BY 4.0, https://efficient.games; exact hashed [QuestieDB provider revision](https://github.com/Questie/QuestieDB/tree/e9a67d1a2753a0e64c4c96bf7864788fac7b765f); [Third Fleet](https://www.wowhead.com/forever/quest=288/the-third-fleet), [Lifting the Curse](https://www.wowhead.com/forever/quest=290/lifting-the-curse) and the captured archived method. Original guide guards are retained; this independently reviewed method is not produced by removing them.

Implementation: `campaign-doomed-fleet.ts`, `fixtures/doomed-fleet-70205-70450.json`, authored purchase recognition in `combat-purchase.ts` and mixed counter retention in `campaign-combat.ts`. The connector requires exact reviewed catalog/reference/creature records, all regional anchors and a compatible five-player primary plan, refuses partial ownership and repeats idempotently. Candidate data and reader must be published together in a future authorized release; live pointers stay unchanged.

Twenty-two route regressions plus purchase attribution tests cover all handoffs, exact vendor/quantity, full mixed counters, +4 safety, forty quest slots, no early city XP, no input mutation and five class exports. Full replay/native results are in `.cache/leveling-no-grind-20261031/primary-xp-v196-qualified-review/`; source qualifications are in `doomed-fleet-v192/`.

The V196 replay retains these component handoffs and native inventories. Its independent numerical/native and deadline-contract checks pass. The fast-loot combat gate and expected level-29 deficit remain unresolved; these component results do not make the full guide ready.
