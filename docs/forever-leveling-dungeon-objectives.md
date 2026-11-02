# Complete generated dungeon objectives

Generated dungeon tasks must represent every supported objective before the planner can count a hand-in. A generic “Complete The Restless Dead” task previously contained only objective 1 even though the matched records contain two kill counters. The same omission affected Starving Arcane, A Host of Evil, The Prophecy of Mosh'aru and Seal of Ascension.

## Full tasks and partial steps

`CampaignAction.wholeQuestObjectives: true` marks a generated task intended to finish one quest's objectives. The ordinary dungeon constructor and the first-clear finish compiler set it only on objective-completion actions. Pickups, hand-ins and partial imported source steps remain unmarked.

`campaign-dungeon-objectives.ts` expands marked tasks from the matched combat reference. It runs before the first combat/funding calculation and again after generating the first-clear finish. The second invocation is idempotent for tasks already expanded.

The helper rejects a marked task with source-owned commands, mixed quest IDs, a pickup/hand-in phase, no quest changes or an incompatible action kind. It also rejects a different source build. This catches an invalid producer contract instead of silently changing a partial step.

## Evidence boundaries

New slots require either:

- A recorded kill quota for a pure-creature quest, with the creature ID matching that provider objective position.
- An explicitly mapped item-objective index.

The helper preserves existing slots and their order, appends each supported missing index once, and retains the original action ID, instructions, locations and reward facts. Unmapped items, mixed creature indexing and unmatched creature references do not produce guessed slots. Prose is not used to invent another objective; The Restless Dead's Anvilmar wording does not create a third counter.

A held index without a mapped objective remains a requirement to review. Existing conflict flags, unknown item quantities, loot-sharing uncertainty and combat/payout qualifications are retained. A known slot is not proof of its current required quantity, acquisition cost or server payout. Adding a mapped counter cannot clear those separate holds.

A Host of Evil still has an unverified pickup/chain lifecycle. An isolated bookkeeping test can declare that review confirmed to exercise its counters; that declaration does not qualify the actual route or remove its normal hold.

## XP, progress and exports

The existing per-objective combat ledger prevents a full task with multiple indices from earning its physical kill quota repeatedly. The quest-state ledger requires the known objective set before hand-in and pays the quest reward once per player. Checkpoints still award zero XP.

Completing objectives continues to occupy one quest-log slot until hand-in. Additional counters do not create another quest acceptance or waive the [40-active-quest limit](forever-leveling-quest-log.md).

The native compiler emits the corresponding `.complete QUEST,INDEX` commands. Existing action IDs and saved bookmarks remain valid. Native compilation and Lua checks validate generated output, not in-game counter behavior or actual payouts. A separate final review reproduces an export hold: static duplicate-lifecycle normalization drops the later optional quest-12 opportunity when an earlier one exists. This objective expansion does not correct that compiler behavior; the current audit records the reproduction and required follow-up.

The subsequent compiler v30 correction preserves those entirely generated optional opportunities, with per-character quest-status guards and separate lifecycle validation. All 784 default-selection leader/member export checks pass; the numerical v69 objective and XP inputs are unchanged. This resolves the identified generated-opportunity omission locally. Source-controlled mixed lifecycles, actual payouts and in-game behavior remain outside that result.

## Validation

Regression coverage includes the missing second Thanes objective, the normal and post-finish integration paths, native command output, idempotence, input preservation, partial/source-owned steps, mapped and unmapped items, mixed/incorrect creature mapping, retained conflicts, incompatible builds and invalid producer contracts.

The [current no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md) records the full edition matrix, source-slot inventory, combat/payment checks and remaining funding gaps. The complete route must pass those broader checks; correcting an objective omission does not supply missing XP or qualify a live run.

The completed local v69 review covers 33 editions / 528 default settings, all 3,069 marked tasks and 213 newly added indices, plus 32 explicit mixed settings. The existing action IDs remain stable for the five diagnosed quests. All 1,485 relevant tests, capacity bounds, 28 native checks and independent payment/quota controls pass. Complete route funding is still unresolved.
