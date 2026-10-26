# Restoration Shaman equipment preparation

The acquisition adapter prepares all17 slots for both factions and all15 pairs
of the declared six professions: Alchemy, Blacksmithing, Enchanting, Engineering,
Leatherworking and Tailoring. Its original 2,017-candidate, 30-profile baseline is
preserved. Conditional Five Thunders access now expands the domain to 2,025
candidates across 90 profiles, with no stat or quality pruning. These are candidate pools, not BiS
recommendations or a complete item-effect qualification.

Main-hand candidates include eligible axes, maces, daggers, fist weapons and
staves. Off-hand candidates include shields and held items; two-handed weapons
require an empty off-hand. Dual-wield weapons are outside the currently qualified
domain; their current acquisition remains unresolved. Relics are Shaman totems.
Cloth, leather and mail remain eligible; class,
faction, profession, raid-material and whole-loadout ownership restrictions pass
through the common acquisition checks. Weapon-style changes do not remove those
checks. Six legality contracts pass, including all hand Cartesian alternatives.

Each profile includes a deterministic legality-control seed. Its purpose is to
test a complete valid request; its items were not selected by healing performance.
The eight base Five Thunders rows are available only in explicit reference
quest-completion profiles. The original sources remain unchanged. See the
[access and set mechanics review](simulator-shaman-five-thunders-recovery.md).

The immutable preparation receipt is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-equipment-v1/prepared-jaDEp8/report.json`,
SHA-256 `2ef83c95905ee4b9c1e19fc680a26d5493c6912affa74becb5b5ba3c2251fafb`.
Its source-bound compact test fixture contains51 actual catalog/source records.
The full domain, actual six-test log and every input hash are retained in that
directory. Preparation executes no combat jobs and starts no numerical clock.

## Whole-loadout gate qualified — October 26, 05:59 UTC

`shaman-equipped-domain.mjs` compiles the source-reviewed acquisition and enchant
contracts. `assertShamanEquippedLoadout` validates complete equipment in Node.
The matching Go surface is `ValidateKFCShamanEquippedLoadout(player, profileID,
domainIdentity)` and `KFCShamanEquippedDomainIdentity()`. It embeds the reviewed
domain and returns an independently owned receipt. This public surface admits
equipment input only; its workload/numerical/publication flags remain false.

The contract preserves 90 profiles, 2,025 candidates, 2,147 item/slot pairs and
127 enchant recipe records. It checks race/faction, both profession orders,
slot membership, complete paired hands, compatible enchant effects, unique
copies, shared categories, exclusive quest rewards, conditional Five Thunders
milestones, unknown protobuf fields and unadmitted suffixes. A domain hash binds
the exact acquisition/enchant snapshot; the later fight identity must also bind
the engine, talents, buffs, consumes and effect/cooldown policies. It is not a
complete simulation-cache identity or proof of current server availability.

All 200 native/Chromium controls and 647 groups pass. All 192 parent controls and
639 groups remain equal. The new source comparison matrix contains:

- 180,180 item/slot candidates across every profile.
- 27,728 compatible enchant comparisons and 4,294 invalid enchant cases.
- 18,525 complete loadouts: 6,870 legal and 11,655 ownership conflicts.
- All 4,620 multi-piece Five Thunders reward combinations.
- 5,250 invalid two-hand/offhand pairs and 13,050 cross-profile exclusions.
- 900 race/profile cases, plus malformed requests and caller-memory checks.

These are inexpensive input checks, not numerical gear optimization. Twelve
compiled faulty validators are rejected, including omitted acquisition, faction,
profession, domain, enchant, suffix, ownership, hand and unknown-field checks.
Eight portable tests, scoped lint/format, full simulator compilation and 178
Paladin/one Priest regressions pass. All 713 parent compiler inputs are preserved;
only the gate, embedded domain and tests are added. The previous 16 DPS comparisons
remain inherited through exact source preservation; none was rerun or relabeled.

Input receipt under `artifacts/forever-simulator/optimization/healer-model-admission-v1/`:
`shaman-equipped-domain-inputs-v2/prepared-2TRUMU/report.json`, SHA
`1e9274fea0dda2cd337c6876d2af208b8503133563159894819b9c272258c9ce`.
Domain identity:
`666556118e2b7454531b4c9c157c8dd0fc72505d1360562e746a03179b8d1bfb`.
The final review is
`shaman-equipped-domain-v3/fe75b0a329913f84edafdb0426b364d24508fd829419484c2aee89420ebd4ba6/build-ulI8Kx/final-review-XlrCW7/report.json`,
SHA `d93b05d53db6749fdb21c4fa1a4495313cf1b226d70fd88e9bf8c92ab430c9a5`.
It independently replays the common source eligibility decisions, checks every
parent measurement and verifies 12,338 evidence pins. Earlier builds are retained;
the final successor adds boundary witnesses without changing the gate or domain.
Successful sources and readers are frozen.

Run the portable contracts with:

```sh
node --test infra/simulator/shaman-equipped-domain.test.mjs
```

The original spell-only workload and job still reject equipped requests. Next
derive the complete equipped workload and native/browser transport, validate all
remaining request fields, configure the owned policies at a valid fresh lifecycle
point and execute explicit potion/Rune/item decisions. Cross-effect and external
demand accounting controls must pass before numerical feedback and final presets.

The additional source inspection captures SkillLineAbility 48686 (Shaman class
mask 64, Dual Wield 674, numeric AcquireMethod 3), passive 1300344 and Earthliving
415292. None is granted by the captured current Shaman talent nodes. Their presence
in shared client tables does not establish live access or seasonal/product gating.
SkillRaceClassInfo and SpellLearnSpell are absent from this extraction. Resolve
actual grants before claiming complete Shaman hand-style or imbue coverage.
The 21-row source receipt is `shaman-weapon-access-v1/inspection-s00gdz/report.json`,
SHA `367b5c92974d8f88dbf4f68f410d5e681d99b4b31cca33f863c1ea8d8a2ff2fc`.

## Conditional access and utility sources — October 26, 04:11 UTC

The expanded domain preserves all 30 original profiles and adds 60 Horde
milestone/profession profiles. All 4,620 multi-piece Five Thunders combinations
are complete legal loadouts. An independent bitmask enumeration confirms every
subset, unchanged baseline pools/seeds and 60 earlier-phase rejection cases.
There are 34 represented sets. All 707 current compiler inputs and the parent
catalog are unchanged. Quest bundle delivery is corroborated by indexed Forever
pages; current server access and character progress remain explicit conditions.
The [Five Thunders recovery document](simulator-shaman-five-thunders-recovery.md)
records the exact sources and immutable preparation/review receipts.

`shaman-utility-items.mjs` now binds the nine remaining utility items to their
captured current-client payloads:

| Item | Source-bound effect | Runtime reference still required |
| --- | --- | --- |
| Gem-studded Leather Belt | Self heal, mean 300; 5-minute cooldown and 1.5-second GCD | Critical behavior |
| Gauntlets of the Sea | Friendly heal, mean 400; 30-minute cooldown and 1.5-second GCD | Critical behavior and recipient control |
| Minor / Major Recombobulator | Same friendly health/mana recipient; ten charges; Engineering 140/275; 5-minute cooldown, shared category 1153 for 2 minutes | Critical behavior and independent/correlated resource rolls |
| Circle of Flame | Ten 1-second health/mana ticks, mean 79 per resource per tick; 5-minute cooldown | Channel haste, interruption, damage ordering and resource rolls |
| Headmaster's Charge | 20 party intellect within 30 yards for 15 minutes; 10-minute cooldown | Stacking with raid intellect |
| Mark of the Dragon Lord | 500 shield and 22 mana every 5 seconds while the shield holds | Shield exhaustion, expiry, death and tick boundaries |
| Baron's Scepter | Party regeneration, 4 health per five within 30 yards | Tick cadence and resource attribution |
| Hammer of Grace | Owner death triggers a mean 1,176 party heal within 40 yards | Living recipients and exactly-once death dispatch |

The centered-uniform amount interpretation is an explicit existing-model
reference; it is not a live measurement. Healing coefficients are zero in these
captured direct utility payloads. This review does not install handlers or grant
automatic use, favorable stacking or free resource effects.

Three legacy items retain their separate current effect and historical base
status. Briarwood has 15 neutral equip power plus 15 conditional marsh power,
versus its compiled historical total of 29. The Shaman Royal Seal has 18 equip
magical damage/healing versus compiled 23; its additional demon-only 18 applies
to damage, not healing. Eye of the Beast retains the current 1% spell-crit
reference, separate 7% spell-hit use and an unverified scripted aura. None of
these three has a current base record in this snapshot; their total stats must
not be relabeled as verified or overwritten merely from the equip-effect rows.

Ten utility/source regression tests pass. They reject changed scaling, targets,
charges, professions, shared cooldowns, school/cost/cast-time, range/radius,
duration and trigger graph. Together with the 24 access/equipment/source tests,
34 focused checks pass; scoped ESLint/Prettier pass. Run them with:

```sh
node --test infra/simulator/shaman-five-thunders-acquisition.test.mjs infra/simulator/shaman-five-thunders-source.test.mjs infra/simulator/shaman-five-thunders-drafts.test.mjs infra/simulator/shaman-healing-equipment.test.mjs infra/simulator/shaman-utility-items.test.mjs infra/simulator/shaman-shared-equipment-source.test.mjs
```

Utility source receipt:
`artifacts/forever-simulator/optimization/shaman-utility-items-v1/source-e7dG93/report.json`,
SHA-256 `ed388d9ce3ee2fbcef4bb89d96c0fb0dc9ab03552bbfa28c8303d3737a3fd1a3`;
744 source pins verified. These successful source/helper bytes are frozen.
The next derivative must qualify utility/legacy runtime references, enchants and
consumes, then bind full equipped workloads and access profiles. Numerical
feedback, fresh confirmations and real Shaman website delivery remain required.

## Nine utility effects verified in the engine — October 26, 04:31 UTC

The isolated Restoration controller now implements all nine utility effects
listed above. It registers actual equipped items only and requires an explicit,
fresh policy after geometry setup. Class heals with utility gear also require
that policy, so a search cannot silently value the gear while omitting its
declared effect reference. Existing non-Restoration production inputs are intact.

The current policy surface is:

```json
{
  "schema": "kfc-shaman-utility-policy.v1",
  "id": "explicit-source-reference",
  "healingCanCrit": false,
  "recombobulatorCanCrit": false,
  "channelScalesWithHaste": false,
  "resourceRolls": "independent-reference",
  "headmasterIntellect": "disabled-reference",
  "baronTickPeriodMs": 5000
}
```

Alternative references are critical utility healing, critical Recombobulators,
SpellHaste-scaled Circle, same-percentile health/mana rolls, additive Headmaster
intellect and two-second regeneration ticks with the same per-five average.
These are named assumptions. Server stacking, criticals, channel behavior and
roll correlation are not inferred from a successful engine test.

Direct heals respect source self/friendly targeting, range, zero healing-power
scaling, GCD and cooldowns. Both Recombobulators require Engineering, consume ten
charges, restore health/mana to the same friendly target and share the two-minute
conjured timer without shortening their five-minute personal cooldowns. The
existing shared interface suppresses this actor's free generic Recombobulator
consumable path; no common core file was changed. Max profession skill remains
the equipment profile's reference; no character skill progress is invented.

Circle uses ten delayed resource/damage ticks and cancels on interruption, death
and reset. Effect zero restores mana before the separate self-damage effect.
The tests distinguish Spell Haste from hardcast-only speed. Headmaster tests
disabled/additive intellect, party/range, cooldown and expiry. Baron's party
recovery is attributed to health resource metrics, with the same 4HP5 average
under both declared cadence references; it creates no healing spell callbacks.
Dragon Mark's mana ends when its 500 shield exhausts, and its thirty-minute final
tick occurs exactly once. Reset invalidates old schedules. Hammer dispatches one
owner-death heal to living in-range party players; it cannot revive its owner or
heal dead, distant or other-party recipients. The current workload is player
healing; pet-healing behavior is outside this component's qualified scope.

Verification:

- 175 actual native/Chromium controls and 470 complete measurement groups pass.
- All 161 parent controls and 436 groups remain numerically equal.
- Fourteen utility controls cover 34 groups. Thirteen compiled wrong-behavior
  variants fail their intended regressions, including recipient, charges/shared
  cooldown, rolls/haste, extra ticks, regen/intellect/shield, repeated death and
  isolated late-policy acceptance.
- The full simulator builds; 178 inherited Paladin and one Priest regression
  pass. Scoped ESLint/Prettier and Go formatting pass.
- The 709-file workspace preserves 705 parent inputs, changes only the owned
  actor/ordered receiver and adds implementation/tests. All production inputs
  outside Restoration are unchanged. Sixteen earlier DPS pairs are inherited by
  verified lineage/source preservation, not relabeled as new executions.

Public sources are `shaman-utility-runtime.mjs`, `shaman-utility-runtime.go` and
`shaman-utility-runtime_test.go` under `infra/simulator/`. Successful sources and
private preparer/readers are frozen. The immutable model is under:

```text
artifacts/forever-simulator/optimization/healer-model-admission-v1/
  shaman-utility-runtime-v2/
  07126fbaff74d3bb89b7ee6a0fd980e6401d6c32fb3722ad02ad9967e51ce1fc/
  build-InWiT5/
