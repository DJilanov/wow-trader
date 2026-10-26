# Paladin survival correction

## Current profession evidence — October 25, 15:12 UTC

The [profession transfer review](simulator-paladin-profession-coverage.md) now
covers all thirty supported crafting profiles. All 4,536 additional cases have
reviewed whole-domain/effect-compatible mappings, exact detailed native controls
and independently replayed origins. Eighteen actual Chromium controls pass. The
final evidence keeps 3,024 measured cases and 4,536 transferred cases distinct;
four-fight compatibility samples never replace original 2% confirmation counts.
Five-minute/spread assignments and full website delivery still remain.

## Earlier profession inventory — October 25, 14:39 UTC

The latest read-only audit checks all 30 profession profiles and all 17 legal
equipment slots. The current 3,024 confirmed cases cover 12 profiles; the other
18 require 4,536 profession-aware cases. Every missing case has legal existing
winning gear available as a proposal, so none currently requires a new gear
search. The 22 distinct equipment pools do not prove passive or whole-loadout
equivalence, and no numerical scores are transferred between profiles.

Receipt: `paladin-profile-recommendation-coverage-v1/audit-lR5SRi/report.json`
under the healer-model-admission artifact root; byte SHA-256
`62da294548e78f47c228e42aae3fee93f231691c914209990644da2c34001227`.
Its source pin, matrix hash, profile counts and unqualified publication state
were independently checked. Zero new numerical requests were executed.
Longer/spread assignments and complete preset/library/guidance/browser delivery
remain required alongside this profession coverage.

The completed scenario-specific confirmation and its first repair left189
survival failures across3,024 cases.2,835 pass the observed2% requirement and
strict survival. Those successes retain their original model,request and seed
origins; no unchanged case is relabeled as a new execution.

## Reproduced causes

A bounded20-request diagnostic replay reproduced two original256-fight batches,
located their first failing iteration,and reproduced each as a single shifted-
seed fight. This excludes inter-iteration state carry as the explanation for
these two failures. It does not diagnose every possible failure in the model.

| Assignment | Original batch seed | First failing iteration, zero based | Single-fight seed |
| --- | --- | --- | --- |
| Direct group healing |25620317|103|25620420|
| Vigil mobility tank healing |30103417|14|30103431|

The group build has inadequate late-fight healing reserve. Several patients die
while the2.475-second Holy Light is still casting; subsequent casts on those
dead targets spend mana without healing them. The tank build depletes mana before
its next useful resource activation. The potion's low roll and delayed rune
availability leave a lethal gap. Neither pressure nor the survival gate changed.

An isolated logging derivative preserves the complete original native results
for both fights,including full unit metrics. It changes one workload integration
point and adds a diagnostic logger. Its logs are diagnostic evidence,not scores
for the frozen production model. The original model remains unchanged.

The worker's normal automatic mana-consumable heuristic waits for the maximum
roll plus expected regeneration before use. A workload minimum below that value
does not override the automatic heuristic. Existing user-specified cooldown
schedules do override that optional heuristic while preserving spell ownership,
cooldown timers and cast legality. The correction uses this existing engine API.

## Fixed correction domain

All original retained whole plans remain candidates. Each group plan receives
six declared combinations:unchanged or earlier resources,crossed with unchanged
priorities,a larger Holy Light rescue,or Holy Shock plus larger Holy Light rescue.
Tank plans receive unchanged or earlier resources. No item/stat filtering or
second full catalog search is substituted for the original retained plan bank.

The large rescue uses the highest source-admitted nonraid Holy Light at60% missing
health. The optional highest owned Holy Shock uses75% missing health. The
historical raid-book Holy Light IX remains excluded. These priorities apply only
to the declared equal-health group assignment and retain the ordinary global
live-target triage. They are candidate policies,not published rotation advice.

Earlier resources lower the workload minima to1,000 missing mana for the Rune
and2,000 for Major Mana Potion. Existing explicit engine schedules are:

| Resource | Requested times in the180-second workload |
| --- | --- |
| Demonic Rune |15s,135s|
| Major Mana Potion |30s,150s|

Actual casts still obey the workload demand/threshold and engine cooldown rules;
the schedule is not a promise of a cast at an impossible time. The binding
rejects an existing saved timing plan rather than overwriting it. It round-trips
the actual protobuf codec and preserves the rest of the request. Longer workloads
require their own declared schedules.

