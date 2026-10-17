# Repeatable pre-raid simulation updates

From the repository root:

```sh
pnpm simulator:prebis:update
```

This is a local research command, not a deployment. It verifies or prepares the simulator
from the reviewed, pinned inputs, starts its own temporary loopback-only asset server, refreshes
browser request templates when their release changes, and processes configured cases serially.
You do not need to start Next.js, PostgreSQL, or a second terminal. Existing developer servers
are left alone. First setup still needs network access for the pinned toolchain/dependencies.

Read-only inspection:

```sh
pnpm simulator:prebis:plan
pnpm simulator:prebis:status
```

The plan lists catalog changes, stale results, disk space, configured cases, and missing spec
policies. Samples are limited to ten entries; `pnpm simulator:prebis:plan --details` prints the
full item/component diff. Status probes the owning PID rather than treating a progress file as
proof of liveness. After an engine update, the plan can show `recaptureRequired`; execution
refreshes those browser templates before freezing the final campaign fingerprint.

Run one spec or one scenario:

```sh
pnpm simulator:prebis:update --spec=warrior/arms
pnpm simulator:prebis:update --case=arms-alliance
```

Selections share the same campaign identity and checkpoints, so switching between a single
case and the complete configured campaign does not discard completed work.

## When new items or patches arrive

1. Extract and validate the new client catalog using the existing extraction/admission flow.
   Review item stats, effect support, recipe materials, non-raid acquisition and faction/class
   requirements. Update the pinned simulator inputs; see
   [catalog coverage](simulator-catalog-coverage.md). Finding an item in game files does not prove
   its availability, acquisition source or proc behavior. This command does not bypass admission
   or silently import arbitrary live data.
2. Run `pnpm simulator:prebis:update`. Preparation rebuilds changed pinned inputs and verifies an
   unchanged prepared release. There is no need to manually recapture, optimize or audit stages.
3. Inspect the immutable campaign result and per-case evidence. Human review and public-build
   promotion/deployment remain separate, explicit actions.

The fingerprint includes item data, other database tables (including enchants), acquisition and
craft audits, imported/current equipment, talent trees, request templates, browser asset hashes,
owned simulator/optimizer code and upstream Go/proto sources. One changed input conservatively
invalidates all configured cases: a new trinket, set bonus or hit breakpoint can change talents,
rotation, enchants and other slots. It is unsafe to rerun only the new item's slot.

An unchanged campaign verifies linked artifact hashes and reuses its checkpoints. Simulations
reuse only the existing exact-request/exact-engine cache. There is no cross-model substitution of
old scores. Missing/corrupted evidence fails visibly; old receipts are never relabelled as current.

## Per-case pipeline

```text
Fixed PvP-blue control → talent/APL search → all-slot gear/set/enchant search
                            ↑                      ↓
                            └──── actual-gear feedback ────┘
                                        ↓
                          browser/native closed-loop review
                                        ↓
                          trinket pairs → ring pairs → rotation audit
                              │                           │
                              └── proven gain → full feedback again
                                        ↓ no proven challenger
                              local reviewed build + campaign receipt
```

All occupied equipment slots are searched under the established eligibility policy, including
weapons, ranged items, legal ordered accessory/weapon pairs and set proposals. An intentionally
empty off-hand on two-handed Arms is not a missing slot. Compatible enchants are included. There
is no accessory EP cutoff or item-level floor. Screening and shortlist selection are exploratory;
not every item is tested at 100k. Final A/B validations use two disjoint 100k ranges. Accessory
audits screen all legal ordered pairs at 2k and confirm all near challengers in both 100k ranges.

A confirmed accessory gain is validated against the current legal candidate bank and recaptured
in the actual browser, then sent back through the full feedback loop. Rotation gains do the same.
Finalization checks accessory/gear/talent/rotation RNG ranges together. Hitting a configured loop
limit produces `needs-review`, never a successful export. This remains scenario-specific search,
not a proof of global BiS or an all-class ranking.

### Optional independent coverage replay

The normal update command remains the only required research entry point. For an additional
read-only audit, pass a completed gear receipt printed by the campaign, for example:

```sh
pnpm simulator:prebis:coverage --gear-review=artifacts/forever-simulator/optimization/warrior-arms-d575615f0937deff-gear.json
```

