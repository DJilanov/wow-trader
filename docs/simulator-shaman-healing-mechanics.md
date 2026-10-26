# Restoration Shaman healing mechanics

## Current source coverage

This includes verified source preparation for client build70532 and qualified
basic healing,passive,water-totem,resource-active,Riptide and full-build talent
components, five equipped healing relic effects, the Elements power proc, a verified complete-fight
controller and native/browser job boundary. The base Five Thunders519 set and all eight current stat rows now have
their own verified component; see the linked recovery document below. It does not qualify the full Shaman combat engine,
optimized gear, spell acquisition or a website preset.
Four cast-resource set components now pass105 native/Chromium controls and315
groups, with shared production registration, positive Dreadmist power evidence,
16 detected faults and14 unchanged DPS cases. These component results do not
admit the remaining shared equipment or consumes; see the equipment document.
All33 represented sets now have independently proved maxima across30 profiles:
990 complete legal loadout witnesses,3,120 threshold checks and66,825 independently
enumerated leaf assignments. Only Spider's Kiss2piece and Spiritcaller2/3/4/5
are unreachable everywhere in this declared domain. Remaining effects still
require runtime admission; all2,017 candidates remain available.
Shadowcraft six-piece health regeneration now passes114 native/Chromium controls
and336groups,with12health faults/3DPSguard faults caught and16unchanged DPS pairs.
Its15health/5sec uses explicit tick references and resource accounting,so it never
feeds spell healing,critical/power modifiers or Water Shield. Full equipment and
consume qualification remain pending; see the equipment document.
Shaman's numerical class window has not started. This preparation preserves the
other classes' frozen runtimes and study inputs.

October26 update: the twenty previously unmapped item modifiers are now
classified. Eight current flat health-regeneration sources have an owned
Restoration component, verified against current client unit strings and explicit
tick references. All124 native/Chromium controls and364groups pass;114parent
controls/336groups and16actual DPS pairs stay unchanged. Nine healing faults and
three DPS faults are caught. The separate late-time guard has an additional
native control. This component does not admit the remaining effects, consumes or
equipped workload and starts no numerical clock. Details are in the equipment
document. Paladin optimization has reached its original deadline; its separate
delivery-validation request remains unanswered and none of its inputs changed.

October26 03:07UTC: shared healing items now pass independent review, including
the owned Healing Wave-only Heart trigger, Mindtap's mana/intellect trade, Second
Wind's real production registration and shared category, and Serenity's separate
spirit category. All141native/Chromium controls/387groups pass, preserving the
prior124/364. The successor adds Viper recovery and Scarlet/Devout shields through
an ordered, single-deduction damage receiver:151native/Chromium controls and422
groups, plus two separately bound native death/cooldown guards. Eleven reactive
faults and three DPS guard faults are caught;16actual DPS pairs stay unchanged.
Normal spirit regeneration is not credited as item mana. Server threshold timing,
self-damage eligibility and Heart proc rates remain explicit references. Full
equipment/workload/consume admission and Shaman optimization/delivery remain.
Immutable receipts and exact scope are in simulator-shaman-equipment.md.

October26 03:31UTC: actual Shaman Blue Dragon/Analyzer controls now pass with the
existing common handlers. All161native/Chromium controls/436groups match; all151
parent controls/422groups remain equal and8compiled faults are caught. Every705
parent compiler input is preserved; two test files bring the total to707. Prior
sixteen DPS comparisons are inherited by exact production-byte preservation,
not re-executed. The two reactive guard controls are now included in this binary.
The new set-source classifier accounts for104records across33captured sets:
66flat,9owned components,24inactive in the existing stationary workload and5
unreachable thresholds. This is source-scope closure for the2017-candidate pool,
not full equipped-workload admission. Five Thunders519 reward/access profiles,
remaining utility/legacy effects, enchants/consumes and optimization/delivery
remain; see the equipment document for source certificates and immutable reports.

The [Five Thunders recovery](simulator-shaman-five-thunders-recovery.md) now
captures all eight missing base519 pieces,distinct alternate1679 mechanics and
four reference reward milestones. Ten source/stat checks pass,with current
ratings and historical icons kept separate. A subsequent exact-ID native/browser
component qualifies base519 mechanics and a derived catalog; acquisition and full
equipment/numerical admission remain false. The inherited name-based set handler
is bypassed only for the owned base519 effect dispatch.

