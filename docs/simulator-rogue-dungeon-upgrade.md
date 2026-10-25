# Rogue dungeon-upgrade recovery

The [catalog audit](simulator-dungeon-set-catalog-audit.md) found all eight base
Darkmantle pieces missing from the selected Rogue catalog. This preparation
recovers their current stats, quest acquisition evidence and base-set mechanics.
The amended native and WASM binaries pass actual browser/control admission.
Fresh numerical checks now pass for the three fixed primary builds; matching
public presets and UI delivery remain pending.

## Current state

| Work                                                       | Evidence                                                                                                                                | Status                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Identify the exact base items                              | IDs 22002–22009, set 512, current client 1.60.1.70532                                                                                   | Implemented                                  |
| Verify database acquisition relations                      | Four milestone exchanges per faction, with Rogue class masks corroborated by the baked QuestieDB inventory                              | Implemented; server rewards unobserved       |
| Import all eight current stat records                      | Existing strict importer, including level-60 ratings; historical database used for icons only                                           | Implemented                                  |
| Review boots' individual effect                            | Item effect 103242 → spell 27037 supplies eight stealth levels; explicitly disclosed as utility outside the stationary boss model       | Implemented for the declared encounter scope |
| Correct base-set dispatch                                  | Exact 2/4/6/8 thresholds, duplicate static-bonus suppression and separate alternate set 1676                                            | Implemented and regression-tested            |
| Exercise actual Rogue gear enumeration                     | All three published loadouts; all occupied slots, ordered pairs, sets and compatible enchants                                           | Implemented; bounded study completed         |
| Retain complete-set comparisons                            | All 247 two-to-eight-piece Darkmantle subsets present per loadout; full set remains mandatory                                           | Implemented                                  |
| Compile the amended native/WASM model                      | Fresh frozen workspace, 2,679-item embedded-database equality, native/WASM builds and Go regressions                                    | Implemented                                  |
| Admit the amended model against actual browser controls    | Sixteen controls across the three published builds, Darkmantle thresholds and external-buff removal                                     | Implemented                                  |
| Optimize and independently confirm the three Rogue builds  | Six closed builder branches, full fresh replay and direct confirmation of three preselected primaries                                     | Numerical confirmation passed; delivery pending |
| Prepare full-raid retained-contender confirmation           | Exact final-pass policy/gear/consume frames, original-seed retention, alignment gate and complete fixed-width batches                     | Implemented; actual all-six preflight passed  |
| Execute supervised full-raid confirmation                  | Recovery `fe7e94d7-e9fe-41f9-b715-02cf50fac614` completed; 1,010 fresh requests / 20,200,000 iterations / 44 fixed batches                 | Completed; producer 2% and separate 1% accepted |
| Independently review completed full-raid confirmation       | Actual completed-source reader passed, including all parents/alignment/claims and direct cross-builder comparisons                         | Passed; 2% and separate original 1% accepted |
| Freeze each spec's primary builder before holdouts          | Fixed Combat Backstab, Mutilate and Subtlety Hemorrhage primaries; no holdout winner selection                                             | Implemented and independently confirmed |
| Authenticate reviewed delivery sources                     | Ten current-model studies; 432,808 raw request origins / 82,257,280 iterations, sealed pack namespaces and exact selected controls          | Passed; immutable source audit saved |
| Prepare matching exports, guidance and virtual presets      | Three exact full-raid builds, complete pre-pull/priority instructions, eight virtual files and twelve passing delivery contracts              | Implemented and compiled into the candidate UI |
| Validate generated UI types and typed build reader          | Strict virtual Rogue/dependency typecheck, negative API control, real three-build fixture and 24 reader tests                               | Passed; application/library wiring pending |
| Compile and independently inspect the candidate UI          | All-class strict TypeScript: 821 sources, zero diagnostics; 22 pages, 3,498 verified files and nine unchanged numerical assets                 | Passed; candidate remains unselected |
| Check real built-in desktop/mobile behavior                | Exact defaults, all three configurations/Gear Sets, full export/import/reload, consent off and no horizontal overflow                         | Browser smoke passed; no combat simulation started |
| Deliver application profile and library                     | Actual simulation-request binding, current-host application/library adapter and final browser review                                        | Pending                                      |

## Acquisition evidence

The reward table uses base-set identities, not identically named alternate items:

| Milestone                | Alliance / Horde quest | Required Shadowcraft items                        | Guaranteed Darkmantle rewards                     |
| ------------------------ | ---------------------- | ------------------------------------------------- | ------------------------------------------------- |
| An Earnest Proposition   | 8910 / 8917            | Bracers, 16710                                    | Bracers, 22004                                    |
| Just Compensation        | 8935 / 8941            | Belt and Gloves, 16713 / 16712                    | Belt and Gloves, 22002 / 22006                    |
| Anthion's Parting Words  | 8956 / 9020            | Boots, Pants and Spaulders, 16711 / 16709 / 16708 | Boots, Pants and Spaulders, 22003 / 22007 / 22008 |
| Saving the Best for Last | 9004 / 9010            | Cap and Tunic, 16707 / 16721                      | Cap and Tunic, 22005 / 22009                      |

