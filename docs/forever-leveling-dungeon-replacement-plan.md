# Full-catalog dungeon alternatives for the chapter path

Analysis and implementation plan, 2026-10-05. Planning only: this document does not enable any new
dungeon replacement. Hall of Thanes / Darkshore 15–16 remains the only implemented replacement.
This supersedes a Thanes-only rollout, not the existing source, progress or safety contracts.

Implementation follow-up: the source importer, complete chapter options, strict At-level scheduling,
v2 persistence and generic source-preserving trip reader are now implemented locally. The audited
baseline below is the **pre-expansion** inventory, not today's artifact counts. See
[the implementation and remaining adapter work](forever-leveling-dungeon-expansion.md).
Only Thanes is still an authored zone/XP-segment replacement; generic trips do not auto-skip zones.

Product follow-up: the user rejected equal-weight dungeon discovery cards in favor of real
Thanes-style alternative itineraries. The [route-choice plan](forever-leveling-dungeon-route-choice-plan.md)
supersedes the primary-card UX below, audits current DM/Ruins/WC bundles and prioritizes an authored
Deadmines replacement using the existing imported route. No new replacement is implemented by that plan.

## Outcome

Every relevant outdoor chapter should expose its applicable dungeon alternatives in the full
1–60 path. Each alternative explains its quest bundle, prerequisite work, XP coverage, whole-trip
time assumptions and exact return point. A dungeon can replace a reviewed part of a chapter;
it must not claim to replace a multi-level zone merely because its entry level overlaps that zone.

The player can see all applicable alternatives, not just a hidden reference-library checklist.
Incomplete candidates remain visibly explorable, with specific missing inputs. They are never
ranked as profitable XP detours or made selectable as a safe replacement without a reviewed rejoin.

**User scheduling rule: At level is a strict floor, not just a default.** Never offer an earlier
run, including to a prepared five-player group. Pickup and confirmed access requirements may move
the trip later. Preparations can appear earlier; they must not invite the player to enter early.
This overrides earlier suggestions to compare a lower/hard-level group entry.

```text
scheduledVisitLevel = max(sourceAtLevel, selectedBundlePickupLevel, confirmedAccessMinimum)
```

An unknown At-level value blocks an actionable schedule. If the resulting level is beyond the
current playable cap, show a future reference, not a lower-level substitute run.

## Audited baseline and concrete gaps

Read the actual exported catalog, validated all 157 authorized chapter files with the existing
dungeon audit, and compared the current source headings on 2026-10-05:

- `DUNGEON_VISITS`: **32 visit entries**, including wings, multi-wing and subrun variants. This is
  not 32 distinct dungeon locations. Seventeen entries carry the catalog's beta availability flag;
  that flag alone says nothing about whether their listed visit level is below the current cap.
- `DUNGEON_REFERENCE`: **216 associations / 212 unique quest IDs**. The supplemental export has
  **94 associations / 92 IDs**. These overlap and must not be added as distinct quests.
- `DUNGEON_QUESTS`: **259 records**, including prerequisite quests. **118** have reference XP;
  **128** lack reviewed pickup/objective lifecycle stages. None of the 259 records currently has
  build/context-pinned, runtime-confirmed reward XP in this planner.
- Existing `compareDungeonPlan`, compatibility, prerequisite closure, preparation attachments and
  reference-library UI are reusable. `THANES_REPLACEMENT`, its reader, return requirements and
  saved-state validation still assume a single specific replacement.
- The client XP curve is now wired through 60 and was checked against every row of the pinned
  `xp.txt` extraction. This supplies level requirements, not per-quest rewards or encounter XP.

Current evidence distinguishes dungeon access, recommended visit level and quest pickup minimum.
Blizzard's October 1 notes cap the beta at 30 and explicitly open RFD at 25+ and Uldaman at 30+.
The same notes change the dungeon XP bonus; the October 2 Crest example is not a timeless reward
rule. Record the effective patch and observation context before extending its estimate.
[Blizzard beta notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-1/2360696/4).

### Fix the source importer before claiming completeness

`scripts/import-leveling-dungeon-reference.mjs` only accepts an H2 ending exactly in
`Dungeon Quests`. The source's UBRS heading ends with an additional numeric suffix, so all its
quest rows are silently skipped. The current catalog therefore gives UBRS **zero quests**, not
evidence that it has none. Six primary row IDs were verified in the page's identity metadata:
**4768, 4974, 6602, 4764, 5102, 6502**. Breadcrumbs and prerequisites are additional records.
[Current reference](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).

Implementation requirements:

