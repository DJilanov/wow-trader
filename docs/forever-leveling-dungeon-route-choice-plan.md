# Dungeon alternatives as real leveling plans

Analysis and implementation plan, 2026-10-05. No application, dungeon data, saved schema or production
change has been made for this follow-up. This supersedes the recent discovery-card presentation as
the primary leveling UX, not the existing correctness rules or previous verification receipts.

## Product decision

Offer a different way to complete an XP segment, not a dungeon catalog attached to a chapter.
Use the successful Hall of Thanes pattern: **what outdoor work this replaces, preparation, expected
progress, remaining work and where to continue**. The main route should offer the best-fitting
reviewed alternative; other trips belong under a collapsed **Other dungeon plans** section.

An alternative can be valuable for playing with friends, gear or experiencing new content without
being faster. Explain that tradeoff instead of giving every dungeon equal prominence or labeling
the largest raw quest-XP total the best route.

## What the current code actually does

- `LevelingDungeonAlternative` / `THANES_REPLACEMENT` have a target checkpoint, retained Darkshore
  preparations and an authored continuation. The replacement reader can leave XP-only work behind.
- `LevelingDungeonOptions` discovers candidates by their scheduled level overlapping a chapter.
  `createDungeonTrip` creates a six-stage detour that retains **all** outdoor work and returns to the
  same saved source step. That is intentionally safe, but it is not the alternative the user wants.
- Generic trip checkpoints default to one level beyond the start, capped at the reviewed playable
  limit. They do not identify which outdoor instructions become unnecessary after a successful run.
- The imported source already includes Deadmines and Wailing Caverns routes. Reuse and review their
  actual pickups, prerequisites, travel, clear and hand-in instructions; do not replace them with a
  new six-line generic checklist.

For an Alliance human warrior at known outdoor rate 1x, enabling the imported Deadmines branch in
`chapter-128-19-20-redridge` exposes 54 additional applicable rows and hides seven existing rows.
Those differences are an audit starting point, **not** an approved skip list. The continuation is
`chapter-130-20-21-darkshore-ashenvale`; Hunter and other conditional paths need separate adapters.
The Alliance Wailing Caverns branch is authored later in `chapter-8-21-23-stonetalon-ashenvale`,
with 24 additional applicable rows for this profile. Do not force that trip into level 19 just
because the dungeon's At-level floor is 19.

## XP audit: do not hardcode “1.5 levels”

Read-only calculations use the existing exported catalog, empty quest state, a warrior profile,
level 19 with zero current XP and the existing Crest-based estimate. They exclude kills, exploration,
outdoor prerequisites and later follow-up rewards. All listed quest rewards must actually be
obtainable and handed in. This is an estimate audit, not a runtime-confirmed run forecast.

| Bundle                                             | Quests | Estimated quest XP | Quest-only endpoint from fresh level 19 |
| -------------------------------------------------- | -----: | -----------------: | --------------------------------------- |
| Deadmines, Alliance core                           |      6 |             21,867 | Level 20 + about 2%                     |
| Deadmines, Alliance with prepared explosives chain |      7 |             25,086 | Level 20 + about 16%                    |
| Ruins of Lordaeron, Alliance                       |      4 |             22,535 | Level 20 + about 5%                     |
| Ruins of Lordaeron, Horde                          |      6 |             26,827 | Level 20 + about 24%                    |
| Wailing Caverns, Alliance catalog bundle           |      5 |             21,460 | Level 20 + about 1%                     |
| Wailing Caverns, Horde catalog bundle              |      7 |             30,760 | Level 20 + about 41%                    |

The pinned client curve requires 21,300 XP for 19→20 and 23,200 for 20→21. Reaching level 20 + 50%
from fresh 19 therefore requires 32,900 XP. A Deadmines run can plausibly approach that with additional
XP, but its present seven-quest estimate alone does not establish it. Show the forecast **level and
XP-bar position**, calculated across successive level requirements, rather than dividing XP by one
level's requirement or assuming a fixed gain for every character.