The [equipment inventory](simulator-shaman-equipment.md) now prepares2,017
candidates across30 faction/profession profiles and all17 slots. Six legality
contracts pass. The six explicit current-stat discrepancies are now corrected in
a verified derived model:68 native/browser controls/138 groups pass, with all245
parent controls/416 groups unchanged. The post-repair audit reports zero mapped
differences across3,822 comparisons. Twenty modifier records are now classified;
33 represented sets and the remaining shared effects still need complete scope
review. All ten
totems have source/family review; the five healing/resource effects now pass
80 native/browser controls across 188 groups. Their independent review preserves
247 parent controls/418 groups, catches 13 compiled faults and verifies eight
unchanged DPS cases. Both cost-stacking formulas remain explicit references.
The broader raw join retains 251 linked items: 149 current-base and 102 historical-
base items, with 104 set thresholds and 341 captured trigger-closure spells. A
reviewed tooltip-reference extension adds 17 supporting spells for 358 total.
This graph does not establish full runtime support. Complete the remaining
reviews before numerical optimization. These preparation steps start no class
clock and publish no preset. The subsequent Elements component passes 92
native/browser controls across 232 groups, preserving its shared flat thresholds
and explicitly declaring proc-rate/routing assumptions. A separate complete-gear
proof retains all four Spiritcaller crafts but limits them to one equipped item
in every profile. Its higher set thresholds are unreachable in this declared
domain; forced simulation-only tier bonuses remain outside that proof.

The captured class graph has370 ability roots,588 referenced spell IDs and50
talents. All50 talent nodes match the captured engine fields,tiers,maximum ranks
and prerequisite locations. Fifteen fields affect the planned healing study.
Eleven passive talents expose16 actual effects and17 trait curves; the remaining
curve belongs to a Mental Quickness effect slot absent from SpellEffect. It is
preserved as evidence without creating a third bonus.

The source modules are:

- `infra/simulator/shaman-healing-source.mjs`:19 basic ranked heals.
- `infra/simulator/shaman-healing-talents-source.mjs`:talent mapping and absolute
  rank curves,including healing-relevant Enhancement talents.
- `infra/simulator/shaman-healing-active-source.mjs`:Riptide,Water Shield,Nature's
  Swiftness,Healing Stream and Mana Tide.
- `infra/simulator/shaman-healing-eligibility.mjs`:level/talent restrictions and
  the explicit historical raid-book exclusion.

Run `pnpm simulator:healers:shaman:source:test`. All25 focused tests pass,including
source mutation,rank-curve,ownership,cost,coefficient and acquisition regressions.
No Shaman native or browser simulation is claimed by this command.

The separate talent-domain and passive-renderer checks run with
`node --test infra/simulator/shaman-healing-talents.test.mjs infra/simulator/shaman-healing-passives.test.mjs`.
Their eight tests pass. Three source-legal51-point seeds provide Riptide support,
Riptide with Ghost Wolf utility,and Mental Quickness/Healing Wave starting points.
Every neighbor preserves the full budget,tiers,prerequisites and declared scope.
They are preparation for feedback,not optimized presets. In particular,Riptide's
actual captured prerequisite is full Healing Way.

## Complete-fight controller verified — October 25

The controller executes actual owned Healing Wave, Lesser Healing Wave, Chain
Heal, Riptide, Healing Stream, Mana Tide, Water Shield and Nature's Swiftness.
Every request requires a source-legal 51-point level60 build and a complete player
roster. Positions, bounce routing, periodic policies and resource policies are
explicit inputs. Each decision respects cast/channel completion, global cooldown,
real spell cooldowns, mana, target range, death and owned abilities.

Priorities can maintain the caster's shield, preserve an active water slot,
maintain each target's own Riptide, require that HoT for Chain Heal, or require
enough injured recipients on the actual declared bounce path. The controller
never refreshes Stream over an active Tide merely to maintain Stream. A declared
Nature's Swiftness threshold activates only for an affordable eligible basic
heal. Caster-directed external damage, unscheduled enemy attacks and external
resource cooldowns remain outside this stationary assignment.

The external-demand ledger caps each health loss at available health, excludes
overkill and overheal, integrates missing health over time, and retains final
deficit and survival. It measures useful own/other Mana Tide restoration
separately. Mana restoration has no invented HPS conversion. The current
single-caster/dummy controls have no other mana-consuming players, so their
other-player Mana Tide total is zero. Death prevents further healing and damage
delivery to that player. Independent iterations reset health, owned effects and
resources while retaining their actual seed identities.

