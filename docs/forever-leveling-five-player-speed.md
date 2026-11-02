# Five-player leveling objective and travel policy

The target is the shortest practical route from level 1 with an empty XP bar until **all five players reach level 60**. The owner's comparison is a solo run taking roughly two days `/played`; the group target is below **48 hours per player**. That is a benchmark to validate, not a measured result or a release claim.

## What the route must optimize

- Count quest rewards separately for each player and shared kills once. Use each member's current modeled level when distributing kill XP. A large group kill rate does not justify awarding solo XP to every member.
- Favor overlapping kill objectives, useful elite quests and efficient dungeon quest packages. Plan around a coordinated tank, healer and three damage dealers; actual class, gear and party readiness still matter.
- Include required training, supplies, flight paths, transport waits, dungeon access and hand-ins. Compare complete journeys, including the return to the route. A newly learned flight path can benefit a later dungeon trip.
- Prefer shared objectives and quick personal acquisitions. Rare personal drops multiplied across five inventories need a strong downstream payoff. Moving between zones for tiny rewards can cost more time than the reward saves.
- Use real pickup levels, prerequisites and access requirements. Target levels and chapter ranges supply planning context; checkpoints award zero XP. Add no assumed grinding, invented dungeon populations, flat level bonuses or unsupported payout multipliers.
- Keep each character at or below **40 active quests**, including completed quests awaiting hand-in, class work and dungeon lead-ins. Reserve space for selected unidentified dungeon quests. Schedule hand-ins before further pickups; never assume automatic abandonment. The [quest-log contract](forever-leveling-quest-log.md) defines the checks.
- Keep the first-clear dungeon finish from roughly 55–56 as the intended route. Its selected quests, access conditions and clear combat must fund the remaining XP before the route can promise 60.

The comparison should measure the slowest player's completion, not just the leader's bar. Combat time, loot time, travel, recovery, regrouping and administrative stops all contribute. The route should use the group's ability to handle elites and dungeons efficiently, while keeping genuine readiness gates.

## Group combat selection

Quest reward level is not a sufficient measure of combat difficulty. The final `party-combat` funding pass considers normal enemies and ordinary elites by their recorded maximum levels, within the existing three-level preparation band above the lowest participating player. It requires all five players; it does not extend personal starter work, admit bosses or rares, or infer an unknown enemy level. Every newly proposed combat action is checked against all five projected bars in each supported configuration that reaches it. Earlier quest-funding passes keep their established allocation, and the final proposal is rejected if it makes any configuration reach an earlier unsupported task or a larger deficit at the same task.

This is a conservative candidate-selection rule, not a measurement of kill speed, pull safety, class readiness or downtime. It does not award more kill XP merely because five players can kill an elite quickly. Broader enemy-level bands need a justified group-performance model; increasing them just to close an XP gap would not establish a faster route.

Pickup-provided return parcels now recognize the complete objective “Return to [actual recipient]. Give him/her/them [exact provided item].” The matching recipient, item-export provenance, prerequisites and absence of extra work are still required. This qualifies Return to Verner (119), which can unlock A Baying of Gnolls (124); it does not make that follow-up eligible before its own pickup and combat conditions are met. The corrected parcel reward is 680 XP per player in the pinned reference. It is not a new collection quota or a combat reward.

## Bounded source collections

The final source-collection pass can consider efficient single-target trophies and item tasks from the source archive. It prices all five inventories and the complete prerequisite closure, preserves exact world waypoints and keeps unsupported prior inventory explicit. The [collection contract](forever-leveling-source-collections.md) gives its evidence requirements, 20/40 reference budgets, conservative travel penalty and limitations.

The v55 matrix remains numerically identical to v54. Qualified individual trophies do not close the first route gaps when they require higher-level targets or an unqualified collection parent. The next route review considers the already-selected level-14 Defias preparation and regional scheduling. No early reward, grinding XP or measured speed gain has been added.

## Scouting belongs on an existing pass

Scouting is valid route work. Accept before passing its location, complete the objective during that pass, and use an already-planned NPC return for the hand-in. Carry a follow-up until the next useful pass when its prerequisite forces a second visit. Do not add a separate outbound-and-return journey merely to collect scouting XP.

The current route already includes The Fargodeep Mine (62), The Jasperlode Mine (76), How Big a Threat? (984) and The Red Crystal (4811). Their rewards are counted. A missing generic scouting-candidate model does not mean these selected source quests were excluded.

The provider's `exploration-trigger` flag also occurs on escorts, scripted fights and tool-use objectives. It is not enough to classify an entire quest as walking. Keep the actual source objective, event, item and completion instructions. Bashal'Aran (954) is a separate candidate; adding its reward requires a suitable pass through its destination, rather than a standalone round trip.

## Local delivery correction

Thundris Windweaver (4761) is already selected for some funding gaps. Its pickup follows the completed furbolg chain at Terenthis. The earlier Darkshore route already returns to Terenthis in Auberdine, so its short town hand-in can sometimes be completed before leaving, instead of making a later return from the Eastern Kingdoms.

`campaign-local-deliveries.ts` moves only an existing, fully qualified two-phase NPC delivery. It preserves action IDs, reward evidence, one-time hand-ins, class work and other quest actions. The authored placement identifies the settlement visit; being in the same zone alone is not evidence that two NPCs are nearby. The reader checks matching build/provider references, actual recipients, prerequisites, pickup minimums and the participating players' known bars.

The candidate must reduce known-prefix regional visits for at least one supported configuration, increase none, add no previously skipped optional work, and preserve every configuration's first reached requirement. Unknown work after an XP blocker is excluded from the travel comparison. Source flight/hearth instructions and copied XP-check coordinates are not counted as proof of an NPC visit.

Earlier quest XP can change later level-dependent kill XP. For this travel correction, a smaller bar at the same existing blocker is allowed when the route saves visits and preserves the conditions above. For example, the Paladin can skip a 700-XP Teldrassil detour after reaching its earlier target; that reward is removed from the forecast and its later XP gap stays explicit. Original quest-funding proposals retain their stricter XP-deficit comparison. All resulting XP bars remain the calculated values; no compensation XP is added.

This correction is one travel improvement, not a proof of a globally optimal itinerary. Regional visit counts are a conservative comparison, not measured travel minutes. The [current audit](forever-leveling-no-grind-audit-2026-10-31.md) records the accepted revision and verification results.

## Evidence needed for the final time claim

The first selected Defias courier can also use the existing Sentinel Hill and required Lakeshire visits. The group carries Wiley's Note to the later Westfall hand-in instead of repeating that outbound courier trip. Only the existing actions move; actual minimums, later rewards and the 40-quest limit still apply. The [courier contract](forever-leveling-defias-courier-routing.md) explains the qualification and complete-journey comparison. It does not move the messenger or escort early or claim a measured travel-time saving.

Finish funding every supported route before estimating a complete run. Then use measured party combat, collection and travel pace, including normal and slower drop outcomes. Keep unmeasured quantities explicit instead of assigning zero time. Verify the connected browser and addon route, followed by a coordinated five-player run with per-player XP and segment timing.

The reported 24–30 XP per level-20 dungeon elite already belongs to each level-20 player in a five-player group. It is not divided by five again. It does not establish other levels' payouts or the number of creatures on a full clear. The published solo calculator, historical reward estimates and current-server observations retain their separate evidence labels.

Current blockers include incomplete route funding, repeated zone visits in other preparation batches, limited efficient-quest selection, uncertain loot/inventory cases and unverified dungeon clear combat. The current code does not establish a sub-48-hour run, zero real-world downtime, or completion for every mixed class/race party.