Eight actual native/Chromium controls verify all six group/two tank candidates.
They intentionally include policies that still fail the diagnosed seed. None is
chosen or discarded from those diagnostic results. Four separate raw-protobuf
contracts cover unchanged packets,only-the-cooldown-field changes,saved-plan
protection and the180-second boundary.

## Training and confirmation

The current training covers exactly the189 failures,15 acquisition groups and
216 distinct whole options. Before exact request reuse,it has21,132 declared
requests and21,639,168 fights. Each candidate receives two fresh1,024-fight
batches,seeds32452843 and35037791. The model,pressure,eligibility and original
class deadline2026-10-25T23:58:06.787Z remain unchanged.

Selection first requires complete survival and external-demand delivery. Among
plans within1% of the best mean external-health-deficit objective,it prefers
the least worst-batch time blocked by mana,then the least worst-batch final
external deficit,then the least worst-batch mean deficit. This uses part of the
owner's2% practical allowance to retain reserve. It does not replace the later
independent2% requirement or establish a server-verified optimum.

Freeze the selected plan before independent confirmation. Retain every original
unchanged-plan anchor,the best eight new training plans,and the best five distinct
training gears. Four fresh512-fight batches use37358729,39916801,42562319 and
45113717. Report observed2%,separate observed1%,and per-comparison95% intervals
separately. The queue stops after that fixed matrix,including on failure. It
does not choose from validation,lower pressure,waive survival or retry endlessly.

## Immutable evidence and recovery

All following paths are under
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

- Prefix diagnosis:
  `paladin-survival-prefix-diagnosis-v1/300a09dff3045bd822611ed50ee3c9b64c86394f9e7af50a81f6cd4fa0ae1606/report.json`,
  SHA-256 `9568d88b2e22207a3cdbc555ace6da169933daf34f71308ec90c724e1a879661`.
- Logging parity:
  `paladin-survival-trace-v1/6d3fea97fc3748d2f43dabfbe9e8834e746be5bb7547afe6a655cb5686792b71/trace-BNzZx8/report.json`,
  SHA-256 `a829716d37ef44154ddf18e0c1c7f2790c8a6ba17be85167027f5300fb6467d5`.
- Actual policy/timing controls:
  `paladin-survival-policy-controls-v2/c813df5f69cf4e13d1bd252b06b581384058b4404a93122d97cd714e282819dd/controls-7jOCxw/report.json`,
  SHA-256 `3f665811900bc357bfee514372e98f15ad40a34f64d6bd720673abbbcdd17b63`.
- Active training:
  `paladin-survival-policy-training-v1/7c600cb8bf6e431336ee46ba9430094fe7eeef1cd1fdf9f4f915bf1798b60878/`.

Keep the live queue and frozen sources. The queue forwards SIGTERM to its actual
current child,which flushes the evidence journal. Verify the process command
before signaling any saved PID. An observation timeout is not evidence that the
run stopped. Resume only when the previous owner is terminal; the phase reuses
only exactly matching saved requests and preserves the original class clock.

The entry point is
`node artifacts/forever-simulator/optimization/review-tools/queue-paladin-survival-policies-v1.mjs`.
Do not start a duplicate while that queue is live. No new class qualification,
website preset,publication or deployment is approved by these preparations.
Longer/spread assignments,remaining profession-effect equivalence and actual
library/default/guidance/browser delivery still remain.

If the queue was interrupted after training completed but before confirmation
started,invoke the confirmation entry point directly. A cached completed training
phase returns without emitting the queue's completion event,so restarting that
queue is not the recovery path for this boundary:

```sh
node artifacts/forever-simulator/optimization/review-tools/confirm-paladin-survival-policies-v1.mjs artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-survival-policy-training-v1/7c600cb8bf6e431336ee46ba9430094fe7eeef1cd1fdf9f4f915bf1798b60878/report.json
```

Use this only after the existing owner is terminal and the completed training
receipt exists. It authenticates the frozen training choices and retains the
same class deadline. If confirmation itself was interrupted,the same command
resumes its exact journal rather than repeating completed numerical requests.

## Fixed independent confirmation completed — October 25

Training completed17,796actual requests and3,336exact reuses; every selected plan
survived its2,048training fights. The separate fixed confirmation has now completed
12,768actual requests/2,328exact reuses. It reports129/189passing cases under survival,
observed2%and the separate1%check. Sixty Vigil-mobility/group cases fail survival.
All60retain the same selected option2ab7e0de9e53149686a08294b616355bdd213576c78052510bd780d0e5b3502f:
one failed fight in the first512-fight batch,none in the other three. Their objective-only
comparisons satisfy2%; survival prevents qualification. No validation-time
reselection was performed. Training success is not substituted for this result.

