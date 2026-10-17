import { enchantDefaultGear } from "./default-enchants.mjs";
import { legalPrebisGear, prebisContext } from "./prebis-pool.mjs";
import { preRaidConsumeSettings, weaponConsumeProblem } from "./prebis-consumes.mjs";

export const furyBlueBaselineIds = [
  272480, 22150, 272637, 272578, 272479, 272579, 272478, 273324, 272481, 272477, 272408, 272064,
  272437, 249469, 12774, 15806, 12651,
];
export const furyBlueCoreIds = [272480, 272637, 272479, 272579, 272478, 273324, 272481, 272477];
export const armsBlueBaselineIds = furyBlueBaselineIds.map((id, slot) =>
  slot === 14 ? 12784 : slot === 15 ? 0 : id,
);

function controlledWarriorSettings(profile, gear, db, inspection, faction) {
  const settings = globalThis.structuredClone(profile.settings);
  settings.settings.faction = faction;
  settings.player.level = 60;
  settings.player.race = faction === "Alliance" ? "RaceHuman" : "RaceOrc";
  settings.player.profession1 = "Engineering";
  settings.player.profession2 = "Blacksmithing";
  settings.player.foreverTier1Bonuses = false;
  settings.player.enableItemSwap = false;
  settings.player.itemSwap = {};
  settings.player.warrior.options.startingRage = 0;
  settings.player.equipment = enchantDefaultGear(
    gear,
    "warrior",
    profile.variant,
    db,
    inspection,
  ).gear;
  settings.partyBuffs.windfuryTotem = true;
  const reckless = settings.player.rotation.priorityList.filter(
    (entry) => entry.action?.castSpell?.spellId?.spellId === 1719,
  );
  if (reckless.length !== 1) throw new Error("Warrior Recklessness APL changed");
  reckless[0].action.condition = { const: { val: "false" } };
  settings.encounter.duration = 300;
  settings.encounter.durationVariation = 0;
  settings.encounter.useHealth = false;
  return settings;
}

export function createFuryBlueBaseline(
  profile,
  db,
  sources,
  inspection,
  { faction = "Horde" } = {},
) {
  if (profile.profile !== "warrior" || profile.variant !== "fury" || profile.playerClass !== 9)
    throw new Error("Only the reviewed Fury blue baseline is defined");
  if (!["Alliance", "Horde"].includes(faction)) throw new Error("Unknown baseline faction");
  const ids = [...furyBlueBaselineIds];
  if (faction === "Alliance") ids[11] = 271908;
  const items = new Map(db.items.map((item) => [item.id, item]));
  const gear = { items: ids.map((id) => ({ id })) };
  const context = {
    profile: "warrior",
    playerClass: 9,
    faction: faction === "Alliance" ? 1 : 2,
    factionName: faction,
    professions: [4, 2],
    originalItems: gear.items.map((spec) => items.get(spec.id)),
    currentIds: new Set(ids),
  };
  for (const id of ids) {
    const item = items.get(id);
    if (!item || item.quality !== 3 || item.ilvl < 55 || item.ilvl > 65)
      throw new Error(`Invalid fixed blue baseline item ${id}`);
  }
  if (!legalPrebisGear(gear, items, sources, context)) throw new Error("Illegal blue baseline");
  const settings = controlledWarriorSettings(profile, gear, db, inspection, faction);
  return {
    settings,
    coreIds: [...furyBlueCoreIds],
    notice: `Fixed ${faction} level-60 all-blue equipment: eight Premier Mortarplate armor pieces and fixed non-raid blue fillers. Engineering + Blacksmithing, zero starting rage, no free Tier 1, no item swap, no Recklessness. Preset buffs/consumes plus explicit Windfury Totem as a controlled encounter assumption. Not an optimized equipment recommendation.`,
  };
}

export function createArmsBlueBaseline(
  profile,
  db,
  sources,
  inspection,
  { faction = "Alliance" } = {},
) {
  if (profile.profile !== "warrior" || profile.variant !== "arms" || profile.playerClass !== 9)
    throw new Error("Only the reviewed Arms blue baseline is defined");
  if (!["Alliance", "Horde"].includes(faction)) throw new Error("Unknown baseline faction");
  const ids = [...armsBlueBaselineIds];
  if (faction === "Alliance") ids[11] = 271908;
  const items = new Map(db.items.map((item) => [item.id, item]));
  for (const id of ids.filter(Boolean)) {
    const item = items.get(id);
    if (!item || item.quality !== 3 || item.ilvl < 55 || item.ilvl > 65)
      throw new Error(`Invalid fixed blue baseline item ${id}`);
  }
  if (items.get(ids[14]).handType !== 4)
    throw new Error("Arms baseline requires a two-hand weapon");
  const gear = { items: ids.map((id) => (id ? { id } : {})) };
  let settings = controlledWarriorSettings(profile, gear, db, inspection, faction);
  settings.player.warrior.options.stance = "WarriorStanceBattle";
  settings.player.bonusStats = {};
  settings = preRaidConsumeSettings(
    { schema: "kfc-optimization-baseline.v1", settings },
    db,
  ).settings;
  delete settings.player.consumes.offHandImbue;
  const context = prebisContext({ ...profile, settings }, items);
  if (!legalPrebisGear(settings.player.equipment, items, sources, context))
    throw new Error("Illegal Arms blue baseline");
  const consumeProblem = weaponConsumeProblem(settings, db);
  if (consumeProblem) throw new Error(consumeProblem);
  if (
    !settings.player.rotation.priorityList.some(
      (entry) => entry.action?.castSpell?.spellId?.spellId === 21553,
    )
  )
    throw new Error("Arms Mortal Strike APL changed");
  return {
    settings,
    coreIds: [...furyBlueCoreIds],
    notice: `Fixed ${faction} level-60 all-blue Arms equipment: eight Premier Mortarplate pieces, Arcanite Reaper and fixed non-raid blue fillers, empty off-hand. Engineering + Blacksmithing, Battle Stance, zero starting rage/manual bonus stats, no free Tier 1/item swap/Recklessness, no known raid-recipe weapon consumes. Controlled raid buffs include explicit Windfury. Current crafting inputs are checked. This is an unoptimized control, not a recommended build.`,
  };
}
