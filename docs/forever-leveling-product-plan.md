# WoW Forever leveling: browser guide, RestedXP edition and implementation plan

## Current completion plan: guaranteed new-dungeon quest bundles (October 19, 2026)

Quest collection is now complete for the queued identified content: 353 captured pages plus the
reviewed unavailable page 3343, all 83 route-evidence pages, and published-format Forever rewards for
all 1,161 real hand-in IDs in the local matrix. Historical hand-in fallbacks are now zero. See the
[October 19 completion receipt](forever-leveling-quest-completion-2026-10-19.md) for hashes, source
disagreements, the new review ZIP and remaining in-game/release work. Production is unchanged.

The later [quest-validation consumer receipt](forever-leveling-quest-validation-consumer.md) covers
the implemented private-observation→audit→public-coverage→browser path, party identity settings,
current review.3 ZIP, 311 leveling/586 web tests and unchanged real-evidence gates. Static source
differences still need explicit review; no real observations or production release are implied.
The final source report has all 83 pages, 66 source-ready rows, 14 conflicts and three manual-review
rows. Source pickup parsing and bounded starter-item origins are covered by 19 world-data and 22
pipeline tests; no new page requests were needed.

This is the current implementation contract. It supersedes the October 15 description of missing
new-dungeon quest counts as optional parity scenarios. The October 18 receipt below records its
then-tested software; the October 19 receipt covers the later bundle implementation. Neither
receipt establishes that the full Horde campaign is implemented.

The guaranteed-bundle work below is now implemented locally: four selected slots per faction for
the three unidentified dungeons, Lordaeron's fourth real quest selected, editable planning levels,
slot/dungeon exclusions, continuous estimated XP, and explicit planning-only browser/addon notes.
The full Horde campaign remains separate work. See the current
[implementation and verification receipt](forever-leveling-guaranteed-bundles.md).

### Confirmed product input and remaining unknowns

The owner confirms four quests per faction for each applicable newly introduced Forever dungeon.
Treat that bundle count as a fixed, owner-confirmed planning input, not as a probability that the
quests might exist. Preserve that provenance; do not present it as independently collected source
data or measured rewards. Missing IDs must not exclude these dungeons from the planning route.

| Information                            | Planning treatment                                                  | Evidence still needed                                                   |
| -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Four quests per faction                | Guaranteed bundle input supplied by the owner                       | Independently sourced identities when available                         |
| Known quest IDs and restrictions       | Retain all real quests and evaluate each member's eligibility       | Resolve source/build conflicts rather than erase restrictions           |
| Missing quest IDs                      | Stable internal bundle slots, not fabricated game IDs               | Map slots to real quests without counting both                          |
| Uncollected reward amounts             | Level-appropriate unscaled reference base XP × 2.375, once          | Replace with compatible collected or observed final rewards             |
| Planning quest level                   | Explicit dungeon setting, e.g. the owner's Dalaran level-33 example | Keep separate from entry level, pickup minimum and actual hand-in level |
| Pickups, objectives, access and travel | Retain known instructions; mark unidentified details pending        | Real source details before emitting exact executable steps              |

Four Alliance and four Horde slots are alternative faction bundles, not eight rewards for one
player. They are quest counts, not four guaranteed levels or four independently verified payouts.
Known extra quests remain in the catalog; four is not a cap that deletes real content.
Select the complete four-quest bundle by default when offering the dungeon. Players may skip
quests or the dungeon; a default recommendation is not permission to report unearned rewards.

Real quest-ID arrays for Drowned City, Krol'dok and Alcaz Prison remain empty by design until the
IDs are identified. Their separate guaranteed bundles now contain four selected slots per faction
and are included as planning-only dungeon legs in the Alliance campaign. No fake numeric IDs are
inserted into the quest catalog. Both faction bundle models are implemented; the full executable
campaign compiler still covers Alliance, not Horde.

### Concrete sourced anchor: City of Dalaran