All58 native controls match actual Chromium/WASM across114 measurement groups.
All225 parent controls and382 parent measurement groups remain unchanged.
Nine deliberately broken controller variants fail their targeted behavioral
controls. Six actual DPS control pairs remain unchanged, with one additional
compiled DPS guard mutation caught. The685-file workspace preserves680 parent
files, changes one owned Restoration initialization boundary and adds four files.
The full simulator package compiles;178 Paladin controls and the Priest periodic
critical-heal control also pass in the derived workspace.

Runtime sources are `shaman-healing-workload.go` and
`shaman-healing-workload-run.go` under `infra/simulator/`. The renderer in
`shaman-healing-workload.mjs` binds the shared strict JSON/protobuf protocol to
the owned controller; its two focused JavaScript contracts pass, as do focused
ESLint/Prettier and Go formatting checks. The protocol rejects unknown nested
protobuf fields, unknown JSON fields, trailing data, bad encoding and cancelled
requests, and returns detailed real metrics when requested.

Immutable final receipt, under
`artifacts/forever-simulator/optimization/healer-model-admission-v1/`:

`shaman-workload-v1/e4ace7f6225a294e5c66835da02b43a968c8d178413f709a938304d33a9a3ed3/build-sWck6L/final-review-F7x8l1/report.json`

SHA-256: `1c84349e9607fc560dfcc15321f639fe825f02ee5eb4618d7852d4ad58b3c620`.
The source and private preparer/reviewers are frozen with this receipt. The
original complete item/set/consume qualification, numerical feedback, independent
confirmation and website delivery remain required. Equipment and consumables are
explicitly rejected by this component until that admission is implemented. This
does not start Shaman's numerical class window or publish a preset.

## Verified passive component

Nine source-bound passive fields now have native/browser controls in an isolated
Restoration class. These cover Improved Healing Wave,Tidal Focus,Mindfulness,
Tidal Mastery,Healing Way,Purification,Ancestral Knowledge,Thundering Strikes and
Mental Quickness. The class overrides inherited talent dispatch,so unqualified
active,totem and offensive talent fields are rejected by this component.

Eleven native controls match Chromium across25 measurement groups. Six compiled
behavioral mutations are detected,including wrong learned curves,inverted mana
cost changes,double healing power and accepted unsupported talents. All185 parent
native controls and290 parent groups remain unchanged. The670-file compiler
workspace preserves667 files and changes only one controlled class factory plus
two owned files. Catalogs and global handlers stay unchanged.

Mental Quickness contributes unified spell power once; its separate damage and
healing source channels do not grant two healing bonuses. Purification and
Healing Way combine additively in this declared same-operation reference. Their
server stacking remains unverified and needs sensitivity coverage before ranking.
The component admits explicit partial controls,not a full51-point engine build.

The final receipt is
`shaman-healing-passives-v1/8e3a6abf960d7bced4828bb218a463167d23a54cca8532ccca554f9a914bf8ce/build-l8OixF/final-review-5TyeHt/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`,
SHA-256 `872198ffba7a9462e2746221afbe4e693a55d889a8c02c802175d09121f3b73f`.
Full-class admission,the numerical clock and publication remain false.

## Verified water-totem component

The healer-owned controller registers all five Healing Stream and four Mana Tide
ranks. Rank2 Tide costs20 mana and the highest rank is1325256/1325257. Totemic
Focus reduces summon costs by5% per point. Restorative Totems applies its
10/20/30/40/50% curve to the Stream pulse. Purification's exact current masks
exclude both water pulse families; the inherited Stream formula is not reused.

Each cast occupies the water slot. Another water totem or a same-rank refresh
invalidates the old pulse and expiration schedule. The controller uses immutable
player geometry,30-yard boundaries,health/mana caps,live recipients and iteration
reset. Mana Tide's four ranks share one five-minute timer; controls test this
after the global cooldown and immediately before/at300seconds.

The policy requires explicit references for immediate versus delayed first pulse,
party versus raid recipients,and Stream talent scaling on base healing alone
versus base plus power. Pulses are noncritical in this reference. These choices
are not asserted as verified server behavior. Mana Tide always restores the
captured flat amount,independent of MP5 or the recipient's maximum pool.

A new calculation helper preserves periodic result semantics and callback
dispatch without changing the inherited common helper. Thus Stream pulses do
not masquerade as direct heals or trigger cast-completion handlers. External
raid-provided Mana Spring remains separate; this controller adds no second copy.

