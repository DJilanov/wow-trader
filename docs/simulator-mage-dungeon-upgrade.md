# Mage dungeon-upgrade recovery

## October 27 — expanded catalog and statistics preparation

Follow-up: exact-context successor
`current-mage-candidates-v1/prepare-aAkLGH/exact-stats-IIvGT5/input.json`
now has six complete native/browser stat pairs and independent raw request,
result and all-vector replay. The earlier stat checks omitted active-party
count and retained older recorded support; their reports remain historical.
Use the new receipts in [the expanded statistics record](simulator-current-statistics-model.md).
The three banks and compiled gameplay model are unchanged; no ranking ran.

A separate derivative now combines the existing stable-statistics correction
with the qualified expanded 2,743-item catalog and all 72 base dungeon-set
pieces. The initial 303 native and Chromium/WASM component outcomes pass,
including 37 Mage controls. Another 116 existing Hunter, Rogue/Valor and Feral
DPS outcomes pass in both backends on the same frozen model, for 419 total.
Six complete stat API pairs
pass for recorded Frost/Fire/Arcane incumbent and full-set settings.

Three newly bound all-slot search banks and their independent audits pass with
full-v2 raid buffs, all 247 Sorcerer subsets and mandatory full-set retention.
These are preparation artifacts, with no new DPS scores, ranking jobs, numerical
reuse, class clock, selection or publication. The pending additional Mage
window is unchanged. Exact model, bank, audit and source receipts are in
[the expanded statistics model record](simulator-current-statistics-model.md).
Earlier sections below retain the older-model history.

The original catalog audit found all eight base **Sorcerer's Regalia, set 517**
pieces missing. The same-name alternate **1671** has different item IDs and
bonuses. The existing name-based Mage handler grants the alternate's three-piece
MP5 and four-piece mana proc. Adding the base items without correcting dispatch
would therefore produce incorrect comparisons.

| Work                                                  | Evidence                                                                                                                                                 | Status                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Recover exact base and alternate identities           | Current build 1.60.1.70532, authenticated tables and separate memberships                                                                                | Implemented                                                                           |
| Review current stat and effect payloads               | Eight base pieces, complete eight-spell trigger closure and strict payload checks                                                                        | Implemented                                                                           |
| Recover class/faction quest associations              | Same-TOC QuestieDB 1.0.4, eight quests and sixteen item associations                                                                                     | Implemented; live delivery unobserved                                                 |
| Normalize all eight item drafts                       | Current armor, spell power and rating conversion; historical data supplies icons only                                                                    | Implemented in an unselected candidate model                                          |
| Corroborate quest reward sections                     | Eight primary Forever page/index sections; four quests also have exact linked base IDs reviewed                                                          | Reference review implemented                                                          |
| Implement base-ID runtime dispatch                    | Exact base thresholds, Forever armor dependency, incoming freeze, explicit immunity/range/DR policy; 31 native and 31 Chromium WASM test outcomes pass   | Implemented within the declared scope                                                 |
| Compile a complete Mage model                         | All 2,695 items, semantic parent/new database checks, embedded/UI database conformance and compiled regressions                                          | Implemented; full-fight qualification pending                                         |
| Prepare Frost, Fire and Arcane candidate domains      | Actual published setups with full-v2 buffs, every slot/pair/set and legal enchant; all 247 base subsets and full eight-piece comparison                  | Implemented; four integration tests pass                                              |
| Prepare current gear requests                         | Exact Forever source templates, explicit published overrides, preserved options/consumes and current database; four tests                                | Implemented; full-fight execution pending                                             |
| Execute supervised UI/native/WASM controls            | Thirty actual captures and native/WASM pairs; corrected full-row/raw-wire replay and six unchanged-parent controls                                       | Corrective owner completed successfully                                               |
| Admit completed control evidence                      | Exact corrected owner, preserved failure/window, all raw captures and result/stat bytes; ten correction contracts pass                                   | Actual independent completed-source admission passed                                  |
| Search and replay all-style gear                      | Compatible v2 producer/reader, all three full domains, 497 typed controls and three additional contracts                                                 | Preflight passed; numerical owner pending Hunter feedback priority                    |
| Prepare geared talent/APL/mana and consume feedback   | Actual-context requests, authenticated historical proposals without scores, all-style coverage and four-pass closure; fifteen tests                      | Callback pipeline and completed-gear input gate implemented; actual execution pending |
| Supervise and independently replay all-style feedback | Compatible v3 command and reader, corrected control/gear admission, exact category/selected raw-unit parity; nineteen compatibility contracts            | Implemented; actual completed gear required                                           |
| Prepare current geared finalists for confirmation     | All three typed selector frames, every retained finalist/source alias, genuine inspected-seed alignment and full historical RNG exclusions               | Implemented with coverage v2; 46 combined contracts pass; actual source pending       |
| Execute and independently replay fresh confirmation   | Compatible v2 command and reader, original immutable RNG/exclusion policy, exact completed-owner and whole-report replay; twenty compatibility contracts | Implemented; actual completed feedback required                                       |
| Optimize all Mage styles and publish matching presets | Complete candidate/set domains, bounded feedback, fresh confirmation and actual UI checks                                                                | Pending                                                                               |

The selected catalog, engine, presets and ranking are unchanged. The actual Mage
update window began October 24 at 17:53:53.844 UTC and ends October 25 at the same
time. The original all-class campaign remains in scope.

## Runtime implementation and actual browser controls

The isolated component now routes **517** by exact ID and leaves **1671** and
Classic's inherited handler intact. It grants each base 2/4/6/8 bonus once and
excludes the alternate MP5 and mana proc. Mage's missing `BonusArmor → Armor`
dependency is restored during Forever initialization, before stat finalization;
the Classic constructor and other class constructors stay unchanged.

The incoming-hit trigger uses the reviewed 2% chance, one-minute internal
cooldown and three-second child root. It rejects outgoing casts, healing,
periodic damage, misses, friendly casters, root-ineligible targets and attackers
outside the engine's five-yard child range. Root movement state, aura expiry,
cooldown and iteration cleanup/reset are tested. Range follows the existing
one-dimensional engine geometry; that is not a complete world-position model.

Current client extraction was necessary for diminishing returns. A fresh
**70532** `SpellDiminish` capture, with the same hotfix hash as the item evidence,
contains twelve effective rows. Spell 27868's current `SpellCategories` mask
**4** selects row **3**, named **Stun**. The implementation preserves that source
assignment rather than substituting ordinary Root or Root (proc). Row 3 supplies
0.5 scaling, three successful applications and a 15-second reset duration.
The engine's explicit DR toggle and reset-anchor assumptions remain explicit;
the unknown client target-policy field and server reset behavior are not inferred.
The capture record is
`mage-dungeon-upgrade-v1/diminish-captures/capture-acQ63g/report.json`.
Its source JSON has byte SHA-256
`50ce0640949099a2c59564572f648b21f89f1a51894e74c4b82537abaa0e19e5`.
The original extractor was copied into an isolated project and remained unchanged.

