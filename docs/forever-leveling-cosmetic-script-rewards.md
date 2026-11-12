# Exact historical script and title reward references

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The later **V1627 candidate** retains these eight curves and admits three more. Its Back to Booty Bay correction changes reached XP totals. [Latest results](forever-leveling-orientation-reward-references.md). The V1620 results below describe the preceding cosmetic-script component.

The private **V1620 candidate** admits eight additional historical reward curves while preserving the physical route, quest quantities, captures and global guards. It uses the unchanged **V1592 engine / XP revision 219**. These are historical planning references, not observed Forever payouts. The candidate is not published.

## Qualified cohort

| Quest | Reference review | Full historical base |
| --- | --- | ---: |
| 621 · Zanzil's Secret | Dialogue and NPC flags | 3,750, unchanged |
| 703 · Barbecued Buzzard Wings | Dialogue | 2,350, unchanged |
| 1117 · Rumors for Kravel | Dialogue, emotes and NPC flags | 3,500, unchanged |
| 1364 · Mazen's Behest | Dialogue | 3,300, unchanged |
| 2641 · Sprinkle's Secret Ingredient | Dialogue, active NPC state and NPC flags | 4,550, unchanged |
| 2866 · The Ruins of Solarsal | Exact title differs by one trailing space | 2,700, unchanged |
| 2939 · In Search of Knowledge | Dialogue | 420, unchanged |
| 3449 · Arcane Runes | Dialogue/emote script and matching Classic alternatives | 2,550 → 2,650 |

Every admitted case matches its current quest identity, objectives, level, minimum level and ordinary class access. Both documented Classic alternatives agree with the historical XP rule. The Solarsal exception requires the exact recorded title plus one trailing space; title matching is not relaxed globally. All eight are historical Type 0 and receive no dungeon coefficient.

The full database scripts are extracted and checked against pinned [historical ScriptMgr source](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/DBScripts/ScriptMgr.cpp). Only commands **0 (dialogue), 1 (emote), 21 (active object state) and 29 (NPC flags)** occur in the seven programs. Their checked handlers do not grant reward XP, cast spells, summon combatants or start nested scripts. Reward spell fields are zero; every referenced start/end script is present. No script is executed by the audit.

The pinned [historical hand-in code](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Entities/Player.cpp) calculates and grants base quest XP before starting the completion database script. That ordering supports the narrow base-curve reference; it does not establish current Forever script behavior, timing, access or extra side effects. Combat-spawning, spell-casting, movement and other unreviewed programs remain held. The default script-exclusion helper and all existing runtime guards remain unchanged.

Original facts, exact script rows, source files, handler snippets, title differences and source lines remain in `cosmetic-script-reward-review-v1620.json`. Source file bytes are matched to the pinned repository tree and Git blob identities. No published, client-final or observed reward fact is replaced.

## Numerical and native checks

- The full **1,641 × 60 = 98,460 quest/level matrix** passes, with unknown values explicitly retained. The 654 client-derived facts remain bound to both client caches and the QuestXP table.
- All **29 × 59 = 1,711** qualified world-reference curve cells pass the independent integer-fraction binary32 oracle. Its earlier 5,000 controls remain reusable because the oracle implementation is unchanged.
- All six primary fresh 1+0 scenarios retain their reached numerical ledgers, reward amounts, combat rows and bounds across **30 players / 70,800 steps**. Reward source provenance changes. Six newly qualified hand-ins are reached; Arcane Runes and Sprinkle's Secret Ingredient are later and receive no early XP.
- Independent checks cover **18,045 reached ordinary reward records / 602 quest identities**, **240 dungeon slots**, and **24 saved handoffs / 120 player continuations**. Older hypothetical model states are rejected.
- **80 native role exports / 40 Lua syntax checks** and the eight-setting static quest-flow audit pass. These checks do not establish actual game execution or arrival levels.

The existing conservation proof is reused through exact equality of all reached numerical ledgers. It is not rerun here. The unchanged runtime's 4,352 tests, strict typecheck, lint and six builds are also reused from their recorded successful run.

The primary lower bars remain:

| Optional mallet confirmed | Fast | Expected | Slow |
| --- | --- | --- | --- |
| No | 46 + 7,723 | 46 + 48,058 | 46 + 90,636 |
| Yes | 46 + 24,424 | 46 + 64,877 | 46 + 107,833 |

These are modeled workload bounds, not observed bars or guarantees for every loot outcome. Every primary forecast still stops at the normal Scion payout checkpoint.

## Remaining evidence

This review resolves **80** more missing overlevel values. **107 quests / 2,604 cells** remain unsupported; sixteen of those quests occur in the raw route. They are not assigned zero XP, removed from required work or silently treated as qualified.

A fresh primary-source review does not settle the remaining Scion payout. [Blizzard's October 8 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-november-2/2360696/5) describe an approximate dungeon-creature XP increase and individual player-level adjustment, but supply no exact normal-Scion payout. No extra multiplier is applied to the existing owner reference. The accessible Wowhead [Scion page](https://www.wowhead.com/forever/npc=13696/noxxious-scion) supplies no numeric payout, and the [Horn of the Beast page](https://www.wowhead.com/forever/quest=3181/the-horn-of-the-beast) supplies no numeric XP value in its accessible parsed content. Direct raw-page requests returned 403. Secondary summaries are not used to resolve either numeric uncertainty.

Twisted Evils remains **25 carvings per player / 125 for the party** without qualified single-clear yield. Full 1–60, current-server payouts, travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. Public V1394 and the canonical indexes are unchanged. Nothing is committed, pushed or deployed.

Evidence under `.cache/leveling-no-grind-20261031/`: `current-primary-source-review-v1618.json`, `historical-quest-script-review-v1619.json`, `quest-scripts-core-v1619/sources.json`, `cosmetic-script-reward-review-v1620.json`, `script-reward-route-construction-v1620.json`, `script-reward-route-validation-v1621.json`, `all-reward-levels-v1622.json`, `script-reward-native-validation-v1623.json`, `later-quest-flow-v1624.json`, `cosmetic-script-qualification-v1625.json` and `source-flow-progress-v1626.json`.
