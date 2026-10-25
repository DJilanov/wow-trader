# Restoration Druid healing mechanics

The Druid healer model, all-slot seed search, practical talent/priority/consume
feedback and thirty common-pressure scenario adaptations are implemented. Its
local workspace has editable gear, enchants, talents, HoTs, race and consumes,
actual Go/WASM simulations, casting guidance, saved builds and sharing. Current
release and review receipts are recorded in context.md.

The published model scope remains conditional: Engineering/Tailoring acquisition,
stationary post-mitigation assignments and explicit rank/proc/item hypotheses.
Six maximal crafting profession/faction pools now have numerical and independent
confirmation coverage across54 stress setups. Thirty-profile numerical equivalence,
gathering passives and material utility/effect bounds remain separate. This is not globally qualified BiS or proof of server formulas.
Never use the synthetic bonus-stat spell controls as gear-study equipment.

## Recombobulator shared cooldown

Major Recombobulator now uses the actor's existing conjured-item timer for its
captured category1153. Using it blocks Demonic Rune for two minutes; using Rune
also blocks the Recombobulator. Its separate five-minute personal cooldown and
ten charges remain intact. A blocked attempt consumes neither a charge nor the
personal cooldown. Reset clears both timers, and separate actors never share them.

The earlier helper allocated a private two-minute timer. That was sufficient for
the original no-Rune assignments, but allowed incorrect overlap in a custom
Rune/Recombobulator configuration. The correction derives a new helper without
editing the frozen model. Two real directional regressions fail on the parent;
the corrected model passes132 native/Chromium controls,195 measurement groups,
20 full worker comparisons and three compiled mutation checks. All190 parent
groups and catalog bytes survive. Live Stop, heartbeat and recovery still pass.

All30 current defaults were replayed:528 distinct actual jobs reproduce960
labelled reference comparisons within1e-7. Gear, consumes, policies and numerical
reference values stay unchanged. This replay opens no new optimization window;
the original2026-10-25T04:32:49.463Z deadline remains in force. Unobserved item
criticals and other pre-existing model assumptions retain their existing status.

The public adapter is `infra/simulator/druid-recombobulator-category.mjs`, with
three source tests and four Go controls in
`druid-recombobulator-category_test.go`. It validates the captured item category,
shared duration and personal cooldown before replacing exactly one timer. The
source remains `fixtures/druid-utility-items-source.v1.json.gz` under the same
directory. Exact runtime, replay and local-delivery receipts are in context.md.

## Confirmed coupled-use correction

The relative-regret correction supersedes the pending status in the historical
checkpoint below. It selects one physical gear/use plan across both crit
hypotheses and all four composite policies, then checks every retained contender
with fresh independent batches. All seven paired setups meet the observed2%
target and survive all84 selected sensitivity cases. The largest observed regret
is0.89704%; the largest per-comparison95% upper bound is1.82438%.

Three visible defaults change: Splendor tank3min and Nature's Grace burst3min in
both geometries. Recombobulator gives both resources to the same friendly target.
The public contract accepts only this actual mode, current zero coefficients and
owned Engineering use. Historical scaling and optimistic modes remain excluded.
All30 reference sets were regenerated; the27 unchanged setups reproduce their old
results within1e-7. The new local bundle awaits real browser qualification before
activation. Exact immutable receipts and release state are maintained in context.md.

## Utility feedback checkpoint

The incremental six-pool search completes129754 new jobs; fresh confirmation
completes7128 more. All54 selections survive42 sensitivity checks and satisfy the
observed2% comparison against retained alternatives. Exact algorithm replays
account for every saved request. These are scoped comparisons, not a global proof.

A separate optimistic five-item probe completes20724 new jobs for84 setups. It
flags eight Gauntlets, seven Recombobulator and one stacked-Headmaster possibility.
Free maximum critical heals and independently timed resources cannot enter public
defaults. The complete original-algorithm replay passes without new simulations.