The native report is
`mage-dungeon-upgrade-v1/runtime-controls/verify-7ig5ln/report.json`, semantic
SHA-256 `7a19d22169931f17d4b3702ed92667d0e8592056f7c1e40868ac96ca8a2d9bf1`.
Six top-level tests and their subtests produce **31 passing outcomes**. The
derived workspace copies all 465 frozen non-test production inputs and adds
only the reviewed overrides and harness. All 478 parent source pins remain
unchanged. The initial failed attempt `verify-3YS9Ij` is preserved: its reset
test omitted the engine's required iteration cleanup; adding `Cleanup` before
`Reset` corrected the harness without changing model behavior.

The same test binary compiles to WASM and actually runs in headless Chromium.
All 31 named outcomes pass, with zero page errors, in
`mage-dungeon-upgrade-v1/browser-controls/verify-5mTrDd/report.json`, semantic
SHA-256 `9d5df6da61c9f22011223ee341a64cdee4c17cd71ae87d1c0ec85ed337d105e4`.
This validates the component's tested bounds in both runtimes; it is not an
exact full-fight DPS parity comparison, amended catalog admission or UI delivery.
Twelve combined source/dispatch Node tests pass. Scoped lint, formatting and
Go formatting checks pass. The final validation receipt is
`mage-dungeon-upgrade-v1/runtime-validation-fda0bec780491fc1.json`, semantic
SHA-256 `fda0bec780491fc19480568a8a45f3da394a2c4a029240a2eb49372096bb015a`.
It freezes the ten new implementation files and verifies all 17,014 combined
source hashes, including the queued Rogue confirmation inputs.

Damage-break behavior remains unverified. The captured `SpellInterrupts` table
has 9,907 decoded rows and 322 encrypted records; spell 27868 is absent from both
decoded base and effective rows. The first full-table capture correctly refuses
qualification. An offline inspection of those preserved DB2 and hotfix bytes
confirms the absence, without another extraction:
`mage-dungeon-upgrade-v1/interrupt-captures/inspect-ALLzBI/report.json`.
An absent row in this incomplete table does not prove zero interrupt flags.
The current component's explicit duration behavior therefore must not be promoted
as verified live damage-break behavior. Root immunity, live proc cadence and
global debuff overflow also retain their existing qualification limits.

## Complete candidate model

The private, unselected model is **be2a36c536da0c9d2f3fb19a**, recorded in
`mage-full-raid-model-v1/context.json`, semantic SHA-256
`f51c94d2c23307628b4b89cf95c60bbbbb07a47de3a6df3ccb4d83a2d8849157`.
It preserves every one of the frozen Hunter parent's 2,687 items and appends
only the eight base Sorcerer pieces. Acquisition narrows their unrestricted raw
wear mask to Mage quest eligibility on both factions. The four exact-link
reviews remain tied to their original quest IDs; name corroboration cannot be
silently upgraded to exact-link evidence. Simultaneous rewards remain compatible.

The build authenticates the original source preparation, reward reference,
native and Chromium component receipts. The four patched engine sources are
byte-identical to those tested in the isolated runtime. Parent binary/JSON
semantic equivalence and new binary round-trip checks pass. A compiled Go test
compares the complete database and every combat item field/stat with the declared
catalog. Separate Mage tests use the actual imported items at 1/2/4/6/8 pieces
and check their additive stats, threshold bonuses and armor dependency. The
component and inherited Warrior, Rogue and Hunter regressions also pass in the
compiled workspace.

The resulting native binary has SHA-256
`81ba52f83ca1f7004229ffb5ffdb10a67caa1ad0eb25ecb5cc6cc291ec30feba`;
WASM has SHA-256
`03013e08ed11e8394377757127a365677314b2b6248958f2e9c414be0fc944b8`.
The UI database JSON/binary, inspection and acquisition assets are rebuilt
together. Historical reviewed-preset and safety claims are excluded, and no
selected model pointer changes. The model records 482 source pins and 13 build
outputs. Compilation and regression tests establish model consistency; they do
not establish full-fight native/browser parity, updated DPS or server CC rules.

Five additional catalog/acquisition tests pass, including both-faction Mage
eligibility, foreign-class exclusion, immutable parent data, simultaneous
rewards and rejection of changed evidence. The seven new JavaScript files pass
explicit lint (including ignored artifact paths). Formatting passes for the
three catalog files; the four frozen model-builder artifact files were excluded
by the repository's formatting ignore rule and are not claimed as formatted.
Their hashes remain unchanged after the build.

## Three-style gear and request preparation

`mage-dungeon-upgrade-v1/gear-preparation-5ad80dadff8069ab.json` has semantic
SHA-256 `5ad80dadff8069ab5bf9a80b414c78030740e69d46a7c59c65003e0a516a487a`
and 532 source pins. It authenticates the three published build files against
their delivery and cumulative-profile fixtures, then applies the existing
full-v2 buff policy. Their actual caster distances stay at ten yards for Frost
and twenty for Fire/Arcane. Their Engineering/Tailoring professions and
nonprovisional enchant policy stay unchanged.

The following counts describe the original **v1 preparation**. The numerical
producer now uses v2's exact-subset rebasing and reconstructs its banks from the
qualified actual captures before reporting its current counts.

| Style  | Candidates | Groups | Base subsets | Mandatory maximum-set comparisons |
| ------ | ---------: | -----: | -----------: | --------------------------------: |
| Frost  |     10,661 |     25 |          247 |                                 8 |
| Fire   |     10,566 |     25 |          247 |                                 8 |
| Arcane |     10,782 |     25 |          247 |                                 8 |

The new bank supports all three styles directly. It covers single slots,
one-hand/held-offhand and two-hand/empty-offhand layouts, ordered jewelry pairs,
complete set assignments and compatible enchants. Each eligible set's
deterministic maximum-piece assignment stays mandatory through decision
precision, including all eight Sorcerer pieces. These are legal candidates,
not DPS measurements or evidence of a global optimum. Four integration tests
check every generated candidate's legality, unchanged unrelated slots, all 247
base subsets, both weapon layouts, the mandatory set maxima, and refusal of
unknown variants, wrong classes, changed databases and truncated banks.

The versioned request adapter supports the current **Greater Mageblood Elixir**
policy instead of inheriting the old Frost helper's explicit exclusion. The
saved delivery documents contain captured templates plus native gear/talent/APL
overrides. The adapter materializes those declared overrides and the current
database, and checks that restoring just those fields reproduces the complete
source template. Class, armor options, mana policy, encounter and all other
context must still agree. Classic captures cannot be relabeled Forever.

