# Healer optimization campaign

## Scope and authorization

On October 23, 2026, the owner expanded the existing all-class pre-raid optimization
goal: “Expand the goal to cover the healers too in the same way we cover tanks and
dps.” This adds healing mechanics, scenario-specific comparisons, pre-raid gear,
talents, enchants, consumes, guidance, library entries and simulator delivery.
It does not replace or complete the remaining DPS/tank work.

Preserve the original 30-case baseline and its evidence. Add at least five healer
archetypes: Holy Priest, Discipline Priest, Restoration Druid, Holy Paladin and
Restoration Shaman. This makes a minimum of 35 archetype/case deliverables, with
additional scenario comparisons tracked separately. Add distinct Forever healing
builds when their actual talent/spell mechanics support a different playstyle.
Do not count a blank healer page, a legal talent string or a DPS reference as a
qualified healing build.

## Initial source findings

Read-only inspection of the current upstream checkout found:

- `sim/register_all.go` comments out all four healing-agent registrations/imports.
- `ui/healing_priest`, `ui/holy_paladin`, `ui/restoration_druid` and
  `ui/restoration_shaman` exist, but their gear presets are blank.
- `sim/priest/healing/healing_priest.go` contains an unregistered agent, while
  `sim/priest/priest.go` leaves healing-spell registration commented out. Flash
  Heal, Greater Heal, Renew, Power Word: Shield and Prayer of Healing files also
  contain commented implementations.
- `sim/druid/_restoration` and `sim/shaman/_restoration` contain inactive legacy
  code. Shaman references Earthliving, so these cannot be enabled as a faithful
  Forever implementation without checking every dependency and mechanic.
- `sim/core/health.go` tracks health/resource changes, and the protobuf API exposes
  HPS metrics. Those foundations do not prove complete healer spell, targeting,
  absorb, effective-healing or raid-damage support.
- The current admitted native provider validates scalar records containing `dps`
  and `stdev`. Healing needs a role-specific request/result contract using actual
  healing/resource outcomes, not relabelled DPS or external healing received.

These findings describe the inspected working checkout, which another session can
edit. Before execution, capture an exact healer source/database snapshot and audit
what its compiled native and browser engines actually support. Existing immutable
DPS binaries retain their own provenance. Do not modify a running study's engine,
helpers, manifests or numerical inputs to add healers.

The first source audit captured and reverified 21 actual files at
`artifacts/forever-simulator/optimization/healer-model-admission-v1/source-440dd24662c1dd83/report.json`
(SHA `b05bc828458d21c5fa5b6d9f357b5aceadb1035d06f530c1acc3ab9adbc330cf`).
Twenty match source pins in the authenticated `e945e98f232cc81948ee9060` DPS
snapshot, including the disabled healer registry. `proto/api.proto` has no source
pin in that model and is preserved separately; absence of a pin does not prove
either equality or a change. Its schema cannot be silently attributed to the
existing compiled binary. This is a source capability
audit with zero combat, zero healer clock starts and no model admission. Rerun via
`node artifacts/forever-simulator/optimization/review-tools/capture-healer-source-audit-v1.mjs`.

The expanded 29-file audit is preserved at
`artifacts/forever-simulator/optimization/healer-model-admission-v1/source-102795b6cad12a78/report.json`
(SHA `f98166af2d670ca7a221c2504fd338b9d33f253caf9a58cdd52b6c1e07772006`).
It includes spell delivery, metrics aggregation, shield delivery/tests, stats and
health-aware APL values. Twenty-six files match authenticated source pins; the API
proto and two shield test files have no pins in that model. This is not a claim
that those three files changed or that those tests ran against its compiled binary.

In the inspected `spell_result.go`, `dealHealingInternal` adds the full result to
`TotalHealing`, while `GainHealth` caps actual gained health separately. The HPS
aggregator consumes `TotalHealing`. Therefore that metric cannot stand in for
effective healing. Keep raw healing and actual health restored separately, measure
overhealing, and validate their accounting under injured and full-health targets
before admitting a healer ranking. Shield capacity and actual consumed absorption
also remain distinct. The source includes healing-power and shielding foundations;
their presence alone does not complete healer agents or validate class mechanics.