```

Final receipt `final-review-WTke7k/report.json`, SHA-256
`9a3d9b6617ba83e7496361c4af2c7ca2da398a8cc6728dcf25955a9a349aabf5`,
independently verifies 10,092 source pins, raw native/browser logs, complete
metrics, inventory boundaries and all thirteen mutation source/log pairs.
The browser receipt is `browser-review-399YAe/report.json`; the mutation receipt
is `mutation-review-FyoB52/report.json`.

The first failed build is retained under `shaman-utility-runtime-v1/7cc4.../`.
Its Circle fixture incorrectly used hardcast speed to predict channel haste.
The corrected fixture checks actual Spell Haste and separately proves that
hardcast-only speed does not shorten the channel. Runtime implementation bytes
were unchanged by this fixture correction.

The three legacy total-stat references remain separate from these nine utility
effects. They still require an owned current-versus-historical runtime binding.
Enchants/consumes, full equipped-workload/access-policy integration, bounded
numerical feedback, independent confirmations and matching simulator delivery
remain. This component neither starts the numerical class clock nor qualifies a
whole-loadout recommendation. Nothing was selected or deployed.

## Legacy reference component verified — October 26, 04:51 UTC

The owned Shaman controller now binds the three legacy items without changing
their shared catalog records. The missing current base records and Eye's script
remain unverified. Qualification here means the declared references execute
correctly; it does not establish current server totals.

For a loadout with Briarwood and the Shaman Royal Seal, a reference is:

```json
{
  "schema": "kfc-shaman-legacy-item-policy.v1",
  "id": "briar-15-seal-18-eye-absent",
  "briarwoodSpellPower": 15,
  "royalSealSpellPower": 18
}
```

The finite matrix compares Briarwood at 15/29/30 and Royal Seal at 18/23. These
are explicit captured-equip-versus-historical-total sensitivities, not automatic
zone detection or six claims about live stats. The policy generator emits only
fields for equipped legacy items: three Briarwood-only choices, two Seal-only,
six paired choices or one Eye-only reference. Policy validation rejects invented
values, nonfinite numbers, unknown fields and empty references. The engine also
requires every owned legacy item to be covered and rejects unowned declarations.

The actor applies only `SpellPower` deltas relative to compiled totals 29 and23.
Current damage-only demon power cannot become healing, and the ordinary
HealingPower/SpellDamage channels are not independently duplicated. Deltas apply
once and survive reset. Actual Healing Wave controls reproduce the declared
0.857 coefficient differences. Policies and echoes own their scalar references;
caller mutation, missing geometry, elapsed time, cast history and repeated
configuration cannot change a running comparison.

Eye-only gear requires the literal `eyeScriptReference` value
`captured-passive-unmodeled-script-reference`. Its existing common handler stays
intact: 1% passive spell crit, a separate 7% spell-hit use for20seconds, a5-minute
personal cooldown and category1141's20-second shared timer. Its active spell hit
does not increase actual healing. Both activation orders with Serenity preserve
their own20/15-second shared durations. Unsupported spell1318846 is not assigned
an invented benefit or relabeled as verified inert behavior.

All183native/Chromium controls pass across488complete groups; all175parent
controls and470groups remain numerically equal. Eight new legacy tests cover18
measurement groups. Ten compiled behavioral faults fail their intended tests:
wrong base/channel, omitted reset, missing owned reference, late update, pointer
aliasing, invented script approval, Eye healing substitution and a shortened
shared timer. Four portable policy tests, fullsim build,178inherited Paladin and
one Priest regression pass. Scoped ESLint/Prettier/Go formatting pass.

The711-file workspace preserves708parent inputs, changes only the Restoration
actor and adds implementation/tests. All compiler inputs outside Restoration
also match the model that executed the earlier16DPSpairs, so that evidence is
inherited without redundant new DPS jobs. The independent reader checks the
generator's six pairs against the actual native control matrix, all complete
native/browser measurements and all mutation source/log pairs.

Public sources under `infra/simulator/` are `shaman-legacy-items.mjs`, its Node
tests, `shaman-legacy-items.go` and its native tests. Run portable contracts with:

```sh
node --test infra/simulator/shaman-legacy-items.test.mjs
```

The immutable model is under:

```text
artifacts/forever-simulator/optimization/healer-model-admission-v1/
  shaman-legacy-items-v1/
  e8ec2525f2c1508561170d4c3b525167b027cfef9a157f49716b2f0cf092ac63/
  build-awsIQN/