Four request tests pass for the actual Frost/Fire/Arcane sources and a full
eight-piece loadout in each. They verify preserved class/options/consumes,
current browser item data and exact effective native-request equivalence.
These are explicit derived requests, not new UI captures or executed
native/WASM combat parity. Wrong classes/options/models, illegal hand layouts
and invalid rounds fail closed. All six new gear/request JavaScript files pass
explicit lint and formatting checks, including the ignored artifact paths.
No native combat jobs, fresh RNG claims, class clock writes or public changes
are created by this preparation.

The final combined candidate run repeats all thirteen catalog, bank and request
tests against the exact current bytes, then verifies all fourteen implementation
hashes unchanged. Its raw TAP and receipt are saved under
`mage-dungeon-upgrade-v1/candidate-validation/verify-Bn3ZL6/`.
The receipt byte SHA-256 is
`e775c01cd0f6b2a7eb32417ea5ed99e09c90272eb7d4359a82eb7f0ba7210a03`.
An independent source audit reproduces the model descriptor and verifies
**17,533** frozen inputs, including the waiting Rogue inputs, in
`candidate-source-audit-2d369525337bc09e.json`.

## Full-fight control preparation and first execution

`mage-dungeon-upgrade-v1/control-preparation-8c72b44d0079c8ce.json`, semantic
SHA-256 `8c72b44d0079c8ce21e25fd7437dd73b275721e22ecf50ae9da222d7a39dee39`,
binds 552 source pins and thirty controls. Each style has its original published
setup, its full-v2 setup, and eight gear cases with exactly one through eight
base Sorcerer pieces. Threshold cases change only equipment, retaining each
style's talents, APL, mana policy, armor option, distance and encounter. Three
additional tests check all thirty declarations, preserved context and source
change refusal. The three control/preparation JavaScript files pass explicit
lint and formatting checks.

Every declared case also passes zero-job request materialization and current
database canary preparation. Those derived inputs are labeled as derived, with
`actualUiCapture:false` and `combatExecuted:false`. The declared encounter is
the published stationary level-63 boss; it does not qualify incoming hits,
live crowd-control behavior or debuff overflow. An ordinary supervised
control owner must still capture actual UI requests and run detailed native/
WASM combat comparisons before admitting numerical gear search. The Mage
class update clock was unstarted at preparation; the actual execution and its
unchanged deadline are recorded below.

The supervised producer and completed-control reader are now implemented.
`run-mage-full-raid-controls-v1.mjs --plan` validates all thirty cases and
**8,592** frozen inputs without starting combat or a clock. The actual capture
command refuses direct execution; only the original approved full-raid
supervisor may launch it. It stores raw UI captures before validation, checks
the saved UI and wire ruleset, class, options, consumes, database, seed and
iterations, then compares complete native/browser unit metrics. The result
review checks exact Sorcerer threshold names, trigger registration, actual APL
spell damage, absence of alternate mana effects and six freshly executed
unchanged-parent comparisons. The target-aura union must remain at most sixteen;
arbitrary overflow enforcement is still unqualified.

Ten producer/validation contract tests pass, including rejection of changed
class/options/RNG, stale source hashes, altered UI settings, incorrect batch
counts, hidden resource differences and seventeen active target auras. Their
raw TAP and frozen-source receipt are
`control-execution-validation/verify-BBPRyp/report.json`, semantic SHA-256
`12396785f7cfbf6d55c76c574ee496528df3730e17d885f938ca36c935242d5b`.

The separate read-only completion checker requires the exact successful owner,
source command, release and original deadline before reading prepared evidence.
It replays all thirty captures, detailed result comparisons, effect checks and
six saved parent comparisons, and binds their bytes for downstream consumers.
Its seven boundary tests pass in
`control-reader-validation/verify-GBViQK/report.json`, semantic SHA-256
`03d25a7b2037744b1941f8b982791123db9c85b732efdff160b151968089f754`.
The original negative admission check refused qualification before actual owner
completion. This negative check is not a successful completed-source replay.

The original background queue was **PID 69148**, recorded in
`mage-full-raid-v1/control-queue-f5d150a4e833bf24.json` with **8,603** frozen
inputs. It waited for the existing Rogue confirmation queue (PID 78961), binding
the exact resulting Rogue confirmation owner, requires its terminal success,
checks live wait handles and a free workspace, revalidates source bytes, then
starts the ordinary Mage supervisor. It holds no browser lease or Mage clock
while waiting and performs no automatic source correction or retry. Two queue
contract tests, queue preflight, explicit lint and formatting passed. The Mage
approved-update ledger was absent while the queue waited.
Queue and later owner output go to
`mage-full-raid-v1/control-owner-after-rogue-confirmation-v1.log`.

After the Rogue runtime I/O stall was recorded, that queue was cancelled cleanly.
The unchanged queue command was explicitly restarted as **PID 60212**, receipt
`mage-full-raid-v1/control-queue-d0d30dc1134f8df4.json`, with the same **8,603**
pins. It bound recovery run `fe7e94d7-e9fe-41f9-b715-02cf50fac614` and dispatched
after its successful terminal result. Its output is
`mage-full-raid-v1/control-owner-after-rogue-recovery-20261024.log`.

## Actual Evocation metric correction

The original control owner `02131675-d3eb-4398-83ab-856d1a1c35fe` captured all
thirty real UI setups and completed thirty native/WASM pairs, with zero DPS
difference in every pair. It then failed full-unit validation before executing
the parent controls: `Duplicate metric identity: auras`.

The preserved raw records contain two identical Evocation aura rows, both with
spell ID 12051, in each affected backend. The compiled engine registers
`Evocation Regen` and the `Evocation` channel under distinct aura labels with
the same ActionID. Aura registration requires unique labels, while metrics emit
each registered nonempty ActionID. The old validator's unique-ID assumption
was incorrect; the game model and the two backend results did not diverge.

`complete-unit-metric-parity-v1.mjs` compares every protobuf-normalized field
and preserves the multiplicity of action, aura and resource rows. Duplicate
groups require a complete one-to-one match using the original numeric tolerance;
no row is discarded, aggregated or retagged. Resource types and nested pets
remain checked, unknown fields fail, and nonfinite metrics are rejected.

The separate v2 control chain authenticates the original capture context and
all thirty raw native/browser records, including the browser's original result
and stat protobuf bytes. It binds the exact failed run and original deadline,
and requires the actual successful corrective supervisor plus six unchanged-parent
controls. The original failed run, frozen validators, captures, RNG and model
are unchanged. This uses Mage's existing single corrective-command allowance;
the class window is not restarted.