The first client spell capture is preserved at
`artifacts/forever-simulator/optimization/healer-model-admission-v1/client-9c6630c40c94ae82/spell-source.json`
(SHA `9c6630c40c94ae82a4fcb88dd1e29f42f2530567f549f35f4d949fcc4c562622`).
It comes from cached client `1.60.1.70425`, captured October 16, with its exact
manifest/hotfix/definitions provenance. It contains 540 root candidates, 558 related
spell records, 717 effects, 258 power-cost rows, 34 trigger edges and 205 talent
records across all three trees of the four healer classes. These include NPC and
untrained variants and offensive/utility talents; the counts do not describe 558
trainable healing abilities. No missing coefficient or heal value was filled from
Classic assumptions.

All requested baseline names and related spell names were present. `SpellRadius`
and `SkillLineAbility` were outside this snapshot's scope. Fifty-nine talent
records contain unresolved rank text, and encrypted-row counts remain attached.
Resolve friendly-target radius, rank training/acquisition and missing mechanics
before numerical admission, using compatible build evidence. Three actual-data
tests pass: reproducible capture, exact source-row comparison including costs and
coefficients, and complete captured trigger/talent references. This work starts no
healer class clock and changes no current DPS model.

The installed client was subsequently verified as `1.60.1.70532`. A separate
extraction on October 23 includes `SpellRadius` and `SkillLineAbility`; the existing
70425 campaign selection and compiled engines were preserved. The extractor now
captures those two tables in future mechanics snapshots as well. The new manifest
is under `healer-model-admission-v1/current-client-mechanics/70532/`, and its exact
normalized data checksum is
`e00c4897f5278e4dca9ac834adacfd4da07e61a2ca4382f881f2f6785faeefe7` in
`healer-model-admission-v1/normalized-70532`.

The matching healer source is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/client-a259efbc428cb0a5/spell-source.json`
(SHA `a259efbc428cb0a54df462ebdb3d80f60626c01117ba769088e908ced6de8aeb`).
It preserves 339 related skill-line ability rows and all 10 radius records referenced
by the captured spell effects. These come from 7,846 available skill-line rows and
54 radius rows in that client. Eight encrypted skill-line records remain unavailable;
the 59 unresolved talent-text records and other encrypted source gaps remain.
Training candidates are not yet verified trainer or nonraid spell-book availability.
No healing simulations, healer optimization clocks or numerical qualification have
started.

Captured talent roots include Penance (402174), Divine Aegis (431622), Prayer of
Mending (401859), Wild Growth (408120), Riptide (408521), Water Shield (408510) and
the Forever Holy Shock variant (1311606). These names and IDs are source evidence,
not permission to reuse formulas from another expansion. Their unresolved text,
trigger chains, targeting, mana and proc interactions belong in the class admission
controls before talents or cast priorities can be optimized.

Use `capture-healer-client-spells-v1.mjs <exact-manifest> --normalized-directory
<matching-isolated-directory>` for separate build captures. The reader refuses to
combine a manifest with normalized talents from another build. Preserve the current
campaign selection when importing new data: pass `--destination` to
`scripts/import-forever-mechanics.mjs` rather than replacing its default active file.

## Accounting foundation implemented

`infra/simulator/healing-metrics-model.mjs` renders an isolated overlay for the core
delivery, metrics, raid aggregation, concurrent-result merging and protobuf API.
The existing engine and completed DPS artifacts retain their original bytes.
Raw healing stays available separately; effective HPS counts actual health restored
plus consumed absorption. Overhealing and unused shield capacity do not earn
effective-throughput credit. Owned-pet healing rolls up once to its owner, party and
raid; external health gains do not become the healer's output. Ordinary heals do
not revive a zero-health target, and targets without tracked health receive no
effective-healing credit.

The overlay exposes separate raw, effective, overhealing and absorbed distributions
for units, parties and raids. Per-action totals include effective healing,
overhealing and effective critical healing while retaining the original raw fields.
Heal callbacks can inspect raw and effective values separately. Mana, trained-rank
behavior, healing-threat rules, talent interactions and workload policies still
require their own admission; these accounting changes do not qualify a class.

Run `pnpm simulator:healers:test` for eight reproducible source/protocol guards.
Its authentic source fixture is included, so this command needs no local WoW client.
The Go regression fixtures in `infra/simulator/healer-metrics-regression_test.go`
exercise controlled delivery amounts, not measured spell-rank healing values.

The actual compiled foundation identity is
`6a13637472caac9c1f92bbeac721b5e12aa9570ffe68fe48f9117d77911f0b19`.
Its verified receipt is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/metrics-foundation/6a13637472caac9c1f92bbeac721b5e12aa9570ffe68fe48f9117d77911f0b19/foundation-verified-724f0803c807f4b7.json`
(SHA `724f0803c807f4b76342e28998d4af28ee6af503be02dbdbdd14c18eebed3fd6`).
The underlying evidence includes:

