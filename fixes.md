# WoW Trader fixes and recovery context

Last updated: 2026-10-19

This file records completed fixes and the evidence needed to resume debugging in a later session.
Read it together with `context.md` for the wider product history. Do not store collector tokens,
database credentials, SavedVariables contents, or other secrets here.

## October19 Hunter Beast Mastery production publication

The owner's2% practical-margin approval resolves the historical MM policy blocker below;
it does NOT change the raw failed1% confirmation or mean MM has been published.
BM source0356a87 was committed/pushed and deployed successfully03:39:39UTC as
kfc-helper-hunter-reviewed-20261019-r2, buildf6wrYfrlHBX0eIkZ51X3f. Live Hunter UI
94239fb7240949919b83f8ad now has the actual reviewed gear/enchants/configurations and
six-priority rotation guide. Numerical sourcee14af46d79721e1ad50a6f04 stays unchanged.
The publication reader preserves optional rotation introductions/priorities/caveats and old
guide-less publications; regression tests cover validation and exactOptionalPropertyTypes.

A production-current guard caught a concurrent leveling deployment before activation.
The final build preserves that newer leveling source instead of overwriting it with the old
staging baseline. Only Helper web restarted; ingestion/crawler/guild state stayed unchanged.
Local485 web tests/lint/tsc, Linux99 tests/production build, all3,494 Hunter asset hashes,
and public Hunter desktop/mobile/full-import/preset/gear/rotation/persistence checks passed.
Actual25-fight Hunter and Warrior public browser smokes passed; they are functional checks,
not new independent numerical validation. Temporary staging servers/tunnels are stopped.
Rollback web: kfc-helper-leveling-campaign-test-20261019-r1; backup
shared/backups/hunter-20261019-r2.UPyGyq. Full receipt: docs/hunter-production-publication.md.
MM2% qualification/delivery and Survival remain pending; preserve all old results/checkpoints
and the original shared Hunter deadline2026-10-19T21:33:17.772Z.

## October 17 reviewed builds on the normal Warrior page

The completed local builds previously required the separate /forever/simulator/review screen.
They now appear above the engine on /forever/simulator/warrior in a reviewed-build selector.
Both Arms scenarios and conservative Fury are available; only completed current-release/profile
evidence is eligible. Explicit Load build imports every combat setting without leaving the
page. Visits/selection alone do not replace saved characters, and provisional consent stays OFF.
This is development-only presentation, not public/default promotion or deployment.
The embedded engine's original Arms/Fury starter presets have NOT been replaced. To see reviewed
equipment, use the outer Simulation-tested pre-raid builds selector and explicit Load build.

Owner now requires actual built-in Preset Configurations and Gear Sets to be updated immediately
after spec review, ahead of BiS guide pages. Private staging00bd0f61e51932f3 prepares the five
matching conservative Arms/Fury files from the fully reconstructed reviewed exporter; eight
actual-data regressions pass. Virtual upstream TypeScript/dependency check1bab83199ba5ce25
passes with zero diagnostics and a missing-API negative control. No engine/preset publication
has occurred: the live native owner still requires frozen inputs. The next idle boundary must
integrate owned preparation, verify model compatibility/rebuild and exercise the actual built-in
clicks/fresh defaults/saved characters; staging or the outer selector is NOT that delivery.

Browser testing also found two wrapper bugs. Nested modal focus placed its close button behind
fixed site navigation; a cleaned-up shown.bs.modal listener now reveals the header (fullscreen
excluded). Mobile hides the desktop Simulate button, so the old readiness test never cleared
the loading overlay; it now accepts an explicitly initialized visible workspace while preserving
all origin/path/loading/hidden guards. The mobile test was observed failing before/passing after.

Actual desktop/mobile import/consent/zero-combat/zero-error smoke PASSES in receipt9675a121f3fea193;
31 focused tests, tsc, scoped ESLint and Prettier pass. The broader existing frame smoke also
passes four profiles/reload, missed-load and blocked-asset retry; it ran before the final mobile
marker adjustment, which is covered by the final actual mobile import and unit tests. Sources,
exact hashes and command are in context.md. No frozen numerical source or worker count changed.

The separate private browser holdout2677 actually exited1 after a development-page navigation
destroyed its execution context. Three completed measurement-only arms and both reserved ranges
are retained, with no partial fourth result/final verdict. Native campaign51962 is unaffected.
Continuation must use an immutable non-HMR host; see its failure receipt/context, not stale live IDs.
The same declared experiment is now resumed by private `probe-fury-spearing-resume.mjs`, using
the unchanged checksum-verifying loopback asset server and a non-executable holder document.
All three saved complete requests are checked before reuse; only five missing100k jobs run.
Four actual admissions and an exact25/1337 replay canary pass; real first-job progress is seen.
Six resume-contract tests and one focused existing server-integrity test pass. This is runtime
recovery, not a complete/gaining experiment. The original source remains frozen, both ranges
reserved, native workers unchanged. Full final fingerprint/contrast/native checks still remain.

That resumed browser experiment has now completed and exited0. Producerd7e5e25b01a85fde and
independent request/context/math/source review407beb9996ba2cbb both pass. All eight rows are
saved; primary fixed-policy gain+0.0497854DPS is NOT established on either100k range. The
secondary+3.1834993DPS entry/hold gain is against a weaker learned/no-cast control, not an
upgrade over the original. Ten reviewer regressions plus11 contracts pass,0 skipped, with lint/
format checks. The current32 allocated ranges are disjoint. Native parity/full expanded-policy
feedback remain pending; raw protobuf progress payloads were not stored, and no new combat was
executed by the reviewer. Browser53287/its children are terminal, not live or to be restarted;
native ring9106 remains active. No default promotion, deployment or hidden sample-count increase.

The provisional Fury core has since closed without adopting the noisy BRage20 challenger:
only one independent range clears its confidence threshold, so BRage30 is retained. Independent
readonly proof7af6ebd2d69d1769 verifies the six raw closing/selected-gear records, exact full core
receipt and26 disjoint historical/reserved ranges; core reference853.4213563DPS/400k. Actual
trinket child85247 now owns the six workers, not terminal talent63467/feedback80788. This is
correct no-gain handling, not proof of every Warrior frontier or public preset promotion.
That trinket child has since completed:1,625 screens/7 close candidates, HoJ+Adaptive retained.
Owned replaydf7b6c3ff844fec6 matches all1,641 raw records/4.85m represented iterations;
range-only proofe191afdf73ccdac3 checks29 historical/reserved allocations. Current ring
child9106/workers9126–9131 now own the native work;85247 is terminal. No default promotion.
The ring broad screen has since completed all3,794 pairs;31 close candidates/control are now
in both100k confirmation ranges. Keep these inputs frozen and check actual handles before
calling the ongoing audit live or complete.

## October 17 packed simulation-evidence prototype

The declared wider Fury search must not allocate millions of separate4KiB files or retain every
result/APL in memory. A PRIVATE packed scalar store and real-data probe now exist under
`artifacts/forever-simulator/optimization/review-tools/`; this is not live-pipeline integration.
Immutable checksum-named packs preserve exact IDs, sample sizes and double-precision metrics,
reject detail/error/unknown fields, publish without overwrite, and bound index/pack buffers.
The campaign still owns its single-writer lease. Crash leftovers are not successful evidence.

All40 combined storage/stage/ranking tests pass; checksum-bound reload optimization has a failing-
before/passing-after regression and still detects tampered evicted packs. Latest storage receipt
ef245a8f6c9ec558 verifies10,000
lookups plus10,000 streamed rows after reopen, all original-file hashes and pinned inputs.
Temporary copies use524,288 allocated bytes versus40,960,000 for original JSONs; ONLY those
isolated temporary copies were removed. No existing cache/evidence was deleted, migrated or
archived, no numerical input/worker count changed. Private bounded stage execution and readonly
family/control-aware ranking now reproduce the complete1,625-request real trinket bank plus13
aliases; proof08d0b62df56f3ea6 matches a full reference sort for42 families/top5/control. Reopen
uses no provider calls, max256 full requests/90 retained references. Providers were readonly
cache replay, not new simulations. O(N) digest indexes remain explicit; missing/changed evidence
and coverage fail closed. Scoped lint and actual ignore-override formatting pass. Full-frontier
generation/cost checks and coordinated owned-source/reader integration remain required at a
completed campaign boundary. Full scope,
hashes and limitations are in `context.md` and `docs/simulator-prebis-optimization.md`.

Private `fury-expanded-policy-stream.mjs` now feeds the composed Fury bank one parent at a time,
preserving every source-family alias and rejecting missing/extra request counts. Seven producer
tests and47 combined producer/storage/stage/ranking tests pass,0 skipped. The complete generation-
only probe57436/PID97848 has now exited0. Receipt85f6a56796bdd149 passes all2,976,090 attempts /
2,863,290 unique requests/112,800 aliases, exact prior rotation stream/mode counts and13 fresh
source/input checks.6,124 families allow a12,254-reference configured retention bound. This is
not a numerical simulation or constant-memory claim: the legacy69,930-parent array and explicit
digest indexes remain.21.72min/peak1.82GiB is generation-only under load, not native throughput.
Native/running-browser pins remain frozen; the completed own probe is not a live process.

## October 17 reusable full accessory replay

Added `scripts/review-prebis-accessories.mjs` and its12 passing regression tests. The read-only
tool reconstructs current legal pairs/source identities, replays every raw screen, rebuilds the
shortlist, independently recalculates all100k confidence comparisons and rejects contradictory
status/selection. Empty shortlists still require both measured controls. Archive containment,
symlinks, size, precision, scalar fields and end-of-run source/input identities are guarded.
All six current completed Arms/Fury ring/trinket audits pass actual full replay; receipt hashes
are recorded in context.md. No new damage samples, workers, builds, leases, cache writes/deletes
or public promotion. Raw core and global-range proofs remain separate. Future one-command
integration belongs at the next frozen-input boundary, not a live source mutation.

## October 17 private browser-verifier contracts

These are local research/operator fixes, not combat-engine changes or a production deployment.
The current six-worker numerical campaign, source/data bytes and ownership are unchanged.

The new four-arm100k browser experiment first had a20-minute per-job timeout, too close to its
observed runtime under load. That private attempt was deliberately SIGTERM-aborted after20k
progress, with its browser children verified closed; no partial metric/verdict was used. The
replacement keeps all arms/100k precision, uses a one-hour bound and fresh disjoint RNG ranges,
including protection for both old reserved ranges. No native campaign was interrupted. This is
an operator runtime-bound correction, not an engine calculation change or completed gain claim.

- ComputeStats pads a party to five slots. The admission verifier now requires one party/five
  slots/exactly one active rotation, exact action counts and zero valid-policy warnings. Unknown
  and unlearned spell negative controls must identify the exact unavailable spell, not any error.
- Battle-residence Fury policies legitimately omit Berserker-only Whirlwind. The action verifier
  permits that only for the explicit residence family; all other tested families must cast WW.
  Every tested policy must cast Bloodthirst; Spearing policies must actually cast Spearing and
  both stances, while no-Spearing controls must not cast it. No gameplay policy was altered.
- Fresh UI settings omit protobuf-default false/zero fields and pad manual-stat arrays with
  zeros. Two-hand capture compares generated settings/player protobuf values and canonicalizes
  only strictly all-zero manual-stat vectors. Nonzero, malformed and sparse vectors fail; the
  sparse-vector regression was observed failing before/passing after the helper correction.
  Level0 is normalized to60 only under the documented api.proto/core.PlayerLevel contract;
  other levels still fail this level60-only control check.
  Equipment, talents/APLs, buffs, encounter, consumes and enabled effects remain checked.
- WASM response decoding now stays in the browser and returns compact metrics plus response
  hashes, avoiding expensive transfer of raw byte arrays/debug logs to the operator process.
- Final review-page smoke now resolves relative links against the actual page origin before
  checking the exact saved URL, and limits storage instrumentation to real HTTP-loopback
  documents. Opaque about:blank popup documents had caused errors in the TEST instrumentation;
  no application storage/CSP behavior was changed and no real application errors are ignored.
  Actual final Fury desktop/mobile/link/import/consent checks pass in receipt78f57311a823e7a7.

Actual evidence:153 representative WASM admissions plus two exact negative controls
(`fury-browser-admission-34e30c8f1e3d335d`); seven real UI combat executions
(`fury-browser-execution-800fd86f107f0ac2`); exact-request replay with actual cast counts and all
seven UI results reproduced (`fury-browser-actions-b1f661ccaa06edf4`). All are low-N/representative
integration evidence, NOT new-policy native parity, independent rankings or full2.86m coverage.
Five admission, seven action-metric and five control-normalization focused tests pass.
Fresh real Alliance/Horde two-hand control captures also pass (`two-hand-fury-browser-controls-af67571108054340`),
preserving all decoded combat controls and16 actual item stat vectors; they remain unoptimized
browser-only controls. Full receipt hashes/status are in `context.md`.

## October 17 local build-share dialog race

The first FINAL proc-share smoke timed out because the enchant selector blocked Export. The
review utility clicked Close while Bootstrap was still opening the dialog; `Modal.hide()` ignores
that call during its transition. Numerical feedback, accessory audits and the export were intact.

`scripts/review-prebis-browser.mjs`, used by `review-prebis-build.mjs`, now waits for actual
`shown.bs.modal` and `hidden.bs.modal` events around consent inspection. It only asserts the
checkbox is OFF, never changes consent, force-hides DOM or relies on a fixed delay. Temporary
observers/markers are removed. No combat engine, numerical input, worker count or website default
was changed; this is an operator-tool fix, not a production UI deployment.

Verified: all9 focused `pnpm simulator:prebis:share:test` tests pass,0 skipped, including the real
Bootstrap opacity-transition negative control (old immediate close stays stuck), corrected close
and already-enabled-consent rejection without mutation. Scoped ESLint passes. Actual FINAL
`simulator:prebis:share --case=arms-alliance-procs` passes in two fresh contexts with complete
combat settings unchanged/consent OFF; receiptdd1a5306345f12d0. The real review-page final link also
passes200/noindex, desktop/mobile layout, full-settings equality, consent OFF, zero combat requests
and zero page errors. Both current Arms cases are reviewed-local; the same campaign has advanced
to conservative Horde Fury. Full immutable receipt hashes and actual live handles are in context.md.

## October 17 repeatable simulator update workflow

`pnpm simulator:prebis:update` wraps preparation, versioned all-slot/set/enchant feedback,
both accessory audits, final rotation checks and local reviewed exports. Read-only plan/status
commands expose changed items, stale evidence and unfinished spec policies. Resume verifies hashes;
confirmed accessory/rotation gains restart full feedback, not a patch to an already-reviewed build.
New accessory baselines are checked against real independent measurements and the current legal
candidate bank, then recaptured in the browser. Campaign receipts tie every required final gate.
See `docs/simulator-update-runbook.md`. No public build/default, deployment or commit is automatic.
Current full policies are Arms/Fury; other class/spec work is still required. The temporary
checksum-protected loopback server passed a real browser/archived-native2-iteration parity smoke.
The long-term deliverable is original, crawlable Wowhead-style BiS guides, including independently
tested alternatives, acquisition, enchants, talents and rotation; the simulation runner is their
evidence source, not a substitute for those unfinished guides.
All204 simulator tests and scoped lint/format/whitespace checks pass. The native workspace guard
has an isolated failing-before/passing-after regression. The earlier ring audit finished untouched:
4,042 pairs /23 near challengers;4,090 simulations /12,884,000 iterations; no confirmed challenger.
Receipt `accessory-rings-f2fd9c30f025a040.json`; exact old nine-source archive
`source-archives/accessory-audits-e8b2911afb10cd44.json`. No complete numerical campaign through
the new orchestrator is claimed yet.
The real updater has passed prepare/Go/22-page build,23 browser-template captures, native preflight
and fresh Arms control. Local UIe14af46d79721e1ad50a6f04/native3dde/DB029b. Campaign4ee5e4d6…
is running under exec64337/PID51962; verify actual liveness before relying on those IDs. Its source/
catalog/model inputs are frozen. Both Arms cases and conservative Horde Fury now have reviewed
local exports; the Fury provisional-proc case is running. Full Warrior/style/frontier/all-class
work and the overall numerical campaign remain incomplete; public r15
remains unchanged. Full current state paths are in `context.md`.

## October 17 current Blackhand/Eye effects and fresh Arms restart

The previous MCP-stage freeze below is preserved historical evidence, not the current engine.
CURRENT LOCAL UI21a0ef96934be4ef740d6de4, native
3dde1e2bc7192e1899e92d2c46404cdaa997bc8ded9667a9f7255bbac22f8e90,
DB029bd1e5c3e7382a0ee230c503fed0cb22220ea5bb4db16347d632321b6bd0f4.
Still2,591 items; two of637 historical references now have explicitly partial current effects.

`drakkisath-trinkets.mjs` validates exact current raw links/item effects/spell effects/options/
duration/text, with checksums and selected-record digests. The importer replaces old2% crit
with current passive1%; it does not add both. Runtime/tooltip share the same model. Blackhand
13965 uses5% owner-only attack/spell crit versus one marked target; Eye13968 uses7% spell hit,
not melee/ranged hit. Both20s/CD300s/shared20s. No new uses leak into Classic ruleset.
Core caster/defender attack-table hooks avoid a raid-wide/global crit buff. A native guard
rejects stale compiled2% data instead of running the corrected handler on obsolete passives.

Missing ItemSparse/base metadata, acquisition, empty scripted1318945/1318846 and Blackhand's
Orc/Ogre doubling remain unverified/unmodeled, clearly disclosed. No claim of complete current
metadata, observed server behavior or final BiS. HoJ retains its labelled provisional model.

`pnpm simulator:prebis:verify-drakkisath` receipt5082090688c48977 passes four real native/browser
cases (25runs each;299s/599s:25/50uses). Go missing-use overlay fails the intended runtime test;
current actual crit calculations, owner/target scope, hit scope, cooldown/reset and Classic
guard pass. Initial harness used a Warrior forbidden from Eye; switched to a permitted Druid,
without weakening class rules. Failed casts mutate generic engine CD before a shared-CD check;
the harness correctly tests readiness with CanCast. Inclusive end-time events explain a terminal
zero-uptime use at300s, so integration fixtures stop1s before boundaries. The initial Warlock
fixture's inherited free Tier1 was disabled to match the native contract. Passing final results
are recorded separately from those fixture mistakes; no tolerance was loosened.

181 Node tests, scoped lint/format, strict upstream TypeScript, installed Go checks and22-page
build pass. Five-profile browser catalog smoke passes. Native3dde is exactly archived.
Fresh Arms bluea385a1ce5d970b09/controld126c4767ee2153c captured554.60DPS (not optimized).
Feedback4f2018033bc0096cc80fa960a329fa5eff055efbcd32c4a3135e60030b192518 launched in exec93636:
241 legal seeds, six workers,100k independent-seed validation. Poll actual process/handle before
assuming it remains live. Do not mutate frozen source/database or resume old interrupted1946….
Public r15 unchanged; no new commit/push/deploy. Full all-class goal remains active/incomplete.

User's next phase is preserved in docs/simulator-rotation-guides-content-plan.md: build-specific
rotation explanations tied to actual winning APLs, then useful original upgrade/stat/patch
analysis and server-rendered canonical guide pages. No unverified best-DPS/Google ranking claims.