Twenty native controls match Chromium across47 groups. Nine compiled behavioral
mutations are detected. Four actual before/after Elemental/Enhancement controls
prove the declared unflagged DPS path remains unchanged. All190 parent controls
and305 groups survive. The674-file compiler workspace preserves667 files,with
three explicit integration boundaries and four additions. V2 preserves every
one of V1's673 compiler files and adds only stronger lifecycle tests.

The final receipt is
`shaman-healing-water-v2/ff2c749760dd5ef011bc2aca99448e76a9bd89c3e0900e090aa616f536c6b82d/build-F3en9J/final-review-HGnAPC/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`,
SHA-256 `1af4d35b1868c6dfedcd72f651ef9662c069f4f5ec577f991694593648c852df`.
The four additional source/integration tests run with
`node --test infra/simulator/shaman-healing-water-source.test.mjs`.
All37 focused Shaman JavaScript tests pass across the source,talent and renderer
modules. The class's numerical optimization clock remains unstarted.

## Verified Water Shield and Nature's Swiftness

The healer-owned resource component adds Water Shield's three charges,3.5-second
internal cooldown and capped2% maximum-mana gain. Full-mana critical heals still
consume a charge. Recasting refreshes charges without resetting the internal
cooldown;Lightning Shield replacement and iteration reset are controlled.

An explicit fresh policy selects current0-second versus inherited15-second
shield recovery. The core requires a nonzero timer duration at registration;
the handler registers the legacy reference and mandatory policy setup assigns
the chosen0/15 value before any cast is enabled. The core guard stays intact.
Trigger policies distinguish class direct heals,all direct heals and all critical
heals. Semantic periodicity governs eligibility even if a legacy helper routes
its periodic result through a direct callback. Incoming-damage and offensive
critical events remain outside this stationary healing-only component.

Nature's Swiftness makes exactly one eligible basic heal instant. That heal keeps
its normal mana cost and GCD. Invalid targets,totems and shield casts do not spend
the charge. Activation versus consumption cooldown-start references are tested.
The source mask admits eighteen basic healing ranks and excludes Riptide.

All fifty encoded talent-position maxima are validated before proto conversion,
including boolean ranks. Full51-point/tier/prerequisite engine admission remains
separate. One old negative NS-ownership input is replaced with an equally strict
unqualified ElementalFury input because NS is now admitted. The original test
source remains frozen and the derived one-input migration is byte-verified.

Twenty-nine native controls match Chromium across69 groups. Nine compiled
behavioral mutations are caught. Six actual Elemental/Enhancement pairs preserve
the inherited DPS behavior,including owned shield/NS cases.198 parent controls
remain exact,one ownership input migrates,and327 parent measurement groups are
preserved. The676-file compiler workspace preserves670 files,with three runtime
integration boundaries,one migrated guard file and two additions.

The final receipt is
`shaman-resource-actives-v1/a791d1fdfb16f6bac738851b1e031c1afd9be6335bb0eb303304cd4d60a532aa/build-A8Y3CM/final-review-lM4Iz4/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`,
SHA-256 `42a1d8e4668978656b91df4d193497624476fdcb0af0ef0121febf880c70ea96`.
Its four source/integration tests run with
`node --test infra/simulator/shaman-healing-resource-actives.test.mjs`.
All41 focused Shaman JavaScript tests pass. This remains component admission;
full-class qualification,numerical optimization and publication remain false.

## Verified Riptide component

All three current ranks retain distinct direct and periodic growth,coefficients
and talent channels. They share one six-second timer. Direct healing receives
Tidal Focus,Tidal Mastery and direct Purification once; periodic healing receives
its own Purification channel once. Healing Way does not modify Riptide. Five
scheduled ticks use generation-owned state,so refreshing across ranks cannot
leave stale ticks. Two casters retain independent ownership. Range40,caps,mana,
death and iteration reset pass native/browser controls.

Mandatory fresh policy selects snapshot versus dynamic power/multiplier/critical
chance,critical versus noncritical ticks,and fixed versus cast-speed-compressed
five-tick cadence. Target healing multipliers remain current. The fifth tick is
retained at natural expiration. In the declared owner-death reference,the existing
HoT continues; a dead recipient is never resurrected. External dispel events are
not part of this component's qualified assignment.

Chain Heal checks its initial target's own active HoT when the cast lands. The
25% multiplier applies once,with explicit primary-only versus all-bounce and
consume-versus-retain references. Another caster's or a later bounce's HoT grants
no bonus. Nature's Swiftness excludes Riptide; actual periodic critical ticks obey
the selected Water Shield critical-heal scope. None of these unresolved server
choices is presented as observed gameplay behavior.

