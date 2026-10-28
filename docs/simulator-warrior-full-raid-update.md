# Warrior full-raid update

This is the separately authorized DPS update from the
[full-raid plan](simulator-full-raid-update-plan-2026-10-22.md). The deployed
[tank item optimization](simulator-tank-item-optimization.md) is separate. The
broader DPS, tank and [healer campaign](simulator-healer-optimization-plan.md)
remains active.

## October 27, 08:55 UTC — approved update and current comparisons running

The owner approved the [consolidated remaining updates](simulator-remaining-update-plan-2026-10-27.md).
Older pending-approval statements below describe their original historical state.
Warrior's new immutable clock began at 07:39:25.898 UTC on October 27 and ends
at that time on October 28; the target remains two to four hours including delivery.

All 23 replacement **actual Forever UI/native/raw-WASM combat controls now pass**
on the 2,743-item current statistics model. The complete unit metrics agree,
and each equipped item/enchant projection matches the compiled database.
Report: `remaining-class-updates-20261027-v1/warrior-controls-GjBe9T/report.json`,
SHA-256 `d29944e8c4205f43608138498c27285e4aa2d9c26462cbbc8b772ea490776a45`.
Two additional Ironfoe controls correct its dense stone, and two actual Fury
captures enable execute-phase Recklessness instead of retaining the historical
disabled-cooldown benchmark. Their reports are `warrior-controls-YCL6m9` and
`warrior-controls-6h6h7t` under the same update directory. Old evidence is preserved.

Standard and optional proc-enchant Fury now have an active all-slot gear search:
complete weapon/jewelry pairs, compatible enchants and all 247 eligible Heroism
subsets, with full-set witnesses retained through selection. Adaptive comparisons
use the accepted 2% target, fixed-precision acceptance and fresh confirmation.
Bounded geared talent/APL/consume feedback is prepared; exhaustive timing work
remains deferred. These are running comparisons, not qualified new presets or
final DPS claims. Current defaults and production selection remain unchanged.

## October 27, 07:19 UTC — corrected control plan and mode guard prepared

The original loader replaced global settings with `{ faction }`, dropping the
explicit Forever mode. The new `infra/simulator/forever-capture-context.mjs`
guard checks both the exported UI settings and the unmodified captured request.
It rejects missing/Classic/unknown modes on either side. Rebuilding a captured
wire as Forever cannot repair its original UI provenance. Capture authenticity
and complete player/raid comparison remain separate requirements.

Seven regression tests use all fifteen actual failed-mode captures. Their
source-bound fixture is `infra/simulator/fixtures/forever-capture-context.v1.json.gz`,
SHA-256 `1abf44d5b5f57c48daf8846f72ee5439d7a4064f30ed336fc1d8791f52d4cb81`.
Scoped ESLint and Prettier pass. The original loader, captures, numerical
studies, failed reports and expired clock remain unchanged.

A separate plan prepares all fifteen replacements from the actual captured
settings, changing explicit mode and removing embedded old databases when
present. It adds eight representative Heroism comparisons (one through eight
pieces on the full Arms context). These are not all 247 multi-piece subsets
or an all-slot Warrior search. Nonraid acquisition, class/faction/profession,
ownership and compatible enchant checks pass. Proc enchants remain opt-ins;
Heroism cadence remains the unverified one-PPM reference.

All **23 complete native/Chromium stat API comparisons** pass on the expanded
2,743-item statistics model. Independent replay verifies the actual stat wires,
results, settings changes, gear and enchant legality, and all fifteen rejected
Classic captures. The original support-removal, disabled-action and Valor
controls retain their deliberate differences. No DPS fight, UI combat capture,
ranked search or new window ran. All rows explicitly remain
`actualBrowserCapture:false`; fresh actual UI captures are still required.

Paths are relative to `artifacts/forever-simulator/optimization/`:

- Original replacement plan:
  `current-warrior-controls-v1/prepare-uZKFXx/input.json`, SHA-256
  `feed2b2c60b0c6265438e390312958feed5df445ff1546dbbd569e4f6e4639b8`.
- Authoritative stat-qualified successor:
  `.../prepare-uZKFXx/exact-stats-ZB4poo/input.json`, SHA-256
  `d751d0d9f7678debdaa0f1222c82c2a5675c4c5432e569a118de4bf6d73ba3dd`.