Current Arms talent-stage receipt0c12bcb9eafee951 now completes18,429 simulations /6,799,800
iterations and three stable refinement rounds:39/10/2, Overpower first, Slam + Hamstring, Battle,
no Heroic Strike on fixed blues. Two100k independent checks pass9.6015%/9.6232% combined
talent/APL gains against identical incumbent gear (572.9395→627.9505;572.9136→628.0461DPS).
Do not attribute that entire gain to talents alone or apply this rotation blindly to final gear.

New optional `node scripts/verify-simulator-talent-candidate.mjs --baseline=<file>
--talent-review=<file>` verifies the selected talent/APL in a real browser using its exact
archived native SHA, without rebuilding/mutating frozen engine inputs. Immutable browser
receipt27f8f91da13a3f9e matches625.2632721/UI625.26 at25/1337, including exact search/browser
context equality. These are integration checks, not the 100k gain measurement.

Driver3377/gear child9812/workers9824–9829 are the subsequent live stage of exec93636; recheck
actual liveness before reporting. Gear, actual-gear talent feedback, final browser/rotation
review and all remaining specs are NOT complete. No public defaults were changed.
All182 simulator tests pass with the new CLI argument regression; scoped lint/format and diff
whitespace pass. Gear pass1 completed11,939 real sims /1,563,040 iterations; pass2 is active.

SUBSEQUENT UPDATE: gear1a8354872ea4fb89 completed four passes /45,684 real sims /6,297,260
iterations, including two100k independent A/B ranges. Both pass:628.040879→797.047460 and
628.011386→797.030115DPS. Mean628.026132→797.038787 (+26.9117%) is equipment/enchant improvement
at fixed talents/APL, not the total talent+gear gain and not a comparison to a different engine.
Exact current pool coverage and gear legality independently PASS on new actual-gear baseline
5f4c98404dc4b18a (SHA5f4c98404dc4b18a450563df3db0b8028f0008973e467d63849d4f0212d54b4b).
Its temporary accessory choice is11815 +272437; do not label Frozen or Blackhand BiS by name
or use the old2% passive. Five historical IDs [22340,12927,12555,13098,11815] remain disclosed.

Same exec93636/driver3377 now runs actual-gear talent child16074/workers16086–16091 (241seeds,
450policies/two controls,25retained). Prior gear child9812 and all9824–9829 workers are terminal
after success, not stalled. Recheck actual liveness each turn. Full session has three completed
steps[talents,gear,feedback]; no final review/export. Accessory/close-contender head-to-head
checks on final gear are required before promotion; a validated challenger returns to feedback.
No source/catalog inputs changed during the running loop. All-class goal remains incomplete.

LATEST: actual-gear talents405730e27a298490 pass39/10/2 with HS≥90 at21,005 sims /7,256,000
iterations. Both100k ranges prove+0.6719%/+0.6729% over No-HS on SAME actual gear. Browser
receipt8f3e195f858d9ff3 matches815.9640981/UI815.96 at25/1337, not the high-iteration mean.
Gear7b8b2a15d2269546 converges unchanged; final talents1dd11f32f0ae0ca9 keep incumbent with
no proven gain. Fresh control screening correctly reuses cached real sims, not fabricated
zero-work evidence. Final browser0154b12ffaf31f98 and review71bc85c4f2716167 complete native3dde
conservative Arms feedback at reference802.4207629DPS /400k measurements. Final baseline37fd40….
Session4f201803 is closed-loop-reviewed; exec93636/driver3377 and ALL its children are terminal
after success. Do not resume it or treat a completed child as a stalled process.

Final accessory checks are separate before publication. New audit-simulator-accessories.mjs /
accessory-challengers.mjs reserve the shared workspace, validate closed current evidence and
screen all legal ordered pairs at2k/new disjoint RNG range, not EP-selected favorites. All
within four estimated SE get both100k confirmations; three SE improvement required in BOTH.
Controls are shared in one worker-pool batch. Uncertainty is explicit; no global-optimality,
statistical-equality or server-verification assertion is made. Significant winners re-enter
full feedback. Sources/DB/tree/catalog/native are pinned; interruptions/errors retain caches,
mark failure and release only the owned lock. Immutable results never overwrite old receipts.

188 tests and scoped lint/format/whitespace pass; real bank matches1,625 trinket/4,042 ring pairs.
Readiness negative rejects unfinished gear evidence without touching the live feedback lock.
Full new audit integration is NOT completed yet: exec56912/PID24515/workers24749–24754 are
currently screening trinkets under identity36945089a218c35191fce24584a2b3290bd13f17db7b67c4ecc537c50702f2e2.
Progressaccessory-audit-trinkets-71bc85c4f2716167.progress.json. Recheck actual liveness. Freeze
audit source/input files until terminal. Then rings/final rotation/export; current Arms proc
and Fury/remaining class cases still outstanding. No deployment or optimized public default.
5.1GiB free; cache2.1GiB, nothing deleted or archived.

## October 17 Manual Crowd Pummeler runtime correction (previous freeze)

Verified bug: already-eligible9449 had current ItemEffect98990 charges3/CD180000ms but registered
Forever runtime used30s/unlimited charges and all-attack haste. Isolated actual Go test failed.
Stopped old feedback exec84303/driver31738/session1946fe9d… with SIGTERM for this concrete bug:
sessioninterrupted/zero steps, all children/workers terminal, lock released. Do NOT resume it.
All cached computations and exact f59e binary are preserved, not blessed as new model evidence.

Owned manual-crowd-pummeler.mjs/Go helper/test now install through the SAME native/browser adapter.
Current raw snapshot/manifest/table hashes, item/link, unique ownership, on-use conditions,
charges/cooldown, aura319 payload/target/scaling and duration are checked. Model gives50% melee
speed/30s,180s CD, max3 uses per item/encounter and resets charges between independent iterations.
No ranged/resource haste is assigned. Classic retains its original30s/all-attack behavior.
Client-supported model, not an in-game server observation; aura semantics use the primary enum.

Original/fixed receipt staged-mcp/42937b7094c29600/review.json: old fails expected cooldown;
fixed passes Classic/Forever, charge/early-use limits, melee/ranged/expiry and encounter reset.
The initial test reset needed Cleanup; the corrected lifecycle passes.177 Node tests, scoped
ESLint/Prettier, strict TypeScript and full22-page build/installed Go checks pass.

LOCAL UIb17a877c7b8dc0b6ce96fa12/native5eafabc2a9f47cc6aab93e002517845a5829f6a448ac3bdacb962e8bdc284991.
DBaacaba…/2,591 items unchanged. Native is exactly archived. Browser proofmcp-browser-b6864d11c2d38029:
over25 simulations,300s old263/new50 item uses;600s old511/new75, real native/browser DPS agree.
Unchanged non-MCP Arms812.9482600 remains exact. Forced integration fixtures, NOT BiS results.
Five-profile catalog smoke passes, including new model tooltip and recovered item restrictions.
Fresh current control7304da1b8a8cf699/a853e1d5fdf4eb18 and warm start2b0ae4f0dddd214a are captured;
browser/native receipt8a4bf408a749287d again matches812.9482600/UI812.95. Current mana receipt
7c164627c5dc2557 passes all three cases. No optimizer is running yet; new priority below.
Public r15/engine5df1 is unchanged; no new commit/push/deployment/default promotion.

NEXT: current partial-effect reconciliation. Immutable read-only audititem-model-coverage-abb967aed3ba61d4.json
finds80 admitted current on-use items and135 historical references with raw effect links (23
historical on-use items). This is NOT runtime support approval or complete current item metadata.
Blackhand13965 has known1% passive crit +20s/300s5% owner-specific target crit use and a dummy aura;
Eye13968 has known1% spell crit +20s/300s7% spell hit use and a dummy aura. Their ItemSparse/
normalized records are missing; do NOT represent the Classic2% fallback as current or add known
passives twice. Unknown dummy behavior and base metadata remain explicit gaps. HoJ also has
partial links/missing metadata. Reconcile provenance/models before restarting a gear ranking.
Full goal remains active/incomplete;6.3GiB free. No old releases/cache/evidence removed.

## October 17 immutable control migration and current-catalog revalidation

New baseline-control.mjs binds current experiments to immutable content-addressed blue controls,
without overwriting either legacy canonical file. Talent search, feedback source fingerprints,
rotation audits and exports resolve the same control. Hash, DB/revision/spec/class/race/faction,
path and no-chain guards fail closed. New control/reference creation, inherited feedback refs,
old-evidence behavior and equipped item/enchant migration negatives are covered by five new tests.
Full Node suite174 and scoped ESLint/Prettier pass; canonical legacy byte hashes remain unchanged.

New Arms blue baseline58fc6a1f4c1c2bbc/controlc0cf3a3921dcaf96 and Fury blue2c64adc00641752b/
controlc982c62576a4fba0 were captured in the actual new browser. The capture CLI no longer accepts
--replace and normalizes known raid-recipe weapon consumes before capture. Earlier Furyc516/d38d
is a retained diagnostic, not the current non-raid control. No production defaults changed.

`pnpm simulator:prebis:refresh` revalidates unchanged equipped item/enchant data against exact
archived/current databases and current non-raid rules, then recaptures a current browser request.
It links the new immutable control and preserves parent lineage, NOT old optimization validity.
Arms conservative warm start572ee0202ddc31ca and browser/native receipt54a48c228d24894f pass:
812.9482600/UI812.95 at25/1337. This is context parity, not new100k optimality evidence.

INTERRUPTED feedback exec84303/driverPID31738, session1946fe9dc01af2b4e7b8d9c5d3d53ab89b2447353f75908c1d289a1687446d0b.
It ran six workers/241 legal seeds, initial Arms talent stage;100k disjoint
validation ranges/max6 rounds. Nativef59e/DBaacaba/UI3857. Algorithm64220fd362ada8febade319d0c6ce78ec35ab0ae94b1fe6e4ff4fe8c387ac8c3;
47 frozen inputs. The verified MCP bug caused its deliberate interruption; it is terminal and
must not be resumed. New model/control identity is required, then final independent rotation
audit/export, explicit-proc Arms and remaining cases sequentially. Goal remains active.
The first451-policy/two-control rotation screen completed and retained26 variants. New cache
namespaceb7545a20cc816c649d8e4887fe0d6248e5beca899522bac7992febdb958b0475 had1,413 jobs /
1,157,500 iterations at the measured snapshot; NOT final evidence. Talent child31959 and six
native workers32179–32184 were live at that checkpoint, and are now terminal. Nativef59e archive hash is verified; all four old reviewed
Warrior inputs still load their original controls through the new resolver.

## October 17 current-item recovery and provenance admission

LOCAL UI3857bbcbda4b436714931a96 now contains2,591 items:1,954 current-stat and637 unchanged
historical Classic-stat references. Nativef59e2df32f80ccdfb6aac7214c4698a378ba443f51f39111013ec1bc9b353615;
databaseaacabaeeb0be7bd8b241373d5372f3ad3a86cbef6d2af69e80f2e2b868523048. Public r15/engine5df1
was rechecked and remains2,565 items; no new deployment or optimized default promotion occurred.

The26 reviewed records are now owned in current-prebis-equipment.json and admitted through a
guarded shared raw-evidence loader/pure merge. Historical stats never overwrite current data.
All snapshot/table/rating/compiler/reference hashes are checked; changed acquisition, existing
conflicting items, raid sources or unknown IDs fail closed. IDs9394/9419/18760 remain blocked.
Build/native/browser data agree exactly, including all26 gameplay objects/current metadata.

Current stat provenance and provisional historical acquisition are separately retained through
tooltip/search, candidate eligibility, gear review, independent review and portable export.
Four Rogue PvP items retain current class/unique/set metadata; historical faction access is an
explicit unverified model, not a claimed client wearer restriction. Raw PvP rank indices remain
raw, not displayed ranks. Cape CC, Gouge utility and unsupported D1 procs stay disclosed/unmodeled.

Reproduce `pnpm simulator:prebis:verify-current`: receiptcurrent-prebis-browser-6610123df8eac186
validates raw inputs, compiled identity and real browser/native Rogue/Warlock/Hunter combat.
`node scripts/smoke-simulator-catalog.mjs` additionally passes five profiles, search/tooltip,
equip/reload/combat, one-time reward ownership and incompatible faction rejection. Initial harness
slot typos were corrected (Wrist label,23313 is Shoulders); the complete rerun passes.
Mana integration verifier also passes with this engine/catalog, receipt04bcf7322baa2cd5, all three
fixtures versus exact archived62fe requests. These are integration checks, NOT BiS recommendations.
169 Node tests, strict TypeScript, scoped ESLint/Prettier, diff whitespace and build manifest checks
pass. Old binaries/UI/DB/exports remain preserved. No optimizer is running;6.5GiB remains free.

NEXT: immutable versioned blue controls are now implemented and affected-case revalidation is
running above. Existing canonical blue filenames contain old DB hashes; never overwrite them
to make new checks pass. The full all-class
goal remains active/incomplete. Actual new eligibility is20 recovered IDs per archived Warrior
case, and all four old coverage checks correctly return false. Rogue-only PvP does not leak
into Warrior candidates. No commit/push/new deploy was performed.

## October 17 earlier model integration (superseded local build)

Three reviewed five-piece mana procs are now installed in the LOCAL native/browser builders:
Magister181, Devout182, Beaststalker186. Support reporting and actual dispatch both recognize
only these three models; the other six unsupported D1 procs remain disabled. Native5f67aa508b8263496307c4f636d9d6b586c61d9afbc6ddbde83e9f26f3465b23;
local UI45fc7e86c7768fbd7b4a08a2,22 pages. DBb11f…/2,565 items unchanged;26 recovered items
remained staged at that checkpoint; the newer local recovery above supersedes it. No production
deployment/default promotion. Old62fe binary archived exactly;
old UI/data/exports retained. Closed Arms cases below are62fe-specific, not fresh5f67 results.

Real browser proof27455b6a7d86c7a4 covers all three five-piece fixtures: native/browser DPS
matches at25/1337 and actual mana recovery is positive, versusZERO in archived62fe for the
same requests. Fixture item/enchant equality, DB equality, revision and verifier hash are
checked. These are integration fixtures, not optimized BiS/DPS-gain claims. Reproduce with
`pnpm simulator:prebis:verify-dungeon-mana`.162 Node tests/10 focused tests pass; installed
Go core/common checks, scoped ESLint/Prettier/gofmt and full22-page browser build pass.
Initial parallel Go diagnostic collided with generated enchant writes; sequential rerun after
build passes. Serialize direct Go tests/source-generation builds to avoid that diagnostic race.

Post-integration isolated original/fixed proof7c08e0f408a15871 passes and still leaves active
inputs untouched. It now covers both dispatch and support-query files; pre-integration017423…,
1bdb… and older receipts are preserved. New feedback fingerprint includes42 source/data inputs.
Unchanged Arms25/1337 smoke812.9482600 is NOT fresh100k optimization evidence. Data recovery
and affected-case revalidation are next; all-class goal remains active/incomplete.6.7GiB free.

## October 17 archived reviewed build exports

LATEST: conservative Arms feedback6dea2e63d16aba70, final450-policy audit91086cea65cefad7 and
exporta2d3a980b135f4c6 are COMPLETE on native62fe/current recipe70425.805.8479651 modeled DPS /
400k disjoint iterations;39/10/2, overpower-first, Heroic Strike≥90, Slam+Hamstring, Battle.
Baseline3939cd5c21bb1896, gearf80d4c745a0d8b04, closing talents5af8c8760fecb771,
browser0e5ebbc83707bb82 (812.9482600/UI812.95). Rejected selection-stage808.30/pants237819:
no independently established gain, so kept previous gear/pants237825. Six historical items
remain provisional. Export replays unchanged; local reviewed case, no public promotion.

PROC ARMS ALSO COMPLETE: feedback934449847cdffa59, all451-policy audit2d84c16042b49842,
portable exportdaa3c5e00130f01e.826.3643075 modeled DPS/400k disjoint iterations,39/10/2,
same overpower-first/HS≥90/Slam+Hamstring/Battle. Baselineb0f05768fb4f2bbf, gear78d2322132465931,
closing talents2e8d0b1e737f37b5, browser71ccfa1e96cd839f (827.6142760/UI827.61). Export requires
explicit provisional opt-in and retains six historical items. SHA5ffe8a36baa6a9c385077eab68f6854d12f897dd86f233e4b9e26c341bd91f13;
replay succeeds, settings exact, no private paths/native request. No public promotion.

Feedback session887efa7dc106c54f… is closed-loop-reviewed.39407/driver4272/children4345/15547/
33742/workers33754–33759, final audit49689/59266 and export60379 are TERMINAL; do not restart.
Algorithm98cfe6d6…/native62fe/catalogb11f/UI23e8 and37 inputs stayed unchanged through closure.
Old75555/62789/90074/70251, audit41345 and exports74249/15372 are also terminal.
The reviewed staged D1/current-item integrations can now proceed in new versions; old evidence
must be preserved and affected cases rerun, never relabelled as current coverage. The all-class
goal is incomplete;23 named damage cases plus Shockadin/other supported good hybrids remain.

Proc talent report7fc3b4f9f6e1ec8a has finished17,662 jobs/6,730,100 iterations. Both100k
holdouts reject the screening winner213252… (825.8630→825.3907 /825.8928→825.5721); actual
selection keeps303252… /39/10/2.
Do not confuse the printed screening winner with the independently selected incumbent.

Gear78d2322132465931 is now converged/independently accepted:825.5363→826.2631 and
825.4975→826.3064 on two100k ranges, mean826.2847237. Changes: head enchant1506→2543,
waist19044→20041, pants237825→237819. Same six historical provisional items; explicit
Crusader scenario, not conservative. Closing actual-gear talents2e8d… completed23,607 jobs/
7,869,300 iterations; both100k checks reject the utility-point screening swap303152…:
826.3356→826.2446 /826.5522→826.6223. Final audit retains the exact incumbent on both100k
ranges826.6339/826.2004. All closing review/export work is now complete for this frozen case.
The D1 mana staging guard additionally pins exact targeting and every resolved scaling/
coefficient field on proc and energize payloads. New regression failed before/pass after;
real70425 validation and original/fixed Go checks pass. Current staged receipt1bdb498b89c30906
replacesce343… for future integration; old evidence is preserved and active inputs unchanged.
All158 simulator tests, scoped ESLint/Prettier and diff whitespace checks pass.2.7GiB free;
no generated measurement caches or user data removed.

Set548 review3c01e421bac195c8 now proves current2pc40 AP/40 RAP and6pc20 Stamina match the
executed registered callbacks, exactly once and never below threshold. New owned Go regression
current-prebis-sets_test.go passes seven0–6-piece fixtures via overlay, leaving active engine/
data untouched. Four-piece Gouge cooldown remains an explicit unmodeled utility/no-op, not a
fabricated damage stat or complete PvP model. Candidate23298/23313 stay staged and Rogue-only;
historical vendor/faction access remains unverified. No current catalog admission or new spec
optimization was started. Receipt/command/source hashes are recorded under staged-current-prebis.

Historical PvP source review542b9d68eaddb39b independently confirms faction grouping in installed
AtlasLoot Classic:22879/23258 Horde,23298/23313 Alliance, matched to pinned vendor records.
Keep that access provisional. Preserve current class8/proto6, Horde set0/Alliance548 and raw
RequiredPVPRank indices; do not display raw12/14 as player-facing rank requirements or restore
old set522. No catalog admission or active input changed. Screening303152… was subsequently
rejected by independent checks; retain303252… /39/10/2 instead.