The terminal receipt is`artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-survival-policy-confirmation-v1/4a190550e258600a9a7aff2fd95f2eeb3ab16e96062ce060bde8674139d3ba05/report.json`,byte SHA-256`a98731ff691b4d46caf40d96d934fe24fef751e22c34f8096de08e8b0f907260`.
Queue1562/child1446andworkers exited;session19795returns0with the completed pipeline
record. The old progress file still sayscomplete:falseand must not be treated as
a live owner. Keep the previous2,835case-origin audit distinct until an independent
merged-origin review authenticates the new results. Full Paladin remains unfinished.

The fixed matrix stops here. Causal diagnosis of the remaining plan failure,
longer/spread assignments,profession-effect equivalence and actual preset/library/
guidance/browser delivery remain. No further optimization retry,selection from
validation,pressure reduction,survival waiver or deadline extension was dispatched.
Original deadline2026-10-25T23:58:06.787Zunchanged.

## Mana-gap diagnosis and finite reserve correction — October 25

Eleven diagnostic requests reproduced the actual failed512-fight batch and isolated
iteration101atseed37358830. Two more detailed requests reused the earlier logging
binary with exact complete-metric parity. This controls reset/RNG/logging changes;
it is not another gear search or a new selection from validation. Prefix receipt:
`artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-reserve-failure-prefix-v1/bc4e21140678759eae2658e3f7efcda02237d5551d22fbb4e0f66535474ef19b/report.json`,SHA-256`390ccc1b68b5fec7cb1fe2f0dfca72ab02bbe793304447ef1bd7cc8bfec9b88f`.
Trace receipt:`artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-reserve-failure-trace-v1/eebcf77f8e222c90fb906df4748575ad5ca564e02f769c9048c9659fa56168ce/trace-Qqi5LP/report.json`,SHA-256`bda51336f7956c14e6a3da2e283ce9a0e0b90bfe8b79db8479d748f458ff3c5d`.

The failed fight has18.55mana-blocked seconds and first/second potion use at41.704/
161.739seconds. Explicit timings are earliest eligibility points; the2000missing-
mana workload guard delays the first use and its real120-second cooldown. The log
then records three member deaths at170.2,174.1and178.4seconds. Earlier aggregate
wording of“one death”was imprecise:survival511/512counts failed fights,not members.

Two fixed group policies now have six public and three real-wire contracts and
three actual native/Chromium pairs. `resource-window` lowers Rune/Potion thresholds
to500/750missing mana. `resource-window-fast-rescue`also prepends the highest
source-eligible nonraid Flash of Light(rankVI19943)at60%missing target health.
Healing-demand guards,all other priorities and exact encoded timing arrays remain.
The known failing fight survives under both proposals,with14.533663416/13.1mana-
blocked seconds. Those controls qualify configuration parity,not recommendation
selection. Both proposals remain in the fixed domain regardless of control score.
Controls:`artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-reserve-policy-controls-v1/7c51321fadc05df82fad11829940065e8ad8dff7b1e99119bf5c668d5063af27/controls-1rZjrv/report.json`,SHA-256`71400fa899a481e000aea9bd78c15b8f29cf2ea140fe4714f0b4e7dabc32b34b`.

After diagnosis,a new finite correction runs only the60failed cases under the same
original deadline. It retains every previous contender and applies both proposals
to each of four earlier training-leading gears and the previous training winner.
Thus35whole options/28–30candidates percase,3acquisition groups,3474declaredtraining
and6948declaredconfirmation requests before exact reuse. No full catalog rerun.
Validation supplies case IDs and integrity metadata; proposal ranking and selection
use training only. Two fresh1024-fight rounds49979687/53300041select a winner before
four disjoint512-fight rounds57000013/60000011/63000019/66000029. Every fixed contender
is retained for confirmation. The original1%reserve selector,2%practical and
separate1%audit,survival,pressure and class deadline remain unchanged.

Live declaration:`artifacts/forever-simulator/optimization/healer-model-admission-v1/paladin-reserve-window-training-v1/0b4e003dba8804e5702b534c4dc436b32da015ea823291682ec1bad00f67e046/declaration.json`.
Log:`artifacts/forever-simulator/optimization/paladin-reserve-window-pipeline-20261025T1151Z.log`. Queue50509/child50717/session20273withworkers52125–52130were verified live.
Successful inputs/helpers are frozen. Use:

