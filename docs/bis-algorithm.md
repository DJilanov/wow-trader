# Build-versioned BiS calculation algorithm

## Goal

Generate explainable best-in-slot loadouts from the catalog extracted for an exact game build. Item
IDs and stats come from that build; class mechanics, encounter assumptions, and effect valuations
come from separately versioned models. TBC Anniversary is the validation fixture. Forever uses the
same optimizer with a new build snapshot and new or revalidated mechanics profiles.

The system does not assign one permanent score to an item. An item's value depends on the complete
loadout, character, encounter, and selected objective.

## Required input

Every calculation is identified by:

- product, client build, hotfix identity, and content phase;
- class, specialization, role, level, race, talents, faction, professions, and proficiencies;
- encounter duration, target count, target level, armor, creature type, movement, and incoming attack
  profile where applicable;
- raid, party, and individual buffs; target debuffs; external mana support; consumables;
- objective such as damage, threat, mitigation, effective health, healing throughput, or sustain;
- allowed acquisition states, including whether unverified client-only items may appear as
  provisional candidates.

The item adapter supplies slot, stats, damage and speed, restrictions, unique limits, sockets,
selected gem/enchant variant, effects, set membership, and availability evidence. A gemmed and
enchanted form is a variant of the same base item, not a new item ID.

## Rules that are shared by every class

1. Filter by exact build and selected phase.
2. Reject items that fail level, class, race, faction, profession, specialization, proficiency, or
   availability rules.
3. Assign only legal inventory slots. Rings and trinkets use interchangeable paired slots.
4. Enforce unique-item and shared unique-category limits.
5. Enforce weapon-hand rules. A two-handed weapon blocks the off hand; main-hand-only and
   off-hand-only restrictions remain distinct.
6. Enforce gem colors, socket bonuses, meta activation, enchant applicability, and profession-only
   enhancements when item variants are produced.
7. Activate every set threshold from the selected loadout. Never add a set bonus to each item as a
   standalone score.
8. Evaluate equipped and on-use effects through an explicit spell-effect rule. An unknown effect is
   unresolved, never zero-valued by assumption.
9. Apply caps to total character stats after talents, race, buffs, gems, enchants, item effects, and
   set effects. Marginal value above a cap may be zero or reduced, depending on the spec model.
10. Evaluate and rank complete legal loadouts. A per-slot ranking is only an explanation or candidate
    browser; it is not the BiS calculation.

## Calculation pipeline

```text
exact build catalog
  -> equippable item normalization
  -> gem/enchant variant frontier
  -> character/phase/acquisition filtering
  -> candidates grouped by legal slot
  -> legal whole-loadout search
  -> activate item and set effects
  -> spec + encounter evaluation
  -> reject hard-constraint failures
  -> rank each objective and retain near-optimal alternatives
  -> confidence/publication gate
  -> explanation and validation report
```

### Candidate filtering

Filtering is deterministic and records exclusion counts by reason. `unavailable` items never enter a
search. `unknown` items enter only when the caller explicitly requests provisional client-visible
candidates. An item outside the selected phase is excluded even if its row is present in the client.

Safe dominance pruning may remove variant B only when variant A has identical slots, restrictions,
unique rules, set identity, and modeled effects, and A is no worse in every stat the active model can
use. Anything with a distinct proc, set, socket configuration, cap contribution, or acquisition rule
must survive pruning.

### Stat curves and hard constraints

The basic evaluator uses a piecewise curve for each stat. For total stat value `x`, boundaries
`b1...bn`, and marginal weights `w1...wn`, its contribution is the integral of the applicable
piecewise weights:

```text
score(x) = w1 * min(x, b1)
         + w2 * max(0, min(x, b2) - b1)
         + ...
```

This represents high value below hit/expertise/defense thresholds and reduced or zero value above
them. A mandatory threshold is also a hard constraint; scoring it highly is not sufficient. For
example, a tank profile can reject every loadout that is not crit immune before comparing threat or
mitigation.

Piecewise weights are a transparent approximation. A validated combat formula or simulator plug-in
should replace them when rotation, resource generation, proc timing, or stat interactions are
materially non-linear.

### Effects and sets

Each equipped item-effect spell and each active set-effect spell has one of three states:

- modeled for the exact build/spec/encounter;
- explicitly irrelevant to the selected objective, with evidence;
- unresolved.

Simple effects can add effective stats or a measured score under conditions such as creature type,
fight length, or target count. Stateful effects—shared cooldowns, stacking procs, rotation changes,
resource feedback, snapshotting, or variable uptime—belong in a custom evaluator. Warglaives are the
golden interaction test: the pair bonus activates only with both items, its haste uptime must be
modeled, and its demon bonus applies only to demon targets.

### Whole-loadout search

The implemented search walks each equipment slot, expands only legal assignments, canonicalizes
interchangeable ring/trinket permutations, and evaluates partial states deterministically. It retains
all states while the configured beam permits it. If no state is dropped, the result is exhaustive for
the supplied candidate variants. If the beam is exceeded, it retains the strongest partial states
and labels the result `best found`, not a proven optimum.

Production expansion should run several independent objectives rather than hide trade-offs inside
one arbitrary blended number. Tank output should expose a threat/mitigation or Pareto frontier;
healer output should expose throughput/sustain profiles. Near-optimal alternatives are valuable when
they avoid a contested drop, profession, faction, or expensive enhancement.

## Mechanics profiles by class family

These are required rule domains, not universal fixed weights.

