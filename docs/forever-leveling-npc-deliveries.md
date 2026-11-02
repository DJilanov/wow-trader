# Conversation-only quest preparation

The guide can use a proven NPC conversation to fund a later pickup or departure without requiring extra combat. This is a code-only extension of the existing authorized catalog/combat pair; it does not change the captured records or publish player data.

## Evidence requirements

The complete objective must be a single `Speak with`, `Speak to`, `Talk to`, `Return to` or `Report to` instruction naming an actual friendly quest recipient. A trailing `in` or `at` location is allowed. The recipient must have provider coordinates. NPC names are matched literally, including punctuation.

The quest must have no provided item, item requirement, creature objective, death quota, conflicting counter or second objective. Text involving another task, collection, item use, escort or combat remains held. Only `unresolved-objective-text` and `non-outdoor-zone` can be resolved by this proof; reputation, profession, class, race, repeatability, exploration and other requirements retain their existing restrictions.

The selection view requires matching client build, provider revision and quest/NPC/item export hashes. It is ephemeral: the original catalog, held flags and combat dataset remain unchanged. Already-selected source quests are excluded from generic insertion so their source lifecycle is preserved.

## Scheduling and XP

The new pass runs after the accepted plain, dialogue-timer, provided-parcel and ground-pickup passes. It preserves their selected allocation. A proposal is rejected if any supported configuration reaches an earlier unsupported source task or has a larger known deficit at the same task.

A newly selected conversation produces an ordinary pickup and return at the actual NPCs. It produces no item-completion task and no combat XP. Its reward is paid at most once per player from the existing reward evidence. Actual pickup minimums, prerequisites, exclusivity and party audience still apply. An unusually high reward-reference level does not by itself imply combat difficulty for this proven zero-combat objective. Combat prerequisites retain their difficulty checks.

An already-accepted conversation can move earlier only as part of its whole verified source NPC visit. All bundled hand-ins and follow-ups must be ready for every reachable supported configuration. Source IDs, bookmarks, class training and native commands are retained. A raw quest endpoint list is insufficient: a proven parcel or conversation must return to the NPC named in its objective. The relative travel score includes the return to the original route; it is not a measured travel-time or safety guarantee.

## Verification

Focused regressions cover literal recipient matching, incomplete and mixed objectives, export mismatches, pickup levels, prerequisites, exclusive quests, class/race restrictions, combat-parent difficulty, one reward per player, zero combat credit, and native pickup/return output. Source-visit tests cover explicit enablement, the actual recipient, preserved source/training and reward conservation.

Full-route arithmetic and funding remain separate release checks. See [the current no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md) for the accepted numerical revision, scenario results and remaining gaps. Passing a parser or compiler test does not establish runtime quest availability, current-server payouts, measured journey cost or a fully funded route.