Forty-two native controls match Chromium across96 groups. Ten compiled behavioral
mutants are caught,and six actual DPS parent/child pairs match. All208 parent
inputs and349 measurement groups remain unchanged. The679-file compiler workspace
preserves674 files,changes two owned class boundaries and adds three files. Its
snapshot helper adds no change to existing global periodic-healing dispatch.

The final receipt is
`shaman-riptide-v1/eb11e4b5b52c787bf6cf002da6ec5d7e2c4f3677cfa55d580f2265fac45f9de2/build-IHnTax/final-review-r681oa/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`,
SHA-256 `a92721054dcd82e6a0026641bc7da3d8a3c13ef6e5877bbde92777e6224d9416`.
The first two failed native attempts are retained. They exposed a copied metric
counter in a test and a six-member single-party fixture; the final controls use
fresh counters and a legal five-player roster. They did not establish runtime
defects. Four public source/integration tests run with
`node --test infra/simulator/shaman-riptide.test.mjs`.

## Verified full-build talent gate

The derived engine now accepts the three complete source-legal51-point seeds.
It checks all50 encoded positions before proto conversion,exact point totals,
lower-tier spending,full prerequisites and the15 healing/10 scoped-utility/25
outside-study classifications. Utility and51-plus-point factory inputs require
the full level60 gate. The ten utility talents remain outside the stationary,
post-mitigation external-demand objective; inherited offensive dispatch is not
called. These are legal seeds,not optimized builds.

Partial owned spell controls remain supported separately. A future complete
workload must explicitly call `ValidateKFCShamanHealingStudyTalents`; a passing
partial component fixture must never stand in for full-build admission. This
boundary is necessary because the factory continues to admit the preserved
isolated mechanics tests.

Forty-six native controls match Chromium across102 groups. Six compiled gate
mutants fail as intended,and six actual DPS parent/child controls match. All221
parent inputs and376 groups remain unchanged. The681-file compiler workspace
preserves678 files,changes one factory boundary and adds two owned files.

V2 preserves all681 of V1's compiler files byte for byte. It adds an explicit JavaScript
integration guard after a regression test found that applying the transformation
twice could duplicate the factory checks. The original successful builder and
helper remain frozen; V2 rejects reapplication before changing source.

The final receipt is
`shaman-full-build-v2/d7a6ab12b2df2e56e35989d4e7bb6b5919f103b36a44f2a434b2e57aafacc2e1/build-1mxUOn/final-review-vWyhYh/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`,
SHA-256 `064747861b3b70fbcf8c3e0ddead81a9e2fd32dc5efef1ab65d98c3dde6f8d2d`.
Four public contracts run with
`node --test infra/simulator/shaman-healing-full-build.test.mjs`.
Full item/set/accounting/workload integration,numerical optimization and website
delivery remain. The Shaman numerical clock is still unstarted.

## Verified basic healing component

The frozen basic model admits eighteen pre-raid Healing Wave, Lesser Healing Wave
and Chain Heal ranks with zero talents. Six native and six Chromium controls,
ten measurement groups and four compiled behavioral mutations pass. The model
also preserves all179 parent native controls and280 parent measurement groups.
The complete simulator package and class registry compile.

The controls check source-derived costs, cast times, coefficients, growth caps,
1.5 critical healing, mana use, death, health caps and primary-target40-yard range.
Chain Heal reaches at most three distinct players and applies the bounce factor
once to both base healing and spell power. The10/12.5/15-yard bounce radii and
nearest-injured/largest-deficit routing remain explicit unverified references.
Position inputs are cloned and bounded. Active pets and nonzero talents remain
outside this component.

