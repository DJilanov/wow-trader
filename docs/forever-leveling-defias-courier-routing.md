# Defias courier during existing town visits

The selected Deadmines preparation includes the Defias chain 65 → 132 → 135 → 141 → 142 → 155. Its first courier previously repeated a Westfall → Lakeshire → Westfall journey after Ruins of Lordaeron, even where the group had already visited both towns during earlier preparation.

`campaign-chain-visits.ts` can accept quest 65 from Gryan Stoutmantle while handing in The People's Militia in Sentinel Hill. It completes the conversation with Wiley the Black during the existing required Lakeshire visit for The Lost Tools. The group accepts Wiley's Note (132) there and keeps it for the later return to Gryan. The reader and native export explicitly tell players to keep the note and continue the Lakeshire tasks.

Only three existing actions move. Their IDs, source references, waypoints, quest changes and reward evidence stay intact. The handoff gains one explanatory carry instruction. Every other action keeps its order and content, including class work, source utilities, the later note delivery, the messenger and the escort. The Deadmines entry requirement is unchanged. No new quest, reward or mob population is introduced.

## Eligibility and route checks

This is an authored pair of town visits, not a general assumption that every NPC in a zone is nearby. The catalog must identify the same friendly Gryan at the early hand-in and the courier pickup, Wiley at the courier hand-in and note pickup, and Foreman Oslow at the required Lakeshire visit. Their recorded positions must fit the declared town pairing. The ten-point map-coordinate bound is a relative locality check, not a world-distance conversion or a travel-time estimate. Walking between the inn and bridge is still real work.

Build, archive, provider and quest/NPC identities must agree. The courier must retain its complete talk-only objective and the return quest its exact pickup-provided parcel. Class/race restrictions, exclusivity, unrelated requirements, changed objectives and mixed utility/quest steps prevent the move.

The pickup must be available to all five modeled players in every supported configuration that reaches the early visit. Both catalog minimums are 14; stricter reward/eligibility claims remain enforced. The candidate must preserve each configuration's first reached requirement and cannot enlarge its deficit at that requirement. It must reduce complete planned regional transitions and satisfy every character's 40-quest bound. If these checks fail, the original itinerary remains in place.

## XP and carried quests

The existing reward resolver pays quest 65 once, when the group actually reaches Wiley. In the current Human reference examples, the level-15 hand-in supplies its historical 1,350-XP estimate earlier. No multiplier or compensating XP is added. Later level-dependent combat still uses the resulting player levels.

Quest 132 occupies a quest-log slot between Lakeshire and its later hand-in. Its acceptance contributes no XP. An already-rewarded quest 65 cannot pay again, and the note's later reward cannot be borrowed to qualify for Ruins of Lordaeron. Independent chapter checks preserve both the earlier paid quest and the carried note state.

## Verification and remaining work

Regression tests cover earlier one-time rewards, minimum levels, note retention, source identity, unsupported work, optional/missing/reversed anchors and preservation of unrelated actions. The full matrix, native checks, per-configuration comparisons and remaining XP gaps are recorded in the [current audit](forever-leveling-no-grind-audit-2026-10-31.md).

The Warrior and Paladin reference itineraries remove two planned regional transitions; this is not a measured travel-minute saving. The later Defias chain still needs its existing journey and combat. This correction does not establish a globally optimal route, a funded 1–60 journey or an under-48-hour run.