- Stat report: `.../exact-stats-ZB4poo/report.json`, SHA-256
  `993323403da2c96fc5fae931f25f9dbcf183bcb85a79e1f2855c2d03028184d7`.
- Independent audit:
  `.../exact-stats-ZB4poo/control-plan-review-7xOCR1/report.json`, SHA-256
  `ff5a6ebed87299ee56bc1ca250ab885c9ed6c8fa76ee39186a23d1c060184815`.

Private producers are `prepare-current-warrior-controls-v2.mjs`,
`qualify-exact-warrior-control-stats-v1.mjs` and
`review-current-warrior-control-plan-v1.mjs`. The first preparer incorrectly
used the eight-item Heroism source overlay as the entire source catalog; its
legality failure is preserved. V2 composes the existing base acquisition and
craft audit before adding that overlay. No eligibility rule was weakened.
Protected cache access is rejected before loading. New rankings, current-model
all-slot/talent/rotation feedback, confirmation, presets and delivery remain
dependent on the pending bounded Warrior update approval.

## October 27: Heroism built into the current combat lineage

The [current Heroism model](simulator-warrior-heroism-current-model.md) now
contains all eight recovered items, preserves all 2,727 parent items and passes
184 native/Chromium component outcomes, including real Warrior DPS and tank
factories. Twelve complete native/browser tank stat API comparisons also pass.
Six tank domains, 1,536 added-item vectors and all-slot candidates are prepared.

This is component and candidate preparation. It does not repair the fifteen
Classic-wire UI captures, select new DPS/tank gear, reuse scores on a new model,
start another class window or change production. The previously requested
bounded Warrior update remains pending approval.

## Current evidence

| Work                                               | Evidence                                                                                                                 | Status             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Preserve existing DPS catalog and model fixes      | New isolated model retains all 2,671 items and effective parent overlays                                                 | Implemented        |
| Add current Valor effects to the DPS model         | Existing tank regression plus a DPS-specific threshold/proc regression; uncorrected parent fails the DPS test            | Implemented        |
| Exclude unfinished shared-checkout work            | Compiler workspace contains only 467 explicitly pinned files; six portable filesystem/overlay tests pass                 | Implemented        |
| Capture all published Warrior styles               | Fifteen original UI requests carry Classic; explicit-Forever recapture is required                                       | Correction pending |
| Native/WASM agreement                              | Fifteen pairs agree on complete unit metrics, including resources, actions, auras and pets                               | Verified           |
| Preserve unrelated Warrior behavior                | Five actual parent-engine comparisons agree on complete unit metrics for the published setups without Valor              | Verified           |
| Check support and Valor boundaries                 | Actual 4/5/6-piece, full/own support, Trueshot, disabled Rend and disabled Execute controls                              | Verified           |
| Bounded talents/rotation search                    | Arms fixed-gear selection and replay completed; dual-wield Fury domain tested; Fury measurements remain                  | In progress        |
| All-slot item/enchant search and geared feedback   | First gear study stopped on a reproduced precision-switching cycle; replacement selector and Heroism recovery are tested | Correction pending |
| Fresh confirmation and selected native/WASM parity | Independent two-seed confirmation with 2% and separate 1% assessments                                                    | Pending            |
| Presets, gear sets, guidance and public rollout    | Deliver the exact qualified setup and verify desktop/mobile behavior                                                     | Pending            |

No new DPS score, optimized preset or public model selection is approved by these
engine controls. The existing deployed DPS and tank releases remain selected.

### October 24 browser-ruleset audit

The Rogue control preparation exposed a shared UI metadata mistake: a
faction-only global settings object defaults the UI to Classic. Decoding all
fifteen original Warrior UI requests confirms `simOptions.ruleset = 0`, including
the full-raid, original, Valor and support-removal controls. Their UI fight
results therefore do not establish Forever behavior. The separate native/raw-WASM
canary materializer explicitly forces Forever; agreement of those derived fights
does not repair the provenance of the original UI fights.

The read-only audit preserves every original capture and numerical study. Its
record is `warrior-full-raid-v1/ui-ruleset-audit-2d3dcaa17154faf5.json`, byte SHA-256
`58e8f005c1199c4ce48de5d1e2365bdf5d8cc108fd2bf8663803b364fdec555b`.
It starts no combat jobs and changes no clock or frozen source. Before a new
Warrior result can qualify, the affected UI controls must be recaptured with an
explicit Forever selection and a wire-ruleset assertion. This joins the pending
gear-cycle/Heroism correction; the existing one-correction allowance is already
used, and no additional Warrior command has been dispatched without the requested
approval.