The corrected timed Gauntlets component implements300–500 rolled healing, zero
coefficient, fixed1.5sGCD,30min cooldown and40yd range. Critical behavior remains an
explicit sensitivity. Its first integration attempt exposed an item heal entering
Druid rank/proc research; a separately frozen correction and regression exclude
that path.121 native/browser controls,185 measurement comparisons and actual
negative-controller/GCD/class-proc controls pass. Its focused actual-use feedback completes1848 new jobs /312 exact reuses across
16 locked crit/setup variants. Original-algorithm replay accounts for all2160
origins. Every reviewed retained candidate is compared with the original default
in all four policies; the largest observed gain is1.37033%, below2%. No default
changes follow from these scoped comparisons. Preserve the failed phase and
original class deadline.

The client gives Major Recombobulator ten charges, not one, with a five-minute
cooldown and two-minute category1153 timer. Second Wind and Mindtap use2554 and
must not share that timer by assumption. A coupled use must deliver healing and
mana to the same friendly target at30yards; it cannot heal a tank while restoring
the caster's mana. The captured coefficients are0. Historical reports of +healing
scaling motivate a separately labelled0/1 sensitivity, not a Forever server fact.
The coupled component passes124 native/browser controls and188 measurements,
including a second actual friendly mana user. Mutations that split mana to the
caster, allow unlimited charges or enter class-proc research all fail. The first
fixture used a mana-less dummy and failed to detect the split-target mutation;
its failed admission remains preserved. Stronger v2 controls replace that fixture
without changing the implementation. Focused coupled-use feedback completes2401 new jobs /1099 reuses for14 variants.
Original-algorithm replay accounts for all3500 origins. The exhaustive retained-
policy review flags8 material variants across four setups, including no-crit
cases. Its largest observed relative gap is4.19367% in missing-health score;
this is not an HPS gain. A focused correction is required before final default
qualification. Candidate choice must check relative regret in every hypothesis,
rather than treating the raw minimax winner as the only material alternative.
No public defaults have changed from this evidence yet.
Exact active phases and immutable proofs are recorded in context.md.

## Evidence and implemented baseline

The captured 70532 client graph contains 31 ranked candidates across Healing
Touch, Rejuvenation and Regrowth. The new extractor keeps their direct and periodic
components separate and validates class masks, targeting, flat mana costs,
cast times, level growth and fixed tick durations. It does not convert a client
ability row into proof of trainer availability.

The isolated Go baseline passes six native and browser controls. Healing Touch
and Regrowth direct heals scale with their captured coefficients and can crit.
HoT healing power snapshots on application, while periodic crit rolls use current
crit chance. Tests cover live crit changes, added healing power after application,
exact first/final ticks, rank replacement, Rejuvenation/Regrowth coexistence,
overhealing, resources, invalid targets and iteration reset. A seventh control
checks the unchanged Priest engine's Renew periodic crit behavior. Six recorded
measurement groups agree between actual native and browser WASM runs at 1e-7.

