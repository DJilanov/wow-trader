# Sleeping-bag chain in the five-player guide

The six stages are integrated locally for the primary Human-led shared route. This is part of the still unfinished 1–60 guide; nothing is deployed. [Current validation](forever-leveling-product-plan.md#current-local-review--group-program-boundaries-v200).

| Quest | Stage | Scheduled visit | Full-band reference XP/player | Expected replay (V200) XP/player |
| --- | --- | --- | --- | --- |
| 79008 | ... and that note you found | Westfall pickup; southern Barrens return | 1,750 | 1,750 |
| 79192 | Stepping Stones | Barrens pickup; Stonetalon camp return | 1,950 | 1,950 |
| 79980 | Scramble | Pocket Litter → Mound of Dirt | 200 | 200 |
| 79974 | Wet Job | Stonetalon → Loch Modan dam | 2,550 | 2,550 |
| 79975 | Eagle’s Fist | Dam → first eligible Hillsbrad visit at Thoradin’s Wall | 2,550 | 2,550 |
| 79976 | This Must Be The Place | Messenger Bag → satchel below | 1,950 | 1,950 |

Minimum level is fourteen. Every player interacts with the objects; the quests cannot be shared. The regional sequence uses the existing Westfall, Kalimdor, Wetlands and Hillsbrad journeys, including a real detour to the southern Barrens tower. The camp trail, mountain ledge, dam ledge and wall climb need careful execution. No zero travel time, instant object availability, extra grinding or death shortcut is assumed.

The final two handoffs use the earliest real shared Hillsbrad quest visit after the dam, including an earlier visit added by quest funding. A timed courier is handed in before the wall detour; the bag work cannot be inserted between a timed pickup and return. Earlier-than-dam, optional, personal, ambiguous and inside-dungeon visits are ineligible. The same wall action ID, phases, positions and instructions remain, and chapter indexes follow its actual visit. V198 restored the connected early route. The current V200 replay retains all six reached hand-ins, paying the 10,950 reference total once per player.

Only actual reached hand-ins pay XP. **10,950** is the sum of six full-band reference rewards, not an upfront payment or a guaranteed amount at every hand-in level. Curves come from matching 70205/70450 client reward bindings and captured QuestXP rows. They remain calculated estimates with current-server/buff/rounding limitations. Sleeping-bag buffs, rested XP, food and Student Fodder are excluded from this forecast. Rekindle remains a separate optional activity.

Source: [Wowhead Forever route](https://www.wowhead.com/forever/guide/cozy-sleeping-bag-locations-rewards), [Alliance starting quest](https://www.wowhead.com/forever/quest=79008/and-that-note-you-found). Client records: [Efficient Games output](https://github.com/JIVESCORP/eg-link-output-wowf/tree/9c3f82fc7c8ce60760e933db529fd629c2f682d7), CC BY 4.0, https://efficient.games. The proof retains the full source masks; the legacy catalog stores their lower 32 bits, and broader editions still require their original validation.

Implementation: `packages/leveling/src/sleeping-bag-reference.ts`, `campaign-sleeping-bag.ts`, `fixtures/sleeping-bag-70205-70450.json`; hook in `prepareCampaignPlan`. The connector requires the whole matching six-quest catalog/reward set, all regional anchors and the primary shared edition. It preserves the old actions and their order, adds the twelve phases once and refuses partial/incompatible inputs.

Verification: twenty-eight focused regressions cover lifecycle, party credit, late reductions, below-minimum rejection, unchanged existing work, partial/conflicting inputs, first eligible visits, active timed deliveries, quest capacity and all five class addon exports. Current replay and independent numerical/native results are in `.cache/leveling-no-grind-20261031/primary-xp-v200-qualified-review/`. V198, the stopped V199 candidate and the first V200 harness failure remain separate historical evidence. The V200 continuation preserves the exact fresh production plan and runtime. Source qualifications are in `wowhead-and-sleeping-bag-v187-qualified/` and `complete-shared-fury-v188/`. Those artifacts must be published together with the matching reader in a future authorized release; this turn changes no live pointer.

The V200 independent numerical/native and deadline-contract checks pass, including enemy caps for all 24 loot-workload settings. The previous fast-loot combat gate is cleared. All workloads reach the level-29 pickup, with deficits of 20,800 fast / 14,338 expected / 8,353 slow XP/player. These component results do not make the full guide ready.