1. Parse headings through a reviewed normalization/alias map; handle suffixes and repeated spaces
   without executing the embedded source JavaScript. Add the corresponding UBRS visit alias.
2. Assert coverage per section and wing, not only the current global `records.length >= 150` test.
   Unknown headings, missing known sections, skipped quest rows and incompatible metadata are
   review failures. Do not silently discard them or automatically publish upstream changes.
3. Fixture-test the actual suffixed UBRS heading, nested faction/wing sections, duplicate IDs,
   changed headings and missing identity records. Report intentional grouping separately.
4. Regenerate and review the identity/association artifact and its source/date/hash manifest.
   Preserve uncertain restrictions; a blank faction or profession field is not unrestricted.
5. Track one-time vs repeatable/item-conversion quests, profession gates, inside starters,
   required quest-start items, access keys and objective wing scope. The current identity-only
   importer does not preserve enough of these facts for a general replacement engine.

## Every visit in scope

This is a **local catalog audit**, not a playable route or a declaration that every listed quest
is applicable to one character. `Q` is unique quest IDs assigned to that visit, `XP` is IDs with
reference rewards, and `Life` is IDs with known pickup and objective stage categories; neither
column establishes a fully verified chain. Levels are the catalog's source defaults, not hard
entry locks. The candidate windows below are planning/search windows requiring a reviewed source
segment, travel analysis and compatible faction/class/quest state before publication.

UBRS is a specific source/catalog discrepancy: the linked current guide gives At level 60, but the
local visit currently has no reviewed level/group-size data. Its planned floor is 60 once the
import is repaired; unresolved access/group size still prevents a runnable recommendation.

