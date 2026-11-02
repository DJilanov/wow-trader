# Dungeon finish: prepared quest tasks

Status: implemented locally; release held while the complete no-grind route remains unfunded.

## Execution scope

`campaign-finish-route.ts` describes the reviewed quest phases, and `campaign-finish.ts`
compiles them against the matching catalog. The default dungeon finish now has 76 actions
covering 21 quest lifecycles through the seven wings after BRD. BRD remains in its preceding
chapter and its rewards are not repeated. The old finish introduction and final checkpoint
IDs are preserved for saved bookmarks.

| Wing | Prepared tasks |
| --- | --- |
| Lower Blackrock Spire | Halycon, Kibler's cage, spider eggs, Bijou and Warosh |
| Dire Maul East | Reliquary preparation, the sealed Felvine Shard, Lethtendris, Elven Legends pickup and Pusillin |
| Dire Maul West | The Madness Within, after arranging actual wing access |
| Dire Maul North | Normal clear instructions and the remaining library/quest returns |
| Scholomance | Four Barov deeds, Plagued Hatchlings, Doctor Krastinov, Jandice's bag and Kirtonos |
| Stratholme Living | Egan's preparation, freed souls, tobacco and both Archivist objectives |
| Stratholme Undead | Remaining Holy Water collection and the final outside return |

These are prepared instructions and conditional reward calculations, not proof that one
clear supplies every player's items or that every encounter is practical at the starting level.
The mixed outdoor/dungeon strategy retains its existing late chapters and excludes these
new finish-only actions.

## Eligibility and accounting

- Build, archive and reviewed provider identities must match. Missing or restricted roots
  and their unprepared descendants are deferred explicitly.
- Pickup minima apply to each player's projected level at acceptance. Earlier incomplete
  stages cannot borrow rewards from later turn-ins.
- The route retains actual friendly NPC pickup/return locations and distinguishes inside
  objectives from outside visits. Scholomance's follow-ups require leaving and re-entering
  the same instance while preserving Jandice and Kirtonos; no reset is instructed.
- Native output emits each required numeric `.complete questId,objectiveIndex`. It does
  not emit an invalid objective zero or assume objective one covers a whole quest.
  The introductory Restless Souls conversation (5281) has a pickup and return without a
  fabricated combat objective.
- Quest rewards remain whole and one-time for each eligible player. Already-paid rewards
  are skipped. Unknown dungeon kill tuning, clear populations and acquisition counts add
  zero XP. Inside combat cannot fall back to outdoor payouts.
- Funding diagnostics are recalculated after compilation, so the replaced introductory
  checkpoint is not reported as an outstanding task.

The explicit deferred list contains 22 conditional, unprepared, repeatable or cap-only quests.
It includes Tribute-dependent work, personal key/quest-starting drops, crafting materials,
the Ras Frostwhisper chain, and cap-only class quests. Their rewards do not silently enter
the first-clear budget.

## Current reference probes

These probes start **after BRD**, with five equal-level players and empty XP bars. Earlier
route completion is assumed only for this isolated diagnostic; it does not fund a continuous
level-1 journey. The rewards use the existing labeled historical/planning facts.

| Entry after BRD | Counted quest XP per player | Last calculated bar | Result |
| --- | ---: | --- | --- |
| 55 + 0 | 84,450 from five hand-ins | 55 + 84,450 | Reliquary pickup requires 56 |
| 56 + 0 | 328,300 from 21 hand-ins | 57 + 140,400 | Final level-60 checkpoint remains unfunded |
| 57 + 0 | 328,300 from 21 hand-ins | 58 + 133,300 | Final level-60 checkpoint remains unfunded |
| 58 + 0 | 328,300 from 21 hand-ins | 59 + 126,000 | Final level-60 checkpoint remains unfunded |

Unknown combat contributes zero in every row. No additional farming, repeated clear,
flat level bonus, loot availability or dungeon payout has been invented to close the gaps.

The owner's separate level-20 reference is **24–30 XP to each player per elite kill**, with
five level-20 players inside a dungeon. It is already shared. There is no further division
or group bonus, and it does not establish the payout of higher-level creatures in this finish.
The exact source conditions are retained in the private audit reference, without promoting
it to a verified observation.

## Verification and outstanding work

`campaign-finish.test.ts` covers lifecycle order, all objective slots, identity mismatches,
restriction/parent deferrals, unchanged bookmarks, one-time per-player rewards, mixed-mode
exclusion, refreshed funding diagnostics and inside-combat classification. The party-XP
regression covers already-shared ranges for all five players across single and batched kills.

The pinned-input conservation report is
`.cache/leveling-no-grind-20261031/finish-tasks-conservation-review.json`. It verifies the
real Human Warrior and Paladin tasks, native directives, all unrelated action identities,
38/37 source utility actions and the independent bars above. Full-matrix and native-check
receipts are maintained in the [no-grind audit](forever-leveling-no-grind-audit-2026-10-31.md).

Remaining work includes the early route's unfunded gates, optional preparation branches,
five-player item acquisition, actual keys and encounter feasibility, and contextual dungeon
combat/clear evidence. Passing compilation and arithmetic checks does not establish those
gameplay facts. No addon ZIP, installation, crawl or deployment is part of this change.