Ten contracts pass in `mage-dungeon-upgrade-v1/control-correction-contracts-v2.log`,
including the actual thirty pairs, changed/missing/extra duplicate rows,
tolerance-sensitive matching, altered captures, changed result bytes, incomplete
owners and deadline resets. All thirteen new files pass explicit lint and
formatting. The read-only preflight passes with 8,726 pins and no new jobs.
The actual corrective owner completed successfully; its output is
`mage-dungeon-upgrade-v1/control-correction-owner-v1.log`. The prepared evidence
is `mage-full-raid-v2/prepared.json`, semantic SHA-256
`4b1d904f3b8ad782213677afda5a87da297e1ef7159821ac1f9948a9c9fce558`,
byte SHA-256 `d39fa50e602de850bd5faf8052fb045df66f46caa350771465a3bbc1744799b6`.
Its independent completed-source admission passed inside the revised actual
gear preflight, including the exact successful corrective command and every
original raw capture, complete unit result, protobuf response and parent control.
The successful correction run is `56aa4d6c-48ce-47f1-8d43-af1cbcd1d072`;
its command SHA-256 is
`5608d9c3c394908541b87408cd6364437770c2bdc443976f60091fd14a73dd1f`.

Current commands are:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-controls-v2.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/supervise-mage-full-raid-controls-v2.mjs --review-captured
node artifacts/forever-simulator/optimization/review-tools/review-mage-full-raid-controls-v2.mjs --verify
```

The last command is read-only and requires terminal success. Do not restart a
running owner or rerun the failed v1 validator. Gear/feedback/confirmation input
chains must consume this corrected evidence and complete-row comparison before
their first numerical dispatch. No final Mage DPS, UI preset, live root behavior
or seventeenth-debuff behavior is qualified by this correction.

## All-style gear producer and completed-source replay

The gear pipeline is now implemented for Frost, Fire and Arcane. Its context
requires the real completed-control reader and consumes that reader's actual
captures, successful owner reference and `verifyPins`. An uncompleted control
owner cannot reach gear preflight. Direct unsupervised search is also rejected
before numerical work. The old 19–20 October Mage ledger is retained; this
pipeline belongs to the separately approved full-raid update and cannot reset
its original clock or hard deadline.

The current execution chain is the separate **v2 gear context, declaration,
producer and completed-source reader**. It consumes the successful control
correction and preserves the original capture context explicitly. Its native/
WASM control verifier uses complete metric multiplicities and the original raw
result/stat bytes. The previous fixed-APL selector, candidate policies, canary
selection, six-pass limit and numerical budgets are reused unchanged. Frozen
v1 entrypoints remain historical and do not admit the failed first control run.

The actual v2 `--plan` completed successfully with **497** typed controls in
eight batches (seven of 64 and one of 49). Frost and Fire each retain **10,772**
candidates; Arcane retains **10,773**. Each style retains seventeen slots,
all 247 exact Sorcerer subsets and eight mandatory maximum-set comparisons.
This is completed-control admission and request preparation, not executed gear
combat. The log is `mage-dungeon-upgrade-v1/gear-correction-preflight-v2.log`;
its declaration identity is
`a0d417919d7658f81fabdc91536e88a6456d650c935fcdc07f5abded59a8d2e3`.

All three new gear compatibility contracts pass in
`gear-correction-contracts-v3.log`. The preceding run's one failure is preserved:
the test job omitted the raw record's explicit `null` provenance. Correcting that
fixture resolved the test without changing production validation. Combined
control/gear validation records **13** passing tests, explicit lint/format checks
of **23** files, ten bundled entrypoints and **13,538** verified hashes. It
preserves all 8,865 preceding campaign pins. The receipt is
`complete-row-compatibility-validation-95739c5b83c4c021.json`, semantic SHA-256
`95739c5b83c4c021dae7cdf4d7641e70fca93162a45f86a9b68aacb3b0d84ead`,
byte SHA-256 `015822d26daea5b0d0db2e800a3549fe0a3bc64b6f0e2359a892de02bf684508`.
All twenty-three new sources are frozen. The numerical gear owner has not
started; Hunter feedback retains the shared execution priority. Compatible
feedback and confirmation consumers are now implemented as recorded below.

## Compatible feedback and confirmation after control correction

The current **feedback v3** chain uses gear completion v2 and the corrected
control owner. Its ordinary phase remains `state-recheck`. It preserves the
existing v2 numerical state/coverage search, consume and gear strategies,
declaration policy, budgets and stable-closure checks. Both execution and
completed-source replay use complete metric multiplicities and original browser
result/stat bytes. New reports use `mage-full-raid-v2/`; a v1 parity namespace,
foreign command or different completed-gear argument is rejected.

The current **confirmation v2** chain independently replays that feedback v3
source before preparing arms. Its ordinary phase remains `confirmation-delivery`.
The range reader accepts the corrected v2 control header and retains the original
collector for every old inspection, current control and full 100,000-iteration
reservation exclusion. Arm construction, fixed-seed alignment, immutable claims,
two 20,000-fight holdouts and separate approved 2% / original 1% assessments are
unchanged. The original generic alignment, declaration and evaluation modules
are reused; their numerical sources were not edited. Both completed-owner
readers reject a successful exit at or after the original deadline.

Thirty new versioned sources and tests pass explicit lint/format checks and all
thirty entry graphs compile. **Nineteen** feedback contracts and **twenty**
confirmation contracts pass. They include real duplicate-Evocation raw records,
the actual prior Mage RNG plans, complete three-style protocol projections,
changed/partial source rejection, filesystem containment, deadline boundaries
and a production-graph check excluding the failed old completion readers and
unique-ID comparator. Synthetic projections remain test-only and cannot pass
the real numerical admission gates.

Actual CLI checks correctly refuse missing completed gear and missing feedback
before numerical work. Those expected failures are saved separately; they are
not positive completed-source evidence. Validation is
`mage-dungeon-upgrade-v1/compatible-feedback-confirmation-validation-bd2de3bc5a5e2761.json`,
semantic SHA-256
`bd2de3bc5a5e27610d67d5905ecd47962e9c49f754779a06fed0dea98d4bd8bf`,
byte SHA-256 `94d25fc7ab4743d34570dda068dd3b593ca6fdf911f632ddff6d0703b00e799c`.
It preserves all 13,538 prior pins and verifies **13,573** hashes. All thirty
new sources are frozen. No Mage gear/feedback/fresh owner, new class clock,
replacement fight or RNG reservation was started by this preparation.

After the actual gear-v2 owner finishes, set `MAGE_GEAR_COMPLETION` to its exact
printed canonical `completed.json` path. After feedback finishes, set
`MAGE_FEEDBACK_REPORT` to its exact printed all-style report. Current commands are:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-feedback-v3.mjs --plan --gear-completion "$MAGE_GEAR_COMPLETION"
node artifacts/forever-simulator/optimization/review-tools/supervise-mage-full-raid-feedback-v3.mjs --search --gear-completion "$MAGE_GEAR_COMPLETION"
node artifacts/forever-simulator/optimization/review-tools/review-mage-full-raid-feedback-source-v3.mjs --verify "$MAGE_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-confirmation-v2.mjs --plan --feedback-report "$MAGE_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-confirmation-v2.mjs --plan --feedback-report "$MAGE_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/supervise-mage-full-raid-confirmation-v2.mjs --search --feedback-report "$MAGE_FEEDBACK_REPORT"
```