| Family  | Required mechanics                                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warrior | Rage feedback, normalized ability damage, weapon speed/type and racial skill, white/special hit, expertise, armor reduction, stance/rotation, tier and Warglaive interactions; Protection additionally needs crit immunity plus separate TPS, DTPS, and EHP objectives. |
| Paladin | Spell/melee hybrid scaling, seals and judgements, weapon speed, race, hit/expertise, mana and spell mix; Protection needs crit immunity and Holy Shield avoidance/uncrushability; Holy needs throughput and sustainability profiles.                                    |
| Druid   | Form-specific stat transformations and armor, powershifting, weapon-as-stat-stick behavior, target armor and hit profiles; Restoration needs HoT mix, haste/GCD breakpoints, and mana; Balance needs spell rotation and mana.                                           |
| Hunter  | Ranged weapon speed and damage, hit, ammo/quiver, shot timing, haste, pet family/scaling and uptime; Survival must include raid value from Agility-dependent support where that objective is selected.                                                                  |
| Shaman  | Melee/spell hit, dual-wield weapon speeds, imbues, shocks, totems and party contribution; Restoration needs Chain Heal target assumptions, haste, mana, and relic swapping.                                                                                             |
| Rogue   | Main/off-hand legality and speeds, white/special hit, expertise, poison application, energy/haste, target armor, race, talents, and Warglaive interactions.                                                                                                             |
| Priest  | Healing spell mix, overheal, regen while casting, encounter length and set bonuses for healer profiles; Shadow needs talent-adjusted spell hit, DoT/channel timing, haste, mana, and limited crit value.                                                                |
| Mage    | School and rotation, spell hit, haste, crit, mana pool/regeneration, fight length, target count, set bonuses, and external mana support.                                                                                                                                |
| Warlock | Talent-adjusted hit by target level, shadow/fire rotation, DoT uptime, pet choice/uptime, haste, crit, mana conversion, set bonuses, and conditional effects.                                                                                                           |

Every specialization receives separate profile versions when its talents, rotation, caps, or effect
rules differ. Profiles are never inferred merely from the class name.

## Result contract and publication gate

Every result includes:

- selected item variant for every slot;
- total stats and score/metric breakdown;
- active set and item effects;
- failed or satisfied hard constraints;
- cap waste and the reason an alternative lost;
- model ID/version, build, phase, character, encounter, and objective;
- search mode, evaluated-state counts, exclusions, and unresolved effects;
- `definitive` or `candidate` classification.

`definitive` requires all of the following:

1. the mechanics model is validated for the exact product/build and specialization;
2. the catalog adapter declares the item, enhancement, phase, and acquisition candidate frontier
   complete;
3. the search is exhaustive for that candidate frontier;
4. every combat-relevant effect anywhere in the legal frontier is modeled or explicitly proven
   irrelevant, because an unknown proc on an unselected item could change the winner;
5. every selected item has verified availability under the selected phase/source policy;
6. the result passes cap, set, weapon, unique, and enhancement regression fixtures.

Otherwise the UI must say `candidate` or `best found` and list the reasons. A higher item level,
GearScore, or linear EP score can never override this gate.

## TBC validation and Forever activation

TBC supplies known regression phenomena: Protection tank cap/loadout trade-offs, Retribution hit and
expertise, Feral hard/soft-hit and target-armor variants, healer haste-versus-sustain choices, and the
conditional Warglaive pair. The 27 pages in `docs/list.txt` are comparison evidence, not runtime data
or silently imported truth.

The maintained `wowsims/tbc-new` project is an MIT-licensed TBC simulation reference and requests a
visible link when reused. It can be pinned as an independent validation oracle, but our catalog and
build identity remain authoritative inputs. The older `wowsims/tbc` repository explicitly identifies
itself as unmaintained and must not be selected by accident.

When Forever becomes available:

1. run the existing extraction/audit/import pipeline for its exact build and hotfix;
2. map its inventory types, restrictions, stats, sockets, sets, and spell effects into `GearItem`
   variants;
3. diff class mechanics, rating conversions, talents, racials, and known item/set effects against the
   validated TBC profiles;
4. clone only unchanged rules to the Forever build; version and retest every changed rule;
5. keep new or encrypted effects unresolved until verified;
6. calculate provisional unrestricted candidates immediately, then promote phase-specific lists only
   as acquisition/phase evidence and validation gates become complete.

This means newly discovered Forever items can flow through the optimizer immediately without
hard-coded item lists. Only genuinely new mechanics and effect semantics require new rules.

## Implemented foundation

`packages/bis` now contains the build/spec contract, eligibility and phase filtering, legal slot and
unique-category enforcement, two-hand blocking, set activation, conditional effect rules, piecewise
stat curves, hard minimums, deterministic exhaustive/beam search, result explanations, and the
publication-confidence gate. The gate covers unresolved effects across the legal candidate frontier,
not only effects on the selected loadout. It intentionally contains no fabricated TBC or Forever
weights.

Its catalog adapter accepts normalized rows for items, stats, resistances, weapon damage, sockets,
item/set effects, class/race masks, subclass proficiencies, professions, unique categories, and
availability. It emits base `GearItem` variants plus set thresholds and adapter diagnostics. Unknown
numeric stat/resistance families survive under stable keys, and client-only items remain unknown.
The live TBC loader declares coverage `partial` until acquisition phase and complete gem/enchant
variant generation are connected; therefore adapter output alone cannot pass the definitive gate.