Use the matching current receipt after inputs change; stale native/data/source fingerprints are
rejected. The owned `scripts/review-prebis-gear.mjs` recomputes the numerical fingerprint and all
17 candidate pools and the current canonical talent tree/51-point legality, regenerates every
configured final-sweep proposal and follows the exact raw
80/500/2k measurements through shortlisting/selection. It also matches the four raw100k metric
references, DPS averages, legal selected/fallback gear and disjoint talent/gear/selection ranges.
Missing whole search groups are rejected, not merely missing IDs within a reported group.

The JSON report distinguishes metric references from unique cached records. If a search gain
failed independent validation, it explicitly distinguishes the stable search incumbent from
the original gear that was correctly retained. This is not new simulation evidence, expanded
weapon/set coverage, publication or proof of global BiS. It reads bounded files within the
archive, rejects symlink escapes and never builds, launches workers, changes leases or writes
receipts. It is an optional independent operator check, not a new automatic campaign stage.
The command is outside the numerical generator's dependencies; its addition did not change
the actual running campaign fingerprint or weaken any fingerprint filter.
This diagnostic covers the current DPS-search contract; tank/healer objectives need their own
metrics and audits, not a relabelled DPS result.

## Configuration and current coverage

`infra/simulator/prebis-campaign.json` defines case IDs, faction, spec, enchant scenario, loop
limits and minimum free disk space. `--config=<path>` selects another validated configuration.
Unknown fields, unsupported policies and reduced final validation precision are rejected.

Current end-to-end policies are **Arms and Fury**, each with conservative and explicitly
provisional-proc scenarios. Their existing race/profession/buff/encounter assumptions are
preserved; they are not generalized to other classes. The report explicitly lists the other
21 captured damage profiles, requested Shockadin, and tank policies as unfinished. These must
receive real class-specific talent, rotation and objective policies before being admitted to the
runner. Adding a preset or a config row alone does not qualify it as optimized. Tank threat and
survival, healing, AoE, different races and PvP access caps require distinct reviewed cases.

Conservative and provisional-proc results are separate; the latter require explicit opt-in when
eventually loaded. Existing historical-stat/proc/acquisition warnings remain in local exports.
Rank-14/exalted rewards are currently allowed; these cases are not launch-day or cheap loadouts.

## Checkpoints and safety

Artifacts live under `artifacts/forever-simulator/optimization/campaigns/<identity>/`:

- `snapshot.json`: immutable input hashes and item inventory.
- `changes-<hash>.json`: complete change reports, separate from concise terminal output.
- `state.json`: atomic checkpoints, current stage, error and per-case results.
- `result-<hash>.json`: immutable reviewed-local result linking feedback, both accessory audits,
  final rotation review and local build export. Public promotion must use these linked receipts,
  not an arbitrary gear-stage or standalone export file.

`campaigns/latest.json` selects the most recently started campaign, not a public recommendation.
Changing inputs creates another identity; it does not overwrite earlier campaigns or builds.

## Inspect builds on localhost

Open `/forever/simulator/review` on the running development server. The simulator directory
links to it in development only. Production requests return not-found before research files
are read, and the page is noindex. It displays saved evidence, not a process-liveness monitor.
Opening or refreshing the review page never starts a numerical job.

Generate a verified full-build review link with the read-only browser utility:

```sh
pnpm simulator:prebis:share --case=arms-alliance
```

It requires completed final audits by default. Explicit `--allow-pending` permits a labelled
core-reviewed preview, never a final recommendation. It checks the current numerical fingerprint
and engine/database, uses the real browser exporter and imports into another isolated browser,
then writes an immutable share receipt. Personal browser storage is untouched. The owned utility
is `scripts/review-prebis-build.mjs`: it only reads calculation inputs and tests browser imports,
not a numerical optimizer/build dependency. Adding it left the actual live campaign fingerprint
unchanged; no numerical fingerprint filter or engine source was modified. Earlier staged files
remain in the artifact archive for reference, not as the supported command.

The page only offers same-origin, full-category links for the matching campaign/release/review.
It checks local receipt hashes and final evidence links before using the reviewed label. An old
preview is not promoted automatically when calculations finish: generate its final share receipt
again. Corrupt evidence fails visibly. `--allow-pending` still requires completed core feedback;
it cannot turn a fixed-blue control or an unfinished talent search into a recommendation.