The immutable admission is
`shaman-basic-healing-v1/1abc8936080bfebc2f4781707cb5220bdb925891cb410dd0921f8c773e1e1b3b/build-dmswLE/final-review-IoSCje/report.json`
under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`.
Its SHA-256 is
`4e461b484046e8b96b0f7e69dd327e85e5e6dfc00f62bb20a868ff8eeba763a4`.
Full-class admission, numerical qualification and publication remain false.

## Rank curves and passive channels

Raw spell base points cannot replace trait rank curves. Healing Way has raw33,
but its learned ranks are8/17/25%. Mindfulness has raw5,but its ranks are17/33/50%.
The extractor validates the absolute curve operation and each rank position.

| Talent | Captured learned-rank values |
| --- | --- |
| Improved Healing Wave |100/200/300/400/500ms cast reduction |
| Tidal Focus |1/2/3/4/5% healing mana reduction; hit effects preserved separately |
| Mindfulness |17/33/50% mana regeneration while casting |
| Totemic Focus |5/10/15/20/25% mana reduction for the captured totem masks |
| Restorative Totems |Mana Spring5/10/15/20/25%; Healing Stream10/20/30/40/50% |
| Tidal Mastery |1/2/3/4/5 critical percentage points for its captured spell mask |
| Healing Way |8/17/25% Healing Wave modifier |
| Purification |2/4/6/8/10% with direct and periodic modifier channels retained separately |
| Ancestral Knowledge |2/4/6/8/10% Intellect |
| Thundering Strikes |1/2/3/4/5 global critical percentage points |
| Mental Quickness |15/30% Intellect conversion; healing and damage channels require correct engine integration |

Every source effect retains its exact class mask and modifier operation. A future
engine must not infer blanket healing bonuses from tooltip wording,apply an
orphan curve,or duplicate Mental Quickness through both unified spell power and
an additional healing-power conversion.

## Active spells and totems

Riptide has three captured ranks:408521,1239242 and1239243 at40/50/60. The highest
costs385 mana,has a6-second shared cooldown,and a15-second HoT ticking every3
seconds. Its direct payload is841 with0.214 coefficient; the periodic payload is
161 per tick with0.1 coefficient. Per-level growth is retained separately. The
source declares a25% Chain Heal bonus on that target. HoT consumption,periodic
critical rules and propagation now have the explicit engine references and
controls above; these are not asserted as observed server rules.

Water Shield408510 has three charges,a3.5-second internal cooldown,a10-minute
duration and a1.5-second GCD. Its triggered effect408511 restores2% maximum mana.
The proc mask and critical-trigger description are retained. Healing-trigger
references,charge consumption,recasting and capped mana pass the component above;
incoming/offensive events remain outside its declared healing-only scope.
The current client declares zero spell recovery,while the inherited handler
imposes15seconds. The healer-owned correction and explicit compatibility checks
are implemented above; the frozen DPS model is preserved.

Nature's Swiftness16188 is a one-charge,off-GCD3-minute cooldown. Its exact spell
mask is retained. The owned component above makes one eligible healing cast
instant without changing later casts or the heal's normal mana cost/GCD.

Healing Stream has five summon/pulse pairs,ending at10463/10461. Rank5 costs80
mana,uses a1-second GCD,and lasts300 seconds. The pulse has11 base healing,
0.022 coefficient,a2-second period and30-yard radius.

Mana Tide has four summon/pulse pairs,ending at1325256/1325257. Rank4's spell-level
requirement is58. It costs60 mana,uses a1-second GCD and has a5-minute shared
cooldown. The captured duration is13 seconds; the pulse restores290 flat mana
every3 seconds within30 yards. This is not a percentage of the recipient's pool.

Totem-to-pulse links are explicit references in each current description. They
do not prove the server creature spell list or first-pulse timing. The water
component above controls costs,water-slot replacement,range,declared recipient
scope,pulse cancellation,death and iteration resets. Raid-provided mana buffs
must not be added a second time through the player's totem talents.

## Pre-raid action policy

The policy has33 candidate actions. At60,with their actual talents and explicit
conditional-candidate opt-in,32 remain eligible. These include21 direct/HoT heal
ranks,five Healing Stream ranks,four Mana Tide ranks and two resource/utility
cooldowns. Totems and resource cooldowns cannot enter the direct-heal priority list.

Healing Wave X25357 is linked to Tablet21291 in the captured Classic raid-book
reference and is excluded. Its presence as a class ability does not prove that a
Forever trainer teaches it. Other candidates remain explicitly conditional until
their acquisition is confirmed. Talent tier gates supplement raw spell levels:
the earliest mapped levels are20 for Water Shield,25 for Mana Tide,30 for Nature's
Swiftness and40 for Riptide.

Immutable preparation receipts and exact hashes are recorded in context.md.
The inherited Healing Stream handler multiplies its base by only the Purification
increment and then adds the Restorative increment as a flat amount. It therefore
heals for zero base healing without Purification. The inherited Mana Tide arrays
also omit the fourth current rank and shift the rank costs and amounts. Neither
handler is admitted for healing use. The healer-owned component above corrects
these behaviors while preserving the frozen DPS and Paladin models.

Next required work is Riptide,full-build gating,
stacking sensitivity,item/set effects and accounting,then bounded feedback,independent comparisons,
gear/talent/consume guidance and website delivery.