| Visit ID / dungeon                       | Source level |   Q |  XP | Life | Candidate and specific review work                                                                                                       |
| ---------------------------------------- | -----------: | --: | --: | ---: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ragefire` — Ragefire Chasm              |           14 |   6 |   6 |    6 | Horde 14→15 within Barrens; audit inside starter and prerequisite pickup anchors.                                                        |
| `thanes` — Hall of Thanes                |           14 |   5 |   5 |    5 | Existing Alliance 15→16 branch. Separate two-quest level-14 bundle and Treaty at 16; assess Horde travel independently.                  |
| `wailing-caverns` — Wailing Caverns      |           19 |   7 |   7 |    7 | Horde 19→20 within the Barrens/Stonetalon route; Alliance requires a separate travel decision. Shared chains and boss-drop stage.        |
| `deadmines` — Deadmines                  |           19 |   9 |   8 |    9 | Alliance 19→20 Redridge/eligible Darkshore variant; prepare in Westfall earlier. Separate final class rewards and later Stockades chain. |
| `lordaeron` — Ruins of Lordaeron         |           19 |  10 |  10 |   10 | Horde 19→20 first; separate Alliance bundle and continent travel. Inside starts are not pre-entry pickups.                               |
| `shadowfang` — Shadowfang Keep           |           23 |   6 |   5 |    6 | Horde 23→24 Hillsbrad; class objectives are separate, not an Alliance warrior XP bundle.                                                 |
| `blackfathom` — Blackfathom Deeps        |           25 |  15 |  13 |   14 | 25→26 inside eligible outdoor bracket. Score continent travel; preserve outdoor→inside handoff and class multi-dungeon work.             |
| `stockade` — Stockades                   |           26 |   6 |   6 |    6 | Alliance 26→27 within Duskwood/Redridge. Stage remote pickups while passing; preserve Deadmines prerequisite.                            |
| `excavation` — Excavation Site: Wetlands |           29 |  12 |  12 |   12 | 29→30 source segment. Separate faction bundles, uncertain prerequisite and post-run relic hand-ins.                                      |
| `gnomeregan` — Gnomeregan                |           33 |  13 |  10 |   13 | Future 33→34 only; beta access does not permit an earlier recommendation. Distinguish entrance/key, teleport and repeat visit stages.    |
| `razorfen-kraul` — Razorfen Kraul        |           31 |   7 |   7 |    7 | 31→32 future branch; no early-entry option. Preserve later cross-dungeon follow-ups.                                                     |
| `sm-graveyard` — SM Graveyard            |           37 |   2 |   2 |    2 | Future 37→38 candidate; never attach all-wings rewards to a Graveyard clear.                                                             |
| `sm-library` — SM Library                |           37 |   4 |   0 |    0 | Future 37→38; lifecycle/reward enrichment first. Preserve race and class restrictions.                                                   |
| `sm-all-wings` — SM multi-wing           |           37 |   2 |   0 |    0 | Separate multi-wing itinerary with cumulative boss objectives and shared rewards once.                                                   |
| `sm-armory` — SM Armory                  |           37 |   0 |   0 |    0 | Scope all-wings objectives to this wing; zero standalone assigned IDs is not no quest relevance. Access gate.                            |
| `sm-cathedral` — SM Cathedral            |           37 |   0 |   0 |    0 | Same scope distinction; finish composite quests only after their complete objective set.                                                 |
| `razorfen-downs` — Razorfen Downs        |           39 |   6 |   0 |    0 | Future 39→40; beta access 25+ does not lower the At-level floor or quest gates.                                                          |
| `uldaman` — Uldaman                      |           42 |  14 |   0 |    0 | Future 42→43 near Badlands route. Beta access 30+ does not lower quest gates or raise the level cap.                                     |
| `dalaran` — City of Dalaran              |      Unknown |   5 |   5 |    5 | Reference-only until availability and visit band are reviewed. No inferred bracket from quest minimums.                                  |
| `zul-farrak` — Zul'Farrak                |           44 |   8 |   0 |    0 | Future 44→45 segment, not all of Feralas 44–48. Separate summon/access work from core clear.                                             |
| `maraudon` — Maraudon                    |           46 |  11 |   0 |    0 | Future 46→47; split wings, objective reachability and shortcut/access itineraries.                                                       |
| `sunken-temple` — Sunken Temple          |           51 |   9 |   0 |    0 | Future 51→52; long preparation chains, boss summons and class objectives need review.                                                    |
| `brd-prison` — BRD Prison                |           55 |   0 |   0 |    0 | Derive a real prison subrun from scoped BRD objectives, not all Emperor rewards.                                                         |
| `brd-emperor` — BRD Emperor              |           55 |  24 |   0 |    0 | Future 55→56; separate prison/arena/forge/full-clear work, keys, attunement and profession restrictions.                                 |
| `dire-maul-east` — Dire Maul East        |           56 |   5 |   0 |    0 | Future 56→57; stage cross-wing dependencies and optional summoning separately.                                                           |
| `dire-maul-west` — Dire Maul West        |           60 |   2 |   0 |    0 | Endgame/gear-first at 60; not a pre-60 trip or 60→61 leveling alternative.                                                               |
| `dire-maul-north` — Dire Maul North      |           60 |   6 |   0 |    0 | Endgame/gear-first; normal vs alternative clear scope and item requirements.                                                             |
| `lower-blackrock` — LBRS                 |           60 |  12 |   0 |    0 | Gear/attunement at 60; connect later UBRS prerequisites explicitly.                                                                      |
| `upper-blackrock` — UBRS                 |      Unknown |   0 |   0 |    0 | Importer gap: six source row IDs identified above. Verify group size/access; do not default to five players.                             |
| `scholomance` — Scholomance              |           60 |  10 |   0 |    0 | Endgame at 60; unlock and multi-visit chain review.                                                                                      |
| `stratholme-live` — Stratholme Living    |           60 |   6 |   0 |    0 | Endgame at 60; separate wing and cross-wing progression.                                                                                 |
| `stratholme-undead` — Stratholme Undead  |           60 |   8 |   0 |    0 | Endgame at 60; timed/summon/quest-state gates and cross-instance prerequisites.                                                          |

Do not force every dungeon into a leveling replacement. A level-60 At-level target belongs in
an endgame/gear/attunement lane, not a pre-60 leveling run. Only a reviewed change to the source
At-level recommendation can alter that scheduling floor; group readiness cannot.
Reference-only entries can be shown in the full tree with clear future-state labels.

## Generic replacement engine, not 31 more hardcoded components

### Reviewed definitions

Introduce a versioned `DungeonReplacementDefinition` next to the existing dungeon domain model:

- Stable replacement ID, visit/scope ID, client build, definition release and evidence status.
- Faction/race/class/profession predicates; party-size/access policy and availability evidence.
- Exact outdoor chapter ID, source version/hash, retained prefix, candidate omitted step IDs,
  required bridge steps, actual rejoin chapter/step and XP checkpoint (level plus within-level XP).
- Required and optional quest bundles; stage requirements for pickup, objective and hand-in.
- Scope membership for wing bosses/items, prerequisite DAG, access/summon items and cross-visit edges.
- Reward references/calibration policy and exclusion reasons. Missing information remains unknown.

Author a small reviewed segment adapter for each meaningful route connection. The renderer, XP/time
comparison, durable plan, preparation stages and return checks are shared. Metadata level overlap
discovers **candidates**; it does not author their rejoin or prove that omitted quests are dispensable.

Reuse `chapterEligibility`, `getGuideStepView`, `dungeonQuestCompatibility`,
`dungeonPrerequisiteClosure`, `attachDungeonPreparation`, `compareBranches` and `compareDungeonPlan`.
Keep ordinary quest order and IDs unchanged. Derive bridge requirements from the selected source
variant in chronological order; never satisfy an earlier hand-in with a later acceptance. Include
dependencies beyond the immediately next chapter when a reviewed later chain relies on skipped work.

### Candidate selection and XP coverage

1. Filter for actual faction/race/class/profession, build, dungeon availability and party/access
   requirements. Unknown restrictions stay visible as review candidates, not selectable recommendations.
2. Use the source's At-level value as a strict scheduling minimum. Raise it for selected pickup
   and confirmed access requirements. No earlier-entry option, even for a prepared group; party
   size cannot lower the floor or override a quest gate, hard entry lock or beta cap. Unknown
   At-level or a scheduled level above the playable cap stays reference-only.
3. Index every possible pickup/chain step along eligible source paths. Prefer an existing accept;
   otherwise attach a reviewed map-space proximity candidate with travel and confirmation. Distinguish
   missing location, world-space coordinates and implicit text instructions from actionable map anchors.
4. Enumerate reviewed source checkpoints near that level. Try a whole chapter only when its full
   interval and dependencies are covered; otherwise compare a reviewed partial segment and retain
   the remainder. Same-level chapters need explicit start/end XP checkpoints or observed reward data.
5. Calculate required XP using actual level/current XP and the pinned curve. Sum only eligible,
   unfinished rewards that can actually be handed in by that checkpoint; include kills/exploration
   only when supplied as explicit per-player estimates or observations.
6. Explain full coverage, shortfall/catch-up, prerequisite blocks and evidence gaps. Preserve source
   bridge work even when XP alone covers the checkpoint. An estimate never updates earned XP.
7. Mark a selected replacement independently of source completion. Return is unlocked by the
   player's reported actual progress and reviewed dependencies, not forecast rewards or instruction Done.

### Reward and time rules

The existing Crest-based ratio `6200 / 2600 ≈ 2.384615` is a **single calibrated scenario**. Extend it
only to compatible dungeon reward references, with the patch/quest/level context disclosed. Do not
multiply outdoor prerequisites, gear rewards or kills by it; do not apply another half/party/global
bonus on top of an already-contextual observed reward. Overleveled reward reduction needs its own
verified function; until then preserve the existing unknown result outside the supported band.
Use build/context-pinned observations in preference to estimates, retaining provenance.

Deduplicate rewards by quest ID and one-time completion, not dungeon association. A class quest
spanning DM/SFK/BFD pays at its final hand-in once, not in every dungeon. Inside starts do not appear
in the before-entry count. Later rewards cannot unlock an earlier pickup gate. Repeatable conversions,
attunements, escorts, optional summons and post-run chains need their own scope/stage rules.

For each candidate, compare the **same start state and same return checkpoint**:

```text
tripTime = remainingPreparation + recruitment + outboundTravel + clear
           + objectiveDetours + handIns + returnTravel + retainedBridge + catchUp