- Seven actual native and browser Go/WASM controls, with generated JavaScript
  decoding of real Go protobuf output. Raw/effective/overhealing values agree.
- A real negative control: restoring raw-heal HPS makes the regression test fail.
  The positive component stays unchanged.
- Full native core suites: 78 parent tests and 83 derived tests pass with the
  legacy multi-school crit fixture's missing attack table initialized in an isolated
  validation copy. The unchanged parent reproduces its original panic first.
  Assertions and production source were preserved.

Build preparation, browser review, negative review and full-core review use the
`prepare-healer-metrics-foundation-v1.mjs`, `review-healer-metrics-browser-v1.mjs`,
`review-healer-metrics-negative-v1.mjs` and `review-healer-metrics-full-core-v1.mjs`
tools under `artifacts/forever-simulator/optimization/review-tools/`. Generated
sources, protocols, binaries and reviews have their own hash records. This is a
separate foundation derived from the existing admitted engine, not a claim that
the new client spell records have been implemented. Healer agents remain disabled,
no healer optimization clock has started, and class qualification/publication flags
remain false. Continue Priest spell/rank/talent and workload admission next.

## Priest baseline spell component implemented

The October 23 class-source collector now follows all class ability and talent
candidates through trigger IDs, tooltip spell references, description variables,
teaching parents and explicit aura/cooldown/power restrictions. This closes a real
capture gap: Penance's healing children are referenced in text rather than ordinary
trigger fields. Candidate acquisition methods remain raw evidence, not a verified
trainer or nonraid acquisition list.

The current Priest archive is
`healer-model-admission-v1/priest-source-b3a0ae3ea9e40a92/spell-source.json`
(semantic SHA `b3a0ae3ea9e40a92991ec2477d42ed0dc41e74d7eb62aee54fff97a2834fb225`).
It includes 450 roots, 579 related IDs, 346 references and 424 class ability rows.
The raw gaps remain attached: 54 missing names, no missing referenced radii and 16
talent nodes with unresolved text. Fifty-two actual talent nodes have resolved
layouts; the additional unresolved Holy Specialization node is a duplicate and
must not be counted as an extra talent in the current 18/17/17 tree.

`infra/simulator/priest-healing-model.mjs` derives 39 baseline rank candidates:
Lesser Heal (3), Heal (4), Greater Heal (5), Flash Heal (7), Renew (10) and Power
Word: Shield (10). Conditional Renew variants remain outside this baseline instead
of silently replacing its values. Missing costs, ranks, durations, rank gaps or
conditional cost formulas stop extraction. Higher spell-book rank availability
still needs verification before candidate admission.

`infra/simulator/priest-healing-spells.go` implements real mana costs, cast times,
direct healing and crits, periodic Renew ticks, shield capacity, consumed absorbs,
shared shield cooldown and Weakened Soul lockout in an isolated engine overlay.
An existing caster's Renew/shield ranks replace one another. It also initializes
the test targets' health from their actual stored base stats: the inactive legacy
dummy path did not add those stats to the unit. The amount and coefficient rules
are explicit experimental interpretations of client records; this is not proof
of the closed server's behavior or multi-caster shield priority.

Actual component identity:
`62d8ea84ac705394456a29184395330a0cba9878c392eddfad75ed1221bea7a7`.
Its build report is under
`healer-model-admission-v1/priest-baseline/<identity>/build-glz8QS/report.json`.
Six real Go controls pass in native execution and Chromium Go/WASM:

- Direct heal cast timing, mana, coefficient scaling and effective healing.
- Overhealing, enemy/nil/dead targets and insufficient mana.
- Lesser Heal, Heal, Greater Heal, high-rank candidates and healing crits.
- Renew tick timing, final tick, duration, no tick crits and rank replacement.
- Shield capacity versus actual consumption, lockout, expiry and rank replacement.
- Normal iteration cleanup/reset without leaking health, mana, HoTs or shields.

