# Orientation and post-reward spell references

> Current private validation: **V1643–V1650** resolves twelve historical base-component curves, with scripted lifecycles still unqualified. The expected primary lower checkpoint is **46 + 48,073**; all cases still stop at the normal Scion payout. See [current evidence and limits](forever-leveling-script-base-reward-references.md). Public V1394 is unchanged; nothing is deployed. Earlier revision results below are historical.

The private **V1627 candidate** adds three source-qualified historical reward curves using the unchanged **V1592 engine / XP revision 219**. Physical actions, quest quantities, captures and global guards stay unchanged. These are historical planning references, not current Forever payout measurements. Nothing is published.

| Quest | Exact reference review | Full historical base |
| --- | --- | ---: |
| 692 · The Lost Fragments | Facing-only branches, emotes, stand state and NPC virtual equipment | 3,300, unchanged |
| 1118 · Back to Booty Bay | Facing-only branches, dialogue and NPC flags | 890 → 900 |
| 5217 · Return to Chillwind Camp | No start/end script; reference Stamina spell after base XP | 2,650, unchanged |

## Why these cases qualify

Every admitted case matches the current quest identity, objective text, level, minimum level and ordinary class access. The two documented Classic alternatives agree with the pinned database rule. Original facts remain in provenance; published, client-final and observed facts are untouched. All three are historical Type 0, with no dungeon coefficient.

For 692 and 1118, every command-3 row has **zero x/y/z coordinates, zero control/relay fields and zero data flags**. The pinned [historical handler](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/DBScripts/ScriptMgr.cpp) therefore reaches its facing branch and exits before movement or relay processing. This does not admit arbitrary movement commands. The remaining commands are exact reviewed dialogue/emote/NPC-state, stand-state and NPC virtual equipment operations; there are no reward spells or unresolved script references in these two programs.

For 5217, both start/end script IDs are zero. Its reward-spell field is the exact ID **10937**. The historical [hand-in code](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Entities/Player.cpp) calculates and awards base XP before looking up or casting that reward spell. The primary [Classic spell record](https://www.wowhead.com/classic/spell=10937/power-word-fortitude) describes Power Word: Fortitude's Stamina effect. This qualifies the historical base curve; it does not establish current Forever buff behavior, eligibility, future side effects or actual payouts. No buff XP is invented.

The global script/title helper is unchanged. Other programs involving actual movement, waypoint/relay processing, spell casts, combat spawns or unresolved behavior remain held. Source files and exact program rows are pinned to the historical repository revision; scripts are inspected, not executed.

## Checks and recalculated progress

The full **1,641 × 60 = 98,460 quest/level matrix** passes. All **654 client-derived facts** remain bound to both cached builds and the QuestXP table. The independent binary32 oracle checks **32 × 59 = 1,888** historical world-reference curve cells. Unknown and ineligible results are retained explicitly.

All six primary five-Human scenarios are replayed from 1+0. Back to Booty Bay's reached reference reward rises by 10 XP; Lost Fragments' reached amount stays unchanged. Return to Chillwind Camp is later than the normal Scion checkpoint and receives no early XP. Subsequent rewards, combat and interval bounds are recalculated.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 7,733 | 46 + 48,068 | 46 + 90,641 |
| Yes | 46 + 24,434 | 46 + 64,887 | 46 + 107,838 |

These are modeled workload bounds, not observed bars or guarantees for every loot outcome. The slow scenarios gain five endpoint XP rather than ten: quest contributions rise by ten, combat contributions fall by eight, and bound tightening changes by three. No flat endpoint adjustment is used.

Fresh independent accounting verifies **60 old/new player forecasts / 141,600 steps**, including continuity, contribution bounds and endpoint reconciliation. Incidental XP remains part of combat XP. Independent checks also cover **18,045 reached ordinary rewards / 602 quest identities**, **240 dungeon slots**, **24 saved handoffs / 120 player continuations**, **80 native role exports / 40 Lua syntax checks**, and eight static flow settings. Older hypothetical saved-model states are rejected.

The unchanged runtime's 4,352-test suite, strict typecheck, lint and six builds are reused from their successful recorded run, not rerun here.

## Remaining scope

This review resolves **25** more overlevel values. **104 quests / 2,579 cells** remain unsupported, including thirteen quests in the raw route. Unsupported values remain unknown; required work is not removed to make the forecast pass.

Every primary forecast still stops at `dungeon-maraudon-objectives-complete-7041`. The exact normal Scion payout remains unresolved; elite calibration is not substituted and zero XP is not assumed. Twisted Evils remains **25 carvings per player / 125 for the party** without qualified single-clear yield.

Full 1–60, actual server payouts, travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. Public V1394 and canonical indexes are unchanged. Nothing is committed, pushed or deployed.

Evidence under `.cache/leveling-no-grind-20261031/`: `fortitude-reference-v1627.json`, `orientation-reward-review-v1627.json`, `orientation-reward-route-construction-v1627.json`, `orientation-reward-route-validation-v1628.json`, `all-reward-levels-v1629.json`, `orientation-reward-conservation-v1630.json`, `orientation-reward-native-validation-v1631.json`, `later-quest-flow-v1632.json`, `orientation-reward-qualification-v1633.json` and `source-flow-progress-v1634.json`.