The subsequent [dungeon-upgrade coverage audit](simulator-dungeon-set-catalog-audit.md)
found the same omission across all nine base upgrade sets: 72 pieces are absent
from every checked catalog, including the optimized tank deployment snapshot.
The Heroism correction below addresses Warrior preparation only. Other classes
also need their exact upgrade-set acquisition, effects and catalog admission
reviewed before complete pre-raid coverage can be claimed.

The initial Arms domain is prepared in `warrior-full-raid-v1/arms-domain.json`:
241 legal talent candidates from the published 39/10/2 and reference 34/17/0
neighborhoods, 451 raw policies and 107,827 distinct resolved combinations.
Semantic SHA-256:
`c42b2bb402876f808df00031e7a01d62240385eb9db3ab36bb9b0733ffb4c890`;
byte SHA-256:
`4cc3a7dc1952006d64c2ce908ab4bc0141561fd20b0a44b8758d1cb006bd1162`.
This finite first-pass domain completed its declared measurements. It does not
enumerate every legal talent allocation. Policies resolve one talent at a time to bound
memory use.
The unranked reference template's final-fifteen-seconds Recklessness action is
explicitly disabled to match the measured incumbent's benchmark; the recorded
adjustment does not change the incumbent. The completed scalar study uses
identity `97d263c53d02057ec741a3206bdea482353d7212ea8d675797cf0ed29e569b25`.
All 23 derived native/WASM checks passed on complete unit metrics before ranking;
114 talent-rank and rotation features are covered. All 215,654 declared pairs
across the two enchant frames received an initial 80-fight screen, followed by
500/2,000/10,000-fight refinement. Family/allocation retention is an explicitly
bounded heuristic; it is not statistical elimination or final confirmation.

The live owner log is `warrior-full-raid-v1/arms-owner-v1.log`; the matching
`bounded-native-studies/<identity>/state.json` records actual progress. A finished
phase requires the framework's full saved-measurement replay and `completed.json`,
not just a high progress count.

The complete initial screen finished at **2026-10-23 21:27:39 UTC**:
215,654 unique numerical jobs and 17,252,320 fights. The owner then entered
500/2,000/10,000-fight refinement. That milestone is not a completed selection,
independent confirmation or permission to publish a new score.

The complete fixed-gear search finished successfully at **2026-10-23
21:36:57.122 UTC**, including full saved-measurement replay and worker cleanup.
It recorded 216,204 numerical jobs and 19,354,320 fights. Its completion semantic
SHA-256 is
`e266060811a8eb6c27fadefcb7b14649c41272162f6857d89c1799da18efdc5f`;
the result is `bounded-native-studies/97d263c53d02057ec741a3206bdea482353d7212ea8d675797cf0ed29e569b25/result-28f23ebb70c935cf.json`
(semantic SHA-256
`28f23ebb70c935cfb78b7c8bfedb33dcca0f20c13bfc5de2e27bf099ecc6c316`).
These selected talents/APLs are intermediate fixed-gear inputs; no new DPS
preset or independent final score is approved.

## Arms gear preparation and stopped search

The separate item stage composes the existing acquisition, ownership,
item-pair, set-assignment and enchant enumerators; it does not change the running
study's source graph. The actual incumbent preview covers all 17 slots, with the
off-hand explicitly empty, including 149 legal two-hand weapons from all five
weapon families. Each frame has 4,042 legal ordered ring proposals and 1,625
trinket proposals. Conservative/proc set proposal counts are 3,112/3,111, including
every two-to-eight-piece Valor assignment. There are 10,853/10,854 distinct
normalized starting proposals across all groups. Counts will be rechecked against
the actual selected talent/APL context; these are not measured gear results.

One deterministic maximum-piece-count proposal per admitted set remains mandatory
through the 2,000-fight group comparison, alongside measured group leaders and the
actual incumbent. This explicitly preserves the full Valor comparison. The
existing six-pass two-hand search measures nonconflicting composites, repeats
after equipment changes and checks stable finalists at 10,000 fights. Correct
sharpening-stone versus weightstone requests accompany each weapon. It does not
claim an exhaustive global optimum; actual geared talent/APL feedback and fresh
independent confirmation remain.