Browser proof SHA:
`0e4af09b623ecc8e4331de0e7d3903600f0690d74b7a1b065e65f7465cc5689c`
(`build-glz8QS/browser-review-0e4af09b623ecc8e.json`). Native and browser controls
agree to an absolute numeric tolerance of `1e-7`. Replacing Flash Heal's captured
`0.429` coefficient with the inactive legacy `0.8057` deliberately fails the real
native regression; negative proof SHA
`c8b6e79ef545758a8fbd6b257d8232704e6ce04728144ea795bd798ec50c5b3b`.
The original failed setup attempts remain archived. Test setup now uses the
engine's interactive casting mode and its normal cleanup/reset lifecycle; no
assertion was relaxed to make a result pass.

Fast source/protocol/data guards: `pnpm simulator:healers:test` (19 passing).
Actual client and engine source fixtures are checked into
`infra/simulator/fixtures/`; the large raw extraction and compiled controls remain
separate private research artifacts. Private reusable tools under
`optimization/review-tools/` are `capture-class-spell-evidence-v1.mjs`,
`prepare-priest-healing-baseline-v1.mjs --plan/--prepare`,
`review-priest-healing-browser-v1.mjs <build report>` and
`review-priest-healing-negative-v1.mjs <build report>`.

Equivalent expanded source captures are preserved for the other healer classes:

| Class   | Archive under `healer-model-admission-v1/`          | Roots / related IDs | Missing names / unresolved talent-text nodes |
| ------- | --------------------------------------------------- | ------------------- | -------------------------------------------- |
| Druid   | `druid-source-8cc55679c6a175cd/spell-source.json`   | 376 / 491           | 42 / 14                                      |
| Paladin | `paladin-source-9ae97fdcce0290a1/spell-source.json` | 383 / 531           | 48 / 16                                      |
| Shaman  | `shaman-source-7de6adab0555a2e2/spell-source.json`  | 370 / 588           | 41 / 13                                      |

All three preserve their source gaps and have no missing referenced radius rows.
Paladin also has two unresolved layout nodes. These are class-wide candidate
graphs, including offensive/utility and conditional records; they are not counts
of trained healing spells and do not establish class-model admission.

This is a controlled single-target component, not an admitted healing class or
BiS result. Full talent/proc coverage (including Penance healing, Divine Aegis,
Binding Heal, Prayer of Mending and Litany), group targeting/range, trained ranks,
healing threat, encounter damage, mana endurance and workload ranking remain
prerequisites. The normal engine registry, published presets, production and
completed DPS evidence are unchanged. No healer optimization clock has started.

## Priest healing talent component implemented

The next isolated component reads exact effect-rank curves and four-word class
masks for 13 healing-related talents. It preserves all 71 related healing spell
metadata records. No rank is inferred by multiplying the first rank, and missing
curve points, unsupported modifier operations, unresolved layouts or dynamic
durations stop model construction. The normalized display text is not used as a
substitute for raw curve records.

New tracked implementation:

- `infra/simulator/priest-healing-talents-model.mjs`: source extraction and pure
  overlay rendering from the authenticated baseline.
- `infra/simulator/priest-healing-talents.go`: healing modifiers and proc behavior.
- `infra/simulator/priest-healing-talents_test.go`: real engine controls.
- `infra/simulator/priest-healing-talents-model.test.mjs` and the authentic
  `priest-healing-talents-source.v1.json.gz` fixture: reproducible source guards.

Current behavior includes the 3/7/10% Spiritual Healing curve; the 7/14/20%
Improved Shield curve; Improved Renew and Twin Disciplines on their actual
periodic/direct masks; Improved Healing and Divine Fury on their actual spell
families; Soul Warding cost/cooldown reductions; Renewed Hope's target-specific
crit and Weakened Soul duration change; Inspiration's 8/17/25% armor buff after
nonperiodic critical heals; Divine Aegis actual consumed shields; and Litany's
cast sequence. Existing Mental Agility and Holy Specialization behavior is
checked against these client masks; Penance healing-child metadata is retained
for its subsequent implementation. Inspiration no longer calls the inactive
legacy 10% physical-damage-reduction helper or triggers on ordinary noncritical
heals in this derived model.

