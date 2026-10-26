# Restoration Shaman recipient mana assignments

The [subsequent study checkpoint](simulator-shaman-study-preflight.md) supersedes
the roster scope below: the explicit healer constructor now builds all39auxiliary
recipients despite the inherited24-dummy cap.275native/Chromium controls/2288groups
agree. Shaman's first numerical phase completed1458requests/11664fights under its
original clock ending2026-10-27T12:50:22.097Z. The following checkpoint retains its
historical component scope and receipts.

## October 26, 11:10 UTC checkpoint

The equipped Shaman workload now supports explicit recipient mana pools and
scheduled spending. Mana Tide can restore real missing mana in these assignments.
Results report useful restoration, completed costs, unpaid costs and remaining
mana separately from external healing. This qualifies an assignment component;
Shaman's numerical BiS search and its class window have not started.

## Assignment contract

The optional equipped `recipientMana` object uses schema
`kfc-shaman-recipient-mana.v1`. Each recipient declares its actual raid slot,
maximum mana, starting mana and costs with timestamps in milliseconds. Costs may
be an empty array or null. Up to 39 auxiliary recipients and 20,000 total costs
are accepted. Invalid, duplicate or absent slots and real class actors reject.
Unknown nested JSON fields also reject. The old spell-only API stays unchanged.

The reference explicitly has no passive recipient regeneration. Costs are paid
in full when the living, enabled recipient has sufficient mana; a failed cost
has no partial payment or automatic retry. Each assignment declares whether
costs at the same timestamp happen before or after Mana Tide pulses. These are
controlled demand schedules, not simulated rotations for the other classes.

An opt-in core constructor initializes real target-dummy mana bars before
environment initialization and stat finalization. Existing core source files
remain byte-identical. Empty recipient assignments still use the original
constructor. Starting availability and demand counters reset each iteration.
Caller data is copied through the existing equipped request boundary.

The full-v2 raid preset still has zero external Innervates, Power Infusions and
Mana Tide copies. The owner's learned Tide and other admitted resource effects
remain available. Raid-wide passive buffs do not create extra resource cooldowns.

## Corrected timing and temporary capacity

A real controller-time test exposed an ordering error in the first reference:
an after-pulse cost could run before the controller cast and its immediate first
pulse. The retained old implementation pays 176 mana where the after-pulse
reference should pay 88. The current successor runs that cost after the
controller and pulse; both ordering references pass independently.

Headmaster's temporary Intellect now clamps actual mana when its capacity expires
during a fight. Normal iteration cleanup must not count that teardown as resource
spending. Separate short/long-fight controls distinguish those cases. The real
full-v2 owner loses 363 mana from the 20-Intellect expiry with its two modifiers;
the unbuffed auxiliary reference loses 300. Capacity remains bounded and teardown
does not distort time-to-empty or other inherited metrics.

## Verification

All **272 native/Chromium controls and 2,278 measurement groups agree**. Thirteen
new controls add 16 groups. All 2,262 parent groups remain equal within 1e-7
absolute/relative tolerance, including complete source requests; only runtime
and request identity fields are excluded from that inheritance comparison.

Four actual Worker jobs, alternating one and two iterations, match complete
standalone native replies. Four invalid jobs reject. The two-iteration jobs
confirm reset, averaging and repeated Worker reuse. The transport reference
reports per iteration: 200 mana demand, 100 spent, 100 unpaid, one completed and
one missed cost, 352 useful Tide mana restored to other recipients, 252 remaining
recipient mana and 50 external support HPS. Mana restored is not assumed to have
been spent or converted to damage/healing.

Twelve actual compiled faulty implementations are caught: eleven by native
behavior controls and one by the actual two-iteration job. The latter detects a
reported spent mean of 200 instead of 100. Seven already-recorded genuine fault
results are source/overlay/binary/log verified and reused. An earlier ineffective
HPS mutation was a dead store overwritten by the final calculation; it is
preserved and excluded, then replaced with a real final-result contamination.

The final review verifies 1,582 file pins, regenerates the owned source from its
captured parent, reconstructs both actual request identities, checks the original
failed first-pulse regression and replays native/browser/inheritance evidence.
Seventeen portable tests, scoped ESLint/Prettier and Go formatting pass. The
current build also compiled the full simulator and standalone/WASM engines.
Its 745 compiler inputs preserve 736 parent files, change five owned files and
add four. No additional combat optimization, application change or deployment
is implied by these component checks.

## Receipts and recovery

All paths below are relative to
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`.

| Receipt | SHA-256 |
| --- | --- |
| `shaman-mana-recipients-v3/build-PNa6Lx/report.json` | `6ec7d866a082f22161f465af0ec0cbf46dd0eb438b8d35fbb51f615872fc5666` |
| `shaman-mana-recipients-v3/build-PNa6Lx/multi-iteration-xguWRa/report.json` | `99abf8602ca184c6e541b3400abf479057479e0d139e44cac2b3959102c0acd3` |
| `shaman-mana-recipients-v3/build-PNa6Lx/browser-review-b4CrPT/report.json` | `876b0aff8c858de1defdc3a3e4b094e1b597aff0d6849d3e3853d99bc8f8fc23` |
| `shaman-mana-recipients-v3/build-PNa6Lx/mutation-review-Uvagqc/report.json` | `0c65a953230e4916050724f8ef218b0124f5e2c85588a558e550629c07c1bbcd` |
| `shaman-mana-recipients-v3/build-PNa6Lx/final-review-ObS3x6/report.json` | `cd87e8ce62415402938e9b2a8584f0f9f99f7b53a61682abb5db131794862178` |

Model identity: `8cd6f1e50b08f01158359e51a89cc5a834200ed3c77c5e6e691f3e862a8e2585`.
Runtime identity: `626aacab0b15d2bf3bc730262944b2f3d4aca98f843526e72830ff0c6a85df30`.
Fixture: `infra/simulator/fixtures/shaman-mana-recipient-parent.v1.json.gz`,
SHA `471fae8ba3fd0cdb7cc48be03692d6652045e56f009d8bdc872735b3c27c7bec`.
Current runtime/guards are `shaman-mana-recipients-v2.go` and
`shaman-mana-recipients-guards-v2_test.go`; the producer is the private
`prepare-shaman-mana-recipients-v3.mjs`. Earlier public Go sources remain frozen
for their historical builders and are not compiled together.

Retain V1 `build-DcMInR` (wrong receiver in generated closure), V1 `build-EUDVyg`
(cleanup polluted time-to-empty), passing V1 `build-GFI528`, V2 `build-HAsvcS`
(unused fixture import), V2 `build-I06Zox` (fixture missed actual stat modifiers)
and passing V2 `build-6W7mqX`. The last contains the real failing first-pulse
regression under `first-pulse-regression-awdhribk/`. V3 supersedes its timing.
Do not overwrite passing source, rerun failed readers or discard contrary logs.

## Next work and release

Freeze scenario assignments and resource availability, then run bounded whole
gear/talent/priority/consume feedback with fresh independent 2% and separate 1%
confirmation. Current Dual Wield and Earthliving grants remain unresolved; two
optional owner questions are unanswered. The currently qualified one-hand/shield,
held-item and two-hand domain can support independent preparation meanwhile.
Do not infer live access from shared client records or preselected answers.

Defaults, Configurations, Gear Sets, library and healing guidance still need the
actual selected results and application/save/share/cancel checks. Other classes,
tanks, catalog coverage, debuff policy and incremental reruns remain in scope.
The owner requested a complete commit/push/deploy after validation, followed by
live smoke tests. The latest changes remain local and the overall goal is active.
