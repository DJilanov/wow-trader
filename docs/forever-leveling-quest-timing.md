# Timed quests in the five-player guide

The V195 independent audit found client deadlines missing from the normalized quest/method contract. V196 implements the local timing and recovery contract; the independent numerical/native and timing-contract checks pass. The whole guide remains unfinished. [Current review and remaining work](forever-leveling-product-plan.md#current-local-review--group-program-boundaries-v200).

| Selected quest | Deadline in build 70205 | Deadline in build 70450 | Current status |
| --- | --- | --- | --- |
| 257 A Hunter's Boast | 900 seconds / 15 minutes | 900 seconds / 15 minutes | Normalized; warned before acceptance |
| 258 A Hunter's Challenge | 720 seconds / 12 minutes | 720 seconds / 12 minutes | Normalized; warned before acceptance |
| 647 MacKreel's Moonshine | 900 seconds / 15 minutes | 900 seconds / 15 minutes | Normalized; warned before acceptance |

These are ordinary quests available to the shared party; the two hunter titles do not make them class quests. Both captured query datasets explicitly contain `timeLimitSeconds`. Recognizing the correct NPC and supplied item is insufficient without the deadline and a complete timed attempt.

## Implemented locally

`reconcileClientQuestTiming` requires matching quest identity, level, minimum level and positive deadline in both pinned client snapshots. It preserves the original records in resolution provenance and stores `timeLimitSeconds` and structured `timeLimitSources` on the selected catalog entries. The full output is schema-validated. It preserves the authorization note, access masks, unsupported-method flags, rewards and combat quantities. It never treats an absent value in an unqueried quest as proof that the quest is untimed.

The candidate normalizes all ten timed records already present in the catalog: **29, 257, 258, 647, 938, 1719, 3364, 3522, 5321 and 97257**. This does not add class detours or qualify unresolved escorts and other methods. Original other-edition coverage remains pending.

The route carries deadlines on selected actions and personal starter entries. Before acceptance it tells everyone to get ready and states the actual time limit. The native output emits the same warning before `.accept`. A helper `.timer` is not synthesized: page navigation or activating an addon step can precede actual acceptance, so such a countdown would be misleading. Existing source-owned timers remain intact; the game's individual quest timer is authoritative.

The method guard requires exactly one pickup followed by one hand-in, with ordered objectives. Travel is permitted between them; unrelated work is rejected. The NPC visit reorderer refuses moves that introduce a new timing problem. This checks itinerary structure, not measured completion duration.

The browser exposes controls only for active timed quests in the actual route. A player can report a failed or expired attempt. The quest stays active in the saved journal, and the party cannot mark its hand-in or dependent work complete. The forecast pays no reward for the failed attempt. Recovery requires a fresh actual level/XP report and explicit confirmation that the player accepted a new attempt in game. It clears only that player's timed objective confirmations, retains unrelated progress and anchors future work to the exact reported bar; prior attempt combat XP is not invented or paid twice.

## Verification and remaining qualification

Forty-three focused logic tests cover corroboration/conflicts, exact source provenance, a full-length authorization note, starter propagation, invalid and interleaved methods, all five native class warnings, party-wide failure blocking and fresh-XP retry. Four web regressions cover active/hidden/completed states and disabled retry controls. The complete suite passes **2,704 leveling + 202 web + 47 script tests**, with types, lint and the package build passing.

The corrected full route replay and independent native audit are in `.cache/leveling-no-grind-20261031/primary-xp-v196-qualified-review/`. Eight settings, 24 workload + 24 legacy-save forecasts, twenty native class/save/Fury inventories and Lua syntax pass their numerical and timing checks. Both client deadlines match the normalized catalog/source hashes and action metadata. Each exported warning occurs once for its own quest, before its exact acceptance. All 468 source pins, 228 mapped contents and twenty runtime files match. Main exit two retains the route deficit; independent exit zero records the passed contract audit, not a ready 1–60 route.

The earlier failed V196 start is retained separately in `primary-xp-v196-review/`: the initial free-form note exceeded the authorization field's limit. Structured timing provenance fixes the cause while retaining the original authorization text and its bound. The first independent attempt had an ambiguous matcher for two different fifteen-minute quests; its failed log remains. The corrected checker uses complete quest-specific warnings with unchanged frozen runtime, plan and numerical inputs.

The original requirements remain:

1. Carry positive, source-qualified client deadlines through the quest schema and method data. Preserve build provenance and disagreement handling. Do not infer an absence of a deadline from missing metadata.
2. Explain the deadline before acceptance. All five players must be ready and accept together; one player's acceptance does not start everyone else's quest.
3. Preserve the real combat counters for the hunting tasks. The deadline does not add kills, rewards or a completion guarantee.
4. Keep a timed courier's pickup and return together, allowing the actual journey between them. Do not insert shopping, unrelated quest work, a dungeon or a rest stop after its timer starts. Qualify the physical route and any required exit rather than treating an NPC-to-NPC edge as free travel.
5. Include the deadline in browser instructions and native output. An RXP countdown may help the player, but the game's quest state remains authoritative; a timer alone cannot prove successful completion.
6. Handle an expired or failed task explicitly. Do not pay its XP or continue a dependent chain as though the hand-in succeeded. Do not automatically abandon an already-started quest when loading or rebuilding the route.
7. Test timer propagation, build conflicts, group acceptance, expiry/retry, interleaving, prerequisite order, once-only rewards and all affected native class exports. Re-run the complete primary workloads, then audit the original other-group scope for additional timed quests.

Actual physical travel, fight durations and current-server payouts remain unobserved. The timing implementation does not make the full route release-ready or close its XP gaps.

## Verification evidence

Source: matching 70205/70450 query records from [Efficient Games](https://github.com/JIVESCORP/eg-link-output-wowf/tree/9c3f82fc7c8ce60760e933db529fd629c2f682d7), CC BY 4.0, https://efficient.games. Both full dataset hashes are pinned in `.cache/leveling-no-grind-20261031/primary-xp-v195-review/secondary-scope.json`.

The V195 independent report records all three selected deadlines and fails method qualification. Its arithmetic, enemy-cap, twenty native inventory and Lua syntax checks pass. This distinction remains unchanged in `verification-primary-xp-v195-final-hold.json`. The corrected V196 contract results are separate in `verification-primary-xp-v196-final-hold.json`; neither receipt claims observed successful completion or full-route readiness.

The expected endpoint of level 28 + 19,896 XP and the remaining 21,504 XP to level 29 assume successful completion of the timed tasks. The fast case stops earlier at Down the Coast's level-28 enemy floor. Neither projection qualifies the whole route, and neither deficit is an instruction to grind.

No commit, push, deployment, installation or in-game execution occurred.