```

Final receipt `final-review-ogmGPS/report.json`, SHA-256
`e920bf2a5b1c02f4d6e32cd7dc297527c59e4dcc28c337a4fa9577579709e8c3`,
verifies10,815source pins. Browser receipt: `browser-review-3JO4U0/report.json`.
Mutation receipt: `mutation-review-3wJDGG/report.json`. The first final reader
checked the new component's flag on its utility parent. The successor corrects
only that parent-field name; no source policy, model result or gate was changed.
Successful public and private sources are frozen.

Enchants/consumes and complete equipped-workload/access-policy integration
remain before bounded optimization, fresh confirmations and matching Shaman
defaults/configurations/gear/library/guidance. The numerical clock has not
started. This component alone does not qualify a complete build or deployment.

## Enchants and consumes qualified — October 26, 05:24 UTC

The Shaman improvement domain reuses the common pre-raid acquisition,
class/slot/hand/level restrictions against the corrected build70532 inspection.
All182 captured rows match the compiler's mechanical fields and enchant stat
vectors. The90 equipment-access profiles retain2,025 candidate items and2,147
distinct item/slot pairs. There are127 eligible recipe records; recipe aliases
remain separate provenance, not extra simultaneous bonuses. Every pair retains
the no-enchant control. No stats or quality threshold prunes candidates.

Known raid recipes/rewards remain excluded, including the historical weapon
Healing Power and glove Healing Power recipes. Provisional effects36/803/1898/
1900 retain their status and explicit policy. Their offensive behavior is not
qualified here. Eighty actual healing casts per effect cause no outgoing damage
or Crusader strength in this player-healing assignment. Future offensive weaving
or autoattacks require a different qualification. The182-row snapshot has no
profession-required enchant rows; a future such row stops preparation until a
profile-aware successor is implemented.

The consume generator retains1,320 finite combinations across these existing
healer axes:

| Axis | Choices |
| --- | --- |
| Flask | None and four current engine flask options |
| Food | None and ten admitted nonraid options |
| Main-hand consume | None, Lesser Mana Oil, Wizard Oil |
| Potion | None or Major Mana Potion |
| Conjured | None or Demonic Rune |
| Mana regeneration elixir | None or Greater Mageblood |

These axes supplement the complete source-bound baseline. They do not replace
the other legal passive consumes or the required full raid-wide support. Raid
food, raid-reputation oils, unknown enum values and undeclared fields are
rejected at this candidate boundary. The1,320 entries are inputs, not1,320
executed optimizations or measured rankings.

Actual Shaman controls confirm the current shared consume effects:

- Supreme Power gives150 damage power and zero healing power; Distilled Wisdom
  adds2,000 mana, and Titans adds1,200 health.
- Lesser Mana Oil grants20 healing power and10MP5; Wizard Oil grants24 damage
  and healing power. The oil's actual six-second mana difference is12.
- Current Nightfin/Sagefish/Tender Wolf/Tuber/Squid behavior and Greater
  Mageblood's20MP5 are checked through actual character dependencies and spells.
- Potions and runes use independent two-minute timers. Combined mana rolls,
  caps and Rune self damage/death are checked. The shared owned-controller
  interface continues to suppress a free unequipped Recombobulator consume.

All192 native/Chromium controls pass across639 complete measurement groups.
All183 parent controls/488 groups remain numerically equal. Nine new tests cover
151 groups, including all127 eligible recipe witnesses with actual equipment,
full stat-dependency deltas and compatible engine loading. Eight compiled faults
are detected: doubled enchants, Supreme Power healing, missing oil healing,
stale oil regeneration, missing/doubled Rune damage, shortened mana cooldown and
the free generic Recombobulator. Six portable policy tests, full simulator build,
178 inherited Paladin and one Priest regression pass. Scoped ESLint/Prettier/Go
formatting pass.

This is an unchanged-production derivative: all711 parent compiler inputs are
preserved and only the native test/data files are added, for713 total. Earlier
DPS comparisons are inherited through verified source preservation. No new DPS
jobs, class search clock, preset selection or deployment accompanied the work.

Public sources under `infra/simulator/` are `shaman-healing-improvements.mjs`,
its Node tests and `shaman-healing-improvements_test.go`. Run portable contracts:

```sh
node --test infra/simulator/shaman-healing-improvements.test.mjs
```

Input preparation receipt under the simulator optimization root:
`healer-model-admission-v1/shaman-improvements-inputs-v1/prepared-mRiypq/report.json`,
SHA-256 `0410826813cc6712603dd3bf5e79d5f1c63802e3ac6895eda4fc0520c8ecd5eb`.
It authenticates the corrected inspection, unchanged current catalog, access
profiles, mechanical enchant rows and actual component-only item witnesses.

The immutable runtime is under:

```text
artifacts/forever-simulator/optimization/healer-model-admission-v1/
  shaman-improvements-v1/
  834dc8e421f0ab5190ef81187e2a5f653b0a0ae1ad411169b44c5f3d6a16f779/
  build-377JeS/