Run each completed-source reader only after its corresponding supervisor succeeds.
The gear owner still waits for Hunter feedback execution priority. Positive Mage
feedback/fresh evidence, matching UI defaults/presets/library/guidance and actual
desktop/mobile review remain outstanding. No server mechanic or overflow rule
is inferred from this source compatibility work.

A repeated-pass regression exposed a real v1 coverage gap: with all eight base
Sorcerer items equipped, four exact seven-piece alternatives disappeared from
the expanded-set group. The new `mage-full-raid-gear-bank-v2.mjs` preserves the
existing slot/pair/enchant domains and explicitly removes unselected incumbent
pieces of the set being compared. It uses the original frame's non-set item,
or a deterministic eligible non-set fallback when necessary, while retaining
other current equipment. The regression verifies all **247** Sorcerer subsets
after rebasing around the full set and changed jewelry. This remains bounded
coordinate search, not exhaustive cross-slot optimization.

Every style uses its own actual captured request, exact compiled backend and
complete database. Controls cover each one-hand/offhand or two-hand staff
geometry, wands, every mandatory maximum-set assignment, every applicable
incumbent enchant candidate and every new Sorcerer item. The batching helper
preserves up to 1,024 controls in groups of at most 64; it never truncates the
control list. These controls must execute and pass before scalar search starts.

The browser verifier checks saved result and stat protobuf bytes, the result
SHA-256, complete unit metrics, reconstructed APL admission and exact Sorcerer
threshold registrations. This catches altered resources or set evidence even
when headline DPS agrees. Legitimate T0 Magister mana procs remain allowed in
other set candidates; the narrow alternate-only prohibition from the original
Sorcerer controls is not incorrectly applied to those sets. The conservative
sixteen-target-aura bound still applies; arbitrary debuff overflow remains
unqualified.

Search uses the existing callback-only monotone policy: six maximum passes,
80/500/2,000-fight screening/refinement/selection, and fixed 10,000-fight decisions
at seed 77191. All accepted changes use the same decision precision and guard;
mandatory set candidates reach decision precision too. Six workers share a
400,000-origin limit and the original class deadline. Accepted gear changes
rebuild complete banks without changing item eligibility. Talent/APL/consume
feedback and fixed fresh confirmation remain required afterward.

The completion reader requires the exact terminal gear owner before expensive
source loading, authenticates complete control batches and their raw browser
bytes, and independently reconstructs every sealed stage from admitted raw
origins. Unstable selections, incomplete styles, low-precision scores, changed
commands or late completions cannot seed feedback. An actual positive completed
gear replay is still pending; preparation is not a numerical result.

All **14** domain, wire, declaration and owner tests pass. The saved combined
run verifies **8,632** unchanged source pins and bundles both producer and reader
graphs. Its raw TAP and receipt are in
`mage-dungeon-upgrade-v1/gear-execution-validation/verify-7eE12B/`, semantic
SHA-256 `bbd396b69ba0d80968e092302cc300fc3d022c2cb701047cc10dbe9ccea75765`.
The eighteen new files pass explicit lint and formatting. This freezes the v2
bank and gear producer/reader graph; corrections require a new version.
No new Mage combat, score reuse, class-clock writes or public promotion occurred
in this validation.

## Geared state and consume feedback preparation

The callback feedback pipeline now composes consumes, a complete gear recheck,
and a geared talent/APL/mana-policy recheck for Frost, Fire and Arcane. It closes
only when all three selectors stop on the same effective request. Changed
coordinates require another complete pass; a cycle or the four-pass cap remains
open. Exact numerical ties retain the actual incumbent. This is bounded selection,
not independent confirmation or a public preset.

Historical published builds and confirmation declarations supply authenticated
state proposals only. Their DPS and standard deviations are excluded. The original
talent anchor banks remain bounded; retained states are added explicitly and
remeasured on current gear and consumes, rather than recursively expanding every
retained build into another talent bank. Initial candidate counts are **1,496
Frost**, **2,074 Fire** and **4,494 Arcane**. Each style retains ten distinct
effective states from its twelve original declared arms.

The older pure generators require Greater Mageblood in their compatibility
context. That context generates talents and APLs only. The new typed request
factory preserves the actual selected elixir and changes only declared talents,
APL and rune-priority/automatic-gem choice. Tests cover all three styles with
no elixir, ordinary Mageblood and Greater Mageblood, under both mana policies.
No compatibility-context elixir is substituted into a simulation request.

Five consume coordinates produce **81** typed derived controls. State coverage
produces **128** controls covering **598** observed rank/policy/mana features,
including every incumbent. Equivalent effective APLs merge while their declared
policy aliases remain in coverage evidence. These are prepared request contracts;
they have not executed native or browser fights and are not new UI captures.

`loadMageRaidFeedbackInput` first requires the actual successful gear owner and
the complete independent gear replay, then binds its own source verification to
that completed reader's `verifyPins`. Prepared receipts cannot bypass the owner
gate. The ordinary feedback owner and completed feedback reader are now
implemented as described below. Actual executed category/selected parity and a
positive completed-source replay remain pending.

All **15** focused tests pass; explicit lint and formatting check all **19** new
files, and the production/input/test graphs bundle. The frozen receipt is
`mage-dungeon-upgrade-v1/feedback-input-validation/verify-AM8ey9/report.json`,
semantic SHA-256
`0c6dec337bbb7cff9e40821e62c73fdced75d5a185cff3355fa789481a789553`, byte SHA-256
`90b8dd9dabdf5fa6495d369cfb4ac692fb86904c5ea3abc51625a506f8237d84`.
It pins **640** preparation sources, creates no numerical jobs, and does not
start the Mage clock or qualify a positive completed-gear input. The later actual
input loader must add the completed control/gear evidence and its full source pins.
Corrections to this frozen callback/input graph require a new version.

Reproduce the focused contracts with:

```sh
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-feedback-state-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-feedback-consumes-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-feedback-closure-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-geared-feedback-seeds-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-state-canaries-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-feedback-input-v1.test.mjs
```

## Supervised feedback and completed-source reader

The current feedback v3 command reuses **v2's numerical search**. The v1 preparation and its passing
boundary tests remain preserved, but the broader all-style confirmation test
exposed an incorrect coverage budget after retained states grew. Do not dispatch
the earlier v1 command. No actual Mage feedback owner had started when this was
found; no numerical source or class deadline was changed.

The v2 state bank removes repeated talent expansion from coverage metadata and
separately bounds the remaining aliases. Its numerical candidate limits stay
**3,000 Frost / 4,000 Fire / 8,000 Arcane**; retained-state and canary limits stay
**64 / 512**. The coverage bound is derived from those limits and the finite
policy/mana tables. It does not add numerical candidates, discard finalists or
increase simulation budgets. Regression tests reproduce the v1 failure, preserve
every retained request ID, and cover 64 distinct retained talent proposals.

