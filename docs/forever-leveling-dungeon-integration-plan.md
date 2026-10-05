# Forever leveling: dungeon preparation, quest chains and worthwhile detours

Research and implementation plan, 2026-10-04; implementation status updated 2026-10-05.
The local dungeon companion, typed graph, reference catalog, route/map overlays, durable states,
item previews and conservative comparisons are now implemented. The approved chapter-first revision
also implements the Crest-calibrated Hall of Thanes / Darkshore 15–16 alternative, independent branch
progress and a source-derived quest-chain return checkpoint. Other dungeon/chapter replacements
still require reviewed lifecycle and continuation adapters. The updated
[full-catalog replacement plan](forever-leveling-dungeon-replacement-plan.md) audits all 32 visit
entries, identifies the UBRS importer gap, and specifies the generic engine, segment adapters,
XP/time rules, save migration and staged rollout. See
[implementation and remaining validation](forever-leveling-dungeon-implementation.md) and
[coverage audit](forever-leveling-dungeon-coverage.json). No deployment is part of this implementation
turn. The reader-quality release is deployed separately as r5. This extends the existing
leveling product and experience plans; it does not replace the authorized source route.

## Decision

Integrate dungeons as optional, planned trips with preparation **inside the ordinary leveling
route**. A player should encounter the right pickup or prerequisite while passing its location,
then arrive with a useful quest bundle, complete the applicable objectives and follow an explicit
turn-in/rejoin itinerary. Do not add a disconnected dungeon quest checklist or automatically accept
every quest merely because it is listed.

Scheduling update, 2026-10-05: **At level is a strict floor, never an early-entry suggestion**.
Use `max(source At level, selected quest pickup levels, confirmed access minimum)` for the run,
including prepared groups. Unknown At-level or above-cap schedules remain reference-only.
Preparation may occur earlier, but dungeon run alternatives must not. This supersedes earlier
hard-level/premade entry experiments in the planning documents.

Every reference quest gets a coverage record. Not every quest can be collected before entry: some
begin inside, from an item, after an escort, after another dungeon, or after a return to town. Keep
those stages visible rather than promising that all prerequisites are ready outside the portal.

Evaluate two different decisions:

1. Is this **whole dungeon trip** worthwhile compared with this character's outdoor alternative?
2. If this dungeon is already planned, is this **additional quest/chain** worthwhile at its marginal
   preparation/objective/turn-in cost?

These must not share a single undifferentiated XP-per-hour score. A worthwhile dungeon can contain
an inefficient remote chain; an inefficient full trip can contain cheap quests worth doing when
friends are already going.

## 1. What we actually have

- Authorized, checksummed archive: build 70205, 157 alternative chapters, 22,604 steps and 2,394
  distinct quest IDs. It includes faction/race/class/rate conditions, accept/objective/turn-in
  directives, travel coordinates and source-linked continuations.
- Existing `packages/leveling` provides the profile, chapter eligibility, imported-step conditions,
  original Westfall/Thanes preview and pure XP/checkpoint comparison. The browser already provides
  the persistent map, progress/bookmarks, optional source dungeon tags and chapter handoffs.
- `DUNGEON_LEVELS` has 14 reference entries, but only Thanes and Deadmines have quest ID bundles.
  Most entries have no authored quest itinerary. Scarlet Monastery is currently one combined row.
- Installed `ForeverDungeonJournal` 1.4.4 supplies supplemental IDs, pickup/turn-in descriptions,
  reward item IDs, shareability hints, item requirements and chain lists. It is reference evidence,
  not a complete server quest database or a source of automatically verified XP.
- Current world quest records expose IDs, some titles/objectives/restrictions/start items and quest
  line membership. Their schema does **not** contain authoritative per-quest reward XP, complete
  reward choices, every server prerequisite, or every quest-giver position. `QuestXP` is a difficulty
  table, not the missing per-quest binding. A quest-line ordering is not proof of mandatory gating.
- `KFCForeverGuides/Observer.lua` can opt in to bounded turn-in XP observations and current-level
  curve observations. It does not currently record enough reward/quest-state context for this
  planner. Do not re-enable the previously disabled broad NPC/quest scans in the market collector.

I re-indexed the published local archive's `.accept`, `.complete` and `.turnin` directives against
the existing private supplemental audit. The audit covers **94 dungeon associations / 92 distinct
quest IDs / 13 dungeon sections**, not all quests through 60. Coverage counts below include _all_
conditional variants; existence somewhere does not mean a specific character sees it.