```sh
node artifacts/forever-simulator/optimization/review-tools/queue-paladin-reserve-window-v1.mjs
```

Do not start a duplicate. After an actually terminal owner and resolved lock,the
same command resumes exact evidence. New entrypoints also emit completed paths
when results are already cached,closing the old queue's handoff problem. It stops
after this fixed matrix; no automatic further retry or class/publication admission.
Independent merged-origin review and full delivery still remain after success.

## Read-only origin replay and historical failures — October 25

The prior189-case independent confirmation has been replayed from its actual
saved protobuf requests and workload files,using the original request-building,
selection and comparison code. All15096requested origins reproduce exactly:
12768unique saved requests and2328exact reuses,with129passing/60failed cases.
No native simulations were started. The immutable review is under
`paladin-reserve-origin-review-v1/4a190550e258600a9a7aff2fd95f2eeb3ab16e96062ce060bde8674139d3ba05/review-vtM8KG/report.json`,
byte SHA`bf99eed37d7e660003ac1dd85b22744df9fd29410bf606ae43c052946f393d3f`.

A separate read-only historical-failure index authenticates all12768records and
retains1668failed origins across1323setups. Setup identity binds the full numerical
request,workload and runtime while normalizing only sample seed/count and reporting
detail. It detects contradictory prior observations; it never keys result reuse
across seeds. Passing later batches cannot erase earlier failed fights. Changing
gear,policy,workload or runtime creates a distinct setup. Four actual-evidence
history regressions and four origin-validation regressions pass.

