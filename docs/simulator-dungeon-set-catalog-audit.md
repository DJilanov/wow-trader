# Dungeon-upgrade catalog coverage

The October 23 audit found all **72 base dungeon-upgrade pieces missing** from
every catalog checked. Existing optimization results describe their original
catalogs; they cannot establish whether these omitted pieces or sets would win.
This is a source-completeness issue to resolve before claiming complete pre-raid
coverage.

## Current selected-catalog status — October 26, 00:02 UTC

The unchanged auditor was rerun against the actual current source selection and
the existing older tank deployment assembly. Both pointer and asset consistency
checks pass. The scope remains 15 profiles in each space and 25 catalog instances.
The current source-root union still contains 16 of the 72 base IDs: eight
Darkmantle and eight Beastmaster pieces. The remaining 56 are absent from every
source-root selected catalog. The older assembly still has 0/72; this is not a
fresh production check.

New immutable report:
`artifacts/forever-simulator/optimization/catalog-audits/dungeon-upgrades-03522f97d258d60f.json`,
byte SHA `03522f97d258d60f65f7c1f2773eee94c3e8f8782e54c89d3ceebc5b14e86e87`.
The actual 146-source frontend graph was checked before execution and does not
request or include the protected cache module. The audit runs zero native or
browser jobs and performs zero production writes.

The separate selected healer-library audit was also rerun successfully. Its
unchanged immutable report remains `healer-ui-dungeon-upgrades-e2bc3a230a01cd73.json`:
Priest has 0/8 Virtuous pieces across its 993-item, 40-build library; Restoration
Druid has all eight Feralheart IDs across its 1,534-item, 30-build library. The
Druid library does not report structured set membership. These are identity
observations, not stats, effects, acquisition or optimization qualification.
Keep healer-library scope separate from the DPS/tank catalogs above.

A combined scope observation is retained at
`artifacts/forever-simulator/optimization/druid-statistics-correction-v1/source-compatible-resume-v1/remaining-scope-observation-d8e60c6139938af9.json`,
semantic SHA `d8e60c6139938af900f4ca2e2984f8b5c584c828b19e783f295a380689c4636e`,
byte SHA `7717dae307a7ad720f285f57ecbdae1387244d9bddf86a34671d724532d8a155`.
It preserves and supersedes the initial combined summary's uninterpreted healer
rows. No model, candidate, numerical study, selection or deployment was changed.

## Previous selected-catalog status — October 25, after Hunter delivery

The post-selection audit checks the same **15 profiles in each of two spaces**,
with **25 catalog instances**. The source root now contains **16 of the 72 base
IDs** somewhere in its selected catalogs: all eight Darkmantle pieces and all
eight Beastmaster pieces. The selected Hunter release is
`29d2a2c67bc4922af0cef622`; the selected Rogue release is unchanged. **56 base
pieces remain absent from every source-root selected catalog.** All 72 remain
absent from the older tank deployment assembly snapshot.

The immutable report is
`artifacts/forever-simulator/optimization/catalog-audits/dungeon-upgrades-3a0a004f23e81db6.json`,
byte SHA-256 `3a0a004f23e81db67dccf21290d24208b0aa48ff6d01a7e37c8920cf8ad660b8`.
This is identity coverage, not a new stats/effects/acquisition approval or an
optimization result. No catalog, numerical study or selection pointer was changed
by the audit. Separate healer work remains outside these two selection spaces.

## Previous selected-catalog status — October 24, 23:50 UTC

A new run through the actual application presentation resolver checked the same
two selection spaces. The source root now selects **12 catalogs for 15 profiles**;
the tank deployment assembly snapshot selects **13 catalogs for 15 profiles**.
That is **25 catalog instances** across the spaces. Selected manifests, database
asset hashes and selection pointers were checked for consistency during the run.
This is a local audit, not a new live-server check.

All eight base **Darkmantle** pieces, IDs **22002–22009**, are now present with
correct set ID **512** in the source root's selected Rogue release
**3af0f3b699865a9396efdad9**. The other **64** base IDs are absent from every
catalog instance audited here. All **72** remain absent from the older tank
assembly snapshot. Prepared/unselected Hunter, Mage and Druid models are not
counted as selected delivery. Separate healer admission/engine catalogs are
outside these two selected-profile spaces; this audit does not invalidate their
independently recorded work.

The immutable report is
`artifacts/forever-simulator/optimization/catalog-audits/dungeon-upgrades-4cb71836f7d56dcf.json`,
byte SHA-256 `4cb71836f7d56dcffe0406661f22aa9dfff3d8d447b7362289abb65f1e91d2f7`,
semantic SHA-256 `6965b5160afff313813d33f6a7bc853e23d35ff6f1c7e9dafa1a9c3b10620243`.
The completed command log is
`artifacts/forever-simulator/optimization/reviews/dungeon-catalog-current-selection-audit-20261024T2350.log`.
The audit made zero combat/browser jobs or production writes and grants no
numerical or publication admission. Its resolver/pointer hashes are a dated
observational snapshot, not new frozen numerical inputs.

