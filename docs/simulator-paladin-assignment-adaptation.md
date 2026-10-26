# Paladin duration and positioning adaptation

This continues the existing healer campaign under its original October 25
23:58:06.787 UTC deadline. The confirmed three-minute builds and the thirty-profile
profession evidence remain intact. No engine, catalog, old model, source study or
production preset is overwritten.

## Declared fights and resource cycles

Tank assignments retain stacked three- and five-minute variants. Group and burst
assignments also include spread variants at both durations. The synthetic
post-mitigation pressure remains 600 DPS for tank/burst and 800 DPS for group.
Increasing duration regenerates the real damage schedule through 300 seconds;
it does not merely change a display label or reuse the old forecast.

Spread places the four recipients at x = -30, -12, 12 and 30 yards, with the healer
at zero. Everyone remains directly healable within forty yards. Vigil's actual
forty-yard radius around the marked recipient reaches two or three other-player
recipients depending on the anchor. Keeping everybody at 12–30 yards on one side
would leave them inside the same Vigil radius and fail to exercise that mechanic.
Existing Priest/Druid layouts are unchanged.

Existing explicit resource policies retain their exact three-minute packets.
Five-minute versions repeat the same two-minute cycle: Rune at 15/135/255 seconds
and potion at 30/150/270 seconds. These are proposed activation times. The native
engine still enforces ownership, chosen consumables, mana, demand, shared/real
cooldowns, casting and death. Native-default timing policies remain native-default.

## Source and model checks

The new constructor reproduces all 3,024 original selected numerical request
identities before adapting any fight. It composes the existing ranked spells,
full talents, gear, consumes, survival and reserve policies. A separate fixture
regression handles older measured-only training records without inventing a
`retained` field or dropping previously measured contenders.

Sixty native/Chromium controls cover all three archetypes, roles, durations and
layouts on both factions using the current Engineering/Tailoring reference builds.
Every complete metric payload agrees within 1e-7. Eighteen extended incumbent
cases fail the existing survival requirement; these remain diagnostic failures,
not approved new builds.

The first control owner is terminal failed: its final geometry postcondition
incorrectly required the selected rotations to cast an optional Vigil. Those
rotations use direct heals instead, so their output legitimately does not change
with spacing. The sixty completed captures are immutable and preserved.

The successor independently reconstructs the same sixty inputs and reviews every
saved native/browser payload without repeating those fights. Four additional
owned-rank probes explicitly cast Vigil and consume its mark with Holy Shock.
On both factions, stacked casts heal all four recipients and the spread endpoint
excludes the two recipients beyond forty yards. All four new native/browser
comparisons pass. The four probe plans also fail survival: they are deliberately
mechanic controls, not recommended healing rotations. The combined record retains
all twenty-two observed diagnostic failures.

Evidence under
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

- Preserved failed owner inputs:
  `paladin-assignment-adaptation-controls-v1/controls-od2CJG/input.json`, byte SHA
  `67a3cd820255d3d8d1d04df292145abc165769893ef0f09aa9dc015dd1f5000b`.
- Successful component review:
  `paladin-assignment-adaptation-controls-v2/controls-mVUzdR/report.json`, byte SHA
  `700581ea65ee22475ed7929d53fc29aa16522a68d548e35465cbd1d7581a5dac`.

## Initial feedback

The fixed rank/resource pass addresses the observed five-minute tank and group
failures across all twelve measured profession/faction profiles and three
archetypes. Tank stacked and group stacked/spread, each under reference and
combined conservative assumptions, make 216 cases. Keep every old group training
proposal. Add every eligible direct rank at the existing zero/400-health
thresholds, low-rank active pairs and fixed owned resource-policy alternatives.
Gear, full talents, consumes and pressure stay explicit. This isolates the mana
and rank problem before further coupled gear/talent feedback.

Two fresh, disjoint 32-fight training batches compare candidates. Selection keeps
the existing survival-first rule and 1% reserve preference; the independent 2%
confirmation remains separate. If no candidate survives, the result records no
selection and an explicit further-feedback requirement. It never lowers pressure,
waives survival or chooses from validation.

This pass does not complete the remaining five-minute/spread gear/talent closure,
burst adaptations, all twenty-eight source sensitivities, fresh confirmation,
profession transfer review for new winners, browser delivery or Paladin presets.
The all-class DPS/tank/healer goal remains active.

Read-only preparation:

```sh
node --max-old-space-size=8192 artifacts/forever-simulator/optimization/review-tools/run-paladin-assignment-rank-feedback-v1.mjs --plan
```

The same script's `--run` starts the fixed numerical phase inside the original
class window. Never duplicate a live owner or restart a completed phase. Actual
handles and immutable result receipts belong in `context.md`; a prepared runner
or model compatibility pass is not evidence that optimization finished.

