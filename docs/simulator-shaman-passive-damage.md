# Restoration Shaman passive-damage set references

## October 26, 09:57 UTC checkpoint

The expanded assignment now accounts for all 104 source set-bonus rows. Two of
the old 24 inactive classifications required new treatment after resource and
Adaptive damage were admitted. The other 22 remain inactive under the source-bound
stationary assignment; every equipment candidate remains available. This is a
qualified mechanics component, not a completed BiS study or release.

## Necropile Raiment

Three actual pieces own root 1299737 and enemy-targeted Shadow life drain
1299735. The current payload is 28 life with no power coefficient. The captured
recovery field is 10, used under the explicit milliseconds reference. The client
record's default chance does not prove the server chance or proc chaining.

The owned policy therefore has a cast-only reference and a separate
`adaptive-damage-reference` with an explicit finite chance. The prepared finite
sensitivity choices are zero and one, not estimated server probabilities. Adaptive
must actually be equipped for that reference. The declared outcome is a
noncritical hit; ordinary target mitigation still applies. This is a bounded
reference comparison, not a universal upper bound on an unknown server script.

Only the actual owned Adaptive enemy-damage event can generate the drain. Helpful
casts, Rune/Circle self damage, foreign casters, wrong tags and friendly recipients
do not qualify. The child cannot recursively trigger itself or be manually cast.
Recovery applies between opportunities. Actual damage, rather than nominal base
damage or healing power, determines the owner health gain. Health caps and dead
owner checks apply. This self support cannot inflate external healing credit.

## The Postmaster

Four actual pieces own root 1302380 and Return to Sender 1302378. Under the
explicit after-hit/strictly-below reference, damage taking the living owner below
25% health activates a six-second, one-charge buff with 180-second recovery.
The source describes reflecting a hostile sender. The declared self-ineligible
reference leaves Rune/Circle damage unchanged and does not consume the charge.
Expiry and cooldown are exercised. Foreign-caster reflection remains outside
this controlled assignment; the model does not claim to implement that encounter.

The two sets can coexist: Necropile's shoulder, wrist and boots fit alongside
Postmaster's head, chest, legs and ring. The independent ownership test uses that
actual combination. Never infer slot compatibility from the set's name or assume
both sets occupy the same five slots.

## Runtime and verification

New policies must match the actual owned thresholds. The workload requires them
before pre-pull alongside all existing effect policies. They require a fresh,
positioned, living actor, retain independent copies of nested chance pointers,
reject reconfiguration after events and retain policy/reset transient state
between iterations. Existing production outside Restoration is unchanged.

All **259 native/Chromium controls and 2,262 measurement groups agree**. Thirteen
new controls add 19 groups. All 2,243 parent groups were independently rechecked:
2,242 retain their values within 1e-7 absolute/relative tolerance; the ownership
control deliberately increases from seven to eight checked policies. One existing
metric record gains exactly the source Postmaster aura with zero uptime and
`aggregator_data.n=1`. The inheritance comparison permits only that exact metadata
addition. Nonzero uptime, any other row or changed combat metrics still fail.
Runtime/request identities and the new explicit policy metadata change as expected.

Two repeated real browser Worker jobs agree with complete standalone replies.
Four malformed jobs reject, including unknown nested passive-damage behavior.
Ten real compiled faulty implementations are caught: incorrect piece thresholds,
ignored recoveries, excessive leech healing, self-damage eligibility, an inclusive
threshold, incorrect duration units, borrowed chance pointers and ignored chance.
Fourteen portable tests, scoped ESLint/Prettier/Go formatting and full simulator
compilation pass. Final review replays 4,188 original client rows, complete critical
spell records, source generation, request identity and 1,577 file pins.

The 741 compiler inputs preserve 732 of 737 parent inputs, change five owned files
and add four. Successful sources/readers are frozen; derive successors. No numerical
optimization clock, BiS selection, Git operation, application change or deployment
occurred. The complete all-class DPS/tank/healer goal remains active.