The owner supplied the [City of Dalaran quest listing](https://www.wowhead.com/forever/zone=16544/city-of-dalaran)
as the concrete four-quest example. The eight existing local Wowhead XP captures from October 18
also pass the quest-XP record schema and agree on quest level 33, reference base XP 3,950, page
multiplier 2.375 and final full reward 9,400 per quest:

| Faction  | Real quest IDs             | Full bundle quest XP per eligible character |
| -------- | -------------------------- | ------------------------------------------- |
| Alliance | 92456, 92489, 92457, 92458 | 4 × 9,400 = 37,600                          |
| Horde    | 96984, 96987, 96988, 96986 | 4 × 9,400 = 37,600                          |

These are real identified quests, not unidentified bundle slots. Their final 9,400 values must
take precedence over a recomputed estimate; do not multiply them by 2.375 again. The captured
level-specific rewards still determine the result at other hand-in levels. Quest level 33 must
not be promoted to a minimum pickup level or mandatory dungeon entry level.

The Alliance itinerary now selects all four quests by default, including Starving Arcane 92457,
so its full-bundle forecast includes 37,600 quest XP before hand-in-level reductions. Dungeon
visits and individual quest execution remain player choices: use Next without Done or navigate to
another chapter to leave work unfinished rather than falsely recording it as complete. The guide
must not require another clear merely because an objective remains unfinished. These navigation
choices do not award rewards, update actual XP or satisfy access/prerequisite checks.

The earlier three-quest subtotal of 28,200 is not the default Dalaran bundle. Keep all four quests
in the default campaign/export, while detailed saved trip selections remain explicit player choices.
Forecast rewards describe the chosen plan, not already earned XP; use actual party bars after the
player skips work. Do not infer that quest availability guarantees all objectives in one clear.

Use this as the regression anchor for exact-four faction accounting, real-ID replacement,
selected-versus-full totals and prevention of double scaling. Other dungeon levels must use their
own level-appropriate base rewards; Dalaran's absolute 37,600 is not a universal dungeon total.
The live page required JavaScript verification during this check, so the numeric validation here
uses the existing saved captures rather than claiming a fresh independent live-page extraction.

Local implementation receipt: all four Dalaran quests and all four Lordaeron quests are in the
default premade selection and compiled campaign lifecycle; Thanes' fifth known quest is retained.
The three unidentified dungeons each have four default-selected planning slots per faction.
Verification includes 292 leveling tests, 577 web tests, package checks, the production web build,
all 28 exact addon editions and desktop/mobile control/persistence checks. This remains local,
not deployed; missing quest details and the other completion tasks below are not declared complete.

### Bundle identity, replacement and persistence

- Introduce a small, schema-validated bundle model alongside the existing dungeon and campaign
  models. Keep it separate from public quest/reference records, whose numeric IDs represent real
  game entities. Suggested owning module: `packages/leveling/src/dungeon-bundles.ts`. Apply the
  guarantee to an explicit inventory of newly introduced dungeons, not every classic dungeon.
- Give each slot a deterministic internal key such as `drowned-city:alliance:quest-1`. Record
  dungeon, faction, configured planning quest level, reference pattern, count provenance and an
  optional real quest mapping. Do not generate fake numeric IDs, Wowhead links or `.accept`,
  `.complete` or `.turnin` commands for unidentified slots.
- Reconcile known quests against the guaranteed bundle. With two mapped core quests, create only
  two remaining unidentified slots, not four additional rewards. Preserve extra and restricted
  real quests separately; a class-only reward cannot silently become a reward for every member.
- Require an explicit reviewed mapping when a real ID replaces a slot. Never match by list order
  or reward similarity alone. One real quest pays once per member, even across prerequisites,
  multiple visits and bundle/catalog representations. Faction alternatives can reference a shared
  real quest without awarding it twice to the same character.
- Preserve slot identity, source revision and replacement history in saved plans. A new evidence
  release must not mark a quest accepted/rewarded, erase completion or reinterpret a player's
  stored progress. Validate legacy saves and provide a versioned migration if the schema changes.

### One XP ledger with explicit reward provenance

Use the compatible collected final reward at the relevant hand-in level first, retaining legitimate
zero-XP rewards and existing identity-conflict checks. If no such reward exists, use a reviewed
unscaled base reference for the real quest; for an unidentified slot, use the selected anchor's
level-dependent base-XP pattern at the configured planning quest level. Apply 2.375 once, retaining
per-quest rounding and applicable hand-in-level reductions. A planning level of 33 is not permission
to accept a quest at 33, evidence of a minimum level, or a replacement for the player's actual bar.
Initialize each unidentified bundle from the owner's selected upper dungeon planning level, such
as Dalaran 33, with a per-dungeon override. Do not silently substitute an entry minimum, maximum
enemy level or a different catalog difficulty band's upper bound for that setting.

Never multiply already-adjusted Wowhead rewards again. Do not apply the dungeon coefficient to
outdoor prerequisites, kill XP or the player level-cost curve. Do not copy the same absolute reward
bundle between dungeon levels. A missing base pattern must produce an actionable configuration
error, not zero XP, arbitrary XP or a claim that the guaranteed quests do not exist.

Carry each member's XP continuously through pickups, dungeon work and hand-ins, awarding quest XP
at the planned hand-in rather than at dungeon entry. Expose the known reward subtotal, estimated
reward subtotal and combined planning endpoint from the same ledger. A resolved real quest replaces
its slot; it is never an extra line of earned XP. Scope consumption and replacement to the correct
character, faction and release.

Keep expected mandatory combat as the owner's natural planning reserve where measurements are
absent. Do not add a fabricated fixed buffer, apply a second combat bonus, or require every grind
checkpoint to be timed before authoring the route. Where compatible explicit combat is available,
count it once; combat already reflected in an actual XP bar cannot be awarded again. Actual party
bars, legal access and known quest restrictions still govern live readiness. Supply a specific
nearby catch-up option only when actual progress is short, without discarding accepted chains or
required future unlocks.

### Implementation tasks and acceptance checks

The status column describes inspected functionality, not estimated completion percentages. Update
it with verification receipts as each task lands.

| Task                                               | Owner                                    | Status                                                                                                  | Completion check                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reconcile the remaining quest queue                | Crawler + engineering review             | Collection and local XP integration complete: 353 captured, 1 reviewed unavailable; all 83 route pages  | All 1,161 real hand-in IDs have available Forever rewards; no historical hand-in fallback; source disagreements stay explicit                          |
| Add guaranteed faction bundle slots                | Engineering                              | Implemented locally                                                                                     | Three unidentified dungeons have four selected stable slots per faction; known extra quests are retained; no fake game IDs                             |
| Unify reward selection and replacement             | Engineering                              | Implemented for guaranteed bundles                                                                      | Actual final XP wins; 2.375 applies only to unscaled estimates; replacement, prior rewards, zero XP and restrictions are tested                        |
| Integrate both faction planning routes             | Engineering                              | Partial: both faction bundles and Alliance itinerary implemented                                        | Alliance includes three planning legs; full Horde campaign compilation and audit remain separate work                                                  |
| Align browser and addon presentation               | Engineering                              | Implemented locally                                                                                     | Editable levels, slot and dungeon exclusions, persistence and labeled estimated XP; 28 addon editions emit no invented directives                      |
| Finish source/observation-to-audit consumption     | Engineering                              | Observation/audit/browser consumer implemented locally; static source disagreements remain under review | Approved proof clears only matching build, quest, release/compiler and covered race/class/party contexts; private observations never reach the browser |
| Rebuild the route matrix and catch-up instructions | Engineering                              | Bundle matrix implemented and audited locally                                                           | 33 editions / 132 scenarios: zero relevant blockers or shortfalls; 18 sourced plus 3 planning-only dungeon stops                                       |
| Run bounded in-game package and context checks     | Owner, with generated test checklist     | Pending                                                                                                 | Install/parser, tracking, reload/resume and specific disputed quest/party behaviours pass                                                              |
| Release and retain rollback                        | Engineering, after release authorization | Pending                                                                                                 | Tests/builds pass; pushed commit, deployed source and data revisions agree; browser/assets and rollback verified                                       |

Quest 3343 was previously classified from the source's explicit not-found redirect; the owner also
confirmed the page is unavailable in the browser. This does not establish that the quest is absent
from the game. If any supported route depends on it, obtain alternative evidence or a reviewed
replacement; do not silently delete it or award guessed XP as a verified fact.

### Verification and finish lines

Add focused tests for four independent slots per faction, partial and complete ID discovery,
known extra quests, class restrictions, duplicate mappings, authoritative zero rewards, exactly-once
scaling, quest-level versus hand-in-level handling, level-60 XP, and persisted-plan migration.
Include integration tests proving that all three formerly empty dungeon bundles contribute to the
planning forecast while unidentified slots remain absent from executable quest directives. Test
the actual-XP checkpoint path, stale build/evidence rejection and replacement without losing saves.

Run package tests, strict typechecks and lint first, then rebuild the full supported browser/addon
matrix and inspect the resulting continuous per-member XP ledgers. Rebuild the existing 33 Alliance
browser editions and 28 exact addon editions; enumerate the implemented Horde matrix explicitly
rather than treating Alliance results as proof for Horde. Check desktop/mobile rendering, save/resume
and matching browser/addon endpoints. Preserve one reproducible report bound to code commit,
source archive, runtime build, bundle configuration and reward/evidence checksums.

The first finish line is a complete **planning guide**: all applicable dungeons included, guaranteed
quest counts respected, known and estimated XP visible, continuous per-member funding calculated,
and actionable instructions for all identified content. Missing IDs do not block that finish line,
but unidentified quest details must remain visibly pending. Do not claim the entire catalog was
fetched merely because the current crawl queue completed.

The second finish line is an **executable guide for the supported content**: real pickup/objective/
hand-in instructions, current access/eligibility checks and a successful bounded addon review. It
can ship with transparently estimated XP and actual-party checkpoints; it cannot claim exact
instructions for unidentified quests or a fully measured optimal 1–60 time.

Keep measured reward/combat/timing certification separate. The pre-bundle backlog had 26 historical
reward estimates, 112 quest-validation task/code pairs and 105 grind-measurement tasks. The new
bundle audit has zero blocking tasks, 147 validation tasks and 106 measurement tasks; it still uses
26 historical route rewards from the frozen published snapshot. The completed-quest audit supersedes
that reward count: zero historical hand-ins, 121 validation tasks and 106 measurement tasks remain.
These are evidence requirements, not blocking bugs or a demand for one recording per task. Batch
tests only when their build and character/party contexts genuinely match. Inaccessible beta
content remains explicitly untested, without holding the planning product hostage to future IDs.

The bundle identity/replacement, reward ledger, route consumers and audit are now implemented and
verified locally. The fresh rewards, source report, 33-edition audit, 28-edition addon matrix and
targeted in-game checklist have now been rebuilt. Next: perform the bounded in-game review and
authorized release, plus explicit review of the remaining static source differences. The observation
consumer is now implemented and tested; actual observations and source approval remain separate.
Do not expand to an unrelated full-archive crawl as
a release prerequisite, and do not claim a deployment until a pushed release is actually activated.

## Verified implementation snapshot (October 18, 2026)

The Alliance five-player route compiler is implemented locally across all 33 supported leader
race/class editions. It consumes the applicable RestedXP backbone, 18 verified dungeon bundles,
published quest rewards, labeled historical fallbacks and explicit actual-party XP checkpoints.
The latest 132-scenario audit has no audience-relevant shortfalls, blockers, missing starts or
unresolved hand-in values. Main source quests, accepted lifecycles, downstream prerequisites and
required dungeon unlocks cannot be discarded by the ahead-of-target optimization.

The full RestedXP review-pack compiler is also implemented. It successfully compiled all 28 exact
Alliance race/class editions into deterministic leader/party chains; the five class-null browser
editions are intentionally not packageable. The current Human/Warrior receipt contains 2,427
actions, 850 distinct hand-ins, 71 leader chapters and 67 party chapters. It is build-gated for
70450 and parser-targeted to RestedXP v4.11.26. See the
[addon review runbook](forever-leveling-addon-review.md). Public download remains blocked on the
bounded in-game install/parser/quest-tracking/reload review, not on another export implementation.

This completes the then-tested software route and safety-gate work described below; it does not
satisfy the separate evidence/playtest gate. Twenty-six scheduled rewards still use labeled historical values,
and the private combat snapshot has no reviewed dungeon population or calibrated kill context.
Every unmeasured gap is represented by a checkpoint that requires fresh actual bars for all five.
The exact counts, hashes and remaining evidence boundary are in the
[whole-route audit](forever-leveling-full-route-audit.md#october-18-five-player-route-compiler-completion).

The level-cost curve was re-extracted from installed client build 70450 and is byte-identical to the
route's build-70205 curve. Reward identities are now bound to the current published client build in
the runtime revision. The authorized guide-source archive itself remains a 70205 artifact; installed
RestedXP `v4.11.26` must be separately diffed and authorized before claiming current-source parity.
Older dated sections below are retained as decision history. The October 19 completion contract
above overrides conflicting scenario/count or implementation-completeness wording in this snapshot.

## Binding correction plan: XP-funded dungeon appointments (October 15, 2026)

Status: this is the historical binding plan that drove the October 18 implementation above. The
compiled route is now implemented, but remains deliberately uncertified until its estimated reward
and combat inputs are replaced or observed. The criteria below remain the publication standard and
must not be weakened merely because the executable guide can continue through actual-bar gates.

### Outcome and non-negotiable acceptance criteria

Deliver faction-specific Alliance and Horde 1–60 routes for a coordinated five-player party,
initially proved for the Human-warrior-led case, then the other supported race/class editions.
The owner expanded the target to both factions on October 15. The route must include
real preparation, kills, travel, objectives and hand-ins. The browser and later RestedXP export
must consume the same compiled route. Do not add another standalone dungeon list.

A route is not complete because it ends with a level-60 instruction. For each of the five members,
every required departure must be funded by **earlier** eligible quest rewards and explicitly modeled
combat, carrying the incoming XP bar forward. Final level 60 must follow from that ledger. Unknown
critical rewards or absent dungeon packages prevent verified-route certification; an explicitly
labeled owner-approved scenario can still be planned as specified below. Arbitrary grind
instructions do not count as a funded route.
Software correctness, reference-budget feasibility, calibrated game rules and playtesting are
separate statuses. Inaccessible future beta content must not be described as playtested.

### Latest implementation: explicit required-kill and dungeon combat XP (October 15)

The automatic combat adapter, solo/group calculator, continuous campaign integration and browser
breakdowns are now implemented locally. Reference coverage is 205 distinct source quest IDs;
there are no calibrated dungeon populations/payouts yet. Unknown values remain unmeasured, not
flat buffer XP. Conditional forecasts can omit unstarted optional filler while retaining required
unlocks and accepted chains; no saved progress is changed. This is not full 1–60 route certification.
Operation, publication boundaries and remaining data work:
[combat-XP implementation](forever-leveling-combat-xp.md). The owner subsequently approved the
web-only [r9 code deployment](forever-leveling-combat-release-2026-10-15.md); private provider data
remains unpublished and no crawler/addon/database change was included.

### Research leading to this implementation (October 15)

The owner now asks whether required outdoor kills and dungeon clears can be quantified directly,
using a conservative one-fifth combat share for the five-player style. Feasibility, current official
rules, raw provider coverage, missing inputs and implementation order are recorded in
[the combat-XP research](forever-leveling-combat-xp-research.md). That document records the earlier
research stage; see the subsequent implementation above. It does not establish that all mob XP is
recoverable from client files. The preceding simple buffer
policy remains the fallback where counts/tuning are unresolved; it is not a second XP award once
explicit combat is included. The 2.375 planning estimate below applies only to unknown quest rewards.

### Preceding owner policy: simple dungeon XP estimate and combat buffer (October 15)

For unconfirmed/future dungeon quest rewards, use **unscaled reference base XP × 2.375**, once,
with the existing rounding and hand-in-level rules. This is the chosen planning estimate, not a
prediction that Blizzard will keep that exact coefficient. Known collected rewards still take
precedence; do not replace a 1.8/2.1 fact with 2.375 or multiply an already-scaled amount again.

Treat the XP from required outdoor objective kills and dungeon clears as the natural buffer if
the actual quest coefficient is lower. This is an owner-approved planning assumption, not a
measured guarantee or an additional invented numeric reward. It is enough to author the planning
route without a separate kill-by-kill compensation system, multiplier scenarios or fixed 0.3-level
allowance. This supersedes earlier requirements for low/central/high template runs or a mandatory
combat calculation merely to tolerate a small quest-only difference.

Carry XP between sections and retain actual level/prerequisite checks. Add efficient catch-up
work only if the party is actually short at a checkpoint; do not preemptively add grind detours
for every possible coefficient change. Missing real quest IDs/lifecycle information remains a
separate issue, and an estimated route is not relabeled as observed or playtested.

### Owner-approved unknown-dungeon parity scenarios (October 15)

Historical policy: the October 19 contract above replaces the optional-count interpretation with
four owner-confirmed quests per faction and an explicit implementation backlog. Reward amounts
and unknown quest details remain distinct from that guaranteed count.

The owner permits assuming that unmodeled new dungeons (currently Drowned City, Krol'dok and
Alcaz Prison) have comparable quest packages and level-scaled rewards to Hall of Thanes, Ruins of
Lordaeron and City of Dalaran. Do not keep the planning route blocked merely because their IDs
are not public. This is an explicit scenario assumption, not recovered game data.

- Retain anchor-specific, faction-specific package variants; selected core hand-ins and a complete
  quest package are different counts. Current catalog examples: Hall five total IDs, Lordaeron
  four Alliance/six Horde IDs, Dalaran four per faction. Restrictions, optional work and prerequisites
  still determine what each player can receive; catalog presence is not confirmed accessibility.
- Use the anchors' level-dependent base-XP patterns with the chosen 2.375 planning coefficient
  where rewards are unknown, at the candidate entry/hand-in level. No low/central/high scenario
  system is required. Do not transplant the same absolute XP total between dungeon levels.
- Display assumed quest count, source template, assumed rewards and resulting exit/deficit
  explicitly. Keep known-only and assumption-funded ledgers separate; label the latter as a
  conditional planning route. Required mob kills provide the assumed buffer; offer outdoor
  catch-up work if actual party progress later proves insufficient.
- Do not invent quest IDs, pickup locations, chain edges, objectives or exact browser/RestedXP
  instructions. Unknown preparation/travel time is still unknown. Replace scenario slots with
  real quests/evidence when available, without counting both the placeholder and its replacement.
- The verified importer/resolver already uses adjusted per-page rewards once. Collected examples:
  Stockade 378 has base 2,750, factor 2.1 and final 5,800; Gnomeregan 2922 has base 2,650,
  factor 1.8 and final 4,750. Do not apply another Forever bonus. The legacy generic 2.375 fallback
  is not the universal formula; reconcile/replace it before claiming a verified continuous route.

Historical status at that checkpoint: the scenario-route compiler/UI was still to implement. The
October 18 compiler completed the evidenced Alliance itinerary, but still omitted the three unknown
bundles; the October 19 task table records the remaining guaranteed-bundle and faction work.
Full-archive collection contains 2,535 unique quest IDs across both factions, every guide
family/conditional branch and all known dungeon references. Details are in
`docs/forever-leveling-archive.md`; collection alone never constituted route certification.

### Small quest-only gaps and natural combat reserve (October 15; simplified policy)

The owner notes that mandatory outdoor objective kills and dungeon trash/boss clears add XP
which the default quest-only audit does not count. Do not force extra quest detours merely to
eliminate a small quest-only shortfall which ordinary progression may cover. The current engine
can consume explicit combat scenarios, but defaults to no combat credit; this is not a measured
claim that clears give no XP.

The earlier proposed interpretation of “0.3” as a fixed fraction of one level is superseded by
the owner's simpler policy above. Do not implement a special threshold or a flat 30% XP bonus.

- A small numeric gap can be described as covered by the expected natural combat buffer in the
  planning view. It is not missing quest evidence or a confirmed kill payout. Do not introduce
  extra scenario controls or require kill counts just to continue planning.
- Check the weakest member, mandatory activity before the particular gate, and the accumulated
  XP balance. Never forgive the same-sized gap independently at each chapter or reset the
  incoming bar to the next advertised level. One clear's combat reserve cannot be spent twice.
- Do not weaken real pickup/access minima or ready-state checks. Record actual party bars at
  dungeon departures and use them to resolve the small shortfall before suggesting extra work.
- If a real combat estimate is available, avoid overlapping activities and retain its party/level
  assumptions. Detailed combat modeling is optional for this planning baseline, not a new blocker.
- Combat already included in a saved actual XP bar is not added again. Actual level progression
  also determines subsequent quest reward reductions; ignored bonus XP must not preserve full
  payouts incorrectly far beyond their proper hand-in levels.

This records the intended policy for the continuous route rebuild. No runtime threshold, status
change, guessed kill payout or readiness relaxation has been implemented by this discussion.

### Findings that change the approach

- Current `premadeEntryLevel` cannot move a dungeon earlier: it takes the maximum of the old
  requested level and the At-level recommendation. Candidate selection then attaches quests to
  those pre-existing brackets. This is an itinerary validator, not an XP-funded route builder.
- Source recommendations, minimum acceptance levels, quest levels and full-clear difficulty are
  conflated. For example, Treaty has a guide-column claim of 16 versus a Journal/published minimum
  of 9. Keep the conflict until reviewed; do not silently relax it or turn every recommendation
  into an authoritative quest requirement.
- Late ordering is especially wrong: RFK 35 versus At-level 31; RFD 45 versus 39; Uldaman 47 versus
  42; ZF 49 versus 44. BFD 28 appears after Excavation's 29 gate. LBRS and Stratholme become level-60
  activities under the conservative policy. None of these should remain fixed merely for bookmark
  compatibility.
- The current selected dungeon packages are small. The frozen reference totals include Hall
  13,300, Deadmines 13,500, Gnomeregan 14,350 at 33, SM 20,350 across its selected three-wing
  package, and Stratholme's four core quests 31,500 at 59. These are not one or more guaranteed
  levels. Preparation payouts, dungeon payouts and city returns need distinct ownership.
- Fresh evidence has 626 published records but only 328 usable XP facts. All 298 unknown records
  share renderer/primary/numeric parsing issues. The parser also reports missing primary data when
  the renderer check fails, so the signature alone does not establish which source element is
  actually absent. Fix diagnostics and inspect permitted fixtures before expecting more crawling
  to solve numeric coverage. Human/warrior has 294/334 scheduled hand-ins with typed XP facts.
- The installed Quest Journal contains both old reward strings and lower client-cache fallbacks;
  its runtime explicitly prefers live rewards. They are not interchangeable numeric facts. The
  local `questcache.wdb` is now nonempty: 61 bounded records, build 70374, including all five Hall
  quest IDs. Its reward fields/layout are not decoded or validated yet. This is a useful additional
  evidence source, not permission to promote guessed fields or cross-build data into production.
- Blizzard's October 8 notes increased dungeon kill XP by about 20% and changed lower-level-enemy
  penalties in mixed-level parties back to individual-member evaluation. Keep the owner's solo-XP/5
  budget as an explicit conservative scenario, not a claim that it is the full current server rule.
  Do not multiply an already-current observation by 1.2 again. See the linked official notes below.

Detailed frozen-input audit, all 21 requested stops and arithmetic examples:
[r7 whole-route audit](forever-leveling-full-route-audit.md#october-15-r7-follow-up-flexible-entries-do-not-fund-the-route).

### 1. Normalize evidence before choosing the new route

Create one build/ruleset/locale-pinned fact set with these distinct fields:

- Quest identity and availability; faction, race, class and phase restrictions.
- `questLevel`, proven `minimumAcceptLevel`, source-recommended level and unresolved claims.
- Base XP versus effective XP by hand-in level, each with source/effective-build provenance.
- Actual prerequisite semantics: all/any parents, item start, accepted versus rewarded requirement,
  mutual exclusions, exclusive breadcrumbs and one-time versus repeatable rewards.
- Ordered objectives: NPC/object/item IDs, quotas, personal versus shared credit, loot distribution
  and required actions. Pickup and hand-in positions are not combat locations.
- Dungeon scope, relevant final bosses, access/key requirements and difficulty evidence.
- Per-member starting XP, class/race, paid quest history, current quest stages and group presence.
- Kill-credit rule, XP modifiers, current quest-log capacity and travel assumptions as versioned
  rules, not unnamed constants. Local RXP paths use both 25 and 40 slots; confirm actual capacity.

Evidence priority is reviewed compatible game observations, compatible decoded query/cache fields,
current numeric reference data, then clearly labeled historical estimates. Capture time alone does
not prove effective-build compatibility. Preserve conflicts and known authoritative zero rewards.
The guide's column headed Level is not independently proof of a hard acceptance floor.

The cache experiment must remain read-only: identify the build-specific layout, validate titles,
IDs, boundaries and numeric fields against known Hall/Deadmines/Gnomeregan cases, then reconcile
differences. A modern emulator's packet structure is only an investigation aid, not a Forever
schema. No broad quest/NPC scanning or re-enabling the disabled collectors is required for this.

Repair/verify the reference parser before widening numeric collection. Classify failures separately
as renderer drift, unavailable primary dataset, absent scaling data, access denial or genuine
unknown. Retain last-good data. Do not bypass source challenges or increase crawler concurrency.
Prioritize the **blocking quest frontier and its chains**, not another unranked ID sweep.

### 2. Restore the full quest graph, then remove inefficient work

Use all applicable authorized source chapters as the baseline graph. Do not start with the short
fixed bridge lists and hope another few kill quests fill the difference. The current group-profile
library compiler exposes 1,074 Human-warrior candidates, including alternatives, deliveries and
already-scheduled quests; this is not a claim of 1,074 independent eligible quest rewards.

Keep source order constraints separate from proven quest prerequisites. In particular, handing in
A before accepting B in a source step does not automatically prove that B requires A. Review the
current compiler's adjacency-derived parents before using them to reject useful batches.

Form complete local batches containing pickup → required objectives → hand-in and any real parent
chain. Score the entire chain, not just its final reward. Keep useful training, pet unlocks,
transport learning and future dungeon preparation even when they grant no XP. Distinguish a
required access step from an optional throughput or loot upgrade.

Prefer shared kill quotas and overlapping camps; then named targets with reviewed trophy credit,
nearby guaranteed interactions and short deliveries on an existing journey. Collection avoidance
is a strong cost preference, not a reason to remove unavoidable access quests or force a larger
unbounded grind. For personal loot, model all five quotas and the actual distribution rule. A
head quest is not automatically one kill for the whole party. Unknown drop rates cannot become
100% or an invented completion time.

Source coordinates within 12 map-percentage points do not establish a short walk: terrain,
continent, floors, boats and routes matter. Do not add a Stonetalon/Felwood detour merely because
its source chapter's nominal level matches a gap.

### 3. Compile real dungeon packages, not reward lists

For every requested stop, compile a complete package with:

1. Off-route prerequisites placed at earlier natural visits where legal and useful.
2. Pickups immediately before departure, subject to the actual quest-log capacity.
3. Entry/access and party-readiness checks before any inside XP is credited.
4. Ordered inside objectives, key/item acquisitions, escorts and in-dungeon pickups/returns.
5. Outside deliveries at their real locations and times, followed by the next route decision.

Start with **all known compatible general quests**, then explicitly select/omit by whole-trip cost.
The current 2–4 core quests per instance must not remain an arbitrary upper limit. Personal class
quests credit only their owners; Horde quests cannot fill Alliance deficits. Do not invent
matching-faction quests from a parity assumption. Overlapping wings and prerequisite deliveries
must not pay the same quest more than once.

Special packages requiring explicit review:

- Hall: resolve guide-level/minimum conflicts; map chain and five personal items; keep Ironforge
  returns separate from the clear. At 16 + 0 its five references give 16 + 13,300, not 19.
- Ruins: required clear versus optional insignia farm, inside starts, and Stormwind deliveries.
  Compare its order with Deadmines around the shared level-19 window using total journey costs.
- Deadmines/Stockade: retain Defias and Letter → Bazil → Riots. Compare bandanas, memories and
  explosives as optional real chains, not obligatory low-drop fillers or free bonus rewards.
- BFD/Excavation: reorder by funded windows/geography. Treat relic discovery, its first delivery
  and the follow-up as separate stages, not a reward paid at entry.
- Gnomeregan: expand beyond the current three core quests; distinguish exterior work from the
  main run, terminal sequence, city returns and back-door access. Pay low-level exterior quests
  earlier only when the journey actually saves time; do not invent a second free dungeon visit.
- RFK/SM/RFD: move compatible preparation earlier; confirm escort/wave costs and five-player
  credit. Plan SM Library → key access → other required wings, not three copies of one shared
  quest payout. Desolace lead-ins remain real journeys and hard prerequisites where established.
- Uldaman/ZF/Maraudon/ST: scope-specific end-boss difficulty may require a higher entry than the
  headline At-level reference. Include real tablets, mallet, scepter and Hakkar chains. Do not
  force a low-drop collection merely because its final dungeon hand-in looks profitable alone.
- BRD: prison/Windsor/probe, outside returns, note, Shred, Jail Break and Emperor are real separate
  stages/visits. Integrate MC/Onyxia/Shadowforge goals without pretending all are one clear or all
  players' preparation is identical.
- LBRS: a possible key/gem return is conditional, not a guaranteed second-run completion. Treat
  seal/gem availability and individual quest state honestly; never pay one-time quests twice.
- Stratholme: define living/undead/both-side scope; do not call two traversals one short clear.
  One-run-to-60 depends on its calculated entry bar and selected rewards, not the dungeon name.
- Drowned City, Krol'dok and Alcaz: retrieve/review real quest packages and level evidence. Until
  then they are unresolved requested modules, not zero-XP stops or invented full-level bonuses.

### 4. Replace fixed appointments with constrained entry windows

At-level is a **difficulty preference**, not an XP formula or universal hard floor. Quest hand-in
reduction depends on each quest/hand-in level; combat XP depends on enemies and each member's level.
Even an At-level run can include low-level quests with reduced payouts.

For each reviewed package evaluate the At-level point and adjacent levels, normally ±1. Prefer
At-level or one above when travel and readiness are otherwise comparable. Allow a nearby earlier
entry for a capable premade only when access, quest eligibility and the package's hardest required
encounter support it. A wider window requires a specific scope/boss justification, not pressure to
fill a gap. Never raise the whole group's entry solely to unlock an optional class quest.

| Package              |   Source At-level | Candidate window to evaluate, not a promised entry                                      |
| -------------------- | ----------------: | --------------------------------------------------------------------------------------- |
| Hall of Thanes       |                14 | 14–16; resolve Treaty/guide minimum conflict before an earlier complete package         |
| Ruins of Lordaeron   |                19 | 18–20; compare order with Deadmines                                                     |
| Deadmines            |                19 | 18–20; required Defias stages must already be legal and complete                        |
| Blackfathom Deeps    |                25 | 24–26; compare geography with Stockade, not after a fixed Excavation appointment        |
| The Stockade         |                26 | 25–27; preserve remote Fury and Letter chains                                           |
| Excavation: Wetlands |                29 | 28–30; don't retain the old hardcoded 27 as a guaranteed full-clear level               |
| City of Dalaran      | 31, current guide | 30–32; reconcile the catalog's null/stale availability data first                       |
| Razorfen Kraul       |                31 | 30–32, rather than a fixed 35 after Gnomeregan                                          |
| Gnomeregan           |                33 | 32–34; review exterior quest timing separately                                          |
| Drowned City         |   Not established | Original 37 is only an owner preference until evidence is obtained                      |
| Scarlet Monastery    |                37 | 36–38; split wings/access and use the hardest required scope                            |
| Razorfen Downs       |                39 | 38–40, rather than automatically waiting to 45                                          |
| Krol'dok             |   Not established | Original 42 is provisional, with no certified quest funding                             |
| Uldaman              |                42 | Start with 41–43 candidates; full-clear boss floor can require a later reviewed window  |
| Zul'Farrak           |                44 | Start with 43–45; review required boss/mallet scope before selecting                    |
| Maraudon             |                46 | Start with 45–47; full Princess route may justify a later nearby entry                  |
| Alcaz Prison         |   Not established | Original 50 is provisional, with no certified quest funding                             |
| Sunken Temple        |                51 | Start with 50–52; validate hardest required encounter/class variants                    |
| BRD                  |                55 | 54–57 by prison/Emperor scope, not one interchangeable visit                            |
| LBRS                 |                60 | Evaluate 58–59 as an explicit experienced-premade leveling branch; otherwise post-60    |
| Stratholme           |                60 | Evaluate 58–59 only with supported scope/readiness; finish-to-60 requires the entry bar |

The table covers all 21 requested stops, not all dungeons in the game. Missing packages retain
their requested status. Do not certify an available-only variant as containing those three.
WC/SFK/Dire Maul/Scholomance can be compared as additional alternatives only where actual Alliance
quests, travel and difficulty justify them; they are not automatic fillers for the owner's route.

Select order among overlapping feasible windows, rather than globally sorting the old requested
levels. In particular, evaluate RFK/Dalaran before Gnomeregan and ZF before Maraudon; older ordering
must not force wasted overleveling. Do not infer a complete optimal order from the table alone.

### 5. Build the continuous five-player route before rendering chapters

Use a pure event replay with `totalXp = sum(curve below level) + currentXp`, separately per member:

- Validate each pickup's real restrictions, parent states and minimum at that exact point.
- Resolve every quest reward at the **pre-hand-in** level; apply its effective scaling once, add
  the one-time reward once, and carry all level overflow into the next event.
- Count mandatory outdoor and dungeon combat by unique activity, with objective overlap and
  sequential stages distinguished. A shared kill is not five separate kills and is not also
  added again as a trash-clear estimate.
- Use solo-XP/5 as the conservative planning scenario when its underlying kill counts and
  level-appropriate solo XP are established. Unknown combat is not credited. Split activity at
  level changes where enemy XP changes. Keep expected/live-calibrated estimates separate.
- Complete item/objective stages without awarding XP prematurely. Evaluate all five players,
  including a lagging member, personal class rewards and individual loot/credit needs.
- Check entry before adding any inside reward. Skipping optional work preserves required chains
  and accepted quest obligations. Forecasting never changes actual XP, quest reports or readiness.

The route generator consumes that replay; it does not assign a target then reset everyone to it.
Starting from the full legal source graph, insert/reorder dungeon packages and prune unnecessary
outdoor batches only when every member remains funded at every later affected gate. Re-simulate
after each removal, insertion, order change or optional-quest selection.

For each remaining shortfall compare eligible complete nearby batches, not isolated reward IDs.
Use deterministic bounded look-ahead over the next 2–3 overlapping dungeon windows and region
transitions. Rank by total party time, completion/drop risk, lost XP from unnecessary delay and
future unlock value. Retain alternative orders when travel data cannot distinguish them; do not
claim global optimality. No optimization dependency or general-purpose solver is required first.

An accepted batch must name quests, objectives, quota, prerequisite closure, locations, individual
XP contribution and exit state. A finite measured kill loop may be a disclosed fallback, but
unbounded “kill until ready” cannot silently complete the author's budget or be called a pure
quest route. If safe candidates cannot reach a window, report infeasibility rather than invent XP.

Unknown optional rewards may be excluded from the reference branch, not described as actual zero.
If selected, propagate uncertainty or re-anchor with actual XP after completion. Unknown critical
rewards/eligibility cannot certify a departure. Any interval model must also handle changed
overlevel rewards; simply ignoring an unknown bonus and keeping all later full payouts is unsafe.

There are 2,424,700 required XP from 45 + 0 to 60 on the pinned curve. The current selected packages
do not justify an assumption of dungeon-only leveling after 45. Prove the quest/combat ledger or
retain the necessary efficient outdoor batches. Likewise, 31,500 core Stratholme XP alone requires
entry at 59 + 178,300 or higher to finish 60; more real quests/combat can lower that threshold.

### 6. Cost the actual journey and preserve the existing UX

Total cost includes travel, boat waits, pickups, chain returns, combat, personal collections,
escort duration, training and hand-ins. A premade has no group-assembly delay, not zero travel.
Use the actual transport/hearth/key state. Unknown times remain unknown or explicit scenarios;
an XP/hour input cannot invent a shortest travel path. Request only the specific Alliance travel
measurements that still change the selected candidates after this data-first analysis.

The primary route tree and split map/scrolling reader stay. Compile their chapters **after** the
event route is funded, grouping geographic work and small preparation checklists. Main rows show:

- Planned entry window and the modeled incoming bar, or the player's fresh actual bar.
- Remaining payable quest XP, combat estimate separately and the modeled after-hand-in bar.
- The explicit next outdoor batch needed for the next gate; never the next dungeon's required
  level presented as this dungeon's earned exit.
- Quest count, whole-trip time range/evidence and why a detour/collection was kept or omitted.

For example: `Hall · enter 16 + 0 → quests +13,300 → 16 + 13,300 (83%)`, with combat separate.
Place Ruins' level-19 departure requirement in the actual intervening route decision, not as a
second competing Hall chapter budget. Exact main-route expected ranges must come from the replay.

Publish immutable compiled route/evidence revisions. A newly crawled reward triggers re-audit and
a candidate revision, not silent reordering of a saved player's route. Preserve factual paid quest
history and semantically identical action IDs. Old bookmarks need mappings and newly required
earlier chains need explicit repair steps. Offer a reviewed migration; do not copy completion to
new actions or drop accepted quests because the regenerated route uses a different order.

### 7. Implementation sequence and completion proof

Keep changes inside the existing leveling architecture:

- `quest-eligibility.ts`, `dungeon-model.ts`, `dungeon-catalog.ts`: separate recommendation,
  authoritative acceptance/access fields, source conflicts and scope-specific difficulty.
- `campaign-library.ts`, `campaign-library-route.ts`, `campaign-route.ts`: compile source graphs
  and full packages before selecting a path; retain old appointments only as preferences/aliases.
- `premade.ts`, `dungeon-scheduling.ts`: one shared flexible-window policy, replacing the competing
  hardcoded-floor behavior without weakening actual access gates.
- `campaign-xp.ts`, `campaign-coverage.ts`: continuous per-member event replay and complete-route
  feasibility; retain a separately labeled independent diagnostic rather than resetting the route.
- `campaign-sections.ts` and existing campaign/XP UI components: project the funded artifact and
  its true entry/exit bars instead of attaching budgets to preset geographic brackets.
- `scripts/audit-leveling-quest-xp.mjs` and route tests: add full-party compilation verification
  plus an independent ledger oracle; a real failed funding gate must prevent complete publication.

1. **Evidence gate:** freeze/reconcile the fact set; repair numeric-parser diagnostics/fixtures;
   investigate the 61-record cache; resolve hard minima versus recommendations. Produce a missing
   critical-input report with exact quest IDs, not another generic “more evidence needed” banner.
2. **Authoring engine:** refactor source/prerequisite edges and compile full dungeon packages;
   remove fixed `from/to/nextLevel` values as execution inputs while retaining original preferences
   and legacy link aliases. Reuse existing pure XP helpers and quest schemas where correct.
3. **First proof:** generate the complete Human-warrior-led 1–60 artifact, not just a 1–20 demo.
   First deeply review 13–30 and 45–60, then validate every event/checkpoint. Model all five party
   profiles explicitly; the leader's class is not the class of the other four. Include a complete
   source-backed fallback for any optional unavailable dungeon; do not call a missing required
   requested package fulfilled.
4. **Independent verification:** use a separate small ledger oracle over compiled events, then
   reconcile its hand-ins, kills, cumulative XP and gates with the production planner. This must
   catch Hall's false 16→19 gain, not merely repeat the same planner's assumptions.
5. **Full matrix:** validate all 33 current race/class editions, mixed starts/classes/unequal bars,
   paid quests, partial objectives, accepted optional chains, all selected extras, raid on/off,
   entry policies, source changes, combat uncertainty, overlevel reductions and cap crossings.
   Personal starter branches must be modeled or anchored to declared actual rendezvous bars.
6. **Browser/export gate:** render the verified artifact and assert its numbers match the oracle
   on every chapter, not only selected cards. Regress refresh, Next versus Done, old saves,
   reordered bookmarks, mobile and accessibility. Approval of the browser precedes export; web
   and RestedXP must replay the same events and stop/skip rules with matching totals.
7. **Release gate:** prevent a complete-route publication when any required checkpoint lacks
   eligibility, paid-once accounting or XP funding for any player. Keep software checks and the
   content-funding gate distinct. A flag or a new label must not override a failed content gate.

Required deliverables before asking the owner to review another “complete” route:

- A frozen fact manifest and gap report with source/rule/build hashes.
- A compiled full-route artifact listing every quest/activity and why each is selected.
- Per-member before/after XP and prerequisite state at every departure and final 60.
- The all-21 requested-package inclusion report, including explicit unresolved modules.
- Whole-trip comparison of the chosen order against the previous order, with measured versus
  assumed times distinguished.
- Independent oracle + matrix + browser receipts. No arithmetic discrepancy may be relabeled
  as UX, and a reference-model pass must not be called a playtested server result.

No runtime, crawler, addon, database, deployment, commit or push is part of this planning turn.
Official rule references: [October 1 quest bonus changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/4),
[October 8 combat/party changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5),
and [the dungeon difficulty/quest reference](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).

## Source-library integration receipt (October 15, 2026)

Implemented locally: the full applicable source inventory now feeds an automatic kill-first
selection pass, not only a panel of optional suggestions. Selected full quest lifecycles and their
source-chain lead-ins are materialized in the normal zone/dungeon chapter flow. Existing source
steps, saves, participant scopes and original action IDs are retained.

- Explicit shared NPC counters and named-target trophies are preferred. Broad collection farms,
  personal/unsupported conditions, incomplete stages and unreviewed dungeon-only objectives stay
  held. Required access chains retain unavoidable item collections. Trophy drop/credit rules for
  all five remain uncertain until established; selection does not assume guaranteed drops.
- Nearby short returns/interactions require a bounded same-map/floor cluster; delivery roots also
  require a short source-step span. These heuristics do not estimate travel minutes or certify a
  global optimum. New-zone branches still need travel review as reward evidence becomes available.
- Human/warrior gains 36 quests, including Worgen, Ormer, Redridge named targets, Felwood and
  Plaguelands work, for 334 scheduled hand-in IDs. Human/general gains 28, for 310. Most other
  candidates are held, not falsely declared unavailable or all automatically suitable for a party.
- Actual dungeon XP/overflow is carried forward. Unstarted optional loops become unnecessary when
  all five fresh bars meet the target; accepted chains and required unlocks stay. Forecasts never
  modify actual progress, repeat paid quests or pretend to know unmeasured combat amounts.
- Expanded reward collection is running on the existing worker with a 1,419-ID immutable priority
  queue. Default legacy queue generation remains 614 IDs; use `--library` for the full pool.
  Current operations, immutable hashes and rollback: `wowhead-reference-enrichment.md`.

Passed 401 unit tests, strict types, scoped lint/format, production webpack build, all 33
source-flow/lifecycle variants, original save compatibility and browser/mobile/WCAG checks.
The 132-scenario / 6,000-chapter frozen-input XP audit **still fails certification**. This delivery
expands usable route content and data collection; it does not claim that every 1–60 deficit is
resolved, travel is calibrated, or the full RestedXP export is ready. Website changes are not deployed.

## Complete the route from the full quest backbone (October 15, 2026; selection plan)

The trimmed premade campaign is not the full supplied quest library. A Human-warrior 1x solo
reference inventory finds 951 distinct hand-in IDs across 44 eligible reference chapters, of which
748 are not scheduled in the premade plan. Alternative chapters and dependent deliveries are
included in that pool; do not present them all as immediately eligible efficient choices.
Only 6 of these unused IDs have available typed XP in the frozen October 15 04:47 UTC snapshot.
Broader selection and targeted reward extraction are needed, not a claim of exhausted content.

1. Start with the full eligible source route/chains and the owner's approved At-level dungeon
   appointments. Keep personal starts separate and carry real per-member XP/overflow continuously.
2. Prefer shared kill quotas, overlapping camps and named targets. Include reliable bounded
   head/trophy quests once loot/credit rules and all five personal quotas are established. Avoid
   low-drop multi-item farms unless required for an approved unlock; unknown drops stay uncertain.
3. Preserve prerequisite closures, access items, future dungeon pickups, class requirements and
   necessary transport/turn-in visits. Do not delete a low-XP lead-in that unlocks valuable work.
4. Fetch reward/minimum evidence for the additional selected chains, not only the old trimmed
   itinerary. Replace the broad keyword collection filter with reviewed objective categories;
   the word "loot" alone does not distinguish a reliable named trophy from a long random farm.
5. Simulate full eligible hand-in XP, explicit unique combat at the conservative solo-XP/5 rule,
   dungeon rewards and evidenced trash XP. A dungeon's gain is not a fixed level; hand-in level,
   eligibility, reward scope and incoming overflow matter. The original source's 44 explicit
   grinding steps also show why no-dungeon solo leveling is not a quest-only XP proof.
6. Prune unnecessary outdoor XP-only batches after the simulation, while retaining unlocks.
   Choose geographically coherent kill loops rather than the highest isolated reward or long
   courier chains. Offer nearby reserve work only when the lagging player's actual bar needs it.
7. Audit the resulting continuous route, not the sum of independent empty-bar diagnostic gaps.
   Certify only funded, eligible, correctly ordered checkpoints for every member; keep travel
   assumptions and unverified content visible. Preserve paid history and bookmark compatibility.

This is the next route-selection implementation brief, not a claim that the unused quests have
already been inserted, their rewards extracted or a new release deployed.

## XP repair implementation (October 15, 2026; local review)

The progression/ledger corrections below are now implemented locally, not deployed. Cards and the
reader share sequential per-player budgets, conservative pickup minima and actual departure gates.
Future rewards cannot fund an earlier entry; chapter targets are not promised earned level ranges.
Complete source-backed shared-kill batches can be added in eligible phases without changing actual
XP or paid quest history. Missing, collection, conditional and ambiguous objectives remain held.

The owner's five-player planning rule is explicit: eligible hand-ins retain full quest XP; unique
combat activities credit one fifth of solo XP per player. Camp clear speed improves time, not XP.
Without compatible solo kill values and counts, combat stays unknown and cannot fund a gap. This
conservative assumption is not a verified Forever group-XP formula or a measured speedrun pace.

The strict audit now checks 33 variants, 132 policy/raid scenarios and 6,000 independent chapter
budgets. It correctly rejects current 1–60 certification. Completing reward extraction, full
prerequisite/lifecycle evidence, the three unknown dungeon bundles and calibrated combat/content
budgets remains necessary; no amount of passing UI/unit tests substitutes for that work.
See the [dated implementation receipt](forever-leveling-full-route-audit.md#october-15-implementation-receipt-local-only)
for reproducible inputs, checks and unresolved work. Production remains r6; no RestedXP export
or in-game playtest certification is claimed.

## Whole-route audit supersedes XP-readiness assumptions (October 14, 2026)

Read [the full-route audit and correction plan](forever-leveling-full-route-audit.md) before further
route changes. It covers all 33 implemented Alliance race/class variants, 1,500 chapter instances,
132 cumulative policy/raid scenarios and 1,386 dungeon-handoff diagnostics. This is an analysis
delivery, not an implemented correction or certification of the current 1–60 route.

The curve matches all 59 extracted leveling requirements, but handwritten milestone ranges were
not funded by a validated activity budget. The reported 20–26 card has only 18,660 of 170,800
required XP before incoming dungeon rewards/combat. Independent full-interval checks confirm the
same issue elsewhere, including the intended dungeon-heavy 45+ section.

Fix the confirmed control-flow defects first: later source-backed catch-up actions inherit a
level-16 target and can skip needed work in five phases; the forecast also omits the entry-level
check at the actual departure action and can borrow later dungeon XP to appear ready. Cards,
per-player execution and selected difficulty/raid/extra scope must share one ledger and gate model.
Then complete lifecycle/reward evidence, calibrate per-player combat, and select named efficient
batches to close every remaining checkpoint deficit. Retain explicit unresolved status wherever
proof is missing. Existing unit, identity and compatibility checks do not certify XP coverage.

Status: browser route and calculation engine implemented as a review edition. Updated October 14, 2026. In-game route/addon validation and payment activation remain pending.

## Zone-first chapters and compact dungeon preparation (October 14, 2026)

The r4/r5 consolidation solved overlapping level brackets but called every between-dungeon block
“Prepare for…”, even when most of its work was ordinary questing. The new geographic presentation
keeps the same brackets and executable route, while making the main questing locations the titles.
For example, the Human 13–16 chapter is “Westfall → Dun Morogh”, with one Dun Morogh subsection
containing its quest chain and conditional catch-up. Stockade's bridge is “Redridge Mountains →
Duskwood → Wetlands”; later bridges name Badlands, Desolace, Burning Steppes and the Plaguelands.

- Main locations are reviewed display metadata, not invented coordinates, new travel optimization
  or a claim that every detour occurs in that zone. Action maps and travel instructions stay intact.
- Consecutive phases in the same area share a heading. Subsections have no competing level ranges.
  City deliveries remain visible in the ordered outline, even when the main title emphasizes zones.
- Preparation is a small, collapsed “Before [dungeon]” checklist inside the zone chapter and reader.
  Known prerequisites/pickups link to their existing exact steps and show individual reported
  progress; missing tasks/edges are not invented. It also shows actual party level/XP readiness.
  This checklist is not a second XP budget and cannot complete a quest or certify an unknown bundle.
- XP-only work is collapsed as unnecessary only under the existing per-player readiness rules.
  Required pickups embedded in such a phase remain accessible; unknown/stale XP never means ready.
- Old `prepare-*` chapter IDs remain compatibility URLs. Only the public section kind/title/area
  presentation changes; internal legs, action IDs, participant scopes, Next/Done, source anchors,
  release/save identity, XP targets and the `workflow-20261014-v2` execution revision do not change.

Deployed: `kfc-helper-zones-20261014-r6`, based on the actual r5 baseline. Validation passed 143 leveling
and 214 web tests, strict type/lint and the Linux production build. The presentation-only audit
compares all 33 editions to r5, preserving all 26,878 action identities, every chapter URL/bracket
and per-player XP forecasts. Browser regressions cover zone headings, collapsed preparation,
partial-party reports, conditional catch-up, navigation, real XP, mobile layout and WCAG A/AA.
Only Helper web was reloaded; r5 remains the immediate rollback. See `context.md` for the receipt.
This UX refinement does not certify the 1–60 XP budget or
finish the full RestedXP compiler.

## Integrated race-route delivery (October 14, 2026; deployed r4)

### Consolidated questing chapters (October 14, 2026)

Public chapters now project a shared section model rather than displaying every internal phase as
a separate route. Human's Westfall finish, Dun Morogh/Map preparation and conditional extra XP are
one 13–16 “Prepare for Hall of Thanes” chapter, followed by a level-16 dungeon event. All later
between-dungeon preparation is consolidated in the same way. This yields 44–46 public chapters
across the 33 race/class editions while preserving all 21 requested dungeon stops and source anchors.

One actual per-player XP target applies to each preparation chapter. Unknown/stale bars need an
update; full bracket requirements are explanatory, not earned rewards. Dungeon events show entry
requirements without another overlapping XP budget. Previously paid rewards are not reforecast.

The shared execution controller bypasses already reported quest stages and unnecessary XP work,
keeps class-conditioned personal steps, and preserves required pickups even inside a mixed XP phase.
Completion applies only to the participant/stage still needing it, not blindly to all five. Map item
acquisition/use and the Farsen/spy source steps are retained; mandatory preparation is followed by
a fresh actual-XP check before the nearby trogg catch-up phase. Mixed-race eligibility remains
explicitly confirmed in game, not inferred from a leader's history or a nominal guide level.

Stable action IDs and save identity are preserved; new preparation goals use new IDs. Legacy
chapter IDs resolve to their public section, and retired early-bookmark aliases resume at the
preparation/readiness step without copying old completion into a wider participant scope. The
executable revision is `workflow-20261014-v2`, separate from stable save/source identity. Freeze
this revision, its predicates and source hash for the later RestedXP compiler after approval.

The authored premade route belongs in the existing questing flow, not in a parallel product.
Alliance race dashboards at `/forever/leveling/routes/alliance-{race}` now project the campaign's
ordered chapters; `/chapters/premade-{sectionId}` uses the existing fixed-map/scrolling-checklist
reader. Previous individual-leg chapter URLs remain valid compatibility entry points.
Outdoor preparation, XP-only batches and dungeon objectives share the same ordered action model.
The former `/forever/leveling/premade` remains a compatible review/bookmark surface, not the setup
destination. The detailed dungeon ledger remains a reference, not a second quest order.

- Bare Alliance race URLs show the revised premade review edition. Setup sends five-player Alliance
  parties to `?plan=premade` and solo/small groups to `?plan=questing`; the in-page edition selector
  keeps both available. Horde remains on its original route until a Horde dungeon route is authored.
- Chapter IDs, source anchors, release identity and all Next/Done transitions come from the same
  campaign model. Maps keep source coordinates and historical pickup evidence distinct.
- Character/race/class progress is release-scoped. Old outdoor checks are preserved, never copied
  blindly into reordered multi-quest tasks. Browsing a premade edition with a solo character does
  not imply five-player readiness; explicitly saving the route preserves that character's old checks.
- Chapter cards show distinct selected-quest counts, known/estimated reward subtotals, unknown
  hand-ins, bracket XP requirements and scenario time from observed XP/hour. They do not promise
  those rewards fill the XP budget or double-count dungeon bonuses.
- Deep links, same-chapter hash changes, chapter boundaries, reload, back navigation, race/class
  selection and exact dashboard continuation need browser regressions before each publication.

Source audit: 61 authorized Alliance source chapters project 33 race/class editions, with all 21
requested stops, 53–55 internal phases and 44–46 public chapters. This is structural/source
validation, not a playthrough.
Drowned City, Krol'dok and Alcaz still have unverified bundles; later historical chains, group credit,
travel durations and actual party XP must be checked in game. No missing pickups/rewards are invented.

After approval, freeze this same campaign revision for RestedXP compilation. The existing compiler
still only covers the earlier Westfall/Thanes preview. The full campaign adapter, runtime-condition
mapping, prerequisite/objective validation and actual installed RestedXP import/playthrough remain
release gates; the website is not evidence that a complete 1–60 addon pack is already available.

Deployment: `kfc-helper-chapters-20261014-r4`, preserving the actual r3 application/catalog baseline.
Validation passed 342 leveling/web tests, strict TypeScript/lint and production builds, all 33
authorized-source projections, and a previous-release compatibility audit of 26,614 preserved
action identities and 238 retired-bookmark aliases. Four private browser suites and public
consolidation/integration assertions passed, including per-player quest reports, stale XP gates,
conditional continuation, legacy links, 390/320 px layouts and automated WCAG A/AA checks.
Twelve public route checks passed; no catalog, archive or database changes were needed.
The source and operational receipt is in `context.md`; r3 was r4's immediate compatible app
rollback, although its reader uses the old individual-phase URLs rather than new section URLs.
The later XP release retains r4 as its immediate rollback.

## Priority quest-reward ingestion and cumulative XP coverage (October 14, 2026; foundation deployed)

This is the next correctness gate for the published review route. Chapter ranges are authored
targets, not a demonstrated reward budget. The existing UI/progress regressions do not prove
that its activities supply enough XP. Repair the data adapter and simulate the existing executable
order before proposing any further leveling or travel claims.

Implementation receipt: `kfc-helper-xp-20261014-r5` introduced literal-only, renderer-pinned
quest XP extraction, separate continuously published XP evidence, a serialized 614-ID priority queue,
and cumulative per-player quest-only forecasts on the existing route/reader. Reward resolution uses
the actual predicted hand-in level, carries overflow and deduplicates payouts. Unknown rewards and
eligibility problems remain visible and cannot certify coverage. Actual saved progress is untouched.
The four-quest Stratholme core excludes optional quest 5848. Maintainer queue/audit scripts and
415 passing relevant tests cover the implementation; five private browser suites cover the UI.

This completes the ingestion and quest-only simulation foundation below, not the entire optimization
plan. Collection/review is still running (24 available facts at 11:36 UTC). Combat calibration,
complete restriction/prerequisite closure, deficit-selected low-travel top-ups, mixed-race starter
modeling and full RestedXP compilation/import validation remain outstanding. Authoring ranges are
still targets, not a certified 1–60 XP budget. Operational details are in `context.md` and
`wowhead-reference-enrichment.md`. The inventory and blocker observations below describe the
pre-implementation audit; the exact not-found redirect was subsequently diagnosed and repaired.

### Inspected inventory and operational constraints

- The current generic Human campaign references 304 distinct quest IDs. The union of all 33
  Alliance race/class editions contains 614 IDs, with 584 distinct selected hand-in identities.
  Of those hand-in identities, 510 lack a usable reward in at least one current projection/context.
  These are selected action identities, not an independent prerequisite-closure or optional-quest
  inventory. Expand the queue for verified missing prerequisite edges and selected optional branches.
- On October 14 the single production crawler is stopped at cursor 746 / 60,614, on
  `forever-quest-260`, with `Source redirected outside the permitted entity`. Its durable
  checkpoint was last updated October 13 at 12:09:29 UTC. Inspect the exact redirect before
  resuming; do not relax edition/identity checks or skip access restrictions to make progress.
- Staging has 248 Forever quest records; 86 intersect the all-edition campaign union, including
  72 from the generic Human route. None of those 86 exposes numeric XP or XP text in the normalized
  reward fields. Existing crawl completeness/SEO readiness therefore does not mean XP readiness.
- `parser.ts` keeps quest reward sections as plain text, while its numeric-fact parsing is for
  items. `premadeReward` only consults the reviewed Journal and historical baseline files.
  Prioritizing pages alone will not connect the missing rewards to the simulator.
- Page presentations can differ: some retrieved/indexed Forever pages expose numeric Gains and
  character-level controls, while their plain non-rendered responses omit them. Pilot real page
  payloads to establish the field/table and its level context before treating extraction as solved.
  An absent amount is unknown, not zero. Do not use comment XP, search snippets or an old Changes
  table as an authoritative current reward. The current crawler excludes comments and must continue
  doing so. A challenged page stops the source request; no browser/challenge bypass is proposed.

### 1. Build and process an XP-specific priority queue

Generate a deterministic, checksum-versioned inventory from campaign quest changes, required gate
IDs and prerequisite closure. Deduplicate by game edition and quest ID, recording affected
sections, earliest useful checkpoint, requirement/optional status and missing XP/eligibility facts.

Priority order:

1. Human 1–16 coverage and required Thanes unlocks, then the following Human dungeon/preparation
   checkpoints. Within a checkpoint prefer unknown hand-in rewards and necessary gate facts.
2. Remaining Human 1–60 rewards and shared dungeon chains; reconcile already staged records first.
3. Other race/class starting branches and explicitly selected optional quest bundles.
4. Resume the ordinary catalog backlog after the priority inventory is processed.

Use a separate priority manifest and checkpoint, serialized through the same worker and staging
store. The minimal initial rollout can gracefully stop the normal job, run the reviewed priority
job through the existing bounded CLI, then resume the original job unchanged. Do not edit/reorder
`all-catalog.json` under its hash-bound cursor, reset the base checkpoint or run two crawlers.
If automatic priority scheduling is added, check for it only at safe task/batch boundaries and
maintain separate counters/cursors; processing priority work must not advance the base cursor.

Retain existing durable request pacing, cooldowns, locks, disk/storage limits and source denial
stops. An XP parser revision must not silently cache-hit a fresh record without XP extraction:
use parser-version/capability metadata and selectively refresh such records under the same pacing.
No fixed completion date is promised; a quest may require redirects and page XP may remain absent.

### 2. Normalize usable reward evidence, not just a number

Add a narrow quest-XP parser beside the existing literal-only Cheerio/Acorn parser. Validate
actual payload patterns with real allowed responses. Inspect only the primary same-edition quest
data or its Gains/XP controls, never unrelated preload IDs, comments or historical change rows.
Do not evaluate source JavaScript or invent field names/endpoints without a real fixture.

Publish a separate checksum-addressed leveling-reward evidence artifact and atomic manifest.
This avoids changing the strict existing display-reference record or writing external estimates
into native quest/catalog tables. It can be produced from the same fetched response without
another request. Its publisher/reader must validate identity, provenance, freshness and conflicts;
old display references remain valid. XP readiness is independent of page indexing completeness.
Account for the additional artifact bytes in the worker's existing storage limits.

Each reward claim needs edition/quest ID, amount or level-to-amount table, semantic basis
(`full-reward`, `at-character-level`, `historical-base`, `scenario`, `unknown`), applicable
character level/modifier context when known, source URL/hash, capture/parser revision and effective
patch/build claim. A source crawl timestamp does not prove exact client-build compatibility;
leave build unconfirmed when the page does not supply it. Retain contradictory claims for review.
Record minimum/quest level, faction/race/class restrictions, prerequisite alternatives and
completion scope separately; a list order is not automatically a prerequisite edge.

Resolution order is compatible context-pinned observation → usable current Forever page fact →
reviewed Journal claim with its provenance → explicit historical-base planning scenario → unknown.
Do not promote a newer conflicting page blindly over a compatible observed reward. A Forever
amount is never multiplied again. World rewards never inherit a dungeon coefficient merely
because their chain leads to an instance. A scalar whose selected character level is unknown
cannot establish a full-reward table. Use an evidenced overlevel rule/table or leave that context
unresolved; the current coarse `level > questLevel + 5` rejection is not a complete reduction model.

The October 1 notes reduce the extra dungeon reward above normal, not total quest XP, and also
mention individual recalibrations. The existing 2.375×/2.2× scenarios remain labeled fallbacks,
not universal facts. October 8 also changes combat XP and party-level adjustments. Keep those
rule revisions separate from reward facts and never apply a combat buff to a quest reward.
[Official October 1 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/4),
[official October 8 notes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5).

### 3. Simulate the actual route continuously for each player

Implement pure TypeScript forecast logic in `packages/leveling`, accepting a frozen plan,
reward-evidence snapshot, curve/rule revision and each player's actual starting state. Keep the
existing actual-progress ledger separate: a prediction never marks a quest rewarded or overwrites
saved actual level/XP. Unknown starting bars need input; a default level-1 run is explicitly an
authoring scenario, not the player's live state. Five starters may differ by race/class and meet
at the rendezvous; do not forecast the leader's personal start for the other four.

Represent cumulative earned XP as `C(level) + currentXp`, where `C(level)` sums the curve below
that level. For each executable action in order:

1. Validate actual/forecast minimum levels, faction/race/class restrictions, accepted quests,
   prerequisite alternatives, key/items and selected visit scope. An impossible pickup blocks
   the branch; nominal guide levels cannot grant eligibility.
2. Add combat only for a unique modeled encounter/activity with an applicable per-member claim.
   Accepting a quest or confirming an objective grants no hand-in reward.
3. At a real planned hand-in, resolve reward at that player's predicted **before-hand-in** level
   and modifier context. Count it once per player/quest/eligible completion cycle. Preserve
   shared-chain and multi-visit identities. Unknown rewards remain explicitly unresolved.
4. Advance the level using the curve, carrying overflow. Re-evaluate the next reward's level
   context and eligibility. Never reset to a chapter's nominal starting level or discard overflow.
5. At every entry checkpoint evaluate each player's actual selected-policy level and unlock
   gates. A predicted ready result is not actual confirmation for Next/Done in the live reader.

For a checkpoint the per-player deficit is `max(0, C(entryLevel) - predictedCumulativeXp)`.
Report all five deficits; the maximum identifies the XP-lagging player, not a five-player sum.
Required unlocks are a separate readiness condition even when the XP deficit is zero. Show a
quest-only coverage result and a quest-plus-combat scenario; do not label a route covered solely
because unknown rewards or optimistic combat might close the gap. The primary path, compatibility
reader, dungeon reference and future RestedXP compiler must consume the same selected quest scope
and forecast engine, fixing the current four-versus-five Stratholme forecasting mismatch.

### 4. Model combat and select concrete efficient top-ups

Resolve objective target IDs/counts where evidence exists. Shared concurrent objectives can count
the same kill once; sequential chain stages cannot be merged merely because the target matches.
Never multiply a shared kill quota by five, count the same kill in a quest and a clear twice, or
blindly divide a solo XP reference by five. Personal loot requirements and party-credit eligibility
need their own rules; unknown drop rate/distribution cannot produce a precise completion time.

Maintain separate outdoor/dungeon per-player combat claims by build/rule revision, enemy level/
type, party levels, credited members and modifiers. Prefer bounded current-group observations
with before/after level/XP and separately logged hand-ins/discovery; a mixed activity XP delta
cannot all become kill XP. The existing observer records the level after `QUEST_TURNED_IN`, so
extend its context before using it to train hand-in reductions. Retain secret-value guards and
bounded storage. Unobserved future clears remain scenarios; zero in a conservative lower bound
means excluded unknown combat, not a claim that the activity awards zero XP.

If a checkpoint has a shortfall, choose a complete nearby eligible shared-kill/quest batch using
marginal per-player reward versus full party time: travel, prerequisite work, kills, pickups,
hand-ins, collection/escort waits and the slowest member's readiness. Preserve necessary class
abilities and future dungeon unlocks, even if their immediate XP/minute is low. Use measured
travel/clear durations when available; otherwise show ranges or unknown time, not an exact ETA.
The first solver can deterministically score authored candidate batches and re-simulate after
each selection rather than introduce a global optimizer. Do not claim it is a proven optimum.

Prescribe named quest batches and, only with compatible XP evidence, a remaining kill count/range.
Recheck actual party XP after the batch and stop when ready. If no eligible measured batch can
close the deficit, retain an explicit unresolved/top-up checkpoint; do not add phantom rewards,
assume new faction-parity quests, prescribe repeated one-time quest payouts or silently enter
earlier than the selected policy. Dungeon-only leveling from 45 is an outcome to test, not an input.

### 5. User-facing report, verification and rollout

Each section should show actual/forecast entry level and bar, target dungeon level, resolved quest
count/XP, separately labeled combat range, predicted exit level/bar, unknown reward IDs, residual
deficit and required unlocks. Expand to a per-quest reward/source/hand-in-level breakdown and
per-player readiness. Distinguish reward evidence coverage from software/source-flow validation.

Implementation order: XP parser pilot → reviewed priority crawl/publication → generic reward
adapter → quest-only cumulative simulator → objective/combat sidecar and top-up selection → shared
chapter/reference UI. Validate Human 1–20 first, then every later checkpoint and all 33 branches.
Keep unresolved late dungeon bundles visible; data ingestion alone does not author them.

Required regressions include numeric zero versus missing XP, locale separators, explicit selected
level, primary data versus historical/comment contamination, edition/ID mismatch, changed/conflicting
rewards, fresh records without XP capability, cursor/pacing preservation, duplicate hand-ins,
multi-stage/visit chains, individual eligibility, overlapping/sequential kill objectives, level-up
between hand-ins, level-60 conversion boundary, unknown combat, unequal party bars, optional XP
skipping with mandatory unlocks and reload/bookmark compatibility. Produce an audit of every
checkpoint's budget; unit test success alone is not a coverage sign-off. Freeze approved route,
reward and rules hashes for the subsequent RestedXP export; do not silently rewrite an approved
running guide when a new page observation arrives.

This research changed documentation only. The crawler was not resumed or reprioritized, and no
website, addon, native data, commit, push or deployment was changed.

## Latest delivery target: approved premade-five route → RestedXP (October 13, 2026)

The owner confirmed the next authored edition is an ultra-efficient coordinated five-player
dungeon-quest route through 60: batch necessary world chains and shared-kill work, skip inefficient
personal collection filler, and make progression depend on actual XP/quest readiness. The website
is the review/test surface; after owner approval, compile that exact frozen revision into a separate
KFC guide pack for RestedXP. Do not maintain independent web and addon quest orders.

The every-stop preparation plan, installed DungeonJournal 1.6.3 audit, new Alliance SM quest,
base-versus-adjusted XP rules, candidate 2.375× ordinary bonus tier, faction-parity what-if,
adaptive late-game checkpoints and compiler/export gates are specified in
[the expanded circuit plan](forever-leveling-dungeon-route-choice-plan.md#five-player-speed-guide-and-final-restedxp-edition-2026-10-13-expanded-plan).
Its [source/calculation receipt](forever-leveling-premade-xp-audit.json) is research data, not a live catalog.

At that checkpoint, the existing compiler remained a Westfall/Thanes preview and installed RestedXP
was v4.11.23;
the v4.11.14 references below describe the original verified release. Use public custom-guide
registration for the installable pack; the account-sensitive GUI paste format is not a proven
raw-text import path. The expanded 1–60 browser route is implemented; the full addon export is now a
local review artifact and remains pending in-game approval and validation. Default At-level gates
remain conservative; the requested-target
policy is an explicit experienced-party choice, never a substitute for quest pickup requirements.
Supporter/payment activation is unchanged.

The next dungeon-preparation, chain-state, reward-choice and marginal/full-trip comparison phase is
specified in [the dungeon integration plan](forever-leveling-dungeon-integration-plan.md).
It is researched, not implemented; the deployed reader-quality release is recorded separately.

## Revised product direction: dedicated Forever Leveling

The owner's October 4 feedback supersedes the original Encyclopedia-first placement and
calculator-first entry flow. **Forever Leveling** is now live as a primary navigation product at
`/forever/leveling`: faction → race → Speed / Chill / Group → compatible small level brackets →
current ordered quest list. Keep pace separate from party size/readiness. Preserve current lists
before the later mode-specific route refactor; do not assume a premade removes travel or permits
ignoring quest requirements.

The inspected evidence, proposed screen hierarchy, catalog adapter, state/URL migration and
verification gates and implementation handoff are in `forever-leveling-experience-plan.md`.
This UX revision is deployed. The legacy Encyclopedia URLs documented below redirect to the new
dashboard/reader and explicitly preserve old saves. Release/rollback: `forever-leveling-release-2026-10-04.md`.

The owner subsequently confirmed redistribution authorization. The published implementation includes
all 157 decoded guide variants (22,604 source steps, 2,394 quest IDs), with readable chapters through
60 for all faction/race choices. Conditions, source controls, unresolved continuations and the beta
cap remain explicit. See `forever-leveling-archive.md` for the importer, safety boundaries and deployment
handoff. This does not extend the original Westfall calculator, supporter addon or playtested coverage.

## First slice implementation and dungeon timing

The first original release is Alliance Westfall 13–15, version `0.1.0`, authored in
`packages/leveling`. Browser pages, quest definitions, prerequisite checks and the RestedXP compiler
share that model. It is class-neutral quest/travel guidance, not a class-specific leveling simulator
or a full 1–60 guide. That original release does not include the decoded RestedXP collection;
the separate authorized local archive described above now powers the extended readers.

The owner's dungeon timing instruction uses the linked Wowhead guide's **At level** band as the
minimum scheduled visit level for solo and prepared groups alike, independently of its Hard/Medium
bands or minimum quest pickup level. Pickup/access requirements may move the run later, never earlier:

```text
plannedVisitLevel = max(At level, minimum pickup levels of selected unfinished quests)
```

Hall of Thanes defaults to 14 with Important Heirlooms and An Ancient Grudge. Selecting The Restless
Dead or Old Ironforge Incursion moves the bundle to 15; Treaty moves it to 16, outside this slice.
Deadmines is a later level-19 comparison, not an immediate level-13 replacement. Its preparation
remains available in Westfall. These targets are reference recommendations, not hard entry locks or
proof of optimal XP/hour; current pickups still require a beta check.

Before entry, only retained XP already earned by then counts. Dungeon rewards and post-visit catch-up
cannot unlock that earlier checkpoint. After the return, the calculator includes retained work,
additional rewards and explicitly timed catch-up before checking continuation. It excludes completed
rewards, subtracts rewards already in the original plan, groups shared XP once, checks preparation,
and includes travel in both directions. Blank rewards remain unknown and cannot produce an applyable
recommendation. A visit beyond level 15 can be compared but not applied to this browser slice.

The directory publishes fourteen early/midgame difficulty profiles through Uldaman, with beta-cap
warnings and explicit unauthored-route labels. Only Hall of Thanes and Deadmines have a selectable
quest bundle in the first calculator. Do not present other reference rows as implemented routes.

### Current evidence and developer operations

- `leveling-evidence` in the existing .NET extractor opens current Classic Beta CASC and extracts
  `QuestV2`, `QuestXP`, and `gametables/xp.txt`. Reports pin build, definitions, hotfix and curve hashes.
- The reviewed extraction is build **70205**, definitions
  `3e46d21a41a07ce7e63835fd79c561e0d5dce92b`, hotfix
  `513d4ee593b2b2d9d24819288b5316383ece102cef988a64a3978f21c65fef4b` and curve hash
  `935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6`.
- The Total column supplies the level curve: 13→14 is 11,400 XP, 14→15 is 12,900 XP. These client
  values are **not runtime-confirmed**. Quest identity/difficulty tables do not bind each quest's
  individual reward or true prerequisite chain. The browser therefore asks for actual current XP.
- Wowhead's October 2 pickup references override the installed Journal's earlier conflicting Hall
  levels for conservative scheduling, with the discrepancy disclosed. Prerequisite chain facts are
  separate reviewed reference data; none are inferred merely from ordered catalog rows.
- `pnpm leveling:addon` generates a deterministic maintainer ZIP and hash manifest under
  `artifacts/leveling/0.1.0/`. It requires the local `zip` executable. The compiler verifies quest
  action order, emits objective indexes required by the installed loader, and registers a separate
  KFC group against RestedXP v4.11.14 on build 70205. It does not modify the installed addon.
- After manual installation, `/kfcguide xp` records `UnitXPMax`; `/kfcguide observe` records up to
  100 quest turn-ins until reload, and `/kfcguide stop` unregisters collection. These are explicit
  observations, not scans. Secret values are rejected before comparison; saved state is validated.
  `/reload` writes the normal SavedVariables file. Observer mock tests are in
  `apps/addon/KFCForeverGuides/Observer.test.lua`; they are not a live WoW compatibility claim.
- Review packages also include the separate `GrindObserver.lua`. The guide allowlists and prints the
  exact checkpoint ID; an opt-in session records the public XP bar, active/combat duration, party and
  area context, contamination counters and bounded target-name kill mix. Raw SavedVariables require
  explicit offline approval before `campaign-grind-evidence.v1` can enter an audit. Recording and
  review are documented in `docs/forever-leveling-grind-evidence.md`.
- Reward observations now use build-guarded sessions with exact package and private character
  provenance. `campaign-quest-reward-evidence.v1` exports only reviewed exact-level facts and never
  promotes a scaled observation to base XP. The audit and addon compiler accept it only for the same
  runtime build; see `docs/forever-leveling-reward-evidence.md`.
- `QuestObserver.lua` records bounded manual sessions for named-target, personal eligibility,
  lifecycle, pickup-level and source-gate checks. A deterministic build-70450 plan contains 112 task
  pairs across 65 quests. Explicit review redacts character and quest text, but observations do not
  clear global route rules until the full required party/edition/lifecycle context exists; see
  `docs/forever-leveling-quest-validation.md`.
- Browser planning choices are schema/version-checked, saved locally and shareable in a URL without
  character identity. The ordered selected branch appears only after a positive, eligible comparison.
  The addon preview packages the default level-14 bundle; custom browser selections do not silently
  change an installed addon. Horde/later-zone coverage and checkout remain visibly unavailable.

Next release gates: verify the runtime curve and reward observations, play through pickups/objectives/
turn-ins/return on this build, extend the supported route, then implement and test the inspected
Revolut contribution/entitlement flow using supplied protected configuration. No payment endpoint,
database migration or supporter entitlement was added for this first preview.

The public directory/route and community `/addons` link are live. Helper release is
`kfc-helper-leveling-preview-20261004-r1`; community build is `.next-release-leveling-20261004-r1`.
Verification passed: 27 leveling tests, 105 web tests, 312 community tests, typechecks/lint, clean
Linux workspace check/build/formatting, .NET Release build, observer/registration Lua mocks,
nineteen desktop/mobile browser assertions and live metadata/quest-level checks. Maintainer ZIP is
4,999 bytes with matching Mac/Linux SHA-256
`e819d885263e2d9c361ce1af7186f71033b70e92b3a05ff29cb0bc07c6bd9df7`.

## Confirmed product decisions

- Target WoW Forever in the **Classic Beta** installation, with launch-day zone congestion as the
  main problem to solve.
- Publish **Forever Leveling as a primary KFC Helper product** at `/forever/leveling`, with free
  chapter browsing and optional XP/time comparison. The existing live preview remains at
  `/forever/encyclopedia/leveling` until the reviewed navigation/URL migration is implemented.
- Offer an optional **€9.99 contribution supporting the small team and its free community tools**.
  The RestedXP guide is a supporter benefit available after the contribution is confirmed.
- Follow the exact Revolut popup/confirmation flow in
  `/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`.
  The implementation path is confirmed; protected production configuration will be supplied later.
- Use support/donation language in the player interface: **“Support the team · €9.99”**,
  **“Thank you for supporting the tools”** and **“Download your supporter guide.”** Explain the
  €9.99 contribution and guide access together. Browsing the guide and calculator remains free.
  Do not describe the contribution as tax-deductible or imply charitable registration.
- Link from primary Helper navigation, the Forever home screen,
  `https://www.wowforeverdiscord.online/addons` and an Encyclopedia cross-link. Keep the helper's
  current branding and infrastructure.
- Treat 25 minutes per dungeon and a visit every 2–3 levels as hypotheses to test. Recommend a visit
  when its quest rewards, entry requirements and total detour time support it.
- Start route validation with **Alliance Westfall 13–15**, then extend through the current playable
  beta range. Character class remains selectable; a particular class has not been confirmed.

The first public route should state its actual faction, class coverage, level range and tested build.
Do not advertise a short beta dungeon companion as a complete 1–60 guide. Expand coverage in reviewed
releases rather than implying that untested sections already exist. The proposed first supporter release
is the supported Alliance route through the playable beta range, with dungeon alternatives. Horde
routes follow the same validation process before being advertised as supported.

## Existing projects and source findings

| Concern                    | Existing location                                                           | What the implementer should reuse                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Helper UI and public guide | `/Users/dimitarjilanov/work/test/wow-trader/apps/web`                       | Next.js App Router, Encyclopedia navigation, metadata helpers and KFC design tokens                                                       |
| Quest/map reference data   | `apps/web/src/lib/forever-world.ts` and existing Forever data packages      | Build-specific identities and evidence; inspect current query contracts before extending them                                             |
| Contribution persistence   | Existing PostgreSQL/Drizzle code in `packages/db`                           | Existing migration, transaction and role conventions                                                                                      |
| Community listing          | `/Users/dimitarjilanov/work/test/discord-website`                           | `app/(site)/addons/page.tsx` and `content/community-tools.ts`                                                                             |
| RestedXP runtime           | `/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/RXPGuides` | Installed v4.11.26; original loader inspection was v4.11.14: `GuideLoader.lua`, `functions.lua`, `SettingsPanel.lua`, `DB/forever/db.lua` |
| Supplemental dungeon facts | Installed `ForeverDungeonJournal` v1.4.4                                    | Quest identities, pickup/turn-in locations and chain leads; current rewards still require observations                                    |
| Private analysis           | `/Users/dimitarjilanov/Desktop/restedxp-analysis`                           | Inventory, quest coverage, congestion candidates and math scenarios; keep private source exports out of public assets                     |
| Payment integration        | `/Users/dimitarjilanov/work/vrachka.bg`                                     | Existing Revolut implementation, order handling, webhook verification and secret configuration                                            |

The supplied RestedXP file contains **157 guides**: 98 Alliance and 59 Horde. Its decoded content
matches the installed guide caches. The analysis found 22,604 raw steps, 2,197 dungeon-related steps
and 1,946 XP checks. These counts include alternative faction/race/class branches; they are not the
number of steps a single character will follow.

The import is an account-derived encrypted, compressed guide bundle. A universal download cannot
be made by handing other players that import string. Keep this bundle as a private reference for
analysis and personal comparisons. Public browser text and the supporter artifact should come from
original KFC-authored route data, or separately authorized material with confirmed distribution
rights. Do not publish account cache keys or the private decoded collection.

The current import does not include the Ruins of Lordaeron or Excavation quest entries in the
reviewed supplemental catalog. Hall of Thanes coverage is incomplete. Classic Deadmines routing is
already present, so those existing rewards must not be counted again as a new improvement.

## One route model for browser and addon

Author an original structured route once. Render it into the browser and compile it into the
RestedXP edition. Avoid maintaining separate handwritten routes that drift apart.

Use strict TypeScript and the repository's existing schema validation. Inspect the Forever packages
before choosing the owning module; extend an appropriate existing package or create a focused
leveling package only if it is needed by both the browser and compiler.

The model needs these records:

| Record             | Required fields and relationships                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route release      | Stable ID, version, faction/class/race coverage, level range, client product/build, publication state, evidence date and compatible addon versions       |
| Quest              | ID, title, faction/class/profession restrictions, minimum pickup level, objectives, pickups, turn-ins, required items and availability evidence          |
| Reward observation | Quest ID, XP, character/turn-in level, build, observed date, source and confidence; unknown must remain distinct from zero                               |
| Dependency         | Explicit predecessor ID, relation kind: mandatory prerequisite, breadcrumb, follow-up, mutually exclusive alternative or shared objective                |
| Route step         | Stable ID, action, relevant quests/objectives, position/travel context, conditions, dependencies and shared-objective group                              |
| Outdoor block      | Remaining quest rewards, remaining kill/exploration XP, travel/combat/collection time, congestion assumptions, skip candidates and retained dependencies |
| Dungeon visit      | Entry requirements, selected one-time quests, prerequisite work, pickup/turn-in route, expected kills, time components and rejoin checkpoint             |
| Checkpoint         | Required level/XP, required quest states, travel unlocks and class abilities before a later step or dungeon                                              |
| Artifact manifest  | Route release ID, format, supported build/addon, size, SHA-256, coverage and installation instructions                                                   |

Store source facts separately from planning estimates and player-entered values. Record prerequisite
edges explicitly: an ordered list in an addon catalog is not automatically a mandatory chain.
Some lists include the dungeon quest itself and later follow-ups; those must not become prerequisites.

Build/phase availability is separate from presence in the client or a third-party catalog. Reuse the
Encyclopedia's existing evidence vocabulary instead of inventing a contradictory status system.

## XP and time calculation

Calculate replacement of a remaining outdoor **block**, not each overlapping quest independently.
Count shared kills and travel once. XP already earned and time already spent are sunk values.

```text
omittedXP = remaining outdoor quest rewards + omitted kill/exploration XP

addedXP = newly added dungeon quest rewards
        + additional dungeon kill XP
        + incremental prerequisite/other XP earned by the detour
        - XP already counted for those activities in the retained route

extraDungeonMinutes = clear + extra travel/pickups + idle group wait
                    + extra prerequisite work + extra turn-in travel

shortfallXP = max(0, omittedXP - addedXP)
catchupMinutes = 60 * shortfallXP / achievable alternative XP per hour
savedMinutes = remaining crowded outdoor minutes - extraDungeonMinutes - catchupMinutes
```

Only charge time and add XP that change relative to the retained route. Productive questing while
forming a party is not idle wait. Pickups already on the retained path are not another travel charge.
Include losses from skipping required prerequisite quests, or preserve them and remove them from
the omitted block. Do not count XP from a quest that cannot be completed during this visit.

Validate XP at **every intermediate checkpoint**, including before the dungeon. Obtain the active
Forever level curve from authoritative client/runtime data; do not silently use the Classic curve.
If `N(L)` is XP needed to advance from level L, sum its intervening values and current progress to
test reachability. If the curve or a required reward is unknown, show an incomplete calculation
rather than a confident recommendation.

Support unknown rewards, partial objectives, completed quests, existing dungeon visits, missing
prerequisites, faction/class restrictions, multi-dungeon quests and repeatable rewards. A one-time
quest may contribute only once across the entire plan. A zero catch-up rate is valid only when no
XP shortfall needs catching up. Reject blank, negative or non-finite numerical inputs as appropriate;
blank XP must not silently become zero.

Example scenarios are estimates, clearly labeled:

- 20,000 XP in 90 crowded outdoor minutes versus 20,000 added XP in a 25-minute clear plus 15-minute
  detour saves 50 minutes. Against a 30-minute outdoor block, the same visit costs 10 minutes.
- Alliance Crest of Lordaeron (95189) reportedly awarded **6,200 XP**. This is a player observation,
  not a verified universal current reward. Its full 6,200 XP is added if the quest was absent; its
  improvement over a plan already counting 2,600 XP is 3,600 XP.
- At an assumed alternative rate of 20,000 XP/hour, a 40-minute visit needs more than 13,333.33 added
  XP to improve time. The Crest alone does not establish that the full trip is worthwhile.

Blizzard changed dungeon quest bonus XP and spawn behavior on October 1. Do not apply a blanket
triple multiplier, and do not use RestedXP's global `#xprate` to represent a bonus confined to
dungeon quest rewards. Store real observations with their effective dates instead.

## Free browser experience

The revised main experience is the dedicated Leveling product, with no account or payment needed
to browse. Follow `forever-leveling-experience-plan.md` for the faction/race/style onboarding and
chapter-first reader. The capabilities below remain applicable inside that flow; the calculator
and contribution controls are not the initial screen.

1. **Choose a character and route.** Faction, class, race where needed, level/current XP, already
   completed quests, supported build and route coverage. A shareable URL preserves non-sensitive
   planning choices; browser-local progress can be added using existing app conventions.
2. **Read the ordered leveling route.** Show objectives, pickups, turn-ins, training/travel steps and
   rejoin checkpoints. Mark blocks that may become slow under crowds and explain their alternatives.
3. **Compare a dungeon detour.** Select eligible one-time quests, inspect prerequisites and enter or
   review evidenced XP, clear time, travel, waiting and catch-up rate. Offer quiet/busy/severe crowd
   scenarios as visible assumptions rather than guaranteed measurements.
4. **Review the result.** Show added versus omitted XP, extra time, catch-up work and estimated time
   saved. Explain blocking level/quest requirements and shared objectives. Preserve an incomplete
   state when important data is absent.
5. **Apply the browser branch.** Select the replacement only if the plan remains valid. Show the
   retained prerequisites and exact rejoin point. Keep the original alternative available.
6. **Support the team.** Explain how a **€9.99 contribution** helps maintain the free tools. Show the
   RestedXP supporter guide's version, coverage, compatibility and installation method before
   opening the same-page Revolut popup. Keep the free guide and calculator usable throughout.

Provide loading, empty faction/class coverage, unknown evidence, invalid inputs, unavailable dungeon,
infeasible checkpoint and successful comparison states. Use semantic labels, keyboard controls and
mobile layouts without horizontal overflow. Keep developer details out of the normal player flow.

### First route review: Westfall

These are candidates for observation and dependency review, not six unconditional skips:

| Quest                       | Potential launch-day delay                | Shared work or preservation concern                                                             |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 64 — The Forgotten Heirloom | Many players converge on one wardrobe     | Check while passing; respawn behavior changed in October 1 notes                                |
| 151 — Poor Old Blanchy      | Eight contested oats objects              | Collect opportunistically on retained travel; update any quest-state branch                     |
| 9 — The Killing Fields      | Tagging twenty Harvest Watchers           | Shares Okra with Westfall Stew and oil with Keeper of the Flame (103)                           |
| 22 — Goretusk Liver Pie     | Repeated kills for eight livers           | Boars also provide snouts for Westfall Stew                                                     |
| 38 — Westfall Stew          | Several ingredient loops and drop targets | Shares birds/boars, Watchers and murlocs; Murloc Gills (92744) contributes to a Deadmines chain |
| 102 — Patrolling Westfall   | Gnoll targets and paw drops               | Include the XP from gnoll kills actually omitted                                                |

Preserve the Defias Brotherhood path 65 → 132 → 135 → 141 → 142 → 155 when counting the final
Deadmines reward (166). Review its relationship to Red Silk Bandanas (214); conservatively retain
Red Leather Bandanas (153) until the active server gate is confirmed.

Destruction in Deadmines (92753) has the Toxic Soil path through 92742, 92744, 92745, 92747, 92748,
92749, 92750, 92751 and 92752. It costs outdoor time. Include it only if its whole contribution is
worthwhile, rather than preserving every long chain merely because it ends in a dungeon.

The analyzed source already disables Harvesting the Harvesters (92909). Do not count that existing
omission as a new improvement. Preserve class training, travel unlocks, and the level checkpoint
before accepting the Defias chain. Before modifying any personal guide, check all accept/complete/
turn-in steps, quest-state conditions, labels, `#requires` and `#completewith` references together.

## RestedXP supporter guide and installer

The supporter edition implements the same reviewed route and dungeon branches in game. The browser's
public content and downloadable artifact must identify the same release and coverage. Contributions
support the team's work across the community tools; browser math and basic route instructions remain
freely available. Guide access is the stated benefit after a confirmed €9.99 contribution.

### Packaging decision

The installed import textbox accepts account-derived encrypted bundles. Plain guide text is not a
drop-in replacement for that encoded input. Do not promise a generic copy/paste import until a
supported custom-guide import/export workflow has been verified.

The recommended first packaging path is a small **KFC guide addon** installed alongside RestedXP:

```text
Interface/AddOns/KFCForeverGuides/
  KFCForeverGuides.toc
  Guides.lua
  README.txt
```

Declare the appropriate Classic Beta interface version and dependency on `RXPGuides`. Register
original guide content through the exposed `RXPGuides.RegisterGuide` API under a separate KFC group.
Confirm lifecycle and version compatibility with the installed loader. Use existing supported
quest/progress directives, faction/class conditions and XP checkpoints; verify exact syntax from
the runtime before emitting it.

The current Forever addon registry lacks several new dungeon tags, and standard dungeon selection
is hidden in Forever settings. Do not emit unsupported `.dungeon` tags and assume the branches will
work. Prefer separate named dungeon alternatives in the KFC group for the first release; validate
selection and return-to-route behavior without changing RestedXP core. A later integrated selector
requires explicit compatibility work, tests and a documented update strategy.

The compiler must validate unique step IDs, dependency cycles, quest restrictions, ordering and
rejoin checkpoints. Emit deterministic artifacts with a manifest and SHA-256. Do not grant XP in
guide code: `.xp` checks progress; it does not award it. Do not represent a supported full route by a
file containing only reminders or a quest catalog.

### Install and update flow

Start with a ZIP download and accurate manual instructions: exit/reload as needed, extract the KFC
folder into the selected installation's `Interface/AddOns`, enable both addons and select the KFC
guide group. Show Windows and macOS locations, the intended Classic Beta product and how to verify
the loaded release. Do not overwrite RestedXP files or SavedVariables.

If “implementator” includes a one-click installer, make that a later adapter in the **existing KFC
Companion**, after inspecting its architecture. It should select the correct WoW installation,
check compatibility and the artifact checksum, install only the KFC-owned folder, preserve/restore
its prior version and report missing RestedXP or a running-game conflict. This is optional; the
manual ZIP path must fully work first. Do not build a second desktop application solely for this.

No addon should attempt to collect a player's WoW credentials. Supporter authorization belongs to
the website download service; the installed guide is Lua content and cannot be made uncopyable.
Account binding or obfuscation is not a prerequisite for a reliable supporter guide.

## Team support, Revolut checkout and guide fulfillment

### Player-facing copy

The call to action is **“Support the team · €9.99.”** Explain: “Your contribution helps our small
team build and maintain free tools that improve the experience for everyone. As a thank-you,
confirmed supporters can download the KFC RestedXP guide.” Show exactly which guide edition and
coverage the supporter receives. The free browser route and calculator are available without
contributing.

Use “contribution,” “support,” “supporter guide” and “thank you” for normal player-facing text.
Keep internal Revolut billing/order status names unchanged so confirmation remains compatible with
the existing code. Do not imply a registered charity, tax deduction, recurring donation, variable
amount or unconditional guide access: this plan is a one-time €9.99 contribution with a stated
supporter benefit. If the contribution amount later becomes optional, revise entitlement rules
and copy together.

### Exact implementation reference, inspected

The source project is `/Users/dimitarjilanov/work/vrachka.bg`:

| Source                                                                            | Verified behavior to reuse                                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/checkout/checkout-sheet.tsx`                               | Same-page dialog, email, accepted terms, product summary, server-created order, Revolut popup and server status confirmation                                                           |
| `apps/api/src/billing/billing.controller.ts`                                      | `POST /billing/checkout`, `GET /billing/orders/:orderId/status`, `POST /billing/webhook`; raw webhook body and signature/timestamp headers                                             |
| `apps/api/src/billing/billing.service.ts`                                         | Server product/price validation, pending order persistence, Revolut order creation, provider reconciliation, signed webhook checks, duplicate-event handling and paid-order processing |
| `packages/types/src/index.ts`                                                     | Checkout request/response and `pending`, `paid`, `failed`, `cancelled`, `refunded` order contracts                                                                                     |
| `packages/db/prisma/schema.prisma`                                                | Existing order/payment persistence relationships; map these concepts into Helper's Drizzle/PostgreSQL conventions                                                                      |
| `apps/api/src/billing/billing.service.spec.ts`, `tests/billing-lifecycle.spec.ts` | Existing lifecycle/reconciliation test scenarios to adapt for guide delivery                                                                                                           |

The frontend loads `https://merchant.revolut.com/embed.js`, initializes `RevolutCheckout` with the
server-issued order token and selected environment, and calls `payWithPopup`. Its exact state
sequence is `idle → creating → waiting → confirming → paid`, with an error branch. Popup success
starts confirmation; it does not grant the product by itself. Status polling starts after 900 ms,
continues every 2 seconds and stops after 30 attempts, preserving the order when confirmation is
late. Retain this behavior and its cancellation/error handling, with KFC styling and support copy.

The backend checks pending orders against Revolut when the status endpoint is read, so a missed
webhook can still reconcile a confirmed contribution. It verifies webhook signatures against the
raw body, applies a timestamp tolerance and deduplicates events. Adapt those reviewed mechanisms,
not just the frontend sheet. Provider callbacks are not sufficient for fulfillment, consistent with
[Revolut's popup documentation](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/pop-up).

The referenced server currently declares API version `2026-04-20` and uses `REVOLUT_ENVIRONMENT`,
`REVOLUT_API_KEY`, `REVOLUT_SANDBOX_API_KEY` and `REVOLUT_WEBHOOK_SECRET`. These are inspected
configuration names, not supplied credentials. Reuse approved configuration through protected
server settings. Confirm the SDK/API option compatibility during implementation; do not blindly
copy local type declarations as the complete provider contract.

### Adaptation into Helper

Set the server-controlled contribution to **999 euro cents**, **EUR**, quantity one. Add a dedicated
supporter product and route release binding. Replace tarot/reading delivery with guide entitlement
and download delivery. Remove unrelated reading/context requirements, Vrachka branding, receipt
wording and the existing `GADATEL` statement descriptor; use the team's actual approved merchant
settings. Keep the checkout mechanics and confirmation behavior exactly as referenced.

Helper uses Next.js and Drizzle. Adapt the billing adapter to that architecture rather than adding
NestJS/Prisma merely to reproduce the reference application. Do not direct Helper contributors to
Vrachka's production product endpoints or require accounts on that unrelated site. Existing
provider account/configuration can be reused through an appropriately scoped deployment.

Implement the complete flow:

1. The support sheet shows guide coverage and €9.99, collects email and appropriate accepted terms,
   and submits the dedicated product/source path to the server. Store an internal pending order
   tied to the released guide and a buyer-bound access proof.
2. The backend fixes amount/currency, creates the Revolut order and returns the existing-style
   response: amount, currency, environment, local/provider order IDs, product and popup token.
3. Open Revolut over the current page using `payWithPopup`. Use the reference success, cancel and
   error callbacks. No separate hosted-checkout redirect is the primary user experience.
4. On popup success, enter `confirming` and poll the server using the reference timing. Display
   “Confirming your contribution” until the backend has verified the final order status.
5. The verified webhook and status reconciliation update the local order. Validate the expected
   order/product, EUR amount and completed capture before granting access. Use transactions and
   idempotent entitlement creation; handle duplicate, late and out-of-order events.
6. On confirmed support, show “Thank you for supporting the team” and “Download your supporter
   guide” inside the sheet. Paid artifacts stay outside `public/`, public route payloads and static
   assets. Issue buyer-authorized or short-lived protected download access.
7. Keep order/status and recovery links working if the sheet closes or confirmation times out.
   A status/order ID lookup alone must not serve the private file. Use buyer authorization or a
   verified recovery mechanism. Refresh/retry must not force another contribution for a completed
   order. An independent retrieval page can reuse the reference order/receipt pattern.
8. Permit authorized re-download and define update eligibility before release. Proposed default:
   updates within the supported edition, with later editions named separately. Revoke new download
   access on a completed refund/reversal, preserving an audit trail; downloaded ZIPs cannot be
   withdrawn remotely.

Support states include unconfigured checkout, creating, waiting for Revolut, canceled, failed,
confirming, confirmation delayed, confirmed support, artifact unavailable, expired access and
refunded. The guide artifact and payment fulfillment must work before activating the support
button. The polling timeout is not evidence that the contribution failed or that another one is
required.

No provider secrets belong in the plan, source control or client responses. The existing order
popup token is different from the secret API key. Extend the existing notification/recovery pattern
only as needed for supporter guide access; do not carry over unrelated tarot/report workflows.

## Work packages for the implementer

These are implementation responsibilities and dependency order, not authorization to spawn agents.
Read the applicable `AGENTS.md` files and the installed Next.js documentation. Both repositories have
existing uncommitted work: inspect it first, preserve it, and deploy only changes belonging to this
product. Do not create commits or branches without an explicit request.

| Order | Package                       | Concrete output                                                                                                          | Completion evidence                                                                                   |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1     | Source and reward audit       | Reviewed quest IDs, true prerequisite edges, current XP observations, level curve, available dungeons and route coverage | Build/date/source recorded; unknowns remain unknown; playable route scope stated                      |
| 2     | Original route authoring      | Ordered Alliance route with congestion alternatives, dungeon visits, class conditions and rejoin checkpoints             | Dependency review and playthrough; pickups/turn-ins work; no private bundle republished               |
| 3     | Calculation engine            | Pure typed functions for incremental XP/time, overlapping objectives, one-time rewards and checkpoint reachability       | Focused regression tests including impossible and unknown states                                      |
| 4     | Browser guide                 | Dedicated Leveling entry, faction/race/style onboarding, chapter dashboard, current-list reader and optional comparisons | Desktop/mobile, keyboard, profile isolation, preserved quest order and real-data checks               |
| 5     | RestedXP compiler and package | Original KFC addon ZIP, manifest, deterministic build and installation instructions                                      | Loader/parser checks and actual Classic Beta import/install/playthrough with the stated addon version |
| 6     | Existing Revolut support flow | €9.99 support sheet/popup, verified contribution, entitlement, protected guide download and recovery                     | Reference flow parity, sandbox lifecycle/access tests and protected configuration supplied            |
| 7     | Community discovery           | Primary navigation, Forever home card, Encyclopedia cross-link, metadata/sitemap and addons listing link                 | Correct destination and coverage/contribution wording; no link advertises an unavailable product      |
| 8     | Release                       | Versioned route/artifact, reviewed migrations/configuration, staged deployment and rollback                              | Staged smoke tests, artifact checksums and required product/payment readiness confirmed               |

Likely Helper touchpoints are the new `apps/web/src/app/forever/leveling/` routes, the existing
Encyclopedia leveling routes for redirects, `site-header.tsx`, the Forever home screen,
`forever-encyclopedia-nav.tsx`, overview cross-links and sitemap, focused leveling components and
shared catalog/profile/route/math modules. Contribution/download handlers and database migrations
remain a separate later supporter work package, not a requirement of the chapter-first UX revision.
Helper handler locations must follow local conventions; the inspected Vrachka billing contracts and
popup/status behavior are the required reference.

The community site's change stays limited to direct navigation/tool links and their shared
destination constants; the revised plan proposes a visible Leveling entry there as well.
Guide content, calculations and supporter artifacts belong to Helper. The installer adapter belongs to the
existing Companion only if that later phase is selected.

## Verification and release conditions

### Calculations and route

- Prove the 90-minute/40-minute example saves 50 minutes, and the 30-minute/40-minute example costs
  10 minutes. These are test scenarios, not public run measurements.
- Check baseline subtraction: 6,200 minus 2,600 equals 3,600 incremental XP.
- Count shared kills/travel once; ensure completed and already-planned quests do not add XP again.
- Reject duplicate one-time quest rewards across visits and unsupported faction/class choices.
- Handle unknown reward, unknown curve, zero catch-up rate, partial completion and missing chain states.
- A positive final XP balance must still fail an unreachable pre-dungeon checkpoint.
- Review every skipped quest's accept, objective, turn-in, condition and label references together.
- Validate multi-dungeon class quests and repeatable conversions separately from one-time rewards.

### Browser and guide package

- Run relevant existing typecheck, lint, test and build commands in each modified repository.
- Verify input names, keyboard operation, error/empty states, mobile layout and faction/class changes.
- Confirm browser and compiled route have identical stable step/release IDs and branch semantics.
- Smoke-test the actual addon on Classic Beta with existing RestedXP installed; verify missing-addon
  behavior, guide selection, quest tracking, checkpoints, update and rollback.
- Do not claim live-game compatibility based solely on a compiler or mocked parser test.

### Contributions and downloads

- Sandbox: exact €9.99 EUR contribution, popup cancellation, failure, delayed completion, duplicate/invalid
  webhook, retry after refresh, refund and supporter recovery.
- A forged return URL, another player's order ID or unconfirmed/authorized-only order cannot download.
- Private downloads use appropriate cache controls and never appear in publicly cached HTML/JSON.
- Verify correct artifact version, full bytes and SHA-256 after confirmed contribution and after re-download.
- Release only the advertised tested route scope. Keep the support checkout unavailable until fulfillment and
  the guide artifact work. Stage and smoke-test the existing applications before activation.

## Outstanding inputs and next execution order

The **Revolut implementation path is supplied and inspected**:
`/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`, with its
backend billing service and controller. Only protected deployment configuration remains pending.
The owner has specified team-support/donation wording, not a purchase-focused player flow.

Before the first supporter release, confirm the exact level/faction/class coverage, observe current dungeon
quest rewards and level requirements, establish the active XP curve, and finish a real route and
addon playthrough. Coverage expansion, update entitlement policy and optional Companion installation
must be reflected in the product description. These decisions do not prevent starting the data,
original route, calculation and browser work.

Execution starts with the source/reward audit and one validated Westfall replacement. Use that slice
to prove shared-objective accounting, prerequisites and a real rejoin checkpoint. Then author the
remaining supported beta route, build its browser and RestedXP outputs, connect Revolut, and publish
the matching listing only after the stated readiness checks pass.

## Reference material

- Private analysis: `analysis.txt`, `summary.json`, `dungeon_quest_catalog.csv`, `dungeon_coverage.json`,
  `launch_day_analysis.txt`, `launch_day_westfall_candidates.csv` and
  `launch_day_protected_dependencies.json` in the Desktop analysis directory.
- [Blizzard October 1 beta changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-1/2360696/4).
- [Dungeon quest reference, updated October 2](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).
- [Alliance Crest of Lordaeron, quest 95189](https://www.wowhead.com/forever/quest=95189/crest-of-lordaeron).
- [RestedXP source](https://github.com/RestedXP/RXPGuides); reconcile the pinned archive with the
  installed v4.11.26 files before publishing a current-version addon pack.
- [Revolut popup integration](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/pop-up).
- Owner-specified checkout reference:
  `/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`,
  `apps/api/src/billing/billing.service.ts` and `apps/api/src/billing/billing.controller.ts`.
- Existing repository documents: `docs/helper-encyclopedia.md`, `docs/forever-encyclopedia-plan.md`,
  `docs/production-deployment.md` and the Companion architecture documentation.