The completed read-only preflight declares 8,472 whole options and 171,816
requests / 5,498,112 fights before exact reuse. Candidate counts are 178–579 per
case. Actual execution completed all 216 cases with 156,656 measured requests and
15,160 exact reuses. Thirty-six tank/reference cases have surviving selections;
180 group or conservative cases need further feedback. This is the fixed initial
domain, not independent confirmation or complete gear/talent optimization.

Terminal report under `healer-model-admission-v1/`:
`paladin-assignment-rank-feedback-v1/7591c5008744f14c65d559e8dbcfb35e56df8d31056830669152a580260341ce/report.json`,
byte SHA `4f1888fb512152fb72229cf1bef7cd648f6c29fff52bb5984f28663914dd68f6`.
The separate full saved-request review passed: all 171,816 uses, 156,656 unique
origins, 13,868 workload files and the entire result reproduce without new combat.
Its report is `paladin-assignment-rank-origin-review-v1/7591c5008744f14c65d559e8dbcfb35e56df8d31056830669152a580260341ce/review-2bFOPR/report.json`,
byte SHA `15942aed591e1583da590c2ec7f27109c1057cf1fc812f3fd3ec8a7d4d967810`.
Actual handles and subsequent numerical work belong in `context.md`.

## Coupled feedback preparation

The extended rank/resource study can legitimately return no surviving plan.
Further feedback retains the exact original incumbent and diverse measured gear
seeds without presenting a failed plan as a recommendation. Exploratory ranking
uses survival and delivered external damage before missing-health and reserve
metrics; raw HPS and self-healing cannot reward an early assignment collapse.

The new request binder accepts the existing 1,320 reviewed consume combinations.
Disabling a mana potion or rune removes both its workload action and its actual
encoded activation directive. Gear, talents, healing priorities, incoming damage
and unrelated cooldown settings stay unchanged. Tests cover every consume choice,
individual and combined resource removal, invalid choices and input preservation.

Profession request sharing is only prepared. The read-only 360-request example
projects 312 distinct packets to 104 while retaining full legality, profession-set
gates and active Engineering effects. It changes only the reviewed profession
fields, retains requested and numerical identities separately, transfers no
measurements and qualifies no extended assignment. Native/browser admission and
independent origin binding are required before a future numerical cache uses it.

One actual completed training case is being used to prepare the complete generated
gear and consume domains for its exploratory seeds. This is not an all-case
optimization or a final training source. Its copied partial progress record must
match the independently replayed terminal source before execution. No additional
numerical owner is started while the existing rank/resource owner is live.

Eleven focused feedback/consume/alias contracts pass. Actual artifact receipts,
live handles and the remaining qualification steps are recorded in `context.md`.

### Quest reward alternatives

The completed example generated 74,788 whole gear records and 5,280 consume
packets for four real exploratory seeds. Its coverage audit found Mark of Fordring
absent: every seed wore Fordring's Seal, the other quest 5944 reward. A necklace
swap alone is illegal; testing that quest choice also requires replacing the ring.

`paladinHealingQuestTradeCandidates` adds the minimal legal replacements for
conflicting equipped quest rewards. It preserves acquisition, profession, unique
and enchant rules. When a reward changes a weapon, complete hands are enumerated
together, including clearing the held item when choosing a two-handed weapon.
The original frozen bank and active numerical study remain unchanged.

Actual preparation revalidates all 74,788 original records and adds 252 legal
records, 63 for each seed. The combined domain has 54,489 distinct gears and no
missing eligible item in this example. A separate reviewer independently computes
every ring replacement without importing the generator and verifies exact record
equality plus all four encoded sample requests. Thirty focused contracts pass,
including six new regressions backed by real extracted item/source records.

Receipts under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

- Original domain: `paladin-coupled-feedback-domain-preparation-v1/prepare-SEh97v/report.json`,
  byte SHA `893e4e1bebbd6b52f77d579f144ac46bed4086737f2a14e0794a79b61bc481df`.
- Incremental repair: `paladin-coupled-quest-trade-preparation-v1/prepare-5LWv42/report.json`,
  byte SHA `9149262bc55ee88610faea71464d0cc64e9796ce8f8278474a6e49ac3719f1c7`.
- Independent review: `paladin-coupled-quest-trade-review-v1/review-ZoafYX/report.json`,
  byte SHA `f338032add5cc98c7ba489a6e8e11ae0f9a5b37f5160588c40cffe7ce387585b`.

These are candidate-domain and packet checks with zero new numerical requests.
Per-slot presence does not establish global optimality, closure for every case,
extended runtime admission or an independently confirmed recommendation. The
partial source must still bind to completed training before subsequent execution.

### Prepared native/browser request controls

The separate controller covers 360 profession-equivalence pairs, 232 prepared
gear-group examples, four reviewed quest trades, and 21 consume value combinations
on four seeds and both layouts. Every supported field value and a resource-free
combination appear; this is not the complete 1,320-choice interaction matrix.
Complete numerical identities reduce 1,124 source associations to 820 distinct
native/browser requests. Actual packets keep their original four-fight seed;
only detailed result collection and transport correlation IDs change.