Eight recorded-input gear tests pass: complete slot coverage, loadout/enchant
legality, every Valor assignment, complete ordered jewelry pairs, explicit proc
opt-in boundaries, weapon consume compatibility, rejected foreign/mismatched
inputs and all 18 proposed native/WASM gear controls. Scoped lint passes for the
seven new gear modules. The zero-job incumbent preview passes; it is explicitly
rejected as a numerical study input. The actual gear runner requires the completed
215,654-pair study, verifies its source/result/journal hashes and selected request
identities, and requires fresh complete-metric native/WASM agreement on gear/stone
controls before dispatch. No new gear score or public preset exists yet.

The queue owner was started at **2026-10-23 20:45:06 UTC**, PID 73648, with
57 frozen dependency/test/supervisor files. Its log is
`warrior-full-raid-v1/arms-gear-queue-v1.log`; its owned record is
`warrior-full-raid-v1/arms-gear-queue-owner.json`. It waits for the actual Arms
supervisor to succeed, refuses a failed/expired source phase or changed sources,
runs the selected-state preflight, and only then invokes the ordinary approved
gear supervisor. It neither changes the running search nor resets the shared
class clock. A successful gear phase still needs geared talent/APL feedback and
independent confirmation.

The queue successfully started the ordinary gear phase at **2026-10-23
21:37:45 UTC**, supervisor PID 20693 / owner PID 20694. Selected-state preflight
identity is `aa2b29b655c428814e4ba8f39ebd5cdf10447e1cc60983fb71d71c7c17fcf4a8`.
All 18 actual selected-gear native/WASM controls passed complete unit metrics
before the scalar study began at **21:39:00.859 UTC**. The actual numerical
study identity is
`e8dc11f6c743d96f39df5b694cc324ae2b554f0b6612c8eed89e9165c0b11c6a`,
with six workers and the same existing Warrior deadline. It started with the
3,111 set proposals in the explicit proc frame, including mandatory maximum-piece
set comparisons. Its log remains `warrior-full-raid-v1/arms-gear-queue-v1.log`.
No gear winner is available yet. The study terminated at **2026-10-23
21:57:56.390 UTC**, after **32,403 numerical jobs / 5,077,460 fights**, on
`A gear selection cycle requires investigation`. Its supervisor and six workers
exited; the failed run was not restarted or relabeled as completed.

The read-only independent audit reproduced the exact failure across **227
stages**, reverified every admitted origin, and started zero native/browser jobs.
Its output is `warrior-full-raid-v1/arms-gear-cycle-independent-replay-v1.log`.
The failure arises from changing acceptance precision: a 10,000-fight choice was
replaced on a 2,000-fight gain of only 0.182 DPS, then selected again at 10,000
fights. These inspected figures explain the failure; they are not publishable
independent scores.

The separate `warrior-monotone-gear-search-v2.mjs` leaves the frozen failed
implementation untouched. Every accepted move now uses the same 10,000-fight
seed and must exceed the declared inspected-noise guard. Low-precision stages
only propose candidates. Mandatory complete sets also reach the decision stage.
Six focused tests cover the old cycle, consistent acceptance, ties, mandatory sets
beyond the leader cutoff, measured nonadditive composites, changed/missing
measurements, legality and the unfinished six-pass limit. This is a tested
replacement, not a numerical result. Dispatch requires an additional corrective
allowance; the existing one was already used.

## Geared talent/APL feedback preparation

These v1 runners remain bound to the original model and require a successful,
stable gear completion. The failed gear stage cannot satisfy that gate. Admitting
Heroism also requires rebinding and rechecking this preparation against the new
model; these files cannot simply be pointed at old scores from a different binary.

The state-recheck runner is implemented and has passed its zero-job incumbent
preview; it has not started numerical work. That preview proposes 16,906 states:
107 legal talent allocations and 76 retained representative raw policies per
frame, plus every resolved policy on each current talent allocation. Its 45
proposed controls include 20 neighborhood-rank/policy controls and 25 consume
coordinate controls; the policy controls cover 103 initial features.
Preview semantic identity:
`1c63d101f2374134060805ded631a7345dfaa8673e7e0fc35cb212fc4c31bb23`.
These counts describe the unmeasured preview. The actual first feedback bank must
use the completed gear result and the actual retained original-search policies.

The feedback builder crosses every legal one-point Mortal Strike-preserving
neighbor with the actual current and retained policies. Old scores provide
proposal seeds only; each changed gear context is measured again at
80/500/2,000/10,000 fights. A conservative inspected-score acceptance guard avoids
switching on tiny noisy gains. It is explicitly selection evidence rather than
independent confirmation.

