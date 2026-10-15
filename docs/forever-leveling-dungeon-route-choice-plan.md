# Dungeon alternatives as real leveling plans

October 13 correction: the owner requested a **whole 1–60 plan**, not only the dungeon circuit.
The main [Premade 5 page](https://helper.kfcguild.online/forever/leveling/premade) now uses the
continuous campaign from starting quests through the actual level-60 checkpoint, including the
world preparations and conditional grouped-kill work between all 21 stops. The earlier circuit
is retained at `/forever/leveling/premade/dungeons`. Human generic has 55 chapters / 803 actions;
the 33 supported race/class projections were checked against 61 authorized source chapters.
This is a review guide with explicit data/XP gaps, not an in-game-playtested speedrun or finished
RestedXP export. Exact source, progression, verification and deployment boundaries are in `context.md`.

October 13 implementation: the separate Alliance [Premade 5 review circuit](https://helper.kfcguild.online/forever/leveling/premade)
is deployed as `kfc-helper-premade-20261013-r1`, preserving the October 10 live baseline and existing
chapter/alternative progress. All 21 requested stops have staged preparation, optional collections,
five-player quest/actual-XP tracking, maps, backups and explicit conservative/expert entry policies.
Journal 1.6.3 base/reported rewards are separated; adjusted rewards are never boosted twice.
Drowned City, Krol'dok and Alcaz remain non-runnable evidence gaps. Later historical references and
faction-parity forecasts are not verified server facts. The RestedXP circuit export remains a later
phase after browser approval and route validation. Exact implementation/deployment evidence is in
`context.md`; the original research below is retained as historical context.

Analysis and implementation plan, 2026-10-05; implemented subset deployed as web-only r6 from
`e2beab6`. The earlier baseline and authoring analysis below are retained for maintenance; the
implemented adapters and remaining review work are recorded at the end. See
[release verification/rollback](forever-leveling-release-2026-10-05.md).
This supersedes the recent discovery-card presentation as
the primary leveling UX, not the existing correctness rules or previous verification receipts.

## Product decision

Offer a different way to complete an XP segment, not a dungeon catalog attached to a chapter.
Use the successful Hall of Thanes pattern: **what outdoor work this replaces, preparation, expected
progress, remaining work and where to continue**. The main route should offer the best-fitting
reviewed alternative; other trips belong under a collapsed **Other dungeon plans** section.

An alternative can be valuable for playing with friends, gear or experiencing new content without
being faster. Explain that tradeoff instead of giving every dungeon equal prominence or labeling
the largest raw quest-XP total the best route.

## Baseline before this iteration

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

## Owner's complete-quest dungeon circuit (2026-10-13; research, not implemented)

### Scope and scheduling decision

Plan an Alliance, coordinated five-player **quest circuit**, not repeated dungeon grinding.
Preserve the owner's order and desired levels as planning targets. Outdoor leveling between runs
should prepare the next dungeon and preserve later unlocks. "Complete quest run" means every
compatible, feasible selected quest, including its actual hand-in; it does not imply that every
quest in a dungeon directory can be unlocked in one entry. Class/profession quests are personal
extensions, not rewards promised to every party member. The arithmetic audit uses Human Warrior,
1× rate and fresh XP bars only as a reproducible base scenario.

The existing website still enforces At-level as a strict floor. The latest guide puts Ruins at 19,
Excavation at 29, Dalaran at 31 and LBRS at 60, above the owner's targets of 18/27/30/57. It also
puts Stratholme at 60, incompatible with using it to finish leveling under that policy. The owner
has now confirmed the audience is a coordinated premade of five. Plan a separate experienced-premade
policy using the requested targets, with those below-band exceptions explicitly shown in the web
approval. The public conservative gate is unchanged; audience confirmation is not live verification
of these entry levels. Preserve real access/pickup minima as hard gates and expose difficulty warnings
separately. Never call a recommendation band a proven server entry requirement.
[Current level reference](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).

### Fresh evidence and catalog limitations

- Current supplemental data is still build-70205 planning material from DungeonJournal 1.4.4:
  131 quest/prerequisite records and 94 associations. The identity-only reference was reviewed
  October 5: 224 identities / 228 associations. Later identity rows do not supply a usable lifecycle,
  reward value or complete prerequisite graph. Missing XP is unknown, not zero.
- The installed DungeonJournal is now 1.6.3. Its candidate data adds Alliance Dalaran stages,
  Library data and revised Wetlands chains, but is not imported or runtime-verified here. A read-only
  run of our old importer correctly failed on an empty Deadmines quest entry. Update its reviewed
  version/count contract and empty/missing-ID handling before importing; do not invent an ID,
  silently lose a nonempty record, or keep labeling new data 1.4.4.
- Old Dalaran reference data selects only two Alliance quests. The installed candidate has four:
  92456, 92489, 92457 and 92458. The last supplies a sewer key and has a recorded level-30 pickup
  minimum; its enemy-count objective and all-players key eligibility require checking before a
  one-run promise. New dungeon names alone cannot establish their quest bundles.
- No visit or verified quest bundle exists in this planner for The Drowned City, Krol'dok Stronghold
  or Alcaz Prison. Their reserved itinerary stages below are authoring work, not zero-reward runs.
- Blizzard's October 8 update opened Dalaran, changed per-player dungeon kill XP and increased
  base dungeon kill rewards by approximately 20%. Do not apply that change to quest XP or copy
  earlier kill measurements unchanged. The same update returns the Excavation relic for its
  follow-up: plan the relevant delivery without demanding a second relic clear.
  [Official October 8 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5).

### Calculation audit: usable numbers, not a fabricated 1–60 forecast

Validated all 60 client-curve rows against the pinned `xp.txt` extraction. That proves consistency
with build 70205, not current-runtime confirmation. The curve requires 4,084,700 XP for 1→60 and
3,991,900 for 16→60. Every checkpoint uses the player's actual XP bar, not a fixed number of
levels per dungeon.

The following are **legacy Crest-calibrated bookkeeping scenarios**, excluding kills, exploration,
outdoor prerequisites and later follow-up rewards. They assume all selected rewards are eligible,
unfinished and obtainable. They are not audited one-visit predictions. Reward hand-in ordering and
overlevel reductions must be checked separately.

| Proposed stop | Selected quests | Scenario quest XP | Endpoint from a fresh target-level bar | XP required to next proposed stop | Remaining XP before other gains |
| --- | ---: | ---: | --- | ---: | ---: |
| Thanes at 16 → Ruins at 18 | 5 | 14,427 | 16 + 90.2% | 33,700 | 19,273 |
| Ruins at 18 → Deadmines at 20 | 4 Alliance | 22,535 | 19 + 14.7% | 40,700 | 18,165 |
| Deadmines at 20 → Stockade at 26 | 7 prepared | 25,086 | 21 + 7.5% | 170,800 | 145,714 |
| Deadmines at 20, without explosives | 6 core | 21,867 | 20 + 94.3% | 170,800 | 148,933 |

The six Defias preparation stages are shared by two finales and pay once, not twice. The optional
explosives chain adds nine pre-entry stages; no-XP stages still take time. Preparation already in
the retained outdoor route is not extra XP or extra travel. Letter reward 373 belongs to Deadmines
and unlocks Stockade; paying it in both bundles would double-count it.

**Fix reward provenance before extending the calculation.** `referenceXp` currently mixes base
amounts and reported Forever values, while `calibratedDungeonQuestXp` multiplies every supplemental
dungeon association by `6200 / 2600`. Quest 378 is the concrete failure: its reference fallback is
5,750, explicitly labeled a beta-window reward in the installed source, but the current estimator
turns it into 13,712. Keeping the other five Stockade estimates unchanged, correcting just that
double application changes 41,731 to 33,769, below the 36,400 needed for fresh 26→27. This is a
demonstration, not validation of the remaining five rewards. Do not publish the old Stockade,
Excavation or Dalaran bundle totals as reliable circuit forecasts.

Store base-reference, reported-Forever and context-pinned observed-Forever amounts separately.
Only explicitly base-valued, eligible dungeon rewards may receive a labeled calibration. An
already-adjusted observation is never multiplied again; an unknown basis stays unknown. Prefer
context-matching observations. The Crest ratio is a single reported scenario, not proof of a
universal multiplier across dungeons, outdoor objectives, turn-in levels or later builds.

At Gnomeregan 33, some low-level quests already exceed the estimator's supported overlevel window;
at RFK 35, Blueleaf Tubers does too. Do not score them as full-value or silently remove them from
the complete-quest plan. Allow their content rewards with unconfirmed XP until reductions are known.
The rest of the late circuit lacks reward/lifecycle evidence rather than having no quests.

| Late bridge | XP needed from a fresh start bar; subtract actual progress and feasible gains |
| --- | ---: |
| Dalaran 30 → Gnomeregan 33 | 152,700 |
| SM 38 → Krol'dok 42 | 353,000 |
| Krol'dok 42 → RFD 45 | 319,100 |
| Alcaz 50 → Sunken Temple 53 | 461,800 |
| BRD 55 → LBRS 57 | 368,700 |
| 57 → 60 | 607,100 |
| 58 → 60 | 412,100 |
| 59 → 60 | 209,800 |
| 59 with 80% of its bar already earned → 60 | 41,960 |

These are checkpoint costs, not quest totals or recommended entry levels. A single final Stratholme
run cannot be promised to cover 58→60 without evidence for 412,100 remaining per-player XP. Make
the final entry adaptive: retained Plaguelands preparation/top-up brings the player close enough
for the selected first-run rewards. Unknown gains cannot justify an earlier departure or a level-60
guarantee. Completion checkmarks alone never award XP.

### Preparation windows for every requested stop

Windows are proposed **world-route attachment bands**, not claims that all pickups are legal at the
first level in the band. Validate the actual character state at the exact source anchor. A pickup
that needs level 25 cannot be moved to level 22 just to batch a town visit. References to an
instance-entry preparation leg below remain subject to the selected scheduling policy.

| Owner's stop | Preparation window | Circuit preparation and one-run scope |
| --- | --- | --- |
| Hall of Thanes · 16 | Dun Morogh / Ironforge before 16 | Resolve Underground Map 96391 → Incursion 96393. Collect outdoor pickups; reserve inside starts and Treaty 98423 at 16. Return to IF before calculating departure for Ruins. |
| Ruins of Lordaeron · 18 | Travel stage 17–18 | Alliance inside-start/item objectives are not pre-entry pickups. Plan transport, inside objects, four compatible rewards and actual outside hand-ins. Show the premade-only below-band proposal during web review. |
| Deadmines · 20 | Westfall 13–19; SW pickup stop | Complete shared Defias 65→132→135→141→142→155. Stage the full 92742…92752 explosives path separately. Collect city quests, do outer-mine objectives, clear, finish the explosives exit before Hearthstone, and hand in the Letter. |
| Stockade · 26 | Redridge/Duskwood 22+; Wetlands 25+ | Retain Letter 373→Bazil 389→Riots 391. Complete Dark Iron War 303→Fury 378; take remote quest heads back to their proper hubs. The Wetlands preparation loop can also prepare Excavation. |
| Excavation · 27 | Wetlands / Redridge 24–26 | Candidate 1.6.3 chains: Greenwarden 463→276→277→275→95646, Skins 484→98815, and Lost in the Thicket Things 95647→Heartwoven 95809. Daily Delivery is disputed as a hard gate: newer source calls it a breadcrumb. Resolve that conflict before publishing. After relic quest 95810, deliver the returned relic through Prism 98824 without another clear. |
| Blackfathom Deeps · 28 | IF / Darkshore / Darnassus before 28 | Collect the faction city bundle and 1198 before meeting Thaelrid for 1200. Schedule lower-level hand-ins carefully; entering at 28 leaves little room before their overlevel reductions. A class's outside materials are not another whole-party quest reward. |
| City of Dalaran · 30 | SW pickups earlier; Southshore / entrance at actual gate | Review four Alliance quests and the key-bearing stage. Preserve candidate pickup minima and possible insufficient enemy counts; do not promise all objectives from one clear before checking. At-level source is 31. |
| Gnomeregan · 33 | SW / IF / Kharanos 30–32 | Review Gnogaine→Green Glow's outside hand-in before later samples; expose a pre-entry/probe leg if needed. Stage punch-card upgrades in route order. Separate escort, ring and repeatable machine rewards; distinguish normal entrance from key shortcut. |
| Razorfen Kraul · 35 | Ratchet / Thalanaar while crossing Kalimdor | Bring Blueleaf starting items; prepare Lonebrow 1100→Crone 1101. Schedule inside Willix/Mortality work and their real exits. The Horde RFK→RFD unlock is not an Alliance prerequisite. |
| The Drowned City · 37 | Reserve STV route passage 35–36 | Verify actual quest IDs, faction, pickup/chain scope and rewards before filling this stop. Client names and public dungeon announcement do not provide a complete quest package. |
| SM Library + Armory + Cathedral · 38 | Desolace / Southshore 34–37 | Prepare Down the Scarlet Path 261→1052→Light 1053; optional Brother Anton 6141 is a breadcrumb unless a real gate proves otherwise. Do Library first for its key/book, then the other two wings. Count the shared four-boss reward once. |
| Krol'dok · 42 | Reserve Riverglades passage 40–41 | Author a verified zone-to-dungeon unlock overlay. Do not turn every Riverglades storyline into a mandatory prerequisite or estimate rewards absent from the catalog. |
| Razorfen Downs · 45 | City pickup / Southern Barrens 43–44 | Stage compatible world pickup and inside Belnistrasz sequence. Check all five players completed the required combat stage before starting the escort. Do not import Horde-only RFK preparation. |
| Uldaman · 47 | IF / Loch Modan / Badlands 44–46 | Audit necklace, reagent, tablet and dwarf chains; complete feasible outside/probe stages and city returns before the main clear. Partition follow-ups needing another entry. Low-level reward reductions are part of this deliberately later visit. |
| Maraudon · 48 | Desolace / Dustwallow 46–47 | Collect faction fragments/corruption and neutral objectives. A first quest-complete clear includes required orange/purple sections, Celebras and Princess; a portal-only Princess shortcut is a different scope. |
| Zul'Farrak · 49 | Tanaris / Dustwallow / Hinterlands 46–48 | Prepare remote quests and a party summon item. Finish Screecher Spirits before the Mosh'aru stage; keep its follow-up work for Sunken Temple. Score escort/pyramid and summoned-boss goals only if the route actually includes them. |
| Alcaz Prison · 50 | Reserve Dustwallow passage 48–49 | Quest bundle/access/reward evidence is missing. Do not assume the old Missing Diplomat chain is its new mandatory attunement. Keep a visible authoring gap rather than made-up quest instructions. |
| Sunken Temple · 53 | Start long world chains during 46–52 passages | Carry the ZF→Hakkar chain through its intervening world steps; prepare Brohann/Marvon and relevant reagent/class quests. Verify summon materials and each dungeon scope. Reserve actual remote hand-in time. |
| BRD · 55 | World work 50–54; unlock leg at eligible BRD level | Batch SW/IF/Burning Steppes objectives. Prepare Core and Shadowforge goals; separate prison/unlock, world hand-in and main-clear legs for Windsor and the royal chain. Onyxia completion has a later UBRS tail. |
| LBRS · 57, two planned visits | Burning Steppes before the first clear | Collect compatible quests and finish the ST-linked Final Tablets prerequisites. Assign a key holder, track three gem objectives per character, and make visit 2 conditional on what is missing. An outside forging stage and Vaelan return are not completed by two boss clears. |
| Stratholme · finish 60 | WPL / EPL while filling the measured final XP gap | Prepare the feasible first-visit bundle before entering. Choose living/dead/both sides explicitly; later unlocks needing an outside hand-in or another instance are deferred, not included as first-run XP. Actual entry level depends on verified gains and the chosen difficulty policy. |

This table is original route-authoring guidance based on the inspected catalog and revised primary
references, not a republication of all source guide instructions. Exact accepted quest IDs,
pickup maps, coordinates, action order and source-step anchors must be stored with each reviewed
adapter rather than inferred from a paragraph or dungeon name.

### Cross-dungeon dependencies and real completion boundaries

1. **Deadmines → Stockade.** One shared reward ledger for Letter 373. Early Westfall work unlocks
   DM's finales; its Letter and subsequent city stage unlock 391. Missing earlier work must be
   scheduled or explicitly omitted from the selected full bundle, not marked completed automatically.
2. **ZF → ST → LBRS.** Author the Yeh'kinya storyline as individual quests/world hand-ins rather
   than a single dependency called "did ZF". Hakkar's summon stage and Final Tablets must be held
   before their respective runs. Different parts of one story pay by unique quest ID once each.
   [Hakkar objective](https://www.wowhead.com/forever/quest=3528/the-god-hakkar).
3. **BRD → raid readiness.** Core can be finished by retrieving its fragment and returning to
   Lothos. The Shadowforge key is a separate route. Windsor and the royal line contain world returns:
   place an unlock/prison leg before the main boss path so required information is accepted before
   those bosses die. A party with mixed chain states may need an extra leg; show it. The Alliance
   Onyxia tail continues outside BRD and through UBRS; do not label the entire attunement complete
   at BRD 55. [Core](https://www.wowhead.com/forever/quest=7848/attunement-to-the-core),
   [Windsor information](https://www.wowhead.com/forever/quest=4282/a-shred-of-hope),
   [royal chain](https://www.wowhead.com/forever/quest=4362/the-fate-of-the-kingdom).
4. **LBRS → party key.** Seal 4742 asks for three specific gem items; drops are not guaranteed by
   a scheduled second run. Preserve observed inventory and keep additional runs as a conditional
   gear/key objective, not another full one-time XP bundle. The forging follow-up 4743 takes place
   at Emberstrife, then requires a return. Confirm Forever drop/loot rules before assuming the
   whole party can collect its personal set together.
   [Gem stage](https://www.wowhead.com/forever/quest=4742/seal-of-ascension),
   [forging stage](https://www.wowhead.com/forever/quest=4743/seal-of-ascension).
5. **Stratholme first visit ≠ all quest chains.** The Archivist's reward is outside. Its later
   Balnazzar and Baron stages cannot be counted as first-visit rewards without a reviewed return/
   re-entry path. The same applies to the two sample stages and cross-instance Ras/Dungeon-2 chains.
   A one-entry combined-side run and a full completionist chain circuit are different products.
   [Archivist](https://www.wowhead.com/forever/quest=5251/the-archivist).

Classic-era comments attached to Forever pages are historical evidence, not confirmation of current
loot sharing, respawns or key rules. Where a live Forever rule is missing, keep the stage pending.

### Browser integration and calculation contract

Add an explicit **Dungeon quest circuit** path within Group mode, preserving outdoor alternatives
and the existing full chapter tree. A stop has four expandable subtrees: **Prepare while leveling →
Enter and complete → Deliver rewards → Prepare the next stop**. Reuse the fixed map/right-hand list,
quest links, Next/Done/Undo and per-character state. No new desktop application or server is needed.

Show the owner-facing order, actual suggested entry, prepared/eligible/missing/inside-start/deferred
counts, known quest XP versus unknown rewards, whole-trip time range and the next level checkpoint.
Do not present 13 directory identities as 13 quests guaranteed in one Stratholme run. Show personal
class quests without inflating the base party bundle. Warn about quest-log space and item possession;
sharing cannot replace a key, starter item or rewarded prerequisite.

Implement a versioned **circuit sidecar**, separate from source chapter ordinals and progress:

- Resolve one race/class/rate-compatible path and its explicit branch choices before attaching
  preparation. The current Human Warrior / 1× auto-connected prefix stops after three chapters at
  an alternative continuation; all later readable references are not an automatically proven path.
- Topologically order quest/action gates with AND/OR, accepted/completed/rewarded states, item gates,
  faction/class/profession restrictions and visit ownership. Check cycles and missing identities.
  An inside quest objective needing an outside reward before a later boss forces a route loop.
- Find feasible pickup/hand-in windows in the selected future chapters. Reuse existing source work;
  attach missing work to stable chapter/hash/step anchors. For all five players, compute the union
  of required preparation but individual eligibility/rewards. Group readiness means every player
  is ready for a selected objective, not merely that the leader is ready.
- Batch shared travel and preparation once. Score geography, minimum pickup levels, accepted start
  items, hearth/flight access, remaining effort and quest-log capacity; raw map distance is not a
  reliable journey duration. The SM Desolace detour must happen before 38, not at Maraudon 48.
- Forecast a chronological reward timeline: preparation reward → per-player kills → inside hand-in
  → outside hand-ins. Re-evaluate reward context at each hand-in level. Subtract previously rewarded
  and retained-route rewards once globally; visits 2+ only pay their new eligible quest stages.
  Quest XP belongs to each eligible character: never divide it by five or multiply the leader's
  personal progress by five. Kill XP needs separate party/level context and actual reward evidence.
- Compute the measured gap to the next planned stop. Select reviewed outdoor work that both fills
  the gap and unlocks later content; retain utility/flight/training/source dependencies even when
  XP-rich work is replaced. Unknown XP or timings block a speed claim, not browsing reference plans.
- Rejoin by exact compatible chapter/version/step and actual XP/chain state. Keep original source
  bookmarks recoverable; never jump to the beginning or mark an omitted chapter completed.

Travel, prerequisite work, recruitment, reset/escort time, clear, hand-ins and continuation travel
all enter the time model. An already-measured combined journey is not charged twice. A ready party
has no assumed recruitment delay, but still walks. Use timing intervals; uncertain overlaps are not
"fastest". Record personal estimates separately from observed route/build/party timings.

### Implementation order and verification gates

1. Normalize XP provenance and current evidence; repair/review the 1.6.3 importer, Dalaran/Library
   omissions and Wetlands gate updates. Keep old source snapshots for comparison. Regression-test
   quest 378 so a reported Forever amount is never multiplied again.
2. Add the reviewed circuit model, global reward ledger, explicit difficulty policy and save migration.
   Preserve existing character saves, source bookmarks and independent dungeon trip records.
3. Author the early chain-connected circuit through Dalaran, then Gnomer/RFK/SM and the middle
   route. Give the three new-data gaps visible pending status rather than invented totals.
4. Author the ZF/ST/LBRS chain and BRD readiness legs. Separate first-clear, completionist and
   raid/key goals; only advertise one-clear coverage when all its prerequisites fit.
5. Author the adaptive Plaguelands/Stratholme finish after reward evidence exists. Do not inflate
   quest XP to make a fixed level-58 finish work. Validate every supported class/race variant.

Required regressions: mixed reward bases, unknown/zero XP, overlevel hand-ins, shared chains and
quests across multiple visits, item/drop starts, limited party loot, selected class restrictions,
escort readiness, inside→outside→inside loops, optional breadcrumbs, conflicting gates, partial
level bars, keys and late summons, source alternatives, sidecar save migration and exact rejoin.
Browser checks cover expanded chapter tree, preparation callouts, map coordinates, Next/Done/Undo,
reload/backups, keyboard/mobile and a party member joining with different prerequisite state.

Research verification performed: 104 existing leveling tests passed; all 157 authorized chapter
files checksum/schema-validated for the read-only anchor audit; all 60 pinned XP curve rows matched.
Candidate source anchors were found for the Greenwarden/Skins, Defias and SM world stages, but
parts of the explosives path, Dark Iron War and the later Stratholme bundle need authored overlays.
Temporary audits are `/tmp/kfc-dungeon-circuit-audit-20261013.{ts,json}` and
`/tmp/kfc-dungeon-preparation-anchors-20261013.{ts,json}`; durable figures and boundaries are above.
No leveling production code, source artifacts, addon, database, crawler queue or deployment changed.

## Five-player speed guide and final RestedXP edition (2026-10-13; expanded plan)

This is the owner's latest direction: minimize downtime for an already formed five-player party,
batch necessary preparation and shared-kill objectives, avoid low-drop personal collection work,
and deliver the approved browser itinerary as a RestedXP guide. It narrows the earlier
"complete-quest circuit": complete the selected efficient bundle, not every directory identity.
Keep a completionist/raid-readiness extension separate when its extra time conflicts with speed.
No guide implementation, catalog import or deployment occurred in this research turn.

### 1. Quest-XP comparison: use the installed Journal, not one undifferentiated field

Inspected DungeonJournal **1.6.3**, its TOC loading order, literal data declarations and the actual
`GetLiveQuestXP` reader. A non-executing Lua-AST audit found 100 unique dungeon quest IDs and 104
associations, plus one genuinely empty Deadmines row. These counts exclude separate prerequisite
records. The current importer does not import the explicit `FOREVER_QUEST_BASE_XP` table, which
must be included in the provenance repair. The durable research receipt, source hashes, 72 late-game
historical baseline lookups (69 numeric, three unknown) and calculations are in
[the XP audit](forever-leveling-premade-xp-audit.json). This file is research, not a production catalog.

Journal reward precedence is live, non-secret, successfully loaded client reward →
`FOREVER_QUEST_XP_FALLBACK` override → per-quest `liveXPFallback`. The older `rewards` text is
not the active XP source. Even a positive client-cache value can be stale/base: the Journal has
three explicit BFD corrections. A file field named "live" is not a context-pinned server observation.

Requested cross-checks produced the following distinctions. Page amounts are retrieved reference
values, not turn-ins independently observed by this audit; matching offline sources are not multiple
independent observations.

| Quest / ID | Base or base-like reference | Reported/listed Forever reward | Interpretation |
| --- | ---: | ---: | --- |
| Deadmines: Red Silk Bandanas · 214 | 1,250, explicit Journal base | 2,950, quest-page Gains | Supports the ordinary boosted tier; Journal fallback still contains 1,250. An older beta comment says 4,688, not the current amount. |
| Deadmines: Underground Assault · 2040 | 1,550, explicit Journal base | Earlier beta comment: 5,813; current numeric reward not retrieved | Historical boost evidence only; do not label the old comment current. |
| Stockade: The Fury Runs Deep · 378 | 2,750, historical reference | 5,750, Journal's explicit beta-window observation | Keep 5,750 as reported Forever, never multiply it again; character/build/modifiers of that observation are missing. |
| Gnomeregan: Save Techbot's Brain · 2922 | 2,650, Journal and overview guide | 4,750, quest-page Gains | Outside-instance objective / different tier or context. A universal 2.375× model would predict 6,300, so this cannot train that tier. |
| Gnomeregan: Grand Betrayal · 2929; Data Rescue · 2930 | 2,750; 3,650 in both Journal and overview | Independent current boosted amounts not established | Identical reference fields do not prove 1× live rewards or establish a new coefficient. The exact retrieved 2930 page omits numeric XP. |
| New Alliance SM: Past Due · 96800 | 2,850 in the quest list | 6,750 in Journal and quest-page Gains | Add to the Library plan; reported Forever amount is already adjusted. |
| New Dalaran: Starving Arcane · 92457 | 3,950 in the quest list | 9,400 in Journal and quest-page Gains | Supports the ordinary tier, but spawn counts can require multiple clears. |
| New Thanes: Important Heirlooms · 96403 | 1,350, explicit Journal base | 2,950, quest-page Gains | Lower bonus tier than ordinary 2.375×. Old text was 4,590, approximately 3.4× base. |

References: [Red Silk Bandanas](https://www.wowhead.com/forever/it/quest=214/red-silk-bandanas),
[Underground Assault](https://www.wowhead.com/forever/quest=2040/underground-assault),
[historical Fury baseline](https://classicdb.ch/?quest=378),
[Techbot](https://www.wowhead.com/forever/quest=2922/save-techbots-brain),
[Gnomeregan overview](https://www.wowhead.com/forever/guide/gnomeregan-dungeon-overview-location-rewards),
[Past Due](https://www.wowhead.com/forever/quest=96800/past-due),
[its quest-list reference](https://www.wowhead.com/forever/item=273169/the-lost-magic-of-the-runemasters),
[Starving Arcane](https://www.wowhead.com/forever/quest=92457/starving-arcane), and
[Heirlooms](https://www.wowhead.com/forever/quest=96403/important-heirlooms).
Several exact quest pages returned a JavaScript challenge or omitted numeric XP. Use the available
reference evidence; do not bypass the challenge or invent a missing reward.

### 2. Formula for unknown rewards: bonus tiers, context and explicit scenarios

The official October 1 change halves **extra XP above normal**, not total XP. For a compatible
pre-change total `O` and base reward `B`, the unrounded patch transform is:

```text
postChangeXP = B + 0.5 × (O − B)
postChangeMultiplier = 1 + 0.5 × (oldMultiplier − 1)
```

Thus an old 3.75× tier becomes **2.375×**; the old approximately 3.4× Thanes tier becomes
approximately **2.2×**. The Journal's old Alliance Crest text is 9,750 against a 2,600 base;
the transform gives 6,175, close to the owner's reported 6,200. The same arithmetic on its old
Horde Crest text, 8,320, yields 5,460, not the same reward. Count parity does not imply XP parity.
The notes also say individual rewards were recalibrated, so this transform alone is not an exact
current-server formula for every quest.
[Official October 1 change](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/4).

For **ordinary unknown dungeon rewards**, use `B × 2.375` as the central planning scenario.
Rounding that result to the nearest 50 reproduces the four retrieved/report pairs for Crest,
Red Silk Bandanas, Past Due and Starving Arcane (6,200 / 2,950 / 6,750 / 9,400). This is a
candidate display fit, not a reverse-engineered rounding guarantee. Keep the owner's original
`6,200 / 2,600 = 2.384615…` scenario available for comparison with earlier figures; it differs
from 2.375× by only about 0.405% before rounding. Do not apply both.

Reward selection order for the proposed engine:

1. Use a compatible actual server turn-in reward, with before-hand-in level, build/date and modifiers.
2. Otherwise use a reported Forever amount with its context/conflict status; never boost it again.
3. Otherwise use an explicitly identified base reward and an evidenced quest/dungeon/faction bonus
   tier. Where the tier is unknown, use the labeled ordinary 2.375× scenario, not a claimed fact.
4. Unknown baseline remains unknown. An aggregate what-if may estimate an unnamed reward using
   same-level/type reference rewards, but cannot create an exportable quest or a guaranteed XP gate.

World prerequisite rewards use their own world rate, not the dungeon coefficient just because
their finale is in a dungeon. Conversely, an outside objective officially given a dungeon bonus
needs its own evidence rather than an automatic "outside = unboosted" classification. Separate
base/reported/observed fields, quest bonus tier, personal modifiers and overlevel adjustment.
Do not automatically extrapolate a multiplier increasing with level: the requested files contain
mixed contexts, not sufficient matched samples for that curve. The three BFD corrected amounts
are approximately 3% above their stale amounts; flag possible personal modifiers, not a new global tier.

The reference curve stays pinned to build 70205 until observed/current extraction confirms a change.
Dungeon kill XP is separate and changed October 8. A full reward observation does not prove kill XP,
and the kill-XP buff is not another multiplier on quest hand-ins.

### 3. New SM quests and the faction-balancing hypothesis

The main all-dungeon list is incomplete for this purpose. Reconcile each **dungeon page, quest
category, quest-start/reward items, Journal declarations and prerequisite updates**, keyed by exact
edition/quest ID. Past Due 96800 is a confirmed new Alliance candidate missing from the old public
planner. Pick it up during the Dalaran/Alterac preparation window, retain its book objective in
Library, and include its actual outside hand-in to Magus Olvek. Confirm object availability for all
five. Do not confuse it with unrelated retail quests named Past Due.

Make faction balancing a separate **upside forecast** as requested:

```text
extraAllianceCount = max(0, matchedGenericHordeCount − matchedGenericAllianceCount)
extraScenarioXP = sum(sameLevelAndTypeBaselineEstimate × estimatedBonusTier)
```

Compare the same wing/visit/hand-in horizon, exclude class/profession-only quests, deduplicate shared
quests and separate zero-XP stages. Do not count a Horde outside follow-up as a first-clear inside
quest to create artificial parity. Do not automatically apply the hypothesis to faction-capital
dungeons. Show known-route, fitted-XP and parity-upside scenarios separately; unnamed additions
stay aggregate estimates, not invented names/IDs/pickups/RestedXP actions. Promote additions only
when an actual quest identity, lifecycle and eligibility are available.

### 4. What the late-game math establishes

The reproducible receipt calculates both the new 2.375× ordinary tier with proposed nearest-50
display rounding and the owner's 31/13 coefficient with per-quest integer rounding. These deliberately
generous **directory scenarios** include optional, world and deferred rewards, ignore overlevel
reductions, and exclude kill/preparation XP. They are not first-run forecasts or upper bounds on all
future Forever additions. Unknown rewards are outside the known subtotal in both columns.

| Visit → next target | Generous known XP · 2.375× fit | Original 31/13 scenario | XP needed from a fresh bar | Why the speed bundle can be smaller |
| --- | ---: | ---: | ---: | --- |
| RFD 45 → 47 | 29,200 | 29,308 | 240,700 | Outside Host of Evil, low-level hand-ins and escort readiness. |
| Uldaman 47 → 48 | 73,250 + one unknown | 73,542 + one unknown | 129,100 | World collections, low-level reductions and necklace return/re-entry. |
| Maraudon 48 → 49 | 103,100 | 103,491 | 135,100 | Outside fragments/Pariah and optional Twisted Evils are not free first-clear rewards. |
| ZF 49 → 50 | 72,700 + one unknown | 73,088 + one unknown | 141,200 | Collection rewards and Gahz'rilla baseline still need review. |
| ST 53 → 55 | 96,050 | 96,458 | 341,000 | Long prerequisites and remote delivery; personal class quests are separate. |
| BRD 55 → 57 | 197,300 | 198,044 | 368,700 | Composite prison/royal/world-return itinerary, not all rewards from one entry. |
| LBRS 57 → 58 | 162,450 | 163,110 | 195,000 | Includes deferred/RNG gem and risky transport goals, not only the fast first visit. |
| Stratholme 58 → 60 | 224,000 + one unknown | 224,867 + one unknown | 412,100 | Composite directory includes later outside unlocks and another-instance goals. |

Fresh 45→60 requires **2,424,700 per-player XP** on this curve. A dungeon-heavy finish is a
reasonable design target; one quest clear at each named stop has not been shown to supply it.
New quests may improve it, but cannot erase gaps merely through count parity. For example, RFD's
generous known bundle leaves 211,392 XP to 47 before kills/preparation: two hypothetical new quests
would each need over 105,000 XP to close that gap alone. This is a diagnostic, not their predicted XP.

For a candidate Stratholme first-visit scope, six historical reward baselines under 31/13 give
108,498 XP. Treat Flesh Does Not Lie 5212 as opportunistic collection; removing it leaves five
candidate rewards `[5214, 5251, 5282, 5848, 5243]` totaling **92,760 scenario XP**. Before kills,
that fits a final entry at approximately **59 + 55.8%**, not fresh 58. The new ordinary 2.375× fit
gives **92,400 XP** and approximately **59 + 56%** for the same five IDs. Preparation, current
rewards, selected sides, loot availability and the slowest player's actual XP can move the threshold.
Neither number is a guaranteed run forecast.

### 5. Five-player quest selection and travel optimization

Optimize elapsed time until **all five** satisfy the next checkpoint, with dungeon-heavy play as
the preference between comparable plans. Do not optimize five times the leader's XP or minimize
outdoor minutes while ignoring a slower total route. Keep the supplied stop order as the first
draft; expose efficient schedule changes as proposals for browser approval, not silent reordering.

Classify every objective by actual credit/loot behavior: shared kill, boss/event credit, individual
guaranteed item, finite ground object, random personal roll, single party-loot item, escort or unknown.
"Shareable quest" does not establish shared objective credit or shared items. For unknown optional
loot rules, exclude the reward from the guaranteed-ready bundle; a necessary unlock needs review,
not a fabricated fast time. Keep all members in credit range; do not assume splitting 2+3 is faster.

Priority order:

- Access, selected future-chain and essential class-power obligations first.
- Batch overlapping kill objectives, dungeon boss/event work and short on-path deliveries.
- Score a prerequisite by the **whole unlocked chain's remaining marginal** XP/time and future
  utility. A collection stage can still be worth doing if it unlocks a strong selected bundle.
- Collect optional drops during required clears, but leave when the core route is ready. No
  second clear or spawn camping solely to finish an inefficient optional collection.
- Optional mats can be brought beforehand where legal; count their acquisition cost/effort and
  each character's requirements. Do not assume one player's inventory supplies every member.
- Batch hand-ins, flights/hearth, training, repair and inventory checks. Preserve skill/access
  dependencies even when the group is ahead on XP. Reserve actual quest-log capacity for inside starts.

A synthetic illustration, **not a real quest drop rate**: five characters needing ten items each
at 20% drop probability require 250 kills on average if each corpse supplies at most one shared
party item; the 90% all-ready threshold is 291 kills. With independent personal drops it is 83
kills at the same 90% threshold. A ten-kill objective with confirmed shared credit needs ten group
kills. Group damage speeds combat, but does not remove the last-player collection bottleneck.

Refinements to the preparation table above:

- **1–16:** keep race-specific starts, required combat/class training and Thanes preparation; do
  not label a route starting at 16 a complete 1–60 guide.
- **16–20:** bundle short necessary preparation with kills; Ruins' northern Alliance travel still
  counts. Crest/insignia/object availability is checked for each member. Do not require the full
  DM explosives chain by default: its gills, supplies and ten dynamite per eligible player may
  defeat the speed objective unless already prepared or a measured chain comparison favors it.
- **20–27:** author shared-kill bridges through relevant Redridge/Duskwood/Wetlands hubs, retaining
  city pickups, the Letter ledger, Dark Iron War and selected Greenwarden unlocks. The 20→26
  gap cannot be bridged just by DM quest XP. Remove unrelated personal-drop filler, not the
  necessary unlocks for the chosen Stockade/Excavation bundle. Highland Hides' collection chain
  is optional unless selecting its finale; the disputed Daily Delivery gate still needs review.
- **28–38:** combine BFD city pickups with the actual crossing, Dalaran's Southshore breadcrumb
  92432 before 92457/92458, and Past Due's Dalaran pickup. Do not repeat Dalaran solely for
  Starving Arcane's missing optional spawns. Gnomer samples/robot guts and RFK tubers are
  opportunistic unless needed for a selected obligation. Prepare the SM Desolace chain before
  38, not during Mara at 48; Library key/book → Armory → Cathedral remains the wing order.
- **38–45:** prefer reviewed Riverglades/Krol'dok unlock and shared-kill work for the large bridge.
  Drowned City/Krol'dok bundles remain missing evidence, not zero-XP stops. RFD 45 is retained
  as requested, but moving it nearer its 39 At-level band is a worthwhile schedule comparison
  because some quest rewards are already heavily overleveled at 45.
- **47–50:** batch IF/Badlands, Desolace, Tanaris/Dustwallow/Hinterlands work; do not demand five
  sets of low-drop outer Uldaman/Shadowshard materials as routine filler. Use full first-time Mara
  scope when its selected quests need both entrances; the portal Princess shortcut is different.
  ZF's Mosh'aru dependency is retained for ST; shells/temper are opportunistic. Alcaz access/quest
  evidence still needs an authored adapter rather than guessing that Missing Diplomat unlocks it.
- **50–55:** share prerequisite-rich kill work for ST and BRD, choosing chains by net benefit
  and actual group credit. Show each member's class quest separately. Avoid Love Potion material
  farming and the long Taste of Flame detour unless already prepared or expressly selected.
- **55–60:** split BRD preparation/probe, world return and main route; include Shadowforge/Core
  goals and the BRD portion of Onyxia as requested, but never claim its later UBRS tail is done.
  Make LBRS visit 2 conditional on missing objectives/gems; one-time quest XP never repeats.
  Key-holder versus everyone-keyed is a separate goal, and two runs do not guarantee RNG gems.
  Prepare the selected WPL/EPL/Stratholme bundle during the remaining measured gap, then enter
  for the adaptive final clear. Defer Archivist/sample follow-ups requiring an outside return.

For each member calculate the XP still required after feasible remaining rewards. Select the
shortest reviewed shared-kill bridge that covers every member's gap and upcoming unlocks. Do not
print "kill N mobs" from an assumed universal kill-XP value: use objective counts first, then an
actual XP checkpoint or a calibrated per-player kill rate. If a repeat dungeon is genuinely faster,
show it as an explicit optional XP-only comparison with reset limits and no reused quest rewards;
it is not the default quest-circuit path.

Times are measured/user-estimated intervals for preparation, walking/transport, combat, waiting
for credit/items, return and hand-ins. No fixed 25-minute clears, guaranteed red-boss success or
whole-route speedrun-hour claim. A ready premade removes recruitment delay, not travel/deaths.

### 6. Browser approval and one shared authoring model

Add **Premade 5 · Dungeon quest speed route** within Group mode. Reuse the fixed-map reader and
full chapter tree. Each stop shows preparation readiness for five, selected versus opportunistic
quests, known/scenario/unknown XP, predicted exit level/bar, actual shortfall, time range and next
stop. Surface two-ahead preparation so a missed world unlock is caught before departure.

Reuse `packages/leveling` as the authoring/compiler home. One versioned, reviewed circuit definition
must drive both browser steps and addon output: stable action/quest IDs, source anchors/hashes,
waypoints/objective indexes, faction/race/class filters, AND/OR prerequisites, item/access gates,
accepted/completed/rewarded state, visit ownership, optional branches, XP checkpoints and explicit
continuations. Keep the raw authorized source archive separate; its 157 alternatives are not one
continuous five-player itinerary. Resolve every branch and missing transition before export.

Before each departure/hand-in checkpoint, the website uses actual/manual character progress,
not its Done checkbox as proof of earned XP. Distinguish mandatory unlock work from skippable
XP filler so being ahead never discards an attunement. Preserve Next/Done/Undo, exact bookmarks,
alternative recovery, reload/save migrations and already-rewarded chains across chapters.

The owner approves a specific route revision, assumptions, early-level exceptions and scope.
Freeze its content hash; export exactly that version. Approval is a content decision, not a claim
that inaccessible late-beta content has been playtested. Draft/unverified sections stay labeled;
unknown quest identities cannot become navigable in-game instructions through approval alone.

### 7. RestedXP delivery: what works and what still needs implementation

The installed RestedXP is now **v4.11.23**. Its public `RXPGuides.RegisterGuide` supports a separate
custom guide pack, Forever headers, chained chapters and actual-level/XP directives. Our existing
deterministic compiler already registers a KFC pack, but is a **Westfall/Thanes 0.1.0 preview** with
hardcoded packaging/v4.11.14 text, simple actions and quest-state validation reset per chapter.
It does not yet export this full circuit or the browser's extended imported-route branches.
[Public loader](https://github.com/RestedXP/RXPGuides/blob/main/GuideLoader.lua).

Delivery plan after browser approval:

1. Extend the existing shared model/compiler, rather than hand-writing a second guide. Validate
   lifecycle globally across chapters, objective indexes, branches, item states and actual XP
   gates. Use reviewed `#forever`, KFC group, chapter names and `#next` links against the tested loader.
2. Compile immutable `KFCForeverGuides` ZIP plus manifest/checksums and install instructions.
   Players install RXPGuides plus this separate pack and select **KFC Forever · Premade 5**.
   Never overwrite RestedXP core or SavedVariables; keep the previous pack recoverable.
3. Each player follows the same approved release with personal class/race/quest filters and
   real in-game XP/quest checks. Add explicit party regroup/readiness instructions: RestedXP's
   individual gate cannot automatically prove all five players' hidden XP or prerequisite state.
   No protected-action automation or new quest/NPC scanner is needed.
4. Test native fractional XP checkpoints and conditional filler skipping using the installed
   loader. Preserve mandatory preparation even when XP is ahead; a shortfall selects the reviewed
   bridge, not a reset to the beginning or an endless prediction-based loop.
5. Replace preview build assumptions only with reviewed compatibility rules for route/quest/map
   identities, a tested RestedXP version range, clear warnings and rollback. Do not blindly remove
   all build checks or mix the economy catalog's compatibility with guide correctness.

**Installable custom guide pack is the verified delivery path.** The current GUI paste-importer
expects an encoded, account-sensitive format; raw guide text is not a verified paste-import string.
Do not reproduce private encoding/account checks or bypass them. If literal one-click/paste import
is required, first obtain and test the supported public custom-guide import/encoding workflow.
The KFC pack appears inside RestedXP through its public registration path without distributing
RestedXP itself. Existing supporter/contribution choices remain a separate activation phase.

### 8. Implementation order, evidence loop and release gates

1. Import/reconcile the reviewed Journal 1.6.3 declarations, **including explicit base XP**, new
   SM quest and Dalaran prerequisites; normalize reward provenance and repair quest 378's double
   scaling. Keep the literal-only importer, source hashes and unidentified-record rejection.
2. Implement bonus-tier/scenario calculation and per-player global reward ledger; regressions
   cover reported Forever values, shared chains, repeated visits, overlevels, modifiers and unknowns.
   A future faction-parity scenario is visible but cannot unlock guaranteed departure/release gates.
3. Author the shared-kill/preparation sidecar and explicit compatible chapter path; review the
   early 1–30 itinerary first, then middle and late circuits without making up the three missing
   new-dungeon bundles. Each new segment needs real IDs, objectives, pickup/hand-in map and gates.
4. Review the browser's full route, named omissions, actual-XP branches, each class/race, party
   readiness, loops, loot-capacity risks and timing inputs. Owner approval freezes the revision.
5. Extend the RestedXP compiler/export and test that web and addon select the same ordered quest
   actions. Check no dangling labels/next chapters, conditional skipped accept/turn-in mismatches,
   unsupported directives, unsafe Lua interpolation or per-chapter duplicate rewards.
6. Load the pack and perform a bounded in-game check of available segments, pickup/complete/
   turn-in behavior, objective tracking, XP fillers and reload/resume. Document untested future
   scope; automated arithmetic or owner approval is not a live 1–60 playthrough.

The existing opt-in observer can collect bounded server turn-in XP without a scanner. Improve its
context to capture **before/after** level and XP, current modifiers, build and eligible party scope;
an event after leveling cannot use the new level as the old reward context. No combat/private state
or account identity is required. Keep secret-value guards and storage limits. Review observations,
compare predicted versus actual checkpoint gaps, revise only affected reward tiers/travel legs,
and issue a new immutable guide revision. Running guides do not silently change under users.

Research scripts execute only local TypeScript calculations and literal AST parsing, not addon Lua.
Verification: all 104 existing leveling tests and strict TypeScript typecheck passed. The durable
JSON receipt was independently checked for 72 unique IDs / 69 known baselines, both eight-bundle
calculations, explicit unknowns, four ordinary-tier matches and the adaptive Stratholme threshold.
Scoped `git diff --check` passed. These checks do not validate a live 1–60 clear or the future export.
No full guide ZIP was generated or installed, and no payment, production data or deployed reader
behavior changed.
