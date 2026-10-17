// Pre-raid starter choices from the admitted Forever catalog, not raid BiS or an optimizer.
const physical = [272437, 249469];
const caster = [272438, 249469];
export const defaultTrinketProfiles = {
  warrior: { role: "physical", ids: physical },
  rogue: { role: "physical", ids: physical },
  hunter: { role: "ranged", ids: [249469, 249470] },
  feral_druid: { role: "physical", ids: physical },
  retribution_paladin: { role: "physical", ids: physical },
  enhancement_shaman: { role: "physical", ids: physical },
  mage: { role: "caster", ids: caster },
  warlock: { role: "caster", ids: caster },
  shadow_priest: { role: "caster", ids: caster },
  smite_priest: { role: "caster", ids: caster },
  balance_druid: { role: "caster", ids: caster },
  elemental_shaman: { role: "caster", ids: caster },
  tank_warrior: { role: "physical", ids: physical },
  feral_tank_druid: { role: "physical", ids: physical },
  protection_paladin: { role: "defensive", ids: [272440, 1490] },
};

const items = {
  272437: {
    name: "Adaptive Combat Assistant",
    stat: 22,
    value: 2,
    note: "2% expertise for melee attacks. Its absorb/explosion use is not implemented; no damage is credited to it.",
  },
  249469: {
    name: "Frozen Heart of the Mountain",
    stat: 18,
    value: 0.9,
    note: "0.9% universal equipment hit in Forever, including spells. The modeled use adds Frost/Shadow power only; it adds no Fire, Holy, Nature or Arcane power. No snowy-area bonus is assumed.",
  },
  249470: {
    name: "Molten Heart of the Mountain",
    stat: 36,
    value: 7,
    note: "The modeled use grants 55 melee/ranged attack power for 15 seconds on a five-minute cooldown. Not a caster trinket; no volcanic-area bonus is assumed.",
  },
  272438: {
    name: "Weakness Analyzer",
    stat: 5,
    value: 22,
    note: "22 spell power and a modeled short critical-chance use. Shares unique-equipped category 707 with the other Undermine trinkets.",
  },
  272440: {
    name: "Defender's Grip Stabilizer",
    stat: 28,
    value: 13,
    note: "13 defense and a modeled block-chance use. Intended for shield tanks, not Bear.",
  },
  1490: {
    name: "Guardian Talisman",
    stat: 2,
    value: 9,
    note: "9 stamina. Its use is not implemented; no additional survival benefit is credited.",
  },
};

export function selectDefaultTrinkets(gear, profile, playerClass, db, catalog) {
  const definition = defaultTrinketProfiles[profile];
  if (!definition || gear.items?.length !== 17)
    throw new Error(`Unknown starter trinket profile ${profile}`);
  const selected = definition.ids.map((id) => {
    const item = db.items.find((item) => item.id === id);
    const source = catalog.items.find((item) => item.id === id);
    const expected = items[id];
    if (
      !item ||
      !source ||
      item.type !== 12 ||
      item.name !== expected.name ||
      item.stats?.length !== 44 ||
      item.stats.some((value) => !Number.isFinite(value)) ||
      item.stats[expected.stat] !== expected.value ||
      source.requiredLevel > 60 ||
      source.requiredSkill ||
      source.requiredAbility ||
      item.requiredProfession ||
      item.factionRestriction ||
      item.randomSuffixOptions?.length ||
      (item.classAllowlist?.length && !item.classAllowlist.includes(playerClass)) ||
      !source.sources.length ||
      source.sources.some(
        (source) =>
          !["crafted", "dungeon", "vendor", "pvp"].includes(source.kind) || source.faction,
      )
    )
      throw new Error(`Unverified or incompatible ${profile} starter trinket ${id}`);
    if (
      definition.role === "caster" &&
      !(item.stats[5] + item.stats[42] + item.stats[18] + item.stats[13] > 0)
    )
      throw new Error(`Non-caster trinket in ${profile}`);
    return {
      itemId: id,
      name: item.name,
      stats: item.stats,
      category: source.limitCategory ?? 0,
      note: expected.note,
    };
  });
  const categories = selected.map((item) => item.category).filter(Boolean);
  if (new Set(categories).size !== categories.length || new Set(definition.ids).size !== 2)
    throw new Error(`Unique-equipped trinket conflict in ${profile}`);
  const result = globalThis.structuredClone(gear);
  for (const [index, id] of definition.ids.entries()) result.items[12 + index] = { id };
  return { gear: result, role: definition.role, choices: selected };
}