Extended-catalog/MythicSim request rechecked: public HTTPS still has2,565 items,637 provisional
Classic references/all14 types; HoJ/Blackhand present and sampled raid IDs absent. Four live
bounded source GETs pass current-tree validation with unchanged talent allocations/source
engine; source bytes differ but pinned evidence is preserved. Cached replay and10 focused
tests pass. Four attributed examples remain local search seeds, not newly deployed defaults.

Historical recovery notes follow; their older running-status statements are superseded above.

LATEST CATALOG STAGING: current-prebis-92fe9f39504a09ce now stages26 rather than25 records.
Silky Spider Cape10776 was unnecessarily grouped with unresolved damage/on-use effects. Its
checksummed ItemEffect233785→spell1293819 is only passive root/snare-duration reduction. Exact
links, passive trigger, absence of conditions/proc options and both static self-targeted-7%
modifier payloads are checked.10 Stamina/30 armor are normalized; the utility is retained as
unmodeled metadata with a stationary/no-control-effects scope, never damage stats. Missing or
changed evidence still fails closed, and9394/9419/18760 stay blocked. Not active admission.
Two red/green regressions,12 staging tests and157 total tests pass. Actual CLI/replay passes;
all25 older candidate/provenance objects are unchanged. Independent compiler parity15709babc53c4dd5
matches all26 UI item objects. Frozen37 inputs/native62fe/database/UI/public release unchanged.

CURRENT ENGINE CORRECTION: inherited Flame Wrath11809 retaliated against self-inflicted damage,
then against its own reflected damage, endlessly. One-iteration seed1337 passed; the exact80-
iteration trial stalled. A SIGQUIT stack showed repeated `item_effects.go:1068/1083` shield casts
and roughly1.8 million recursive frames.147 other two-hand candidates completed normally.

`item-effects-adapter.mjs` adds a source-unit guard to that one item callback, retaining landed
enemy-hit reflection. Native and browser preparation both install the same guarded/idempotent
patch. A dedicated Go regression prevents runaway recursion in its old-code failure, rejects
self/missed hits and confirms one retaliation for a landed enemy hit. It failed on the original
in BOTH Classic/Forever rulesets and passes corrected.133 Node tests pass. New native62fe851b…
completes the exact80-iteration reproducer at676.7153284 DPS, receipt7bff86b5475f3f74. Timeouts now
identify the job and item IDs without logging requests or private data.

Old native3dad4336014e… is archived as `optimization/native-engines/kfc-prebis-<full-sha>`;
all old measurement caches are retained. Native identity changes require fresh current-engine
validation, not relabelling old numbers. Browser rebuild91336/PID13308 COMPLETED: active local
UI23e8cccb25de7635d64ebdaa, same2,565-item database. Actual browser80-iteration receipt
7f16f25ae805173c matches native676.7153284 /UI676.72. Three no-Flame-Wrath cases match old/new
DPS and stdev exactly at25/1337 (receipt d65dcda28bd4dd69); that smoke proof does not replace
100k optimization validation. Old feedback77278/d239… is FAILED and all children are terminal.
Never treat its checkpoint as converged gear. Corrected feedback81764 /driver33085 subsequently
FAILED at a separate enchant-recipe ambiguity (below). Initial talent report9d9b58b1a93dcf34 completed18,429 jobs /
6,799,800 iterations and retains39/10/2. Same blue gear572.8192→628.1005 /572.9685→627.9475,
two independent100k ranges. Replacement feedback75555 /driver62789 completed initial gear
f67713e0341799fc in three passes,627.7810→800.6746 /627.8869→800.6847 on two100k ranges.
Mean800.6796804 is gear-stage evidence, not a final recommendation. Actual-gear talent pass
1619449f6450e801 completed19,666 jobs/6,984,400 iterations. Same39/10/2, but Heroic Strike≥90
validates800.5882→805.8693 /800.8100→805.8507 at100k twice. Driver75555/62789 is now sweeping
gear again in child90074, checkpointf80d4c745a0d8b04; not complete. Statecf635d56e3e8d5df…,
algorithm98cfe6d6f0ddfd07…. Preserve its37 frozen inputs.155 Node tests,
Go red/green regressions, scoped checks and22-page local build pass. Public r15
has NOT been redeployed by this correction. See `context.md` for the current handles/state.

TWO-HAND ENCHANT RECIPE ALIASES: effect241 has both Minor Impact7745 and Lesser Striking13503.
Both fit a two-hand weapon, so the old exact-one-match optimizer evidence guard crashed. This
also affects943/1897 alias groups. `describePrebisGear` now checks compatible non-raid acquisition
first, requires identical confidence/payload across matches, and records one stable canonical
recipe plus all matching recipeKeys. Stats/effects count once. Hand/class restrictions and proc
policy are unchanged; conflicting payloads/status still fail closed. Two regression tests fail
before/pass after; all163 actual checkpoint enchant cases and145 total tests pass. Failed
checkpointb153ec22943d7c59 is retained, not accepted. Replacement75555 reused completed talent
report9d9b… unchanged and existing native measurements, then passed enchant14. Native62fe, item
database b11f… and local/public UI are unchanged; no new native/browser build was needed.

ARMS PROC SCENARIO: the old Fury-only capture command assumed two occupied weapon slots. It now
uses tested `provisionalWarriorWeaponSettings` for Fury dual wield or Arms two-hand/empty off-hand.
Real weapon compatibility and explicit provisional policy are checked; invalid/already-enabled
policies fail, and no off-hand or static100 Strength is fabricated. Capture removes inherited
gear/rotation convergence links and records the exact parent baseline. Five new regressions pass;
all150 simulator tests and scoped lint/format pass. Actual Arms capture75a3bc4ec5ca3f1b and
browser/native proofb2e89afd22e22fd3 match818.4139441 /818.41 at25/1337 on native62fe/UI23e8.
This is only parity and an explicit opt-in seed. Conservative feedback75555 remains the sole
optimization run; finish it before the separate proc feedback. Frozen37 inputs remain unchanged.

D1 MANA DISPATCH STAGED, NOT ACTIVE: generated set definitions override all manual bonuses,
including valid five-piece callbacks. Isolated `dungeon-set-mana.go` plus a guarded dispatch
adapter restores only Magister181/Devout182/Beaststalker186 five-piece models. The70425 client
has exact5%/200-mana payloads; effect/option/set rows, handler source and checksums are verified
before testing. No blanket fallback enables unknown scripts or double-counts flat bonuses.
`pnpm simulator:prebis:stage-dungeon-mana` creates Go overlays under artifacts, NEVER writes
the active upstream source/binary/database/UI. Original-source test fails in all six5/6-piece
cases; corrected overlay passes actual resource recovery, accepted/rejected event types,
four-piece controls and duplicate-bonus checks. Adjacent core set tests pass with that overlay.
Receipt `staged-dungeon-mana/ce34347abbcc95bb/review.json` replays unchanged after checking staged
source/overlay/log hashes. Timing-bearing logs are content-addressed, not compared to new wall
times.155 Node tests and scoped checks pass. Integration/native-browser parity and affected
optimization reruns remain required after the live frozen experiment. Other six D1 procs remain
gated; ProcChance100 in scripted client records is NOT a verified100% proc rate.

CURRENT-ITEM STAGING: `pnpm simulator:prebis:stage-current` adds no active equipment. It verifies
the70425 snapshot, raw ItemSparse, unchanged level60 rating coefficients and every pinned
historical source record before staging25 missing current-value items. Reportf9bdd2cd8fee8a90
under `optimization/staged-current-prebis/` is immutable and explicitly not admitted. All25 item
objects match the existing Python engine compiler exactly (receipt9c1bb17eef23b3e7 against the
identical item values in prior079198…). Three effects plus18760 HealthRegen stay blocked.
Class masks/current sets/weapon hands/unique limits are preserved; vendor faction and set runtime
remain review gates. Actual repeated CLI use caught preset-only acquisition's optional
`historicalSources: undefined`: JSON omitted it and replay failed. Conditional omission plus a
failing-before/passing-after round-trip test fixes replay; ten staging tests and143 total pass.
No live driver input or public/native/browser catalog changed. See `docs/simulator-catalog-coverage.md`.

PREVIOUS ENGINE: both Alliance Fury cases completed against active recipe audit70425. Conservative
853.3332 DPS / 400k: receipt 50e934c2c10f5eb1, audit a7e4a531dc15fd21, export b2714b7d3ca2e43f.
Explicit provisional procs 872.5248 / 400k: receipt 4f4cc4d9d75fcca4, audit d692820be35ccfa8,
export a2ca6ee18e6c7ee6. Both retain 19/31/1 and exact incumbent APL. All former 48315/90009/
28978 processes are terminal. Current recipe guard removes three unused waist candidates only;
old 70291 guard is archived exactly. Previously tested supersets remain valid when acquisition
tightens; new untested candidates, illegal winners, invalid IDs and skipped enchants still fail.
Actual reviewed cases pass these current checks without recomputing unchanged combat inputs.

Arms now has a separate fixed-blue control and actual native/browser parity, NOT an optimized
recommendation: `baselines/warrior-arms-alliance-blue.json`, proof f56e02bebbb2949c (570.277235 /
570.28 at 25/1337). Blue PvP core, Arcanite Reaper, no off-hand, current craft audit, distinct
professions, zero paid stats/rage/free Tier 1 and known non-raid weapon consumes. Capture CLI
accepts `--spec=warrior/arms`; verifier accepts both warrior variants. Arms policy and feedback/
audit/export adapters are now implemented, but actual Arms optimization/review remains pending.
Initial talent stage379987245a573450 is now COMPLETE:16,550 new jobs/5,409,300 iterations,
39/10/2, same blue gear573.1161→627.8911 /572.9106→627.7543 on two independent100k A/B ranges.
This is not final pre-BiS. Its89228/PID79099 workers are terminal. Feedback driver77278/PID96012
subsequently failed at Flame Wrath; read the engine-recovery block above before restarting.
241 legal seeds,451 policies on0/2 Slam controls,26 retained. Actual probe
d5e24d907eaca962 validates/executes 1,804 policy/control cases with zero warnings and verifies
that an intentionally unavailable spell does trigger a warning. No new combat engine binary.
Arms without Spearing Strike removes its action; absent Bloodthrill conditions become false,
including beneath negation. Final-policy coverage resolves/deduplicates actual talent actions.

Talent report writes are now immutable and exact completed reruns verify/reuse original evidence
rather than overwriting measured counters with zero/cache-only run totals. Identity includes the
native binary, algorithm and baseline; the algorithm includes the complete fixed control used
for talent seeds and policy screening. Former 77335/PID71475 was intentionally stopped before
completion to add this identity guard; its completed measurements remain cached. Actual completed
Arms replay now passes: serialized report SHA81d44149… and original counters stay exactly unchanged,
with no new talent simulations. No Fury case was recomputed or invalidated by the adaptation;
both real exports remain exactly b2714b7d3ca2e43f /a2ca6ee18e6c7ee6. Full suite130 passing, scoped
checks, live all-slot catalog check and cached four-example MythicSim import pass.

Further coverage audit0902bab96c450e2f finds29 current-stat records absent from the simulator despite
historical non-raid acquisition evidence. These must use current values, not bypass the Classic
fallback guard.26 effect-free;3 current ItemEffect payloads need review;18760 contains unsupported
HealthRegen. ItemEffect row IDs must be resolved to SpellID before spell lookup. Raw current
wearer/unique/set metadata is available for all29, including four Rogue-only legacy PvP pieces
and a main-hand-only weapon. The audit has NOT changed the running database or engine. Required
admission and affected-case revalidation are in `docs/simulator-catalog-coverage.md`.
Read the current-state block in `context.md`; older running-status paragraphs below are history.

`pnpm simulator:prebis:export --feedback-review=<final-review.json>
--rotation-review=<final-audit.json>` now packages one completed Fury case without requiring all
23 prototype profiles. It reconstructs the linked feedback receipt, requires the final rotation
audit and 100k-per-range validation, checks current eligibility/enchants/consumes/tree/database/
native binary, and preserves provisional warnings and full benchmark settings. Local evidence
paths and opaque native requests are omitted. It does not publish presets or touch saved builds.
Actual conservative output `reviewed-builds/warrior-fury-523f78e38367229c.json` was created and
then verified unchanged on repeat. Legal identical historical rings are supported; exported
provenance IDs are deduplicated without changing equipped items. Full Node suite 115 passing.
Proc gear bf4fc67991a11b6e subsequently converged and validated 871.96→872.58 modeled DPS;
only neck changed to Mark of Fordring. Current 48315 child 25641 is doing talent/APL feedback
on baseline feae9b0c38fccffa. Old gear child 2372 is terminal. No active hashed driver/model
inputs changed. See `context.md` before restarting anything.

Fresh recipe snapshot 70425 is extracted and validated separately; staged audit is
`artifacts/forever-simulator/craft-acquisition-70425.json` (1,153 reviewed / 45 raid-dependent /
3 unresolved). The three new unresolved utility recipes reference missing ItemSparse records
(their base Item IDs exist);
their raw recipe/reagent rows still exist. All other catalog recipe input lists and all selected
Fury craft inputs match 70291. `simulator:prebis:audit-crafts` now accepts explicit `--snapshot`
and immutable staged `--output`; it rejects replacing the active audit from another snapshot.
The 70291 input stayed unchanged until the live driver finished; 70425 is now active. The generic normalizer's
zero stat/effect output is NOT a replacement for the separate 70425 mechanics data. Full Node
suite now 116 passing; acquisition CLI staging/invalid-argument regressions pass.

## October 16 all-slot pre-raid catalog release r15

Validation correction: older optimizer verdicts below are superseded, not published proof.
The Go engine uses seed + iteration; legacy talent validation overlapped finalist selection,
and four distinct final starts covered only 71,826 unique seeds across 80k recorded iterations.
`simulation-seeds.mjs` now assigns experiment-derived disjoint stage/check ranges; current gates
reject actual old reports until rerun. Native large-int64 seed reproducibility passes. New driver
46850 subsequently completed the corrected loop: receipt 2fe6c2e3b56ba5f1, 853.32 DPS / 80k
genuinely disjoint iterations. Higher-precision driver 88372 subsequently completed too:
d3ac43f7e5c96d5f, 853.33 DPS / 400k disjoint iterations; browser parity and 100k all-225 rotation
audit 145022ad… pass, exact incumbent retained. The separate provisional-weapon-enchant case
now runs at 100k in session 48315; it is not a public or server-verified recommendation.
Old 53634 was deliberately interrupted and all its processes exited. All 108 Node tests and
scoped lint pass. Native serial/parallel parity and actual completed-session replay pass too.
Precision is checked for both talent and gear evidence; independent ranges use one bounded
worker-pool batch, preserving cache IDs/deduplication. Preserve
archived measurements/cache; no old optimizer result was published and no deployment changed.

Read-only client proc audit now documented in `docs/simulator-proc-enchant-evidence.md`:
payloads/durations are supported by checksummed build-70425 rows, but modeled PPM, trigger
eligibility and dual-wield behavior are not thereby verified. Crusader's extra passive 458112
has conditional trigger metadata; do not turn its 100% field into an every-swing proc model.
No combat code or public opt-in changed. Active 48315 calculation continues on its original
hashed inputs. Initial talent evidence eb1c969168e41f5c is complete (12,157 jobs / 4,009,200
iterations): independent 100k checks find no proven gain and keep exact 19/31/1. Gear child
2372 is now active; no gear convergence or public-preset promotion is claimed.

Subsequent local calculation work: fixed all-blue Fury baseline now matches browser/native exactly;
first 19/32/0 talent result is independently validated, but not final/promoted. The first gear result
was rejected: duplicate one-time Blackhand rewards plus Naxx shoulder/AQ glove enchants. Ownership
and raid-enchant guards now reject it (including through the actual feedback importer); tests
preserve legal identical non-unique rings and distinguish enchant spell IDs sharing one effect.
Corrected search `warrior-fury-e471584151ba6667-gear.json` converged and passed two independent
20k seeds (637.40→854.07, 637.64→853.99). It uses one Blackhand + HoJ and non-raid enchants.
This is gear-stage evidence, NOT final talent/gear feedback or a published recommendation.
The strict 45-item raid-material crafting exclusion remains active. See next steps in `context.md`.
Real browser ownership regression passes, and actual-gear native/browser parity passes at
25 iterations/1337 (848.7672714203109 / 848.77 displayed). The 225-policy talent feedback pass
completed: same 19/32/0 with early Rend, independently 853.93→857.56 / 853.59→857.45 on that gear.
That gear recheck subsequently retained the incumbent. Latest local UI release
`7eb089633ade2f02ad73c3f9` passes browser ownership/parity, 78 tests, lint, types and build.
Public r15 remains unchanged; Horde-only results cannot become Alliance defaults.
See `context.md` for exact processes/artifacts and next verification steps.

Subsequent continuation closed the original Horde loop: gear unchanged, final talent/APL pass
retains exact incumbent, real browser parity passes, and linked four-seed review reports 857.67
DPS across 80k iterations. This is the original full-consumable case: inherited Elemental
Sharpening Stones require an MC recipe, so it is not an all-inputs-no-raids claim. Separate
Alliance/Human Dense-stone talent pass and first gear search validated (620.26→845.24 DPS),
selecting a different weapon/trinket combination. Actual-gear talent feedback then validated
19/31/1 with Improved Bloodrage (846.81 / 847.16 on independent 20k seeds). Expanded gear recheck
a500ea… converged through three passes and validates 846.87→853.71 mean DPS; its full current
pool/enchant coverage passed the older audit; later 21f2c3…/9e8c9d… rechecks supply fresh validation.
Corrected 20k/100k feedback completed through 46850/88372; active provisional case is 48315
on the new explicit-proc baseline 2e5a473c…. These are still local, not published recommendations.
Native Crusader sensitivity improves both validation seeds but retains explicit provisional
proc uncertainty; full proc-aware feedback is still required. Public opt-in remains unchanged.
Shared acquisition context also fixes Maiden's Circle being mislabelled PvP; current client
stats are retained and historical pre-raid source evidence stays separate. The coverage audit
also removed the item-level floor/accessory EP cutoff and added deterministic scripted haste/
weapon-damage enchants plus all per-slot set subsets; the MC scope formula stays excluded.
Older restricted flat-enchant results are conditional references, not unrestricted maximums.
Explicit provisional models require actual browser opt-in and retain their uncertainty labels.
Added a resumable Fury feedback driver with actual item/enchant coverage checks: narrow older
reports are reoptimized, not treated as finished. It requires immutable linked evidence, fresh
native-binary identity, actual browser parity and the four-seed audit; no automatic publication.
Latest Node suite: 108 passing. Read active session IDs in `context.md`; no new production deployment occurred.
The public r15 defaults remain unchanged. Never treat screening DPS or a prototype artifact as
published, converged BiS; finish gear→talents/APL→gear feedback and browser validation first.

- Live `kfc-helper-simulator-prebis-20261016-r15`, build `mrHKZCVJebJBWwyjWNUdm`, engine
  `5df1a1d37d43e95fa440c1b5`. 2,565 selectable items = 1,928 current + 637 provisional Classic.
  Covers all 14 equipment types. No new raid loot; unknown acquisition, raid reputation/vendors,
  raid world bosses and unresolved variants fail closed. Current Forever IDs always win.