Provisional-proc links carry a restriction, never consent. The review page checks that the
case, feedback policy, share receipt and final export agree on the opt-in requirement. Before
simulating, open **Main Hand → Change enchant** in the engine and explicitly check **Allow
provisional proc models (unverified Forever behavior)**. Consent resets after reload. The browser
share verifier checks that this option is OFF in both isolated contexts; it never enables it.
The normal engine guard blocks combat requests until the user opts in.

The actual first proc core preview has now passed this command's full two-context branch and
the rendered localhost review-page link. All combat settings match the core baseline; consent
stays OFF, no combat requests run, and the page remains noindex with an unfinished label on
desktop and390px mobile. When instrumenting this test, restrict localStorage/Worker hooks to
top-level application documents: blank/sandboxed frames may deny storage access. Keep actual
page errors unfiltered. This is preview transport/safety evidence, not completion of final audits.

The proc case has since completed its final audits/export and the default final-share branch.
The review page now offers a separately generated final receipt rather than promoting the preview.
Consent inspection waits for Bootstrap's `shown.bs.modal` and `hidden.bs.modal` events: a visible,
stable Close button can still be ignored during the opening transition. The owned browser helper
does not force-hide a dialog, use a fixed sleep or toggle consent. The focused share tests use real
Bootstrap transitions to reproduce the old race, verify dismissal and reject already-enabled
consent without silently resetting it. This operator-tool change leaves numerical inputs frozen.

Before opening a build, save the current simulator character. A complete import intentionally
replaces equipment, enchants, talents, rotation, race, professions, buffs, consumes and encounter
in that browser. It does not replace website defaults. UI preferences and EP weights are omitted
by the standard full-combat share format.

## Interruption and concurrent work

Ctrl+C stops the active child process group on supported macOS/Linux build hosts, records the
interruption and retains checkpoints/cache. Run the same command to resume. Disk space is
checked before each stage; the default 4 GiB reserve stops new work if space falls too low. It
does not delete evidence, caches or user files, or guarantee that an individual long stage cannot
consume the remaining reserve.

The campaign owns the shared simulator workspace lease across preparation and all stages.
Child stages borrow that lease without releasing it. Another optimizer or build must not mutate
those inputs concurrently. Existing locks are not automatically deleted: inspect the owning PID
and its children before recovering a stale lock. No credential, production upload, git commit,
public preset replacement or deployment is part of this command.

## Verification

```sh
pnpm simulator:test
pnpm simulator:prebis:share:test
pnpm simulator:prebis:coverage:test
```

Campaign regressions cover changes/invalidation, config/CLI guards, complete stage ordering,
resume/tamper detection, accessory and rotation feedback, finalization limits, workspace ownership
and checksum/path/method protection on the temporary local server. A real current Arms browser
smoke against that server matched the SHA-verified archived native engine at two iterations
(796.25 displayed / 796.2515962395962 native); this verifies transport, not an optimized result.
Full numerical campaigns remain long-running research jobs and are not replaced by unit tests.
The share CLI's two argument tests run without a catalog; its three local-campaign guard checks
are integration tests and skip when no campaign is installed. Current validation ran all five,
plus35 focused Web tests. A real proc-blue browser control was blocked before opt-in, ran one
smoke iteration after explicit opt-in, and was blocked again after reload; that is a UI safety
check, not optimization evidence. Full proc-blue export/import also preserved every combat field
and Crusader while leaving consent off in both contexts. The first actual reviewed conservative
Arms case still imports correctly. No unfinished proc case is presented as reviewed.

October17 validation: all204 simulator tests and scoped lint/format/whitespace checks pass. The
native workspace regression fails before the guard and passes after it. Real concurrent prepare,
capture, feedback and rotation invocations were denied before mutating the running audit's lock.
The pre-existing standalone ring audit was allowed to finish first (4,090 simulations /12,884,000
iterations; no confirmed challenger), and its exact source versions were archived before integrating
the new lease. A complete numerical case through the new orchestration is still a long-running
integration check, not something these unit/browser checks claim to have finished.
The actual update command has since passed preparation/Go checks/the22-page build,23 browser
template captures, native preflight and a fresh Arms control, and entered real Arms feedback.
Current local browser releasee14af46d79721e1ad50a6f04 uses unchanged native3dde/DB029b. Campaign
4ee5e4d6… is ongoing, not a completed all-class result. Exact cached screening measurements were
reused as intended; independent validation remains separate. Check `context.md` and the live
status command for the current run rather than relying on this historical launch note.
