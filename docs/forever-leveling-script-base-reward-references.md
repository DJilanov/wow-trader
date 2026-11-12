# Historical base rewards for scripted quests

> **Current blocker audit — V1651–V1652:** Full group XP validation cannot advance past the normal Maraudon Scion payout without current-server evidence. The three-turn blocked audit is satisfied. No numerical model or published guide changed. [Required sample and remaining scope](forever-leveling-validation-blockers.md). The successful numerical results below retain their limited scope.

The private **V1643 candidate** resolves twelve more historical base-reward curves using the unchanged **V1592 engine / XP revision 219**. It does **not** qualify their scripted encounters, additional script XP or current Forever payouts. Physical actions, combat, personal item quotas and drop evidence remain unchanged. Nothing is published.

| Quest | Historical base XP |
| --- | ---: |
| 336 · A Noble Brew | 2,450 |
| 651 · Stones of Binding | 2,850 |
| 652 · Breaking the Keystone | 3,450 |
| 723 · Prospect of Faith | 2,350 |
| 724 · Prospect of Faith | 3,150 |
| 1052 · Down the Scarlet Path | 1,550 |
| 1363 · Mazen's Behest | 330 |
| 1452 · Rhapsody's Kalimdor Kocktail | 3,600 |
| 3182 · Proof of Deed | 4,400 |
| 3566 · Rise, Obsidion! | 7,600 |
| 4129 · The Knife Revealed | **375 → 380** |
| 4265 · Freed from the Hive | 4,050 |

## What the source establishes

The pinned historical [Quest::XPValue function](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Quests/QuestDef.cpp) calculates the base component from quest money, quest level and player level. The [hand-in implementation](https://github.com/cmangos/mangos-classic/blob/5731249195520323cb5fb9aa29761d4f033272ce/src/game/Entities/Player.cpp) applies the configured quest rate and calls `GiveXP(xp, nullptr)` before end-script callbacks and reward spells. That historical `GiveXP` body adds no resting bonus for a call without a victim. The historical rate of one is a planning assumption, not a verified Forever setting.

Each admitted record matches the catalog's identity, objective text, quest level, minimum level and ordinary class access. Both documented Classic alternatives match the database-derived base. Exact start/end programs remain captured with their source identities. They are not executed or certified safe by this review. Movement, relays, spells, spawned creatures, required encounters and any extra XP still require separate lifecycle verification. The global script guard is unchanged; none of these quests receives a dungeon coefficient.

## Saved-state failure and representation correction

The first dense candidate, **V1635**, failed all six primary runs: its saved model grew from **9,855 to 10,785 characters**, exceeding the existing **10,000-character limit**. Those failed logs and the rejected candidate are preserved.

V1643 keeps all 59 reference values in the evidence but omits redundant full-band rows from each new planner record. Those rows equal the existing base-reward fallback. Records use the compact evidence identifier `server-database:V1643:base-only`; the construction proof and route hash retain the exact source binding. An exhaustive comparison verifies **98,460 identical resolved results**, excluding provenance text, between the dense and sparse representations.

The saved model is now **9,990 characters**. The limit is unchanged. Only ten characters of capacity remain, so further parcel/reward changes need an explicit capacity check. This does not establish headroom for the wider group matrix.

## Verification and current checkpoint

All **1,641 × 60 = 98,460 quest/level checks** pass, including explicit unknown, ineligible and cap results. **654 client facts** remain bound to both cached builds and the QuestXP table. The independent binary32 oracle checks **44 × 59 = 2,596** historical reference values. These are reference arithmetic checks, not observed payouts.

All six primary scenarios are replayed from five Humans at 1+0. Ten of the newly reviewed quests are reached before the Scion checkpoint. Knife Revealed adds five quest XP per player; combat contributions remain unchanged. Neither Rhapsody nor Rise, Obsidion! receives a future reward early.

| Optional mallet confirmed | Fast lower bar | Expected lower bar | Slow lower bar |
| --- | --- | --- | --- |
| No | 46 + 7,738 | **46 + 48,073** | 46 + 90,646 |
| Yes | 46 + 24,439 | 46 + 64,892 | 46 + 107,843 |

These are modeled workload bounds, not observed bars or guarantees for every loot outcome. Fresh accounting passes for **60 old/new player forecasts / 141,600 steps**. Checks also pass for **18,045 reached ordinary rewards / 602 quest identities**, **240 dungeon slots**, **24 saved handoffs / 120 player continuations**, **80 native role exports / 40 Lua syntax checks**, and eight static flow settings. Incompatible prior models remain rejected. Incidental XP stays within combat XP and is not added twice.

The unchanged runtime's recorded 4,352-test suite, strict typecheck, lint and six builds are reused; they were not rerun in this data-only revision.

## Remaining work

This resolves **144** missing overlevel values. **92 quests / 2,435 cells** remain unsupported across the full reward collection. Only **3181 · The Horn of the Beast** remains incomplete in the raw selected route; its conflicting base alternatives are not guessed. The twelve scripted lifecycles above remain independently unqualified despite their resolved base curves.

Every primary scenario still stops at `dungeon-maraudon-objectives-complete-7041`. Normal Noxxious Scion payout remains unresolved; the elite calibration is not substituted and zero XP is not assumed. Twisted Evils remains **25 carvings per player / 125 per party**, without verified single-clear yield. The existing optional Scion sample request remains pending.

Full 1–60, actual payouts, travel/gameplay and the original **528 edition/settings, 32 mixed settings and 784 native starter cases** remain unfinished. Public V1394 and canonical indexes are unchanged. Nothing is committed, pushed or deployed.

Evidence under `.cache/leveling-no-grind-20261031/`: `script-base-reward-review-v1643.json`, `script-base-representation-v1643.json`, `script-base-reward-route-construction-v1643.json`, `script-base-reward-route-validation-v1644.json`, `all-reward-levels-v1645.json`, `script-base-reward-conservation-v1646.json`, `script-base-reward-native-validation-v1647.json`, `later-quest-flow-v1648.json`, `script-base-reward-qualification-v1649.json` and `source-flow-progress-v1650.json`.