- `classic-prebis-equipment.json` retains 839 pinned historical source records and evidence;
  `classic-acquisition.mjs` revalidates every new import. Historical stats, procs and set effects
  are not represented as verified Forever data. MIT notice preserved.
- Do not add new fields/provenance enums to immutable manifests without updating the strict web
  reader: the old reader correctly rejected the mixed-source manifest during local testing. New
  reader accepts historical releases and reconciles optional current/provisional counts. Rebuilt
  only scoped r13-baseline web/package sources. No optimizer results/talent changes published.
- First-open defaults no longer enable a free Tier 1 bonus. Existing custom saves remain exact.
- Passed 51 Node / 44 data / 237 web tests, Go checks, lint/types/Linux build, 3,488 asset hashes,
  15 real-combat profiles, old combat parity and full responsive workspace tests. Linux/public
  picker smoke includes Truestrike, Felstriker, HoJ/BHB, caster trinkets and a Druid relic, equip,
  provenance, saved reload and real combat. Public all-profile first-open/reload checks pass.
- Hydration-race smoke must hold only one required parent script, not every Next chunk/CSS:
  blocking everything starves same-origin iframe assets in the HTTP/1 preflight. Before hydration,
  assert initialized DOM attachment, then complete load; actual visibility is asserted after hydration.
- Only Helper web changed PID to 3094851/restarts 114; all workers/ingest/guild PIDs preserved.
  Receipt: r15 `simulator-workspace-deployment.json`; rollback manifest stored alongside it.
  Rollback r13 is compatible with the live leveling v3 reader. Stale r14 was never activated.
  No Git commit/push requested.
- MythicSim follow-up is imported locally as four reference talent seeds (Fury, Arms, Shockadin,
  Survival), not published defaults. See `infra/simulator/reference-builds.json` and
  `docs/simulator-reference-builds.md`. Strict field/rank/51-point/tree-hash checks pass. Source
  equipment and enchants remain reference-only because each set has non-admitted IDs; foreign
  rotations and published DPS are not imported. No extra raid items or engine sync was performed.

## October 16 simulator loading, defaults, tank talents and r13 deployment

- Live release `kfc-helper-simulator-defaults-20261016-r13`, build `Okduac8sM7yer2b5g0VFZ`,
  engine `9b66034db413bba9d6cb8139`. r12 first shipped workspace/tooltips/enchants. No new Git
  commit/push was requested. Only Helper web restarted; guild site and all workers stayed unchanged.
- The iframe can finish before React hydration. Poll actual same-origin/profile readiness in
  addition to listening for load. Individual engines signal when initial gear/talents finish;
  Raid must not receive that individual-only flag. Add a 30-second Reload engine recovery action.
- First visits persist a usable loadout. Recover legacy all-empty equipment once, backing up
  exact JSON under `<settingsKey>_kfc-starter-initialized-v1_backup`. Shared links override defaults;
  nonempty custom characters, removed enchants and later deliberate empty builds remain intact.
- Warrior starter: 8/5/38, full Defiance, no Unbridled Wrath. Bear: 0/41/10, full Feral Instinct,
  no Balance point. Build checks validate actual tree ranks, prerequisites, tiers and 51-point totals.
- Removed Model & tools and outbound promotional/source links. Options/import/export and bundled
  MIT/OFL licenses remain. Existing personal talent choices are not overwritten by preset changes.
- Bounded pull-based asset streaming prevents enqueue/close after cancellation. No per-request
  whole-WASM buffering. 32 aborted large downloads completed without `ERR_INVALID_STATE`;
  Next still emits its separate destination-closed-early log for deliberately aborted transfers.
- Verification passed: 237 web tests, 38 simulator Node tests, lint/typecheck, Linux production
  build, 3,485 asset hashes, all 15 real combat profiles and full workspace checks. Public HTTPS
  and Linux preflight pass hydration/retry and all-profile default/saved-build preservation tests.
- Follow-up accessory audit keeps pre-raid starters (user confirmed), fixes role-inappropriate
  DPS trinkets and reviews rings. Classic IDs are retained in `infra/simulator/classic-accessory-worklist.json`;
  missing extracted records do not prove removal and do not authorize old stats as confirmed data.

Accessory follow-up: candidate r14 / engine `8563438e2a68f0802bc6a190` is staged, NOT live.
43 Node tests pass; extended browser checks were still running when the user asked to reconsider
Frozen Heart. It is a verified starter fallback, not a BiS result. Classic candidates currently
contain IDs/names only. Hold activation pending the verified-only versus provisional-Classic
comparison decision; do not imply those missing items were simulated or proven removed.

## October 16 default preset enchants

- Local release `fba685b35451678279ffa37e` (3,485 files / 1,927 real-source items) adds
  role-appropriate enchants to every supplied non-empty default: 28 lists, 15 profiles,
  265 assignments. This was local at its original receipt and subsequently shipped through r12/r13.
- Enchants are written into supplied preset JSON during preparation, not filled at runtime.
  Existing saved builds stay exact. Load a named gear set to adopt the new default enchants.
- The adapter uses actual item types and compatible application variants, including shields,
  two-handers and Hunter-only ranged scopes. No provisional proc, unknown effect, wrong school,
  fake Classic fallback or wearer-profession requirement is silently added.
- Manifest `kfc-default-enchants.json` publishes choices/evidence; tank gear-only stats stay
  separate from enchant bonuses. Guide: `docs/simulator-default-enchants.md`.
- Go tests load all 28 specs and match their static enchant totals to UI metadata. The browser
  parity check removes only enchants for comparison with the existing twelve-profile golden
  baseline; it never rewrites that baseline to conceal a changed formula.
- The expanded rows exposed gear previews obstructing the enchant picker, including its own
  mini gear rail. Previews are now click-through; long content remains available in the native
  details dialog. Also restrict inspection to the active modal/dialog and clean up on shown.
  Browser regressions cover outside hover and deliberately hover the rail before candidate clicks.
- Final verification passed: 34 Node tests, all 28 real-spec Go legality/stat-total checks,
  strict TS/Vite/WASM build, cached release SHA verification and both complete browser suites.
  All 15 combat profiles, all named gear presets, both faction variants, custom saved empty
  enchants and twelve exact unenchanted golden scenarios pass. Context/documentation updated.

## October 16 local item tooltips and source-audited enchants

- Prior release `4a30cdef5ca4a6f1da3935ca` (3,484 files / 1,927 items) was local, not deployed.
  Full receipt: `docs/simulator-item-tooltips-enchants-plan.md`. No commit/push was requested.
- Replaced the missing external renderer with safe local stat previews. Added visible Add/Change
  enchants, searchable effects, No enchant, source/model labels and explicit provisional opt-in.
  Current set counts/suffixes are instance-aware; client effect references do not imply simulation.
- Audited 182 choice records and corrected 39 static payloads from SHA-pinned build-70425 tables.
  Minor Agility/Stamina now give +3. Legacy health/mana names may now correspond to stamina/intellect;
  do not trust names or `assets/enchants/descriptions.json` over resolved current-client payloads.
  Ranged-only scope hit stays in its Go handler, never generic melee/spell hit. Unverified or
  unsupported effects are not silently treated as working; no Classic fallback was reopened.
- New controls initially queried the DB during empty-slot construction before it was ready.
  Guarding that startup path was verified in real browsers. Virtual row height and CSS agree;
  details dialogs remain inside the active Bootstrap modal to preserve focus and Escape handling.
- The inherited `TypedEvent.freezeAllAndDo` logs/swallow errors. Validate saved/raid equipment
  before that batch so an unknown enchant reaches the recovery alert. Original saved JSON is
  backed up under `<settingsKey>_enchant_recovery` and downloadable without being stripped.
- Compatibility is checked in TS and Go, including normal gear, item swaps, imports and simulations.
  Stats and hover text share the same reviewed payloads. Provisional consent resets on reload;
  gear IDs survive and the user is told to opt in again before running an unverified proc model.
- Verified 29 Node tests, focused Go parity/legality/set tests, strict TS/Vite/WASM build, all 15
  combat profiles and dedicated Playwright flows (including exact backup/download, illegal/provisional
  activation, shield/two-hand positives, five widths, native details, iframe visible bounds/scroll).
  Existing workspace regression suite retains twelve exact golden combat requests/results and
  covers tank starters, imports/exports, Raid, fullscreen, parent dismissal and worker recovery.
- Tank/DPS recommendation research: `docs/simulator-enchant-priorities.md`. No new automatic
  recommendation/paid-enchant application or changed starter weights. Guide priorities shortlist
  candidates; claiming best requires scenario-aware full-build comparisons and uncertainty.

## October 16 outside-frame item picker and threat-first accessories

- Outside-click failure was the iframe boundary: native picker backdrops already worked, but
  clicking the surrounding website produced no child-document event. The parent wrapper now
  sends a narrow dismissal message on pointerdown. The workspace requires its same-origin parent
  and invokes only the existing selector close control; cleanup and equipment state are preserved.
- Per the user's clarified policy, no Classic-stat Hand of Justice or Blackhand's Breadth was
  added. Warrior/Bear now use offensive weights and Adaptive Combat Assistant + Frozen Heart of
  the Mountain, with Don Julio's Band and their faction's Darkspear Islands melee ring. Paladin
  uses defensive trinkets. A five-pair seed-1337 comparison informed the choice; not global BiS.
- The ring source is the exact, existing build-70425 normalized client checksum file, required
  in FOREVER_MECHANICS_ROOT. Its SHA is verified; old planner values cannot override current
  stats. Only three reviewed rings are admitted; no raid pool or generic Classic fallback opens.
- Theramore Signet, not the similarly named mana-regeneration Militant's Band, is the Alliance
  counterpart to Insurgent's Band. Separate eligibility/default/raid handling avoids cross-faction
  ring promises. Tests caught a Horde-default Bear receiving the Alliance base set; first-load
  defaults now choose the actually eligible preset. Existing saved builds remain untouched.
- Disabled faction presets reject activation in code. Shared unique-equipped category guards
  remain enforced; the unsafe old combined Warrior Tanky shortcut is no longer advertised.
- Method/source details and current gear totals: `docs/simulator-tank-starters.md`. Local only.
- Final verified local release `41f89cd6f53e404dfe132ee3`: 3,483 files / 1,927 items. All 21
  focused Node and 230 web tests, pinned engine Go/types/Vite build, Next production build,
  lint/format/diff checks passed. All 15 combat profiles ran; twelve unchanged profiles retain
  exact golden requests/results. Both factions, disabled activation, save/reload, five widths,
  native/parent outside-click behavior, message-origin/source guards and remaining workspace/
  recovery regressions passed. New ring AP populates both melee/ranged AP; no spell-hit doubling.

## October 16 Build library placement and real-item tank starter sets

- Build library is now above Equipment at every width, including ≥1,500px. Its existing node is
  moved, not cloned, so keyboard order matches the visual order and handlers remain intact.
- Empty tank gear libraries came from projected upstream launch gear and removal of modeled
  ranked profiles. Added narrow Mortarplate, Chevalier and Dragonhide gear presets using 24
  client-checked blue armor pieces and legal stat-weighted fillers; never restore fake rankings.
- The 16 newly admitted armor records have explicit class/family/rarity/slot/stat/set guards.
  Their broad vendor-import faction flag was inferred from the exporting character, not the
  unrestricted client race mask. Vendor access is still provisional, not silently guaranteed.
- New defaults and explicit starter loads turn off forced Tier 1. Existing saved gear/talents/
  rotation survive reload, and gear-only loading preserves talents/rotation. Normal gear and
  combined-build loaders now propagate the preset's existing load callback.
- Filler selection checks weapon/shield/relic compatibility, professions, class/faction/level,
  random suffixes, duplicate items and shared unique-equipped categories. Review caught a
  category-707 Paladin trinket conflict; a regression now rejects it. Ranged stat sticks receive
  no main-hand DPS score. No arbitrary bonus stats, paid hit or enchants are introduced.
- Current-client Sanctuary/Vindication AP/SP/stamina thresholds replace missing/obsolete set
  definitions without double-counting legacy effects. Four-piece utility and incomplete class/
  proc mechanics remain labeled limitations. No BiS or crit-immunity promise is made.
- Read `docs/simulator-tank-starters.md` for source hashes, numeric methodology and runtime usage.
  All new source/Go inputs participate in immutable release hashing; extracted records remain
  generated artifacts, not committed data. This work remains local; production r11 is unchanged.
- Verified release `4a8eae4d6a64c8a7f2859076` (3,483 files): 16 Node regressions, focused Go
  set tests, pinned TypeScript/Vite build and lint/format/diff checks. All 15 combat runs passed;
  twelve unchanged profiles match the pre-redesign request/result golden data. Browser starter
  loading/save/reload, explicit Tier 1 reset, saved-build/talent/rotation preservation, five
  viewport sizes through 390px, Raid/focus/menus/keyboard, embedded reruns and fault-injected
  restart/recovery passed. Starter JSON is served successfully and desktop/mobile images reviewed.

## October 16 shared simulator workspace redesign

- Implemented the approved shared-UI approach in owned build overlays, not changes to combat math.
  Existing import/export controls must stay under their owning SimHeader; moving them outside
  breaks class-specific registration. The new layout keeps that containment and original handlers.
- Explicit click triggers fix hover-open/click-close menus. Keyboard navigation maintains explicit
  focus indices after Bootstrap activation and handles late-added Batch tabs. Mobile talent
  carousel margins now match the actual workspace padding, removing a four-pixel overflow.
- Results toolbar stacking/offset follows the actual new header, including its mobile layout.
  Embedded single-iteration actions target their own same-origin simulator frame, not the website
  parent, while preserving the existing receiver's origin/source guard.
- All workspace inputs participate in release hashing. A pre-publication recheck rejects source
  edits during a build; prior immutable assets remain available. Fonts are self-hosted with
  SHA-256 pins and their OFL notices. No dependencies, migrations or production changes.
- Oversized native worker cancellation can stall. The new UI reports “Stopping…” and offers an
  explicit, delayed engine restart that warns it clears results; never auto-reload the user's work.
  The combat engine and existing cooperative cancellation are unchanged.
- Original fixed-seed golden capture lives in ignored simulator artifacts; use the focused unit
  and browser commands in `docs/forever-patch-notes-talents-simulator-plan.md` to reproduce checks.
- Final local release `47249ed45374259f39bf44ed`: all 3,482 files verified; eight overlay tests,
  230 web tests, lint/types/production builds, all 15 deterministic combat comparisons and the
  desktop/tablet/mobile interaction matrix passed. Tested real embedded report reruns, JSON
  export/import, reference saving and injected stalled-worker recovery with retained settings.
  No commit, push, deployment or production service change for this redesign.

## October 16 simulator production release

- Pushed feature commit `14f9b5d`; deployed `kfc-helper-simulator-20261016-r11` / build
  `8HugevLp4-Lvt8LDnKKT7` from r10 plus the scoped simulator overlay, not the unrelated worktree.
- Existing v3 XP readers and catalog surfaces retained; crawler, reference publisher and ingestion
  PIDs unchanged. Daily official/talent updater is active in PM2 and its first source checks passed.
- Published October 16/build-70425 talent source after verifying all 661 image assets; legacy assets
  and immutable snapshots retained. The pinned combat model remains independent of source updates.
- Verified backup `shared/backups/simulator-20261016-r11-Qr28yC/wow_trader.dump` (216,217,477 bytes).
  Rollback target is compatible r10; do not downgrade the XP reader or erase newly published facts.
- Passed Linux 41 data/230 web tests, production build/lint/types, all 15 private combat profiles,
  public HTTPS combat run and mobile/class-selection checks. Removed only the new 274 MiB generated
  build cache and stopped the private preview; retained all runtime/source/rollback and backups.

## October 16 simulator selector design

- The simulator now reuses the Encyclopedia's compact class cards, round local icons, class colours
  and ordering. Shared appearance metadata prevents the two selectors drifting independently.
- Multi-profile choices use a class query and anchored panel; single-profile classes open directly.
  Workspace navigation shows only the selected class, not a row of 16 unrelated text links.
- 230 web tests, lint/typecheck/build and desktop/tablet/mobile Playwright flow checks passed.
  Existing engine/model data and production services were not modified; local preview is port 3017.

## October 16 simulator and daily source integration safeguards

- All supported Forever-engine profiles are available locally, not only Warrior. Source is pinned
  to `9a27c3d6af91d1ca0dbcf94a124b8869ad522108`; 1,908 real-source equipment records remain, 939
  projections/rankings are excluded, and the old Classic fallback cannot reintroduce excluded stats.
- Immutable engine builds include the builder/overlay/vendor identities, remove only their generated
  upstream build cache before rebuilding, reject mixed release references, and retain published
  releases. Browser combat checks cover all 15 individual profiles; Raid has a load check.
- Daily notes enforce topic identity, full stream pagination, official staff/author evidence,
  robots/access/size rules and Retry-After even with force. DB publication wins over a stale local
  archive; unchanged local captures can subsequently be persisted to DB. No per-view upstream fetch.
- Talent updates require all nine complete classes, consistent beta build evidence and non-backwards
  dates. Verify/stage all assets before publication; corrupt immutable assets fail closed. New
  full-checksum asset URLs and old short URLs coexist, with explicit ambiguous-prefix handling.
- Notes/talent worker is prepared for 06:00 UTC PM2 operation but has not been activated in production.
  Keep the worker and web asset-release root identical. Source refresh does not modify combat code.
- Current-client audit now joins modern stat budgets and item-effect link tables. Build 70425:
  12,400 equipment records, 12,328 resolved base-field records, 536 sets/1,477 effects and 469 talents.
  Seven positions and 147 rank texts remain unresolved; never guess them or auto-promote into a model.
- Next runtime filesystem roots are deliberately excluded from static tracing. Web tests search
  `src`, not generated standalone copies. Blank optional root settings retain their intended defaults.
- Passed 41 data tests, 226 web tests, strict types/lint, .NET build, focused Go core tests and
  browser/production build checks. Current implementation is local only; see the operating steps in
  `docs/forever-patch-notes-talents-simulator-plan.md`. Existing production/crawler release unchanged.

## October 16 crawler restart: trailing quest name and third XP renderer

- Quest 2866's ID was correct; its literal metadata name had a trailing space. Trim only
  surrounding quest-name whitespace, while preserving ID/edition/name and duplicate-data checks.
- Independently fetched core `25318d8a` and the unchanged quest renderer through the durable gate.
  XP rounding/cap bodies are byte-identical to the reviewed source. Added only that verified pair.
- Parser v3 and v1/v2/v3-compatible web/publisher readers deployed before new facts. Reprocessed
  the real captured page with original SHA/time; quest 2866 published at 2,700 XP, no inferred XP.
- New isolated 127-unknown backfill runs first, then resumes priority at 1,133, archive and base
  at 746. Old queues/checkpoints, all rate/access/storage controls and ingestion were preserved.
- Verified active progress at 07:11 UTC: 5/127 processed, no errors; quest 658 published as
  2,800 XP. Three pages still lack numeric scaling data and remain unknown, not failed or zero XP.
- 78 local reference + 220 web + 3 CLI tests passed; Linux 76 reference + 220 web, build and
  private/public browser/mobile/a11y checks passed. No commit/push requested for this follow-up.