Preparation validates 14,405 source/evidence files, all actual sample equipment
bindings and both source graphs. The source resolver rejects the protected cache
before reading it. The real runner's read-only verification passes. A real run
attempt against the live current owner refuses before browser/native creation;
an independent check confirms its process, class lock and ledger are unchanged.
All 35 focused contracts, scoped lint/format and syntax checks pass.

Prepared input under the evidence root:
`paladin-coupled-request-controls-preparation-v1/prepare-zRHnwj/input.json`, byte
SHA `24511cf86f664e4fdac3df700f40caa026b980338b4355df8eafd711734e480b`, semantic
identity `a0bbeb76793c19460bbfbfb3c5b2c4bcc39078dffa28577e9138e750a7c488bd`.
The same folder's `live-owner-refused.json` has byte SHA
`11359be1301ddd5f22a141408ddf13f59d40411893395d7e22043f5ccccc2671`.

After resolving the existing numerical owner's actual terminal status and lock,
run the frozen controller with that exact input path and byte hash:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-paladin-coupled-request-controls-v1.mjs --run artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-coupled-request-controls-preparation-v1/prepare-zRHnwj/input.json 24511cf86f664e4fdac3df700f40caa026b980338b4355df8eafd711734e480b
```

Use `--verify-input` for read-only validation. The executor uses the existing
Paladin class window, full detailed metric comparisons, raw captures, explicit
diagnostic failures and deadline cleanup. Actual execution has now passed all
820 native/browser pairs and all 360 profession comparisons, with no page errors.
Its 596 failed diagnostic assignments stay recorded as failures.

Genuine control report under `healer-model-admission-v1/`:
`paladin-coupled-request-controls-v1/controls-R8Nrjl/report.json`, byte SHA
`8fe51f5152114b3dc108bccb08debe5eb70c34b12d5a312e50f72374f77e1afa`.
The numerical owner succeeded without resetting the original deadline. Subsequent
feedback must independently reconstruct every capture and preserve requested and
canonical numerical identities; the combined executor performs that gate.
These controls qualify request compatibility, not an optimized build. All-case
feedback, fresh confirmation and website delivery remain.

### Adaptive sustain and recovery ranks

The completed training rows show a tradeoff: an exploratory low-rank plan still
fails despite little mana-blocked time, while other plans
lose roughly 38–40 seconds to mana. New finite proposals therefore use a sustain
rank with a recovery rank above a declared health deficit. They do not change
incoming damage, character, resources or source mechanics assumptions.

The domain includes adjacent direct ranks, each lower rank against its family
maximum, and cross-family maximum recovery. All 14 eligible nonraid direct ranks
participate; Holy Light 25292 stays excluded by the existing raid-book policy.
Recovery thresholds are 15%, 30% or 60% of configured recipient health, with
sustain thresholds of zero or 400. Actual active priorities retain every owned
spell, guard and target. When actives exist, both active-first and recovery-first
orders are explicit alternatives. This makes 216 policies without active
priorities or 432 with them. It is a finite domain, not an exhaustive rotation.

`createPaladinAdaptiveRankJob` derives full talents from the encoded level-60 Holy
Paladin and applies the selected priorities to the real workload. The complete
character packet stays unchanged. An absent policy reproduces the incumbent
exactly; merely adding adaptive metadata cannot count as a changed simulation.

Actual preparation covers four completed training seeds, six tank/burst reference
inputs and four admitted owned-active geometry probes. The 14 cases contain
4,550 variants, including each unchanged input, and 126 representative backend
checks. A separate reviewer rebinds every source and talent string, manually
reconstructs priority order and health thresholds, and verifies the actual job
constructor and complete numerical identity for every variant and backend input.
All 18 focused contracts, scoped lint/format and syntax checks pass.

Evidence under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

- `paladin-adaptive-rank-domain-preparation-v1/prepare-CncUn1/input.json`, byte SHA
  `22060a0b787f3c5ede4c2a781cb9944a76d3c63afdd92711d3ea74ca09f9eeac`.
- `paladin-adaptive-rank-domain-review-v1/review-49atwI/report.json`, byte SHA
  `5772095d835b6b42658145fb0b13e3a1cc3054b0199791c0daba92a972c52d08`.

These are construction checks with zero new numerical requests. The 126 backend
checks and subsequent fresh ranking have not executed. The next feedback phase
must use the real job adapter, retain prior candidates and failed-setup evidence,
and bind the independently reviewed terminal training source. Native/browser
admission, complete gear/consume feedback and independent confirmation remain;
no adaptive policy is yet a recommended build.

### Failure history in subsequent training

`paladinHealingGameplayKey` identifies a complete setup across seeds, sample
counts, reporting detail and transport IDs. Character data, buffs, ruleset,
encounter and full workload remain part of the identity. Use this key only for
historical exclusions; complete numerical request identities still govern
simulation reuse and every score keeps its actual seed and iteration count.

`selectPaladinHealingHistoryAwareTraining` validates both fresh training batches
and full external damage delivery before applying those exclusions. A later
passing batch retains its real metrics, but a known failed setup cannot become
the selected recommendation. If no admissible survivor remains, selection is
empty. The selector retains the existing training objective and reserve rule;
independent confirmation remains separate.

The private history bridge calls the existing verified failure-index lookup. It
preserves its immutable schema and evidence rather than rebuilding old journals.
Actual full-index review covers 1,323 setups and 1,668 failed origins from the
declared 12,768-request prior confirmation. Five real probes preserve an observed
one-in-512 failure across its later green sample and leave different setups and
the unrelated five-minute training winner unaffected. This index does not cover
every historical study; new terminal training/control failures still need their
authenticated origins added before subsequent selection.

An actual completed-case fixture reconstructs all 356 original request keys for
178 training candidates. Two different option IDs have identical gameplay inputs;
the exclusion covers both. Seventeen focused tests pass. The five portable
selector tests also pass in an external isolated directory containing only their
19 public source/fixture dependencies. Local protobuf integration tests stay under
the private review tools so a clean checkout needs no ignored codec helper.

Evidence under the usual `healer-model-admission-v1/` root:

- `paladin-healing-history-fixture-v1/capture-sPAOmS/report.json`, byte SHA
  `819110844f0b035ca5687ab1b0ba590e911818c40f2ef99facee2f18f8423cd8`.
- `paladin-history-bridge-fixture-v1/capture-8C3VLs/report.json`, byte SHA
  `0f5ca96dbf37e17d959de27f9e4adbef8e10e56ee41903c2e62357d7a33103a7`.
- Current bridge review: `paladin-history-bridge-review-v1/review-Tpfq22/report.json`,
  byte SHA `04b4fe3dfee99583ab7effd8aa89fba7b37d0c122f7273b6b2d65a4f2670ca43`.
- Isolated tests: `paladin-history-portability-v1/review-9HR6It/report.json`, byte SHA
  `0b4e2fc1b8b1c95532a71c5a9fc575a05f6215a941c58db5afb9b8c821139ca2`.

The earlier `review-GknXpC` remains historical evidence for the original test
organization; its exact test source is archived. The current review binds the
portable split. These checks add no numerical requests and approve no new build.
The prepared feedback runner below connects the adapter, controls, complete
original candidate bank and authenticated failure sources. Positive execution,
further gear/consume feedback and independent confirmation still remain.

## Executable adaptive feedback pass

The private `run-paladin-adaptive-rank-feedback-v1.mjs` accepts `--plan` or
`--run`, followed by three pairs of report path and byte SHA: the terminal
216-case training result, its independent origin review, and the actually
completed 820-request native/browser control report. It refuses a live class
owner before looking up proposed run inputs. The original deadline remains
October 25 at 23:58:06.787 UTC; it creates no replacement class window.

Preparation authenticates all three reports, reconstructs retained original
request keys, and independently replays the 820 actual raw captures and 360
profession comparisons. Control results retain their original key domain and
transport IDs. During a subsequent owner, the 126 prepared adaptive canaries must
match complete native/browser metrics before optimization dispatch.

Each case retains all original contenders with their actual scores and provenance.
At most two exploratory seeds supply finite adaptive policies: the chosen training
or exploratory seed and the original incumbent. One genuine four-fight screen at
seed 111000019 proposes at most eight policies per case. Each receives two actual
32-fight comparison batches at 93000023 and 97000019, matching the retained source
rounds. These are training comparisons, not independent confirmation. Upper bounds
are 186,624 screen requests and 3,456 training requests before exact-input reuse.

The prior-failure index, terminal source training, raw request controls, adaptive
canaries and new failures all contribute exclusions. A final pass rechecks every
case against the complete training failure set. No survivor means no recommendation.
Raw native captures and immutable workload hashes stay with each case; the growing
live journal is not treated as a final source hash. Progress contains case
references instead of repeatedly rewriting all metrics.

Twenty-four focused tests pass, plus scoped lint, format and syntax checks. The
actual live-owner guard preserved ledger/lock bytes and dispatched no new fights.
Final-source receipt:
`paladin-adaptive-feedback-preparation-v1/prepare-wv4Rkt/live-owner-refused.json`,
byte SHA `ae19030f0a20d388f48b0d4fc48d1319832b2e9c3b6564d9db5bb7a3e3b45d6a`.
The earlier refusal remains prototype evidence. This executor has not completed
a positive numerical pass. All-slot and consume feedback, burst/all-scenario
coverage, independent 2% confirmation with the separate 1% audit, profession
transfers and matching website delivery remain required.

## Combined gear, consumes and adaptive policy requests

The private `createPaladinCoupledOptionJob` rebuilds the actual gear-dependent
workload before binding a consume choice and adaptive policy. It returns the whole
option and actual job together, and checks gear, full talents, professions,
consumes, duration and sample settings against the encoded request. Leaving the
optional choices absent reproduces the exact original numerical inputs.

When changing consumes, the constructor regenerates a complete resource reference
first. This allows a previously disabled potion or rune to be enabled again with
the original action and timing policy. The consume adapter then removes any
disabled action and its encoded activation directive. Gear-owned set/item
policies are regenerated for the new loadout rather than copied from old gear.

Seven integration tests pass against actual source artifacts: both original
measured request keys, all 1,320 consume combinations, the resource round trip,
four quest-choice repairs with adaptive priorities, all 232 saved gear examples,
invalid choices and complete original-input rehashing. Native protobuf JSON omits
`id: 0` in an empty off-hand slot. Four two-hand examples expose this mismatch;
preserving the explicit empty slot recovers every original gear ID. No item stats
or existing requests were changed.

Actual preparation composes the 232 ordinary gear examples and four quest trades
with 216 adaptive policies and all 21 consume-control choices. It produces 236
distinct whole options and requests on one completed case from the immutable
partial training snapshot. The independent reader manually reconstructs every
packet, resource directive and priority without importing the new job builder or
consume/adaptive adapters. It confirms all 236 complete inputs.

Evidence under `healer-model-admission-v1/`:

- `paladin-coupled-option-packet-preparation-v1/prepare-zMbV4l/input.json`, byte SHA
  `1c018015d8c454de56b03e0dbe350fb83b2b95310f460af8dce90dea72693df1`.
- `paladin-coupled-option-packet-review-v1/review-rdXNjp/report.json`, byte SHA
  `4f7aa4e99259d6c5b0abda4ef8739a773e5fad26ce21cc553f500ae7f20aa9c1`.

These are prepared inputs, not measured backend comparisons or optimized builds.
They do not cover every consume interaction on every gear or all contexts. The
still-required coupled feedback executor must bind terminal training sources,
perform actual numerical comparisons and close its declared candidate coverage
before independent confirmation and publication.

## Combined numerical feedback runner

The next numerical pass uses `run-paladin-coupled-feedback-v1.mjs` directly after
terminal rank training, its independent origin review and the actual 820-request
controls. It accepts the same three path/byte-SHA pairs with `--plan` or `--run`.
Use Node with `--max-old-space-size=8192` for this large study. The original class
mutex and October 25 at 23:58:06.787 UTC deadline remain binding. The standalone
adaptive runner is retained as historical preparation; this combined pass already
includes adaptive comparisons.

Before search, the 126 adaptive and 236 whole-option canary sources are grouped by
complete numerical identity, retaining every source association. Every distinct
request must pass complete native/browser metric comparison. Already completed
820-request controls and their 360 profession comparisons are independently
replayed from actual captures during input admission.

Every case receives the full eligible group sweep: individual slots, ordered
jewelry, complete hands, set subsets, compatible enchants, quest displacements,
1,320 consume combinations, legal talent neighbors, owned priority/resource
alternatives and adaptive pairs. No stat or quality pruning is introduced. Talent
changes remove unavailable active spells and guards. Both plain direct-healing and
adaptive alternatives remain available.

The loop keeps every original training contender and its actual provenance.
Distinct new setups receive one genuine two-fight screen at seed 117000019, with
up to eight refinements per group at the original two 32-fight comparison seeds.
Screens and completed training are reused; a single batch is never duplicated to
invent two observations. Failed plans remain exploratory seeds, while only
history-admissible survivors can be recommendations. Two complete coordinate
sweeps are allowed. Stability requires an entire sweep with no choice changes,
and a later failure can invalidate an earlier stable selection.

Engineering/Tailoring defaults and reference assumptions run first; all 216
declared cases remain required. Every 256-build chunk checks the original clock
and five GiB of free space. Actual requested packets and canonical numerical
origins stay distinct when profession equivalence applies. Immutable captures
preserve native rows, workload hashes and alias proofs. Final choices are checked
against the complete observed training failure set.

Construction caching includes model, whole build, kind, scenario, pressure, layout,
duration and faction. Legal profession fields and actual sampling/reporting values
are rebound explicitly. The bounded cache shares identical immutable schedules and
returns owned copies. It stores no numerical results. This matters because each
real five-minute frame contains 1,196 damage events and about 52 KB of JSON.

Fourteen focused tests pass: six real candidate-domain checks, three loop/selection
checks using saved native data and five template checks. Coverage includes every eligible item in all
17 slots of the reference pool, all consume choices, active-talent loss, exact
fresh/cached request bytes across legal profiles and sampling modes, isolation and
bounded eviction. All seven operational sources pass lint, formatting and syntax.
The final actual live-owner refusal retains the ledger/lock byte-for-byte:
`paladin-coupled-feedback-preparation-v1/prepare-gxYPul/live-owner-refused.json`,
byte SHA `929c8ee0958b49b345a4f096bd626df8e720d37463df5ebcb0e83d2f8463a9d2`.

This verifies implementation and input construction, not positive numerical
execution. The separate reader below now implements complete-source replay;
actual feedback completion, positive origin replay, burst/all-scenario coverage,
fresh confirmation and matching website delivery remain. The original compact
reserve replay cannot validate the new format unchanged.

The combined executor has now been started with the actual terminal initial
result, its passed origin review and the passed 820-request controls. Its `--run`
performs the required preflight before creating the numerical owner. Check the
existing process as well as the ledger; an empty ledger during startup does not
authorize a duplicate launch. Exact handles and the live log are in `context.md`.
This is an executing preparation/feedback workflow, not a completed coupled
result or approved preset.

## Independent replay of coupled feedback

The private `review-paladin-coupled-feedback-origins-v1.mjs` accepts the terminal
coupled report path and its actual byte SHA. It requires the declared identity,
real succeeded owner, unchanged original class deadline and no matching running
owner. Failed execution history remains attached to the review. A preparation
receipt or partial progress file cannot satisfy this gate.

Five exactly reversible I/O edits derive a read-only copy of the frozen combined
producer. They replace numerical dispatch, browser dispatch, artifact writes,
progress writes and the awaited entrypoint. Candidate generation, coordinate
feedback, history exclusions and complete selection/comparison code stay intact.
The derived copy resolves every request against its genuine saved journal row,
including detailed canaries, compact scores and profession aliases. It retains
the actual native and browser IDs instead of assigning new measurement origins.

Every regenerated artifact must reproduce its entire original pretty-printed
JSON bytes, including source associations and original references. Full backend
metrics, request/reuse counts, workload files and final result must also match.
Resumed journals may contain earlier cached rows; they must all be reconstructed
while preserving the final execution's actual measured/reused counts. Original
artifacts stay in place. Producer and reviewer dependencies are checked before
and after replay. The reader starts no native engine or Chromium process.

Run only after the combined numerical phase has actually completed, using its
real terminal report and SHA:

```sh
node --max-old-space-size=12288 artifacts/forever-simulator/optimization/review-tools/review-paladin-coupled-feedback-origins-v1.mjs "$PALADIN_COUPLED_REPORT" "$PALADIN_COUPLED_REPORT_SHA256"
```

Ten new regressions and four existing saved-origin regressions pass using actual
immutable inputs and backend captures. Five-source lint, formatting and syntax
checks pass. Actual live-owner and wrong-phase refusals preserve ledger/lock
bytes. The 86-source AST graph includes the derived producer and tests and rejects
protected-cache dependencies before reading them.

Preparation receipt under `healer-model-admission-v1/`:
`paladin-coupled-origin-review-preparation-v1/prepare-dPzjb8/report.json`, byte SHA
`f472ed4c27f7ec62634c4dbf6d325b4e285800fd593ab582583383c810800908`.
It explicitly records that the actual combined-source review has not completed.
This verifies the checker and its refusal paths; positive complete-source replay
still needs a genuine terminal coupled result. Neither component checks nor a
future successful origin replay replace independent numerical confirmation or
approve a public preset.

## Website integration after confirmation

The later coupled search is terminal under its original24-hour limit. Session5333
exits1 and all seven original processes are absent. The closed journal retains
199965actual native origins(199621compact/344detailed). Four completed case files
have stable:false and feedbackComplete:false;5749JSON checkpoints remain. No final
phase report or fresh coupled confirmation exists. This is preserved training
evidence,not a recommended five-minute build. The read-only terminal observation
is `paladin-coupled-deadline-v1/observation-WVcRFr/report.json`, SHA
`b5e4526749d826bd17f4d9c50482ea1a8fc9d99ceb62ad146bdf3e447e8d14dd`.
Do not restart or extend the expired numerical window without a separate explicit
decision. Existing confirmed three-minute delivery and other class work can
continue.

The existing confirmed three-minute results now have a separate prepared source
pack for the two default Engineering/Tailoring profiles. Its 18 archetype/role/
profile groups contain 504 mechanics-specific configurations and 1,616 saved
native origins. Every configuration retains its own gear, full talents, consumes,
priorities and original reference sampling. All 504 jobs and 1,616 replies pass
the existing Paladin package transport schemas without transformations.

Current source pack under `healer-model-admission-v1/`:
`paladin-three-minute-library-source-v2/prepare-wgo6kV/input.json`, byte SHA
`7ac73855daf98e35dac7e8f865ca40b612792c85def64863aff41cc487495cf9`.
V1 remains immutable but is superseded for library input: its raw group context
serialized an internal Set as an empty object and undefined ownership entries as
nulls. V2 carries only exact class/faction/profession/race fields. Scores, original
requests and sample counts remain unchanged.

Independent source review now passes all504configurations,1616actual native
origins in their five original closed journals,330workload files,complete requests
and2243eligible catalog items. It reconstructs source option banks and matrix
membership without importing the packet producer or its job/group constructor.
Review `paladin-three-minute-library-origin-review-v2/review-NE9ak1/report.json`,
SHA `58e8a3c35b2d91eaa3cd2fd00e98daa490aaaddb30a7d02ecdcf88f6b40ae0ce`.

The runtime API in `infra/simulator/paladin-healing-library.mjs` creates,validates
and freezes a candidate,then returns owned copies of complete configurations.
Switching scenario replaces its own gear,talents,consumes,encoded resource timings,
workload and reference together. Validation indexes the immutable candidate once;
subsequent selections do not rescan every configuration. Source records and
personal edits remain separate. All504states and18reference defaults reconstruct
exactly after JSON transport.

Candidate `paladin-three-minute-library-candidate-v1/candidate-D6XoP0/report.json`,
SHA `092328e2c5e36a481fa3b1c9224f3f1d3c3da139d2f784385f81353b412a1c9b`.
Its library deduplicates330workloads across504configurations:11,731,707raw bytes,
504,618gzip bytes and298,055Brotli bytes. Both compression round trips pass.
HPS remains explicitly demand-limited; the paired2%comparison concerns the
declared missing-health objective. This does not qualify five-minute or spread
builds,grant a full-class claim,or select any public preset.

`packages/forever-data/src/paladin-healer-library.ts` defines the source-level
typed candidate/group/configuration contracts. Validation preserves the original
input rather than rebuilding object member order: saved workload identity uses
its exact JSON. All330workload hashes and504native request identities survive.
The engine catalog boundary deliberately retains extra versioned fields; all
library/control/context structures reject unknown fields. Existing native job
and workload schemas validate Paladin priorities and policies.

The new module is intentionally separate and used by focused verification. It is
NOT yet registered in the package export/build entry list or generic healer
workspace. Those changes must accompany an explicit third Paladin branch; the
existing Priest/Druid fallback must never load this data as a Druid library.
An isolated browser-target JS/declaration build and its installed-Zod bundle
successfully validate the genuine candidate. That is compiled-JS execution under
Node,not a real browser or website admission.

The current server's two library readers enforce an8,000,000-byte decoded limit.
The11,731,707-byte candidate is therefore an internal archive,not a drop-in
website library despite its small compressed transfer. Packaging is implemented
in `infra/simulator/paladin-healing-library-shards.mjs`:20flat,safe-name JSON assets,
comprising an index,shared catalog and18complete group payloads. Each group carries
all28scenario-specific options and exactly its required workloads. The index
preserves archive/property/configuration/workload order and binds every asset's
byte size,hash,model and original candidate identity.

All504configurations/330workloads/2243items reconstruct from actual disk files to
the exact original archive bytes. Index101,281decoded bytes(33,375Brotli),catalog
2,438,685decoded bytes(131,448Brotli),groups260,741–1,057,047decoded bytes. All20
assets fit the existing8MB limit. The60raw/gzip/Brotli files pass disk/compression
round trips. Missing,extra,duplicate,tampered,cross-model and unsafe-path assets
cannot reassemble. Actual packaging report:
`paladin-library-shards-v1/candidate-P4KaJE/report.json`, SHA
`7150a4a57bc3a20e38dfdf2612aa51b1629d3d15f2b5410035a6619c10fa86dc`.

Typed contracts are in
`packages/forever-data/src/paladin-healer-library-payloads.ts`. They validate the
index,catalog and a single group before the full archive is loaded. Cross-index
helpers bind group/model/archive metadata and declared workload IDs. Original
JSON objects/identities are preserved. Archived primitive build definitions stay
fixed in the old archive module;the payload protocol owns separate versioned
definitions. Asset byte integrity remains the release loader's responsibility.

An isolated browser-target SDK JS/declaration build and source map are verified
against current sources. Its installed-Zod bundle executes under Node and
validates all20actual disk payloads. Exact reassembly STILL passes after typed
parsing;no measured field or JSON identity was stripped.41public Node tests pass
in an isolated29-source workspace without private artifacts/node_modules;28SDK
tests and package types,scoped lint/format/syntax pass. This is not real browser
or website admission. Final payload preparation:
`paladin-library-payload-preparation-v1/prepare-Bz2hcY/report.json`, SHA
`59bded7ef47cddbb1522b3f3301d4965f91380a87dbac0fc2c92a2502b0f1f36`.

SDK export/build registration,scoped release/manifest,explicit Paladin loader and
UI integration remain. Keep size,checksum,immutable-pointer and symlink checks.
Actual approval belongs in external source-bound release evidence;do not rewrite
measured payload flags or infer full-class qualification. The generic UI's
one-loadout/many-assumptions shape must become a whole-configuration selection
with versioned personal saves preserving policy/consume/encoded timing fields.

```sh
node --test infra/simulator/paladin-healing-library-shards.test.mjs infra/simulator/paladin-healing-library.test.mjs
pnpm --filter @wow-trader/forever-data exec vitest run src/paladin-healer-library-payloads.test.ts src/paladin-healer-library.test.ts src/paladin-healing-simulator.test.ts
```

Compile the worker using `installPaladinLegacyHealingWorker` from
`infra/simulator/paladin-legacy-worker.mjs`;it checks both legacy item policies and
the required external-demand result ledger. The F0model's actual `healing.wasm`
SHA is `80e983c15cb50de608c5ea04d3799850c84ec0156d017904d8b6336316b8c6f9`.
Use its own pinned `wasm_exec.js`. The original base Paladin worker is an earlier
protocol and cannot stand in for this complete library's contract.

Final preparation `paladin-library-delivery-preparation-v1/prepare-3Gyo74/report.json`,
SHA `5c2ccbda25652a218ab6ee116b0f68a3de6df3e25544b06ddc83b9ce9cfd3840`.
It retains source/compiled-asset hashes and explicitly leaves package registration,
workspace integration,frontend browser admission and publication false. Do not
edit its frozen sources in place; derive a successor when behavior changes.

The earlier archive-contract checkpoint passed39Node tests and19SDK tests,plus
package typecheck and scoped lint/format/syntax.32public Node tests passed in an isolated27-source
workspace with no private artifacts or node_modules. The real portable fixture
contains the genuine candidate and504checks derived from original source states.

```sh
node --test infra/simulator/paladin-healing-library.test.mjs infra/simulator/paladin-healing-coupled-confirmation.test.mjs infra/simulator/healing-paired-comparison.test.mjs infra/simulator/paladin-healing-failure-history.test.mjs
pnpm --filter @wow-trader/forever-data exec vitest run src/paladin-healer-library.test.ts src/paladin-healing-simulator.test.ts
pnpm --filter @wow-trader/forever-data typecheck
```

The new public `paladin-healing-coupled-confirmation.mjs` also supplies reusable
round validation, frozen-cohort construction and four-by-512 assessment. Its
fixed policy compares the supplied winner with eight distinct gameplay objective
leaders, five distinct gear leaders and the admissible original incumbent. All
training evidence remains listed; this finite cohort is not global optimality.
Known failed or incomplete choices stay unqualified. Fresh results cannot replace
the frozen choice. Duplicate origins cannot masquerade as independent batches,
setups or competitive alternatives. Practical 2%, strict 1% and per-comparison
95% intervals stay distinct. Actual source/job authentication belongs to the
gated numerical caller; a pure component result cannot approve publication.

Run the component regressions with:

```sh
node --test infra/simulator/paladin-healing-coupled-confirmation.test.mjs infra/simulator/healing-paired-comparison.test.mjs infra/simulator/paladin-healing-failure-history.test.mjs
```

All 20 tests pass, including genuine successful and rare-death confirmations;
the same suite passes without private artifacts in a 24-source workspace.
The actual new confirmation executor and fresh coupled holdout are not completed.
Exact immutable receipts and current numerical handles belong in `context.md`.

The existing workspace supports Priest and Druid through discriminated contracts
in `packages/forever-data/src/healer-workspace.ts`. Paladin needs its own validated
library/workload/release schema and model identity. Preserve the two existing
class protocols and saved characters when adding that third branch.

The current generic configuration mapper retains only direct-rank, target,
missing-health and HoT fields. It would drop Paladin's `maintainVigil`,
`requireVigil`, `minimumPartyTargets` and `minimumPartyMissingHealth`. Its successor
must preserve the exact selected priorities, Divine Favor threshold, resource
order and encoded activation settings. Likewise, Paladin's Blessing of Light,
Vigil refund, item and rank assumptions need their actual reviewed settings;
one generic rank-policy dropdown cannot silently replace them.

`apps/web/src/lib/healer-simulator.ts` currently treats every non-Priest profile as
Druid in its availability check. Extend it with explicit class dispatch when
Paladin is added. A union extension alone would load the wrong class library.
Keep checksum, path, immutable-pointer and compressed-asset checks unchanged.

`healerConsumeMenus` also currently has two class branches. Paladin's menu must
use the pinned enum and actual reviewed consume domain. In this model food 1 is
Grilled Squid, food 3 is Nightfin Soup and food 4 is Runn Tum Tuber Surprise;
Greater Mageblood is a separate mana-regeneration field. Do not derive labels
from an old fallback's spelling or reuse the Druid menu by falling through.

Deliver the confirmed gear/enchants/talents/consumes and priorities to the first
visit, presets, Gear Sets, saved/shared builds, library and guidance together.
Generate instructions from the winning rotation: a Vigil talent does not mean
the measured rotation casts Vigil. Verify Simulate, Stop/recovery, desktop/mobile,
item hovers, saved-character isolation and one page scroller against the actual
qualified release. No Paladin workspace or preset has been published by this work.