## Receipts and recovery

All paths below are relative to
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`.

| Receipt | SHA-256 |
| --- | --- |
| `shaman-passive-damage-sets-v1/capture-FxeQy9/report.json` | `d1dba14fc83e5057645ac5865dd65704f2d45f2984f5e354e2b79f6156b4a897` |
| `shaman-passive-damage-sets-v2/build-brKAVI/report.json` | `5eb2ef2c7cdf6939bba63cfa61a3715d2e021625c899a01ed7c0869bf31a4e47` |
| `shaman-passive-damage-sets-v2/build-brKAVI/browser-review-9WkzIV/report.json` | `27f870527ea09502f11427054d0c816627266232d9adc06b006b2f8802efea99` |
| `shaman-passive-damage-sets-v2/build-brKAVI/mutation-review-pMs84c/report.json` | `47b07f5c54e6ebe606a8a25fa75ddea0395710de51c6af257c9a012437869676` |
| `shaman-passive-damage-sets-v2/build-brKAVI/final-review-VZ4Ypw/report.json` | `696db8d37208beb49294b35ce6c11fd0adbda726d23c106170d423f2cc349225` |

Fixture: `infra/simulator/fixtures/shaman-passive-damage-sets-source.v1.json.gz`,
SHA `196bd03d459310ccea05a4551a8cee0ba7aafbf97ff910f2f10ea54a5998430a`.
Model identity: `e093481b599396e609e36f9274c416c55ae43227c9d1b0ecb6f60d6ae2217924`.
Runtime identity: `b4f4fcc36204f5236ab903789af9dce082757504cedaf99bd67d8c54466ad8e2`.
Current workspace: `shaman-passive-damage-sets-v2/build-brKAVI/workspace`.

Retain these earlier attempts and their actual sources:

- V1 `build-y9OYxT` passed all 255 native controls, but the old inheritance reader
  rejected the new zero-uptime aura and ownership count. Its recovery V2 reader
  expected an obsolete Go output whitespace shape and failed before compilation.
  Recovery V3 `review-fXvVPi` replayed the retained native evidence and built the
  unchanged model without rerunning native controls. It is superseded by V2.
- V2 `build-vNDLRB` and `build-ACfF9X` retain the adversarial test's missing
  protective policy. The real healing guard correctly refused the cast even
  though the target, mana and GCD were valid. The successful guard supplies the
  actual owned protective reference before events. No engine restriction changed.
- Independent guards were added after review found that the first ownership test
  followed its implementation's flags too closely. They check literal expected
  thresholds, legal coexistence, actual damage-to-health equality and used timers.

The successful producer is `prepare-shaman-passive-damage-sets-v3.mjs`; its output
directory is intentionally V2. Do not restart failed readers or mutate frozen code.

## Remaining study prerequisites

Current full-v2 support already means improved passive raid buffs and **zero
external Innervates, Power Infusions or Mana Tide copies**. Own learned Mana Tide,
Water Shield and controlled items are modeled. Record that availability explicitly
in study scenarios and guidance; raid-wide buffs do not mean unlimited resource
cooldowns. Any added external grant needs its own qualified controller and declared
availability. Current synthetic health-only recipients also do not establish the
raid's useful Mana Tide utility without explicit mana pools/spending assignments.

Current Dual Wield/Earthliving grants remain unresolved by the captured shared
client records. Two optional gameplay questions were sent to the owner on October
26 after this checkpoint; no answer or permission is inferred from the UI's
preselected choices. Continue independent scenario work while awaiting evidence.
Legacy item, MP5 and other declared mechanic sensitivities remain explicit.

Next are bounded whole-loadout/talent/priority/consume feedback, fresh independent
2% and separate 1% confirmation, then matching defaults, Configurations, Gear Sets,
library and healing guidance with actual application/save/share/cancel checks.
Other classes, tanks, catalog coverage, debuff policy and incremental reruns remain
in scope. The owner's full commit/push/deploy request follows completed validation;
no partial release is claimed here.
