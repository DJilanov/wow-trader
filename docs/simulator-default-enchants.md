# Default simulator enchants

Implemented locally on 2026-10-16. Covers the 23 supplied DPS gear lists and five tank/faction
lists across all 15 supported individual profiles. Named builds and raid defaults reuse those
same preset objects. Empty/unsupported healer stubs are not advertised as complete loadouts.
Active local release: `fba685b35451678279ffa37e`, 22 pages, 1,927 real-source items,
3,485 integrity-indexed files. That original release was subsequently deployed through r12;
r13 supersedes it with startup/default/tank-talent fixes. See `../context.md` for the current receipt.

Existing saved characters, custom gear sets, imports, talents, rotations and encounters are not
migrated. Select a gear set in **Build library → Gear Sets** to load the newly enchanted version.
Removing an enchant and saving/reloading preserves the empty choice; there is no runtime autofill.

## Selection policy

These are editorial starting choices informed by `simulator-enchant-priorities.md`, not measured
BiS or an optimizer. Fixed presets cannot solve every player's accuracy caps, boss damage or
mana needs. Reuse the reviewed current-client stat payloads and the existing simulation handlers;
do not infer stats from legacy enchant names. The original enchant-only delivery did not change
item selection or tank accessory weights. The subsequent pre-raid accessory audit changes DPS
rings/trinkets separately, recorded in each manifest preset. All 28 lists still have nine to eleven
enhancements, 265 assignments in total.

| Family                                | Default choices                                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warrior DPS, Retribution, Enhancement | Strength arcanums and bracers/gloves, Greater Stats chest, Agility cloak/boots, Strength weapons                                                                                                |
| Rogue                                 | Agility arcanums, bracers, gloves, boots and both weapons; Greater Stats chest                                                                                                                  |
| Hunter                                | Agility armor/weapon choices; +25 Agility for two-handers or +15 per one-hander; SAF-T ranged-crit scope                                                                                        |
| Cat                                   | Strength arcanums/bracers, Agility gloves/boots and +25 Agility two-hander; Greater Stats chest                                                                                                 |
| Warrior tank                          | Threat-oriented Strength choices, +70 armor cloak, +7 Stamina shield; unchanged blue PvP armor/accessories                                                                                      |
| Bear                                  | Agility arcanums, +15 Agility gloves, +25 Agility two-hander, Strength bracers; no shield/block/parry suggestions                                                                               |
| Paladin tank                          | Stamina arcanum/bracers/shield, four Wild Leather Armor Kits for Stamina/Defense, armor cloak, Spell Power weapon                                                                               |
| Casters                               | Arcanum of Focus head/legs, Greater Stats chest, resistance cloak, Healing Power bracers with their verified +8 damage component, Spell Power weapon                                            |
| School-specific gloves                | Fire/Frost Mage and Destruction Warlock get matching school power; Shadow Priest and other Warlock lists get Shadow Power; other casters get the verified +12 damage component of Healing Power |
| Elemental off-hand                    | Law of Nature on its actual shield; never a weapon enchant                                                                                                                                      |

Every family uses Chromatic Mantle of the Dawn on shoulders as the conservative non-raid-reward
reference. It is resistance, not a fictional DPS bonus. The Hunter scope is ranged-only and is
chosen rather than unconditionally adding hit to a possibly capped preset. A melee character's
ranged stat stick does not receive a scope that would not improve its melee attacks. Necklaces,
belts, rings, trinkets, held off-hands, wands and class relics remain unenchanted.

Crusader, Lifestealing, Fiery Weapon and Revelation are excluded from automatic defaults because
their reviewed status is provisional. Manually selecting a provisional model still requires the
existing explicit session opt-in. Unsupported effects and wearer-profession dependencies are
also excluded. The presence of a formula/enchant in the client is not proof that its recipe,
reputation reward or release unlock is obtainable today. In particular, Enchanting recipes may
have raid-sourced formulas even though the applied enchant is crafted. Default tooltips and the
published manifest retain that availability caveat; this is not a guaranteed pre-raid shopping list.

## Build-time implementation

`infra/simulator/default-enchants.mjs` runs after the audited enchant database is generated.
It validates the actual item type/slot, wearer class, armor, weapon/shield/two-hand restrictions,
level/item-level bounds and reviewed support status before writing each preset. Unknown items,
ambiguous application variants, missing/changing evidence or a changed upstream preset inventory
fail preparation. Selection uses `ItemType`, not guessed numeric gear positions.

DPS source gear JSON is read from the pinned Git revision on every build. Tank lists are built
by the existing deterministic adapter first. Only their enchant fields are changed. Ranked
profiles are currently all excluded by the real-item policy; new retained ranked profiles fail
closed until reviewed. The new adapter participates in immutable release hashing.

Each prepared release publishes `kfc-default-enchants.json` with source evidence, exact item and
enchant IDs, application keys, display names, model status and static totals. Tank metadata keeps
equipment-only totals separate from enchant bonuses, and the UI labels both. Neither raw vector
includes character base stats, talents, buffs, set effects or form multipliers.

## Verification

The Node suite covers every policy, unchanged equipment, deterministic application, invalid
evidence and legality. The Go suite loads all 28 real equipment specs, checks every applied enchant
with the engine validator and requires exact agreement between manifest and engine enchant stats.
The browser suite checks fresh defaults, every named gear set, faction variants, saved empty
enchants and real combat. For the 12 non-tank golden scenarios, removing only the new enchant
fields must reproduce the previous exact worker requests and results; the baseline is not rewritten.
The larger gear rows also exposed item previews obstructing the enchant modal, including the
picker's own mini gear rail. Hover previews are now click-through; long content remains scrollable
in the explicit details dialog. Inspection is additionally limited to the active dialog/modal and
cleared on its shown event. Regressions check outside hover and deliberately hover the mini gear
rail before clicking a candidate's details button.

Final checks passed for the release above:

- `pnpm simulator:test`: 34 passing Node tests.
- `pnpm simulator:prepare`: focused Go tests including all 28 default specs, strict TypeScript,
  Vite and Go/WASM build; a subsequent cached run verifies all 3,485 asset hashes.
- `pnpm simulator:smoke:workspace`: all 15 combat profiles, exact twelve-profile unenchanted
  golden comparisons, every named gear set, faction starters, custom-save preservation,
  five viewport widths, Raid, embedded actions/dismissal and stalled-worker recovery.
- `pnpm simulator:smoke:inspection`: apply/remove/save/reload, unsupported/provisional handling,
  exact unknown-enchant recovery/download, click-through mini-gear previews, mobile details,
  parent/iframe placement and real combat for all 15 profiles.
- Focused ESLint, Prettier, Go formatting and `git diff --check` passed.

No Next application code was changed, so no new Next production build or deployment is claimed.