- Keep v3-compatible r10 readers for rollback. Full receipts, queue hashes and safe commands:
  `docs/forever-leveling-xp-repair-2026-10-16.md`.

## Historical general-queue block is not a live crawler failure (2026-10-15)

- `shared/status.json` still records the October 13 quest-260 redirect failure because the
  base queue is waiting behind leveling work. Reporting that file alone as the current pipeline
  outage was misleading. Read the active phase/checkpoint identified by `.job.lock` instead.
- The exact `301 /forever/quests?notFound=260` quarantine fix is already in the deployed bundle;
  both crawler and resume source hashes match the local tested source. Other hosts/editions/IDs,
  ambiguous redirects, robots/access denials and rate-limit responses still fail closed.
- New regression proves a legacy blocked base checkpoint resumes after recovery/priority/archive,
  handles the missing quest without following the listing, and continues without resetting prior
  counters or re-fetching completed work. All 71 reference tests, lint and strict types passed.
- Production queues, cursors, pacing, locks and processes were not changed. Do not fabricate a
  missing marker or clear historical errors. The general queue resumes automatically after the
  leveling queues; the active priority worker was healthy at 725/1,419 at 16:34 UTC.

## Full Alliance/Horde archive collection, not just the 298 failures (2026-10-15)

- Reimported and verified the entire authorized source: 157 variants / 22,604 steps / 2,394
  action quest IDs. Its manifest exactly matches the already deployed archive; both factions
  were present. The 298 were failed XP records, not the whole imported library.
- Added full-archive inventory/generator/status tooling. Collect all source branches and known
  dungeon/chain references rather than filtering through the Alliance premade selection. The
  2,535-ID queue includes every old 1,419-ID priority entry and all 106 omitted Alliance references.
  Runtime conditions, daily alternatives and signed optional hand-ins add three further source
  IDs. Item/objective/reward-choice numbers are not blindly imported as quest IDs.
- Deployed worker `crawl-20261015-r8-full-archive`, preserving recovery → priority → archive →
  base sequencing, separate hash-bound checkpoints and all rate/access/storage protections.
  Configuration: `shared/queues/reference-crawler-full-archive.config.cjs`; archive checkpoint:
  `shared/archive-xp-336bb641f1c6e5a6-status.json`. PM2 saved. No Helper/ingestion reload.
- Full coverage at 09:15 UTC: 349 available / 296 unknown / 1,890 unpublished, not complete.
  Three–four days is an estimate for collection, not a promise that both routes will be finished.
  See `docs/forever-leveling-archive.md` for progress commands and remaining source-label gaps.
- Passed 192 leveling + 70 reference + 2 archive CLI integration tests, focused lints/types,
  package builds, provenance/queue/subset checks and resumed-worker verification. No commit/push.
- Owner-approved unknown-dungeon parity is a scenario policy for the next route calculation, not
  fake published XP. Verified old-dungeon records already use distinct page factors (Stockade
  2.1, Gnomeregan 1.8, for example); generic 2.375 remains only in legacy estimates and must not
  be advertised as the universal rule or multiplied into already-adjusted facts.

## Quest XP renderer drift and cached unknowns (2026-10-15; deployed, backfill running)

- The 298 unknown records were not missing primary quest metadata. A paced source capture showed
  the new core revision `97211824`; the old parser accepted only `52d4f803` and emitted a misleading
  missing-metadata error too. Compared both core scripts: XP rounding and max-player-level
  functions are byte-identical; the quest renderer remains `5f36c4ad`.
- Parser v2 supports both inspected pairs, keeps unknown future revisions held, reports precise
  diagnostics and records the actual renderer pair (null when unverified). Backward-compatible
  web/publisher readers were deployed first. Old available records remain cached; old unknowns
  are eligible for one capability refresh, while current unknowns do not retry continuously.
- Production readers: `kfc-helper-xp-repair-20261015-r8`; isolated worker:
  `crawl-20261015-r7-xp-repair`. Queue `forever-xp-recovery-d3ba3ad0b531151f.json` repairs the
  original 298 before 19 newly affected records, then resumes the unchanged priority/base jobs.
  All access/rate/storage guards remain. Do not reset their checkpoints or start another worker.
- First verified repair published at 08:53:09 UTC: quest 4811, 490 XP. Available facts 328→329;
  remaining original cohort 297 at that point. Backfill is asynchronous, not already complete.
  Progress tool and operational paths are in `docs/wowhead-reference-enrichment.md`.
  At 08:56:10 UTC: 3/298 resolved, 295 pending; total usable facts 331, no conflicts.
- Passed 68 reference tests + 5 web tests + recovery CLI integration test, types/lint/format,
  Linux production build/private preview and the live XP/browser/mobile/accessibility suite.
  Ingestion PID 1169337 unchanged; no database, addon or route/UI edits. No commit/push this turn.
- Once v2 records are published, do not roll readers back to unpatched r7: it rejects their schema.
  Safe operational rollback is to stop collection and retain compatible r8 readers/publisher.
  This fixes evidence collection, not the still-unfunded 1–60 route described below.

## Open: preset dungeon levels are not a funded leveling route (2026-10-15)

The owner's repeated feasibility complaint remains valid after r7. The XP calculator and warnings
do not fund the itinerary. Hall's 13,300 reference XP does not provide 16→19's 53,100 requirement;
even its three unpaid prerequisite payouts bring the sum only to 15,940 before combat. Current
conservative LBRS/Stratholme entries at 60 cannot contribute leveling XP.

The proper next work is the binding flexible-entry/continuous-route rebuild at the beginning of
`docs/forever-leveling-product-plan.md`, not another renamed bracket or small quest addition.
All 21 requested stops, fresh numeric/source gaps and the failed full audit are documented at the
start of `docs/forever-leveling-full-route-audit.md`. This is a plan, **not an implemented fix**.

Fresh frozen evidence at the time: 626 records / 328 numeric facts; 298 unknowns needed source/parser
diagnosis (now fixed and backfilling as described above), not a claim that crawling succeeded numerically.
Read-only cache inspection found 61 build-70374
quest records, but reward fields have not been decoded. No disabled scans were re-enabled.
Existing content verification still exits 2 across 33 editions/132 cases/6,000 independent checks.
No runtime change, commit, push or deployment was part of this research.

## Verified quest-library release (2026-10-15)

- Shipped `6429682` + `418f25f` as `kfc-helper-library-20261015-r7`, retaining actual production r6
  as the rollback and preserving the native catalogs/media/dependencies. Only Helper web reloaded;
  all 21 other PM2 services retained their process identities. No migration or player-save write.
- Passed 468 local tests, focused types/lint/format, Linux production builds, 33 source-flow/save
  checks, private coverage scenarios, three public browser suites and 12 public HTTP routes.
  Both Traders remain available without catalog-review/database errors. Full 1–60 XP certification
  remains explicitly blocked by the documented evidence/coverage gaps, not falsely marked complete.
- Canary processes must inherit `WOW_TRADER_REFERENCE_DIRECTORY` from the live PM2 configuration
  as well as loading `web.env`; otherwise published XP incorrectly appears unconfigured in the
  preview. Production retained its configured directory. No runtime validation was relaxed.
- Smoke fixtures must report completed objectives before predicting hand-in rewards and save actual
  party bars before minimum-level-gated pickups. Updated those fixtures and retired bracket-label
  assertions, then reran public tests. Next still previews without completion; Done enforces facts.
- Stopped the canary and SSH tunnel, closed port 19214 and discarded only the release's regenerable
  396 MiB build cache. Disk: 75% / 19 GiB free. Worker PID 2857530 continued the same frozen queue;
  at 07:52:53 UTC: 260/1,419 processed, no job error. Full receipt: `context.md`.

## Full quest pool missing from the premade route (2026-10-15)

- The old campaign trimmed source quests into short fixed lists, while fallback suggestions
  required already-collected XP and rejected every loot objective as a farm. Missing XP evidence
  therefore hid available content rather than allowing its source-backed instructions to appear.
- Added a full applicable source-library compiler and route integrator. Shared NPC kill counters,
  named trophies, bounded nearby short quests and necessary lead-ins now enter the ordered route
  with source coordinates, dependencies and pickup/objective/return stages. Unknown numeric XP
  does not erase the quest or become zero. Unsupported objectives remain explicitly held.
- Optional collection farms are excluded; necessary dungeon unlock collections remain. Explicit
  NPC counters prevent a neighboring item quota from contaminating a kill quest; clearer alternate
  source stages can replace ambiguous mixed steps. Item use, escorts, timed events, missing
  objectives and personal class conditions cannot masquerade as ordinary shared kills/free XP.
- Preserve paid-once rewards, actual bars, accepted chains, raid toggle and old save/action IDs.
  Named trophies never imply one kill gives all five their item; forecasts retain that uncertainty.
  Nearby root selection is a map/step-distance heuristic, not a measured travel optimization.
- Human/warrior now schedules 36 additional quests; generic Human schedules 28. This expands
  content but does not yet certify the whole 1–60 budget. Numeric reward/lifecycle collection,
  travel/combat validation and missing dungeon bundles remain necessary.
- Expanded the existing single crawler to a separate immutable 1,419-ID priority queue. All 614
  original IDs/cache/checkpoints survive; one-minute pacing, storage limits and access-policy
  stops remain. Current/rollback paths, hashes and the verification receipt are in `context.md`
  and `docs/wowhead-reference-enrichment.md`. No website deployment or database migration.
- Passed 186 leveling + 215 web tests, strict types, scoped lint/format, production webpack build,
  33 source-flow/lifecycle variants, 26,878-ID compatibility and browser/mobile/accessibility checks.
  Full-matrix XP verification still exits 2 correctly; passing software checks is not proof that
  every advertised level is funded. No commit or push was requested/performed.

## False chapter XP coverage and skipped later questing (2026-10-15; local implementation)

- Root causes were shared progression errors, not a missing XP-per-level curve: later source
  actions inherited level 16, forecasts omitted the real dungeon departure gate, and cards summed
  rewards at a fixed reference level instead of following each player's paid history and gates.
- Only the intended starter keeps the early override. Later optional XP phases use their own
  targets and cannot skip a lagging/stale player or mandatory unlock. Pickup prerequisites,
  conservative conflicting minima, every modeled objective and actual departure levels now gate
  forecasts. Impossible or unverified steps stop that member before subsequent rewards/combat.
- Each eligible player retains full quest hand-in XP; explicit group-combat scenarios credit
  `floor(solo kill XP / 5) × unique kills` per member. Faster camp clearing affects time only.
  Unmeasured kills are not invented to fill deficits, and duplicate combat activities are rejected.
- A shared ledger/target resolver feeds cards and details. Dungeon entry is not the next departure
  target. Known amounts, paid history, historical estimates, missing facts, pickup conflicts,
  independent reference diagnostics and actual bars are distinguished. No predicted gain changes
  actual progress. Blocked exits/deficits stay unresolved rather than borrowing later rewards.
- Optional complete source-backed shared-kill batches can be persisted in appropriate phases.
  Collection, class/runtime-conditional, item-use and ambiguous objectives are excluded from
  recommendations; source-chain hand-ins and each player's eligibility are checked. Refresh and
  add/remove do not grant XP or clear reported history. Existing saves, bookmarks and action IDs
  remain compatible with production r6.
- `leveling:xp:verify` now fails closed with exit 2 unless independent budgets and every relevant
  player's continuous forecast support the route through level 60. Current full-matrix result:
  33 variants, 132 scenarios, 6,000 chapter checks, **not certified**. Missing content/evidence and
  uncalibrated combat remain; do not claim that this fix funds every 1–60 transition.
- 172 leveling + 215 web tests, strict types, scoped lint/format, production webpack build, 33 source-flow projections,
  r6 save compatibility (26,878 identities) and local browser/mobile/WCAG checks passed. Full
  reproducible data/commands and remaining work: `docs/forever-leveling-full-route-audit.md`.
- Local only. Production still runs `kfc-helper-zones-20261014-r6`; the 614-ID crawler queue is
  unchanged. The prepared 638-ID catch-up queue has not been installed. No commit/push/deployment
  or database mutation was performed for this correction.

## Zone questing mislabeled as multiple levels of preparation (2026-10-14)

- The shared section builder grouped all work before a dungeon under “Prepare for…”. This included
  personal zone questing and optional XP batches, making normal leveling look like several levels
  of preparation. Geographic titles and contiguous area subsections now describe that same work.
- Public sections use `zone`; internal legs and their execution kinds remain unchanged. All old
  `prepare-*` URLs, action/source IDs, level brackets, save identities, participant scopes, quest
  order, Next/Done and per-player XP calculations are preserved. Adjacent Dun Morogh phases share
  one area heading; no separate level-13 cards were reintroduced.
- Preparation is a small collapsed “Before [dungeon]” checklist. It links only existing selected
  prerequisite/pickup steps and displays reported progress separately for the players who need
  them. It neither marks steps done nor pretends that missing source edges are complete.
- Catch-up is collapsed only when every action satisfies the existing actual-XP readiness rules.
  Mixed phases with required pickups remain available. Unknown/stale bars and unverified dungeon
  bundles keep their previous gates; no extra levels, rewards or travel times were invented.
- 143 leveling and 214 web tests, strict type/lint and Linux builds passed. The presentation-only
  compatibility audit covered 33 editions and 26,878 preserved action identities, comparing the
  full executable plans, chapter identities/brackets and XP forecasts against r5. Browser checks
  cover collapsed preparation, individual reports, conditional work, legacy links, navigation,
  real XP, long zone titles at 390/320 px and automated WCAG A/AA.
- Active `kfc-helper-zones-20261014-r6` preserves the actual r5 production/catalog baseline.
  Only Helper web was reloaded; r5 remains the immediate rollback. No migration, dependency/native-data change, commit or
  push is needed. A cold web typecheck exceeded the inherited 384 MiB runtime heap; the check and
  build pass with process-local 1536 MiB, without increasing any PM2 production limits.
- The integration browser audit now waits for the new reader URL and its expected streamed title.
  Waiting for any nonempty title could accept the previous dashboard's title before Next replaced
  it. This repairs the test's readiness check without suppressing accessibility validation or
  altering production metadata behavior.
- Public geography, integration and real-XP browser checks and 12 public routes passed after
  deployment. Both Traders retained working catalogs. Temporary preview/tunnel stopped, PM2 saved,
  and 19214 closed. No user data was removed. Operational PID/storage receipts are in `context.md`.

## Missing quest XP, not-found redirect and misleading route totals (2026-10-14; repaired foundation)

- The source parser extracted Gains as text, but real numeric XP is rendered from literal primary
  quest metadata and `WH.Wow.Quest.setupScalingRewards`. Fresh display cache entries therefore
  had no usable XP. Added a separate versioned, renderer-pinned XP parser and cache capability,
  sidecars, checksum-addressed publication and current-client identity checks. No evaluated
  JavaScript, comment data, catalog mutation or extra unpaced source requests are involved.
- The full crawler had stopped at cursor 746 because quest 260 redirects to the exact
  `/forever/quests?notFound=260` listing. Only this explicit same-edition not-found form is now
  quarantined; unrelated redirects and genuine source restrictions still stop. The base queue,
  cursor, durable pacing and old staging are retained.
- The isolated `crawl-20261014-r6-xp` runs a separate 614-ID priority queue/checkpoint and then
  resumes the old base queue automatically. Priority checkpoint is
  `/home/wow-trader-reference-worker/shared/priority-xp-32bec0be2d118c31-status.json`.
  See `docs/wowhead-reference-enrichment.md` for queue hashes, limits and inspection commands.
- New pure per-player forecasts carry XP across sections, resolve at the predicted hand-in level,
  pay one-time quests once, preserve individual progress and show unknowns/gates. Historical
  estimates do not certify an exit; default combat contribution is excluded. Optional Stratholme
  quest 5848 no longer inflates its four-quest core. Predictions never mark actual quests done.
- Active Helper release: `kfc-helper-xp-20261014-r5`, immediate rollback:
  `kfc-helper-chapters-20261014-r4`. Only Helper web and reference publisher were reloaded;
  ingestion remains independently pinned. No migration, dependency change, commit or push.
- 415 relevant tests, strict type/lint, Linux production builds, all 33 source projections and
  26,878 preserved action identities passed. Five private browser suites passed, including real
  quest XP, read-only refresh, navigation/progress, mobile overflow and automated WCAG A/AA.
- Public XP, consolidation and integration checks and 12 public routes passed. Deployment checks
  caught a nested `standalone/apps/web/public/public` copy: copied the original asset contents to
  the correct root and verified the logo's checksum/HTTP 200. The activation script now requires
  the exact `public/kfc-icon.svg` path, not just a directory. No user data was deleted.
- A regression reproduced a conflict being replaced by an unknown renderer refresh. Publication
  now retains that conflict; a repeated available claim also stays conflicted rather than silently
  becoming approved. The focused test failed before the guard and passed after it. Numeric
  contradictions need review, not a refresh button or newer capture timestamp.
- At 11:36 UTC the XP index had 24 available facts, with collection continuing. The saved audit
  covers 33 editions but does not prove 1–60 sufficiency. Combat measurement, complete unlock
  restrictions, efficient deficit-driven top-ups and full RestedXP export remain next work.

For debugging, distinguish `shared/published/index.json` (display references) from
`shared/published/quest-xp/index.json` (reward evidence). The preview/live web process must have
`WOW_TRADER_REFERENCE_DIRECTORY` set to the published root. Missing configuration yields an
explicit notice and no facts, not synthetic XP. Do not clear source checkpoints or pacing to
make a missing reward appear; inspect parser issues and publisher validation instead.

## Reference crawler blocked by unrelated edition preload (2026-10-13; recovered)

### Cause and repair

- PM2 `kfc-helper-reference-crawl` (351) had stopped October 8 at 18:02 UTC, cursor 607 / 60,614,
  with `Gatherer edition mismatch` on `tbc-item-818`. Publisher 352 remained online; free disk
  and staging budgets were not the cause. The last completed record was `forever-item-823`.
- A single-item diagnostic used the existing worker, staging/pacing state, public robots policy,
  user agent and 60-second gate while the full worker was stopped. The canonical Tigerseye page
  had an edition-4 unrelated item dataset and an edition-5 dataset containing the actual target.
  The old parser threw on the unrelated dataset before reaching the valid primary item.
- `packages/reference-data/src/parser.ts` now skips foreign item datasets and, if any occur,
  requires a matching requested-edition target. A foreign same-ID dataset cannot supply or overwrite
  facts. Wrong primary names, executable data expressions, canonical/XML mismatches and unsafe
  literals still fail. AH buyout estimates and non-allowlisted database flags are still excluded.
- Added 15 focused regressions for TBC/Forever, both dataset orders, unrelated/same IDs, foreign-only
  data, mismatched names and executable data. Eight regressions failed before the patch; all 53
  package tests now pass, as do strict typecheck and lint. Replaying the reduced real fixture
  extracts only the allowlisted `sellprice: 100`, not its AH estimate or database flags.

### Isolated deployment and rollback

- Active runtime: `/home/wow-trader-reference-worker/releases/crawl-20261013-r5`.
  Previous runtime: `crawl-20261007-r4`. Private backup/receipts:
  `/home/wow-trader-reference-worker/backups/20261013-edition.nXim7d/`.