```

Final receipt `final-review-vx3WVW/report.json`, SHA-256
`b37e332f304d81ea04e444972bde38c21df3116bd1dd05dea78d7adc6d2d6c9a`,
verifies11,556 source pins. Browser receipt: `browser-review-v3x6fL/report.json`.
Mutation receipt: `mutation-review-JFfC47/report.json`. Successful sources and
private preparer/readers are frozen.

The next admission must connect complete legal gear, improvements, conditional
acquisition, professions, full raid support, every owned item/set/legacy/utility
reference and controlled cooldown use to the actual workload/request identity.
The existing spell-only guard still rejects equipped inputs; it must be replaced
by the complete integrated checks rather than bypassed. Coupled Rune/Circle/
shield/set/regen accounting needs actual controls. Confirm current dual-wield
access before claiming all Shaman hand styles; the present healing domain covers
two-hand and one-hand plus shields/held off-hands. Bounded feedback, fresh
confirmations and matching simulator delivery remain required afterward.

## Source audit before numerical comparisons

The initial audit compared3,822 explicit mapped current modifiers without assuming
an absent current channel is zero. It found six discrepancies, now corrected:

| Item | Field | Catalog | Current client |
| --- | --- | --- | --- |
|1484 Witching Stave|Shadow spell power|0|27|
|1936 Goblin Screwdriver|Agility|2|4|
|20070 Sageclaw|Bonus armor|40|30|
|20214 Mindfang|Bonus armor|40|30|
|250616 Bold Dirk|Agility|7|6|
|272603 Premier High Warlord's War Staff|Spell penetration|0|5|

The derived current-stat model changes exactly these six cells. An actual
protobuf comparison preserves all other item fields, acquisition and non-item
database data. Missing current channels remain untouched, including the War
Staff's existing spell power. The actual old catalog fails both new regression
controls; the corrected native catalog and equipped characters pass. Reverting
each cell separately makes both controls fail again.

All68 native controls match Chromium/WASM across138 groups. All245 parent
controls/416 groups remain unchanged, with six additional data-reversion mutants
and the separate DPS guard fault detected. Six actual DPS pairs remain unchanged.
All30 profile slot pools are independently recomputed and preserved. The688-file
workspace changes only the embedded catalog and adds one regression file; every
parent gameplay source file remains unchanged.

The immutable final receipt is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-current-items-v1/d52f4b767c3a58f63799ce03d4595404ca3526dc373a02aa65c0c0d6938bf1d2/build-L93QGX/final-review-aMvw69/report.json`,
SHA-256 `e105ec3ebb87d8654e0f8465a8adecfd46e92f32c0895ab011a0b1a4440e465e`.

The post-repair source audit reports zero mapped stat discrepancies across the
same2,017 candidates and3,822 comparisons. Its receipt is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-equipment-source-audit-v2/audit-j1cBW1/report.json`,
SHA-256 `991858f8d426048d5940f5cfc57038237b2283b8f0b444c66b2f80d0e0803adc`.

That audit left twenty modifier records unmapped. The later modifier-scope and
flat-regeneration review below classifies all twenty and qualifies the eight
health-resource rows. The offensive discrepancy remains explicit. Separately,
557 candidates lack a matching current normalized item and retain
their existing historical/provisional evidence. Missing current data is not
converted to a zero-valued item or silently declared verified.

The domain represents33 sets and149 current items with linked item effects.
Seven current totems have links; three additional admitted candidate totems have
historical base records. All ten now have reviewed client effect links and exact
owned-family associations, described below. Existing inherited handlers alone
remain insufficient proof of full healing support.

The full immutable audit is
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-equipment-source-audit-v1/audit-X7Uj46/report.json`,
SHA-256 `1dfe3be4eb06445055a6db1afc097c3066fe27c4ca5f8a13afe87645afc29c0b`.
It preserves every candidate ID, difference, unmapped modifier, current-missing
ID, linked item, relic and exact current set/threshold row. Its current-stat and
full item-effect completion flags remain false. Complete these reviews and bind
the equipment to the workload before starting bounded numerical feedback,
independent confirmation and preset/library/guidance delivery.

## Totem source and family review

All ten candidate totems are retained. Five affect the declared healing/resource
scope; five affect offensive spells or Grounding Totem, which are outside the
stationary post-mitigation workload. The exact client family masks cover all32
owned basic heals, Riptide ranks, water summons, Water Shield and Nature's
Swiftness. Raid-book rank25357 is excluded.

| Item | Captured effect | Owned family |
| --- | --- | --- |
|22345 Totem of Rebirth|Riptide mana cost −5%|All3 Riptide ranks|
|23200 Totem of Sustaining|Water Shield +1 charge|408510|
|249398 Polished Driftwood Icon|8% spirit regeneration while casting|Caster resource modifier|
|272431 Tidal Totem|Healing Wave mana cost −5%|All9 Healing Wave ranks|
|279249 Totem of Urgency|Lesser Healing Wave critical chance +4%|All6 Lesser Healing Wave ranks|

The other five retain exact source payloads for Shock damage, Lightning Bolt
critical chance/Maelstrom triggering, Flame Shock duration and Grounding Totem
cooldown. Dummy aura4 is interpreted through its captured spell description and
payload; it is not generically treated as resurrection speed. Four nonzero
effect bonus-coefficient fields are preserved for runtime review. No server
stacking or scaling rule is inferred from those fields.

Items22345/22395/23200 have no current ItemSparse base record in the capture, while
their client item-effect links remain present. Their historical/provisional base
status is explicit and unchanged. The other seven require a current base record;
the source reader rejects unexpected omissions or payload/family/condition changes.

Four source contracts pass. The immutable preparation receipt is
`artifacts/forever-simulator/optimization/shaman-relics-v1/prepared-XONJwq/report.json`,
SHA-256 `06870eaa4c5a6c0e573f7e76e176479463c51e15fcff6e1813d22d26f20f2d3b`.
It authenticates actual source subsets and the four-test log. The subsequent
runtime component below qualifies these five effects. Shared items, remaining
sets, enchants and consumes still require complete integration. No Shaman
numerical clock or website preset is activated by source preparation.

## Equipped healing relic component verified — October 25

All five healing/resource effects now have actual equipped-character controls:

- Riptide and Healing Wave reductions cover every owned direct-cast rank. Their
  additive and multiplicative stacking references are explicit; neither is
  presented as verified server stacking. Original base costs remain intact.
- An optional precise core factor handles fractional multiplicative costs in
  affordability checks and actual mana spending. For example, two 5% reductions
  preserve 90.25% rather than rounding to 90%. Its zero default preserves the parent
  cost path. Riptide's tagged periodic action shares its spell ID but cannot
  receive this direct-cast modifier.
- The shield relic adds a fourth charge without granting an unlearned spell.
  Actual critical-heal returns preserve the 3.5-second ICD, recast behavior, mana
  caps, charge exhaustion and iteration reset.
- All six Lesser Healing Wave ranks receive 4% critical chance. Actual 10,000-heal
  controls produce 883 versus 1,299 critical outcomes under the same fixed seed;
  other owned cast families retain their original crit modifiers.
- Driftwood's 8% casting spirit regeneration applies once, alongside each
  Mindfulness rank. Actual mana ticks, full-mana caps and resets are controlled.
  The inherited handler remains active for Elemental and Enhancement.