| Audited bundle               | Quest associations | No accept directive | No turn-in directive |
| ---------------------------- | -----------------: | ------------------: | -------------------: |
| Hall of Thanes               |                  5 |                   4 |                    5 |
| Ruins of Lordaeron           |                 10 |                  10 |                   10 |
| Excavation Site: Wetlands    |                  9 |                   9 |                    9 |
| Wailing Caverns              |                  7 |                   0 |                    0 |
| The Deadmines                |                  8 |                   2 |                    2 |
| Blackfathom Deeps            |                 12 |                   5 |                    6 |
| Ragefire Chasm               |                  6 |                   1 |                    1 |
| Shadowfang Keep              |                  5 |                   2 |                    2 |
| The Stockade                 |                  6 |                   1 |                    1 |
| Gnomeregan                   |                 12 |                   1 |                    5 |
| Razorfen Kraul               |                  7 |                   1 |                    2 |
| Scarlet Monastery: Graveyard |                  2 |                   1 |                    1 |
| City of Dalaran              |                  5 |                   5 |                    5 |

These are missing directives, **not** confirmed missing gameplay. An item-start quest may need an
item instruction rather than `.accept`; a hand-in may be implicit in source text. Conversely,
finding one accept directive does not prove a runnable chain. The completeness audit must check the
entire lifecycle, correct variant, prerequisites, objectives and route connection.

Local inputs: `artifacts/leveling/archive/manifest.json`, its manifest-listed chapters,
`/Users/dimitarjilanov/Desktop/restedxp-analysis/dungeon_coverage.json`, and the installed addon's
`Data/Dungeons.lua`, `QuestChains.lua`, `QuestRewards.lua`, `QuestMaps.lua`, `QuestShareability.lua`
and `QuestUpdates.lua`. Respect addon load order: updates can override earlier declarations.
Publish reviewed factual records and our own instructions, not a wholesale third-party addon copy.

## 2. Source conflicts that must be resolved explicitly

The current [dungeon quest reference](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location)
provides useful visit bands and preparation hints, but also marks unresolved locations and later
content. Keep its **At level** values as strict visit minimums, separately from quest pickup gates.

Specific findings from the local sources:

- Thanes pickup minima disagree with the reference values already encoded in the product. Store
  both claims; require a reviewed/live gate before moving the default trip earlier.