History receipt:`paladin-observed-failure-history-v1/prepared-DrhEox/report.json`,
SHA`5ba62b636ba4af6522966e2842c1ced83e1d115bc2b77398252c699c43cea4e1`.
The actual selected-build consumer authenticates all189cases and exposes the60
known failed setups without selecting replacements:
`paladin-selected-failure-history-v1/review-92nvuL/report.json`,
SHA`a81c645fb05fcc49a6bf52f67c47c536ba58a6e5351a1effef8c0651b9e5207a`.
All paths here are relative to
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`.
This index covers the declared previous independent confirmation,not every
historical study or an estimated server failure rate. Apply the consumer to the
new terminal confirmation and its successful origin review before merging cases.
Neither review tool changes recommendations, starts a class clock or authorizes
publication. The consumer takes three path/SHA pairs: source result,origin review,
then history receipt. Do not run origin replay on an active numerical owner.

The finite reserve-window training is now complete:3474actual requests and all60
selected plans survive. None selected the new policies; selection came from the
fixed retained domain. Its independent read-only replay also reproduced all3474
request origins and60choices:review-AMgHjPunder
`paladin-reserve-origin-review-v1/0b4e003dba8804e5702b534c4dc436b32da015ea823291682ec1bad00f67e046/`,
report byte SHA`f6aa301b464c76466492b19755576c11a54b24ec261e462792dbb17d7cb9ee32`.
The existing queue handed off to fresh independent
confirmation under the unchanged original deadline. Full qualification,merged
origins,longer/spread assignments and website delivery remain pending.

## Finite confirmation and preserved-origin merge passed — October 25

Latest confirmation completed6948actual requests/0reuse. All60selected cases
survive/pass observed2% and separate1%against every fixed contender. Queue50509/
confirmation65214exited;actual training/confirmation ledger entries succeeded.
Original deadline unchanged. Source:
`paladin-reserve-window-confirmation-v1/753d4f8aaec1639a030bb75f6d5f9e5e13ea94be283b50e876011a00b2fa7f21/report.json`,
SHA`09566b63be920484f8ea2c2a948f6ffe79e234becb89510c0fabb638724fd51d`.

Full saved-request replay reproduces6948origins/60results:
`paladin-reserve-origin-review-v1/753d4f8aaec1639a030bb75f6d5f9e5e13ea94be283b50e876011a00b2fa7f21/review-mCxTp4/report.json`,
SHA`e5bd6e7bb3f055d74a5f06ef6b758c3f67de7a6f54dad95c8063f0c39e7107a5`.
History consumer finds0indexed failures across60latest setups:
`paladin-selected-failure-history-v1/review-ArQCYT/report.json`,
SHA`5001764ecd53d61540a3f060255060d9ac6bb54ee2a4d031d22637dec6b38ca8`.
Coverage remains the preceding189-case confirmation,not all historical studies.

Independent merge verifies14455pins,four journals,all paired comparisons and
exact failed-case replacement masks. All3024declared assignment/profile/scenario
cases now survive/pass observed2%:2640original cases retain four64-fight batches;
195first repairs retain four256-fight batches;129previous-policy/60reserve cases
retain four512-fight batches. No old case is relabeled as a new execution.
Six negative controls cover duplicate/missing/incorrect replacements,altered
comparisons and phase-specific comparison schemas (the latest omits gearId).
Receipt:`paladin-scenario-confirmation-origin-merge-v2/merged-YbiQiT/report.json`,
SHA`06080ad7102a21b326c7fd0ab7354dbd091102632182368faa28e7824fc751d5`.

This closes the fixed declared matrix,not full Paladin qualification. Equivalent
original/first-repair full-request replays,broader known-failure coverage,longer/
spread/profile comparisons and full preset/library/guidance/browser delivery
remain. Repair replay since reproduced16176origins/384results exactly,including
its195passes/189failures;original replay is running read-only. These resolve saved
requests without executing combat jobs. Paths share the healer-model-admission-v1
prefix above. Successful sources are frozen;no automatic optimization retry.

## Full four-confirmation history reveals three contradictions

Original replay now reproduces115260actual origins and3024source results exactly:
`paladin-confirmation-origin-review-v2/92642fdccfea51851c35f331425fe147da1677eadd76f76d8e3426c8974339c6/review-En2r1N/report.json`,
SHA`a8c78b344d0863e1cbb808b21cc9fea7959a508a1901a7e3277bbc7b891db81a`.
First repair reproduces16176origins/384results:
`paladin-confirmation-origin-review-v2/ff783312545ec3dd20c62a0e79fac25f4059ae12a5a49c4737e342c951eb74e1/review-7w7ubI/report.json`,
SHA`a638188fb0e0a5deafe9b54cf8879fa9d319880f4ec3ae068732a1ed38fbe0df`.
Thus every source in the merged matrix has complete saved-request replay.

The broader consumer streams all132004saved requests across four independently
replayed confirmations. It preserves5702failed origins/2011exact setups and checks
all3024current selections,including unchanged old passing cases. Three have known
earlier failed fights,so they remain unqualified despite later passing batches.
This index covers those four confirmations and their retained alternatives;
training/other studies and server failure-rate estimates remain outside scope.
Receipt:`paladin-matrix-failure-history-v2/review-mdhmfz/report.json`,
SHA`ea465c1b5449bf1ce4cff9cbda5a60020512016748a8318a902d161f4a1939a0`.

All three are Vigil-support/tank under
`combined-conservative-no-retained-seal-healing`,Allianceprofiles1:2,11;1:4,11;1:8,11.
First-repair option1013296bb18b858a8a16e68e800c33b6cbca50b291bb469db2e7cb462a66bcf3
already failed an original64-fight batch atseed13965341. Its later1024-fight
survival does not erase that event. Latest60reserve corrections have no indexed
contradiction. A bounded diagnostic replays the actual failed job and isolates
its first failed fight;no new gear optimization,reselection,pressure reduction,
survival waiver or publication is authorized by this audit result.

Eight bounded diagnostic requests now reproduce that original batch and isolate
0-basediteration12atseed13965353. The isolated fight still fails. Two more requests
reuse the existing logging runtime with exact complete-metric parity;no runtime
compilation or gameplay model change. Rune uses occur at28.5/148.5seconds under
1500missing-mana eligibility. Potion's3000missing-mana guard delays first use until
69seconds;its120-second cooldown prevents a second dose within180seconds. The
target dies at173seconds after29mana-blocked seconds. Earlier resource eligibility
is a supported proposal,not yet a demonstrated correction or a selected build.

Prefix receipt:`paladin-historical-tank-failure-prefix-v2/9766f250586732351c75c7c50deaf8c27c14d883a8de06dadd9f0d916b32c016/report.json`,
SHA`bf72b5a7a9e3e86b28aba6aae3f95389b220dc20b4f2581ac655195e1e953c4a`.
Trace:`paladin-historical-tank-failure-trace-v2/395dccc7ebbda5a796e1270e4e06c41d1d85732b0bd0f2726d8fdee8578a2333/trace-1JeAcI/report.json`,
SHA`6e8f84e818b3e1f1a0da6b3194b7ac3473f76bc1fdc8e4236c7a04c1cdf740cc`.
Next work is a source-bound tank-specific threshold proposal,actual native/browser
controls and finite fresh training/holdouts for the three cases,retaining every
original contender. Priorities,timing packets,pressure,survival and deadline must
stay unchanged. No full catalog rerun or automatic further retry is dispatched.

## Explicit tank resource windows and finite correction — October 25

The tank source has no encoded cooldown timings. Its native default activation
heuristic still participates after workload eligibility. Four threshold-only
controls produce identical failed-fight metrics;these disprove the earlier
speculation that their results demonstrated early-use waste. Their native/browser
parity receipts remain preserved without qualifying a survival correction.

Two additional fixed-cycle proposals explicitly encode the existing15/135-second
Rune and30/150-second Potion scheduling mechanism. All original request bytes
outside that declared packet are preserved,as are priorities,gear,talents,consumes,
actual item cooldowns,GCD,ownership and healing demand. The six native/browser
controls match;only fixed-cycle-potion-window-1500survives the isolated seed.
That control is not used to rank or drop policies. All six stay in the experiment.
Receipt:`paladin-tank-reserve-policy-controls-v3/9c71edb0f010d816f035303bbacdc9b8677cc9659a0d70ee3cd1f8dbb5a9dab5/controls-JNyaWO/report.json`,
SHA`d44ab3185cd31df610d64f4abe5755b18a1b25008263555429b49742d8ab410e`.
Ten current policy/wire regressions and three earlier packet regressions pass;
the original default-policy inputs are frozen separately. No runtime is rebuilt.

The finite three-case matrix retains all12original training anchors across five
gears and applies all six policies:72options percase. Preflight reconstructs each
historical failed numerical identity exactly. Training uses two1024-fight rounds
at70000027/73000019;independent holdouts use four512-fight rounds at77000017/
81000019/85000013/89000033. Thus432training/864confirmation requests before exact
reuse. Starts are separated from prior sampled ranges. The survival-first1%reserve
selector and separate2%/1%confirmation remain;no candidate is selected from the
known-failure controls or fresh validation. Original23:58:06.787Zdeadline remains.

The queue started under the original class budget. Its durable log is
`artifacts/forever-simulator/optimization/paladin-tank-reserve-window-pipeline-20261025T1339Z.log`.
Use `node artifacts/forever-simulator/optimization/review-tools/queue-paladin-tank-reserve-window-v1.mjs`
only when no existing owner is live;it resumes exact evidence after a terminal
interruption. Sources are frozen while it runs. This matrix does not perform a
full catalog search or continuous timing sweep and queues no automatic further
retry. Actual source replays,whole-history review/merge,longer/spread/profile and
complete website delivery remain before full class qualification.

## Three-case correction independently confirmed — October 25

Training completed432actual requests;all three fresh winners use
fixed-cycle-resource-window with gear67ed9e33d4380b4ba51adbd641323efae3d478844b985f3658d40d026bbd5b9a.
That differs from the known-seed control winner. Fresh holdouts completed864actual
requests;3/3survive/pass observed2% and separate1%against all72retained contenders.
Both training and confirmation have full actual-request replays. Original class
deadline is unchanged;the queue is terminal and must not be restarted.

Confirmation:`paladin-tank-reserve-window-confirmation-v1/88ebe07f04c5c877717ef98fd779d8a9cb9ba5d1c26bef6348ca51f8d83a0aa4/report.json`,
SHA`86d7f149ab37d21ecf36b53356076e731b90b1b16921d3489b05eb30804de041`.
Replay:`paladin-tank-reserve-origin-review-v1/88ebe07f04c5c877717ef98fd779d8a9cb9ba5d1c26bef6348ca51f8d83a0aa4/review-IotIWW/report.json`,
SHA`b7bdfa97a985ae6893e1a0ceb7313b55c9cb2072f3979ec96bd7836371a3bcec`.

The five-source merge checks132868saved requests and all3024current selections:
no indexed historical failures remain for a selected setup. It retains5828failed
origins/2119setups,including126failures of latest retained alternatives. Current
origins are2640original/192first-repair/129policy/60reserve/3tank,each with actual
seed/counts. Nothing is relabeled as a new execution or cleared from history.
Receipt:`paladin-tank-confirmation-merge-v1/merged-KP8dnE/report.json`,
SHA`c19aac12dd9ec414eb8338f87fc3b7bdeea84dbfc12f8b5bb50880384be22ef4`.
This covers the five declared confirmations,not all training/other studies or
server failure rates. All30profession-profile coverage,longer/spread adaptation
and full website delivery still remain before complete class qualification.