All 80 native controls match Chromium/WASM across 188 groups. The independent
review preserves all 247 parent controls/418 groups, catches 11 compiled healing
faults plus two DPS guard faults, and compares eight unchanged actual DPS cases.
The complete simulator builds; 178 Paladin and one Priest regression pass.
Four existing core resource tests also pass in both parent and child workspaces,
including mana attribution/caps and paid-cost energy/rage refunds.

The 690-file workspace preserves 684 parent files, changes four narrow integration
files and adds the owned implementation/test files. Catalog bytes, acquisition,
dependencies and existing workload restrictions remain unchanged. All ten relics
remain represented; five are explicitly inactive within this healing workload.

Immutable final receipt:
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-healing-relics-v1/f63687c632e47e148b934f2ed206fe286398f457e458f815169e3df903016e0b/build-6hiTA9/final-review-q6HUaT/report.json`,
SHA-256 `ee15399da1a1aea6c7faf40b6958832ff98523f51218b0164fdd0870435b9b4f`.

Public `shaman-healing-relics.go`, `.mjs`, `_test.go` and `.test.mjs`, along with
the successful private preparer/reviewers, are frozen for this receipt. Derive
new versions for further changes. This is component admission, not whole-gear
admission or numerical BiS. The full workload still rejects equipment/consumes
until all remaining effects are integrated. No numerical window, website
selection, commit or deployment started.

## Complete captured shared source inventory

The full raw item-link join finds **251 linked candidate items**, including 102
whose base records remain historical. The earlier 149 count covered current-base
items only. Those additional effects remain in scope; missing current base data
does not imply an absent effect. All 2,017 candidates and their acquisition
metadata are retained.

The inventory contains 268 item-effect links, 33 sets and 104 set thresholds.
Their 281 root spells expand to 341 spells through captured trigger links.
Current source rows, exact owned healing masks, durations, cast times, ranges and
radii are replayed against the hashed effective client tables. Four source
contracts pass. This verifies captured relationships; runtime admission stays
false. The 20 unmapped modifiers and 557 missing current base records remain
explicit.

Preparation receipt:
`artifacts/forever-simulator/optimization/shaman-shared-equipment-v1/prepared-EopTys/report.json`,
SHA-256 `1738bd0d717e69fadaecbc49a8849761c223f839363e6ec91b36f3056a3a1bf9`.
Fixture: `infra/simulator/fixtures/shaman-shared-equipment-source.v1.json.gz`.
Public reader: `infra/simulator/shaman-shared-equipment-source.mjs`.

A separate extension follows indexed cross-spell tooltip amounts and duration/
range references, then closes their trigger links again. It adds 17 supporting
spells for **358 total spells** and 102 textual reference edges. This includes
the Elements set's mana/energy/rage return records. The malformed local token
`$1s` on spell450554 is not treated as spell1. Other conditional text syntax is
explicitly uninterpreted. All original source records remain identical, and every
selected extension row and lookup matches its raw table.

Extension review:
`artifacts/forever-simulator/optimization/shaman-shared-equipment-v1/text-review-3a0bMw/report.json`,
SHA-256 `7df340f62da5ad8848876cbc08e3397b3a1c2e9fc69c73872de586cf69ed6c55`.
Fixture: `infra/simulator/fixtures/shaman-shared-equipment-text-source.v1.json.gz`.
Source preparation and its successful readers/capturers are frozen. Subsequent
work must qualify actual set/item behavior, remaining stat scope, enchants and
consumes, then admit complete equipped workloads before numerical optimization.
No source-only receipt approves game access, mechanics, BiS or publication.

## Elements proc component verified — October 25

The current Elements set has flat bonuses at two, three and six pieces. Actual
equipped controls preserve its eight resistances, 18 spell-damage/healing power
and eight MP5 without duplicate or obsolete bonuses. The previously missing
five-piece power proc now has an owned healer handler alongside that unchanged
shared dispatch. Its fourth-piece disarm is inactive in the declared assignment:
post-mitigation damage is scheduled without an incoming melee hit or attacker.

The captured five-piece root 450626 triggers 27775: 65 spell-damage/healing power
for ten seconds. Its client proc record says 100%; that record is not asserted to
prove the server's rate. Both `client-proc-record-reference` and the explicitly
hypothetical `four-percent-sensitivity-reference` remain available. Four routing
references compare completed class healing casts, completed owned spell casts,
direct class healing events and all class healing events. The latter includes
Riptide ticks. Owned resource casts follow their actual completion flags; Nature's
Swiftness has no completion dispatch. The root reuses Paladin family 10 with a
zero family mask, which is retained rather than changed to a Shaman family.

A fresh five-piece owner must configure the policy before casts are enabled.
Actual healing receives the power once. Seeded rate checks, Chain recipients,
Riptide ticks, resource casts, nonstacking refresh, expiry, death and iteration
reset pass. All 92 native controls match Chromium/WASM across 232 groups. All 259
parent controls/468 groups remain unchanged; 11 compiled healing faults and two
DPS guard faults are caught. Ten actual Elemental/Enhancement cases, including
Elements gear, match before/after. Full simulator build, 178 Paladin controls and
one Priest regression pass. Source/renderer contracts, lint and formatting pass.

Immutable final receipt:
`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-elements-v1/461783ac627058a0cf0998f315ffbe869da87270e0311a6c2db9b2cbea108d94/build-CJZ8Dt/final-review-fpiHar/report.json`,
SHA-256 `13852b9d28449200d2749841a433731a6281d282c40746d3f8c015bcac6d3a35`.

The 692-file workspace preserves 688 parent files and changes two controlled
integrations: actor state and the owned set-bonus provider. It adds the owned
implementation and test files. Catalog, acquisition and dependencies are exact.
Public `shaman-elements.go/.mjs/_test.go/.test.mjs` and successful private helpers
are frozen. The first test attempt retained a copied expectation that excluded
the explicitly selected owned resource-cast mode; its actual one attempt was
corrected. A second receipt attempt stopped on an incorrect 88-control count;
all 92 native tests had passed. Both attempts remain retained and unqualified.

## Spiritcaller set reachability verified

The four Spiritcaller crafts in the actual pre-raid pool are 276538–276541. Their
current ItemSparse rows assign set 2111 and limit category 708. The independently
captured `ItemLimitCategory` record names “Artisan's Tier,” quantity 1, flags 1.
All four source records preserve that restriction.

Across all 30 faction/profession profiles, all 120 single-item substitutions pass
the actual complete-gear validator. All 180 distinct pairs fail. Removing only
their shared category in an explicitly synthetic constraint probe makes each
pair pass, isolating the reason. Thus these items can contribute at most one
piece: thresholds 2/3/4/5 are unreachable in this declared equipment domain. All
four items remain candidates. This proof neither admits forced simulation-only
tier bonuses nor claims general tier mechanics or item-stat completeness.

Immutable receipt:
`artifacts/forever-simulator/optimization/shaman-set-ownership-v1/prepared-gkDsDU/report.json`,
SHA-256 `1932789dc239edad46025c7382bd23a06bc175a7ce64332f46f03e2188de8fe0`.
Three actual-source/constraint contracts pass. Public
`shaman-set-ownership.mjs/.test.mjs`, the captured fixture and successful private
capture/preparation helpers are frozen.

Full shared item/set/stat/consume integration still precedes complete equipped
workloads, numerical optimization and website delivery. Neither component starts
the Shaman numerical window or selects a website preset.

## Four cast-resource sets verified — October 25

Magister181 and Devout182 restore200 mana from their five-piece source; Dreadmist183
self-heals270–330 from a300-base/20%-variance source with zero healing-power
coefficient; Wildheart185 uses the captured200-mana child. Fixed-source5% and
explicit Wildheart2%/5% sensitivity references are retained. Four cast/event routing
references stay explicit; client metadata does not establish server scripting.

The owned healer replaces inherited Sudden Insight only for these controlled sets.
Shared production item-set registration is required in the regression fixture.
Dreadmist's living-caster checks require actual procs and positive totals before
comparing0/1000 extra healing power. Critical self-overheal can return Water Shield
mana with all-direct/all-critical routing, respecting the existing ICD; class-only
routing excludes it. Alive/reset, policy ownership, threshold, cap and event-route
controls remain mandatory.

Qualification passes105 actual native/Chromium tests across315 groups, preserves
271 parent controls/512 groups, detects13 healing plus3 DPS faults, and preserves
14 actual Elemental/Enhancement cases including equipped Magister/Devout sets.
The695 compiler-file review preserves690 inputs, with two integrations and three
additions. Fullsim build,178 Paladin controls and one Priest control pass.

Final receipt: `artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-cast-resource-sets-v3/6e9e9d83dd4062dc0006f35704a4853f29236a46802798a983aa18a86d2a5049/build-acd2ty/final-review-lWlJ2g/report.json`. Byte SHA-256: `1afb356c00f6bafbbad96e282e6d702357bc82b283d95540a5f015a4e157f325`.
The earlier V1 omitted shared registry coverage; V2's fixed damage killed the test
caster and let a zero-power assertion pass vacuously. Both remain unqualified.
V3 uses the corrected positive fixture; these successful sources are frozen.

This admits four components only. Remaining shared effects,20 unmapped modifier
scopes, enchants/consumes and complete equipped-workload admission precede Shaman
numerical feedback and delivery. No numerical class clock or publication starts.

## Complete set reachability proof — October 25

The actual unpruned2,017-item domain now has exact set-count bounds across all33
represented sets and30 faction/profession profiles. Each of990 cases has an upper
bound from a relaxed member-only ownership search and a complete legal equipped
loadout attaining that bound. A separate exhaustive Cartesian enumerator checks
66,825 leaf assignments without reusing search pruning. All3,120 threshold/profile
rows are checked:2,700reachable and420unreachable. No item is removed.

Only five threshold rows are unreachable in every profile: Spider's Kiss65 at two
pieces and Spiritcaller2111 at two/three/four/five. Both Spider weapons occupy the
main-hand slot in the admitted healer domain; this does not cover dual-wield
healing builds. Spiritcaller's shared one-item category remains enforced. The
Postmaster's unique ring permits five pieces despite six eligible slot appearances.
All faction sets remain available in their eligible profiles; ordinary eight-piece
dungeon sets remain reachable. Counterfactual uniqueness/category removals change
the maxima, demonstrating that these restrictions affect the result.

The reviewer rejects omitted pool members, duplicate/missing profiles, changed
current membership and unreviewed set activation skill/flag/spec/trait conditions.
Five regression contracts, lint, formatting, syntax anddiffcheck pass. Actual
receipt: `artifacts/forever-simulator/optimization/shaman-all-set-reachability-v1/prepared-EjPtbZ/report.json`; byte SHA-256 `3143fb3dc6da2da77ba09ef80547ab871e64e9c9bf523a3562d953a6c5231f76`.

Public implementation: `infra/simulator/shaman-set-reachability.mjs`; source and
witness tests: `infra/simulator/shaman-set-reachability.test.mjs`. Successful sources
are frozen. This is a reachability proof, not admission of the reachable effects,
item stats, server availability, forced tier flags, numerical BiS or publication.
Remaining work includes Shadowcraft's captured15health/5sec with explicit tick
references, other shared effects,20 modifier scopes, enchants/consumes and the
complete equipped workload before numerical feedback.

## Shadowcraft health regeneration verified — October 25

The reachable six-piece Shadowcraft184bonus21347now has an owned handler alongside
its unchanged current flat bonuses. Captured aura161gives15health per five seconds,
with zero power coefficient and no source period. Each request therefore declares
an explicit two-second/six-health or five-second/fifteen-health timing reference;
its first tick occurs after that period. This does not claim the server's cadence.

Regeneration uses health resource accounting. It cannot crit,scale with healing
power,dispatch direct/periodic healing callbacks or return Water Shield mana.
Attempted and useful restoration remain distinct at the health cap. Dead owners
cannot regenerate or revive. Reset invalidates old callbacks and schedules exactly
one new stream under the retained policy. Fresh positioned six-piece ownership is
required; wrong/late/aliased/repeated policies and unconfigured casts are rejected.

114actual native/Chromium controls across336groups pass. All284parent controls and
595groups remain unchanged. Twelve healing faults and three DPSguard faults are
caught;16actual Elemental/Enhancement cases remain identical,including Shadowcraft.
The697-file derived workspace preserves693inputs,changes only actor state and the
Elements provider method name,and adds implementation/test files. The unchanged
Elements body is composed by the new provider. Catalog,acquisition,dependencies
and shared global handlers remain exact. Fullsim build,178Paladin and1Priest pass.

Final receipt:`artifacts/forever-simulator/optimization/healer-model-admission-v1/shaman-health-regeneration-v2/76c721a69bc92edbe6b2e821a566d83b44f3656ff217f802ae0de6641bc761fb/build-ZQiqmC/final-review-frWlbu/report.json`;byte SHA-256`ec30299768b6a24ac0d3893b10a6a464911e35f62ec27a6aa700f04eebebf1db`.
Current native fixture is`infra/simulator/shaman-health-regeneration-v2_test.go`.
The originalV1fixture/build remains unqualified because its cadence expectation
read runtime state. The first mutation helper also used SpellDamage instead of
HealingPower in one injected fault; the successor uses the actual accessor. No
production gameplay requirement was weakened. Successful sources/helpers frozen.

This admits the Shadowcraft component only. Full workload equipment/consume
admission,remaining effects/20modifier scopes,enchants/consumes and numerical
optimization/delivery remain incomplete. No Shaman numerical clock has started.

## Current passive set dispatch checked — October 25

Sixty-five reachable flat thresholds across30of the33represented sets now match
captured current client values through the actual shared production registry.
Actual member records from reviewed legal witnesses are checked below the
threshold,at the threshold and at the witness maximum. All195native checks match
an actual Chromium/WASM run. Legacy SpellPower is normalized to its damage/healing
channels;expected amounts come independently from captured effects/rating data.

Checks cover healing/damage power,crit/hit,MP5,stamina,intellect,resistances,AP/RAP
and Green Dragon's15%casting spirit regeneration. Compiled variants halving
Ironfeather healing or Green Dragon regeneration fail the intended cases. Only
test overlays were used;all697parent compiler inputs remain unchanged. The33-set/
2017-item domain is retained. This does not approve nonflat behavior,actual
equipped-healer integration,acquisition,consumes or full class optimization.
Forty-two nonflat source-effect rows remain explicit;some belong to existing
qualified components or unreachable thresholds and still need workload binding.

Native receipt:`artifacts/forever-simulator/optimization/shaman-passive-set-audit-v1/audit-KXzUBR/report.json`,
SHA`2e315752c2a40dbf7ac7edf78a56528d112b8c68c67fcd216c3ea329b2505072`.
Runtime:`artifacts/forever-simulator/optimization/shaman-passive-set-audit-v1/audit-KXzUBR/runtime-review-Qx9Dy6/report.json`,
SHA`9b5aca063535f22637a480182ec0afbc070851f9caa10762c943d3e1e04d075d`.
Successful reviewers/controls frozen. No Shaman numerical clock or deployment.

## Current item modifiers and flat health regeneration — October 26

All twenty previously unmapped modifier records across nineteen items now have
an explicit scope in the stationary post-mitigation healing assignment:

| Kind | Records | Treatment |
| --- | --- | --- |
| Health regeneration | 8 | Owned, item-attributed health resource regeneration |
| Profession skill | 3 | Retained outside combat healing calculations |
| Item weapon skill | 1 | Bonus ignored under the owner's rule; item retained |
| Opponent-conditional offensive power | 5 | Retained outside the no-offensive-action assignment |
| Physical damage | 2 | Retained for offensive catalog review |
| Expertise | 1 | Retained outside the no-autoattack assignment |

The captured current-client `GlobalStrings` rows explicitly name the health
stat “Health Per 5 Sec.” and say “Restores %s health per 5 sec.” This establishes
the units independently of historical item text. The enum metadata comes from
the separately pinned WoWDBDefs revision `907320...`; it is explicitly not
relabeled as the raw table-definition revision `996e53...`.

The eight sources are Death Speaker Scepter 2816 (12 HP5), Commander's Crest
6320 (4), Savage Trodders 6459 (6), Slime-encrusted Pads 6461 (10), Leech Pants
6910 (5), Bloodmage Mantle 7684 (9), Subterranean Cape 14149 (5) and Resurgence
Rod 17743 (11). Both two-second and five-second tick references retain those
per-five averages. The first tick follows the declared period; server cadence
remains unverified.

The owned Restoration component sums equipped sources deterministically and
uses item-specific health resource metrics. Attempted and useful restoration
stay distinct at the health cap. It adds to the separately admitted Shadowcraft
regeneration, respects death/reset, rejects late or repeated policy changes and
requires a fresh positioned equipped owner. The health gain does not scale with
healing power, crit, dispatch healing callbacks or restore Water Shield mana.
Original catalog statistics and all 2,017 candidates remain available.

The scope review also finds a concrete offensive discrepancy: current Studded
Timbermaw Brawlers 227809 has three physical damage, while the catalog field is
zero. Molten Heart of the Mountain's two physical damage is already present.
The Brawlers discrepancy remains open for an offensive model correction; this
healing component does not declare that catalog fully verified. Missing current
base records and absent channels retain their prior evidence status.

Verification passes 124 actual native/Chromium controls across 364 measurement
groups. All 114 parent controls and 336 parent groups remain equal under complete
metric comparison. Nine compiled healing faults fail their targeted controls;
sixteen actual Elemental/Enhancement pairs remain identical, with three DPS guard
faults caught. An additional native test isolates the late-time guard while all
other freshness conditions remain satisfied. Five public source/renderer
contracts, scoped ESLint, Go formatting, the full simulator build, 178 inherited
Paladin tests and one Priest regression pass.

Public sources:

- `infra/simulator/shaman-item-modifier-scope.mjs` and its Node tests.
- `infra/simulator/shaman-flat-item-regeneration.go` and its native fixture.
- `infra/simulator/shaman-flat-item-regeneration-guards_test.go` for the isolated
  late-policy guard.
- `infra/simulator/fixtures/shaman-item-modifier-scope-source.v1.json.gz`, SHA-256
  `2265b62242fa042e1dcca96e85af9753a51cd798afa9b7b744d7906c9bab02b1`.

Run the portable source contracts with:

```sh
node --test infra/simulator/shaman-item-modifier-scope.test.mjs
```

The final immutable review is:

```text
artifacts/forever-simulator/optimization/healer-model-admission-v1/
  shaman-flat-item-regeneration-v1/
  6f0dcf30179c92c946716997e8560a0b2903fc830cdf569346cead92f04f98d3/
  build-WuSoPz/final-review-uyyePA/report.json