The versioned correction was then checked with the full Frost/Fire/Arcane typed
feedback and finalist-reconstruction path. All **46** combined contracts pass.
Explicit lint/format checks cover **32** new files: nineteen coverage-v2
implementation/test files and thirteen confirmation-preparation files. Both
feedback execution/reader and confirmation-preparation/test graphs bundle.
The receipt is
`mage-dungeon-upgrade-v1/confirmation-source-validation/verify-wMR8bG/report.json`,
semantic SHA-256
`3d69a3db9574a09d54c83f8c1407a5e41be8008f8b995bb574f62b07d897d300`, byte SHA-256
`781ff0e7faf5c1cc6a6337661a57554e8ca5098ba54352b1858f61eeadf1c77f`.
It verifies **697** source hashes, including all **660** unchanged frozen v1
inputs. The new files are now frozen too. Earlier v1 failing reconstruction and
the separate passing counterexample regressions remain preserved. No actual
Mage feedback owner, numerical search, class-clock mutation or public score was
created by this correction.

One ordinary all-style owner binds the exact canonical completed Mage gear path
through `--gear-completion`. It requires the real completed-control and gear
readers before source planning. Search requires the approved live supervisor;
preparation cannot create a class clock. The execution context freezes both
producer and independent reader graphs, including their focused test dependencies.

Every style declares separate consume, gear and state control batches. Each
batch must pass complete native/WASM unit parity, resources, original protobuf
bytes, APL admission and exact Sorcerer registrations before scalar search. The
shared Mage control-batch schema/verifier is reused; class identity remains Mage
throughout. A present malformed/null cache is rejected, rather than executing a
replacement batch. A selected final state gets its own control after feedback.

The final-result validator checks pass order, all selector stability flags,
effective-request continuity, cycle/cap semantics, unchanged scenario fields and
preservation of original retained states. State stability uses `stateChanged`;
a missing field cannot be replaced by a numerical-gain flag. Open branches remain
open and make the ordinary owner fail instead of qualifying confirmation.

The completed-source reader requires the latest exact successful all-style
owner and original deadline. It authenticates every branch/declaration and
category/selected control, then independently reconstructs all sealed stages and
admitted origins using the actual callback selector. Parent gear evidence loads
once for all three styles. Changed commands, foreign parent paths, incomplete
styles, missing resources, altered wire bytes and changed source pins are rejected.
This completed feedback would seed fresh confirmation; it cannot publish a score.

The **25** additional execution/source contracts pass, and the final combined run
passes all **40** original plus new contracts. Explicit lint and formatting check
all **37** files; the producer, reader and test dependency graphs bundle. The new
execution/reader layer consists of **18** files. Its receipt is
`mage-dungeon-upgrade-v1/feedback-execution-validation/verify-U8CWd7/report.json`,
semantic SHA-256
`32b1e0e41bcb14bd248dfc07be6f5798d0c76295c2cdf8acc5889da4779fafdd`, byte SHA-256
`e98c750f7bdbb60f4d150aa33df202da7ab85b1393dfc7b889794a61ba30d24e`.
All **660** preparation hashes remain unchanged, including the earlier frozen
callback/input layer. This freezes the new execution/reader files; corrections
require a new version. No actual completed Mage gear source, numerical feedback
run or positive completed-feedback replay has yet been admitted. Actual execution
must add the full completed control/gear source proof; this preparation receipt
does not replace it.