- `QUEST_PREREQ_CHAINS[92753]` includes 92753 itself and later 92819. Importing it as a prerequisite
  array creates a self-cycle and asks for a future reward before entering. Its actual chain stages
  must be classified individually. [The quest's own page](https://www.wowhead.com/forever/quest=92753/destruction-in-deadmines)
  places the objective in the forge and the subsequent meeting at the exit. The exit matters to
  the itinerary; an immediate hearth is not interchangeable.
- The Paladin list ends on its own reward quest 1806; the collection stage is 1654. Model collection
  requirements separately from the final weapon hand-in. [Collection quest](https://www.wowhead.com/forever/quest=1654/the-test-of-righteousness).
- The Red Silk Bandanas comment describes an additional gate, while the array does not encode it.
  Keep the disputed 153 relationship reviewable; do not silently choose one representation.
- Gnomeregan's Rig Wars relationship requires an **accepted/in-progress** state, not a completed
  prerequisite. Punch-card placeholder IDs such as 2930001 are item/objective nodes, not quest IDs.
- The addon contains both descriptive reward strings and offline fallbacks with different XP.
  Its override for quest 378 says 5,750 XP was observed, but gives no build/date/player modifiers.
  That is a useful lead, not a universal current reward. Wowhead's text extraction also omits
  numeric reward fields on some pages; an empty field is unknown, not zero.
- City of Dalaran is catalog-present but not in the October 1 playable-dungeon list. Its presence
  must not become a live visit recommendation without availability evidence.

[Blizzard's October 1 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-1/2360696/4)
set the beta cap to 30, expand dungeon access, reduce the _extra_ dungeon quest XP and correct item
quest sharing. Therefore do not multiply every reward by three or halve the entire old reward.
Availability, entry restrictions, recommended level and current player cap are separate facts.

## 3. Quest and dependency model

Extend the owning leveling package with validated, release-scoped records; reuse world/catalog IDs.
Do not put routing or estimation into React components or turn source text into executable code.

| Record                  | Required information                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dungeon / visit variant | Instance and wing, faction access, entry/portal, availability evidence, default visit level, route/boss scope, key/summon requirements, exit and rejoin                  |
| Dungeon quest           | Real quest ID, faction/race/class/profession restrictions, minimum level, pickup/turn-in entities, objective scope, quest-log/items required, one-time/repeatable status |
| Dependency gate         | Typed AND/OR expression; required predecessor state; breadcrumb/exclusion; item/event/ability/key gates; provenance and unresolved alternatives                          |
| Quest reward            | Fixed money/items, mutually exclusive choices, XP observations, reputation/unlocks; reward step and effective build/hotfix/date; null for missing facts                  |
| Route attachment        | Compatible source chapter/version/build, insertion anchor, pickup window, ordinary-route overlap, dungeon intention, downstream checkpoints and rejoin                   |
| Personal dungeon plan   | Chosen visits/quests/reward choice, explicit quest-state confirmations, gear/role preferences, travel unlocks, time assumptions and completed visit stages               |

Quest state is `unknown`, `not-started`, `accepted`, `objectives-complete`, `rewarded`, or
`abandoned`; eligibility may also be blocked by a mutually exclusive branch. A browser instruction
checkmark is not proof of a server quest state. In particular, “kill objective done” is not
“prerequisite turned in”. Ask for confirmation where needed and retain unknown states.

For every dependency, record **which state** unlocks the next stage. Follow-ups may unlock later
content without being prerequisites for the current visit. Keep unrelated breadcrumbs optional.
Represent item collection and escort/event synchronization independently of quest IDs. Support a
quest with objectives in multiple dungeons without awarding its one-time reward at each visit.

Each fact gets its own evidence: client, reference, player-observed or reviewed, with source/build/
effective date. A verified item identity must not confer verified XP or a verified pickup location.
Reject self-dependencies, cycles, fake quest IDs and impossible stage order before publishing.

## 4. Attach preparation to the existing route

Use a **sidecar overlay**, not edits to the imported chapter or ordinal renumbering. It contains
our authored preparation/visit/turn-in nodes and references stable source-step anchors. Keep source
progress/bookmarks unchanged. Overlay IDs derive from quest/action/visit/anchor identity, not list
position. Save overlay progress separately, scoped to character and overlay release. On an update,
preserve only explicitly compatible identities; never remap an old ordinal onto a new quest.

For each chosen trip:

1. Resolve the active character's compatible chapter path and actual applicable directives. A union
   of all guide variants is not an itinerary. Unknown class/rate/condition gates remain unresolved.
2. Build the prerequisite closure, including item and state gates. Remove already rewarded work and
   reuse the ordinary route's existing accept/objective/turn-in nodes without double-counting them.
3. Locate eligible pickup windows before the trip: route passage near the actual NPC/object, town
   training/supply stops, flight connections and prerequisite completion checkpoints.
4. Attach “Prepare for [dungeon]” at the cheapest **feasible** window, not necessarily the earliest
   window. Check level, prerequisites, available quest-log space and needed starting items there.
5. Batch several pickups in one hub and charge the shared travel once. If the player already passed
   that hub, compare a return trip, a later window and verified sharing; explain the tradeoff.
6. Before entry, show separate ready, missing prerequisite, starts inside and cannot finish this
   visit groups. Sharing does not bypass level/class/state requirements or provide every start item.
7. Schedule inside objectives in the actual visit path, including extra rooms/events/escort wait.
   A skipped boss, absent summon item, or short wing run cannot earn a full-clear quest reward.
8. Plan the real exit, turn-ins and continuation. XP is earned at the reward hand-in, not at the
   boss kill. Check the level gate again before resuming the retained outdoor route.

Coordinate eligibility requires the correct map/floor/coordinate space. A quest objective POI or
client-inferred boss centroid is not the pickup NPC. Travel estimates must use traversable route
segments, not straight lines across mountains, floors or continents. Reuse the current coordinate
fallback when artwork is absent; retain unknown locations rather than displaying a false marker.

Flight paths, hearth binding/cooldown, mounts, boats and class travel are character state, not free
teleports. Use reviewed segment estimates initially; do not attempt a universal pathfinder first.
Quest-log capacity is a checked runtime/configured value, not an assumed unlimited list. A rejected
pickup or a player choosing “Not now” must not mark a prerequisite rewarded.

## 5. Concrete first attachment candidates

These are **candidate windows**, not unconditionally optimized instructions. Exact anchors and
gates must pass the per-profile lifecycle audit before publication.

| Bundle                     | Attach preparation to                                                                              | Main decision                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thanes                     | Existing 96391/96393 evidence in chapter 116; compatible Dun Morogh/IF passages and training stops | Complete missing lifecycle nodes. A Human/Night Elf return trip is not as cheap as a Dwarf/Gnome already near IF. Separate outdoor pickups and inside starts. |
| Deadmines                  | Westfall chapter 125 for future preparation; existing 166/214 branches in chapters 127/128         | Reuse the Defias route. Compare the missing Toxic Soil chain separately; do not skip a required retained prerequisite while claiming its finale.              |
| Wailing Caverns            | Barrens chapters 151/153; existing follow-ups in 152/154 and actual Ratchet/TB stops               | Reuse Raptor Horns and oasis work already scheduled. Decide whether extra TB travel is still needed for the selected quest bundle.                            |
| Ragefire                   | Compatible starter/capital passages                                                                | Batch local preparation; cost remote city pickups against each race's route rather than treating all Horde characters as starting in Orgrimmar.               |
| Ruins of Lordaeron         | Undead/Tirisfal/UC path or an explicitly costed Horde detour                                       | Author the missing bundle. Keep Alliance item/inside-start branches separate, with different IDs even when titles match.                                      |
| Stockade                   | Existing 391 path in chapter 10 and relevant Duskwood/Redridge/Wetlands passages                   | Reuse the Deadmines unlock if actually rewarded; evaluate 303 → 378 with its remote turn-in as an additional chain.                                           |
| Excavation                 | Compatible Wetlands/Redridge/Ashenvale/Horde preparation windows                                   | Add the missing new quests. Distinguish pre-entry, inside-item starts and follow-ups that need travel out or a later visit.                                   |
| Multi-dungeon class quests | Only compatible class, race, level and route                                                       | Track partial materials across visits. Display the eventual item reward, but do not count it or its XP before the final hand-in.                              |

For Thanes and other bundles, the visit target is the reference default unless selected _required_
quest gates demand later. An optional higher-level class quest should create “go now without it”
versus “delay/return for it” alternatives, not silently delay the entire party's route.

Classic objectives outside an instance are also distinct: the two undead Deadmines mine objectives
can add time before the portal; they are not automatically finished by killing VanCleef. Dungeon
quests sharing a title are identified by ID and faction, never by title matching alone.

## 6. Calculate whether a trip or chain is worth doing

### A. Whole trip, equal-goal comparison

Extend the existing `compareBranches` inputs rather than replacing its tested arithmetic. Build the
activities and checkpoint timeline from the resolved graph. Compare the same remaining leveling
goal, per player, against a feasible outdoor branch for that party and character.

```text
tripMinutes = incremental preparation + travel in + idle recruitment/regrouping
            + clear + extra objectives + recovery + travel out + reward hand-ins

netAddedXP = quest/kill/exploration XP genuinely added
           - that same XP already included in the retained route

catchupMinutes = 60 * max(0, omittedOutdoorXP - netAddedXP) / outdoorXPPerHour
timeSaved = omittedOutdoorMinutes - tripMinutes - catchupMinutes
```

Use consistent activity IDs so shared kills, travel and rewards occur once. Completed and already
planned one-time quests add no new reward. A changed reward replaces its old baseline amount; it
does not add the full reward on top. Include prerequisite XP/time only if that work is additional.

Validate **every** checkpoint: pickup level, completed/accepted gate, travel unlock, entry, key/event,
hand-in and rejoin. Later XP cannot fix an impossible earlier pickup. Catch-up earned before entry
has its own time/XP node; do not place it after the run while claiming entry was possible.

### B. Marginal quest bundle when the dungeon is already happening

Let X be the additional per-player XP from the selected _bundle_, T its extra minutes beyond the
retained route/dungeon, and R the achievable outdoor XP/hour. Then:

```text
XP-equivalent net gain = X - R * T / 60
break-even extra minutes = 60 * X / R
```

This is a useful explanatory threshold, not permission to change level gates. If R is unknown,
do not invent it; request an estimate or present the break-even formula/range. If R is zero, only
compare actual times to a feasible explicit alternative. A smaller quest may be cheap jointly with
another quest but expensive alone: score bundles sharing travel, not isolated quest rows.

**Illustrative inputs only; these are not current in-game quest rewards:**

| Already-planned dungeon, R = 20,000 XP/hour             | Additional XP | Extra time | XP-equivalent gain | XP-only decision |
| ------------------------------------------------------- | ------------: | ---------: | -----------------: | ---------------- |
| Nearby pickup + retained boss objective + local turn-in |         4,000 |      4 min |             +2,667 | Worth adding     |
| Entire remote chain, including its own XP               |         9,000 |     40 min |             −4,333 | Not for speed    |
| Same chain with earlier work already retained           |         3,000 |      6 min |             +1,000 | Worth adding     |

Do not reuse the entire-chain XP in the last scenario: prior work is no longer additional. At that
rate, an extra 10-minute objective/escort needs over 3,333 additional XP to improve XP-only speed.

**Reference-only calculations using real chains.** The installed addon's offline base/fallback
values give the following sums. They are not current Forever server rewards; the 20,000 XP/hour
outdoor rate is also an assumed scenario. Use these to verify the accounting, never as live rankings.

| Already-planned dungeon                                                       |                         Reference-only extra XP | Break-even extra time at the assumed rate |
| ----------------------------------------------------------------------------- | ----------------------------------------------: | ----------------------------------------: |
| WC 870 → 877 → 880 → 1489 → 1490 → 914, all work genuinely additional         | 680 + 1,150 + 1,150 + 290 + 115 + 2,200 = 5,585 |                                16.755 min |
| Same WC visit, ordinary route already retains the first five quests           |                           Only final 914: 2,200 |                                   6.6 min |
| DM 65 → 132 → 135 → 141 → 142 → 155, then finales 166 and 214, if both unlock |                   6,100 + 2,600 + 1,250 = 9,950 |                                 29.85 min |
| Same DM visit, ordinary route already retains the six preparation quests      |                           Only 166 + 214: 3,850 |                                 11.55 min |

Thus even in a reference scenario, the extra Thunder Bluff hand-in/pickup itinerary can make or
break a WC chain; batching it with retained travel changes the result. For DM, the two finales
share preparation and combat: do not score them as two independently paid six-quest chains.
If a finale is already included in the baseline dungeon visit, remove its XP **and** unchanged
work from the marginal comparison too. The disputed 214 gate must be resolved before enabling it.
For Toxic Soil, omitted XP entries remain unknown despite addon comments; do not convert missing
92748/92750/92751 observations to zero merely to produce a complete total.

### C. Reward items, money and long-term usefulness

Join reviewed quest reward IDs to the **same product/build** item catalog. Show our existing item
tooltip, equip/weapon/armor restrictions, and the legal choice alternatives. Do not infer a reward
relationship merely because an item exists in the catalog.

- Model guaranteed items separately from choices; the player receives one legal choice, not all
  choices. Keep the selected item consistent throughout that trip's explanation.
- Show upgrade potential relative to an optional current equipped item, role and weapon style.
  The current profile only contains class, so add optional role/gear inputs rather than inventing
  one universal class stat weight. Include weapon DPS, usable weapon skill, off-hand/shield needs,
  caster/healer stats and level restrictions. This is leveling utility, **not** a finished BiS solver.
- Without current gear, use “possible upgrade”, not “+15% damage” or “best reward”. A higher item level
  or rarity alone is not proof of a better leveling item; special effects may be unknown.
- XP, money, gear, reputation and unlocks are different outputs. Do not add gold and arbitrary item
  scores to XP/hour. Speed recommendations use time; chill/item-goal choices expose the tradeoff.
- If an item upgrade plausibly saves future combat time, show an optional sensitivity estimate:
  `future combat minutes × assumed improvement - acquisition opportunity cost`. Label the improvement
  as estimated and bound its useful horizon until the next likely replacement. No exact simulated
  class gain without evidence. Do not include this estimate in default speed rankings yet.
- Net cash includes fixed money plus items actually sold, minus consumables/transport/repairs or
  required purchased materials. A kept item has no simultaneous vendor income. BoP rewards are not
  AH sales. Guaranteed quest items and speculative boss-drop rewards are separate.
- Reputation/keys/class unlocks may justify a slower trip for a chosen goal. Tag that as “useful
  unlock” or “gear detour”, not falsely as the fastest path to 60. Raid attunement chains do not earn
  an automatic leveling endorsement just because they are important later.

### D. Uncertainty and group behavior

Keep low/typical/high time scenarios with explicit source: player estimate versus measured run.
Estimate full-party item collection and escort readiness; use the party's critical path, not one
fast member's completion time. Productive outdoor questing while forming a group is not idle wait.
Five ready players remove recruitment, not travel, failures, quest pickups or reward hand-ins.

Do not multiply quest XP or efficiency by five. Dungeon kill XP depends on the real party and
level differences; never assume the solo value divided by five or an unevidenced universal bonus.
Compare a premade's dungeon to its feasible outdoor group alternative, not automatically to a
solo benchmark. Rested/other XP effects apply only to the activities they actually affect.

Recommend for speed only when the plan is feasible and the conservative calculation stays positive.
If plausible scenarios disagree, label it conditional and show the break-even wait/clear time.
If essential XP, gates or travel evidence is missing, show “comparison incomplete” with the missing
fields. Unknown drop probabilities and quest-start items cannot produce guaranteed completion.

## 7. Player experience in the current map/list reader

- Dashboard: an optional “Dungeon opportunities” section below brackets, with full dungeon names,
  target level, preparations already covered, remaining gates and potential rewards. Not a new wizard.
- Setup/profile: retain Speed, Chill and Group; let players choose a dungeon intention and optional
  gear/unlock goal. Duo and five-not-ready remain distinct from a ready tank/healer party.
- Ordinary quest list: compact “Prepare for [dungeon]” cards at reviewed route anchors. Explain
  “already on your path”, extra detour, chain stage and why it is recommended or conditional.
- Clicking preparation uses the fixed left map and scrollable right list already deployed. Display
  pickup, objective and turn-in markers with distinct accessible labels; map space/floor is explicit.
- Dungeon panel: Before entry → Inside → Turn-ins → Rejoin. Show a short dependency chain, expandable
  missing stages, quest-log/items/key checklist, total XP range, chosen item and full-trip extra time.
- Controls: “Plan this trip”, “Not now”, “I have this quest”, “Already turned in” and the existing
  Next/Done/Undo. Navigation never confirms quest state. Explicit state changes require undo/support
  for corrections, and do not automatically check a source instruction in another chapter.
- At the dungeon checkpoint, offer “Ready to enter” or “Continue outdoors”. If the group falls apart,
  keep accepted quests and preparations; do not erase progress or strand the player without a rejoin.
- Remote turns can be batched at later compatible hubs, with reward XP deferred until that point.
  If delaying prevents a required checkpoint, explain the immediate-turn-in alternative.
- End of chapter: show preparation carried to the next chapter and source-only continuations.
  Never force a dungeon because a global checkbox was once enabled.

Preview labels can read “6 quests ready · 2 start inside · 1 blocked”. Those counts must be computed
from the graph, not hand-written UI examples. Keep the existing loading/empty/evidence/error states,
keyboard focus, mobile map/list modes and explicit storage failures.

## 8. Complete coverage to 60, without making beta promises

Build a reconciliation inventory of every quest association in the supplied reference, then union
reviewed supplemental additions such as Toxic Soil and the new-dungeon records. Include all wings,
class and profession subguides, item starts, post-run follow-ups and cross-dungeon chains. Missing
entries must be visible in the audit, not silently dropped because they lack route matches.

After the beta bundles, review RFK, each Scarlet wing, Gnomeregan, RFD, Uldaman, Zul'Farrak,
Maraudon, Sunken Temple, BRD sub-runs, each Dire Maul wing, LBRS, Scholomance and each Stratholme side.
Track late-game/raid-sized variants such as UBRS separately: never insert them into a five-player
trip by default. Verify the actual Forever group limit, level cap and access before scheduling.

Each association must be classified: source-present and applicable, authored overlay, starts inside,
needs later visit, intentionally omitted for stated cost/goals, evidence conflict, or unavailable.
Reference-only late content remains browsable but not a current beta recommendation. A zero-row
Dire Maul/wing subsection is not proof that the instance has no quests; follow the individual
quest/class references and mark the coverage incomplete until reconciled.

Above-cap _At level_ minimums cannot be met in the current beta even when the instance is open.
Keep these as future references; do not offer earlier premade experiments. Preserve the owner's
strict At-level scheduling policy and review Forever's changed difficulty separately rather than
treating Classic labels as current measured combat difficulty.

## 9. Implementation order and release gates

1. **Evidence inventory and normalized graph.** Add a reproducible audit in `packages/leveling`.
   Emit per-association lifecycle coverage, conflicts, restrictions, real IDs, gate states and
   route attachments. Reconcile all reference quests; publish no confident optimizer yet.
2. **Useful preparation overlay.** First Thanes + Deadmines and RFC + WC, then the missing Ruins and
   Excavation bundles. Add inline pickups/chains, carried preparation, inside-start reminders and
   explicit turn-ins/rejoin. Player-chosen plans can work even while reward math is incomplete.
3. **Reward joins and honest comparison.** Add fixed/choice item joins, quest XP observations and
   reviewed travel estimates. Extend `compareBranches` with graph-generated activities/checkpoints;
   add marginal bundle comparison and range/explanation outputs. Default rankings need valid facts.
4. **Runtime validation and remaining content.** Observe gates/turn-ins/curve/run times on the
   playable range. Expand reviewed lifecycle coverage to 60 without labeling unavailable content
   playtested. Add optional item-utility estimates after role/gear inputs and tests exist.
5. **Feedback loop.** Let existing private step reports identify bad pickups/gates/markers. Maintainer
   review changes source facts only after corroboration; republish a checksummed overlay release and
   show the corrected version. Reports are not automatically verified quest evidence.

Keep most graph/estimate logic pure and typed in `packages/leveling`; catalog/world adapters remain
at the boundary. Reuse existing artifact manifests and reviewed publication conventions. Load only
the active chapter/nearby dungeon bundle; avoid a global 1–60 graph or every item tooltip in each
browser render. No .NET rewrite, new auth service, payment change or market schema change is needed.

For observations, extend the existing opt-in guide observer in a separate implementation task:
capture pre-hand-in level/current XP, reward preview, actual awarded XP, fixed/choice items, money,
modifiers, build/hotfix/date and gate/state evidence with bounded storage. Do not infer pre-turn-in
level from a post-level-up event. Missing/secret API values stay unknown; no secure UI automation.
An authenticated upload/import path and field validation are required before server publication.

## 10. Acceptance tests before enabling recommendations

- Every referenced association accounted for, with no invented quest IDs, unresolved self-cycles,
  duplicate one-time rewards or accidental promotion of catalog-only content.
- AND/OR gates, accepted-versus-rewarded gates, optional breadcrumbs, exclusive branches, quest
  items, class/race/profession restrictions and unknown/abandoned states behave correctly.
- Thanes level conflict remains visible; Toxic Soil 92819 is not a predecessor of 92753; punch-card
  placeholders never link to Wowhead as quests; a Paladin reward is not awarded on every dungeon leg.
- Selected profile/variant sees the right preparation. A quest found only in another faction/class
  chapter does not count as covered. Instance objectives outside the portal get their own timing.
- Shared hubs/objectives counted once; retained prerequisites are not recharged; completed rewards
  excluded; XP only at the real hand-in. A positive final total cannot repair a blocked earlier gate.
- Choice rewards are not summed; kept items are not also sold; missing XP/vendor values are not zero;
  BoP items never get AH revenue; unverifiable gear gains never become exact speed claims.
- Solo, duo, five recruiting and five ready differ correctly. Group XP is per player; item/escort
  completion accounts for everyone. Missing keys, optional bosses and group failure retain a safe
  outdoor fallback. All sub-run requirements are checked against the actual visit variant.
- Unknown times/rewards, zero rates, stale build/hotfix, level cap, partial chains, repeat visits and
  a player declining an expensive pickup have honest output and cannot enable an invalid branch.
- Changing a trip preserves source progress/bookmarks and private backups. Next/Done/Undo continue
  from the selected source/overlay step; cross-chapter preparation is scoped to the correct character.
- Browser checks cover desktop/mobile, fixed-map/list scroll, keyboard/screen reader, stable markers,
  missing artwork, deep-link rejoin, denied storage and source/overlay release changes.

First release criterion: correct preparation and state transitions for the first two faction bundles,
not a claim that every dungeon is faster. The central promise is **no missed useful pickup and no
hidden chain/travel cost**, with explicit uncertainty when the facts do not justify a winner.