catchUpXP = max(0, XPRequiredAtReturn - eligibleRewardsEarnedByReturn)
catchUpTime = catchUpXP / attainableOutdoorXPPerHour
savedTime = outdoorTimeToSameCheckpoint - tripTime
```

Use low/high user-entered or observed intervals; shared segments have stable IDs and are charged
once. Rewards from retained preparation count toward the checkpoint once, but are not also
incremental replacement rewards. Do not sum overlapping chapters, alternative paths or shared
chains. Unknown omitted outdoor reward/kill XP or timing prevents a definitive speed ranking.

Separate the marginal decision: **already doing this dungeon** means evaluate an extra quest's
additional preparation/objective/hand-in work, not charge the entire clear again. Do not use that
cheap marginal score to recommend the whole trip. Group-ready can mean zero recruitment when
actually confirmed; travel, turn-ins, combat and per-player XP still count. Solo/recruiting keeps
real recruitment/wait assumptions. Never manufacture an observed dungeon duration.

## Chapter-tree UX

- Add a compact **Dungeon alternatives (N)** branch under each reviewed source segment. Show all
  eligible options, sorted by actionable status and conservative same-goal gain; incomplete or
  future candidates form a labeled reference section, not hidden nonexistence.
- Each compact card shows dungeon/wing, planned visit level, applicable one-time quests, before-entry
  pickups vs inside starts, known/estimated XP and reward coverage, target XP and shortfall, whole-trip
  time range, prerequisite effort and exact rejoin. Group-ready vs recruitment remains explicit.
- Offer separate **Best for XP**, **Going with friends** and **Gear / quest goals** explanations.
  Gear/attunement value is not invented XP and does not masquerade as a speed recommendation.
- **Review preparation** is always available for reference candidates. **Compare trip** requires
  appropriate inputs; **Use dungeon route** requires reviewed eligibility/lifecycle/rejoin and
  sufficient conservative checkpoint coverage. Unknown timings allow an explained player choice
  only when route safety is established, never a claim that it is faster.
- Reuse the fixed-map reader with preparation → travel → scoped clear → rewards → retained bridge
  → actual-progress check → exact rejoin. A cross-dungeon chain has multiple linked visit stages,
  not a duplicated one-run checklist. Next, Done, Undo and explicit quest state remain separate.
- Choosing a dungeon keeps the outdoor bookmark. Switching dungeon or returning to questing requires
  an explicit reversible action; no source steps are silently marked completed or removed.

## Saved-state migration and implementation order

The current validator only permits the Thanes chapter ID and seven fixed stage IDs. Merely
adding more cards will produce invalid backups/saves. Before rendering new runnable replacements:

1. Add schema-tested definitions and a generic replacement plan keyed by replacement/segment ID.
   Separate an active segment choice from stored plans so alternatives sharing a chapter do not
   overwrite one another. Include definition/source/build versions and exact rejoin provenance.
2. Introduce the next dungeon release and explicitly migrate the existing Thanes state, original
   forecast, stale-XP flag, carryovers and stage bookmark. Preserve v1/old source progress in backups;
   never reinterpret an old plan using different source IDs. Changed evidence requires review.
3. Refactor the existing Thanes component to use the shared definition/renderer first. Its current
   regression tests must continue passing before adding another runnable branch.
4. Publish the complete reference inventory and fix UBRS/section coverage. Enrich life cycles and
   candidate adapters in batches, not just the single highest-scoring bundle.
5. First runnable batch: RFC, WC, Deadmines, Lordaeron, SFK and Stockades alongside Thanes. These
   cover both factions and exercise chained, inside-start and remote-preparation cases. Provide
   explanations, not invented timings or automatic speed rankings.
6. Next: BFD and Excavation, then prepare Gnomeregan's multi-visit/teleport branches, RFK and scoped
   SM variants for their At-level floors. Finish RFD/Uldaman lifecycle data separately from access;
   do not enable these above-cap schedules until the playable cap permits them.
7. Enrich all later visits concurrently as reference plans, then promote ZF/Mara/ST, BRD subruns,
   Dire Maul and level-60/attunement chains when release availability and data support them.

No database migration is inherently needed for the first browser-local schema release. Addon
observations remain bounded, opt-in `KFCForeverGuides` work; do not re-enable broad quest/NPC scans
in the market collector. This plan does not authorize addon or production changes.

## Acceptance and feedback loop

- Importer: every source section/wing accounted for, suffixed UBRS parsed, new or missing sections
  fail review; associations reconciled against the source, not just internal visit membership.
- Domain: required/rewarded vs accepted-only prerequisites, alternate chains, faction/race/class/
  profession, strict At-level scheduling for solo and premade groups, later pickup requirements,
  unknown At-level and beta cap, access keys, one-time/repeatable, wing and multi-visit
  scope, shareability/item-start/escort states, no missing XP converted to zero.
- Comparisons: same checkpoint, per-player kills, shared chains/travel once, no duplicate retained
  rewards, optional exclusions, zero-recruitment only for confirmed groups, conservative catch-up,
  level-60 no-next-level cases and uncertain/changed calibration.
- Routes: preparation before entry, actual level gate, independent source/branch progress, retained
  later dependencies, explicit alternatives and safe switching/rejoin for every race/class variant.
- Persistence: v1 Thanes migration, multiple competing plans per segment, reload/backup/undo, old
  source releases, invalid plans, denied storage and changing definitions.
- Browser: desktop/mobile tree, two competing dungeon choices, badges and count/XP coverage,
  map anchors, keyboard/focus, fixed map, actionable incomplete states, exact continuation anchors
  and no source ticks or quest rewards inferred by generic Done.
- Observe planned vs actual quest XP, trip segments, recruitment and return progress with explicit
  player confirmation. Recalibrate by build, completion level and party context; compare against
  outdoor baselines. Promote only reviewed evidence, not an automatic global multiplier update.

The success criterion is coverage plus trustworthy recommendations: every dungeon is accounted
for, but no unsafe or unmeasured trip is advertised as a proven full-zone replacement.