- Built from the deployed r4 source maps rather than the dirty development package. Strict build
  and declaration generation passed; source-map comparison of all eight production modules shows
  only `parser.ts` changed. Existing CLI exports and package versions are unchanged.
- The deployment preflight caught 73 dependency aliases pointing at retained r2. In the new r5
  candidate only, changed them to relative release-local links, verified all 2,086 dependency-file
  hashes, and removed one confirmed dangling development self-link. No dependency payload, old
  release or live data was removed. The former targets are recorded in `dependency-link-repair.json`.
  Keep r2 while retaining r4: the old r4 rollback still depends on it; r5 is self-contained.
- Atomically switched only the worker's `current` symlink and restarted only PM2 351 at 05:52 UTC.
  Saved PM2's process list. New PID: `2576854`; deployment receipt: `deployment.json`. All other
  21 PM2 services retained their PID/status/restart counts during activation.
- Preserved the full queue SHA-256
  `263ccf01fb130062f7f4bc8eef6fcf72ba84f736ebbed2adca9637357a8bf951`, all 60,614 tasks, cursor 607,
  previous staging and durable request-pacing state. No IDs were skipped or rewritten to force progress.
  One worker, 60-second minimum between every HTTP attempt, 384 MiB heap, 8 GiB disk reserve,
  2 GiB staging ceiling, low CPU priority and `autorestart: false` remain unchanged.
- If rollback is needed, stop only this worker, confirm its lock-owning PID is gone, point `current`
  back to the retained r4, and save PM2. Do not erase the queue, checkpoint, pacing or live locks.
  r4 retains the known Tigerseye parser defect; do not restart it expecting that issue to be fixed.

### Live verification

- At 06:00 UTC, worker 351 remained online with the same new PID, approximately 97 MiB RSS,
  cursor 609 / 60,614, no error and `forever-item-826` in progress. Newly saved TBC item 818
  (Tigerseye) and Forever quest 212 (A Meal Served Cold) both passed the existing publisher as
  complete. No incomplete counter increase, lost progress, skipped IDs or queue hash change.
- `https://helper.kfcguild.online/tbc/encyclopedia/items/818` returned HTTP 200 and rendered
  `Item details & source context`, the canonical TBC Wowhead link and capture date 13/10/2026.
  Published checksum, exact identity, vendor price and 230 source/use relations verified; no
  AH buyout estimate or database flags were imported. The material's source classification
  remains subject to unchanged exact-client publication validation.
- Publication checks: 371 complete, 177 partial, 61 held. Manifest: 557 entries (including nine
  historical entries now held by validation), versus 555 before repair. Do not call all manifest
  entries currently approved. Publisher PID `2015759` and restart count 2 remained unchanged.
  Root free space: 25.28 GiB. Recovery receipts: `progress-verification.json` and
  `final-verification.json` in the private backup directory above.
- Follow-up at 06:31 UTC: same PID, cursor 621, 621 crawled records, 229 incomplete, zero cached/
  not-found records, no error and `forever-item-832` in progress. This confirms 14 new completed
  records over approximately 38 minutes, not merely a successful restart. The unchanged source
  completeness rules flagged one additional incomplete record without stopping the crawl.
  The public Forever quest-212 page also returned HTTP 200 with its title and new dated reference.
- Only the new test file was formatted. Final regression suite, strict typecheck, lint, new-test
  formatting and `git diff --check` passed. The shared parser patch, regression tests and these
  notes remain local; no commit/push was requested. The running worker uses its immutable r5,
  independent of later development-checkout edits.

Genuine access denials, source challenges, primary-item conflicts and rate-limit cooldowns must still
stop or hold data. Do not treat this repair as permission to bypass them. No web/publisher/ingestion
deployment, native database write, migration, dependency upgrade, commit or push was requested.

## Versioned catalog guardian deployment (2026-10-09; installed)

- The earlier 70291 repair was already live, but the scheduled Mac watcher still loaded mutable
  repository scripts and local development dependencies. Replaced that installation with a
  content-addressed bundle outside the worktree. It includes its own Node executable, compiled
  production-only catalog CLI and self-contained macOS extractor. The scheduled job needs no
  `tsx`, pnpm/Corepack, .NET SDK, external .NET runtime or development checkout.
- Active Mac release: `9fa6db30d08f91cd070be39f99028fa3b0905ec55338550b903f6aa7805b174b`,
  approximately 197 MiB under
  `/Users/dimitarjilanov/Library/Application Support/WowTraderCatalogGuardian/releases/`.
- Deployed and checksum-verified its portable Linux-compatible CLI runtime:
  `45970dd4b92c9e37fc8b1d9778ab5ce7079ba3299e2401ab1012a833e70fac6f` under
  `/home/wow-trader-system/shared/catalog-tooling/releases/`. Server audit checked all 102 real
  artifacts and relationship validation returned valid with 23,946 items / 2,239 recipes.
- The installer refuses to interrupt a locked run, validates the bundle and native tool startups,
  runs a production-connected dry-run, and restores the previous plist on activation failure.
  Private rollback plist: `rollback/1791570353190.plist`; deployment receipt: `deployment.json`.
- LaunchAgent interval remains 300 seconds, with the same `.build.info` / Forever hotfix watch
  paths. It now runs from the versioned release, reports that release in status, and is `current`
  for published 70291 without another import or web reload. Mutable artifacts/definitions now go
  into the separate installation `work/` directory, not the release or development repository.
- Verification: eight runtime/release regressions plus four cache tests and 11 catalog tests passed;
  focused lint, strict catalog typecheck, Node syntax, three package builds and self-contained
  macOS publish succeeded. Old Mac job configuration, earlier server runtime and catalog backup
  remain available. Reinstall after changing guardian/extractor code; do not edit immutable releases.
- Ran a fresh complete extraction with the deployed native executable, official definitions in its
  own `work/` cache, and a restricted command path excluding developer tooling. All 23,946 items,
  31,849 spells and 2,239 recipes re-extracted successfully. The bundled Node CLI audited all 102
  artifacts and passed relationship validation. The native icon pipeline decoded all 2,953 icons
  with zero unavailable assets; the bundled media checker verified their checksums.
- A restricted-path `--publish --verify-tools` run verified startup and returned `current` without
  importing or reloading again. Four live HTTP checks passed: default/explicit Forever crafting
  each show 50 opportunities, AH item search works and TBC crafting shows 50 opportunities. No
  checked catalog-review/database/server-error markers remain. All 22 PM2 services retained their
  PID, status and restart count, including the already-stopped reference crawler. No web release
  switch, migration, new scan, commit or push was needed for this deployment.

This deploys the missing-tooling prevention, not an exemption from exact-data validation. Genuine
economy changes still require review; unavailable client/definitions, an offline Mac or failed SSH
connectivity can still delay publication.

## Build 70291 publication failure after a slim web deployment (2026-10-09; recovered)

### Cause

- Scan `e544e04f-b8a2-4f19-8f1f-cc33fa738ae8` was already accepted and processed: build 70291,
  `UNKNOWN / ClassicBetaPvP / alliance`, 3,106 markets, 11,633 price levels, completed 17:45:55 UTC.
- The Mac guardian repeatedly failed with `ssh exited with code 1: sh: 1: tsx: not found`.
  Active web release `kfc-helper-reference-auto-20261008-r1` correctly serves a slim production build,
  but lacks `packages/catalog/node_modules/.bin/tsx` and `packages/catalog/dist/cli.js`.
  The guardian incorrectly assumed every web release included catalog developer tooling.
- Guardian status also merged previous snapshot fields into a new build's error: build 70291 could
  appear beside a 70245 manifest/assessment. Those stale fields were not evidence of a 70291 approval.
  No fallback to old recipes or weakening of the exact-build guard was appropriate.

### Durable repair

- `scripts/catalog-guardian.mjs` now builds catalog/contracts/db, deploys only production dependencies,
  and ships the compiled Node CLI plus catalog/media verifiers to a content-addressed shared runtime.
  Audit, validation, reviewed import and publication use that exact runtime rather than `current`'s
  development package scripts. The subsequent versioned Mac deployment above also removed the
  scheduled job's local SDK/development-tool dependency.
- `scripts/catalog-runtime.mjs` fingerprints every regular file and portable internal symlink.
  Source and destination audits reject changed/unlisted files, external or absolute links, missing
  compiled CLI and environment files. pnpm 9's dangling excluded-package links are removed only
  inside a newly generated, package-identity-checked temporary deployment; external live links fail.
- Runtime fingerprint/release:
  `2c95f188630808ce348ea3c372162c3c979eaa91e26af01fa4bbff42a73924ca`, approximately 31 MiB under
  `/home/wow-trader-system/shared/catalog-tooling/releases/`. Retain this shared tooling independently
  of old application release cleanup. It contains no production environment file or collector token.
- `sync-production-media.sh` accepts a validated `WOW_TRADER_MEDIA_VERIFIER` path, so guardian icon
  validation is also independent of a slim web release. Other callers retain the existing default.
- Snapshot preparation drops stale manifest/assessment/published-ID fields and retains notification
  de-duplication. Runtime regressions are included in the root test command.

### Recovery and evidence

- Reused the exact installed `1.60.1.70291` extraction pinned to official definitions revision
  `9073201543de7fd0af41ed42042b8d32c3f52938`, hotfix
  `8f792ef0e23f260503538004465fa80df639597decba8f76382162a6538ea8c7`.
- All 102 artifacts and normalized relationships validated. Published 23,946 named items,
  31,849 spells, 12 professions and 2,239 recipes. Compared with published 70245, there were
  no profession, recipe-economy, craft-time or transformation changes; item/spell metadata additions
  passed the unchanged promotion policy. This is not a claim that unnamed source IDs are usable items.
- Verified custom-format pre-publication backup:
  `/home/wow-trader-system/shared/backups/wow_trader-pre-wow_classic_beta-70291-8f792ef0-catalog-20261009.dump`
  (173,424,780 bytes). Existing published snapshots were retained.
- Synchronized immutable catalog/media release `wow_classic_beta-70291-enUS-8f792ef0-9073201`,
  repeated server audit/validation, imported as reviewed, verified all 2,953 icons, then published
  build ID `2ce8312f-c061-4dba-bb46-10adf97b299e` at 18:03:25 UTC.
- Reloaded only Helper web: PID `2157846`, restart count 92. Its application release remains
  `kfc-helper-reference-auto-20261008-r1`; ingestion remains PID `1169337` / zero restarts and
  reference publisher PID `2015759` / two restarts. No migration or application source deployment.
- The temporarily paused Mac LaunchAgent was restored with its unchanged five-minute interval and
  watch paths. Both a manual idempotency check and the scheduled process report build 70291 `current`.
- Six public checks passed: default and explicit-market Forever crafting each render 50 opportunities;
  Forever AH item search, TBC Trader, community and guild return HTTP 200 without the checked
  catalog/database/server-error markers. No new upload or rescan was needed. An already-open browser
  tab may need refreshing because its saved scan ID itself did not change during catalog publication.
- Verification: six runtime regressions, four cache tests, 11 catalog tests, focused script/catalog
  lint, catalog strict typecheck, catalog/contracts/db production builds, shell/Node syntax, formatting,
  server runtime checksums and exact SQL item/recipe/scan counts. No commit or push requested.

Compatible future builds can publish without catalog dev dependencies on the web server. Genuine
economy changes, unavailable exact definitions, missing hotfix cache, or an offline maintainer Mac
remain real publication constraints; do not bypass them or invent catalog provenance.

## Verified dungeon release and deployment checks (2026-10-05; deployed r6)

- Committed/pushed `e2beab6`; activated `kfc-helper-leveling-dungeons-20261005-r6` over the verified
  r5 baseline. Exactly 73 committed source checksums matched on the server. Unrelated dirty catalog,
  market, ingestion and SEO files remain excluded from the commit and source overlay.
- Clean-export full lint caught undeclared browser globals in the new chapter-path audit. Importing
  Node's URL and using `globalThis` inside browser callbacks fixed it without lint suppressions.
  Full `pnpm check` then passed all package lint/typechecks, 400 tests and builds; formatting and
  five reference-importer tests passed. The corrected chapter-path Chrome audit also passed.
- Linux checks passed 104 leveling + 195 web tests, lint/typechecks, production build and formatting.
  Archive audit verified 157 authorized chapters / 271 quest records. Private Chrome passed all
  27 regression groups; public HTTPS passed four browser groups with ephemeral local progress,
  no server writes, no JavaScript errors, mobile overflow or automated WCAG A/AA violations.
- Smoke URLs must come from chapter constants and `robots.txt`: a guessed chapter ID is correctly
  404, and the root sitemap is a URL set, not an index of the four catalog shards. Corrected checks
  verify the actual Thanes chapter, both Traders, world/catalog/data routes, all four shards and a
  real build-70205 reward preview; unknown rewards remain 404.
- The wider initial public crawl exposed a real 320 MiB heap-limit SIGABRT, not a browser failure.
  Private 384 MiB replay passed two complete route/sitemap rounds: sampled RSS ≤360 MiB and retained
  heap 97 MiB after each round's GC. Increased only the web heap limit to 384 with a mode-0600 backup
  at `shared/env/web.env.pre-dungeon-heap-20261005-r6`, preserving credentials and the 600 MiB PM2 guard.
  The production example now matches. Separate catalog-guardian activity also caused an expected
  reload while publishing a compatible same-build hotfix; do not confuse it with the heap crash.
- After applying the budget, two complete public 20-route rounds plus the unknown-reward 404 passed
  without another restart (PID `1650837`, count 77, 423 MiB warmed RSS). Both Traders retained their
  catalogs and the root/four catalog sitemaps and same-build reward preview remained healthy.
- Only Helper web was reloaded and PM2 saved. Ingestion and guild/community/workers retained their
  processes. This deployment did not write database/archive/world evidence or change credentials.
  Candidate/inspector listeners and tunnels are closed. No rollback data or existing releases were
  deleted; disk has about 6.6 GiB free (91% used).
- Local-only entries below describe their original implementation turns; this receipt supersedes
  that deployment status. Release/rollback detail: `docs/forever-leveling-release-2026-10-05.md`.
  Export browser progress before r5 rollback; the older strict schema cannot read dungeon fields.

## Full chapter path, quest metrics and dungeon expansion plan (2026-10-05; local only)

- The dashboard now displays the complete eligible 1–60 chapter route tree; no three-card cap,
  collapsed archive or 20-level-band selector. Source branch links, conditional/missing connections,
  current-chapter jump and explicit Mage AoE alternatives are preserved.
- Unique source quest IDs/hand-ins honor the existing character/rate/season/dungeon conditions;
  repeated objective rows are not additional quests. Optional/unknown branches and reference reward
  coverage are separate. Chapter-required XP does not claim actual quest or kill rewards.
- All 60 XP-curve entries were checked against the pinned extraction. Modeled time uses a separately
  saved per-character effective XP/hour; blank/invalid rate and same-level/missing XP stay unknown.
  Save denial is visible. Neither estimated time nor reward figures change character progress.
- Added bounded cached archive projections, private/checksum rejection and failed-load retry tests,
  pure graph/count/timing tests and `scripts/check-leveling-chapter-path.mjs`. Accessibility checking
  found and fixed invalid metric-definition markup before the final desktop/mobile audits.
- Full-catalog expansion is planning only: see `docs/forever-leveling-dungeon-replacement-plan.md`.
  Audited 32 visit variants / 259 quest records and found six UBRS rows skipped by a heading-suffix
  parser bug. Generic source-segment definitions, schema migration, exact return gates, XP coverage,
  total/marginal trip costs and lifecycle review precede additional runnable replacements.
- User policy: At-level entry floor for every group size; later pickup/access gates can raise it.
  Earlier preparation is allowed, earlier dungeon runs are not. Above-cap and unknown schedules
  stay reference-only. Related older plans were reconciled with this explicit restriction.
- Final verification: 192 web + 80 leveling unit tests passed; both packages passed lint and
  typecheck, and leveling plus an isolated native Turbopack production web build passed. All 60
  curve entries match the pinned extraction; the dungeon coverage audit validated 157 chapters.
  Browser checks passed 22 compatible prior reader regressions, five new chapter-path groups,
  six replacement groups and four reference-dungeon groups. The chapter-path audit found no
  WCAG A/AA violations or overflow at desktop 1440 px and mobile 390/320 px widths.
- Reproduce the chapter-path browser audit against the existing local dev server:
  `node scripts/check-leveling-chapter-path.mjs --playwright-package=/Users/dimitarjilanov/work/test/discord-website/node_modules/@playwright/test/package.json`.
- No commit/push/deployment, new dependency, database migration, addon change or production mutation.

## Leveling companion UX and XP refresh (2026-10-05; local only)

- Current + next is the default with a visible All steps switch. Mobile keeps instructions prominent
  with bottom navigation and a map toggle; desktop retains a fixed map with a saved width slider.
  Preferences are independent of character progress and legacy explicit preferences still load.
- Active dungeon comparison moved to a compact route menu / Settings. Outdoor comparison is
  expandable. Preparation deep links reveal the original-chain review before route selection.
- Quest acceptance, objectives and hand-ins have explicit actions with correction/undo. Instruction
  Done never infers a quest state; a reported reward remains undoable after its card collapses.
- Original trip forecast is stable; remaining rewards and reported actual XP are separate. Reward
  state changes from any dungeon UI require an actual XP refresh and never credit estimates as
  earned XP. Refreshing clears old kill-XP assumptions; actual-level return gates remain separate.
- Fixed selected-step loss after map toggles / viewport resizing and return-button clipping on
  narrow screens. The measured 390×844 dungeon instruction pane is 596.5 px (~71% of the viewport).
- Saved feedback appears only after successful browser persistence. Denied writes visibly remain
  memory-only; a recovered write clears the stale storage warning. No account sync is claimed.
- Continue and nearby chapters lead the dashboard; the full archive is collapsed and unknown
  class/rate settings remain outside it. Reviewed carryovers are collapsed at the return checkpoint.
- Verified 260 unit tests, package lint/typechecks/builds, 22 compatible prior Chrome regressions,
  four reference-dungeon and six updated replacement browser groups, and reader/dashboard A/AA
  accessibility audits with no violations. Normal isolated Turbopack production build passed;
  a separate Webpack diagnostic hit the existing Google Fonts URL-extension loader issue.
- No commit, deployment, migration, new dependency, addon change or production mutation.

## Chapter-local dungeon alternatives (2026-10-05; local only)

- Replaced the detached primary dungeon UX with a Hall of Thanes alternative on the applicable
  Darkshore chapter. Estimated quest XP uses the supplied Crest 6200/2600 calibration, never outdoor
  rewards, kills or the level curve. Four quests estimate 11,685 XP, leaving 2,715 XP at fresh level 15.
- Treaty is a conditional inside level-16 pickup, not default XP or a means of unlocking itself.
  Underground Map remains an outdoor prerequisite. Rewarded/retained quests cannot pay twice.
- A seven-stage fixed-map reader has separate branch bookmarks and progress. Next/Done/Undo and
  reload resume work without changing source checkmarks. Keep questing restores the outdoor bookmark;
  `?outdoor=1` permits source preparation links without discarding the selected branch.
- Handoff derives carried quests from the actual class/race/rate source pair, in chronological order.
  Later accepts cannot satisfy earlier turns; optional duplicates cannot conceal required uses.
  The continuation button requires actual level 16+ and explicit carryover review, not forecast XP.