The supervisor keeps the existing Warrior class clock and ordinary
`state-recheck` phase. Up to six declared cycles alternate talent/APL feedback
with renewed all-slot/pair/set/enchant search after an accepted change. Each
cycle has its own immutable declaration, journal, full saved-measurement replay
and initial/selected native/WASM checks after the previous workspace is released.
This bounds evidence memory and journal size rather than collecting the entire
loop in one ever-growing study. Existing gear-search proof can be reused only
when the whole settings object and frozen model are unchanged. A gear-pass limit
or the six-cycle limit remains unfinished work, not a successful optimization.
Completion references use saved immutable records, excluding invocation-only
`reused` and job counters so resumes retain the same numerical declaration.

The new two-hand request helper accepts either a sharpening-stone or weightstone
starting loadout and derives only the alternative stone field. It preserves all
other source settings and requires exact native-effective request equivalence
for browser materialization. This supports a selected mace or staff in later
cycles without editing the frozen initial gear helper, whose actual starting
weapon remains the sword. Identical numerical inputs from the two enchant frames
share a canary execution while retaining both provenance identities.

The latest combined run passes **28 focused tests** on recorded inputs and
applicability contracts, including complete neighborhood
coverage, current-policy preservation, changed-gear identities, recorded-precision
acceptance, frame deduplication, all nine sword/mace/staff source/destination
transitions, and rejected incompatible contexts. Scoped lint passes for all
19 feedback, consume, applicability and read-only audit modules. The
request-equivalence tests and preview are not actual new native/WASM fights. The completed-item-result loader, cycle evaluator
and selected-state browser checks still require their real integration run after
the current search and queued gear stage finish. Independent two-seed
confirmation, final consume applicability, delivery and publication remain open.

## Final-gear consume applicability and independent source replay

The feedback cycle now measures its declared consume coordinates on the actual
gear selected in that cycle. The choices are ten modeled nonraid foods, five
Blasted Lands buffs, four ordinary flasks and five alcohol choices, each with an
explicit none option. Two bounded coordinate sweeps refine through
500/2,000/10,000 fights. Source settings keep their matched dense stone, Mighty
Rage Potion, other ordinary elixirs, Juju buffs, chili, explosives, raid support
and encounter. This does not add raid recipes, seasonal availability assumptions,
Brilliant oils or a deep consume-timing search, and does not claim Cartesian or
global optimality.

An accepted consume change expires the old gear-search result even when the item
IDs are unchanged. The next declared cycle must recheck talents/APL and all-slot
gear for that changed full configuration. Final applicability requires a stopped,
unchanged consume comparison whose input and output settings both match the
actual final configuration. A stopped flag alone, or a comparison made on older
gear, is insufficient. The source-backed consume request tests verify every
coordinate in the pinned codec, explicit class9 wire data, consume-only changes,
correct final-gear item data and rejected cross-context or old-precision scores.
The additional applicability tests cover consume, talent, APL, support and item
changes. These tests are not new numerical optimization results.

The new read-only study reader reconstructs every stage from the packed scalar
cache and the hash-bound raw admission journals, checks all request origins and
compares the complete replayed semantic result. Its worker fallback always throws;
it cannot replace missing measurements. It also reports actual inspected RNG
ranges for later independent-seed planning. The gear-completion gate now requires
this independent full replay before feedback may start. The separate command
below audits the original 215,654-pair search after it is sealed:

```sh
node artifacts/forever-simulator/optimization/review-tools/audit-warrior-arms-search-v1.mjs --read-only
```

The independent audit exited successfully. It reconstructed all **216,204
admitted origins / 19,354,320 saved fights** across **490 stages**, matched the
complete saved semantic result and reverified the 23 source native/WASM cases.
It started zero native or browser jobs and wrote no numerical cache. The immutable
receipt is `warrior-full-raid-v1/arms-independent-audit-53ebcbe321ecd87f.json`
(semantic SHA-256
`53ebcbe321ecd87f4e06a6db5705929ddbb29a12332ce180e651e52b66af4215`);
it binds the original audit output and 60 observer source files at receipt time.
The original output remains `warrior-full-raid-v1/arms-independent-replay-v1.log`.
The receipt combines current scalar-stage and prepared/derived-control RNG ranges;
final independent reservations must additionally include earlier known history
and all later gear, feedback, consume and inspection ranges.
Its complete-metric canary verification runs in read-only mode and refuses to
create a missing proof. No new search, browser execution, seed reservation or
publication is authorized by an audit. Live numerical integration of the new
consume/feedback cycle remains pending the current search and queued gear stage.

