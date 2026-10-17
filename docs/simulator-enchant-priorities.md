# Stat priorities for enchant suggestions

Research update, 2026-10-16. Covers tank and DPS profiles. These are qualitative shortlist rules,
not fixed EP numbers, a proven level-60 Forever BiS list, or authorization to overwrite saved gear.
The existing threat-oriented Warrior/Bear starters and defensive Paladin starter remain unchanged.
The user's subsequent implementation request added fixed reviewed default enchants to the supplied
gear lists, not automatic recommendations for saved characters; see `simulator-default-enchants.md`.

## Finding

The familiar Classic stat families remain useful. A tank needs enough effective health and
mitigation to survive, plus reliable threat; DPS needs damage, accuracy and enough resources to
execute its rotation. However, those goals are not one universal stat order, even in Vanilla.

[Classic Warrior guidance](https://www.icy-veins.com/wow-classic/warrior-tank-pve-stat-priority)
explicitly separates stamina/armor-based survival from weapon/accuracy-based threat.
[Classic Bear guidance](https://www.icy-veins.com/wow-classic/feral-druid-tank-pve-stat-priority)
likewise treats armor/health and threat as different objectives. Strength is not a substitute for
a Warrior's stamina or armor; hit improves threat reliability, not direct damage reduction.

Do not assume Forever's numerical priorities equal Vanilla's. The
[current Forever Feral guide](https://www.icy-veins.com/wow-forever/feral-druid-melee-dps-and-tank-pve-guide/)
explicitly documents weapon-DPS scaling in Cat and Bear, and values hit/expertise. Vanilla's
zero-value weapon-DPS assumption is therefore wrong here. The
[Forever Warrior guide](https://www.icy-veins.com/wow-forever/protection-warrior-tank-pve-guide/)
also discusses block/avoidance-driven Rage talents; the
[Forever Paladin guide](https://www.icy-veins.com/wow-forever/protection-paladin-tank-pve-guide/)
emphasizes spell power for threat while stamina/armor/defense serve survival. These guides currently
describe a level-30 beta context, not a solved level-60 raid environment.

## Per-profile starting rules

Arrows indicate broad goals, not that one point of an earlier stat always beats any quantity of
another. Sources are guide authors' own qualitative recommendations; actual Forever ranking must
come from the current character, supported mechanics and selected encounter.

| Profile                      | Useful shortlist priorities                                                                  | Important qualifier                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Protection Warrior, survival | Stamina and armor; defense/avoidance/block as appropriate                                    | Keep survival separate from threat; strength is mainly offensive with block-value benefits.                 |
| Protection Warrior, threat   | Accuracy to the relevant cap; strength/AP, crit and weapon contribution                      | Hit, expertise and facing/weapon rules matter; do not continue valuing capped accuracy identically.         |
| Bear, survival               | Armor, stamina, agility/dodge; appropriate defense                                           | Never recommend block or parry. Armor cannot mitigate magic.                                                |
| Bear, threat                 | Hit/expertise, strength/AP and crit; weapon contribution                                     | Forever weapon-DPS/form scaling must be retained.                                                           |
| Protection Paladin           | Survival: stamina/armor/defense/shield; threat: spell damage, accuracy, mana sustainability  | Neither Warrior strength-only rules nor caster DPS-only rules are sufficient.                               |
| Warrior DPS                  | Weapon contribution and accuracy; crit, strength/AP and agility                              | Differentiate special attacks, dual-wield white attacks, weapon skill and the actual build.                 |
| Rogue                        | Accuracy; agility/AP/strength and crit                                                       | Crit-focused builds differ; hit can retain white-attack/poison value after a special-attack cap.            |
| Hunter                       | Ranged accuracy, crit, agility and ranged AP                                                 | Strength/melee AP are not equivalent ranged upgrades; scopes must not grant global spell hit.               |
| Feral Cat                    | Accuracy, strength/agility/AP and crit; weapon DPS in Forever                                | Do not copy Vanilla powershifting or weapon rules blindly into the new model.                               |
| Retribution Paladin          | Melee accuracy, strength/AP, agility/crit; spell damage for the chosen rotation              | Spell-heavy variants require different weights; check temporary weapon-imbue interactions.                  |
| Enhancement Shaman           | Weapon contribution/accuracy; strength/AP and crit, then build-relevant spell/resource stats | Hybrid rotations and dual-wield/talent changes can alter the Classic seed order.                            |
| Mage                         | Relevant spell hit, crit and school/general spell damage; intellect                          | Fire/Frost/Arcane need separate talent/rotation-aware comparisons; crit versus damage is not universal.     |
| Warlock                      | School/general spell damage, relevant hit and crit; intellect as appropriate                 | Classic guidance does not simply put hit above every other stat while uncapped.                             |
| Shadow Priest                | Relevant spell accuracy, shadow/general damage; mana sustainability                          | Shadow-specific hit talents may not apply to all spells; ordinary DoTs should not gain invented crit value. |
| Smite Priest                 | Holy/general damage, relevant spell accuracy/crit and intellect                              | This is a Forever-model inference, not a Vanilla DPS-priest guide's verified Smite priority.                |
| Balance Druid                | Relevant spell accuracy, spell crit and nature/arcane/general damage; mana/intellect         | School, talent and mana constraints affect value; do not rank healing power as damage.                      |
| Elemental Shaman             | Relevant spell accuracy, nature/general damage and crit; mana/intellect                      | Distinguish sustainable rotations from a short burst encounter.                                             |

Classic seed references, not claims that their listed caps or item values apply unchanged:

- [Warrior DPS](https://www.icy-veins.com/wow-classic/warrior-dps-pve-stat-priority),
  [Rogue](https://www.icy-veins.com/wow-classic/rogue-dps-pve-stat-priority),
  [Hunter](https://www.icy-veins.com/wow-classic/hunter-dps-pve-stat-priority).
- [Cat](https://www.icy-veins.com/wow-classic/feral-druid-melee-dps-pve-stat-priority),
  [Retribution](https://www.icy-veins.com/wow-classic/retribution-paladin-dps-pve-stat-priority),
  [Enhancement](https://www.icy-veins.com/wow-classic/enhancement-shaman-dps-pve-stat-priority).
- [Mage](https://www.icy-veins.com/wow-classic/mage-dps-pve-stat-priority),
  [Warlock](https://www.icy-veins.com/wow-classic/warlock-dps-pve-stat-priority),
  [Shadow](https://www.icy-veins.com/wow-classic/shadow-priest-dps-pve-stat-priority),
  [Balance](https://www.icy-veins.com/wow-classic/balance-druid-ranged-dps-pve-stat-priority),
  [Elemental](https://www.icy-veins.com/wow-classic/elemental-shaman-dps-pve-stat-priority).

## How to suggest an enchant honestly

1. Filter the reviewed enchant catalog by item, slot, wearer and supported model first. Exclude
   unresolved effects and unverified proc models from automatic recommendations. Client presence
   is not proof of current vendor stock or obtainable recipes.
2. Let tanks choose Survival, Threat or Balanced. Leave the previously requested starter
   accessories alone. Never infer that a large stamina pool proves survival against every boss.
3. Use class/spec priorities to shortlist candidates, not fabricate exact numerical stat weights
   from an ordered guide. Current UI EP sorting remains explicitly a stat-weight estimate.
4. Read actual talents, race, weapon/form, current stats, raid buffs/debuffs, target level/facing,
   rotation and fight length. Obtain hit/expertise headroom from the matching engine rules, not
   a universal imported Classic cap. Never treat an internal percent as one client rating point.
5. Compare full candidate builds against the current enchant and No enchant, changing one slot
   at a time. Keep the same encounter, random seed and enough iterations to resolve a difference.
   Cache by release/model, complete build, slot, candidates and scenario. Changing any invalidates
   the comparison. Multiple suggested slots must be recomputed after applying one.
6. For DPS, report measured DPS delta and uncertainty. For threat tanks, report TPS and survival
   impact together; survival mode needs survival constraints, not maximizing DPS or minimizing
   mean DTPS alone. Small differences should be ties, not a false single winner.
7. Show `Suggested for your build` with its reason, supported effects and confidence. Offer
   alternatives if acquisition or price is unknown. Do not call the cheapest unknown-price
   option a budget choice; service costs and reagent costs are different.
8. Apply only after the user selects the suggestion. Preserve occupied enchants by default in
   any later bulk workflow and provide a before/after preview. Saving/importing must preserve
   exact enhancements without silently replacing them with our preferred choices.

The first tooltip/enchant delivery provides the reviewed catalog, manual selection, existing EP
sorting and model-status gates. A claim of a mathematically best enchant requires the candidate
comparison workflow above; the research alone does not establish that claim.