The core Deadmines IDs are 214, 168, 167, 2040, 166 and 373. Quest 92753 is an additional prepared-chain
option, not a mandatory nine-stage detour for every player. Excluding unavailable quests must reduce
the forecast rather than leave the advertised seven-quest total unchanged. Already completed
prerequisites may unlock a quest, but do not pay XP again. Unfinished outdoor prerequisites add their
remaining rewards and effort once, without the dungeon calibration multiplier.

The current ratio comes from one report of 6,200 XP at level 20 for
[Crest of Lordaeron](https://www.wowhead.com/forever/quest=95189/crest-of-lordaeron). Keep its build,
level and estimated status visible in secondary details. Prefer context-pinned actual rewards when
available; conflicting reference/comment values are not a reason to silently replace the multiplier.
Compute rewards at planned hand-in levels; unsupported overlevel reductions remain unknown.

The source's At-level floor is 19 for DM, Ruins and WC. Preparation can happen earlier; a five-player
party or an access shortcut cannot lower that floor.
[Source quest and level guide](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).

## First plans to author

### 1. Deadmines: the first Alliance replacement candidate

- Offer **Deadmines instead?** for the reviewed 19→20 segment, not a promise to skip all Redridge.
- Use the source's Stormwind pickups, Defias progression, Sentinel Hill preparations, clear and
  ordered hand-ins. Collect necessary quests while the outdoor route is already passing their hubs.
- Split the core bundle from the explosives chain. Add the latter by default only when already
  prepared or when its remaining work is explicitly included and shown as worthwhile.
- Keep objectives in the outer mine distinct from the instanced clear. Hand-in routing, not the
  final boss kill, determines when the quest XP becomes available.
- Audit the source's alternative quest placements, future chains, training, flight paths, travel,
  Hearthstone setup and required item pickups. Retain those obligations even if the character is
  already level 20. The source's existing dungeon toggle is not a blanket permission to skip rows.
- At the end, ask for actual level/XP. If below 20, use a short reviewed outdoor top-up; otherwise
  complete the retained bridge and continue to the reviewed 20–21 route anchor.

Specific location correction needed before authoring the new plan: the local supplemental record
for 92753 names Alba at Sentinel Hill, while the current quest instructions require meeting her at
the dungeon exit after placing the explosives. Quest 92819 is a separate follow-up, not another
reward for the same stage. Review both stages and keep the correct exit before offering Hearthstone.
[Current quest instructions](https://www.wowhead.com/forever/quest=92753/destruction-in-deadmines).

### 2. Ruins: separate Alliance and Horde plans

- Horde: evaluate a 19→20 replacement while the character is on a reviewed northern route. Being
  Undead alone is not proof of being nearby; the imported Undead path can already be in the Barrens.
- Alliance: retain the option, but present **new-content / group adventure** unless measured whole-trip
  cost supports a speed recommendation. Four inside-start quests reduce preparation, not the journey.
- Stage the Alliance return hand-ins in Stormwind and count those rewards only after they are actually
  handed in. Horde pickups/hand-ins use a different itinerary, including The Sepulcher.
- Show a single clear route through required objectives and quest-start objects, with optional boss
  detours separate. A missed object or unavailable drop reduces the forecast and can require top-up.
- Do not treat six Horde quests as six XP-paying quests: the catalog's Rath'mael quest has a zero-XP
  reference. Its gear/reputation purpose is separate from XP efficiency.

[Method's firsthand guide](https://www.method.gg/wow-forever/dungeons/ruins-of-lordaeron) confirms the
four-versus-six quest split and distinguishes Alliance's longer northern journey from local Horde
access. It also describes a race-specific Alliance Skyborne shortcut. Only use such a transport
edge after checking the character's actual race, access and current build; never apply it to everyone.

### 3. Wailing Caverns: location-aware, not a default Alliance detour

- Do not promote a Stormwind→WC trip in the Alliance level-19 replacement lane by default.
- Evaluate the authored Alliance 21–23 Ashenvale branch when already nearby, and show it under other
  plans unless total time supports promoting it. Recompute reward/progress at that later start level.
- The authored human warrior branch turns in four quests, not the catalog default five. Smart Drinks
  needs additional Raptor Horns preparation; it is not free XP merely because it is in the catalog.
- For Horde already following the Barrens route, WC can be a prominent candidate, with Thunder Bluff
  and Ratchet work included. Do not charge an already finished oasis chain twice.
- Keep optional content/gear use available even when it loses the speed comparison.

## Main-screen experience

Keep one coherent Thanes-style plan visible under the relevant XP segment. Do not spread the
decision across an equal-weight card grid and a separate generic review page.

```text
19 → 20 · Choose your path
  Outdoor route: Redridge · retain the required chains
  OR
  Deadmines instead?
    Core quests ≈21,867 XP · prepared full bundle ≈25,086 XP
    Quests-only forecast: 19 → 20 + 16% with the prepared bundle
    Travel + clear + hand-ins: [show only after timing is supplied]
    Replace: reviewed XP work · Keep: required route preparations
    Continue: reviewed 20–21 route after actual level/chain check
    [View plan] [Use this alternative]
  Other dungeon plans ▸ Ruins adventure · WC when nearer Ashenvale
```

The timing line above describes a data-dependent field, not placeholder UI to ship. When its inputs
are missing, use **Trip time not estimated yet**, with an optional timing editor in View plan.

**View plan** expands the ordered itinerary in place: preparation → travel → dungeon objectives →
hand-ins → retained bridge → actual XP check → continuation. Quest counts are separate for before
entry, inside starts and later extras. Show what is already ready and what still needs doing.

**Use this alternative** swaps that segment in the full chapter tree and opens the same fixed-map
reader as Thanes. Keep the original chapter and exact bookmark recoverable. Source instructions are
superseded by a route choice, not falsely marked completed. Next, Done, Undo and actual quest states
retain their existing separate meanings. A shortfall exposes the reviewed top-up instead of sending
the player to the start of the old chapter.

For solo speed, leave outdoor questing selected until a viable group/trip is chosen. For a ready
premade, make nearby reviewed plans prominent, but still include travel. For chill, show content and
gear benefits without pretending they are time savings. Defaults are suggestions, never silent
activation. Future/unknown/unreviewed dungeons stay in the separate reference library.

## Comparison and recommendation logic

1. Match actual route location, race/faction/class, known level/XP, party readiness, quest state,
   access and transport availability. Race is not a substitute for current location.
2. Assemble a feasible core bundle, then evaluate optional chains by their **remaining marginal**
   rewards and time. Show omissions; do not require every available quest to enter the dungeon.
3. Use a reviewed outdoor start segment and exact continuation. Separate XP-only work from required
   future quest/item/flight/training dependencies, including later chapters beyond the immediate next.
4. Forecast preparation, kills and individual hand-ins in order against the pinned curve. Deduplicate
   rewards by ID, exclude rewarded/retained rewards and keep unknown values unknown. Display quests-only
   progress separately from the scenario with explicit per-player kill estimates.
5. Compare the same start state and return checkpoint for outdoor and dungeon paths. Include required
   bridge work in both paths; shared travel/preparation is charged once, not once per quest.

```text
wholeTrip = remainingPreparation + groupWait + outboundTravel + scopedClear
            + objectiveDetours + handIns + returnToContinuation + retainedBridge + topUp
topUp = remainingCheckpointXP / attainableOutdoorXPPerMinute
timeSaved = outdoorTimeToSameCheckpoint - wholeTrip
```

Travel-to-continuation can differ from travel back to the original departure point. A user-supplied
round-trip estimate already including the hand-in journey must not acquire that journey again.
Split travel from quest work and clear times; never compare a 40-minute clear with a complete outdoor
segment or assume a ready party eliminates walking. Full clears and quest-only runs need distinct scopes.

Use timing intervals. Label **Faster with these estimates** only if the slow dungeon case beats the
fast outdoor case. Overlapping intervals mean **Similar / uncertain**; incomplete timing means
**Time not compared**. A valid reviewed plan can remain a content choice without a speed claim.

Planning records must carry the departure point, exact destination/return, transport assumptions,
included activity IDs, source (player estimate or observation), build/date and low/high minutes.
Raw map percentages do not establish walking minutes across zones or continents. User timing
overrides are useful immediately and stay labeled estimates; later optional measurements can replace
them. No new game scanner or broad addon collection is required for this phase.

## Implementation sequence and acceptance

1. Author the Alliance Deadmines adapter from the existing source branch. Review the explosives exit,
   prerequisite options and exact retained/omitted/rejoin rows for supported character variants.
2. Extract the Thanes renderer into a shared definition-driven alternative plan, preserving its
   existing tests and behavior. Reuse source step rendering, maps, XP comparison and quest state.
   Extend the versioned replacement contract only with migration/backup validation; do not reinterpret
   existing generic trips as zone replacements or overwrite their independent bookmarks.
3. Replace the equal-weight primary cards with the chosen-plan/outdoor fork and collapsed other plans.
   Build the actual-progress-gated continuation/top-up reader, then verify DM and Thanes together.
4. Add faction-specific Ruins adapters and compare against the correct geographic route. Add WC using
   the later Alliance authored branch and Horde Barrens scope. Expand subsequent dungeons in reviewed
   batches, not a 32-row cosmetic catalog rollout.
5. Test: zero/already-rewarded/partial bundles, unavailable optional chains, class/race differences,
   strict At-level gates even for premades, hand-in XP ordering, missing objects, source-dependent
   bridges, transport assumptions, timing intervals, XP shortfall, exact continuation, route switching,
   reload/backup/Undo, mobile, keyboard and source-progress isolation.

Acceptance is a player being able to answer, without visiting another calculator: **what am I
replacing, what do I need, how far will it level me, what does the trip cost and what do I do next?**
Keep reviewed future chains and actual-progress gates intact even when the quest-XP forecast is high.

## Awaiting player timing input

Requested Alliance travel ranges for Stormwind→Deadmines, Stormwind→Ruins of Lordaeron and
Astranaar/Ashenvale→Wailing Caverns, each way, including transit waits and transport/Hearthstone
assumptions but excluding clear and quest work. These measurements will inform the first geographic
plans. Clear/preparation/hand-in ranges and the comparable outdoor baseline are still needed for
an honest speed recommendation; travel alone does not establish the winner.

## All-dungeon itinerary plan and implementation (2026-10-05)

The UI now uses a prominent Thanes-style alternative with XP/checkpoint metrics and a five-stage
quest itinerary. Other journeys stay in **Other dungeon alternatives**. Review screens show the
same preparation/run/hand-in plan instead of presenting only a calculator. Quest identities,
eligibility, prerequisite closure and rewards come from the existing catalog; geographical and
scope notes are authored in `packages/leveling/src/dungeon-itineraries.ts`.

These are **32 visit variants**, not 32 distinct dungeons. Every variant has an itinerary, including
future references. The table below is the route-authoring plan; a geographic fit is not permission
to omit a source chapter. At-level entry can be raised by selected pickup requirements. Build 70205's
reviewed playable cap remains 30, so higher-level plans cannot currently become runnable leveling
replacements. No travel or clear minutes are fabricated.

| Visit                     |            At-level floor | Preparation, run and return plan                                                                                                                                                | Source-replacement review still required                                                                                                       |
| ------------------------- | ------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ragefire Chasm            |                        14 | Orgrimmar run; stage Undercity/Thunder Bluff pickups and outside lead-ins; account for remote hand-ins. Horde geographic fit first.                                             | Barrens/Orgrimmar return segment and outstanding chains.                                                                                       |
| Hall of Thanes            |        14; core bundle 15 | Existing four-quest 15→16 Darkshore replacement; Treaty only at 16; Ironforge preparation and Darkshore carryovers remain.                                                      | Existing reviewed adapter retained; measured time still missing.                                                                               |
| Deadmines                 |                        19 | Stormwind pickups → Defias chain/escort → outer mine → VanCleef/Letter → Sentinel Hill/Stormwind. Six core quests; explosives only if prepared or explicitly selected.          | Implemented 19→20 continuation for Human Warrior at 1×, with required Redridge/Cooking work retained. Other variants still need bridge review. |
| Ruins of Lordaeron        |                        19 | Alliance inside starts and Stormwind hand-ins; northern journey counts. Horde prepares Brill/Undercity/Sepulcher; prefer routes already nearby.                                 | Same audited Alliance 19→20 bridge is implemented. Horde and other Alliance variants still need exact source continuations.                    |
| Wailing Caverns           | 19; Alliance itinerary 21 | Horde Barrens fit. Alliance is deferred to authored Stonetalon/Ashenvale 21–23 branch. Cave/Ratchet objectives and Naralex shard event; Smart Drinks only if prepared/selected. | Later authored branch and faction-specific return/flight-path obligations. No automatic Alliance Stormwind detour.                             |
| Shadowfang Keep           |                        23 | Horde northern pickups and boss clear; class collections remain separate multi-instance goals.                                                                                  | Silverpine route segment; Alliance gear/class trip is not a general XP alternative.                                                            |
| Blackfathom Deeps         |                        25 | Zoram'gar or Alliance cities/Darkshore preparation, inside Thaelrid work, optional Aquanis scope, actual faction hand-ins.                                                      | Ashenvale chains, outside-drop starts and remote preparation.                                                                                  |
| Stockades                 |                        26 | Stormwind clear, with Redridge/Duskwood/Wetlands pickups staged; later justice-chain rewards are not included automatically.                                                    | Preserve Unsent Letter follow-ups and remote outdoor dependencies.                                                                             |
| Excavation Site: Wetlands |                        29 | Stage Menethil/Redridge/Ashenvale work; distinguish relic pickup, first reward and later faction follow-up.                                                                     | Wetlands 29→30 bridge; Daily Delivery/relic lifecycle and faction gates.                                                                       |
| Razorfen Kraul            |                        31 | Southern Barrens objectives and inside escort; remote faction pickups and hand-ins are full-trip work.                                                                          | Later RFD/class stages, plus evidence release above cap.                                                                                       |
| Gnomeregan                |                        33 | Dun Morogh scoped run; faction city quests; Horde Scooty transport; punch-card/escort/ring work may need more than one visit.                                                   | Lifecycle, access and multi-visit scope; future evidence release.                                                                              |
| SM Graveyard              |                        37 | Graveyard only; RFK-dependent work and Vorrel's outdoor follow-up are separate stages.                                                                                          | Exact wing binding and shared reward ownership.                                                                                                |
| SM Library                |                        37 | Library books/objectives; class/lore chains and race restrictions must be prepared.                                                                                             | Exact wing binding, remote lore preparation and restrictions.                                                                                  |
| SM multi-wing             |                        37 | Composite trip across every required wing; locked access and all required bosses; shared reward pays once.                                                                      | Multi-wing dependency graph and full-run timing.                                                                                               |
| SM Armory                 |                        37 | Armory only; confirmed key/lockpicking; shared all-wing quest remains incomplete.                                                                                               | No standalone all-wings XP; wing-specific objective bindings.                                                                                  |
| SM Cathedral              |                        37 | Cathedral scope; complete shared reward only after other required bosses; faction-hub hand-ins.                                                                                 | Same shared-reward/wing audit.                                                                                                                 |
| Razorfen Downs            |                        39 | RFK follow-up, faction pickups and Belnistrasz escort; preserve cross-instance rewards.                                                                                         | Lifecycle and party-wide escort scope; never lower to beta access level 25.                                                                    |
| Uldaman                   |                        42 | Badlands/Loch Modan/city pickups; separate necklace recovery, tablet and disc stages.                                                                                           | Multi-visit lifecycle; never lower to access level 30.                                                                                         |
| City of Dalaran           |                   Unknown | Review faction pickups, release/access and actual hand-ins.                                                                                                                     | At-level/access unknown; reference library only, no guessed chapter.                                                                           |
| Zul'Farrak                |                        44 | Tanaris clear/escort; remote preparations; Gahz'rilla only with selected summon/Mallet work.                                                                                    | Replace a reviewed XP segment, not an entire unrelated Feralas chapter.                                                                        |
| Maraudon                  |                        46 | Separate orange/purple/Princess objectives; shortcut is not the full quest clear.                                                                                               | Wing bindings, access state and faction hand-ins.                                                                                              |
| Sunken Temple             |                        51 | Selected bosses/summons and compatible class chain; required materials and remote hand-ins included.                                                                            | Multi-instance/class chains and summon lifecycle.                                                                                              |
| BRD Prison                |                        55 | Prison subrun only; do not import Emperor/forge/arena rewards into a short run.                                                                                                 | Exact quest-to-subrun binding and attunement stage.                                                                                            |
| BRD Emperor               |                        55 | Full Emperor itinerary, with selected prison/forge/arena detours; keys and faction/profession gates.                                                                            | Objective-path binding and full-run lifecycle.                                                                                                 |
| Dire Maul East            |                        56 | East-wing objectives; selected summon/access work; later wings stay separate.                                                                                                   | East-compatible chains and reviewed return.                                                                                                    |
| Dire Maul West            |                        60 | West-wing gear/quest itinerary, prepared keys and selected summons.                                                                                                             | Endgame scope/access/reward evidence; not level 61.                                                                                            |
| Dire Maul North           |                        60 | Choose normal or tribute route; do not combine contradictory goals.                                                                                                             | Mutually exclusive route/reward checks; endgame only.                                                                                          |
| LBRS                      |                        60 | Lower-spire objectives and first attunement stages; retain UBRS requirements.                                                                                                   | Cross-instance stage ownership and access; endgame only.                                                                                       |
| UBRS                      |                        60 | Twelve source identities filtered for faction; LBRS prerequisites, group size and key/access review.                                                                            | Forever group/access unknown; never assume a five-player clear.                                                                                |
| Scholomance               |                        60 | Key/unlock preparation, faction/class pickups and separately tracked later visits.                                                                                              | Endgame lifecycle/reward evidence.                                                                                                             |
| Stratholme Living         |                        60 | Living wing only; cross-wing objectives stay incomplete until their full scope is done.                                                                                         | Wing binding and shared reward deduplication.                                                                                                  |
| Stratholme Undead         |                        60 | Undead wing, selected timed/summon work and remote follow-ups.                                                                                                                  | Timed/cross-instance lifecycle and shared reward ownership.                                                                                    |

### Implemented progression contract

Deadmines and Alliance Ruins now have a **real** reviewed Redridge 19→20 alternative, rather than
returning to repeat the same whole outdoor XP segment. This first adapter is deliberately limited
to the audited Human Warrior / 1× route and both exact authorized source hashes. The saved trip
includes the original outdoor bookmark and a separate next-chapter version/hash/step. Other
race/class/XP-rate variants keep the safe optional-trip behavior; they are not silently promoted.

The retained bridge keeps class/utility instructions, **The Price of Shoes → Return to Verner →
A Baying of Gnolls** (required by later Redridge), **The Corruption Abroad** for Darkshore, and
**Cooking 50** for later Duskwood. Mixed source rows are scoped to the retained quest, not unrelated
Everstill Bridge or Underbelly Scales objectives. The player explicitly confirms their in-game
preparation and reports actual level/XP. Checkmarks do not award XP. If short of level 20, the saved
outdoor route is available for top-up work; the continuation stays blocked.

Rejoin opens the exact first applicable step of 20–21 Darkshore/Ashenvale without marking the
replaced Redridge instructions done/skipped or erasing its bookmark. Source/continuation changes,
unreviewed variants, stale reward states or missing bridge checks block the continuation and show
why. `--alternative` trip keys keep old optional trips and competing alternatives independently
recoverable in the existing validated backup format. No database migration or addon change is needed.

### Calculation and remaining measurements

The endpoint walks the full client XP curve. At fresh level 19, Deadmines' six selected core quest
rewards estimate **21,867 XP → level 20 + 2%**; Alliance Ruins estimates **22,535 → level 20 + 5%**.
Those are quest-only, Crest-calibrated estimates. Prepared extra chains and per-player kills are
separate; rewarded quests never pay again. Neither example supports promising 1.5 levels from quests
alone. Unknown late reward totals stay unknown, not zero or a misleading fractional level.

The existing complete-trip comparison remains available with optimistic/conservative durations,
outdoor-to-same-checkpoint time, actual XP and explicit kill estimates. Travel, preparation, retained
bridge, clear, hand-ins and top-up must all be included once. Player travel measurements are still
pending; no automatic fastest-route ranking is published from missing timing.