These are the database's listed simultaneous rewards, not mutually exclusive
choices. Sources include the Forever pages for
[8910](https://www.wowhead.com/forever/quest=8910/an-earnest-proposition),
[8935](https://www.wowhead.com/forever/quest=8935/just-compensation),
[8956](https://www.wowhead.com/forever/quest=8956/anthions-parting-words), and
[9004](https://www.wowhead.com/forever/quest=9004/saving-the-best-for-last), with the
Horde counterparts recorded in `review-tools/rogue-darkmantle-acquisition-v1.json`.
Some pages were available only as indexed database extracts. That distinction is
preserved per relation. Reward names are matched to the exact reviewed base item
IDs; this does not claim a fresh successful HTML fetch for every quest.

The class restriction comes from all eight quests' `requiredClasses = 8`
(Rogue), combined with the current items' pickup binding. The sparse wear masks
are unrestricted, so using those masks alone would incorrectly let other classes
acquire these rewards. The prepared runtime items therefore have the simulator's
Rogue class allowlist. Both factions retain their proper nested quest sources;
neither is rejected because the other faction also has an exchange.

QuestieDB's quest-side fields supply class masks and required items. The later
item-side reward audit independently corroborates all sixteen Rogue item/quest
associations; it does not establish quantities or replace the separately reviewed
simultaneous-delivery evidence. No observed character reward or server proc-cadence
capture is available. Acquisition remains provisional for research admission.

## Current mechanics and isolated regression

| Pieces | Current spell | Effect                                          |
| ------ | ------------- | ----------------------------------------------- |
| 2      | 18679         | +8 to all resistances                           |
| 4      | 27787 → 27788 | Landed melee auto attacks can restore 20 energy |
| 6      | 14049         | +40 melee and ranged attack power               |
| 8      | 14803         | +200 bonus armor                                |

The current child payload restores **20 energy**, matching the
[Forever base-set page](https://www.wowhead.com/forever/item-set=512/darkmantle-armor).
Some indexed item tooltips still display the older 35-energy text. The model is
bound to the actual 70532 spell payload rather than that stale text. The client's
100% placeholder proc chance does not establish server cadence: the prepared
model retains the inherited **1-PPM reference as an unverified assumption**.

The frozen parent lacks the base set's eight-piece armor and exposes extra
three/five-piece thresholds from another variant. A base-ID override replaces
those registrations for Forever set 512. It also suppresses any generated static
set-512 row to prevent doubled resistance/AP/armor when catalog generation later
adds one. Set 1676 and Classic stay outside the new handler.

The actual Go regression uses 0–8 pieces, with and without Kings. It checks the
exact AP, primary stats, all five resistances and total/bonus armor; one
registration per threshold; landed main/off-hand and critical auto hits; rejected
misses, dodges, specials, spell and ranged hits; exact 20-energy gains and capped
energy. The unchanged parent fails the regression as expected. The corrected
isolated workspace passes it along with generated-static overlap, Heroism, both
Valor suites and the retained Elemental between-cast test. The parent workspace
and its 471 source files remain unchanged.

The frozen compiler snapshot excludes upstream `dot_test.go`, which normally
provides the retained core test's `FakeAgent`. The verifier supplies an explicit
test-only agent shell in its private workspace. It never enters the production
model or replaces the real Rogue agent used by the threshold/proc regression.

## Actual proposal preparation

The three contexts come from the real published reviewed settings, then receive
the approved full-raid buff frame. Their original settings and measurements are
preserved. The currently published Combat build uses **Backstab**, so its main
hand must remain a dagger during this fixed-APL item comparison. A later Sinister
Strike talent/APL branch must declare its own weapon geometry.

| Published context | Builder    | Ordered hand pairs | Set proposals | Mandatory set comparisons |
| ----------------- | ---------- | ------------------ | ------------- | ------------------------- |
| Combat            | Backstab   | 7,792              | 1,711         | 21                        |
| Mutilate          | Mutilate   | 2,512              | 1,710         | 19                        |
| Subtlety          | Hemorrhage | 27,085             | 1,597         | 22                        |

Each context includes all eight Darkmantle pieces in the corresponding occupied
slot pools and all **247 distinct two-to-eight-piece subsets**. The complete
eight-piece proposal survives screening by explicit mandatory retention metadata.
The shared enumerator also preserves ordered jewelry pairs, weapon legality,
quest ownership, class/faction/profession eligibility and reviewed compatible
enchants. Conservative contexts exclude provisional proc enchants.

These are complete declared proposals for the fixed contexts, not damage results
or an exhaustive global optimum. The prepared 2,679-item database has semantic
SHA-256 `9da36b4c8b5f15b255ee9b0be8d5132cb023b729c1c1bb486e0659951d3c0105`.
Release `db33442499b7f5caaaaabf0c` is compiled from that database. Its source and
generated-input bindings are recorded in
`rogue-full-raid-model-v1/context.json`. Native and WASM builds use the same
frozen source. The embedded binary database round-trips to the complete UI
database; all 2,679 combat item representations are checked. The actual build
also passes database conformance, Darkmantle threshold/proc, and retained Valor
regressions. These build checks supply no damage ranking. No old score may
qualify this model, and global sixteen-debuff enforcement remains separate work.

## Browser ruleset correction

The first control attempt exposed a preparation error: adding faction-only
global UI settings makes the saved-settings parser choose Classic, whose enum
value is the default zero. That clears the separate Forever poison selections.
The published poison options and Shadow Oil imbue are valid; neither was the
cause. Zero-combat reload probes reproduce the fallback in both the published
bundle and the amended bundle, then verify that explicit `RulesetForever`
preserves the selections in both.

The failed v1 control and its source graph remain unchanged. A separate v2
control binds the UI ruleset explicitly and rejects any captured wire request
using Classic, even if the equipment and other player fields match. Its three
focused tests and zero-combat preflight pass. The supervised v2 browser/native/
WASM controls passed under the original Rogue update clock, started
2026-10-23 23:53:21 UTC; the deadline remains 2026-10-24 23:53:21 UTC. All sixteen
pairs agree on complete unit metrics, and all six parent comparisons agree.
The actual fights activate the four-piece energy effect only at the appropriate
threshold and gain exactly 20 energy per proc; capped actual gains remain
separate. The report is `rogue-full-raid-v2/prepared.json`, byte SHA-256
`75ece8c967c70c6c23176d92f5f17d0ce16346c9a1d84d5f9bf7590e4655b8f7`.
Its 11,574 source pins bind the exact model, UI, captures and validation sources.

## Bounded item search

The corrected actual captures now seed a separate all-slot search. Its three
request/admission tests pass, including rejection of Classic wire requests,
changed poison/buff/encounter settings, different gear and mismatched databases.
The nine selector/set-retention regressions pass. The zero-combat preflight also
passes the real shared executor's label, projection, input and batch contracts.

| Context               | Group proposals | Ordered weapon proposals | Set proposals | Mandatory complete-set comparisons |
| --------------------- | --------------- | ------------------------ | ------------- | ---------------------------------- |
| Combat / Backstab     | 16,703          | 7,792                    | 1,711         | 21                                 |
| Mutilate              | 11,200          | 2,512                    | 1,710         | 19                                 |
| Subtlety / Hemorrhage | 36,018          | 27,085                   | 1,597         | 22                                 |

The 63,921 group proposals include repeated incumbents across groups. These are
enumeration counts, not completed numerical jobs. All 62 mandatory set proposals
reach 10,000-fight decision precision even if an earlier screen ranks them poorly.
The search uses one fixed decision seed/precision for accepted gear moves and a
noise guard, avoiding the earlier Warrior precision-switching cycle.

Before scalar ranking, 93 native/WASM controls cover every declared ordered
weapon-family geometry and mandatory complete-set comparison. They run in 64/29
batches, preserving the shared executor's existing 64-job limit. Combined
receipts bind each batch's ordered records and fight counts. All 93 controls
passed, including complete unit metrics and cleanup. The six-worker scalar
search started on 2026-10-24 at 00:26:19 UTC with identity
`02777496732e646e791ee0dd70dadeba67bc5beed374878cce40a8ab5d983cdd`.
Its actual progress is `rogue-full-raid-v2/gear-owner-v1.log` and the matching
`bounded-native-studies/<identity>/state.json`. No completed selection or winner
is asserted until the search, saved-measurement replay and worker cleanup pass.

The existing published talents/APLs remain fixed in this first item stage.
Combat's Sinister Strike weapon geometry, geared talent/rotation and consume
feedback, independent 2% retained-contender assessment and separate 1% original
audit remain required. This bounded coordinate search is not an exhaustive
global optimum or a new public preset.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-gear-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-rogue-full-raid-gear-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/supervise-rogue-full-raid-gear-v1.mjs --search
```

Use the supervisor for the actual search; it preserves the original class
deadline and exact command identity. Do not edit its frozen source graph during
the run, start a second owner or reset the class clock.

## Gear completion on October 24

The supervised all-slot study finished successfully at **2026-10-24
02:06:31.091 UTC**, with **132,564 numerical jobs / 17,438,660 fights** and a
complete saved-measurement replay. Combat, Mutilate and Subtlety each reached a
stable second pass with no final accepted move. The supervisor exited successfully;
the original Rogue update clock and its October 24 deadline are unchanged.

The completion identity is
`02777496732e646e791ee0dd70dadeba67bc5beed374878cce40a8ab5d983cdd`.
Its result is `bounded-native-studies/<identity>/result-512c84dd60e0a966.json`,
semantic SHA-256
`512c84dd60e0a96635235d2b0e8fdae158bc59ead8b50ecb5c98aed7d30f8410`.
The adjacent `completed.json` is the authoritative source boundary.

The intermediate selected gear contains six Darkmantle pieces for Combat and
Mutilate, and four for Subtlety. These are fixed-policy gear choices, not final
presets or independent DPS claims. They demonstrate why the missing upgrade set
could not safely be omitted. The completed-source reader and selected-gear feedback
preflight have passed from these actual settings, without new combat jobs.

## Geared policy feedback preparation

The original delivered build declarations provide the exact rotation knobs and
poison choices for all 30 historical comparison configurations. Their APLs are
checked against the current policy generator using the public protobuf codec.
This handles UI serialization defaults without altering the captured request or
guessing the rotation settings. Only policy data leaves the historical loader;
old DPS measurements are neither accepted as bank inputs nor reused.

The published-gear preview passes five focused tests and its zero-combat
preflight:

| Context  | Talent seeds | Policy candidates | Historical configurations retained |
| -------- | ------------ | ----------------- | ---------------------------------- |
| Combat   | 522          | 1,107             | 11                                 |
| Mutilate | 420          | 453               | 11                                 |
| Subtlety | 746          | 2,337             | 8                                  |

The bank retains complete historical talent/APL/poison packages as proposals,
including Mutilate's Venom alternative with its disabled-Venom/shorter-refresh
package. Retaining only its talent string would lose that combination. Different
weapon requirements are recorded as explicit exclusions when the actual gear
cannot support a builder; those alternatives still need their own gear branches.

The immutable preview is `rogue-full-raid-v2/policy-preview-248e127306afce2a.json`,
byte SHA-256
`df14b44a50b63efcc500941bc8db6ea5214aa7e231f0f1d726074178d623f0b7`.
It contains 3,897 unmeasured proposals against the original published gear. It
does not authorize reusing that gear preview as the selected-gear feedback run.

A separate feedback-bank adapter preserves the exact geared incumbent beside
generated policies. Weapon changes can cause the policy generator to remove
dagger-dependent actions: the engine's Ambush condition itself requires a
main-hand dagger. Removing those actions must be an explicit proposal rather
than an assumed equivalent replacement. The adapter uses separate incumbent and
resolved policy states, canonicalizes only protobuf-equivalent representations,
and remaps historical references to the canonical candidate IDs. Its dedicated
four-test regression passes, covering representation-only deduplication, explicit
weapon-dependent policy transitions, accepted-state continuity and rejected
incumbent relabeling. The live gear study's frozen graph is unchanged.

The geared feedback request adapter is implemented separately. It validates the
original Forever capture before deriving all 16 poison pairs with both off-hand
stone types. Gear, talents, APL and poison choices are explicit inputs; raid
buffs, encounter, manual stats, other Rogue options and non-stone consumes remain
fixed. The adapter snapshots source settings, inputs, database, talent trees and
backend identity so later caller mutations cannot change requests or provenance.
Six tests pass against the actual three captured profiles, including native
request normalization, materialized WASM projections, blade/blunt transitions,
rejected foreign fields/rulesets and input-mutation protection. These are request
construction tests; they start no new native/WASM combat.

The callback-only feedback evaluator is also implemented. It retains the exact
incumbent/resolved mode through the shared bounded 80/500/2,000/10,000-fight
selection strategy and returns settings for the actual chosen state. Two
synthetic-score tests verify equal-score incumbent retention and an explicit
accepted transition followed by stability. Their supplied scores are test data,
not DPS evidence or independent confirmation.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-policy-bank-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-feedback-bank-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-feedback-requests-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-feedback-search-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-rogue-full-raid-policy-domain-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-rogue-full-raid-policy-domain-v1.mjs --prepare
```

These preparation commands start no combat jobs and change no class clock. The
gear study has since completed; the feedback banks must be rebuilt against its
actual selected gear. The numerical owner binds the completed result and sealed
journals, assembles those banks and requires fresh native/WASM controls before
executing the feedback callbacks. Its real selected-gear preflight passed, and
the supervised owner subsequently completed. Consume feedback, loop closure, independent
confirmation and UI delivery remain unfinished.

## Completed-source loader and numerical owner

The completed-gear loader binds the actual source release, database/backend,
all three full item domains, all 93 gear controls and the exact final decision
requests. It rejects an unfinished/pass-limit result, an accepted final gear
move, changed settings or mismatched metrics. It composes the existing verified
source reader with the callback-only saved-stage replayer. The latter rebuilds
every stage from sealed journals and packed records, checks all native origins,
and requires the complete reconstructed result to match. It starts no combat.

Five source-contract/completion-boundary tests pass against the original live
declaration and explicit shape-only unit fixtures. The completion artifact now
exists. The actual positive independent completed-source replay and selected-gear
preflight passed at **2026-10-24 02:14 UTC**, as recorded in
`selected-gear-feedback-preflight-v1.log`. Its declaration identity is
`2e96b5ce0a80e059581a1126e7de5f2b997ee3f9c61d122308aad1075d90c1d5`.
The earlier unit-test diagnostic recorded the then-pending completion boundary
rather than claiming a synthetic fixture proved it.

The supervised `talents-rotation` owner now assembles selected-gear policy banks,
performs initial native/WASM controls, executes the bounded callback study,
replays its saved measurements, and checks the exact selected states again.
Its published-gear preview passes five additional tests and the zero-combat
preflight. That preview selects **174 controls covering 630 declared features**
across the three original gear frames: observed talent ranks, knob values,
poison pairs, spell presence and historical/source families. Equivalent numerical
inputs share one execution. This is finite initial-bank coverage, not every
candidate combination or later round. The real selected-gear preflight also
produced 174 controls / 630 features, with 1,107 / 453 / 2,337 candidates and no
historical configuration exclusions in those three actual gear frames.

The preview cannot enter the numerical evaluator or live parity executor. Normal
execution requires the completed, stable, independently replayed gear source and
the existing approved Rogue owner/deadline. Initial and selected controls check
complete unit metrics and a conservative sixteen-active-target-aura union bound;
that bound remains separate from arbitrary-input global debuff enforcement.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-gear-source-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-geared-feedback-context-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-feedback-canaries-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-rogue-full-raid-feedback-v1.mjs --plan --preview

# After the actual gear owner finishes successfully:
node artifacts/forever-simulator/optimization/review-tools/run-rogue-full-raid-feedback-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/supervise-rogue-full-raid-feedback-v1.mjs --search
```

The supervised owner started at **2026-10-24 02:14:46 UTC**, child PID 22090,
under the unchanged Rogue deadline. Its log is `rogue-full-raid-v2/feedback-owner-v1.log`.
All **174 initial controls passed complete unit metrics**, in batches of 64/64/46,
with 4,350 native and 4,350 browser fights. The receipt is
`rogue-full-raid-v2/feedback-initial-2e96b5ce0a80e059.json`, byte SHA-256
`9482b8eeb1d0c80fc013fd759f150408ac449771511c66d558342733cb127c58`,
with status `passed-after-cleanup`.

The first scalar dispatch then stopped at `Need5GiB free`, before any scalar worker
or admission journal started. The local volume had 3.7 GiB free. Clearing only the
rebuildable Go build cache with `go clean -cache` restored 7.8 GiB; source artifacts,
compiled models, measurements and browser dependencies were preserved. The exact
same command resumed as child PID **35684**, log
`rogue-full-raid-v2/feedback-owner-v2.log`. Both ledger entries have command SHA-256
`50f32a85f12a222c195a4fb74e6ab4c7c8fea9dda38711f3d189830a364b72b7`;
neither the clock nor the correction allowance was reset. The resumed owner
revalidated the completed source and saved controls, then began scalar comparisons
at **2026-10-24 02:36:45 UTC** with six workers. The actual study identity is
`d1e8fbd18b929370ad11228af270d84fc471fa3b4b7bbfa5cbe3ec7d7f0f8b30`.
The completed gear phase and original update ledger remain unchanged.

The completed source graph remains frozen. A successful bounded feedback
phase still requires gear/builder and consume rechecks, loop closure, fresh
independent comparisons and selected UI delivery. No new score or preset is
qualified by the preview or these unit tests.

## Completed policy-result reader

The next-stage reader is implemented separately from the frozen numerical owner.
It requires both the scalar completion and the final selected-control report
before loading the expensive source context. It authenticates the entire declared
domain, source model, completed-gear reference, policy, frame hashes, feature
coverage and initial controls. Selected results must be stable, with no accepted
final move, exact fixed gear/settings and matching 10,000-fight decision requests.

The read-only loader then reconstructs every saved feedback stage from sealed
journals and admitted origins, compares the complete semantic result, and checks
both the initial and exact selected native/WASM controls on full unit metrics.
The conservative sixteen-active-target-aura union check remains a controlled-fight
check, not arbitrary-input global debuff enforcement. Returned selected frames
contain their actual settings, logical policy, builder and materialized request;
they do not inherit stale banks or request factories from the original frame.

Five new tests pass against genuine captured request factories and explicitly
synthetic, in-memory source/result shapes. They cover altered declarations,
partial domains, unstable or accepted-last-round results, changed settings,
mismatched metrics and the early missing-completion/final-report boundary. These
fixtures never enter a journal or numerical owner. Scoped lint passes for the
four new modules. The actual positive completed-feedback replay subsequently
passed, including the final selected controls, as recorded below.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-feedback-source-v1.test.mjs

node artifacts/forever-simulator/optimization/review-tools/review-rogue-full-raid-feedback-source-v1.mjs --verify
```

The test log is `rogue-full-raid-v2/feedback-source-contract-tests-v1.log`.
The standalone verifier starts no combat and writes no files. A successful read
still requires subsequent gear/builder and consume applicability checks, loop
closure, fresh independent comparisons and verified UI delivery.

## Policy completion and gear applicability

The resumed feedback supervisor exited successfully at **2026-10-24
02:53:12.233 UTC**. All three styles reached a stable policy result. The scalar
study admitted **5,324 jobs / 1,615,240 fights**, followed by complete saved-stage
replay and three exact selected native/WASM controls. Those selected controls
add 75 fights per backend; the initial controls used 4,350 per backend.

The result is `bounded-native-studies/d1e8fbd18b929370ad11228af270d84fc471fa3b4b7bbfa5cbe3ec7d7f0f8b30/result-950734ec431f6b25.json`,
semantic SHA-256
`950734ec431f6b25b5996168f9a7ad4dc054acd30ba7e26202720e0ca5424b8a`.
The selected-control stage report is
`rogue-full-raid-v2/feedback-stage-d1e8fbd18b929370.json`, semantic SHA-256
`691f14738acb5333be1c3ea20f4715263c5ef391a93f6ec61714f5b1807c757e`.

The separate read-only verifier successfully reconstructed all **245 saved
stages**, authenticated all 5,324 origins, checked initial/selected full unit
metrics, and verified 12,241 source pins. It started no combat jobs. Its output is
`rogue-full-raid-v2/completed-feedback-independent-review-v1.log`, byte SHA-256
`df23ee00b903325fdbf091d0e07583b72d869659a502f40180916e3a9b8a0ea3`.

The applicability reader binds the independently replayed gear result to the
independently replayed feedback result, reconstructs each original final gear
request and compares its exact effective native input under the same frozen
binary/database/codec. Raw request IDs and metrics are never rewritten. An
unchanged control must also have identical deterministic scalar metrics.

| Style                 | Completed core gear domain after policy feedback               |
| --------------------- | -------------------------------------------------------------- |
| Combat / Backstab     | Remains applicable: exact effective input and metric unchanged |
| Mutilate              | Remains applicable: exact effective input and metric unchanged |
| Subtlety / Hemorrhage | Requires fresh gear comparison: effective input changed        |

Five applicability regressions pass, including changes to talents, APL, poison,
consumes and raid context; alternate builders; unstable sources; wrong metrics;
and representation-only raw-capture differences. This check covers only each
original builder's completed gear domain. It does not close consume feedback,
qualify alternate builder gear or establish an independently confirmed score.

## Six-builder state recheck preparation

The next `state-recheck` command has one declared scope under the existing Rogue
clock. It prepares six separate builder branches: Combat Backstab and Sinister
Strike; Mutilate; Subtlety Hemorrhage, Backstab and Sinister Strike. Each receives
its own complete item/pair/set/enchant domain, with full Darkmantle retained
through decision precision. Policy feedback stays within that branch while the
other builders receive their own gear searches.

Each branch composes consume selection, complete gear selection and fixed-builder
talent/APL/poison feedback. A changed effective state forces another complete
pass. All three inner selectors and the full effective state must stabilize in
the same pass. Four passes is the explicit bound; cycles, unfinished selectors
and pass caps remain open results. These state-machine rules have five passing
regressions using small synthetic state fixtures, without numerical evidence.

The numerical adapter uses actual class-6 Forever requests, preserves the raid
and encounter, and materializes the exact resulting gear/APL/poison/consume
control at each transition. Before ranking, each branch must pass its own
item/policy/consume native/WASM control plan; every selected outcome must pass
another exact full-metrics control. All **17 new focused tests pass**: five
applicability tests, five state-machine tests, six actual builder/control/request
construction tests and one complete adapter/selector composition test. The last
two selector tests use explicitly synthetic tie scores in memory, start no
native/WASM fights and never write a journal. Scoped lint and formatting checks
pass for the new modules.

The actual builder/control test log is
`rogue-full-raid-v2/state-frames-contract-tests-v2.log`; the complete adapter test
log is `rogue-full-raid-v2/state-search-contract-tests-v1.log`.

The first actual zero-combat preflight passed with **706 constructed controls**
across the six branches (103/124/100/136/111/132), and 12,255 source pins. The
last test was then added to the explicit test-pin list; the second read-only
preflight passed with the same 706 controls and **12,256 source pins**, recorded in
`rogue-full-raid-v2/state-recheck-preflight-v2.log`. The numerical owner always
reconstructs and verifies its current complete declaration before any fight; no
earlier preflight identity is imported as an admission.

The supervised `state-recheck` owner started at **2026-10-24 03:23:04.995 UTC**,
child PID **98029**, log `rogue-full-raid-v2/state-recheck-owner-v1.log`.
Its command SHA-256 is
`f4c0555ae06a1021ec321049bc329371b39bfeecf6a043377e94ec2dc4f20f8e`.
It shares the original **2026-10-24 23:53:21.695 UTC** class deadline and freezes
the entire new executable/test graph. All six branches belong to this one
`all-styles` state-recheck command; none receives a new clock or corrective phase.
Source replay and branch controls precede scalar workers. At dispatch there was
no state-recheck scalar result, selected setup or public score.

The first branch's **103 native/WASM controls passed complete unit metrics and
cleanup**, in 64/39 batches, with **2,575 fights per backend**. Its receipt is
`state-initial-758f1ece780136eb.json`. The admitted scalar study identity is
`7bc8c1f4d79ab8659c1bbb046c78048a58baa20e2642bdaa8a79198204053813`.
The consume pass finished and the all-slot gear measurements began at
**2026-10-24 03:44:11 UTC**. This is the first of six branches, not a completed
class result.

Before scalar dispatch the local volume again fell below the unchanged 5 GiB
minimum. No Go compiler was active; `go clean -cache` removed only rebuildable
cache entries, restoring 6.3 GiB. The same supervisor/PID continued; no source,
model, saved measurement, clock, frozen command or corrective allowance changed.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-state-closure-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-state-frames-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-state-search-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-rogue-full-raid-state-recheck-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/supervise-rogue-full-raid-state-recheck-v1.mjs --search
```

The plan performs source replay and control construction, with no native/browser
fights or application changes. Final independent 2% retained-contender comparisons,
the separate 1% original audit, selected UI/defaults/Gear Sets/library/guidance
delivery and desktop/mobile checks still follow a successful state recheck.

## Independent six-builder result reader

The separate reader now authenticates each complete branch declaration against
its exact seed, initial item/policy/consume domain, controls and both replayed
parent sources. A selected branch must close its full state: correct pass order,
linked effective-input fingerprints, stable inner selectors, unchanged fixed
combat fields and the exact reconstructed final native/browser control.

The loader requires all six stable branches and a successful matching supervised
command before preparing the parent context. It authenticates each branch report,
initial/selected complete-metric controls, and sealed admissions, then reconstructs
every saved numerical stage using the frozen producer callback. It compares the
complete semantic result and verifies all source pins. The mutable class ledger
is checked by its completed run identity, allowing the next legitimate phase to
append a run without invalidating the completed evidence.

Four source-contract tests pass against genuine adapters and an explicitly
synthetic, in-memory two-pass consume/gear/policy result. They reject changed
domains, false stability, wrong identities/settings/controls, partial or missing
global reports and symlinks before expensive loading. Three additional read-only
parity tests pass using the earlier completed feedback controls; matching DPS
with missing resources is rejected. These tests execute no native/browser fights
and create no numerical admissions. Scoped lint passes for all six new modules.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-state-source-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/read-rogue-state-parity-source-v1.test.mjs
```

After the owner completes all six branches, run
`review-rogue-full-raid-state-source-v1.mjs` with `--verify` followed by the exact
final report path printed by the owner. The CLI starts no combat and writes no
files. The actual positive six-builder completion replay remains pending the
unfinished run; neither contract tests nor the controlled sixteen-aura union check
establish final independent DPS qualification or global arbitrary-input debuff
enforcement.

### October 24 completion and source-conflict stop

The Combat Backstab branch reached a stable state in one outer pass and sealed
its completion after **18,112 jobs / 3,024,200 fights**. Its result is
`bounded-native-studies/7bc8c1f4d79ab8659c1bbb046c78048a58baa20e2642bdaa8a79198204053813/result-abdfcee4147d3afb.json`,
semantic SHA-256
`abdfcee4147d3afb58906e2e0e96ed912576a49e768958373acfa0cfa53310c3`.
The branch report is `rogue-full-raid-v2/state-branch-7bc8c1f4d79ab865.json`.
Its exact selected native/WASM control passed full metrics and cleanup. These
are completed selection measurements, not independently qualified final DPS.

The second branch's 124 initial native/WASM controls also passed, in 64/60
batches. Its receipt is `state-initial-0474709b02af2f1d.json`. The supervisor
then stopped at the unchanged 5-GiB free-space guard before starting that branch's
scalar workers. The original PID 98029 exited with code 1.

After space was recovered, the exact same command was attempted again under the
original class deadline, with child PID 44311 and log
`state-recheck-owner-v2.log`. It exited with code 1 during source verification:
storage-maintenance changes altered `infra/simulator/simulation-cache.mjs` from
`69b4b817a739a0b5ddb9baee50428f6b7e4ee7e0875b462424401bbf69c32c37` to
`f07da6c534c003373a55e6d788fc3f79b4b8d2ca6d7722d348f76a424ee28008`.
The separate first-branch independent reader stopped on the same mismatch;
`first-builder-independent-source-review-v1.log` records that failed verification.

No Rogue owner was running after these failures. The cache changes, original declarations,
sealed measurements and failed logs remain preserved. Source checks were not
relaxed, the class clock was not reset, and the first branch has not been called
independently verified. A source-compatible recovery must be established before
resuming. The new read-only `audit-rogue-cache-source-conflict-v1.mjs --audit`
checks every declared source pin and compares the exact hash-helper expression;
it does not grant permission to replace any pin or qualify the changed cache.

### Approved compatibility correction and exact-command resume

The owner authorized the additional compatibility correction in
`call_3fa6bfabfe694620a3d4e0ba7deea13c/0` on October 24. The pre-correction audit
checked all 12,256 pins and found only the cache module changed. Its exact
`simulationHash` expression was unchanged. The audit is
`rogue-full-raid-v2/cache-source-conflict-b9639c3a4d0ee701.json`, byte SHA-256
`09167f95cbd334bb4e8152094502a89817441a8068600dfa995ca79b8ccf4067`.

The correction restores `simulation-cache.mjs` to its exact frozen bytes and
moves the new execution behavior into `retained-simulation-cache.mjs`. Thirteen
active cache writers/monitor/test imports now select that module. Leases,
post-batch retention and draining outstanding workers on failure remain active.
None of those thirteen consumers is in the Rogue declaration. Every original
changed source is archived by digest before migration; the receipt is
`rogue-cache-compatibility-20261024/receipt.json`. Older experiments that pinned
those public entry scripts must replay their archived sources, not the updated
active entrypoints.

After migration all **12,256 original Rogue pins match again**, without changing
the producer, model, measurements, declaration, budget or checks. All **18 cache,
storage-retention and monitor tests pass**, including sibling-worker drain;
scoped lint also passes. The test log is
`rogue-full-raid-v2/cache-compatibility-tests-v1.log`.

The exact original state-recheck command resumed as child PID **90098** with log
`rogue-full-raid-v2/state-recheck-owner-v3.log`. Its deadline is still
**2026-10-24 23:53:21.695 UTC**. It replayed the completed sources and reused the
sealed Combat Backstab branch before continuing to the next builder.

The separate first-branch read-only verifier has now exited successfully. It
authenticated **18,112 origins / 3,024,200 inspected fights**, reconstructed all
**209 saved stages**, checked initial/selected full unit metrics and verified
the complete semantic result. It started zero native/browser combat jobs and
wrote no numerical evidence. Its log is
`first-builder-independent-source-review-v3.log`, byte SHA-256
`64d43accfa76bb11952daa5d2c4ab601fed07dd3c012997efff24fdbac84cc17`.
All seven existing source/parity contracts also pass after the reader correction;
the log is `state-source-reader-contract-tests-v2.log`.

This independently verifies saved selection evidence for one builder. It is not
fresh statistical DPS confirmation or all-six completion. The remaining builders,
independent final comparisons and public delivery remain unfinished.

Combat Sinister Strike has now sealed its stable state branch under identity
`6d4892fb02051507ae5d8e3af73dc8a33a4b3ee86d0e206e09a45a970302ad48`.
Its existing 124 initial controls were authenticated before dispatch. The study
inspected **85,019 jobs / 11,327,040 fights** and its selected native/WASM control
has zero DPS difference. The branch report is
`state-branch-6d4892fb02051507.json`, semantic SHA-256
`c8d4ff15dd2b295177dd15a111d31de9ae5486f2d007a0fe01258c3d8225b256`.
Its sealed result is `result-fb4862f2ac4c2a31.json`, semantic SHA-256
`fb4862f2ac4c2a31cbcdabd9057ec4883f86fd36579e344b6b24b66513ad9af2`.
The separate read-only verifier has exited successfully on that exact report.
It independently authenticated all **85,019 origins / 11,327,040 inspected
fights**, reconstructed all **559 stages** across two complete outer passes,
verified the complete semantic result and checked initial/selected full-unit
controls. Its log is `second-builder-independent-source-review-v1.log`, byte
SHA-256 `6e7c71a8f84890f34609b0ddfc006ae4e1a6dda3cc495e8f6df35b5c5211db39`.
The completion semantic SHA-256 is
`55c2a9e3f826f4d95de7237437cf01bce01f05e9edb4baa40d20d8b090e67113`.
The CLI's historical status label still says “first builder”; its exact verified
`branchId` is `rogue-combat-sinister-strike`. No new fights or numerical writes
were made by that reader.

Mutilate's 100 initial native/WASM controls passed in 64/36 batches. Its study
`7e9b87bcd1166e9bd73ffd56d5db83ed1d419d7248cc8075a3f708a66b45b5ed`
has now sealed a stable one-pass selection after **12,586 origins / 2,565,300
inspected fights** and 199 saved stages. Its selected native/WASM control also
has zero DPS difference. The branch report is
`state-branch-7e9b87bcd1166e9b.json`, semantic SHA-256
`708b86ce0f61feedad45afd9768552ae9c14104382427172c5a61b8fccfca0f0`;
the result semantic SHA-256 is
`41d1e745e1022be4397f2e6e88bd8779184e6edbf1052717e86d6f2e799e9bbc`.
Its separate independent source replay remains pending the whole six-branch
reader.

Subtlety Hemorrhage has also sealed a stable one-pass selection under identity
`2ca22f09b749834263dee09183a781e91e986f04b5980ed8a2d39b0bd58cc46d`:
**37,783 origins / 4,645,020 inspected fights**, with 208 saved stages and zero
selected native/WASM DPS difference. Its branch report is
`state-branch-2ca22f09b7498342.json`, semantic SHA-256
`68936f72ad1194c8b6f469aed0fe19f10473d1a4386f9032fd8ad5b9e024220c`.
The result semantic SHA-256 is
`dbe4dc3461ef76554d54e605a8b5742a7df66960acb0a13197a7815a49d77722`.
Its independent source replay remains pending the full reader.

Subtlety Backstab has now sealed a stable **two-pass** selection under identity
`8a2cac016336ef764b3b66755e0112c112d1d16b45232adba161b5a0697951e3`:
**54,802 origins / 9,150,140 inspected fights**, with 608 saved stages and zero
selected native/WASM DPS difference. Its branch report is
`state-branch-8a2cac016336ef76.json`, semantic SHA-256
`8730f7155a09cff95a16271ca4d9e5802f39302ccc45cea118d41281226c5c5a`.
The result semantic SHA-256 is
`a5fce795b36804e6cf91c686fe6eab526022c5b2c3c1acdfea8e40fd6146b03a`.
Its independent source replay remains pending the full reader.

Subtlety Sinister Strike has sealed the sixth stable branch under identity
`201b76b05300cee4b7f22910652225a197b5bd69d2675257bffe8477b3778022`:
**85,536 origins / 11,571,680 inspected fights**, 608 saved stages and two outer
passes. Its selected native/WASM control has zero DPS difference. The branch
report is `state-branch-201b76b05300cee4.json`, semantic SHA-256
`56ac81c1bc53465b067e67a72187a461af43700ce70f59d15b4e909d7d27c3c3`;
its result semantic SHA-256 is
`b628f3ac8437d06c9dc2a1d20c9d920aec41d4ea7aa5571e121416c8aa30c922`.

The all-six report is `state-recheck-503b5a793565b04f.json`, semantic SHA-256
`116321e21d246c5ae75063d3165fe521e6985d4543e94a0ace4e5d8716e769f3`.
The exact original owner `89fab7ee-81a8-4384-b086-243ab628f9f7` has exited with
`process-succeeded`, exit code zero and no signal. The deadline remains
2026-10-24 23:53:21 UTC. The combined confirmation preflight has independently
replayed all parents and six branches successfully, logged in
`confirmation-preflight-503b5a793565b04f-v1.log`. These are completed selection
studies; fresh statistical confirmation remains unqualified until its actual
measurements and independent completed-owner review finish.

The preliminary v2 inline reader was intentionally stopped before completion
because its seed lookup used `branchId` instead of the producer's `id`. The
standalone `review-rogue-first-builder-state-v1.mjs` fixes that harness mistake.
Review also found that the new independent loader expected `completion.path`,
whereas the real producer seals an identity/result receipt. It now derives the
canonical `completed.json` path from the strictly validated identity and result
digest. Two regressions exercise the actual sealed receipt and reject foreign
paths, identities, digests and invented fields. These reader files are outside
the frozen producer graph; the owner, measurements and original pins are
unchanged. The CLI runs as:

```sh
node artifacts/forever-simulator/optimization/review-tools/review-rogue-first-builder-state-v1.mjs --verify artifacts/forever-simulator/optimization/rogue-full-raid-v2/state-branch-7bc8c1f4d79ab865.json
```

## Full-raid fresh-confirmation preparation

The new preparation path covers all six full-raid builder branches. It does not
reuse the older pre-update confirmation as evidence for the amended model.
`rogue-full-raid-confirmation-frames-v1.mjs` reconstructs every pass's actual
consume, gear and policy input, including the original control provenance. The
arm builder retains every last stable-pass policy finalist, gear decision
(including the mandatory full Darkmantle set), and final consume-coordinate
contender. Numerical aliases keep all original source locations and metrics;
contenders from different contexts are not combined into invented loadouts.

Consume inspection used seed `189900001`, while the shared confirmation protocol
requires genuine 10,000-fight inspection at `77191`. The preparation exposes
explicit alignment requests and retains the original scores and seed identities.
It cannot freeze fresh samples before these requests have real results. Alignment
does not select a new incumbent or change the retained list. The immutable request
binder is reused as class-independent code; no Hunter inputs or outcomes are used.

Every retained arm then enters batches of the unchanged protocol: one fixed
incumbent plus at most eleven challengers, two independent 20,000-fight samples,
three standard errors, separate approved 2% and original 1% assessments. Every
batch reserves disjoint 100,000-seed ranges. The branch ID distinguishes different
builders of the same spec. A declared maximum of 512 effective arms fails
explicitly instead of silently dropping the tail. Source ranges include the
current gear, policy and six-builder studies, their full-unit controls, older
validation history and the published Subtlety confirmation's reserved ranges.

Once the exact terminal all-six report exists, prepare with:

```sh
node artifacts/forever-simulator/optimization/review-tools/prepare-rogue-full-raid-confirmation-v1.mjs --plan --state-report artifacts/forever-simulator/optimization/rogue-full-raid-v2/state-recheck-<actual-hash>.json
```

The loader requires the actual successful supervised owner, independently replays
all parent and six-branch sources, authenticates every preparation source and
freezes the executable graph. It writes no RNG claims, runs no fights and grants
no publication approval. Unit fixtures cannot bypass this boundary.

Eighteen focused tests pass: six exercise real typed requests using saved one-
and two-pass shapes, five cover batching and margin assessment, three cover the
CLI and source-owner boundary, and four cover the reused alignment contract.
The fixture-only replay flags and synthetic holdout/alignment scores are never
saved as numerical evidence. Scoped nine-file lint and formatting pass; the
104-module preparation graph resolves. Actual all-six positive preflight,
supervised alignment/holdout execution, independent completed-owner confirmation
replay and final UI delivery remain unfinished. The original Rogue clock and
running/queued source graphs are unchanged.

The immutable preparation receipt is
`rogue-full-raid-v2/confirmation-preparation-5c44f299cbb993b4.json` under
`artifacts/forever-simulator/optimization/`, semantic SHA-256
`5c44f299cbb993b47778ac3f121cd86c6663dede33973b0b822b6104a1872a34`.
It freezes 109 static source/test files and records the executed checks. Its
separate retained-source audit verifies 16,386 unique existing hashes, including
12,256 live Rogue pins, 8,070 queued Hunter pins and prior preparation/audit
sources. All nine new Rogue preparation files are outside those frozen graphs.

## Supervised full-raid confirmation execution

The ordinary producer and supervisor are implemented separately from the
read-only preparation. They bind the exact six-builder state report to
`confirmation-delivery` / `all-styles` in the existing Rogue update window.
Neither substage starts a new clock. Both stage APIs and the numerical producer
require the actual supervisor before loading numerical sources or changing the
RNG registry.

```sh
node artifacts/forever-simulator/optimization/review-tools/run-rogue-full-raid-confirmation-v1.mjs --plan --state-report artifacts/forever-simulator/optimization/rogue-full-raid-v2/state-recheck-<actual-hash>.json
node artifacts/forever-simulator/optimization/review-tools/supervise-rogue-full-raid-confirmation-v1.mjs --search --state-report artifacts/forever-simulator/optimization/rogue-full-raid-v2/state-recheck-<actual-hash>.json
```

The execution context reuses each branch's selected full-unit native/WASM proof
only after comparing the complete actual numerical request and selected
settings. No replacement control fights are run for identical inputs. The
request-equivalence and reservation helpers retain historical Hunter names but
contain no class-specific inputs or results; Rogue supplies its own backend,
source, six builder identities, plans and owner.

The alignment declaration freezes every original arm and source origin before
measurement. Missing genuine inspections run through the bounded native runtime,
then canonical saved-source reads and complete read-only replay. Every aligned
plan is frozen before fresh outcomes. All six builders' original RNG claims
must exist before holdout fights start. A started stage cannot regenerate a lost
claim. Global registry overlap and every owned claim's exact bytes are checked;
different builders of the same spec have distinct validation contexts.

The fresh stage executes only the frozen two-20,000-fight requests, replays all
saved stages, and saves `confirmation-all-builders-<hash>.json`. It reports both
approved 2% and original 1% assessments. A result outside the approved margin
remains a saved failure and exits unsuccessfully, without switching incumbent or
rerolling seeds. Its `completedOwnerIndependentReview` and `publicationAllowed`
flags remain false: separate completed-owner review and UI qualification still
apply.

Seventeen final execution/control/owner/reservation tests pass, including actual
typed requests for all three published Rogue styles and six-builder protocol
fixtures. The initial 16/17 test run contained a copied assertion for a loader
flag Rogue does not expose; the assertion was corrected to check the returned
control proof. No production behavior was changed for that test correction.
The final TAP log is `rogue-full-raid-v2/confirmation-execution-contract-tests-v2.log`.
A direct unsupervised call against the real workspace also fails at the owner
guard before source loading, with the class ledger byte-identical afterward.
The 114-module producer/supervisor graph resolves. The subsequent actual all-six
source preflight passes, as recorded below. Alignment/holdout measurements and
independent completed-owner review remain unverified.

The execution preparation receipt is
`rogue-full-raid-v2/confirmation-execution-preparation-0bb91959ad65eb7c.json`,
semantic SHA-256
`0bb91959ad65eb7ccda8131b9867d466431f427730f586ac3a184cacf73de95a`.
It freezes 119 source/test files and records the final checks. Its separate audit
verifies 16,402 existing source hashes, including the earlier 109-file Rogue
preparation. All thirteen new execution/test files are outside those existing
frozen graphs. No numerical jobs or production RNG claims were created by this
implementation work.

## Independent completed-confirmation reviewer

`loadCompletedRogueRaidConfirmation` is implemented as a read-only consumer of
the actual completed producer. It requires all six ID/spec/builder tuples in
order, approved-margin acceptance, the canonical report hash and a successful
latest matching `confirmation-delivery` owner. The owner must match the current
producer bytes and exact `--state-report` arguments. A later unfinished retry
cannot fall back to an older success; later unrelated phases do not invalidate
the terminal run's stable receipt.

The loader authenticates the actual all-six state once, reconstructs alignment
offline, then replays every saved fresh-confirmation stage. Pending inspections
require the genuine sealed alignment source; an absent source never triggers
replacement measurements. Original RNG claims must be complete and match both
their exact saved bytes and semantic hashes, with global non-overlap verified.
The entire producer report is reconstructed from replayed evidence, including
selected controls, source pins, metrics and the separate 1% result. Header flags
alone cannot establish completion.

```sh
node artifacts/forever-simulator/optimization/review-tools/review-rogue-full-raid-confirmation-source-v1.mjs --verify artifacts/forever-simulator/optimization/rogue-full-raid-v2/confirmation-all-builders-<actual-hash>.json
```

After those checks, the loader returns
`completedConfirmation.completedOwnerIndependentReview: true`, all six selected
settings with their builder identities, and a dedicated
`completedConfirmation.verifyPins` callback. A delivery consumer must use that
callback to protect the completed confirmation and original claims; the inherited
parent callback alone does not cover them. Publication remains false until the
remaining UI and scenario qualifications are satisfied.

Fourteen reader/owner/IO contracts pass, including rejection of changed builder
identity, incomplete or failed owners, modified producer bytes, foreign paths,
symlinks, oversized records, missing alignment and altered report fields. The
final TAP log is `rogue-full-raid-v2/confirmation-reader-contract-tests-v1.log`.
The eight new files pass scoped lint/formatting and the 117-module reader graph
resolves. The real workspace's unfinished confirmation owner is also rejected.
These tests do not substitute for the still-pending positive replay of actual
sealed alignment, fresh measurements and a completed confirmation owner.

The reader preparation receipt is
`rogue-full-raid-v2/confirmation-reader-preparation-936962eff3bb92c4.json`,
semantic SHA-256
`936962eff3bb92c4d0ac27a9d2e4525b2b20c6e103e2636f57c6285aa77e4895`.
It freezes 119 reader/dependency/test sources. Its separate audit verifies
16,416 existing source hashes, including both earlier Rogue preparation graphs;
the eight new reader files are outside those graphs. The current Hunter queue's
8,070 frozen pins were preserved byte-for-byte in
`hunter-dungeon-upgrade-v1/control-queue-frozen-source-snapshot-v2.json` before
the queue removes its temporary owner record on completion. This snapshot is
source evidence, not a live-process or numerical-admission claim.

## Completed source preflight and queued confirmation

The actual combined preflight completed with exit code zero, full all-six source
replay and 13,764 pins. Its log is
`rogue-full-raid-v2/confirmation-preflight-503b5a793565b04f-v1.log`.
The six builder arm counts are 77/78/76/79/78/79, preserving
83/84/82/85/84/85 source origins. All six require genuine inspection alignment:
72 distinct requests total. Fresh confirmation retains 1,010 requests in 44
fixed batches. The preflight starts zero native/browser jobs, writes zero RNG
claims and does not qualify publication.

The ordinary confirmation supervisor was queued behind the actual Hunter gear
run `462485e9-516d-42aa-a7e4-ca6f7ff7551c`. The immutable queue receipt is
`rogue-full-raid-v2/confirmation-queue-after-hunter-gear-v1.json`, with 16,461
source pins. The queue checks the real parent process and terminal supervisor
result, requires successful completion and a free workspace, rechecks all frozen
bytes, and refuses dispatch after the original 23:53:21 UTC Rogue deadline. It
does not hold the workspace or create a new class clock while waiting. After
dispatch, output goes to `confirmation-owner-after-hunter-gear-v1.log`.
The queue receipt describes intent; its live process and the class supervisor
ledger determine whether numerical execution has actually started.

Hunter's exact parent owner subsequently completed with exit code zero.
The queue dispatched the ordinary Rogue confirmation owner at **13:42:46 UTC**
on October 24: run `5ea4976a-9a90-4d8e-82ec-75b1917d897a`, producer **PID 86850**,
supervisor **PID 86849**. Actual process liveness and the class ledger confirm
this transition; it is no longer only queued intent. The original October 23
**23:53:21 UTC** class start and October 24 **23:53:21 UTC** deadline are unchanged.
That process subsequently stopped progressing during source replay. It remained
live, but its CPU total stopped at about 53 minutes. An OS sample showed sleeping
threads; loopback inspector diagnostics found an outstanding filesystem promise.
Timers and synchronous stat worked, while separate asynchronous promise/callback
stat probes stayed pending. This establishes a runtime I/O stall observation,
not its exact native cause. No new Rogue alignment/fresh study was found.

The stalled process was terminated after its state was recorded. The original
run remains in history as `process-failed`, with `SIGTERM`; it was not relabeled
successful. The **same** command and source bytes restarted under the ordinary
supervisor at **14:34:31 UTC** as run
`fe7e94d7-e9fe-41f9-b715-02cf50fac614`, producer **PID 59985**, supervisor
**PID 59777**. Its CPU progress has resumed. Both original clock timestamps and
all **28** existing RNG reservation files were independently checked unchanged.
No source correction, holdout reroll or deadline reset occurred. The diagnostic
inspector was closed. Evidence is preserved in
`rogue-full-raid-v2/runtime-recovery-20261024/before-recovery.json`, its OS sample,
and `restarted.json`; output is now
`rogue-full-raid-v2/confirmation-owner-runtime-recovery-20261024.log`.

The old Mage queue was cancelled cleanly and its lock removed. Its replacement,
**PID 60212**, uses unchanged queue code and **8,603** pins, binds the replacement
Rogue run explicitly, and waits for terminal success. No completed fresh report
or 2%/1% outcome has been verified. The underlying runtime issue remains
unqualified; resumed progress alone is not confirmation success.

The recovery subsequently completed parent loading/replay and entered actual
inspection alignment at approximately **15:14 UTC**. Its canonical study is
`bounded-native-studies/15469be0ae1537befe390927f74488cbf2b47b8317cf540b6d97c8afda60e6af/`.
All **72** genuine 10,000-fight requests, twelve per builder branch, completed.
The study sealed at **15:31:43 UTC**. Its actual independent replay verifies
72 origins, 720,000 iterations and 72 stages. Completion semantic SHA-256 is
`e8200e0f6c2063601aaeff4e9b4fc2a508175e650f5e2a08a0aafc2167c603ea`;
result semantic SHA-256 is
`46365dfa8c0eadaf60612719cf6604bada8864ba3d30ca8046b7bb8cf4bb71a2`.

The unchanged ordinary owner subsequently entered actual fresh holdouts in
`bounded-native-studies/9a2c44ea4d05d4465a63906c664d6d4547bb2fb72c6f16f24d4259d86022e92d/`.
Its frozen declaration binds that independently replayed alignment, 13,768 source
pins and all **1,010** requests across **44** batches. All six native workers are
active; thirty 20,000-fight requests had been measured by **15:41:45 UTC**. This
is executed holdout evidence, not an accepted 2%/1% outcome or a completed-owner
review. The original deadline and selected primary builders remain fixed. Mage's
queue still awaits the actual terminal confirmation result.

## Primary builder selection before confirmation

The future three public defaults are frozen from the inspected 10,000-fight
selection results: Combat Backstab, Assassination Mutilate and Subtlety
Hemorrhage. All six builder candidates remain in the decision. The fixed policy
chooses the highest inspected mean within the same spec and combat scenario,
breaking exact ties by branch ID. It does not read fresh scores or use the
inspected DPS as a publishable reference.

The collector authenticates the terminal state owner, canonical all-six report,
branch/result/receipt hashes, selected settings and the original inspected
request ID at seed 77191. It explicitly leaves complete numerical source replay
and fresh qualification pending. The writer refuses to freeze a new choice after
any confirmation owner has started, and writes immutable content-addressed data.
Five tests pass, including the actual six closed source records, unchanged caller
data, ties, malformed/partial sources and rejection of fresh-score fields.

The decision is `rogue-full-raid-v2/primary-branches-51b9b386a3d42576.json`, semantic
SHA-256 `51b9b386a3d42576c49139dd181c8ac2b7b5b2a502d3a9cdcca49e6842ef7441`.
Its source receipt is `primary-source-9c20007181a17df2.json`, semantic SHA-256
`9c20007181a17df23f204806b63ade241f1bef70474d98883ce89067b01dcaaf`, in the same
directory. The receipt records zero confirmation runs at freeze and retains the
terminal state owner and all source hashes. No public defaults were changed.

Before delivery, each fixed primary requires a direct fresh comparison against
every retained contender from the other builders of that spec. Separately
passing each builder's own 2% checks does not establish that combined bound.
Keep the fixed first batch's two 20,000-fight primary samples as the cross-builder
anchor, preserve the within-primary checks, and compare other builders' retained
arms directly with the same nominal three-SE allowance and separate 2%/1%
assessments. No new winner may be chosen from those outcomes.

That consumer is now implemented in `rogue-full-raid-primary-confirmation-v1.mjs`.
It reconstructs each complete retained-arm plan and saved assessment, checks the
exact preselected inspected request/settings/source, and confirms that all
builders' full RNG reservations are disjoint. Each other builder's repeated
selected arm uses its first batch once; every distinct retained challenger is
included with its origin IDs. The anchor is always the primary's first two
20,000-fight samples. Reports preserve the different seeds rather than presenting
them as paired samples, and retain the primary's within-builder checks. A failing
comparison reports the failure without replacing the default. This is a nominal
pointwise practical assessment, not a simultaneous confidence bound.

The source loader authenticates the original immutable choice receipt and its
complete writer graph, then uses the existing completed-owner reader for the
full parent, alignment, claim and numerical replay. Its dedicated
`completedPrimaryConfirmation.verifyPins` rechecks both sources. Eight tests pass,
including the actual pre-confirmation choice receipt, missing/edited data,
adverse ranges, all cross-builder arms, and a regression where two individually
accepted builder margins would otherwise conceal a larger direct gap. Four-file
ESLint and formatting checks pass. No extra fights or RNG claims were issued.

The actual completed report was independently verified with this read-only command:

```sh
node artifacts/forever-simulator/optimization/review-tools/review-rogue-primary-confirmation-v1.mjs \
  --verify artifacts/forever-simulator/optimization/rogue-full-raid-v2/confirmation-all-builders-c5ba963fa985190d.json \
  --primary-source artifacts/forever-simulator/optimization/rogue-full-raid-v2/primary-source-9c20007181a17df2.json
```

The command points to the actual completed report and has finished successfully.
Its completed-owner and direct cross-builder checks passed; publication stays
false until the matching delivery checks complete.

The preparation receipt is
`rogue-full-raid-v2/primary-confirmation-preparation-6a2b8dceae9d5a92.json`, semantic
SHA-256 `6a2b8dceae9d5a9271939faf2d57e71f49cffda6571808cdc752552dcf347cfe`.
It freezes the 122 source/test pins and records the eight passing tests and
121-module static build. The accompanying
`primary-confirmation-source-audit-0a5045ca5cf7e19e.json` verifies all 16,446
existing frozen source hashes, including the original Hunter queue snapshot,
completed-confirmation reader and inspected-only primary decision. The four new
files are outside those earlier frozen graphs.

The recovery owner completed successfully on October 24 at approximately
17:53:45 UTC. Its actual fresh study is
`bounded-native-studies/9a2c44ea4d05d4465a63906c664d6d4547bb2fb72c6f16f24d4259d86022e92d/`.
The six-builder report is `confirmation-all-builders-c5ba963fa985190d.json`,
semantic SHA-256
`c5ba963fa985190d56fb499892d4c7abe15fb11bf37e3834668a22a60d02afa9`.
It records 1,010 fresh native requests, 20,200,000 iterations and 44 fixed
batches. The producer reports its retained-contender 2% assessment and separate
original 1% assessment accepted; that does not replace the independent primary
reader's direct cross-builder checks. Its completed read-only output is
`primary-independent-source-review-c5ba963f-20261024.log`. The original
October 23 23:53:21.695 UTC start and October 24 23:53:21.695 UTC deadline,
preselected primaries and all numerical/RNG provenance remain unchanged.
The independent review has now completed with terminal exit code zero. The log
has byte SHA-256
`9a440272d85a07b5a3b5cc60097f3f1725111d3d49b38d561fb8dd7a28d1c9a7`
and status `rogue-fixed-primary-builders-directly-confirmed`. It reports complete
semantic replay and completed-owner review, with approved 2% and separate
original 1% assessments accepted for all three primaries and all six builders.

| Primary | Fixed builder | Fresh DPS | Iterations | Largest conservative retained gap | Original 1% |
| --- | --- | ---: | ---: | ---: | --- |
| Combat | Backstab | 683.790 | 40,000 | 0.214% | Passed |
| Mutilate | Mutilate | 666.900 | 40,000 | 0.252% | Passed |
| Subtlety | Hemorrhage | 639.820 | 40,000 | 0.164% | Passed |

These are direct checks of the choices frozen before holdouts, including every
other builder's retained arms. They are nominal pointwise practical assessments,
not a simultaneous confidence bound, global optimum or live-server qualification.
No winner or settings were changed from the holdouts. Public defaults, presets,
library, guidance and desktop/mobile delivery still require matching UI checks.

## Consume feedback preparation

The consume request adapter and callback evaluator are now implemented as a
separate public preparation surface:
`rogue-full-raid-consumes-v1.mjs` and
`rogue-full-raid-consume-search-v1.mjs` under `review-tools/`. They accept an
actual class-6 Forever frame, preserve its selected gear, talents, APL, poisons,
raid buffs and encounter, and vary only the declared food, ordinary flask,
Blasted Lands buff and alcohol coordinates. None is explicit in each coordinate.
Shadow Oil, the matching off-hand dense stone, ordinary elixirs, Juju buffs,
Thistle Tea, chili and explosives stay fixed. This finite coordinate scope does
not establish exhaustive consume optimality or current server availability.

The evaluator reuses the existing callback-only coordinate selector; no Warrior
request or historical metric is reused. It retains the actual incumbent through
500/2,000/10,000-fight inspected selection and repeats after an accepted change,
up to two sweeps. A remaining accepted change at that cap leaves applicability
open. Any changed consume setup requires another gear/policy recheck before
independent qualification.

Eight tests pass against the three actual original-gear captures. The prepared
request controls cover all declared coordinates on every frame: **75 distinct
requests in batches of 64 and 11**. They validate typed requests and embedded
items without executing those fights. Tests also cover a changed Darkmantle gear
context, exact native incumbent equivalence, owner/pet/raid field preservation,
foreign rulesets, unmatched or raid-recipe consumes, caller mutation, and rejection
of wrong-context/wrong-precision metrics. Selector tie/change tests use explicitly
synthetic callback scores, which are not DPS evidence.

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-consumes-v1.test.mjs
```

The test log is `rogue-full-raid-v2/consume-preparation-tests-v1.log`. Scoped lint
passes for the three modules. Actual selected-gear consume controls, numerical
ownership, saved-measurement replay and final native/WASM parity remain pending;
these adapters alone do not qualify a new preset or score.

## Reproduction and records

Run from the repository root:

```sh
node --test infra/simulator/rogue-darkmantle-model.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-gear-bank-v2.test.mjs
node artifacts/forever-simulator/optimization/review-tools/capture-rogue-darkmantle-source-v1.mjs --capture
node artifacts/forever-simulator/optimization/review-tools/verify-rogue-darkmantle-engine-v1.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/prepare-rogue-darkmantle-catalog-v1.mjs --prepare
```

Nine focused Node tests pass. The commands preserve source bytes and write
separate immutable evidence or isolated unit-test workspaces. They start no
optimization jobs, class update clocks or browser fights and do not select public
models or deploy changes.

Authoritative records under
`artifacts/forever-simulator/optimization/rogue-dungeon-upgrade-v1/`:

- `source-823516a07e230f31.report.json`: exact client/table, quest-inventory and
  frozen engine source bindings. Public fixture:
  `infra/simulator/fixtures/rogue-darkmantle-source.v1.json.gz`, byte SHA-256
  `b1f9c2ac3169a9afc5e072ead5d2f5c8b5cd73e70c53d5532cbfbee0a7c29c25`.
- `engine-tests/verify-Oh2Gua/report.json`: expected parent failure and passing
  combined Go regressions, byte SHA-256
  `1ec8628dfdff5a8e6508ac71473d2524e70156dea1b93d7f54383743ab59ab34`.
- `catalog-9d1bd167ef8a8f80.json`: current item/stat/inspection additions and actual
  three-context proposal evidence, byte SHA-256
  `1433f3b1801c1c9291f727c0097cd207927dee6161ee1fb611520b013af98d57`.

Earlier failed test-harness attempts remain separate and do not qualify a model.
The compiled model is recorded separately under `rogue-full-raid-model-v1/`;
corrected controls are recorded under `rogue-full-raid-v2/`. Optimization and
independent numerical confirmation are now complete for the three fixed primary
builds. Matching UI delivery remains required.

## Reviewed full-raid delivery preparation

The completed independent primary review is now bound to an immutable delivery
source audit, `rogue-full-raid-v2/delivery-source-audit-9401b0609179b114.json`
(semantic SHA-256
`9401b0609179b1145b11850829ba5565f3281cfd72623defa3361a8d0aa48fb4`).
All ten current-model studies were authenticated against their original native
journals and sealed packed records: **432,808 origins / 82,257,280 iterations**.
The audit pins 20,745 files, the exact successful review, original supervised
owner, three pre-holdout primaries and their complete raw browser protobuf
controls. It does not rerank, sample again, start a class clock or qualify live
server proc timing or boss-debuff overflow.

The delivery snapshot verifies those pinned bytes and the exact sealed namespace
contents before reuse. The matching exports and virtual preset inputs are saved
in `build-preparation-793948b0a6ff268c.json`, semantic SHA-256
`793948b0a6ff268c12231c95aa826c1a62ba6e7219f7c3aacb5d8af25bfe50cc`.
The selected settings and 40,000 fresh confirmation iterations remain exact:

| Build | Talents | Reference DPS |
| --- | --- | ---: |
| Combat Backstab | 16/33/2 | 683.7899 |
| Assassination Mutilate | 30/21/0 | 666.8997 |
| Subtlety Hemorrhage | 30/0/21 | 639.8201 |

Each export includes the complete measured action list and source-bound
instructions. Combat's Blade Flurry at one second before the pull, ranked aura
conditions and every energy, combo-point and remaining-time condition are
preserved. Unknown guidance nodes fail instead of silently disappearing.

`preset-input-30264d1bf2847101.json` contains eight virtual Rogue files. They
provide all three measured gear sets, talents, APLs, poisons and consumes, plus
the Combat first-visit defaults. Loading a Gear Set also selects its required
Engineering/Leatherworking professions and disables item swapping and free tier
bonuses. Configurations additionally load talents, rotation, poisons, consumes
and range; race, buffs and encounter stay unchanged. The complete measured
scenario remains a separate full-build load. This is prepared source, not a
compiled or selected application release.

Twelve delivery regression tests and the zero-write generation preflight pass.
Explicit ESLint/formatting and all six new module entry graphs pass. Test and
preflight logs are `reviewed-builds-and-presets-contracts-v1.log` and
`reviewed-builds-and-presets-preflight-v1.log` in the same directory. Reproduce
without selecting a profile:

```sh
node --test artifacts/forever-simulator/optimization/review-tools/rogue-full-raid-delivery-contracts-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-rogue-full-raid-builds-v1.mjs --plan
```

The generated presets also pass a **clean strict TypeScript check** of the
actual Rogue modules and their imported dependencies: zero diagnostics, eight
virtual files and 545 authenticated dependency texts. A negative control replaces
the generated profession setter with an absent API and confirms that TypeScript
rejects it. The final report is `reviewed-preset-types-v2.log`, semantic SHA-256
`5f9716dd27268f914966676e8c0f6f5d12d403b5373f54d0bb86ef8517c87830`.
The first checker attempt is retained separately: its final text check compared
TypeScript's BOM-stripped text to raw UTF-8 text. The checker now compares the
same representation and records raw byte pins separately; the candidate source
and numerical evidence did not change.

The public preparation API `readReviewedFullRaidRogueBuild` in
`apps/web/src/lib/forever-simulator-full-raid-rogue.ts` accepts only the three
code-pinned build exports. It validates the source model, exact settings, scores,
both margin verdicts, complete action bindings and pending publication status.
Schema validation preserves the reviewed object representation so its source
hashes stay exact. The 8,090-byte fixture
`apps/web/src/lib/fixtures/rogue-full-raid-builds.v1.json.gz` contains the actual
three sealed exports, with no synthetic combat metrics. All **24 reader tests**,
scoped web lint and the full web package's `tsc --noEmit --incremental false`
pass. The new reader is ready for the presentation/library adapter; it does not
select an active profile or grant browser approval.

The candidate UI and its built-in desktop/mobile smoke checks now pass as
described below. Remaining work is actual simulation-request binding, application
profile/library integration and current-host browser approval. All new
records retain `publicationAllowed: false`; public and local profile pointers,
numerical assets, saved characters and class ledgers are unchanged.

The combined validation receipt is
`delivery-preparation-validation-75705a019f2c423c.json`, semantic SHA-256
`75705a019f2c423c88eacff82cfa91777dcc7849830d40dab61017ad0c7e5f80`.
It records all **48 passing regression tests**, both strict TypeScript checks,
scoped lint/formatting and the resolved module graphs. Its final byte check
verified **34,852 source/evidence files**, including all **13,610 previously
frozen Druid pipeline pins**. This seals the prepared code and exports; it does
not replace the remaining UI, application-adapter or actual browser checks.

## Compiled candidate and real built-in UI checks

The immutable candidate release is **3af0f3b699865a9396efdad9**, using the exact
qualified db33442499b7f5caaaaabf0c engine. Its build receipt is
presentation-build-01b7e29fb597bb32.json, semantic SHA-256
01b7e29fb597bb320c36fc7da608463fc1860d95b794ab9ffc6097df98900fdc.
The build consumed 50 virtual UI files and passed the complete upstream strict
TypeScript project check: **821 sources, zero diagnostics**. All 22 existing pages
are retained. All 28 starter/gear entries were audited; 94 starter slot repairs
stay confined to the candidate. The three measured Rogue loadouts have no gear
changes.

The first compilation attempt correctly rejected a display schema mismatch in
Darkmantle Boots' utility annotation. The display projection now obtains trigger
type 1 and spell 27037 from the captured client records, labels its eight stealth
levels and preserves its non-DPS scope. The original model/inspection evidence is
unchanged. The failed build remains recorded in presentation-build-v1.log; the
successful build is presentation-build-v2.log.

Independent verification is saved in
presentation-verification-b7ccbe97ae93be2b.json, semantic SHA-256
b7ccbe97ae93be2bc57e71dbf4e02a3ee72d224b949935ad6e283fb1de15273e.
It checked all **3,498 compiled files**, all **nine byte-identical numerical
assets**, the exact three full share payloads, all measured gear and the display
projection. It ran no compiler or combat jobs.

Real Chromium checks serve only the candidate's manifest files from a private
ephemeral loopback server, using isolated browser storage. Both desktop
1440×1000 and mobile 390×844 pass exact first-visit defaults, all three Preset
Configurations, all three matching Gear Sets and full export/import/reload.
Provisional proc consent remains off. Both widths have no horizontal overflow;
local asset requests and page errors are checked. These are UI checks with combat
requests explicitly blocked, not a new numerical qualification. The runner is
probe-rogue-full-raid-browser-ui-v1.mjs; its latest run log is browser-ui-smoke-v4.log.

Eight presentation contracts and four private-server transport contracts pass.
The app now transports optional pre-pull instructions and displays them before
combat priorities. Three component tests, eleven publication/guide tests and the
24 existing real-build reader tests pass together; the full web TypeScript check
also passes. These app changes do not select the new candidate.

Actual simulation-request binding and the application profile/library adapter
are now implemented and verified in the private preview described below. The
publication remains staged until the shared workspace is available for the
qualified local selection. No public or local active pointer was changed and
nothing was committed, pushed or deployed.

The continuation validation receipt is
ui-continuation-validation-a94a880fab012854.json, semantic SHA-256
a94a880fab012854c375745e8349ff8a2c3db7e74124d044ad584100508d4e3a.
It records **50 passing focused tests**, eight real browser UI checks, both
strict TypeScript scopes, scoped lint/formatting and **39,025 verified
source/evidence hashes**, preserving all 34,852 previous pins. The current
positive smoke report is
browser-ui-smoke-830e3060-6d0f-4792-b6b9-741b744eb308/report.json, semantic SHA-256
af9af4b7e3ef9b95516500dee6f1bacefd422594f98b25a779c0cb8dd9d34e0b.
Those historical receipts kept request binding and application integration
pending; the following delivery validation supersedes that status. Public
selection and deployment remain separate.

## Actual controls and application integration

The six real UI controls, one per build and viewport, match the original native
controls at **25 iterations and seed 868950001**. Complete action, resource and
aura metrics are checked against the original native and browser results, along
with encounter metrics, raw protobuf responses and stats admission. Neither the
40,000-fight reference scores nor their holdouts changed. The result is
`actual-ui-controls-725f2ba4-2af4-479c-8b73-f575619ca01a/report.json`, semantic SHA-256
`44a29a992567b46f827b9c01419efacdd27a26e24fec0a961633fffd3ba836bc`.

Two verifier issues are preserved in the failed attempt logs: empty UI raid
parties needed a sparse-array-safe reader, and the mobile enchant check needed
to run while the Gear tab was visible. The latter's four completed fights were
reverified from their original saved bytes; only the remaining two fights were
dispatched. The first attempt completed one fight before its extraction error;
its raw result was not retained and it provides no qualification evidence.
Eight raw-wire regression tests now pass. These corrections change verification
code, not the numerical engine, rankings or seeds.

The actual current HTML completion adapter passes success exactly once,
validation error preservation, cancellation/late-result suppression and both
privacy signals. Its receipt is `host-bridge-8b9ccea60dfe5067.json`, semantic
SHA-256 `8b9ccea60dfe50675335ac32a3b8b4524cd8584af4a590e27921fc235871d741`.
It ran three diagnostic 25-iteration fights and one cancelled request. Diagnostic
and injected late-event tests are excluded from numerical qualification.

Both widths also preserve a deliberately personalized weapon enchant when
reloading a saved character without a share fragment. The separate zero-combat
receipt is `saved-character-adeeac3d-bd83-4205-8afe-de0212ac5130/report.json`,
semantic SHA-256 `efc4138bad4add90bfa5038c8e5dbded0f72842208f37170796672acd5b89612`.
The failed initial test incorrectly expected the engine's fixed Player display
name to behave as a personalized setting; its failure remains recorded.

`forever-simulator-full-raid-rogue-profile.ts` now connects the three reviewed
exports to the shared application model-selection and publication readers. It
pins the actual qualified UI/control evidence, checks the unchanged numerical
assets and isolates failures to Rogue. The shared metadata validator retains
its four-field API; the published reader separately validates the complete
frozen rows, including rotation guidance. The actual compressed profile fixture
is `model-profile-rogue-full-raid-v1.json.gz`.

The real Next.js page was tested against a separate runtime root at
`profile-preview-88dde7e66e9ecd1e/`, without changing owner pointers. Desktop and
mobile both pass all three selections, exact loaded settings, displayed measured
DPS, full pre-pull/combat guidance, saved selection/character reload and no
horizontal overflow. Selecting builds starts no simulation. The final receipt is
`next-host-fe322fd6-6113-4d5c-be9a-11a00171d907/report.json`, semantic SHA-256
`3ce39ee4b05e34954f85ae9cd758b732ddef1c44b65a772ac189901bc47298d4`.

The final private-delivery validation is
`profile-delivery-validation-1d6ed9187447cbb7.json`, semantic SHA-256
`1d6ed9187447cbb7ef9ffec2394966e9b663f212cff4184c663270a039dcfab3`.
It preserves all **39,025 previous pins**, verifies **39,090 source/evidence
files**, and records **58 passing focused tests** plus the full web TypeScript
check. Shared application integration hashes are recorded separately from
frozen numerical/class-specific files so other class adapters can still be
implemented. Scoped lint and formatting pass.

Three additional pointer-promotion contracts pass. The prepared local command
below requires the normal workspace lease, verifies the sealed evidence and the
current application code, preserves all other profile entries, rejects
unexpected Rogue edits and saves rollback copies of only the two changed
pointers. It ran successfully after Hunter's feedback owner completed and
released the workspace:

```sh
node artifacts/forever-simulator/optimization/review-tools/promote-rogue-full-raid-profile-v1.mjs
```

Local selection completed **October 24 at 21:51:55.180 UTC**, within the original
**23:53:21.695 UTC** deadline. The actual application readers returned release
`3af0f3b699865a9396efdad9`, all three exact exported build IDs and their measured
DPS values. Both local pointers changed only Rogue; all other profile entries
were preserved. No new combat jobs ran.

The receipt and original pointer bytes are in
`artifacts/forever-simulator/optimization/rogue-full-raid-v2/local-selection-48e94aa7-82b0-40c3-a02e-d8d7e2759585/`.
The execution log is `local-promotion-owner-20261024T2151.log` in the same
`rogue-full-raid-v2` directory. The private Next.js preview remains at
`http://127.0.0.1:3027/tools/forever/simulator/rogue`. This is local selection;
no commit, push or production deployment occurred. Arbitrary seventeenth-debuff
rejection/eviction remains explicitly unqualified.