Rogue's separate numerical and UI evidence has also advanced beyond the older
checkpoints below: the full independent confirmation and primary-builder review
passed, both practical margins passed, and all three primaries were selected
locally at **21:51:55.180 UTC**, before the original deadline. See the
[Rogue recovery record](simulator-rogue-dungeon-upgrade.md). Hunter's fresh
confirmation is running; Druid's first ordinary attempt stopped at Hunter's live
workspace lease before captures; the corrected Mage statistics model is built
but awaits the pending additional correction approval and new combat
qualification. Their owning recovery documents carry the detailed current
states. The original 72-piece completion requirement remains open.

## October 23 audit scope

The audit uses the actual frontend presentation resolver, selected release
manifests and hash-verified database assets. It covers two local selection spaces:

- `artifacts/forever-simulator`: 15 profiles selecting 11 catalogs.
- `artifacts/deployments/tank-optimized-20261023/review-root-v1`: 15 profiles
  selecting 13 catalogs, including all three optimized tank models.

These are 24 catalog instances across the two spaces; shared releases are counted
once within each space. The second space is the deployment assembly snapshot,
not a fresh check of the live server. The source-root tank selection differs from
that snapshot, so the source-root selection alone must not be used to claim the
deployed tank models are stale.

The current-client reference is build **1.60.1.70532**. All eight exact base item
definitions for each set exist and have no normalized-source issues. None of the
base IDs, related set variants or identically named variants appears in any
audited catalog.

| Class   | Base set and ID                | Base item IDs                                  | Separately identified alternate set |
| ------- | ------------------------------ | ---------------------------------------------- | ----------------------------------- |
| Warrior | Battlegear of Heroism, 511     | 21994–22001                                    | 1778                                |
| Rogue   | Darkmantle Armor, 512          | 22002–22009                                    | 1676                                |
| Druid   | Feralheart Raiment, 513        | 22106–22113                                    | 1667                                |
| Priest  | Vestments of the Virtuous, 514 | 22078–22085                                    | 1675                                |
| Hunter  | Beastmaster Armor, 515         | 22010, 22011, 22013, 22015–22017, 22060, 22061 | 1669                                |
| Paladin | Soulforge Armor, 516           | 22086–22093                                    | 1673                                |
| Mage    | Sorcerer's Regalia, 517        | 22062–22069                                    | 1671                                |
| Warlock | Deathmist Raiment, 518         | 22070–22077                                    | 1681                                |
| Shaman  | The Five Thunders, 519         | 22095–22102                                    | 1679                                |

Identically named sets are separate identities. Alternate item/set IDs cannot
substitute for base membership. Multiple effects at one threshold also remain
distinct: base Feralheart has both spell 9334 and spell 9344 at six pieces.

## Evidence and readiness

| Work                                                                      | Evidence                                                                                                                                | Status                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Identify missing base pieces                                              | All nine sets and 72 IDs compared against every selected catalog in both spaces                                                         | Implemented                                               |
| Verify the audit's failure behavior                                       | Five tests cover missing IDs, exact membership, alternate sets, inconsistent source data, duplicate identities and input preservation   | Implemented                                               |
| Inventory upgrade quest milestones                                        | Installed Forever QuestieDB 1.0.4 supplies 64 class/faction milestone quests and item requirements                                      | Implemented                                               |
| Prepare current item stat drafts                                          | Existing strict importer normalizes 67 pieces; five pieces retain explicit individual-effect review requirements                        | Implemented; no catalog admission                         |
| Verify Heroism acquisition relations                                      | Eight Forever database quest reward relations reviewed separately; Questie requirements agree                                           | Implemented; server acquisition unobserved                |
| Prepare Heroism stats, bonuses and candidates                             | Eight additions, exact 70532 set-511 effects, isolated Go regressions and all-slot/set proposal checks                                  | Implemented; model admission pending                      |
| Prepare Darkmantle acquisition, stats, effects and proposals              | All eight pieces; combined Go regressions and all 247 multi-piece assignments per Rogue context                                         | Implemented                                               |
| Compile the amended Rogue native/WASM model                               | Fresh frozen build, complete embedded/UI database equality, Go regressions and sixteen actual controls                                  | Implemented                                               |
| Prepare Sorcerer source, rewards and stat drafts                          | Eight pieces, exact base/alternate payloads, sixteen same-TOC associations and eight corroborated Forever reward sections               | Implemented; runtime qualification pending                |
| Prepare Deathmist source, rewards and stat drafts                         | Eight pieces, exact base/alternate payloads, sixteen same-TOC associations and seven corroborated Forever reward sections               | Implemented; runtime qualification pending                |
| Recover Feralheart in the current DPS lineage                             | Reused source/core component, 51 native/Chromium component outcomes and complete 2,703-item model with 154 compiled regression outcomes | Implemented; full-fight controls and optimization pending |
| Verify other seven sets' acquisition, current effects and engine behavior | Quest IDs and current definitions are available; reward review and class-specific engine qualification remain                           | Pending                                                   |
| Compile and qualify amended native/WASM models                            | Requires complete source binding and fresh controls for each affected model                                                             | Pending                                                   |
| Repeat affected item searches and independent confirmation                | Include individual pieces, set subsets and mandatory complete-set comparisons, then geared talent/APL feedback                          | Pending                                                   |
| Publish matching presets, rankings and guidance                           | Requires qualified numerical results and actual UI checks                                                                               | Pending                                                   |