Blizzard explicitly confirmed crits for Rejuvenation, Tranquility, Wild Growth and
Renew in its beta fixes. This corrects the earlier Priest baseline metadata that
described noncritical Renew ticks. The frozen engine already allowed those crits,
so its numerical results remain unchanged. Regrowth's periodic crit behavior is
currently inherited from the engine; it has not been independently confirmed on
the server. [Official beta development notes](https://eu.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-15-october/631316/1).

The acquisition adapter excludes Healing Touch 25297 and Rejuvenation 25299 using
authenticated current learning links and the historical AQ raid-book source.
The other 29 ranks remain conditional candidates. Downranks are preserved.

## Current talents and special heals

The client and Blizzard's Druid notes establish several changes that the legacy
inactive Restoration agent cannot supply. Regrowth costs less mana, Moonglow no
longer discounts healing, Genesis affects periodic healing, and Nature's Splendor
extends healing effects. Gift of the Earthmother lowers selected healing GCDs.
Swiftmend preserves its source HoT. Wild Growth heals the selected player's party,
including pets, over seven declining ticks. These now have class-specific controls.
[Official Druid class notes](https://news.blizzard.com/en-us/article/24301515/world-of-warcraft-forever-class-deep-dives-hunter-and-druid).

Current talent application separates direct and periodic healing modifiers,
cast times, costs, crit chance, HoT extensions, GCDs, regeneration and cooldowns.
Damage-only Moonglow does not discount heals. Genesis does not modify Tranquility
through its periodic family mask. Nature's Grace adds general casting haste,
while its additional family-specific GCD reduction excludes Swiftmend. A focused
native/browser regression rejects the previous overly broad GCD implementation.
Nature's Swiftness requires ownership; an instant HoT preserves its charge, and
the next eligible cast-time heal consumes it.

Swiftmend requires an active owned Rejuvenation or Regrowth and preserves that
HoT. Its full snapshotted HoT amount, mana, crit, cooldown and selection policy
are controlled. When both HoTs exist, shortest-remaining and largest-total source
selection are explicit research alternatives; neither is server-verified.
Tranquility implements caster-party and pet selection; controls cover its actual
channel, subgroup, range, periodic crits, shared rank cooldown, interruption and
reset. Wild Growth selects the target's party and pets, checks the captured radius,
replaces its own ranks and shares a six-second cooldown. Actual summoned Hunter
pets now verify party membership, pet-targeted Wild Growth, Tranquility range and
exclusion after dismissal. This caught missing enabled-state and cast-completion
guards. A Regrowth finishing after dismissal or death cannot apply a new HoT.

The exact Wild Growth decay sequence is not present in the captured numeric
rows. Declared decay factors 0.05, 0.1 and 0.2 each preserve the seven-tick total
while changing timing. These are sensitivity cases, not a verified server curve.
Regrowth's periodic crit behavior and server downranking also remain unverified.

The extended acquisition policy contains 39 ranked candidates: the original 31,
four Tranquility ranks, Swiftmend and three Wild Growth ranks. Excluding the two
AQ books leaves 37 conditional pre-raid ranks when both relevant talents are
owned, or 33 without those talents. Talent ownership and required levels are
enforced independently of conditional acquisition. No trainer proof is inferred.

## Owned Innervate and resource boundaries

Innervate was absent from the original class subset but exists in the full 70532
tables. The new source fixture authenticates 13 selected rows from 12 tables.
Its policy is explicitly self-cast, requires level 40, costs 5% base mana, uses
the GCD and has a six-minute cooldown. The 20-second aura adds four times ordinary
Spirit regeneration and allows full Spirit regeneration while casting.

Controls verify actual mana ticks, cost, GCD, cooldown, expiry, dynamic Spirit,
mana caps and iteration reset. Unsupported targets, dead self, insufficient mana
and overlapping Innervate are rejected. There is no automatic major cooldown,
foreign cast or implicit external mana charge. This deliberately scoped research
policy does not claim complete friendly-target Innervate support.

The inherited Omen implementation assumes a 20% chance per eligible direct event.
Its code comment claims observed log support, but the saved effect audit labels
the rate provisional and does not supply those event receipts. Treat the rate
and event eligibility as unverified. Do not use that comment as server evidence.
The research extension now implements explicit proc/downrank sensitivity; its
declared alternatives do not turn those uncertainties into verified server facts.

## Explicit research cases and equipment coverage

Fourteen bounded research cases vary coefficient loss across rank/level gaps,
class-proc scaling, Omen chance and direct-heal versus completed-healing-cast
eligibility, and Regrowth periodic crits. They include the unchanged reference and
a combined mana stress case. This is a declared stress bank, not every Cartesian
combination or an observed server formula. The literal 100% client proc metadata
is an explicit alternative rather than a silent replacement for the inherited rate.

Controls preserve base healing and mana costs while varying only healing-power
coefficients. Direct and periodic components scale separately; Swiftmend consumes
the already scaled snapshot once. Turning off Regrowth periodic crits preserves
its direct crit behavior. Omen charge consumption, ICD, periodic-event exclusion,
cast-event alternatives, class-proc scaling and reset have actual engine controls.
Policies cannot change after casting and are echoed in workload results.

The equipment adapter covers every slot in the current reviewed 2,680-item engine
catalog, without stat or quality pruning. It admits legal Druid weapon styles,
held off-hands and idols, while retaining acquisition, profession, faction,
uniqueness, quest ownership and raid-material checks. Thirty faction/profession
contexts cover all pairs of six crafting professions. Their union contains 1,530
candidates; Engineering/Leatherworking Alliance has 1,453 and 12 idols. These
counts describe that reviewed catalog, not all client gear or optimized results.

The effect capture contains 3,082 selected current records, 21 sets, 222 root
spells and 264 expanded spells, with no missing spell names or misc rows. It
separately identifies 441 historical candidates without a current ItemSparse row.
Absence from that table is not proof of removal; provisional Classic records are
preserved. Effect capture does not admit their runtime behavior.

The coverage audit also confirms eight missing base Feralheart pieces, IDs
22106–22113. Set 513 has five threshold rows, including both six-piece effects;
alternate set 1667 has different bonuses. Its eight stat definitions, exact effects
and source-bound icons are captured for recovery. Seven Forever database reward
pages were reviewed; Horde quest 8913 uses an explicitly historical reward relation
because its Forever page could not be fetched. Actual server rewards remain
unobserved. [Belt/glove rewards](https://www.wowhead.com/forever/quest=8926/just-compensation),
[head/chest rewards](https://www.wowhead.com/forever/quest=8999/saving-the-best-for-last),
[historical Horde bracer relation](https://www.wowhead.com/classic/quest=8913/an-earnest-proposition).
The derived catalog now contains all eight pieces with current client stats.
Its protobuf review preserves every parent record and verifies a complete
round trip. The amended catalog has 2,688 items; its Druid domain has 1,538 union
candidates across the same thirty contexts. All 255 nonempty base-set subsets
pass complete-loadout legality in every context, for 7,650 controls. This is still
coverage of the reviewed catalog rather than all client equipment.

Set dispatch uses base ID 513 independently of alternate ID 1667. The base set
grants eight resistances at two pieces, both healing/damage and attack-power
bonuses at six, and 200 bonus armor at eight. Its four-piece proc uses the current
client's 2% incoming landed melee/ranged trigger and tooltip resource amounts:
300 mana, 10 rage or 40 energy according to the active resource bar. Ordinary
outgoing healing does not receive an implicit refund. Server cadence and the
resource-selection script remain unobserved.

### Current healing idols

Four equipped idols now have explicit controls. Idol of Rejuvenation 22398 boosts
only initial Regrowth healing by 5% while the caster's own Rejuvenation is active;
it does not increase Regrowth's HoT. The model checks the condition at heal
completion. That timing choice is an explicit assumption, including the case
where Rejuvenation expires during the cast. Another Druid's HoT does not qualify.

Idol of Synthesis 272429 reduces Swiftmend's remaining timer by one second per
owned Rejuvenation, Regrowth or Wild Growth family on its target. Multiple ranks
cannot count as multiple families. Foreign HoTs neither unlock Swiftmend nor
reduce its timer. Tranquility channel interaction remains outside the admitted
workload. Idol of Swiftness 279250 reduces Swiftmend's base cooldown from fifteen
to twelve seconds without granting its talent or changing other cooldowns.
Mystic Mushroom 249396 retains the existing 5% Spirit dependency, applied once.

Full-loadout review caught misordered equipment arrays in the early controls.
The engine auto-equipped their items, concealing the request-order error.
Corrected derived controls now verify both each input's item type and equality
between all seventeen requested slots and the actual actor. Frozen ancestors
remain preserved; only the corrected descendant is the current control input.

### Wildheart mana and recovered item healing

Exact set 185 now dispatches its five-piece resource handler. The additional
source capture follows tooltip links as well as trigger fields, recovering
27782's 200 mana, 27783's ten rage and 27784's four energy per second for five
seconds. Its 163 source records cover 25 spells across four relevant sets without
missing names or descriptions. Capture does not establish the scripted proc rate.

The inherited 2% mana probability remains an explicitly disclosed reference.
Six equipment policies include that reference, zero, 5%, 10%, literal client
100% metadata, and direct-heal event eligibility. These are hypotheses, not six
observed server behaviors. Zero disables the proc. The normal reference allows
one opportunity per eligible completed parent magic cast; recipients, bolts and
periodic ticks cannot multiply it. Direct-heal alternatives exclude periodic and
passive effects. Mana caps, death, reset and caller-policy ownership are checked.
An omitted policy is resolved and echoed when five Wildheart pieces are equipped.
Policies do not leak below that threshold or to another set identity. The shared
non-healer reference rate remains unchanged.

A separate audit checked 123 direct-healing items among the 1,097 current rows in
the 1,538-candidate domain. Six omissions are now corrected: Gnomebot Operating
Boots 11, Wildheart Vest 11, Boots 11, Spaulders 20, Kilt 24 and Cowl 15 healing.
The five Wildheart corrections add 81 to the 31 already present on its other
pieces. Together with the existing 18-point set bonus, the complete set supplies
130 healing power. Actual cast controls verify the contribution once.

Protobuf equality checks preserve every other catalog value, including the
observed vendor mace's 176 healing and 58 damage. The amended database still has
2,688 items and no remaining direct-healing disagreement against those current
rows. Historical items without current rows and other effect/stat types keep
their own evidence limitations. Numerical results do not transfer automatically
to the changed database. Both new healing controls fail against the old catalog.

## Healing workloads and job transport

The Druid runner now executes complete scheduled healing assignments with actual
casts, health loss, death tracking, mana spending and engine healing metrics. It
derives the common loop from authenticated frozen source while replacing Priest
spells and cooldown logic. The Druid health receiver is installed before the first
iteration; a broken variant without it is rejected. Deaths or undelivered damage
cannot count as a feasible completed assignment.

Priorities support HoT upkeep and select eligible injured targets before comparing
health. Swiftmend can choose a target with the required HoT when a more injured
target lacks it. Tranquility reacts to aggregate subgroup demand even when the
caster is at full health. Owned Innervate has an explicit optional missing-mana
threshold; omitting it means no activation. Nature's Swiftness has ownership and
healing-demand controls. Reviewed mana consumes reuse their existing explicit
cooldown policy. External Innervate, Mana Tide and Power Infusion approximations
are rejected pending separate admission.

The versioned Druid job protocol rejects unknown fields, invalid protobuf fields,
debug logging, unavailable/raid-book spell choices and unsupported policies. Its
JavaScript reader reuses common healing-accounting checks while retaining the
Druid schema. Native NDJSON and actual browser WASM agree on the same request and
both reject an unknown field. Existing Priest worker/UI assets are unchanged.

Current workload benchmarks deliberately cover one healer and player-only target
profiles. The separate spell controls prove real-pet behavior; they do not admit
pet encounters into this workload contract. Isolated spell controls declare their
synthetic bonus stats. The separate equipped cases use real catalog gear without
player bonus stats; neither category is an optimized pre-raid build.

## Self-effects and caster damage

The Resto-only extension models Dreadmist's exact five-piece set 183 self-heal,
Embrace of the Viper's four-piece set 162 resource effect, and Shadowcraft's
six-piece set 184 combat regeneration. Dreadmist has a 5% eligible completed-cast
trigger, flat 270–330 healing and no healing-power coefficient. Passive child
spells cannot recursively trigger it. Crit behavior is a declared alternative.

Viper checks the 25% health threshold with a five-minute cooldown and supplies
five one-second ticks of 20 health and 20 mana. Before-hit and after-hit threshold
checks are explicit alternatives. Incoming damage is removed exactly once before
the receiver invokes this handling with captured pre-hit health. Lethal hits cannot
start the effect; death stops both health and mana ticks. Normal resource caps,
exact set thresholds, iteration reset and fresh-policy ownership have controls.

Vitality supplies 15 health per five seconds, with explicit two-second or
five-second cadence assumptions. Its actual capped regeneration is recorded
separately and never counted as healing throughput. Aura 161's combat-regeneration
classification is supported by the
[TrinityCore aura definitions](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Spells/Auras/SpellAuraDefines.h).
This is an implementation reference, not evidence of Forever's server cadence.

Caster-damage workloads require explicit opt-in and the health receiver. Death
records survival failure and interrupts casting, preventing ghost healing. Policy
validation, default resolution and result echoes work through both native and
browser workers. These new handlers apply only to Restoration Druid. Global
item/set support flags are unchanged; future bundle metadata must retain that
class scope rather than claiming every agent supports the effects.

## Mana items and healing proc sensitivity

The current class-scoped extension admits Mindtap's ten one-second 125-mana ticks,
seven-minute cooldown and ten-second category shared with Second Wind. Tapped
Mind removes 60 Intellect for two minutes. Dynamic stat dependencies apply; the
explicit engine assumption clamps current mana to the reduced maximum on use and
restores capacity without free mana on expiry. This scope requires at least 60
Intellect. No server pool-clamp observation is claimed. Historical base item stats
remain provisional where the current Sparse row is absent.

Mindtap requires ownership and explicit SpellID 1302205 cooldown policy. Equipping
it does not activate it. Shared-CD checks precede personal-CD consumption, including
failed direct casts; both item activation orders have controls. Mindtap and Second
Wind stop periodic mana after caster death. The latter corrects an inherited timer
that previously continued after death. These handlers are Resto-only; common/global
sources and other published class engines are unchanged.

Dormant Heart has separate 40 healing and 13 spell damage for fifteen seconds,
with nonstacking refresh. Literal 100% client proc metadata is one reference,
not observed server behavior. Six explicit policies cover literal, zero, 2%, 5%,
10% and direct-heal event interpretation. Only actual registered Healing Touch
family spells in combat can trigger or refresh it. Rejuvenation, Regrowth and
other families cannot trigger it, but can benefit from its active healing bonus.
Periodic/harmful/passive events cannot leak into the completed-cast reference.
The triggering heal keeps its original
amount; the next heal receives the coefficient-scaled bonus. Policies own their
values and cannot change after activity. Results expose the resolved policy.
Energetic Rod's offensive trigger is captured but offensive weaving remains outside
these declared healing-only workloads.

The family restriction corrects an earlier broad healing-event predicate. A new
derived actor preserves the frozen source and updates two obsolete Rejuvenation
trigger fixtures to Healing Touch. Three new controls fail on the original model;
all128 corrected native/browser controls and all188 parent measurements pass.
528 actual jobs reproduce all960 labelled comparisons for the30 visible default
builds with unchanged references and gear. None equips Heart, so the correction
affects manual item choices without changing default recommendations. Its tooltip
now explains the family restriction and remaining proc uncertainty. Exact receipts
and the locally active release are recorded in context.md.

## Mark of the Dragon Lord

Current client text links the ring's 500-point all-school absorption to 22 mana
per five seconds while its shield holds. The Resto-only extension models that
link rather than granting permanent MP5. Its thirty-minute cooldown is independent
of the mana-trinket category. Ownership and explicit SpellID 17252 policy are
required; the effect always shields self. Healing power does not increase it.

Depletion, replacement, cancellation, expiration and iteration reset stop the
linked timer. Living-caster checks and the normal mana cap apply. The final due
natural-expiry tick is credited exactly once under the declared reference timing;
server boundary timing remains unverified. All seven schools, partial absorption,
overflow, cooldown, refresh/cancel/reset and actual worker activation have controls.
Unused shield capacity is not healing throughput. Absorbed HPS is recorded
separately, including absorption earned before a fatal hit.

## Verification and remaining optimization work

The earlier Serenity increment adds explicit use through its existing common
handler without replacing it. The source supplies 72 Spirit for fifteen seconds,
a ninety-second personal cooldown and fifteen-second category 1141. The workload
requires the owned item selector; equipping the trinket alone does not activate
it. Actual controls verify regen, timers, expiry, reset, explicit activation and
healing demand. Both controls fail against the old policy.

That increment passes 104 native/Chromium controls, 163 measurement comparisons
and 113 worker requests. All 156 parent measurements and 106 parent replies remain
unchanged. Seventy-five equipped requests pass independent protobuf/acquisition
checks. Its final audit verifies 8,517 pins; the catalog and common source stay
unchanged. Its then-current 255 reusable healer guards pass.

The newest engine separates Royal Seal and Briarwood item hypotheses without
mutating the catalog. Royal Seal's historical 44 healing is provisional; zero
retained healing is a sensitivity, and sixteen Spirit requires Forest/Grassland.
Briarwood's current equip effect grants fifteen spell/healing power; the historical
compiled value is 29, with a separate thirty-point Marsh/Swamp hypothesis. Missing
current base rows do not prove either the historical base or zero. Numeric policy
values are owned by a fresh Resto actor, require the equipped item, honor stat
multipliers, affect actual healing and reapply once per iteration.

This engine passes 108 native/Chromium controls, 171 measurements and 126 worker
requests. Its final review verifies 9,180 pins, 84 equipped requests and unchanged
parent results. Omitting the actual adjustment fails two behavioral controls.
All 263 reusable healer guards pass, including legal talent/rank neighbors and a
pure fingerprint independent of mutable cache-retention code.

The optimization clock is now running, from 2026-10-24T04:32:49.463Z to
2026-10-25T04:32:49.463Z. Initial fixed-gear priority feedback completes 1,306
simulations and independent origin replay; all nine selected three-minute states
survive both declared cases. The first gear phase completes 210,057 calculations
and 10,450 exact reuses, but its final source check fails after a concurrent cache
helper edit. Exact journal replay recovers all nine states and 900 selection steps;
an independent review verifies aliases and agreement with the final checkpoint.
Its failed budget entry remains intact. A corrective all-slot/set/pair/enchant
sweep completes 111,739 new calculations, 2,241 reuses and 450 selection steps on
the selected 1,460-item domain under four explicit hypotheses. All selected states
survive those cases.

Low-pressure assignments can hide gear differences; tied scores do not make inert
items universal BiS. A pressure review completes 5,240 calculations on a coarse
400–2,000 incoming-DPS grid. Fixed follow-up assignments are 400/600/600 for Wild
Growth and Nature's Grace and 400/800/800 for Splendor/Wild Growth, in tank/group/
burst order. Outer talent/priority/rank/consume feedback completes 18,167 new
calculations at those pressures, with 2,022 reuses and
97 selection steps. Finalist sensitivity completes 7,848 calculations and 1,812
reuses under 42 declared cases; all nine selected states survive. Exact-origin
reviews reconstruct both complete results without new simulations. Independent
confirmation completes 7,632 new jobs and 1,440 reuses against five distinct
alternatives with fresh seeds. All nine selections survive every case's 512
fights. Observed worst-case comparisons pass 2% and separate 1%; the largest
worst-case gap is 0.373483%. The largest single-policy point gap is 1.996476% and
the widest 95% upper bound is 2.855447%, preserving uncertainty explicitly.
All 270 reusable healer tests pass. The new utility proposal preserves every
modeled healing talent while moving unrelated filler toward useful healer utility;
it remains subject to numerical confirmation. A focused alcohol/utility follow-up
completes 3,888 jobs without repeating gear search. A further 7,776-job independent
pass confirms the revised defaults against five distinct alternatives. All nine
survive all 42 cases. The maximum worst-case gap is 0.385790%, the maximum
single-policy gap is 1.320576%, and the widest per-comparison 95% upper bound is
1.933278%. Those are conditional comparisons, not global/family-wise certainty.

The actual Druid Web Worker passes 378 native/Chromium comparisons, Stop, restart,
invalid-envelope recovery and responsiveness checks for the revised defaults.
Library/default/guidance delivery remains required. Thirty acquisition profiles
fit in six maximal pools; Engineering/Leatherworking needs a legal replacement
for the current Tailoring boots before its numerical comparison.

These pressures are separate synthetic assignments, not equal-pressure class
rankings or a maximum-capacity/tolerance certificate. These remain intermediate
calculations. Remaining effect bounds, other domains, duration/spacing coverage,
independent tolerance confirmation and actual website delivery remain required.

### Previous corrected-catalog checkpoint

The current corrected-catalog model passes 102 native/Chromium controls, 156
measurements at 1e-7 and 106 standalone worker requests. Seventy-two equipped
requests pass independent protobuf and the existing reviewed acquisition-policy
checks without synthetic player bonus stats. Detailed cases verify actual item
activation, penalties, aura uptime, shield depletion and separate absorption
accounting. The stat corrections legitimately change 65 worker replies and forty
parent measurement groups; the previous unchanged-results claim belongs to the
earlier Dragon Mark increment. Old numerical identities cannot cross this change.

The prior Dragon Mark increment rejected ten new broken runtimes. Across phases,
73 broken runtimes, two invalid request orders and now four old-catalog regressions
are rejected. Its earlier audit authenticated 8,017 pins and an unchanged catalog;
the current catalog-reconciliation audit authenticates 7,855 pins, unchanged
production runtime source, reviewed catalog changes and protected evidence. Exact
reports, assumptions and hashes are recorded in context.md.

The broader equipment inventory is diagnostic, not complete mechanics admission.
Actual controls confirm Postmaster/Necropile bonuses already work via legacy
handlers despite false generated capability flags. The 27-item reconciliation now
fixes all 41 flagged differences across 1,973 explicit critical-stat comparisons.
Its three attached effects affect melee damage, resurrection or Feral skill,
outside the declared healing workloads. Neck 6695 supplies five spell power;
its separate twelve damage against Undead does not increase healing. Doom Robes'
negative eleven Stamina changes actual maximum health. Current armor, quality,
item level and weapon damage are reconciled where needed. An independent codec
preserves all other records and verifies protobuf equality. Missing current rows
or channels stay unknown; historical acquisition remains provisional.

The new study adapter supplies three legal editorial talent seeds and comparable
tank/group/burst damage schedules, three/five-minute durations and stacked/spread
targets. Thirty-six actual native/browser cases use real legal equipment, no
synthetic bonus stats and the complete shared raid support. Fifteen survive their
assignments; the rest expose mana/survival constraints in the basic unenchanted
seed. These two-iteration controls are not optimized gear or qualified builds.
All 245 reusable healer tests pass. Exact current receipts are in context.md.

Before qualifying the Druid result, finish broader eligible item/set
stat and effect completeness, including scenario-specific defensive and resource
benefits. Royal Seal's current sixteen Spirit requires Forest or Grassland areas;
do not add it as unconditional raid Spirit. Declare that environment or compare
it separately. A skipped effect is not proof of zero benefit. The catalog still has
2,688 items and thirty Druid contexts with a 1,538-item union; these are reviewed
catalog counts, not complete client coverage. Finish legal enchant/consume study
inputs and scope the remaining effects, then run bounded all-slot, set, paired
hand/jewelry, talent, priority/rank and consume feedback with independent
confirmation. Deliver defaults, library, guidance and the actual browser workspace.

Holy Paladin, Restoration Shaman and unfinished original DPS/tank work remain
required. Priest's local delivery, frozen evidence and class clocks are preserved.
No Druid gear result is published yet.
