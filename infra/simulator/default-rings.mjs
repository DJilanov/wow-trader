import { defaultTrinketProfiles } from "./default-trinkets.mjs";

const reviewed = {
  19325: { name: "Don Julio's Band", requiredStat: [18, 1] },
  13001: { name: "Maiden's Circle", requiredStat: [5, 18] },
  272406: { name: "Channeler's Ring", requiredStat: [3, 14] },
  272408: { name: "Cutthroat's Signet", requiredStat: [1, 14] },
};

export function selectDefaultRings(gear, profile, playerClass, db, catalog) {
  if (!defaultTrinketProfiles[profile] || gear.items?.length !== 17)
    throw new Error(`Unknown starter ring profile ${profile}`);
  // The faction-specific tank rings and Paladin's defensive choices are curated separately.
  if (["tank_warrior", "feral_tank_druid", "protection_paladin"].includes(profile))
    return { gear: globalThis.structuredClone(gear), choices: [] };
  const ids = defaultTrinketProfiles[profile].role === "caster" ? [13001, 272406] : [19325, 272408];
  const choices = ids.map((id) => {
    const item = db.items.find((item) => item.id === id);
    const expected = reviewed[id];
    const source = catalog.items.find((item) => item.id === id);
    // Don Julio and Maiden are admitted only by the separately checksum-pinned client adapter.
    const clientAccessory = [19325, 13001].includes(id);
    if (
      !item ||
      item.type !== 11 ||
      item.name !== expected.name ||
      item.stats?.length !== 44 ||
      item.stats.some((value) => !Number.isFinite(value)) ||
      item.stats[expected.requiredStat[0]] !== expected.requiredStat[1] ||
      item.factionRestriction ||
      item.requiredProfession ||
      item.randomSuffixOptions?.length ||
      (item.classAllowlist?.length && !item.classAllowlist.includes(playerClass)) ||
      (!clientAccessory &&
        (!source ||
          source.requiredLevel > 60 ||
          source.requiredSkill ||
          source.requiredAbility ||
          !source.sources.length ||
          source.sources.some((source) => source.kind !== "vendor" || source.faction)))
    )
      throw new Error(`Unverified or incompatible starter ring ${profile}/${id}`);
    return {
      itemId: id,
      name: item.name,
      stats: item.stats,
      category: source?.limitCategory ?? 0,
      note:
        id === 19325
          ? "Current client stats. Alterac Valley reputation is required; not raid loot."
          : id === 13001
            ? "Current client stats, not a Classic-stat fallback. Specific drop and launch availability need confirmation."
            : "Current Forever non-raid vendor record; access and currency requirements need in-game confirmation.",
    };
  });
  const categories = choices.map((item) => item.category).filter(Boolean);
  if (new Set(categories).size !== categories.length)
    throw new Error(`Unique-equipped ring conflict in ${profile}`);
  const result = globalThis.structuredClone(gear);
  ids.forEach((id, index) => {
    result.items[10 + index] = { id };
  });
  return { gear: result, choices };
}