## Dual-wield Fury domain preparation

The new `warrior-fury-full-raid-domain-v1.mjs` is a pure, unmeasured proposal
builder. Its read-only preflight uses the exact standard/proc published settings
and full-v2 scenario from the existing verified controls. It does not admit the
pending Heroism model or start numerical work.

The prototype preserves all **69,930** reviewed base-priority rotations and
**1,088** legal Bloodthirst talent allocations. The first stage crosses the two
published talent anchors with the full parent bank in both enchant frames,
retaining exact published controls: **279,721** distinct compact proposals. Only
retained parents subsequently expand Spearing, and only retained policies cross
the full talent bank. Limits are 320 retained parents, 128 retained policies and
300,000 generated candidates per stage. These are explicit bounded stages rather
than a restart of the deferred multi-million Cartesian research grid.

Published Spearing policies must regenerate exactly from their reviewed parents.
The matcher ignores JSON object-key order while preserving array order and all
action predicates. Unlearned Spearing policies resolve to their clean parent,
including its stance recovery, rather than deleting only the cast and leaving
stale holds. Parent and exact-control aliases stay mandatory through later stages.
The reference template's Recklessness condition is cloned and disabled to match
the published benchmark; original reference and published settings are unchanged.

The implementation pins its source dependencies and the prototype source model.
Candidate identities bind the source context, complete frame settings, talents
and rotation. Materialization changes only talents/APL and preserves gear,
consumes, support, encounter and proc opt-in boundaries. Returned metadata and
settings cannot mutate the private context.

Six actual-data tests pass: complete initial-stream coverage; exact published
controls; learned/unlearned Spearing resolution; the full 1,088-talent cross;
rejected foreign identities and oversized banks; and mutation isolation. The
proposal context remains explicitly `numericalDispatchAllowed: false`. Actual
search, current-model spell admission/native-WASM controls, gear/consume feedback,
independent confirmation and delivery are unfinished.

The recorded read-only preflight context is
`6a28abfc15fa1d9f9e8e117a16c24a5314b4f247ef2e68331a1488a8287852a4`.
Its compact stream SHA-256 is
`055901ada6059dfad40cd218c5e1454c1b98d205cd112534514a445f9ad409c4`.
The immutable receipt is `warrior-full-raid-v1/fury-domain-readiness-106e1cf9fd1d5fd6.json`
(byte SHA-256
`106e1cf9fd1d5fd60cf1c3399f5f9de0beb5b544ee58c1ce40867c99b4278f31`).
It binds both actual logs and nine source dependencies, verifies all 4,103
original gear-study pins unchanged, and records zero new numerical jobs and the
unchanged Warrior deadline. This receipt does not approve a simulation or preset.

```sh
node --max-old-space-size=4096 artifacts/forever-simulator/optimization/review-tools/prepare-warrior-fury-full-raid-domain-v1.mjs --plan
node --max-old-space-size=4096 --test artifacts/forever-simulator/optimization/review-tools/warrior-fury-full-raid-domain-v1.test.mjs
```

## Frozen model

- Release: `f9ecc3fc7ade139a57d5b306`.
- Context semantic SHA-256:
  `1ff5701d7692fb14d5eea10c73d24e3e2ab24b157180e1f0a0f89b7c7349508f`.
- Native binary SHA-256:
  `fab2be6e6374124c854b7b904e6614684364c117db967931694510197a1c2be7`.
- WASM SHA-256:
  `b16908a02f8f45c6c1e53f9360f31a66b929ebae8e2d6e1128745520c0eaaea6`.

The input is the admitted DPS model `e945e98f232cc81948ee9060`, reconstructed
with its exact effective Go overlays. The build explicitly pins the three embedded
core JSON resources against the previously reviewed tank snapshot. It adds the
same reviewed Valor dispatch used by the tank work, retaining the disclosed,
server-unverified 1-PPM cadence. At that model's admission, Heroism availability
was unresolved. A
read-only check confirms eight base Heroism definitions (21994–22001, set 511)
and sixteen alternate definitions (set 1778) in the 12,400-item client snapshot.
They have no admitted source entry in the 1,958-item source catalog or the
current compiled pool. Their presence in client tables does not prove current
server acquisition; none is silently substituted into the frozen search. The
record is `warrior-full-raid-v1/heroism-source-gap-db59d0cd9fd77ec0.json`
(semantic SHA-256
`db59d0cd9fd77ec0c73092c3cf81127dee01b8db6276ae011af0f35b977e47d0`),
using client snapshot **1.60.1.70425**. Server unavailability is not proven either.