The Heroism preparation is described in the
[Warrior update](simulator-warrior-full-raid-update.md#heroism-recovery-prepared-on-october-23).
The subsequent [Darkmantle recovery](simulator-rogue-dungeon-upgrade.md) prepares all
eight Rogue pieces, their exact base-set effects and actual proposal banks for
Combat, Mutilate and Subtlety. Nine Node tests and combined isolated Go regressions
pass; all 247 two-to-eight-piece subsets and an explicit full-set comparison are
present per context. A separate amended native/WASM model is compiled with exact
embedded/UI database conformance. Sixteen corrected explicit-Forever browser
controls pass admission. The supervised all-slot Rogue search has completed with
stable selections in all three frames and full saved-result replay. Its initial
talent/APL/poison feedback also completed and was independently replayed. The
same class update has completed six stable consume/gear/fixed-builder branches:
Combat Backstab, Combat Sinister Strike, Mutilate, Subtlety Hemorrhage, Subtlety
Backstab and Subtlety Sinister Strike. The all-six confirmation preflight now
passes full source replay with 13,764 pins. It retains 72 genuine inspection-seed
alignment requests and 1,010 planned fresh holdout requests across 44 fixed
batches. Actual alignment and its independent replay have completed all 72
requests. That preparation checkpoint preceded the completed independent
confirmation, primary-builder review and local UI selection recorded in the
current-status section above. The three primary builders were frozen before
holdouts, and the direct cross-builder consumer preserves that original choice.
It has not changed the deployed [tank results](simulator-tank-item-optimization.md).
Old measurements cannot qualify a changed database or binary.

The stat draft preparation uses current 70532 definitions, armor and level-60
rating conversions. The historical database supplies icons only. None of the
drafts carries an inferred class restriction or acquisition approval. Five items
have individual equip effects that the ordinary stat importer correctly refuses
to discard:

| Item                 | Current item ID | Linked spell ID | Review needed              |
| -------------------- | --------------- | --------------- | -------------------------- |
| Darkmantle Boots     | 22003           | 27037           | Stealth effect             |
| Beastmaster's Cap    | 22013           | 27038           | Pet health effect          |
| Beastmaster's Gloves | 22015           | 27043           | Pet critical-strike effect |
| Beastmaster's Tunic  | 22060           | 27225           | Pet armor effect           |
| Beastmaster's Boots  | 22061           | 27206           | Pet damage effect          |

All five retain their raw item-effect links and recursively referenced trigger
spells for runtime review. Their names identify the client-described mechanic;
they are not measured DPS or survival contributions. The 67 successful stat
conversions also require acquisition and set-bonus qualification before admission.
The subsequent Darkmantle preparation reviews the boots' stealth effect within
the declared stationary encounter scope. The subsequent
[Beastmaster source review](simulator-hunter-dungeon-upgrade.md) preserves and
checks all four pet effects, their periodic refresh and their child durations.
Its eight stat drafts were initially outside the catalog; the subsequent reference
supplement covers all eight milestone relations without asserting observed server
acquisition. A separate isolated implementation
now passes the base-set, mana-proc, four pet-effect, range/expiry and reset regressions,
including the Hunter's missing bonus-armor dependency. That receipt also preserves
the existing Valor and Darkmantle tests; no Hunter release or numerical result is
admitted by it. The original 67/5 draft record remains preserved.

The milestone inventory decodes the installed Forever-flavor baked TOC using the
existing bounded QuestieDB reader. It does not execute Lua or apply runtime
authored corrections. Each of four milestone phases has 16 quests. Warrior,
Druid, Hunter, Mage, Priest, Rogue and Warlock each have eight; Paladin and Shaman
each have four. Classic race/class masks are preserved as source facts rather
than assertions about current server access.

QuestieDB's baked **quest-side** fields do not include reward data. Its required-item rows do
not by themselves establish rewards, reward quantities, mutually exclusive
choices, or server availability. The inventory explicitly keeps rewards
unverified. It is private reference evidence; redistribution licensing has not
been assessed. The eight Heroism reward relations come from the separate reviewed
Forever pages, not from an inferred quest-side reward table.

### Item-side reward associations recovered on October 24

The same Forever TOC has an item-side field `questRewards` at index 6. Decoding
that field for all 72 exact base items supplies **128 item/quest associations**
covering all **64 milestone quests**. The new capture uses the existing bounded
CBOR decoder and TOC parser, checks the installed item metadata's field mapping,
and does not execute Lua. Names, base membership, class masks, milestone phases
and faction masks agree with the current client definitions and same-TOC quest
inventory. Paladin retains its Alliance source records; Shaman retains its Horde
records. These are reference-data limits, not newly asserted server restrictions.

Twenty separately reviewed Forever page relations (eight Heroism, eight Darkmantle
and four Beastmaster) match the exact item IDs and corroborate simultaneous
delivery. The remaining 44 quests' associations are recovered, but this item field
does **not** distinguish reward choices from simultaneous rewards or establish
quantities. Those delivery semantics and live server acquisition stay unverified;
the capture explicitly disallows catalog admission, numerical optimization and
publication on its own. Six dedicated tests and the five existing catalog-audit
tests pass; scoped lint passes.

The exact Hunter associations that were missing from the page review are:
bindings 22011 → 8906/8914, and belt 22010 plus gloves 22015 → 8931/8938. This
recovers their source relationships without relabeling inaccessible pages as
successfully reviewed or changing the original immutable drafts.

## Immutable records

The records live under
`artifacts/forever-simulator/optimization/catalog-audits/`:

- `dungeon-upgrades-68d9bcbc4b4e95db.json`, byte SHA-256
  `68d9bcbc4b4e95db5737a02314129423031203aa1fa6efb15c5eb7c02e6b57e4`.
  Includes every set/item identity, per-catalog coverage, actual selected profiles,
  source pins, selection pointer checksums and explicit absence checks.
- `upgrade-quest-inventory-8589c5128f72985a.json`, byte SHA-256
  `8589c5128f72985a15df6265c4375ded6909de26aad2037e846ae5fb826851b3`.
  Includes all 64 milestones, all 4,250 selected/decoded base quests, class masks,
  finishers, required item IDs, pages to review and eight Heroism requirement
  cross-checks. TOC revision:
  `365537a340473291f5af3b7a53a5eca94e2a5f1a`.
- `upgrade-item-drafts-d05c3a8dbff10678.json`, byte SHA-256
  `d05c3a8dbff106787474ffb1c0b2ff5a53783114de2ee3777418bbb35e4fa28f`.
  Preserves all 72 current item definitions and sparse metadata, 67 normalized
  stat drafts, five explicit effect-review requirements and their source spell
  graph. No catalog, engine or acquisition restriction is changed.
- `upgrade-rewards-78ef7ae62d2d2318.json`, byte SHA-256
  `78ef7ae62d2d23187814bdda3061e89e01d79ab9f96fe62884bce15bf81d2fb9`.
  Contains all 128 source associations, 20 page cross-checks, explicit delivery
  gaps and parser/TOC/source pins. Compact source fixture:
  `infra/simulator/fixtures/dungeon-upgrade-reward-source.v1.json.gz`, byte SHA-256
  `e006b8ed9eb644bdcdcbbd9771e38658424ec286c53088bb107e2c8015225e40`.

The audit has zero combat jobs and production writes. Identity coverage alone
does not approve stats, effects, acquisition, an optimization result or publication.

The subsequent [Hunter reference supplement](simulator-hunter-dungeon-upgrade.md#supplemental-reference-review)
corroborates its four remaining milestone reward sections using indexed primary
Forever pages, separately labeled from the four preserved page records. It covers
all eight Beastmaster pieces and both faction associations without changing this
original twenty-page inventory or inferring omitted quantities. Its validated
report retains false catalog/numerical/publication flags; amended-model admission
and actual optimized comparisons remain required.

Hunter preparation has subsequently reached an isolated 2,687-item compiled
native/WASM model, preserving all eight Beastmaster pieces and all 247 set subsets
on each published Hunter style. Database/mechanics regressions and the zero-job
25-control preflight pass. All 25 corrected native/WASM controls and six parent
comparisons subsequently passed, admitting the actual bounded gear search.
Four current gear-request tests and the 198-control gear preflight also pass;
the ordinary all-style gear owner is now running. The all-slot runner,
completed-gear reader, supervised consume/gear/state
feedback runner and independent three-style feedback reader are implemented.
Fourteen feedback-reader source/supervisor contracts pass; an actual positive
completed-feedback replay is still unverified. Completed optimization evidence,
fresh final confirmation and publication remain pending. Fresh-confirmation preparation now
retains every final consume/gear/state contender in fixed-width batches and
requires genuine inspection-seed alignment before freezing holdouts; eighteen
contracts pass. The supervised alignment/confirmation runner is now implemented
with seventeen additional contracts; actual numerical execution remains pending.
The completed-owner confirmation reader is also implemented with fourteen
additional contracts; actual positive sealed-source replay and UI delivery remain
pending. Neither runner nor reader publishes a numerical result on its own.
Exact source bindings and reproduction commands
are in the [Hunter recovery record](simulator-hunter-dungeon-upgrade.md#frozen-native-and-wasm-preparation).

The [Mage recovery](simulator-mage-dungeon-upgrade.md) now captures all eight base
Sorcerer pieces, separate alternate membership, complete current spell payloads
and sixteen same-TOC class/faction item associations. Eight source/stat regressions
pass. All eight Forever reward sections have separate reference corroboration;
four quests also have exact linked base IDs reviewed. The eight normalized
pieces are now appended in the private 2,695-item Mage model; the public catalog
and selected model remain unchanged. Base-ID runtime dispatch subsequently passes
31 native and the same 31 actual Chromium WASM component test outcomes, including
the base thresholds, armor dependency, incoming freeze lifecycle and alternate/
Classic separation. Current 70532 capture resolves its distinct group-3 DR
assignment; damage-break verification remains explicitly unavailable in the
incomplete interrupt table. The full compiled model passes complete embedded/UI
database conformance and 91 compiled regression outcomes. Actual Frost/Fire/Arcane
candidate banks contain 10,661/10,566/10,782 proposals, all 247 base subsets per
style and eight mandatory maximum-set comparisons each. Four bank integration
tests and four current request-adapter tests pass. The adapter preserves Greater
Mageblood and class options, reconciles the published template's declared gear/
talent/APL overrides, and rejects Classic captures or unrelated changes.
Full-fight controls, bounded item/feedback search, fresh confirmation and final
Mage delivery remain pending; no Mage update clock or numerical optimization job
has started.

The ordinary Mage control producer and separate completed-source reader are now
implemented and pass ten and seven contract tests respectively. They require
thirty actual UI captures, full native/browser metric/effect replay and six
unchanged-parent comparisons. The completed reader currently refuses admission
because the actual owner has not completed. A live queue (PID 60212) waits behind
the existing Rogue confirmation, freezes 8,603 inputs and leaves Mage's clock
unstarted. Two additional queue tests, preflight, lint and formatting pass.
Actual control execution, all-style numerical search/feedback, fresh confirmation
and public delivery are still outstanding.

The Mage initial gear producer and completed-source reader are also implemented:
eighteen new files, fourteen passing tests and 8,632 verified source hashes.
A repeated-pass regression found four missing seven-piece Sorcerer alternatives
after a full-set incumbent; a separate v2 bank restores all 247 exact subsets
while preserving unrelated current gear. Actual gear execution is gated on real
completed UI/native/WASM controls. Every applicable enchant, mandatory set and
hand geometry receives a control, with saved protobuf bytes checked alongside
complete metrics. The new code has not produced an accepted Mage selection or
fresh final qualification.

The actual Hunter initial gear owner has now completed, and its independent
completed-source reader passed: all three styles stable, 195,905 admitted
origins, 24,385,780 iterations and 707 stages reconstructed without new jobs.
Hunter feedback preflight passed against canonical completion `15ec685c…`,
with 8,641 pins and zero new fights. Its ordinary `state-recheck` owner is now
running under the original October 25 05:03:16.065 UTC deadline; the initial
completed-gear source replay precedes any feedback combat.
The Rogue confirmation process later stalled on asynchronous runtime I/O. Its
failed run remains preserved. Its exact-command recovery
`fe7e94d7-e9fe-41f9-b715-02cf50fac614`, with the original deadline, source hashes
and all 28 existing RNG records unchanged, completed successfully. Its actual
fresh report `confirmation-all-builders-c5ba963fa985190d.json` records 1,010
requests, 20,200,000 iterations and 44 fixed batches. The producer's 2% and
separate original 1% assessments pass. The combined independent primary-source
reader has now finished successfully, authenticating all parents, claims and
saved stages and directly comparing every other builder's retained arms with
the three primaries frozen before holdouts. Approved 2% and separate original
1% assessments both pass for Combat Backstab, Mutilate and Subtlety Hemorrhage.
The completed log has byte SHA-256
`9a440272d85a07b5a3b5cc60097f3f1725111d3d49b38d561fb8dd7a28d1c9a7`.
Matching local defaults, presets, library, guidance and actual browser delivery
remain required; no public selection changed. The exact native cause of the
earlier runtime stall is unproven.

The unchanged Mage queue dispatched after that exact Rogue success. All thirty
actual UI captures and native/WASM pairs completed with matching DPS, but the
original full-unit validator rejected legitimate duplicate Evocation aura IDs.
The engine registers `Evocation Regen` and `Evocation` under distinct labels,
both ActionID 12051. The failed owner remains preserved. A separate comparator
preserves every duplicate row and compares complete one-to-one multisets with
the original tolerance; altered, missing and extra metrics remain rejected.
Ten correction contracts and explicit lint/format checks of thirteen files pass.
The authorized corrective owner completed all thirty raw/protobuf replays and
six unchanged-parent controls successfully. Its actual prepared source is
`mage-full-raid-v2/prepared.json`, semantic SHA-256
`4b1d904f3b8ad782213677afda5a87da297e1ef7159821ac1f9948a9c9fce558`.
Independent completed admission passed inside the revised gear preflight,
including every raw result/stat protobuf and exact successful corrective owner.
Its three complete domains retain 10,772 / 10,772 / 10,773 candidates and prepare
497 controls. Thirteen combined new contracts pass; the frozen validation
`complete-row-compatibility-validation-95739c5b83c4c021.json` verifies 13,538
hashes, preserves all 8,865 prior campaign pins, and records explicit lint/format
checks of all 23 new sources and ten entry graphs. The numerical gear owner
awaits Hunter feedback priority. Mage's original window remains October 24 17:53:53.844 UTC through
October 25 at the same time. No server mechanic, RNG, public model or overflow
rule changed.

The Mage callback feedback/input layer is prepared and frozen separately:
19 new files, 15 passing tests and 640 preparation pins. It preserves actual
elixirs through both mana policies, remeasures retained states on current gear,
and prepares 81 consume plus 128 state controls covering 598 features. It requires
the real completed gear owner and full source replay. Its supervised numerical
owner and complete-source reader are now implemented in 18 additional files.
All 40 combined contracts pass, with explicit lint/format checks of 37 files and
660 unchanged preparation hashes. Actual control/gear admission, executed
feedback parity and positive completed-feedback replay remain pending; this adds
no Mage score or public qualification. See the Mage recovery record for exact
receipt hashes and the remaining execution gates.

The broader Mage all-style feedback/finalist reconstruction then caught a v1
coverage-budget defect after retained states grew. A separate **v2** chain fixes
duplicate talent expansion and bounds coverage aliases separately, preserving
the original numerical candidate, retained-state and canary limits. The current
feedback v3 command reuses this v2 numerical search; frozen predecessors remain
historical and unchanged.
All **46** combined coverage/preparation contracts pass across **32** new files
and **697** verified source hashes. Every retained current-model contender,
including full Sorcerer, survives exact frame reconstruction, inspected-seed
alignment planning and fixed fresh batches. Previous Mage inspection and entire
100k reservation ranges are excluded. These tests use synthetic metrics with
real typed inputs. The confirmation execution and independent completed-source
reader are now implemented in **23** additional files: **31** contracts,
explicit lint/format checks and bundled producer/supervisor/reader/test graphs
pass. The frozen receipt `confirmation-execution-validation/verify-Yrly9g/`
in the Mage recovery directory preserves all 697 parent pins and freezes **724**
total pins. It requires genuine missing-score alignment, all original RNG claims,
fixed two-20k holdouts, exact terminal owner and complete saved-stage/report replay.
Actual corrected Mage controls and independent completed admission have now
passed as recorded above. Gear, feedback and fresh numerical execution still
remain. A further **30** versioned modules make feedback v3 and confirmation v2
consume the corrected source and raw-wire comparator. **39** compatibility
contracts pass, including unchanged full-100k RNG exclusions, strict report/owner
binding, deadline boundaries and exclusion of incompatible readers from actual
execution graphs. All thirty files pass explicit lint/format checks and entry
graph builds. Validation `compatible-feedback-confirmation-validation-bd2de3bc5a5e2761.json`
preserves all 13,538 prior hashes and verifies **13,573** total pins. Missing
actual gear/feedback CLI checks correctly refuse admission; no new numerical
owner, RNG claim or class clock is created. Matching public delivery and verified
Forever overflow behavior remain pending.

The [Warlock recovery](simulator-warlock-dungeon-upgrade.md) now captures all
eight base Deathmist pieces and separates alternate 1681 from base 518. Current
70532 data retains the exact two-second fear child, proc mask, chance, one-minute
cooldown, movement effect and category; targeting, immunity, damage break and DR
remain unqualified. Eight strict stat/source regressions pass, with actual
lint/format checks across five new files and three bundled entry graphs. The
receipt freezes 756 hashes and preserves all 724 prior Mage confirmation pins.
Seven of eight Forever quest sections have separate reference corroboration;
quest 8943 remains unavailable. All sixteen baked item associations survive, and
links to all eight base items were followed. Runtime dispatch, a complete current
model, actual full-raid optimization, fresh confirmation and public delivery are
still required; no Warlock score or catalog is admitted by source preparation.

The [Druid DPS recovery](simulator-druid-dungeon-upgrade.md) reuses the existing
Feralheart source and core implementation without changing the healer model.
The current DPS database extension preserves all 2,695 parent items and adds
exactly eight current base pieces. Fifty-one native and the same 51 actual
Chromium WASM outcomes pass for Feral/Balance thresholds, both six-piece effects,
incoming current-resource selection, actual shapeshift bars, reset and legacy
isolation. Eight Node contracts and scoped lint/format/bundle checks also pass.
Five new files and 1,249 hashes are frozen; all 756 previous campaign pins remain
unchanged. A separate newly indexed Forever quest 8913 section corroborates the
formerly historical-only reward name, without rewriting the old fixture or
claiming an exact item link/live delivery. The complete 2,703-item native/WASM
model is now compiled, with exact embedded/UI database conformance and **154**
passing compiled outcomes, including **63** Druid outcomes and the actual-item
Bear armor check. All **14** Node contracts pass; eight more source files and
**8,757** hashes are frozen. The bundle has no inherited numerical presets or
qualification, and selected releases remain unchanged. Actual full-fight controls,
optimization, fresh confirmation and public delivery remain pending.

The subsequent Druid preparation authenticates the current local published Feral
raid and Greater-Mageblood Balance setups. Its saved complete banks contain
**11,932** Feral and **11,855** Balance proposals, each retaining all **247**
exact Feralheart subsets and mandatory maximum-piece comparisons for **18**
eligible sets. Twenty control settings are prepared. Nine new contracts and all
eight files' lint/format checks pass. The validation freezes **8,779** source
hashes, preserving all 8,757 previous pins, and changes no selected model,
numerical clock or public qualification. See the Druid recovery record for exact
artifact references and commands.

The next six Druid modules reconstruct all twenty native control requests and
validate the UI capture boundary for both actual specs. Nine additional contracts
cover the exact current templates/options, all five Druid weapon types with
compatible stones or oil, full current item data, native effective-wire equality
and strict rejection of changed capture contexts. All six files pass explicit
lint/format checks; the request artifact freezes **8,789** hashes and preserves
the 8,779 preceding pins. Encoded capture-boundary fixtures are test data rather
than browser evidence. Actual supervised UI/native/WASM execution, positive
completed-source review and numerical optimization remain pending; no combat job or clock
starts during request preparation. Independent preparation validation replays all
twenty inputs, bundles three entry graphs and freezes **8,790** hashes including
the prepared request artifact.

The ordinary supervised Druid control producer and independent completed-source
reader are now implemented in **14** further modules. **18** protocol/effect/raw
metric contracts pass, including full synthetic-response replay of all twenty
actual encoded contexts and four parent comparisons. Valid updated checksums
cannot conceal semantic changes. Actual read-only preflight passes with 8,805
pins; the frozen validation preserves all 8,790 preceding pins and records
**8,807** total hashes, explicit lint/format checks and six bundled entry graphs.
The approved Druid clock was absent at that preparation checkpoint. Actual browser/fight execution and its
positive independent source review still await the complete gear/feedback/fresh
pipeline and shared workspace priority; protocol fixtures do not qualify scores.

The initial Druid gear producer and its completed-source readers are now
implemented in **19** additional modules. The actual-catalog tests cover both
complete domains, all mandatory set/enchant controls, a full-Feralheart dagger
rebuild and an accepted dagger followed by a stable complete second pass. A
further gate verifies original result/stat protobuf bytes for all twenty
completed controls before gear admission; matching summaries/checksums alone
are insufficient. The declaration binds that review hash and the exact current
captured frames. Eight entry graphs and all nineteen files' lint/format checks
pass. All **18** distinct gear contracts now pass: seventeen were unchanged,
and one test request-counter error was corrected and rerun separately with the
original failure preserved. The frozen receipt records **8,830** hashes and
preserves all 8,807 preceding pins. The real gear preflight correctly refuses
pending actual control completion. No numerical job, clock or public selection
starts.

Druid feedback foundations now add **21** frozen modules and **17** passing
contracts. Current published Feral/Balance settings authenticate historical
proposal states without importing old scores. Both full typed state domains,
retained-state coverage, current consume choices, gear-compatible requests and
four-pass consume/gear/talent-APL closure are implemented. Sixty-five state
controls cover 290 features; fifty-four consume controls cover ten axes. The
independent validation `feedback-proposal-validation-c85f96956e2791af.json`
preserves all 8,830 prior hashes and verifies **8,865** total pins, explicit
lint/format checks of all 21 files and ten bundled entry graphs. This is
published-proposal preparation, not completed-gear admission or actual
combat evidence. The Druid clock was absent at that checkpoint. Supervised feedback execution,
raw-source replay, fixed fresh confirmation and matching public delivery remain
outstanding.

Before its first owner, Druid now has a **v2** control/gear/feedback-input chain
using complete-row matching and strict unordered aura-summary matching. The
original numeric tolerance, all rows, ordinary phases and numerical strategies
are preserved. The first 29-test regression run exposed the old positional aura
precheck; that failure remains saved. The corrected run passes **34** metric
contracts and **6** actual-domain/graph contracts. All **31** new files pass
explicit lint/format and entry-graph builds. Control preflight passes twenty
cases with 8,809 pins; gear preflight correctly refuses absent completed controls.
Validation `complete-row-pipeline-validation-047b2fb77299f46b.json` preserves all
13,573 prior campaign pins and verifies **13,610** hashes. The Druid clock was
absent then, with no actual Druid browser/combat job. Its supervised feedback/fresh
pipeline and matching public delivery remain outstanding.

## Reproduce

Run from the repository root with the recorded client/source and release artifacts
present:

```sh
node --test infra/simulator/dungeon-upgrade-catalog-audit.test.mjs
node artifacts/forever-simulator/optimization/review-tools/audit-dungeon-upgrade-catalogs-v1.mjs \
  --directory=artifacts/forever-simulator \
  --directory=artifacts/deployments/tank-optimized-20261023/review-root-v1 \
  --record
node artifacts/forever-simulator/optimization/review-tools/capture-dungeon-upgrade-quest-inventory-v1.mjs \
  '--toc=/Applications/World of Warcraft/_anniversary_/Interface/AddOns/QuestieDB/QuestieDB_Forever.toc' \
  --record
node artifacts/forever-simulator/optimization/review-tools/prepare-dungeon-upgrade-item-drafts-v1.mjs --prepare
node --test infra/simulator/dungeon-upgrade-rewards.test.mjs
node artifacts/forever-simulator/optimization/review-tools/capture-dungeon-upgrade-reward-inventory-v1.mjs \
  '--toc=/Applications/World of Warcraft/_anniversary_/Interface/AddOns/QuestieDB/QuestieDB_Forever.toc' \
  --capture
```

`--read-only` may replace `--record` for the catalog audit. Recording writes a new
immutable evidence file; these commands do not alter catalogs, models, presets, study
ledgers or the live website.

## October 25: separate local healer coverage audit

The earlier two-space DPS/tank audit does not include the local healer libraries.
The additional audit checks their actual selected manifests and library checksums:

| Local profile     | Release                    | Library items / builds | Own base set    | Exact base IDs present |
| ----------------- | -------------------------- | ---------------------- | --------------- | ---------------------- |
| Priest            | `82489a30494be3b4eff67cc0` | 993 / 40               | Virtuous, 514   | 0/8                    |
| Restoration Druid | `ad355f15131498695376e972` | 1,534 / 30             | Feralheart, 513 | 8/8                    |

This is the default local selection, not a new check of production. Class-filtered
UI libraries need not contain every other class's equipment. The library rows
omit structured set membership, so the audit does not fabricate `setId` values
from the client reference or declare their runtime effects correct.

The Priest result is also verified beyond the library. Its selected WASM matches
the source model's binary SHA-256. The exact **2,128,656-byte** database blob occurs
in that selected WASM at offset **35,191,791**. An independently compiled decoder
uses the frozen model's own `assets/database.Load()` and protobuf definitions to
read the embedded `UIDatabase`; all **2,680** decoded item/set identities match
the declared JSON catalog. All 72 base upgrade IDs are absent from that embedded
catalog, including the eight Priest pieces **22078–22085**. Their absence is a
catalog recovery requirement; it does not establish live-server unavailability.

Evidence under `artifacts/forever-simulator/optimization/catalog-audits/`:

- `healer-ui-dungeon-upgrades-e2bc3a230a01cd73.json`, byte SHA-256
  `de1c920dbc5950bfe39650ef68010200774f9c73ed4b3ebcc8bb71f6bdc6a643`:
  15 pins bind the selected libraries, client reference and matched Priest model.
- `embedded-priest-catalog-v1/inspect-zRAzlB/report.json`, byte SHA-256
  `881028f1e2faa003d361e31219dbd95256553cbf12d019e5a005afc12e46de8d`:
  38 pins bind the model, loader/protobuf source, embedded bytes, selected WASM,
  compiler and inspection sources. The decoder binary and raw decoded identities
  are retained. No combat simulation or optimization clock runs.

Reproduce the surface audit or inspect the exact recorded snapshot:

```sh
node artifacts/forever-simulator/optimization/review-tools/audit-healer-dungeon-set-coverage-v1.mjs --read-only
node artifacts/forever-simulator/optimization/review-tools/inspect-priest-embedded-catalog-v1.mjs --audit-report artifacts/forever-simulator/optimization/catalog-audits/healer-ui-dungeon-upgrades-e2bc3a230a01cd73.json
```

The shared catalog auditor's five regression tests, explicit source lint and the
actual decoder compilation/execution pass. This proves item/set identity coverage
only; stats, effects, acquisition and numerical comparisons remain separate.

Priest recovery still requires:

1. Use the eight already normalized stat drafts from
   `upgrade-item-drafts-d05c3a8dbff10678.json`. All eight have no individual equip
   effects to discard. Preserve their raw wear mask `-1`; class restrictions
   cannot be invented from the set name. Resolve acquisition separately.
2. Qualify the current base-set **514** effects: spell **18679** at two pieces,
   **27778** at four, **14047** at six and **14803** at eight. Existing Devout
   set-182 controls do not qualify Virtuous, and alternate set1675 is a separate
   identity.
3. Review the actual upgrade reward relations and acquisition restrictions,
   compile a catalog/model containing the eight pieces and admitted effects,
   and remeasure individual pieces, set subsets, the complete set and geared
   talent/rotation feedback with independent confirmation.
4. Deliver the same qualified settings and metadata to the healer workspace,
   defaults, library and guidance, with actual browser/native checks.

The original Priest window ended at **2026-10-24T20:33:53.864Z**. This audit does
not reopen it or authorize new numerical work; a separate approved update window
is required before those comparisons. The existing local references retain their
original catalog and scope. The full 72-piece campaign remains open.

The subsequent [Virtuous recovery](simulator-priest-virtuous-recovery.md) captures
the exact current base effects and prepares an isolated2,688-item proposal,
preserving all2,680 parent items. Its sourced shield has488 absorption,30-second
duration,2% chance and60-second internal cooldown; Priest-family and incoming-event
admission remain explicit. All22 native and22 actual Chromium/WASM component
checks pass,with ten source/renderer contracts and no active catalog writes.
This advances source and payload implementation; complete set dispatch,new-model
admission,numerical qualification and delivery remain unfinished.
