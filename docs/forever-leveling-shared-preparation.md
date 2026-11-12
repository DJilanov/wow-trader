# Shared party preparation and non-kill objectives

**Current local component (V207):** Baron level 17 is owner-confirmed; Data Rescue uses its captured punch-card puzzle. All 3,078 relevant tests, 48 workload forecasts and 20 native/Lua exports pass. The expected minimum still needs **2,821 XP/player for level 29**. Fresh production preparation, full 1–60 and every original other-group edition remain unfinished and undeployed. [Current results and remaining work](forever-leveling-product-plan.md#current-local-component--punch-card-and-baron-v207).

This contract applies to the five-Human route: Warrior tank, Priest healer and Mage/Rogue/Warlock DPS. It preserves the separate legacy starter behavior. The [current audit](forever-leveling-no-grind-audit-2026-10-31.md#current-status) records the latest completed review and remaining progression requirements.

## First Dun Morogh visit

Farsen's Watch (96392), Nip 'Em in the Bud (96390) and Underground Map (96391) have minimum level nine in the pinned catalog. The shared route completes them after the eastern trogg hand-ins, before Loch Modan, rather than saving them for a return from Darkshore. Returning to Earthseer Farsen is real travel; the instructions retain that return and the spy-camp coordinates.

The three quests are extracted together in source order. At the spy camp, complete the ten-kill objective, obtain a Dark Iron Map for every player and use it to start Underground Map before returning to Farsen. The captured `.collect 274268,1,96391,1` and `.use 274268` program remains in each native export. The old split extraction returned the kill quest before starting the map at the same camp, creating an avoidable additional trip.

The existing rewards are **680 + 910 + 1,050 = 2,640 XP per player**, paid once. Ten required Dark Iron Spy kills remain separate from the map requirement. No extra map-farming kills or XP are invented. The move requires matching catalog/build/archive, complete source phases, no foreign prerequisite and the actual Earthseer endpoint. Missing or incompatible evidence retains the original route.

## Pickup eligibility and source-order heuristics

Filthy Paws (307) requires **four Miners' Gear per character / twenty for five players**. Its reward quest level is fifteen; its actual minimum is nine. A source-proven object task is not rejected solely because its reward level exceeds an enemy-level budget. Actual minimum level, access, prerequisites and physical quantities still apply.

The item export binds Miners' Gear (2640) to Miners' League Crates (271). The archived source binds the same four-item counter to opening those crates. A quest objective may name its required item while the source separately names the object; both names and their provider relationship must agree. The normalizer also supports the compound instruction “Open … . Loot … for …”. Wrong objects, wrong item/count, creature drops and triggered combat remain rejected.

The catalog's old `unresolved-source-prerequisite` flag came from neighboring courier hand-ins in the guide. The current pinned provider has no prerequisite for 307. A separately hashed historical quest record corroborates minimum nine, no prior quest, no class/skill restriction and no required condition. Only that reviewed source-order heuristic is cleared; no actual prerequisite is removed or inferred from a neighboring hand-in.

The private v116 candidate adds two ground proofs: Filthy Paws and Bottles and Baubles (99143), the latter requiring **six Shiny Junk each / thirty for five**. The previous eight proofs and every captured drop rate, NPC, quota, sharing fact and item-to-object relationship remain unchanged. Historical object positions establish neither simultaneous availability nor respawn speed. See the [default pickup policy](forever-leveling-ground-pickup-references.md#default-pickup-policy--november-2-2026).

## One selected task list

In the shared route, explicitly selected XP-preparation batches are fixed work. They retain full quest lifecycles and are included in both prototype simulation and the final itinerary. An optimistic XP outcome crossing the target does not silently remove a courier or stop the forecast to ask whether it is still needed. The XP interval remains intact; its lower endpoint is not written as observed player progress.

Actual level, prerequisite, class/race, item and forty-slot checks remain in force. This does not award grinding XP, accept a quest early or duplicate a hand-in. Legacy optional preparation keeps its existing behavior.

## Creature credit is not always a death

Farsen's Watch grants NPC credit for borrowed farsight. Classification requires the same named speaker in the objective, source conversation and target; a matching farsight label, gossip instruction and cancellation note; and no death quota, conflict, hostile instruction or class-spell method. It earns no kill XP.

Plagued Lands (2118) requires capturing a living Rabid Thistle Bear with the quest item. Classification requires the same single creature in the capture objective, `Captured (1)` counter, target and source item-use instruction. Missing use, another target, a death counter, spell use or hostile instructions do not qualify. Each player's real capture objective remains required. Its existing **980-XP hand-in** is separate from acquisition, which earns no invented kill XP.

The classifiers change the interpretation of positively supported interaction credit. They do not invent a creature kill, trap duration, group-credit rule, object yield, current-server tuning or observed payout.

## Shared interaction methods and advice

Sharing an ordinary quest does not make a solo class strategy usable by everyone. When selecting a captured class-conditioned source path, the projection omits class-specific combat advice while retaining simple object/NPC pickup directions. An imperative spell method is not silently made mandatory for the whole party. Ordinary enemy spell warnings remain. A complete captured common interaction path must still exist; no replacement quest program is invented. In the Rolf visit, this selects source step 0154's corpse interaction instead of 0152's Paladin Divine Protection strategy. Every native class export must preserve the common click instruction and omit the incompatible method.

A separate explicit kill/loot method remains usable without its solo spell advice only when the source has one ordinary completion, one exact named target, and an independent unconditional kill instruction naming that same target. Hogger retains the actual kill, Claw objective and Wanted Poster pickup; the Warlock Fear advice is supplementary. No kill credit or loot quota is removed or added.

The first broad spell-prose rejection in v120 incorrectly removed Hogger and regressed the prefix to level 9 + 6,352. That candidate is rejected and its failed receipt remains `.cache/leveling-no-grind-20261031/verification-shared-pickup-flow-v120-failed.json`. The narrowed correction adds the explicit-method regression, checks both actual native programs and rejects a replay that falls behind the verified v119 prefix. No failed candidate is published.

## XP interval accounting

The forecast tracks two different bounds: earned XP from a task and the resulting total XP bar. The smallest task reward can come from a higher starting level, while the smallest ending bar can come from a lower starting level. Therefore summing marginal minimum rewards need not reproduce the tighter minimum ending bar. They must not be presented as an exact additive ledger.

The v118 prefix has four such transitions, differing by **15 + 7 + 4 + 12 = 38 XP**. A separate integer-state diagnostic enumerates every starting bar in each published range and every shared mob-level sequence for the synchronized five-person subdomain: **115,750 transitions**. All four conservative ending ranges contain every enumerated result. It does not call the campaign enclosure/frontier solver. The diagnostic supports the bound interpretation, not measured server payouts or arbitrary unequal-party correctness. The synthetic level-crossing regression separately protects this distinction. The player-facing range/minimum labels still require review before release.

Diagnostic: `.cache/leveling-no-grind-20261031/accounting-independent-v118.json`. Its input and SHA are retained in the v119 receipt. No 38-XP reward was added or removed to force the arithmetic to match.