- Same-build source guards prevent stale route activation. Unchanged remembered steps are no-ops,
  avoiding repeated provider updates. Old saves default missing replacement state; backups validate
  exact supported chapter and step identities and preserve newer undone states.
- Screenshot review fixed the irrelevant Darkshore default during Ironforge dungeon steps and the
  missing mobile Review chapter checkpoint anchor. No dungeon entrance coordinates are invented.
- Documentation and reproducible Chrome checks: `docs/forever-leveling-dungeon-implementation.md`,
  `scripts/check-leveling-replacements.mjs`. No deployment, migration, addon change or new dependency.
- Verified: 79 leveling / 176 web tests, package lint/typechecks, leveling and isolated production
  web builds, 30 existing Chrome regressions and eight dedicated dungeon/replacement browser groups.
  The chapter pair uses a full-width comparison row, preventing the longer alternative from
  stretching neighboring chapter cards. Calibrated XP and source carryovers remain explicit estimates
  and manual game checks, not a guaranteed shortest/playtested route or server prerequisite database.

## Leveling bookmarks, undo, backup safety and reader quality (2026-10-04; deployed r5)

- Saved the reading position independently of checkmarks, per character/chapter/version/build.
  Next-only visits now resume in a fresh tab and from Continue playing, not the first pending step.
  Explicit anchors take precedence; stale/excluded steps cannot select an invalid card.
- Previous is progress-neutral. Undo Done restores the previous pending or skipped status and
  returns to that instruction; it is intentionally local to the current visit/release/character.
- Older backup ticks cannot undo a recent undo: existing saved chapter releases win in full on
  explicit merge. Validated private backups require preview/confirmation and successful storage
  before acknowledgment; identity conflicts, corrupt files and size/character limits fail safely.
- Report retries are matched through schema-normalized profiles, avoiding PostgreSQL JSONB key-order
  false conflicts. The bounded same-origin API validates published step identities and only confirms
  committed insertions or identical retries. New storage migration: `0016_white_runaways.sql`.
  Reports do not edit source evidence. Maintainers review with `pnpm leveling:feedback --help`.
- Added bounded map pan/zoom/fit, instruction-revealing markers, current+next focus mode, larger text
  and source-only chapter handoffs. Screenshot review caught controls wrapping and shrinking mobile
  maps; compact accessible labels, adequate split-map height and landscape-specific sizing fix it.
- Web/database lint/typecheck and 165 web tests passed. Isolated-feature `pnpm check`/production build
  and all 30 Chrome regressions passed; final responsive/map-size/mobile-focus/keyboard checks passed
  after the visual adjustment. No new dependency. Committed/pushed as `f81bc5c`, then deployed r5.
- Local PostgreSQL at localhost:5432 is stopped, so `pnpm db:migrate` and the report review query could
  not complete; real local submissions correctly return 503 without false success. The subsequently
  authorized production migration passed after a verified 83,087,657-byte backup. Runtime table grants
  are SELECT/INSERT only; maintainer review uses the protected owner connection.
- Linux candidate lint/typecheck/build and 165 tests passed. Staged Chrome found a brittle no-hash URL
  assertion while the reader correctly added its initial bookmark; test-only fix `68ae79f` follows
  browser-suite commit `7f8a1d1` in sibling `discord-website`. All 30 cases passed across initial run
  and focused rerun; seven public HTTPS cases passed. Real database/API checks passed durable storage,
  JSONB retry, conflict, evidence/origin validation and rate limits. Six exact synthetic reports were
  cleaned up. Only Helper web reloaded; other live processes and player reports were preserved.
- r4 remains the web rollback target. Keep the additive feedback migration and live market data;
  private backups protect newer bookmark fields when temporarily opening the older strict reader.
- Complete contracts, operator commands, known source gaps and backup rollback caveats:
  `docs/forever-leveling-player-quality.md`. Discord account sync is not enabled; private manual
  export/import works now and the account-auth/revision-conflict phase is documented separately.

## Explicit Next step / Done chapter navigation (deployed 2026-10-04)

- Replaced Follow and Resume with the owner's requested manual controls in both reader editions.
  Next moves to the next visible applicable instruction without completing anything. Done first
  completes the selected step, then advances. A standalone checkbox remains independent of navigation.
- Controls remain visible in every mobile focus mode; hidden quest panes defer scrolling until they
  reopen. At the final step Next is disabled, while Done can complete it without looping to earlier
  pending instructions. Completion requires a saved matching character and an incomplete resolved
  card. Valid scoped anchors and legacy browser history remain compatible across refresh.
- Code/plans `640091a`, sibling browser regressions `4f05376`, active Helper release
  `kfc-helper-leveling-workspace-20261004-r4`. The existing progress schema and database are unchanged.
- Passed 138 web tests, lint/typecheck/build, clean-index `pnpm check`/formatting and all 23 staged
  browser regressions. Exact step 51, undo/hide/refresh, final-step completion, independent checkboxes,
  both editions, map-focus advancement and unsaved completion guards are covered. All 23 public HTTPS
  regressions and six representative API/page checks passed; Helper stayed at PID `1542399`, restart
  count 70, post-check RSS 231 MiB. Ingestion and other applications were not restarted.
- Candidate packaging must copy the contents of static/public directories into the standalone roots
  using source/destination trailing slashes, then start the process. Copying `public` into an already
  populated `public` directory nested it under `public/public`, leaving the header icon missing. This
  was caught in the staged full-image decode test and corrected before activation. Existing deployment
  script already uses the correct `rsync` convention. Immediate rollback is the previous r3 release;
  full pre-feature rollback is documented in `docs/forever-leveling-release-2026-10-04.md`.

## Leveling Follow / Resume returned to the chapter beginning (deployed 2026-10-04)

- Reproduction: select Elwynn `#guide-source-step-0051`, then click **Follow next step** with
  earlier instructions still unchecked. The old handler cleared the pin and used the chapter-wide
  first pending step, incorrectly discarding the reader's selected place.
- The r3 fix retained an ordered reading cursor; r4's explicit actions above supersede its UI.
  Follow searched pending applicable
  steps at/after that cursor; Resume used the same cursor and enabled following. Completing or
  skipping advances; undoing earlier progress does not rewind it, and reaching the end never wraps.
  No earlier prerequisite is automatically completed. Explicitly selecting an earlier step returns
  there. Current-step anchors and validated browser-history mode survive refresh without modifying
  progress storage or losing Next.js history state; cursor scope includes character/chapter/build.
- Code: `apps/web/src/components/leveling-reader-selection.ts` and
  `apps/web/src/lib/leveling-reader-navigation.ts`, wired into imported/original readers and the
  shared viewport workspace. Committed/pushed in `1811348` and deployed as
  `kfc-helper-leveling-workspace-20261004-r3`.
- Regression coverage: navigation unit tests and `tests/e2e/leveling-workspace.spec.ts` in the
  sibling community repository, including the exact step-51 case, finish/undo, hide-completed,
  refresh, final-step no-wrap and pane-only Resume. Passed 136 web tests, lint, typecheck, production
  build and all 20 Chrome/Playwright leveling regressions; details are recorded in `context.md`.

## Leveling feedback-release memory guard (2026-10-04)

- The first broad public crawl passed its browser assertions but reached 649 MiB RSS and triggered
  one restart at the existing 600 MiB PM2 guard. Browser success alone did not prove process stability.
- Set `NODE_OPTIONS=--max-old-space-size=320` only in the protected Helper web environment, also
  documented in `infra/pm2/web.env.example`. This bounds V8's old heap and encourages earlier GC;
  it does not change the process guard or ingestion's environment.
- Heap limiting alone still crossed the guard. World startup validation opened all 3,386 image
  checksum streams; it now checks every tile in batches of 16. The concurrency regression fails
  without this fix and a corrupted final-batch tile still rejects the snapshot.
- Final r3 passed 20 public HTTPS browser tests and two full sitemap/API crawls at the same PID and
  restart count, warmed RSS 392–413 MiB. Rollback: `docs/forever-leveling-release-2026-10-04.md`.

## Forever upload HTTP 500 caused by Nginx temporary-file permissions

### User-visible problem

Forever scan `78751705-721a-4873-9339-1532d7e385b7` was present in the correct Beta
SavedVariables file, but **Check for scans now** repeatedly returned HTTP 500 and the live Trader
remained on the previous scan. The installed Companion `0.3.1` then incorrectly replaced the error
with **All saved scans are up to date**.

### Root cause

The request never reached `kfc-helper-ingest`. Nginx logged repeated failures opening
`/var/lib/nginx/body/*` with `Permission denied` while buffering the multi-megabyte request body.
The same stale-worker condition affected Nginx proxy temporary files for several unrelated virtual
hosts. The directory ownership and modes were correct when inspected, and the `www-data` user could
create files there; a graceful Nginx reload replaced the affected workers and immediately allowed
the pending Companion retry to reach Fastify.

### Permanent repair

- The Helper `/v1/` Nginx location now sets `proxy_request_buffering off` and
  `proxy_buffering off`, streaming authenticated uploads directly to the loopback ingestion API.
  The Helper UI location also disables response proxy buffering. Helper uploads and pages therefore
  no longer depend on the server's failing Nginx body/proxy temporary directories.
- `scripts/deploy-production-nginx.sh` stages the tracked config, preserves a timestamped rollback
  copy, validates with `nginx -t`, reloads only after validation, restores on activation failure,
  and sends a valid 1 MiB JSON request through the public hostname. Fastify's exact HTTP 422
  `validation_failed` response proves the body reached application validation; an edge 500 or any
  other response fails the deployment.
- Companion retry failures are now stored with their retry key. An automatic cooldown restores that
  exact failure and stops reconciliation before another enabled installation can replace it with a
  success state. Stale retry state is removed when a file changes or disappears.
- A two-installation regression test proves a deferred failure cannot be masked by work from another
  product.
- Companion `0.3.4` was built and published for macOS Intel, macOS Apple Silicon, Windows x64, and
  Linux x64. This Mac was upgraded from `0.3.1` to `0.3.4`; its settings, scan state, and
  OS-encrypted 0600 credential file were preserved. The old application remains as the recoverable
  `/Applications/WoW Trader Companion 0.3.1 backup 20260930.app` copy.

### Recovery and verification

- After the graceful reload, the unchanged saved scan retried automatically and processed without
  editing or recreating its payload.
- PostgreSQL and the public scan-status endpoint both return scan
  `78751705-721a-4873-9339-1532d7e385b7`, completed at `2026-09-30T12:21:15Z`, with 2,357 item
  markets and 8,112 price levels for `UNKNOWN / ClassicBetaPvP / alliance`.
- The live Forever Trader uses the exact published build-70124 catalog and reports a fresh scan.
- The production Nginx config contains all three streaming directives. A 1 MiB public smoke request
  returned HTTP 422, and no later Helper body/proxy temporary-file error was present.
- Both Helper PM2 processes remained online. No application restart, database migration, or token
  replacement was required.
- The public release manifest reports `0.3.4`; all four download endpoints return HTTP 200 with
  content lengths matching the manifest.
- Full `pnpm check`, `pnpm format:check`, `git diff --check`, deployment-script shell syntax, both
  DMG verifications, both ZIP integrity checks, and HTTP 206 range requests for all four public
  artifacts passed.
- Commit `87f9101` is pushed to `origin/main`. Immutable application release
  `kfc-helper-nginx-streaming-20260930-r18` repeated the full check and formatting gates on the
  server before activation. PM2 reloaded and saved only the two Helper processes; `kfc-website`
  remained online and was not restarted. Release r17 remains the immediate rollback.

## Forever scan upload failure after Save and `/reload`

### User-visible problem

After completing and saving a Forever Auction House scan, reloading WoW, and pressing **Check for
scans now** in the desktop Companion, the live Trader remained on the previous scan. The Companion
briefly attempted the upload and then incorrectly displayed **All saved scans are up to date**.

This was not a file-discovery, addon-save, token, endpoint, or realm-selection failure. The Companion
found the new SavedVariables file and uploaded the correct scan. The production ingestion transaction
failed while rebuilding derived price signals.

### Incident evidence

- SavedVariables file:
  `/Applications/World of Warcraft/_classic_beta_/WTF/Account/411412029#1/SavedVariables/WowTraderCollector.lua`
- Failed and later recovered scan ID: `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f`
- Market: `UNKNOWN / ClassicBetaPvP / alliance`
- Scan completion time: `2026-09-29T02:19:14Z`
- Accepted result: 2,378 item markets and 8,458 price levels
- Local Companion activity initially showed `scan_detected`, `uploading`, HTTP 500 `error`, and then
  the misleading `up_to_date` state.
- PostgreSQL reported: `value "9999998990000" is out of range for type integer`.

Item 43, Squire's Boots, caused the overflow. Its historical normal ask was approximately 100 copper,
while the new scan contained two listings at 99,999,990,000 copper. The resulting valid difference
was 9,999,998,990,000 basis points, which cannot fit in PostgreSQL's signed 32-bit `integer` type.

### Implemented fixes

#### Database and market calculations

- Migration `packages/db/migrations/0015_market_signal_bigint.sql` changes both unbounded derived
  columns on `market_item_signal` from `integer` to `bigint`:
  - `difference_basis_points`
  - `supply_ratio_basis_points`
- `packages/db/src/schema.ts` maps both columns with Drizzle `bigint(..., { mode: "number" })`.
  Current values remain below JavaScript's safe-integer limit, including the incident value.
- `apps/web/src/lib/market-item-browser-data.ts` uses the PostgreSQL `bigint` maximum as its null-last
  sorting sentinel instead of the old signed-32-bit maximum.
- `packages/market/src/price-intelligence.test.ts` contains a regression using the incident-sized
  listing jump. It expects a `spike_risk` signal and the exact 9,999,998,990,000 basis-point delta.

#### Companion status accuracy

- `packages/companion-core/src/service.ts` now tracks when an automatic retry is deferred by its
  cooldown. It preserves the current error snapshot instead of overwriting it with a false
  **All saved scans are up to date** state.
- `packages/companion-core/src/service.test.ts` verifies that an upload error remains visible during
  the automatic retry backoff.
- Companion `0.3.4` now contains this correction, is published for all four supported platform/
  architecture combinations, and is installed on this Mac. Its token and settings were preserved.

#### Ingestion logging

- `apps/ingest-api/src/app.ts` logs a bounded error summary containing the error name, first message
  line, code, and selected database-cause fields.
- It no longer serializes the entire Drizzle query and many thousands of bound parameters into the
  PM2 error log when ingestion fails.

### Production rollout and recovery

- Active release: `kfc-helper-market-bigint-20260929-r17`
- Active release path:
  `/home/wow-trader-system/releases/kfc-helper-market-bigint-20260929-r17`
- Immediate application rollback: `kfc-helper-companion-arm64-20260928-r16`
- Verified pre-migration backup:
  `/home/wow-trader-system/shared/backups/wow_trader-pre-market-bigint-20260929.dump`
- Backup size: 15,826,451 bytes
- The custom-format archive passed `pg_restore --list`.
- Migration `0015` was first tested against a disposable database restored from that production
  backup. Both columns reported `bigint`; the disposable database was then removed.
- Migration `0015` was applied to production using the database owner environment.
- PM2 reloaded `kfc-helper-web` and `kfc-helper-ingest`, saved its process list, and both loopback
  health checks passed.
- The unchanged original saved scan retried successfully after activation. No scan payload was
  edited or recreated.

### Final verification evidence

- Production `market_scan` contains scan `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f` as accepted.
- Production signal for item 43 is:
  - signal: `spike_risk`
  - current price: 99,999,990,000 copper
  - normal price: 100 copper
  - difference: 9,999,998,990,000 basis points
  - observation count: 7
  - as-of scan: `a39e53b9-33b3-48c5-81fb-e6b5f4d0dc9f`
- Public status endpoint returns that exact scan for product `wow_classic_beta`, region `UNKNOWN`,
  realm `ClassicBetaPvP`, and Auction House type `alliance`.
- The live Forever Trader renders **Fresh scan · 2,378 markets** for that market.
- Local Companion `state.json` records the scan ID as uploaded and its activity log reports
  **Scan processed successfully**.
- Production release pointer resolves to r17; both Helper PM2 processes are online and the ingestion
  error log was empty after activation.

### Checks run successfully

- Full staged production `pnpm check`: lint, typecheck, tests, and builds
- Staged production `pnpm format:check`
- `@wow-trader/market` focused tests: 5 passed
- `@wow-trader/companion-core` service tests: 3 passed
- `@wow-trader/ingest-api` tests: 9 passed
- Typechecks for database, Companion core, ingestion API, and web
- `git diff --check`
- Disposable production-backup restore and migration rehearsal
- Production schema inspection, PM2 health checks, public API check, and live page check

One initial local focused-test invocation used a repository-relative path after pnpm had already
changed into the package directory, so Vitest found no files. It was immediately rerun with
`src/price-intelligence.test.ts` and all five tests passed.

## Important continuation notes

- The repository worktree contains multiple intentional, uncommitted changes from the wider
  cross-platform Companion and Trader work. Do not reset, revert, or discard them.
- The incident fix and migration are deployed but not committed or pushed. The user did not request
  a commit for this fix.
- Before the next schema migration, take another custom-format PostgreSQL backup and rehearse the
  migration on a disposable restore when practical.
- Companion `0.3.4` is the current published and locally installed release. Keep future release
  manifests immutable and continue checking every artifact checksum before switching `latest.json`.
- Never log or commit the private collector token. Local credentials remain in the operating
  system-backed Companion credential store.

## Local “Start PostgreSQL” fallback and Forever build 70058 bootstrap

### User-visible problem

The local Forever Trader rendered:

> Start PostgreSQL, apply the migrations, import a validated catalog snapshot, and set DATABASE_URL.
> No sample prices are shown as real market data.

Production was not affected. All checked live routes and both production PM2 processes remained
healthy. The local `wow-trader-postgres-1` container had exited, and the default local bootstrap was
still targeting `wow_anniversary`, so it could not supply a current Forever catalog/scan after the
Beta client updated.

### Recovery and build update

- Restarted `wow-trader-postgres-1`; its persistent volume was intact.
- Applied all 16 migrations, including migration `0015` from the preceding incident.
- Confirmed the local database retained seven catalog builds, 210,931 item-version rows, 15,162
  recipes, and the existing market scans before the new build import.
- Set the ignored local `.env` to `WOW_PRODUCT=wow_classic_beta`, making the existing single
  `pnpm dev` command target the active Forever development client and SavedVariables folder.
- The installed Beta client had advanced to `1.60.1.70058`. The old catalog WoWDBDefs pin did not
  contain a matching `Item` layout, so catalog extraction correctly stopped instead of guessing.
- Updated the catalog and world extractor defaults to exact WoWDBDefs revision
  `c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1`, whose upstream commit is **Merge 1.60.1.70058** and
  contains exact build entries for every catalog table used by the extractor.
- Catalog parser failures now name the DB2 table, client version, and definitions revision instead
  of reporting only `No definition found for this file`.
- `--definitions-revision` now requires an exact 40-character Git SHA.

### Immutable world snapshot fix

World snapshot paths previously included product, build, locale, hotfix hash, schema, and extractor
version, but omitted the WoWDBDefs revision even though the manifest recorded it. Re-extracting the
same client/hotfix with corrected definitions therefore collided with the preserved old directory.