### Heroism recovery prepared on October 23

Subsequent primary evidence strengthens the acquisition case: Blizzard explicitly
lists the dungeon-set questline among [Forever Legacy activities](https://worldofwarcraft.blizzard.com/en-us/news/24307383),
and the Forever quest database supplies the reward relations for all eight base
items. The four Alliance milestones are [8912](https://www.wowhead.com/forever/quest=8912/an-earnest-proposition),
[8937](https://www.wowhead.com/forever/quest=8937/just-compensation),
[8959](https://www.wowhead.com/forever/quest=8959/anthions-parting-words) and
[9006](https://www.wowhead.com/forever/quest=9006/saving-the-best-for-last).
Horde relations 8920/8944/9022/9013 are recorded alongside them. This is announced
questline/database evidence, not an observed reward on a live character.

Hash-verified effective client tables from **1.60.1.70532** confirm base set 511's
actual bonuses: 2 pieces +8 resistances; 4 pieces a white-melee healing proc of
88–132 with **no rage**; 6 pieces +40 melee/ranged attack power rather than
Strength; 8 pieces +200 bonus armor. The inherited legacy handler mixes in
alternate-set bonuses and cannot be used for this comparison. Set 1778 remains
excluded. Proc frequency is still a disclosed, server-unverified 1-PPM reference.

`infra/simulator/warrior-heroism-model.mjs` prepares the eight current-stat item
records, class-quest acquisition restrictions, ownership/inspection metadata and
exact set-511 dispatch without changing existing records. Acquisition references
for both factions are alternatives, so the existing conservative eligibility
filter does not accidentally reject the items for both sides. Guaranteed rewards
from the same milestone are not marked as mutually exclusive choices.

The actual 2,671-item parent is preserved and the prepared catalog has **2,679
items**, semantic SHA-256
`542e12b34391e8bd23671d1815d483a96b590ac2349dfbcc3a1c3ec7ba7ba1f7`.
Both actual Arms proposal builders include all eight new items, all two-to-eight
piece Heroism subsets and a mandatory full-set comparison. The proc/conservative
set groups contain 3,358/3,359 candidates and 36 mandatory set representatives.
These are coverage checks, not measurements.

Six Heroism Node tests and the six selector regressions pass. Compiled isolated
Go tests check all 0–8-piece thresholds for DPS/tank Warriors, both with and
without Kings; exact flat AP/armor/resistance changes, proc masks/outcomes, healing
range, no rage, and no duplicate legacy effects pass. The uncorrected parent fails
the same regression as expected. Both existing Valor regression suites also pass.
The source fixture is `infra/simulator/fixtures/warrior-heroism-source.v1.json.gz`
(byte SHA-256
`204b73b5537bb784b2b9e60a1679dcc80584bd78b80ebd2af41d768514cbed12`).

The new catalog is **not compiled into an admitted native/WASM release**. The
frozen failed study, its catalog, source graph and old scores remain unchanged.
Fresh model controls, all affected measurements, independent confirmation and UI
delivery remain required. A changed catalog/binary cannot inherit numerical
qualification from the old model.

`infra/simulator/frozen-model-workspace.mjs` materializes the declared compiler
inputs into a new research directory. It validates bytes before creating the
workspace, resolves the effective overlay, rejects unsafe paths and symlinks, and
refuses to replace an existing output. Unlisted files from the shared checkout
never enter compilation. Both native and WASM builds use that isolated directory.

The parent manifest contains 22,443 source/evidence pins. Only compiler sources,
their declared embedded resources and overlay replacements belong in this Go
workspace; unchanged, compiled browser assets are copied from the verified parent
manifest. Current mutable TypeScript sources are not rebuilt into this model.

## Actual controls and review

Authoritative artifacts are under
`artifacts/forever-simulator/optimization/warrior-full-raid-v1/`:

- `capture-*.json`: fifteen genuine UI captures and their exact source binding.
- `control-parity.json`: fifteen native/raw-WASM comparisons, with raw response
  checksums and successful worker/server/lease cleanup.
- `parent-full-*.json`: five new parent-engine reference runs.
- `prepared.json`: independent successful review, semantic SHA-256
  `d4fff6299ec0d0baf27508df273fea02de2489c9520be59fb31734d2e38a55f7`;
  byte SHA-256
  `d417e0cb425c8746036626bd587bccb0fa8c58a374389aff6c49c2c329ba9564`.
- `stat-controls.json`: read-only checks of the actual captured stats and source.

The full-support Arms control has 1,467 melee AP versus 1,117 with outside support
removed. In this pinned Forever model, Trueshot adds **75 ranged AP and zero melee
AP**; its absence does not change this melee control's DPS. The source and raw
stats agree. These are scoped model checks, not a new live-server measurement.

At most eight activated target aura rows occur in these controls. Counting the
union is a conservative upper bound for these particular fights; it does not
establish global sixteen-debuff enforcement for arbitrary future inputs.

The first capture owner completed all fifteen browser/native/WASM cases, then its
postprocessor failed because the codec exports `RaidSimResult`, not `UnitMetrics`.
The original source and failure remain preserved. The independent v2 reviewer uses
the actual public codec entry point, rechecks the same raw records and performs
the five parent comparisons. It does not repeat the browser fights or relabel the
failed owner as successful. Three recorded-data regression tests cover full pairs,
row ordering, changed resource gains, missing actions, duplicate identities and
unknown fields. Together with the three control-domain and six workspace tests,
twelve focused Node tests pass; scoped lint/format and Go regressions also pass.

## Budget and continuation

The shared Warrior update began **2026-10-23 19:41:30.565 UTC** and ends no later
than **2026-10-24 19:41:30.565 UTC**. Target 2–4 hours; the 24-hour limit includes
all Warrior specs and resumes. The original ledger remains absent and unchanged.

The ledger is
`optimization/full-raid-update-windows-20261022/warrior.json`. It records the failed
capture-owner postprocessing and the successful independent review under the
single permitted correction phase. That correction allocation is used; do not
rename specs, reset the clock or create another corrective command to bypass it.
Continue the ordinary bounded talent/rotation, gear, state-recheck and confirmation
phases under this same deadline. A genuine need for another correction is not
authorization to silently expand the window or correction allowance.

The current preparation and review commands are:

```sh
node artifacts/forever-simulator/optimization/review-tools/prepare-warrior-full-raid-model-v1.mjs --prepare
node artifacts/forever-simulator/optimization/review-tools/run-warrior-full-raid-controls-review-v2.mjs --plan
node artifacts/forever-simulator/optimization/review-tools/prepare-warrior-arms-full-raid-bank-v1.mjs --plan
node --test infra/simulator/frozen-model-workspace.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/warrior-full-raid-controls-v1.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/warrior-full-raid-unit-parity-v2.test.mjs
node --test artifacts/forever-simulator/optimization/review-tools/warrior-arms-full-raid-gear-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-warrior-arms-full-raid-gear-v1.mjs --preview-incumbent
node --test artifacts/forever-simulator/optimization/review-tools/warrior-arms-full-raid-feedback-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/warrior-two-hand-loadout-requests-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/run-warrior-arms-full-raid-feedback-v1.mjs --preview-incumbent
node --test artifacts/forever-simulator/optimization/review-tools/warrior-full-raid-consumes-v1.test.mjs artifacts/forever-simulator/optimization/review-tools/warrior-arms-closure-applicability-v1.test.mjs
node artifacts/forever-simulator/optimization/review-tools/audit-warrior-arms-gear-cycle-v1.mjs --read-only
node --test infra/simulator/warrior-heroism-model.test.mjs artifacts/forever-simulator/optimization/review-tools/warrior-monotone-gear-search-v2.test.mjs
node artifacts/forever-simulator/optimization/review-tools/capture-warrior-heroism-source-v1.mjs --capture
node artifacts/forever-simulator/optimization/review-tools/verify-warrior-heroism-engine-v1.mjs --verify
node artifacts/forever-simulator/optimization/review-tools/prepare-warrior-heroism-catalog-v1.mjs --prepare
```

The archived model/control commands require the local verified source and numerical
artifacts. Actual combat phases must run through
`runApprovedFullRaidUpdateProcess`; read-only review plans do not start new jobs.
Keep admitted sources immutable while the new search is running. Qualification,
actual UI delivery and an authorized Git/deployment workflow remain separate gates.