After real control and gear-v2 completion, use the exact variables described in
the current compatibility workflow above:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-feedback-v3.mjs --plan --gear-completion "$MAGE_GEAR_COMPLETION"
node artifacts/forever-simulator/optimization/review-tools/supervise-mage-full-raid-feedback-v3.mjs --search --gear-completion "$MAGE_GEAR_COMPLETION"
node artifacts/forever-simulator/optimization/review-tools/review-mage-full-raid-feedback-source-v3.mjs --verify "$MAGE_FEEDBACK_REPORT"
```

Use the exact produced identities; implicit latest selection is intentionally
rejected. The actual missing-source preflight
currently fails at the completed Mage gear-owner gate, as required.

## Current-model confirmation preparation

The new confirmation preparation uses the **v2 completed feedback reader**, not
an older Mage model loader. It reconstructs the exact frame before each final
consume, gear and state selector, verifies the selected-control provenance, and
keeps every retained final-pass contender. Mandatory full Sorcerer comparisons
and enchant alternatives remain included. Numerically equivalent requests share
an arm while retaining all original source locations and metrics.

Scores measured at a different inspected seed remain explicitly pending. They
must be genuinely measured at **10,000 fights, seed 77191**, with their own native
request IDs, before holdout plans can be frozen. Alignment preserves the original
source score and selected build; it does not pick a new winner. The fixed-width
batches then keep the same selected incumbent against every retained contender,
using two fresh **20,000-fight** samples and full **100,000-wide** RNG reservations.
Approved **2%** and original **1%** assessments remain separate.

Historical exclusions now include the actual published Frost, Fire and Arcane
plans' inspected ranges and entire reserved ranges, plus current controls, gear
and independently replayed feedback stages. Only range metadata is projected;
old DPS does not enter selection. Missing styles, altered classes, narrowed
reservation widths and unverified branches cannot qualify a range source.

The all-style typed-domain tests actually exercise the current consume/gear/state
callback selectors with synthetic tie metrics, then reconstruct their frames and
finalists. They pass for Frost, Fire and Arcane, preserve the full-set contender,
and verify immutable holdout materialization and disjoint batches. These are
unit contracts with real typed inputs, not native fights or completed numerical
sources. Actual source preparation still requires real completed control, gear
and v2 feedback owners. The confirmation execution and independent reader are
implemented below; actual numerical admission remains pending.

Inspect a real completed feedback source with:

```sh
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-confirmation-v2.mjs --plan --feedback-report "$MAGE_FEEDBACK_REPORT"
```

The report hash must be the exact produced value; this command never reserves
RNG ranges, starts a class clock or dispatches combat.

## Supervised confirmation and independent completed-source review

The ordinary confirmation command freezes the producer, supervisor, independent
reader and six test-entry graphs over the current v2 feedback chain. It authenticates
all three selected controls by complete effective request equivalence to the
parent's raw-unit replay. Missing inspected scores require genuine 10,000-fight
alignment at seed 77191 and independent saved-stage replay before any fresh plan
is frozen. Alignment preserves the incumbent and every contender's source identity.

Every fixed batch needs its original immutable RNG claim before fresh fights.
Resuming a started study with missing claims fails; it cannot regenerate claims
or reroll holdouts. The registry checks all historical ranges. A new claim also
requires the ordinary live owner, an available workspace and at least 5 GiB free.
Two fixed 20,000-fight samples assess the unchanged incumbent at approved 2% and,
separately, original 1%. Failed confirmation remains a saved failed result.

The independent completed-source reader requires the latest exact successful
supervisor command under the original class deadline. It reconstructs completed
parents, alignment, declarations, original claims, every saved fresh request and
the whole final report. Changed paths, metrics, controls, claims, source bytes or
self-claimed review/publication flags fail. This is a read-only replay; it cannot
create claims or replacement fights. It reuses immutable class-neutral request
equivalence and registry helpers, whose historical diagnostic text says Hunter.
No Hunter settings or measured results enter Mage qualification.

All **31** contracts pass. Explicit lint and formatting cover **23** new files;
the producer, supervisor, reader and tests bundle. Validation receipt
`mage-dungeon-upgrade-v1/confirmation-execution-validation/verify-Yrly9g/report.json`
has semantic SHA-256
`98f8cfb24b5d32f20cda48f5296c29b2692d19a58f8789a7150d82c0960ce9af`
and byte SHA-256
`229a2b45d7d680071c108b19f4e6869405e556b3dd12c760aeba8b78fdf96d9e`.
It freezes **724** source pins and confirms all **697** preparation pins remain
unchanged. All new execution/reader sources are frozen; corrections require a
new version. These contracts use synthetic metrics and real typed selected
controls; no actual Mage numerical job or positive completed source is admitted.

After real control, gear-v2 and feedback-v3 owners finish and replay, use their exact
feedback report path for preflight and the ordinary supervised command:

```sh
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-confirmation-v2.mjs --plan --feedback-report "$MAGE_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/supervise-mage-full-raid-confirmation-v2.mjs --search --feedback-report "$MAGE_FEEDBACK_REPORT"
node artifacts/forever-simulator/optimization/review-tools/review-mage-full-raid-confirmation-source-v2.mjs --verify "$MAGE_CONFIRMATION_REPORT"
```

Set `MAGE_CONFIRMATION_REPORT` to the exact report printed after the actual
confirmation owner succeeds. The supervised command refuses
plan shortcuts. Independent owner review still leaves publication false until
matching presets, library, guidance and actual desktop/mobile UI checks pass.
Forever debuff overflow remains separately pending; no rejection or eviction
rule is inferred by confirmation.

## October 24 gear-control stop and stable-statistics correction

The actual v2 gear owner `bb97eadd-946b-4ce2-a259-03f10557f995` stopped with exit
code one after all **497** native/browser controls had equal DPS. The subsequent
complete metric check correctly rejected an undefined aura standard deviation.
No scalar gear study started. The original failed owner and all captured bytes
remain unchanged in `gear-owner-after-hunter-feedback-20261024.log` and
`mage-full-raid-v2/gear-canaries-a0d417919d7658f8.json`.

Record **263**, `mage-fire-static-gear-enchant-6-8`, has the same failure on both
backends for personal Improved Scorch, spell **12873**. Its 25 uptime samples
produce mean `297.02970297200017` and sum of squares `2205666.111190863`.
The inherited subtraction `sumSq / n - mean²` evaluates to
`-1.3096723705530167e-10`; its square root becomes `NaN`. The game-data and damage
calculations are not the source of that failure.

A comparison projection prototype authenticated and replayed all **497** retained
records, including original result/stat protobuf bytes. Its fifteen contracts
also reject corrupt raw bytes, different moments, infinities and unexplained
nonfinites. That investigation is **diagnostic only**. It does not repair the
engine's statistic, qualify undefined metrics for publication or admit a new
owner. Its immutable report is
`mage-dungeon-upgrade-v1/variance-compatibility-review-ac27f16ad0446399.json`,
semantic SHA-256 `ac27f16ad0446399d91ac664c9e32cb98cfd13d0ff2326970a4db595e3acfda5`.
The prototype files are retained as evidence and must not replace the strict
finite-metric gate in the numerical pipeline.

The selected correction is the engine calculation itself:

- `infra/simulator/stable-metric-moments.go` accumulates central moments and
  combines population summaries without subtracting nearly equal squares.
- `infra/simulator/stable-metric-aggregator.mjs` applies exact, checked source
  transformations to the isolated accumulator and both distribution/aura worker
  mergers. Finished merges release their temporary state.
- Constant Scorch uptime, known population variance, scaling, unequal worker
  means/sizes, large offsets, empty samples and invalid summaries are covered.
  Seven cases pass in native Go and the same seven pass in actual Chromium/WASM,
  with no page errors. Two source-patch contracts also pass. Empty or invalid
  statistics are not silently turned into measured zeros.

Current component validation is
`mage-dungeon-upgrade-v1/stable-aggregation-validation-a20f7d1934bff8b8.json`,
semantic SHA-256 `a20f7d1934bff8b8f0e329b116d85aaa22787de8cb5d0526bf3d026db9758d13`.
It freezes seven new sources and **41,607** source/evidence pins, preserving all
**41,121** earlier pins. Five actual ESLint/Prettier checks, two clean `gofmt`
files and five bundled entry graphs pass. The strict finite-value validator,
original model, raw historical outputs and selected application releases stay
unchanged. These are statistical component tests, not new Mage combat evidence.

```sh
node --test infra/simulator/stable-metric-aggregator.test.mjs
node artifacts/forever-simulator/optimization/review-tools/verify-stable-metric-aggregation-v1.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/verify-stable-metric-aggregation-wasm-v1.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/validate-stable-metric-aggregation-v1.mjs
```

The complete derived native/WASM model is now built and independently checked.
Release **`b471ac0808fb745c26205a72`** preserves all **2,695 items**, all **22
pages**, both database encodings and the original codecs. Only the accumulator,
worker-result merger and new stable-moments implementation change production
source. All **99 Go regression outcomes** and **four asset contracts** pass,
including inherited class/set controls and the complete embedded database.
A recovered upstream `FakeAgent` fixture is test-only; it adds no production
factory registration. Repeating preparation returns the same completed model
without compiling another copy.

The new context is `mage-statistics-model-v1/context.json`, semantic SHA-256
`76bbba11191350ea1c3526e5aba5d1d1b468f3c95174e5fbb6acada90580eaa1`.
Its independent validation is
`mage-dungeon-upgrade-v1/statistics-model-validation-39a8799778bcd0db.json`,
semantic SHA-256 `39a8799778bcd0dbead15eb60ab68141dd27f5dcca07863c4162b6f3d417809b`.
It preserves the earlier 41,607 pins and verifies **45,613** total source/evidence
pins. The model is unselected and has **no new combat qualification**; regression
tests do not substitute for actual model-bound native/browser fights.

Owner/reader integration, actual model-bound controls and complete
gear/feedback/fresh qualification remain required. Mage's configured single
correction has already been used. An explicit request for one additional engine
correction is pending; no approval or new numerical admission is recorded. The
original **October 25, 17:53:53.844 UTC** deadline remains unchanged. A different
backend cannot inherit the old model's numerical qualification or raw fight
results. The strict finite-metric gate remains unchanged.

## Source and item preparation

The source capture is
`artifacts/forever-simulator/optimization/mage-dungeon-upgrade-v1/source-e7e91231ed084a85.report.json`,
byte SHA-256 `e7e91231ed084a85b6bd6b8eae636614ef963b2fbe707ce5af46115e483ca6ea`.
Its compressed fixture is `infra/simulator/fixtures/mage-sorcerer-source.v1.json.gz`,
byte SHA-256 `e1490d0552015c47055593c6f691829a5a864cb86f038a6772cc7ae6d9198d45`.
The collector verifies table hashes, record counts, unique row identities,
recursive trigger closure and unchanged input bytes. The original capture
contains zero independently reviewed reward pages; the later reference
supplement is separate evidence.

The prepared report is
`mage-dungeon-upgrade-v1/prepared-ebb86db319baa9cc.json`, under the optimization
directory, semantic SHA-256
`ebb86db319baa9ccb817d95d62fa099683d427eb6152b2f608dec0abda0e3825`.
It binds thirty input/source/test pins and contains all eight reviewed stat
drafts. Mage obtainability comes from the class-specific reward associations and
remains distinct from the raw wearable-class mask. Neither class inference nor
historical stat substitution is allowed to admit an item.

Eight regressions pass: exact membership, alternate thresholds, current rating
conversion, historical-icon-only usage, proc mask/chance/cooldown, effect
closure, quest/faction consistency, unresolved availability and input
preservation. Five-file ESLint and formatting checks pass. Saved test output is
`mage-dungeon-upgrade-v1/source-contract-tests-v1.log`.
Validation receipt `mage-dungeon-upgrade-v1/validation-e5f941b0dd9e616b.json`,
semantic SHA-256
`e5f941b0dd9e616bb022935d3a0cdb9383483663f11bf2fb08f8ca92318a85d7`, also confirms
all 16,487 combined prior and Mage source pins remain unchanged, including the
queued Rogue confirmation's frozen inputs.

## Exact current effects

Base items are **22062–22069**; alternate items are **226937–226944**.

| Pieces | Base spell    | Client definition                                                                                       |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------- |
| 2      | 18679         | +8 nonphysical resistances                                                                              |
| 4      | 27867 → 27868 | Incoming-hit freeze proc: 2% chance, 60-second internal cooldown, three-second root, combat-range child |
| 6      | 14047         | +23 magical spell damage and healing                                                                    |
| 8      | 14803         | +200 bonus armor                                                                                        |

The alternate grants +8 MP5 at three pieces and a 5%/200-mana spellcast proc at
four pieces, with freeze at five pieces. Those effects must remain separate from
the base set. The source checker preserves the raw incoming-hit mask **139944**,
child target and root mechanic. It does not establish boss root immunity,
server proc cadence or runtime implementation. The
[Forever belt page](https://www.wowhead.com/forever/item=22062/sorcerers-belt)
independently corroborates the base thresholds and amounts.

## Reward reference review

All eight Forever quest reward sections corroborate the saved class/faction
associations. Four are available as parsed indexed pages; four additional
sections are available through the primary page's indexed text. Several direct
opens return JavaScript verification or cache misses, which are not interpreted
as missing quests or missing rewards. Classic, Retail and other-flavor results
are excluded.

The separate saved review is
`mage-dungeon-upgrade-v1/reference-supplement-c5e2deeca9427127.json`, semantic
SHA-256 `c5e2deeca94271276762f15f8922aae46ee3a0daf95e3f34d8c175110ef32b04`.
It preserves all URLs, reward names, mapping evidence and unresolved flags.

| Milestone | Alliance                                                                    | Horde                                                                       | Reward names            |
| --------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| 1         | [8907](https://www.wowhead.com/forever/quest=8907/an-earnest-proposition)   | [8915](https://www.wowhead.com/forever/quest=8915/an-earnest-proposition)   | Bindings                |
| 2         | [8932](https://www.wowhead.com/forever/quest=8932/just-compensation)        | [8939](https://www.wowhead.com/forever/quest=8939/just-compensation)        | Belt, Gloves            |
| 3         | [8953](https://www.wowhead.com/forever/quest=8953/anthions-parting-words)   | [9018](https://www.wowhead.com/forever/quest=9018/anthions-parting-words)   | Boots, Leggings, Mantle |
| 4         | [9001](https://www.wowhead.com/forever/quest=9001/saving-the-best-for-last) | [9014](https://www.wowhead.com/forever/quest=9014/saving-the-best-for-last) | Crown, Robes            |

The reward links for 8907, 8915, 8932 and 8953 were followed and resolve to exact
base IDs. The other four sections corroborate reward names; their mapping to
base IDs still uses the authenticated same-TOC associations. Names alone do not
resolve identical alternate names. None of this proves quantities or observed
current-server delivery. Preserve those distinctions when preparing catalog
admission.

## Reproduce

Run from the repository root with the recorded source files present:

```sh
node artifacts/forever-simulator/optimization/review-tools/capture-mage-sorcerer-source-v1.mjs --capture
node --test infra/simulator/mage-sorcerer-source.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-sorcerer-drafts-v1.mjs --prepare
node --test infra/simulator/mage-sorcerer-dispatch.test.mjs
node artifacts/forever-simulator/optimization/review-tools/verify-mage-sorcerer-runtime-v1.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/verify-mage-sorcerer-wasm-v1.mjs --verify
node --test infra/simulator/mage-sorcerer-catalog.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-model-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-model-v1.mjs --prepare
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-bank-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-gear-v1.mjs --prepare
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-requests-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-controls-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-controls-v1.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-mage-full-raid-controls-v1.mjs --prepare
node artifacts/forever-simulator/optimization/review-tools/run-mage-full-raid-controls-v1.mjs --plan
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-captured-input-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-control-effects-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-control-results-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-control-completion-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-control-queue-source-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-domain-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-wire-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-source-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/mage-full-raid-gear-completion-v1.test.mjs
```

The queue and first control owner have terminated; do not restart them. The
current control correction commands are recorded above. Downstream gear
preparation consumes the corrected completed reader's `verifyPins`, raw bytes,
original captures and successful owner reference; preparatory receipts alone
cannot admit numerical search.

The current gear chain is v2. Use `run-mage-full-raid-gear-v2.mjs --plan` for
completed-control admission and all three exact domains, then
`supervise-mage-full-raid-gear-v2.mjs --search` when the Hunter feedback owner has
released the shared execution priority. After its actual terminal success, use
`review-mage-full-raid-gear-source-v2.mjs --verify` with the canonical
`bounded-native-studies/<identity>/completed.json` path. Feedback v3 and confirmation
v2 use the compatible input gates described above; frozen v1 control admission
remains historical and correctly refuses the failed original owner.

The preparation command expects the saved passing test log from this review.
It authenticates the immutable source capture and refuses changed source bytes.
It writes a content-addressed local draft report with admission, numerical and
publication flags false. The runtime and WASM commands require their recorded
source artifacts and write separate local attempts. They do not start a class
optimization clock. The model commands authenticate or compile an unselected
local model. Full-fight controls, bounded Mage optimization, fresh statistical
confirmation and matching public delivery remain next.