```

Its SHA-256 is
`a99d7f5ba5853291c0e937012e89f051709115673817728ca658530b6f4d5cf4`.
The 699-input derived workspace preserves 696 parent inputs, adds implementation
and test files, and changes only the two owned actor hooks. The independent
late-guard fixture is tracked separately in the mutation receipt. Successful
sources and private preparer/reviewers are frozen with their receipts.

This admits the flat-regeneration component and closes the twenty modifier
scope classifications. Remaining shared effects, enchants/consumes and complete
equipped-workload admission still precede bounded optimization, independent
confirmation and website presets. No Shaman numerical class clock, selected
release, Git/deploy or production mutation starts with this component.

## Shared healing items and reactive sets — October 26, 03:07 UTC

The shared healing-item derivative is independently reviewed. It binds the
already captured Heart, mana-item and Serenity payloads back to Shaman's complete
current source graph; matching item IDs alone are insufficient.

- Dormant Heart applies +40 healing power and +13 spell damage for 15 seconds,
  restricted to the nine admitted owned Healing Wave ranks. Chance and event
  routing remain explicit references; the client literal is not a verified
  server proc rate.
- Mindtap returns ten 125-mana ticks, with its seven-minute cooldown, -60
  intellect for 120 seconds and reduced-capacity clamp. Expiration restores
  capacity without gifting mana.
- Second Wind returns ten 63-mana ticks under the neutral-area reference, with
  its fifteen-minute cooldown. It shares the captured ten-second category with
  Mindtap. Actual production item registration is included in native controls.
- Serenity Field retains the production +72 spirit effect for 15 seconds and
  its 90-second cooldown, with its separate fifteen-second shared category.

Epoch-bound callbacks cannot restore mana from a previous reset or to a dead
owner. All 141 native/Chromium controls and 387 measurement groups pass; all 124
parent controls and 364 groups remain equal. Thirteen compiled item faults and
three DPS guard faults are detected; sixteen actual Elemental/Enhancement pairs
are unchanged. Four public Node contracts, scoped lint/format, full simulator
build, 178 inherited Paladin controls and one Priest regression pass. These are
component controls, not Paladin preset validation or Shaman BiS calculations.

The item model is under `healer-model-admission-v1/shaman-healing-items-v3/`
`2280c2f45730598815bb643381d24578b321c170c0c66493398eddd644d00ff9/build-gsvK4D`
within `artifacts/forever-simulator/optimization`. Its final receipt is
`final-review-F9t0Us/report.json`, SHA-256
`3048a5917d26008add4fc51d1e54e7708d2883a14c3e06ebcb26c92a99a6348c`.
The 703-input workspace preserves 698 parent files, changes only the actor's two
owned hooks, and adds four files. Earlier missing-registry and lifetime-ledger
test failures remain retained and unqualified.

The next independently reviewed derivative adds three reachable reactive sets:

| Set | Threshold | Captured effect |
| --- | --- | --- |
| Embrace of the Viper | 4 | At or below 25% health, five one-second ticks of 20 healing and 20 mana; five-minute internal cooldown |
| Chain of the Scarlet Crusade | 6 | At or below 20% health, 480 absorb for ten seconds; four-minute internal cooldown |
| Vestments of the Devout | 4 | Incoming direct-hit reference: 2% chance for 488 absorb for thirty seconds; one-minute internal cooldown |

The existing health receiver deducts damage once before evaluating owned effects.
A new shield protects subsequent damage; it cannot retroactively absorb its
triggering hit. Fully absorbed direct hits can trigger Devout, while its periodic
damage exclusion remains explicit. Low-health timing has before-hit/after-hit
references, and eligibility of self-inflicted damage has true/false references.
These source-bound models do not establish the server's timing or self-damage
rules. Equipped owners must configure a fresh policy before eligible damage.
Policies are copied, cannot change after events and survive iteration resets.

Viper has no healing-power coefficient and never crits; its mana resource ledger
is separate from ordinary spirit regeneration. The reactive additions preserve
the original 141 controls and all 387 complete measurement groups. The derived
model passes 151 native/Chromium controls and 422 groups. Two additional native
controls independently verify death with a mana deficit and exact Devout expiry/
cooldown boundaries. Eleven compiled healing faults and three DPS guard faults
are caught; the sixteen actual DPS pairs remain unchanged. Three public source/
renderer tests, scoped lint/format, full simulator build and the inherited class
regressions pass.

The death fault initially survived because the fixture's mana bar was full: zero
useful gain did not prove that no return was attempted. The separate deficit
control checks both attempted and useful mana; the same compiled fault now fails.
Failed test fixtures also exposed background spirit regeneration and a Viper
owner healed above the trigger threshold. Those attempts and their workspaces
remain retained. The final controls isolate the item ledger and keep health
below the threshold when testing cooldown recovery.

Public implementation: `shaman-reactive-sets.mjs`, `shaman-reactive-sets.go`,
`shaman-reactive-sets_test.go`, `shaman-reactive-sets-guards_test.go` and the Node
tests under `infra/simulator`. Run the portable contracts with:

```sh
node --test infra/simulator/shaman-healing-items.test.mjs infra/simulator/shaman-reactive-sets.test.mjs
```

The reactive model is under `healer-model-admission-v1/shaman-reactive-sets-v3/`
`e821dddb5bd22a88ecc2a054cdbe2ef9d6822e9c1889e1d8bd51ddb16b454bbb/build-mUE6eg`.
Its final receipt is `final-review-REAeNw/report.json`, SHA-256
`8e62d331435e20006f787fc8149a960a12d6aa5643bc1455b35667d3daa1837e`.
The 705-input workspace preserves 701 parent files, changes only the owned actor
hooks and ordered health receiver, and adds implementation/test files. The two
extra native guards are separately bound by mutation/final receipts; they are
not relabeled as part of the 151-control WASM binary. Successful sources and
private preparers/reviewers are frozen with their receipts.

Remaining work: classify/bind the other shared item and nonflat set effects;
admit enchants and consumes; then admit complete equipped workloads before the
bounded gear/talent/priority search, fresh confirmations and website delivery.
No Shaman numerical class window, selected preset, Git operation or deployment
starts with either component.

## Cast/critical items and complete captured set scope — October 26, 03:31 UTC

Blue Dragon and Weakness Analyzer now have Shaman-specific source binding and
actual native/browser controls through the existing common production handlers.
No second handler was installed and no production compiler input changed.

Blue Dragon's current reference is a 2% completed-cast opportunity for +150
spirit over 15 seconds. It refreshes one aura, expires and resets cleanly, and
does not grant the historical full casting-regeneration override. Actual Shaman
casts and an independent fixed-seed oracle agree. Healing recipients and periodic
ticks without a completed cast do not generate extra proc opportunities.

Analyzer requires explicit owned use: +5 critical percentage points for at most
20 seconds, a 90-second personal cooldown and category 1141 with a 20-second
shared cooldown. Direct critical Healing Wave, Lesser Healing Wave, Chain Heal
and Riptide effects consume it; noncritical heals and periodic critical healing
do not. Both activation orders with Serenity respect their own 15/20-second
shared durations. Early consumption does not reset the personal cooldown.
Helpful healing also leaves harmful-cast-only Draconic Infusion inactive.

The model passes 161 native/Chromium controls across 436 measurement groups.
All 151 parent controls and 422 groups stay equal. The two previously separate
reactive boundary guards are now included in this binary. Eight compiled faults
are caught. All 705 parent compiler inputs are byte-identical; two test files
were added, for 707 total. The earlier sixteen DPS comparisons are inherited by
verified production-byte preservation, not relabeled as new executions. Full
simulator build, 178 inherited Paladin controls and one Priest regression pass.
Two portable source contracts and scoped lint/format pass.

The immutable model is under `healer-model-admission-v1/shaman-cast-crit-items-v2/`
`79531eee8c1e3372d1c6c62b87fb8894790a84580859a13eb167b9aba9d58deb/build-gbmqO3`
within `artifacts/forever-simulator/optimization`. Final receipt:
`final-review-EV5P8M/report.json`, SHA-256
`b91397050771dcc1cdf3a9898a57417ae93adb7bb5ce18c60b20cfc3d188cc16`.
The failed first fixture remains retained: when Analyzer activated first, its
aura had already expired at the shared unlock boundary. The corrected fixture
checks each item's actual activation timeline and never advances backward.

The separate source classifier now accounts for all 104 bonus records in the
captured 33-set, 2,017-candidate domain:

| Classification | Source records | Evidence or scope |
| --- | --- | --- |
| Flat stats / casting regeneration | 66 | Existing 65 threshold cases and 195 native/browser activation controls |
| Owned Shaman components | 9 | Four cast-resource thresholds, Elements, Shadowcraft recovery and three reactive thresholds |
| Inactive in this assignment | 24 | Source-bound outgoing-attack, harmful-spell, movement, control, reflection or ignored weapon-skill requirements |
| Unreachable in this candidate domain | 5 | Spider's Kiss two-piece and Spiritcaller two/three/four/five-piece, from the thirty-profile full-loadout proofs |

There are 102 distinct set/piece threshold groups: Cadaverous three-piece has
both a flat and a control-duration record, while Wildheart three-piece has two
flat records. The classifier retains both records rather than losing one under
a set/piece-only map. It checks current proc masks and child recipients; changes
to helpful-cast eligibility, a friendly control recipient, movement payloads or
the workload restrictions fail its contracts.

This scope is explicitly stationary player healing with no hostile rotation,
autos, control events or external damage to the caster. Magical self-damage is
still handled under its explicit reference. It is not a global claim that these
24 effects cannot matter in other encounters. Every candidate stays available.
The reviewed shared stat/dispatch/runtime/database inputs are unchanged: all 195
such files match the earlier flat-set model. The certificate binds the actual
195-control runtime review and all thirty legal-profile proofs, including the
independent 66,825-leaf enumeration. It executes no new native or browser jobs.

Scope fixture: `infra/simulator/fixtures/shaman-healing-set-scope-source.v1.json.gz`,
SHA-256 `70ee56a8e0a7ac6addcf6c6e19878bf6dd376ba012a86ad56793971754bc7bca`.
Its referenced enum and target definitions are captured interpretation sources;
they do not establish live-server behavior. The immutable scope report is
`artifacts/forever-simulator/optimization/shaman-healing-set-scope-v1/review-1SaB0B/report.json`,
SHA-256 `fbf5e4a8bbd4d51b8fff181d8380ecb8a94ccc4b7e25cbff355c2cf69596ac19`.
The first private capture incorrectly assumed more than 300 shared files; its
successor counts the full actual selection and verifies each of the 195 files.

Run the new portable contracts with:

```sh
node --test infra/simulator/shaman-cast-crit-items.test.mjs infra/simulator/shaman-healing-set-scope.test.mjs
```

The 33-set scope does not admit the separately modeled Five Thunders 519 reward
items. Their eight catalog records and mechanics remain preserved, but the four
reward-delivery/access milestones still need integration into conditional gear
profiles before claiming full pre-raid search coverage. The shared-item utility
review also remains open. Current priorities include the two Recombobulators,
Circle of Flame, Mark of the Dragon Lord, the two healing clothing uses, Baron's
Scepter, Headmaster's Charge and Hammer of Grace; legacy neutral/area item-stat
assumptions also need binding. Enchants, consumes, complete equipped workloads,
bounded feedback, independent confirmations and website delivery remain. Neither
source classification nor this component starts Shaman's numerical clock or
qualifies a finished BiS list.