New snapshots include `definitions-<revision>` before `extractor-<version>`. The previous snapshot
was not deleted or overwritten. The build-70058 snapshot using the new reviewed definitions is:

`artifacts/local-world/world-snapshots/wow_classic_beta/70058/enUS/3055d2ff81ef7d72d4c25e5087d3e2eecd97a4ba49a765eb3080b7eab77ff519/world-snapshot-manifest.v1/definitions-c79f208203f8d6ce2a5e2e7dcb34ab6606ae5ab1/extractor-0.3.0`

### Verified local result

- Catalog `wow_classic_beta 1.60.1.70058` is published locally with:
  - 23,605 named items
  - 12 professions
  - 2,239 valid recipes
  - 2,948 decoded item icons and no unavailable icon assets
- The catalog integrity audit verified all 102 artifacts with no normalized-field or raw-record
  mismatches. Relationship validation passed with no issues.
- The updated world snapshot audit passed with 72 maps, 1,672 decoded map tiles, 342 encounters, 73
  criteria-backed bosses, 6,605 quest IDs, and 1,288 item-source hints.
- The local watcher processed all eight saved Forever scans, including current build-70058 scan
  `d833de11-c1d2-457b-ad5d-a30f3a79d810`.
- That scan contains 2,362 item markets and 8,477 price levels with 100% reported coverage.
- `http://localhost:3000/forever/trader` renders **Fresh scan · 2,362 markets**, catalog
  `1.60.1.70058 · build 70058`, and no longer contains the PostgreSQL fallback.
- `pnpm dev` remains running with Next.js on port 3000, the local ingestion API on port 4000, the
  Forever SavedVariables watcher, and healthy PostgreSQL on port 5432.

### Production follow-up

The same build mismatch then appeared in production: scan
`d833de11-c1d2-457b-ad5d-a30f3a79d810` had processed successfully, but production only had a
published build-70009 catalog. The Trader correctly exposed **Build 70058 · review pending** and
**No published catalog matches Auction House build 70058**, so it could not calculate crafting
results from a mismatched recipe graph.

- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70058-catalog-20260929.dump`
  (16,063,818 bytes).
- Diffed build 70009 to 70058: 27 item IDs added; zero removed or changed items; no spell,
  profession, recipe, or transformation changes.
- Synchronized the immutable 13 MiB catalog release to
  `/home/wow-trader-system/shared/catalog-releases/wow_classic_beta-70058-enUS-3055d2ff-c79f208`.
- Re-ran the complete 102-artifact catalog audit and relationship validation on the production
  server, then imported it as `review_required`.
- Synchronized, checksum-verified, and activated media release
  `wow_classic_beta-70058-enUS-3055d2ff-c79f208` with 2,948 icons.
- Published catalog build ID `457e6227-85f5-4053-ab39-5f6898c0cf17` only after the media gate passed.
- Reloaded only `kfc-helper-web` to clear its prior catalog cache; ingestion remained online.

Final production verification:

- Live Trader reports catalog `1.60.1.70058 · build 70058` and scan `2,362 markets`.
- The catalog gate and PostgreSQL fallback are absent.
- The unfiltered crafting view renders 50 opportunity rows.
- Auction House item search for `scroll` returns actual listings and market-history panels.
- A newly added build-70058 item icon (`Wail of Death`, file-data ID 135474) returns a valid PNG.
- Production contains 23,605 build-70058 item rows and 2,239 recipe rows.
- PM2 reports both Helper processes online; the active application release remains r17 because this
  correction was a catalog/media publication, not an application-code deployment.

## Forever build 70124 exact-catalog gate

### User-visible problem

Forever scan `41c16940-f286-43e0-ba25-705aca0ccfe8` uploaded and processed successfully, but the
Trader displayed:

> Build 70124 catalog is under review

This was not another upload failure. Production intentionally refused to calculate profits from the
older build-70058 recipe graph because the new scan identified client build 70124.

### Recovery

- Confirmed the installed Beta client is `1.60.1.70124` and the saved scan contains 2,366 markets
  and 8,369 price levels with accepted scan quality.
- Pinned both local catalog and world extraction to exact WoWDBDefs revision
  `005c13a9a101e64014eeb02af3a42ccbeaf8513d`, the reviewed `Merge 1.60.1.70124` revision. It contains
  an exact 70124 layout for all 36 catalog tables used by the extractor.
- Extracted and audited 23,605 named items, 12 professions, 2,239 recipes, and 2,948 item icons.
  All 102 catalog artifacts passed integrity verification and all catalog relationships validated.
- Diffed build 70058 to build 70124. No player-facing items, spells, professions, recipes, or
  transformations were added, removed, or changed.
- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70124-catalog-20260930.dump`
  (22,101,567 bytes).
- Synchronized immutable catalog release
  `/home/wow-trader-system/shared/catalog-releases/wow_classic_beta-70124-enUS-3055d2ff-005c13a`,
  then repeated the audit and relationship validation on production.
- Imported the catalog as `review_required`, synchronized and independently verified all 2,948
  icons in media release `wow_classic_beta-70124-enUS-3055d2ff-005c13a`, and only then published
  catalog build ID `196c3b07-ca1e-49d3-b919-208401b4887e`.
- Reloaded only `kfc-helper-web` to clear its 30-second catalog cache. The ingestion service remained
  online and retained its restart count.

### Production verification

- The exact build-70124 database row is `published` with 23,605 item rows and 2,239 recipe rows.
- The accepted scan remains build 70124 with 2,366 markets and 8,369 price levels.
- The public crafting page resolves `1.60.1.70124 · build 70124`, renders 50 opportunity cards, and
  contains neither the review gate nor the no-matching-catalog limitation.
- Auction House item search for `scroll` returns 30 results, and a build-70124 item-media request
  returns a valid PNG.
- `kfc-helper-web` and `kfc-helper-ingest` are both online. The application release remains r17;
  this correction published data and media rather than changing the deployed server code.

## Forever build 70205 exact-catalog gate

### User-visible problem

The latest Forever scan uploaded and processed successfully, but the Trader displayed:

> Build 70205 catalog is under review

The accepted scan was already in PostgreSQL. Profit calculation was deliberately gated because the
new client build did not yet have an exact published item-and-recipe catalog.

### Recovery and verification

- Matched client `1.60.1.70205` to exact WoWDBDefs revision
  `3e46d21a41a07ce7e63835fd79c561e0d5dce92b` (`Merge 1.60.1.70205`) and extracted the installed
  hotfix cache with SHA-256
  `eba98a15545c5390353d1c3f3b7e55c1a466f098adc390873a3ebaa2ab81f295`.
- The local and production audits verified all 102 artifacts. Relationship validation passed with
  23,740 items, 31,731 spells, 12 professions, 2,239 recipes, 7,448 recipe inputs, and no issues.
- Compared build 70124 with 70205. The item catalog has 138 additions, three removals, and 183
  normalized record changes; the spell catalog has 44 additions, 16 removals, and 768 normalized
  record changes. The recipe inputs and outputs are unchanged and no recipes were added or removed.
  Only recipe spells `1249107`, `1249112`, and `1249114` gained a three-second craft time; the
  remaining 28 changed recipe records differed only in retained raw evidence.
- Created and verified custom-format backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-forever-70205-catalog-20261004.dump`
  (29,049,471 bytes).
- Synchronized immutable catalog release
  `wow_classic_beta-70205-enUS-eba98a15-3e46d21`, imported it as `review_required`, then
  checksum-verified and activated its 2,949-icon media release before publication.
- Published build ID `ccb5edd9-8494-4352-ac91-7deab04904b1` and reloaded only
  `kfc-helper-web`; the ingestion process remained online without a restart.
- Production retains accepted scan `1309b399-ca4b-4c57-a13c-fa34eee3a2c7`: build 70205,
  `ClassicBetaPvP` Alliance, 2,940 item markets, 12,468 price levels, and 100% accepted coverage.
- The live Trader resolves catalog `1.60.1.70205`, exposes crafting results, and no longer contains
  the review gate. Forever item media returns HTTP 200 from the newly activated release.

## Automatic catalog guardian and build-70205 hotfix refresh

- Added a semantic promotion classifier that ignores retained raw-record drift and harmless
  item/spell metadata or craft-time updates, while blocking profession changes and any recipe or
  transformation reagent, output, yield, cooldown, or requirement change. Missing hotfixes, unknown
  definitions, extractor changes, backwards builds, and item/spell count drift above 10% also stop
  automatic promotion.
- Added an idempotent maintainer-only guardian that detects both numbered client builds and same-build
  `DBCache.bin` changes, resolves the exact `Merge <client-version>` WoWDBDefs revision, extracts,
  audits, validates, classifies, generates media, takes a unique verified production backup, stages
  immutable catalog/media releases, repeats validation on the server, publishes, and reloads only
  `kfc-helper-web`.
- Installed macOS LaunchAgent `online.kfcguild.wow-trader-catalog-guardian`. It watches the Forever
  build manifest and hotfix cache and has a five-minute retry interval. It uses the existing batch
  SSH identity; no collector token or database owner credential is stored in the agent.
- The first real run detected a same-build hotfix change from `eba98a15…` to `f1e43a57…`. The new
  snapshot passed all 102 artifact checks and relationship validation with 23,819 items, 31,731
  spells, 12 professions, and 2,239 unchanged recipes. The compatible delta added 79 items and no
  recipe-economy changes.
- Created verified rollback backup
  `/home/wow-trader-system/shared/backups/wow_trader-pre-wow_classic_beta-70205-f1e43a57-catalog-20261004.dump`
  (35,029,084 bytes), activated release `wow_classic_beta-70205-enUS-f1e43a57-3e46d21` with 2,951
  verified icons, and published build ID `3df286a3-8940-4f42-93c0-6ede4ff28076`.
- A second guardian run was a no-op and recorded `current`, proving idempotence. The live Trader still
  shows build 70205, 2,940 markets, and crafting results with neither exact-catalog warning; Forever
  icon media returns HTTP 200. Web and ingestion processes remain online, and ingestion retained zero
  restarts.

## 2026-10-05: Dungeon route integration and accounting (local only)

- Added a character/release-scoped dungeon sidecar, leaving source step IDs/order, bookmarks and
  completion untouched. Finished visits retain their optional source branches; viewing a pickup
  marker does not change the reading position. Rejoin returns to the current source row.
- Removed pseudo punch-card quest IDs from public chains, separated the explosives follow-up from
  its earlier stage and made the Paladin weapon a final-chain reward rather than a reward per run.
- Accepted-only prerequisites no longer add reward XP or require their dungeon objectives. A
  prerequisite needing another instance or an outdoor hand-in/return blocks a single-run scenario.
  Unknown or unsatisfied OR branches cannot be priced by summing all alternatives.
- Deduplicated shared quest rewards and travel activity IDs; already rewarded and retained-route
  rewards contribute no incremental XP. Choice rewards are exclusive. Missing current XP remains
  unknown, not zero, and illustrative offline values require explicit opt-in.
- Scenario inputs and explicit game states survive reloads. Backup imports preserve the existing
  dungeon release in full, so an older backup cannot resurrect an intentionally removed confirmation.
  Fractional XP and reversed time intervals cannot create a recommendation.
- Added lazy build-checked reward item previews with validated data and explicit 404/409/503 states,
  timeout/retry and Wowhead fallback. No live gear-upgrade or kept-item cash value is invented.
- Current-release stored/imported plans validate catalog membership before rendering; invalid
  quest IDs, visit bundles and reward choices fail safely without replacing existing progress.
  Canonical STOCKADES/GNOMER/ULDA tags match the source archive's branch matcher and are audited.
- Verification passed: 60 leveling and 174 web unit tests, typechecks/lint, 157-chapter archive audit,
  isolated production build, 30 existing leveling Playwright tests and four dedicated dungeon browser
  groups. Live positive database preview and in-game XP/travel checks are still required. No commit,
  push, production deployment, database migration or addon/scanner change occurred in this task.
- Full implementation/maintenance notes: `docs/forever-leveling-dungeon-implementation.md`; current
  coverage: `docs/forever-leveling-dungeon-coverage.json`.

## 2026-10-05: Full-path dungeon expansion and At-level enforcement (local only)

- Added chapter-level dungeon candidates for the complete visit catalog, not just Thanes. Schedule
  checks enforce At level for premades too, raise it for selected prerequisite/pickup minima and
  retain unknown or above-cap visits as references. A checkpoint cannot promise beta level 31.
- Fixed the suffixed UBRS source heading and its catalog alias. All 12 UBRS quest rows are now
  present; the main artifact has 228 associations/224 unique table IDs and the union 271 records.
  Known sections/wings, all reviewed rows, identity restrictions and table columns fail closed.
  Five importer regressions include a lost optional row with otherwise complete section coverage.
- Added generic source-pinned trip instructions, immutable quest bundles, independent chapter/visit
  progress and checkpoint assumptions, actual hand-in XP updates, Undo and exact outdoor return.
  v2 migration clones legacy Thanes only once, retaining v1 and existing progress in backups.
- Browser testing found that trip activation enabled a source `DM` tag and hid the saved `!DM`
  outdoor row. Generic activation no longer changes source branches, and bookmark validation uses
  the actual branch. Hidden/unresolved rows and changed source evidence are blocked, not remapped.
- Corrected a long disabled trip-button label overflowing at 320/390 px. Mobile and desktop
  reference/trip screenshots were reviewed; shared fixed-map/manual Next/Done semantics remain intact.
- Verification passed: 94 leveling and 194 web unit tests; five importer tests; six new trip, four
  reference, six Thanes and five chapter-tree Chrome regression groups. These check strict premade
  floors, competing saved choices, exact source rejoin, reward/XP isolation, reload/backup, future
  references, 1440/390/320 px overflow and automated WCAG A/AA accessibility.
- Both feature packages passed lint/typecheck; changed scripts passed ESLint/Prettier. The leveling
  build and an isolated Next production build passed (59 generated pages). The checked coverage
  audit validates 157 chapters and 242 visit/quest rows. `git diff --check` passed.
- Remaining evidence: later life cycles/reward observations, travel/clear timing, scoped multi-visit
  chains and reviewed omitted-step/bridge adapters. Thanes is still the only authored outdoor
  XP-segment replacement; other new trips retain the entire outdoor route. See
  `docs/forever-leveling-dungeon-expansion.md`. No commit, push, deployment, production/database/addon
  write, dependency installation or dev-server restart occurred.

## 2026-10-05: Dungeon alternative discovery and presentation (local only)

- Replaced hidden names and long expanded stacks with visible gold-accented dungeon cards. Names,
  required levels, selected quest counts and known/estimated XP stay visible; each quest plan starts
  collapsed. Native mouse/keyboard accordions open one option at a time within each chapter.
  Selected/saved trip labels and resume links preserve the existing independent trip bookmarks.
- Added a full-path discovery shortcut and a fixed reader-toolbar shortcut. These reveal alternatives
  without selecting/completing a source row or starting a dungeon trip. Existing Hall of Thanes
  styling, route calculations, strict At-level floors and outdoor-route retention are unchanged.
- A new Thanes shortcut regression initially failed: the shared reader replaces history rather than
  emitting `hashchange`, so the legacy section stayed closed. Its navigation callback now explicitly
  reveals the panel; the passing regression verifies source bookmark/progress stay unchanged.
- Generic review screens now keep XP/time comparisons and quest preparation in separate collapsed
  panels. Inputs survive close/reopen. Single-visit reviews no longer show the unrelated future-visits
  checkbox; the complete reference library retains that filter.
- Verification passed: 194 web unit tests, web lint/typecheck, changed-script ESLint, Prettier and
  `git diff --check`. Chrome regression passed seven option/trip, six Thanes, five chapter-path and
  four full-reference groups. Cards and fixed reader shortcuts were checked at desktop, 390 px and
  320 px; no horizontal overflow or automated WCAG A/AA violations. Screenshots were reviewed.
- An isolated Next production build passed with 59 generated pages. No schema, dungeon data,
  dependency, production/database/addon write, commit, push, deployment or dev-server restart was
  included. Current UX/maintenance notes: `docs/forever-leveling-dungeon-expansion.md`.

## 2026-10-05: Scoped dungeon plans and actual-XP-gated alternatives (local only)

- Authored geographic/faction preparation, clear scope and hand-in itineraries for all 32 visit
  variants, including separate SM wings, BRD subruns, Maraudon scope and endgame references.
  Plans use the existing quest IDs, prerequisite closure, restrictions and source evidence; missing
  rewards/access and above-cap content remain unknown/reference-only, not invented runnable routes.
- Replaced equal-weight cards with a prominent Thanes-style plan and collapsed other journeys.
  Selected quest XP, checkpoint/gap and full client-curve endpoints stay visible; View plan expands
  ordered pickups, objectives and hand-ins. Review pages use the same itinerary and retain the
  separate detailed XP/time comparison and quest library.
- New DM plans use six core quests unless the explosives chain is prepared or explicitly selected.
  Alliance WC is offered in Stonetalon/Ashenvale 21–23, not from Stormwind/Redridge; Smart Drinks is
  optional when unprepared. New trips persist itinerary mode so Continue/reload/URL changes cannot
  restore the earlier floor or a different bundle. The constructor enforces the same floor as UI.
- DM and Alliance Ruins now implement a source/hash-pinned Redridge 19→20 replacement for the
  audited Human Warrior at 1× outdoor XP. The bridge retains the later Redridge Shoes/Gnolls chain,
  Cooking 50, Corruption Abroad and class/utility preparation. Actual reported valid level-20 XP,
  fresh rewards and explicit dependency checks gate the exact Darkshore continuation. A shortfall
  links back to the saved route for top-up, without marking source instructions done/skipped.
- Separate `--alternative` records and strict optional continuation snapshots preserve older
  generic trips, competing plans, source bookmarks and backups. Changed source/character evidence
  blocks reuse with an explanation. A regression caught the missing inactive-review explanation;
  it is now visible. Other variants remain optional trips pending their own bridge review.
- Retained mixed source rows are scoped to quest 124 rather than unrelated Everstill Bridge/scales
  tasks. Continuation map steps are namespaced to avoid collisions with original ordinal IDs;
  rejoin uses a next-chapter source reference, not the old AH bookmark or an invented travel pin.
- Verification: 104 leveling and 195 web unit tests; package lint/typechecks; changed-script ESLint;
  formatting and diff checks; leveling build and isolated production Next build (59 generated pages).
  Chrome checks cover the new actual-XP bridge, core bundles, separate old records, WC mode/floor,
  source changes, map target, existing Thanes, generic trips, full path and reference library.
  Desktop/390/320 px layouts and automated WCAG A/AA checks passed; screenshots were inspected.
- Test-environment recovery: the isolated preview needed the same extracted world snapshot/media
  configuration as dev. The simulated denied-storage test also encountered the development overlay;
  rerunning on the configured production preview passed without weakening assertions. Builds were
  rerun with finished leveling declarations after an initial concurrent-build race.
- Full all-dungeon matrix and remaining review/timing scope:
  `docs/forever-leveling-dungeon-route-choice-plan.md`; maintenance contract:
  `docs/forever-leveling-dungeon-expansion.md`. Context is current. Travel/clear timings and more
  race/class/wing replacement adapters remain evidence work; no automatic fastest-route claim.
- No commit, push, deployment, production/database/addon write, dependency installation or restart
  of the user's running localhost:3000 dev server was included.