The model declares its remaining interpretations explicitly: percent modifiers
within one operation add; Aegis uses raw critical healing, accumulates to the
client's `20 × level` capacity and refreshes its 12-second duration; Litany treats
spell families as the identity, gives no first-heal refund and excludes shields.
These are implementation assumptions, not claims of closed-server verification.
The raw-result Aegis basis has a reference in the
[WoWSims WotLK implementation](https://raw.githubusercontent.com/wowsims/wotlk/master/sim/priest/talents.go),
but that implementation is not evidence of Forever behavior. Do not infer
Forever's proc percentages, cap or duration from WotLK.

Final component identity:
`41ad660ee32412cf887f83d7381691051fea796a9483c68392cf536ab849fc7e`.
Build report:
`healer-model-admission-v1/priest-talents/<identity>/build-LVGvTr/report.json`.
All 15 actual native Go and Chromium Go/WASM controls pass: the original six
baseline controls and nine talent/proc controls. The latter also cover a second
shield target with Soul Warding after the GCD, target-specific crit-bonus cleanup,
Litany rank identity/refunds, and normal cleanup/reset while armor, Aegis and
Weakened Soul are active. Browser control agreement uses absolute `1e-7` tolerance.
Browser proof SHA:
`b7ff1bf00ece89278a68a1b8cb7c0a77896a06fbd4a1b82f1cd27a65f95cb47c`
(`build-LVGvTr/browser-review-b7ff1bf00ece8927.json`).

Three separate actual native mutants fail their corresponding regressions:
linear 2/4/6% Spiritual Healing, Inspiration on noncritical healing, and a leaked
Renewed Hope crit bonus. Negative proof SHA:
`24a46f1f5ebb99698e276d304061ff120adcf280f355cbf8d12486fe74ae57ba`
(`build-LVGvTr/negative-review-24a46f1f5ebb9969.json`). Earlier setup failures remain
archived; no test assertion was relaxed. The final controls observe an existing
registered aura rather than registering a new aura after environment finalization.

`pnpm simulator:healers:test` now runs 29 source/protocol/data guards, all passing.
The private repeatable tools are `prepare-priest-healing-talents-v1.mjs`,
`review-priest-healing-talents-browser-v1.mjs` and
`review-priest-healing-talents-negative-v1.mjs`. The new component derives from,
and preserves, the six-family baseline rather than modifying its frozen inputs.
Its class admission, healer optimization clock, qualification and publication
flags remain false.

Next: implement actual healing Penance bolts, Binding Heal, Prayer of Healing and
Prayer of Mending using their client records, including scaling expressions and
friendly targeting/range. Penance's healing children must deliver direct healing
events so that the nonperiodic crit talents see those bolts. Then verify remaining
talents/cooldowns, trained-rank/nonraid acquisition, healing threat, buff/death
behavior, controlled incoming-damage workloads and mana endurance before the
Holy/Discipline feedback searches. The other healer classes and original remaining
DPS/tank/catalog scope are still required.

## Priest active healing component implemented

The following component adds all 18 captured class-ability candidates for Binding
Heal (six ranks), healing Penance (four), Prayer of Healing (five) and Prayer of
Mending (three). Together with the baseline this covers 57 parent rank candidates,
not 57 verified learned or nonraid-available spells. Source effects, rank levels,
costs, coefficients, restrictions, channel timing, travel and radii stay separate.
New scaling tables, changed Mending expressions, missing children/ranks/radii,
changed Binding target flags or incompatible Holy Reach masks stop extraction.

New tracked files are `infra/simulator/priest-healing-active-spells-model.mjs`,
`priest-healing-active-spells.go`, `priest-healing-active-spells_test.go` and
`priest-healing-active-spells-model.test.mjs`. The source tests reuse the authentic
client and engine fixtures from the preceding components. The current baseline,
talent component and published DPS engine remain unchanged.

- Healing Penance uses its actual healing child per rank, not the damaging bolts.
  Its first direct heal arrives on application, with two subsequent direct heals
  over the sourced channel. Cancellation stops later bolts while retaining the
  shared rank cooldown. Direct healing events reach Renewed Hope, Divine Aegis and
  Inspiration; they are not misclassified as HoT ticks. Healing mode skips the
  duplicate damage-only parent registration; DPS mode retains it.
- Binding Heal preserves both effect records, including rank two's distinct target
  and caster level growth and independent overhealing. It rejects self-targeting
  using the captured `0x80000` attribute, interpreted as Exclude Caster in the
  [primary enum reference](https://raw.githubusercontent.com/TrinityCore/TrinityCore/master/src/server/game/Miscellaneous/SharedDefines.h).
  All six ranks are retained; it does not reuse the level-25 rank at level 60.
- Prayer of Healing heals the target's party around that target. Its sourced
  radius is 40 yards, with the actual 10/20% Holy Reach radius curve and mask. The
  captured target-aura exclusion remains applied. Cast range and party-heal radius
  are separate; another member can receive the area heal while being beyond the
  caster's direct-target range.
- Prayer of Mending uses the client expression multiplying Twin Disciplines and
  Spiritual Healing, rather than the ordinary additive modifier path. The model
  reacts to positive post-absorption damage or direct positive raw healing, skips
  periodic healing, and has no invented timed auto-procs. One aura per caster
  survives across its ranks, with a shared cooldown, bounded charges, 20-yard
  bounce range, 30-second aura expiry and cleanup/reset. Its initial application
  includes the sourced travel speed and explicit friendly distance. Pending
  applications are invalidated across replacement/reset.

Friendly coordinates are explicit static two-dimensional benchmark inputs. The
validated position map must cover the entire raid, is copied from the caller and
rejects nonfinite values. It does not infer friendly distance from boss distance
or silently treat missing coordinates as a stacked raid. Party pets are included
as an implementation assumption; the current party-boundary control uses players.

The Mending trigger count remains an interpretation: this component uses five
total triggers from the captured aura stack cap, while the tooltip's jump wording
needs gameplay confirmation. Bounce choice is modeled as lowest health fraction,
then unit index; no eligible bounce ends the remaining aura. Existing Mending is
removed when a new cast starts. Binding's low-threat factor is provisionally 0.5.
These are declared benchmark assumptions, not server verification. Confirm or
bound their impact before final healing qualification. The old reference healing
code is not treated as proof of Forever's behavior.

Final component identity:
`3c3531531ce094bb1f08cea0d8a17291db445b64986338c3498de7179ef925bf`.
Build report:
`healer-model-admission-v1/priest-active-spells/<identity>/build-tdm3uL/report.json`.
All 27 actual native and Chromium Go/WASM controls pass, including the previous
15 and 12 new active-heal controls. They verify cast timing, real direct-heal
procs, cancellation/cooldowns, two-recipient healing, position validation, party
boundaries/Holy Reach, actual Mending triggers, bounded bounces, formula/mana,
HoT exclusion, range, replacement, travel and pending/reset behavior. Native and
browser numerical controls agree to absolute `1e-7` tolerance.

Browser proof SHA:
`f5c1d66b4837613dd8c5835b15065fa96bf7f7a0d6cf1eb09e43a50a8c234c04`
(`build-tdm3uL/browser-review-f5c1d66b4837613d.json`). Five actual native mutants
are rejected: missing first Penance bolt, caster-party Prayer of Healing,
additive Mending talent formula, periodic-heal Mending trigger and instant
Mending application. Negative proof SHA:
`ca4579cdec63fee2ff44442442691223ccda3b7c6a14f0d07881733fa0ad578f`
(`build-tdm3uL/negative-review-ca4579cdec63fee2.json`). The earlier pre-travel
prototype is preserved separately; use this final component.

`pnpm simulator:healers:test` now runs 42 passing source/protocol/data guards.
Private reusable commands are `prepare-priest-healing-active-spells-v1.mjs
--plan/--prepare`, `review-priest-healing-active-spells-browser-v1.mjs <build
report>` and `review-priest-healing-active-spells-negative-v1.mjs <build report>`.
Class admission, optimization clocks, numerical qualification and publication stay
disabled. Next are Holy Nova's healing side, remaining talents/cooldowns and
their interactions, trained/nonraid ranks, healing threat, friendly death/buff
behavior, controlled incoming-damage workloads and mana endurance. Only then
start the Holy/Discipline all-slot feedback searches and website delivery. The
other healer classes and original remaining all-role scope are still required.

## Priest damage-driven benchmark implemented

The next isolated component adds all six Holy Nova rank pairs from the captured
70532 client, preserving separate damage and healing payloads, mana, level growth,
10-yard radius and Holy Reach. The old upstream Nova implementation already had
healing; its highest-rank-only arrays, old values and missing friendly range were
the gaps. DPS registration retains its existing path. Searing Light's free Nova
proc now restores every registered healing-mode rank after consumption.

Inner Focus uses the client's separate free-cost and crit masks. This covers
Binding Heal and Prayer of Healing and retains Penance's crit bonus on its linked
healing bolts after the parent consumes the free cast. Channel completion,
cancellation and iteration reset remove that bonus. Actual Power Infusion controls
verify healing amplification, mana cost and expiry without rewriting its existing
implementation. Dead casters cannot start or finish ordinary healing casts.

`infra/simulator/healing-workload.go` exports `RunKFCHealingWorkload`. It runs
declared incoming damage through actual engine damage, shield, health, spell,
cooldown and resource behavior. One health receiver removes post-absorb damage
before Mending reacts. Clean initial health does not earn healing/resource credit.
Saved priorities support fixed or lowest-health targets, maintained Renew, owned
Inner Focus and Power Infusion. The result preserves raw/effective healing,
consumed absorption, survival, remaining mana, accumulated health deficits and
decision-sampled mana-blocked time. Planned damage and damage actually delivered
before target deaths are separate.

The final component identity is
`239e25eb5171e96ddafcdfa9c0cdceed21dfdaf7babb4c07b7f2c7d07f626be8`, with
report at `healer-model-admission-v1/priest-benchmark/<identity>/build-GQOJHq/report.json`.
Native and Chromium Go/WASM pass the same 44 controls: the previous 27 plus 17
covering Nova, cooldowns, health/death, sustained tank/group healing, burst recovery,
mana endurance, Renew and consumed shields. Numerical agreement tolerance is
`1e-7`. The browser review SHA is
`deb03bb93c10ed6aade6b8f2b04d9adcd6546f8a74e1322e925dd1b073252112`
(`build-GQOJHq/browser-review-deb03bb93c10ed6a.json`). Four actual native mutants
are rejected: missing channel Focus retention, missing Binding Focus masks,
ignored Nova radius and damage that never removes health. Negative review SHA:
`22e00e0882e682fc99cf4be29e9df07dc08af3454706d8b78222f950d65aaf47`
(`build-GQOJHq/negative-review-22e00e0882e682fc.json`).

`pnpm simulator:healers:test` now passes 52 source/protocol/data guards, including
ten new benchmark extraction/rendering guards. Reproduce the compiled controls
with `prepare-priest-healing-benchmark-v1.mjs --prepare`, then the
`review-priest-healing-benchmark-browser-v1.mjs` and
`review-priest-healing-benchmark-negative-v1.mjs` tools with that report path.
These tools live under `optimization/review-tools/` and preserve predecessor inputs.

Five focused core healing regressions also pass against this final overlay. The
final audit rechecks 690 source, generated, binary, browser and negative-control
file pins, including the unchanged cache helper and completed Warlock ledger.
Receipt: `build-GQOJHq/final-audit-9dc7486197bd0d17.json`, semantic SHA
`9dc7486197bd0d172aa4c8718ec58185a62bafe6954f2c405b98a47b61f71126`.

This is a synthetic assignment API, not a public healer simulator or qualified
BiS result. It currently requires one Priest, a complete player-only friendly
position/health map, one enemy and declared post-mitigation damage before absorbs.
It rejects caster-damage workloads pending defensive/death-talent admission and
does not pretend fixed damage measures armor mitigation. Its example HPS is a
test-fixture result, not recommended gear performance. Training/nonraid spell
availability, remaining talents/buffs, assumptions and sensitivity, native/browser
provider integration and actual healer presets remain required. No healer
optimization clock, class qualification or publication is enabled. Holy/Discipline
all-slot searches, other healers and the original remaining DPS/tank work remain
part of the active goal.

## Model admission before optimization

1. Audit the Forever catalog and talent data for each healing spell, rank,
   coefficient, mana cost, cast/channel time, cooldown, targeting rule and effect.
   Separate current verified data from unresolved mechanics. Do not copy later
   expansion healing spells or assume their rules apply to Forever.
2. Implement missing agents, trained spell ranks, talents, relevant nonraid item
   effects, healing procs, mana regeneration and heal-aware APL actions in a
   separately versioned model. Preserve completed DPS/tank source snapshots.
3. Model friendly targets and incoming damage. A damage-dealer encounter with an
   undamaged target is not a healing workload. Use declared controlled benchmark
   workloads until real encounter evidence exists; never label invented damage
   patterns as measured boss behavior.
4. Validate raw healing, effective healing, overhealing, actual absorbed damage,
   mana/resource accounting, spell ranks, target choice, HoT ticks, chain/group
   heals, crits, cooldowns and interrupted casts. Check shield refresh/expiration
   without counting unconsumed shields as healing. Do not credit another unit's
   external healing to the simulated character.
5. Require actual native/browser agreement and real class-specific controls before
   ranking candidates. The presence of an HPS field or a numeric result alone is
   insufficient admission. Confirm relevant healing stat fields and item effects
   are used by the compiled engine.

Version the healer result/admission contract separately while reusing appropriate
checkpointing, acquisition, hashing and browser-review infrastructure. Preserve
raw/effective healing, actual absorbs, target deaths and mana evidence in their own
fields. Existing DPS scalar readers and frozen proof schemas remain unchanged.

## Common workloads and ranking

Use consistent, saved inputs across healers, with at least these workload families:

| Workload                     | Primary question                                           | Required companion measures                                                             |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Sustained tank healing       | Can this build keep its assigned target alive efficiently? | Effective healing, deaths/unmet damage, mana, overhealing, healing received from others |
| Sustained group/raid healing | Can it cover a declared distribution of raid damage?       | Effective healing by target, target coverage, mana endurance, overhealing               |
| Burst recovery               | How well does it respond to a declared damage burst?       | Recovery time, deaths, actual absorbs, mana/cooldowns spent                             |

Specify target count, health, damage schedule, encounter duration, movement and
reaction/targeting assumptions in each scenario before searching. Record which
workloads are synthetic benchmarks and which are evidence-backed encounter
profiles. Keep raw healing throughput separate from effective healing and do not
reward overhealing. Actual absorbs and damage reduction remain separately
identified; avoid double-counting prevented damage as both healing and mitigation.

Keep one default workload per spec for a clear first visit, with explicit tank,
raid and burst alternatives. A build can be best for one workload without being a
universal healer BiS. Display utility such as dispels and resurrection honestly
rather than converting it into invented HPS.

## Practical search and evidence

- Use the existing acquisition rules: no raid drops or raid-dependent crafts,
  ingredients, enchants or reputation. Keep legal nonraid/PvP alternatives and
  disclose access constraints. Ignore item weapon-skill bonuses without deleting
  the items.
- Search all 17 slots, complete main/off-hand or shield combinations, ordered
  jewelry, sets, relics/wands, enchants and applicable consumes. Use actual healing
  stats and measured effects, without reusing DPS stat priorities or pruning by
  item name, quality, level or an unvalidated EP score.
- Feed the winning gear back into healing talents and cast/target/rank priorities,
  then recheck gear and consumes. Include mana-limited and burst tradeoffs. A
  bounded pass ending is not evidence that the feedback has converged.
- Use relevant improved raid-wide buffs, unlimited player buffs and no more than
  16 boss debuffs where offensive support is part of the scenario. External mana
  cooldown availability and healing support must be explicit rather than assumed
  unlimited merely because buffs are raid-wide.
- Preserve exact request/backend identity for reuse. Existing DPS/compatibility
  scores never become HPS evidence. Keep complete checkpointed origins and enable
  incremental catalog updates through the same verified workflow.
- Retain the practical 2% contender tolerance and separate 1% assessment where a
  scalar comparison is appropriate. Define feasibility/survival constraints first;
  do not accept a dangerous build merely because raw HPS is within 2%. Disclose
  the stronger strict-dominance result independently and do not select a new winner
  from fresh confirmation runs.
- Target 2–4 hours per class for the bounded optimization pass, with a 24-hour hard
  cap, shared across its healer specs/scenarios. Record new healer work separately
  from completed/expired DPS clocks; never reset or silently extend those clocks.
  Mechanics implementation/admission is a distinct prerequisite, not an already
  completed search. Defer deep timing searches until practical role coverage is
  delivered.

## Delivery and order

Warlock's four DPS specs are locally delivered; preserve their completed evidence.
Continue the remaining already-approved DPS/tank work alongside a separate healer
admission and optimization queue. Start healer model admission with Priest because
it has an existing agent and its Holy/Discipline archetypes can share verified spell
infrastructure, while treating its disabled spells as unfinished work. Determine the remaining class order from the admitted
mechanics rather than assuming inactive legacy code works.

For each qualified healer, update the first-visit default, Preset Configurations,
Gear Sets, searchable library and exact healing guidance together. Show the scenario,
effective/raw healing, mana endurance, overhealing, actual absorbs and tradeoffs.
Use the established KFC style, item tooltips, enchant support and a single page
scrollbar. Test desktop/mobile selection, reloads, sharing, simulation, stopping,
error handling and personal-save preservation before recording delivery.

Publish scenario-specific gear recommendations and practical healing instructions
as useful searchable content. Keep measured inputs, evidence limitations and
unknown mechanics visible. Deployment continues through the user's requested Git
and deployment workflow when authorized; goal expansion alone is not a deployment.
