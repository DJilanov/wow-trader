import { execFileSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";

// Curated IDs and editorial weights, not a copy of the extracted item database.
export const tankStarterDefinitions = {
  tank_warrior: {
    cssClass: "tank-warrior-sim-ui",
    playerClass: 9,
    family: "Mortarplate",
    setId: 281,
    threatAccessories: true,
    trinkets: [272437, 249469],
    core: [272480, 272637, 272479, 272579, 272478, 273324, 272481, 272477],
    priorities:
      "Threat-first accessories: expertise and hit, weapon damage, strength, attack power and crit. The locked blue PvP armor supplies the stamina baseline; accessory slots are not spent on extra stamina.",
    weights: {
      0: 2.5,
      1: 3,
      2: 0.2,
      17: 1,
      18: 50,
      19: 25,
      22: 50,
      26: 0.005,
      28: 0.1,
      29: 0.5,
      30: 0.5,
      31: 1,
      32: 1,
      34: 0.02,
      40: 0.005,
    },
    weaponDpsWeight: 12,
    guide: "https://www.icy-veins.com/wow-forever/protection-warrior-tank-pve-guide/",
  },
  protection_paladin: {
    cssClass: "protection-paladin-sim-ui",
    playerClass: 4,
    family: "Chevalier",
    setId: 2086,
    threatAccessories: false,
    trinkets: [272440, 1490],
    core: [272743, 272745, 272742, 272721, 272719, 272720, 272744, 272718],
    priorities:
      "Stamina, armor and shield defenses for durability; spell power and hit for threat; intellect for mana.",
    weights: {
      0: 0.5,
      1: 1,
      2: 4,
      3: 0.5,
      5: 2,
      9: 2,
      12: 1,
      13: 15,
      14: 5,
      17: 0.15,
      18: 10,
      19: 5,
      26: 0.04,
      28: 6,
      29: 5,
      30: 1.5,
      31: 15,
      32: 15,
      34: 0.4,
      40: 0.04,
      42: 2,
    },
    weaponDpsWeight: 2,
    relicId: 272434,
    guide: "https://www.icy-veins.com/wow-forever/protection-paladin-tank-pve-guide/",
  },
  feral_tank_druid: {
    cssClass: "feral-tank-druid-sim-ui",
    playerClass: 1,
    family: "Dragonhide",
    setId: 382,
    threatAccessories: true,
    trinkets: [272437, 249469],
    core: [272471, 272469, 272472, 272582, 272614, 272463, 272470, 272462],
    priorities:
      "Threat-first accessories: weapon DPS, expertise and hit, strength, agility, attack power and crit. Blue PvP armor supplies the stamina baseline. No block or parry value in Bear Form.",
    weights: {
      0: 2,
      1: 2,
      2: 0.2,
      17: 1,
      18: 50,
      19: 30,
      22: 50,
      26: 0.01,
      28: 0.1,
      31: 1,
      34: 0.02,
      40: 0.01,
      43: 1,
    },
    weaponDpsWeight: 15,
    relicId: 272428,
    guide: "https://www.icy-veins.com/wow-forever/feral-druid-melee-dps-and-tank-pve-guide/",
  },
};

const armorSlots = new Map([
  [1, 0],
  [3, 2],
  [5, 4],
  [6, 5],
  [7, 6],
  [8, 7],
  [9, 8],
  [10, 9],
]);
const fillerTypes = new Map([
  [1, 2],
  [3, 4],
  [10, 11],
  [11, 11],
  [12, 12],
  [13, 12],
  [14, 13],
  [15, 13],
  [16, 14],
]);
const caveat =
  "Level-60 starter, not BiS or a crit-immunity claim. Six blue PvP set pieces plus matching wrists/belt; role-specific accessories, weighted fillers and reviewed default enchants, not an exhaustive optimizer. No paid hit, unverified Classic items, unverified enchant procs or forced Tier 1. Don Julio's Band requires AV reputation; the Alliance Theramore Signet / Horde Insurgent's Band require Honored with their Darkspear Islands faction. Vendor access, enchant recipes, reputation and release unlocks need in-game confirmation. Item procs and class mechanics may be incomplete; four-piece utility is not modeled. Raw gear totals exclude enchants, buffs, talents, set bonuses and Bear Form multipliers.";

export function tankStarterScore(item, definition) {
  const stats = item.stats.reduce(
    (total, value, index) => total + value * (definition.weights[index] ?? 0),
    0,
  );
  const dps =
    item.type === 13 && item.weaponSpeed > 0
      ? (item.weaponDamageMin + item.weaponDamageMax) / (2 * item.weaponSpeed)
      : 0;
  return stats + dps * definition.weaponDpsWeight;
}

function eligibleFiller(item, catalogItem, definition, slot) {
  if (
    !catalogItem ||
    item.quality < 2 ||
    item.quality > 3 ||
    item.ilvl > 65 ||
    catalogItem.requiredLevel > 60
  )
    return false;
  if (
    item.requiredProfession ||
    catalogItem.requiredSkill ||
    catalogItem.requiredAbility ||
    item.factionRestriction ||
    item.randomSuffixOptions?.length
  )
    return false;
  if (catalogItem.sources.some((source) => source.faction) || !catalogItem.sources.length)
    return false;
  if (item.classAllowlist?.length && !item.classAllowlist.includes(definition.playerClass))
    return false;
  if (slot === 14) {
    if (definition.playerClass === 1)
      return item.handType === 4 && [4, 6, 8].includes(item.weaponType);
    return (
      [1, 3].includes(item.handType) &&
      (definition.playerClass === 9 ? [1, 2, 3, 4, 9] : [1, 4, 9]).includes(item.weaponType)
    );
  }
  if (slot === 15) return item.weaponType === 7;
  if (slot === 16) {
    if (definition.playerClass === 1) return item.rangedWeaponType === 4;
    if (definition.playerClass === 4) return item.rangedWeaponType === 5;
    return [1, 2, 3, 6].includes(item.rangedWeaponType);
  }
  return true;
}

export function createTankStarters(catalog, equipment, vendorItems, accessories) {
  const metadata = new Map(catalog.items.map((item) => [item.id, item]));
  const items = new Map(equipment.items.map((item) => [item.id, item]));
  for (const item of accessories) items.set(item.id, item);
  const vendors = new Map(vendorItems.items.map((item) => [item.id, item]));
  const profiles = {};
  for (const [key, definition] of Object.entries(tankStarterDefinitions)) {
    const selected = Array.from({ length: 17 }, () => ({}));
    for (const id of definition.core) {
      const item = vendors.get(id);
      if (
        !item ||
        item.quality !== 3 ||
        item.ilvl !== 60 ||
        !item.name.startsWith(`Premier ${definition.family} `) ||
        item.classAllowlist?.length !== 1 ||
        item.classAllowlist[0] !== definition.playerClass ||
        item.stats.length !== 44 ||
        item.stats.some((value) => !Number.isFinite(value))
      )
        throw new Error(`Invalid tank starter core item ${id}`);
      const slot = armorSlots.get(item.type);
      if (slot === undefined || selected[slot].id)
        throw new Error(`Invalid tank starter armor slot ${id}`);
      // The vendor importer assigns the exporting character's faction to unobserved armor.
      // That is not an item restriction: the audited client records allow every race.
      const admitted = { ...item, factionRestriction: 0 };
      items.set(id, items.get(id) ?? admitted);
      selected[slot] = { id };
    }
    const coreItems = definition.core.map((id) => items.get(id));
    if (coreItems.filter((item) => item.setId === definition.setId).length !== 6)
      throw new Error(`Incomplete ${key} PvP set`);
    if (definition.threatAccessories) {
      for (const [slot, id, faction] of [
        [10, 19325, 0],
        [11, 271908, 1],
      ]) {
        const item = items.get(id);
        if (!item || item.type !== 11 || item.factionRestriction !== faction)
          throw new Error(`Missing verified threat ring ${id}`);
        selected[slot] = { id };
      }
      if (items.get(272064)?.factionRestriction !== 2)
        throw new Error("Missing verified Horde threat ring");
    }
    for (const [index, id] of definition.trinkets.entries()) {
      const item = items.get(id);
      if (!item || item.type !== 12 || !eligibleFiller(item, metadata.get(id), definition, 12))
        throw new Error(`Invalid curated starter trinket ${id}`);
      selected[12 + index] = { id };
    }
    const categories = selected.flatMap((entry) =>
      metadata.get(entry.id)?.limitCategory ? [metadata.get(entry.id).limitCategory] : [],
    );
    if (new Set(categories).size !== categories.length)
      throw new Error(`Conflicting unique-equipped category in ${key} starter`);
    for (const [slot, type] of fillerTypes) {
      if (selected[slot].id) continue;
      if (slot === 15 && definition.playerClass === 1) continue;
      const candidates = equipment.items.filter(
        (item) =>
          item.type === type &&
          eligibleFiller(item, metadata.get(item.id), definition, slot) &&
          !selected.some((entry) => entry.id === item.id) &&
          (!metadata.get(item.id)?.limitCategory ||
            !selected.some(
              (entry) =>
                entry.id &&
                metadata.get(entry.id)?.limitCategory === metadata.get(item.id).limitCategory,
            )),
      );
      candidates.sort(
        (a, b) =>
          tankStarterScore(b, definition) - tankStarterScore(a, definition) ||
          b.ilvl - a.ilvl ||
          a.id - b.id,
      );
      const item =
        slot === 16 && definition.relicId
          ? candidates.find((entry) => entry.id === definition.relicId)
          : candidates[0];
      if (!item) throw new Error(`No legal ${key} starter filler for slot ${slot}`);
      selected[slot] = { id: item.id };
    }
    const totals = Array(44).fill(0);
    for (const entry of selected)
      if (entry.id)
        items.get(entry.id).stats.forEach((value, index) => {
          totals[index] += value;
        });
    profiles[key] = {
      name: `Blue PvP starter · ${definition.family}`,
      cssClass: definition.cssClass,
      gear: { items: selected },
      hordeGear: {
        items: selected.map((item, slot) =>
          definition.threatAccessories && slot === 11 ? { id: 272064 } : { ...item },
        ),
      },
      factionVariants: definition.threatAccessories,
      priorities: definition.priorities,
      weights: definition.weights,
      weaponDpsWeight: definition.weaponDpsWeight,
      totals,
      guide: definition.guide,
      caveat,
      core: definition.core,
    };
  }
  return { equipment: { items: [...items.values()] }, profiles };
}

export function patchTankPresetSource(source, key) {
  if (!Object.hasOwn(tankStarterDefinitions, key)) throw new Error("Unknown tank starter spec");
  const importMarker = "import LaunchGearJSON from './gear_sets/launch.gear.json';";
  const gearMarker =
    "export const GearLaunch = PresetUtils.makePresetGear('Modeled level 65', LaunchGearJSON);";
  if (source.split(importMarker).length !== 2 || source.split(gearMarker).length !== 2)
    throw new Error("Upstream tank preset source changed");
  const definition = tankStarterDefinitions[key];
  let result = source
    .replace(
      importMarker,
      "import KfcStarters from '../core/kfc_tank_starters.json';\nimport { TypedEvent } from '../core/typed_event.js';\n" +
        (definition.threatAccessories
          ? "import { Faction } from '../core/proto/common.js';\n"
          : ""),
    )
    .replace(
      gearMarker,
      `export const GearLaunch = PresetUtils.makePresetGear(KfcStarters.${key}.name, KfcStarters.${key}.gear, { ${definition.threatAccessories ? "faction: Faction.Alliance, " : ""}tooltip: KfcStarters.${key}.caveat, onLoad: player => player.setForeverTier1Bonuses(TypedEvent.nextEventID(), false) });` +
        (definition.threatAccessories
          ? `\nexport const GearHorde = PresetUtils.makePresetGear(KfcStarters.${key}.name + ' · Horde', KfcStarters.${key}.hordeGear, { faction: Faction.Horde, tooltip: KfcStarters.${key}.caveat, onLoad: player => player.setForeverTier1Bonuses(TypedEvent.nextEventID(), false) });`
          : ""),
    );
  if (definition.threatAccessories) {
    const marker = "[ClassicPhase.Phase1]: [GearLaunch],";
    if (result.split(marker).length !== 2) throw new Error("Upstream tank gear list changed");
    result = result.replace(marker, "[ClassicPhase.Phase1]: [GearLaunch, GearHorde],");
  }
  return result;
}

export const tankStarterTalents = {
  tank_warrior: { name: "Protection 8/5/38", talentsString: "35-05-251333120330021351" },
  feral_tank_druid: { name: "Bear Tank 0/41/10", talentsString: "-50032332120132012551-055" },
};

export function validateTankStarterTalents(trees, key) {
  const preset = tankStarterTalents[key];
  if (!preset) throw new Error("Unknown tank starter talents");
  const allocations = preset.talentsString.split("-");
  let total = 0;
  const pointsByField = new Map();
  trees.forEach((tree, treeIndex) => {
    const ranks = [...(allocations[treeIndex] ?? "")].map(Number);
    if (ranks.length > tree.talents.length) throw new Error("Starter talent tree changed");
    tree.talents.forEach((talent, index) => {
      const points = ranks[index] ?? 0;
      if (points > talent.maxPoints) throw new Error("Starter talent rank exceeds maximum");
      pointsByField.set(talent.fieldName, points);
      total += points;
      if (!points) return;
      const lowerPoints = tree.talents.reduce(
        (sum, other, otherIndex) =>
          sum + (other.location.rowIdx < talent.location.rowIdx ? (ranks[otherIndex] ?? 0) : 0),
        0,
      );
      if (lowerPoints < 5 * talent.location.rowIdx)
        throw new Error("Starter talent tier is locked");
      if (talent.prereqLocation) {
        const index = tree.talents.findIndex(
          (other) =>
            other.location.rowIdx === talent.prereqLocation.rowIdx &&
            other.location.colIdx === talent.prereqLocation.colIdx,
        );
        if (index < 0 || ranks[index] !== tree.talents[index].maxPoints)
          throw new Error("Starter talent prerequisite is incomplete");
      }
    });
  });
  if (total !== 51 || allocations.length !== trees.length)
    throw new Error("Starter must spend exactly 51 talent points");
  const expected = key === "tank_warrior" ? [8, 5, 38] : [0, 41, 10];
  if (
    allocations.some(
      (tree, index) => [...tree].reduce((sum, rank) => sum + Number(rank), 0) !== expected[index],
    )
  )
    throw new Error("Starter talent distribution changed");
  if (
    key === "tank_warrior" &&
    (pointsByField.get("defiance") !== 3 || pointsByField.get("unbridledWrath") !== 0)
  )
    throw new Error("Protection starter requires full Defiance and no Unbridled Wrath");
  if (key === "feral_tank_druid" && pointsByField.get("feralInstinct") !== 3)
    throw new Error("Bear starter requires full Feral Instinct");
}

export function patchTankTalentSource(source, key) {
  const preset = tankStarterTalents[key];
  if (!preset) return source;
  if (key === "feral_tank_druid") {
    const old =
      "'Bear Tank 1/40/10', SavedTalents.create({ talentsString: '01-50022332120132012551-055' })";
    if (source.split(old).length !== 2) throw new Error("Upstream Bear starter talents changed");
    return source.replace(
      old,
      `'${preset.name}', SavedTalents.create({ talentsString: '${preset.talentsString}' })`,
    );
  }
  const start = source.indexOf("export const TalentsProtection = ");
  const end = source.indexOf("export const PresetBuildTanky = ", start);
  if (start < 0 || end < start || !source.slice(start, end).includes("TalentsProtectionOrc"))
    throw new Error("Upstream Protection Warrior starter talents changed");
  return (
    source.slice(0, start) +
    `export const TalentsProtection = PresetUtils.makePresetTalents('${preset.name}', SavedTalents.create({ talentsString: '${preset.talentsString}' }));\n\n` +
    "export const TalentPresets = {\n\t[ClassicPhase.Phase1]: [TalentsProtection],\n};\n\n" +
    "export const DefaultTalents = TalentsProtection;\n\n" +
    source.slice(end)
  );
}

export function patchTankDefaults(source) {
  const marker = "this.player.setForeverTier1Bonuses(eventID, !healingSpec);";
  const gear =
    "this.player.setGear(eventID, this.sim.db.lookupEquipmentSpec(this.individualConfig.defaults.gear));";
  if (source.split(marker).length !== 2 || source.split(gear).length !== 2)
    throw new Error("Upstream tank gear/Tier 1 default changed");
  return source
    .replace(marker, "this.player.setForeverTier1Bonuses(eventID, false);")
    .replace(
      gear,
      "const starterGear = this.individualConfig.presets.gear.find(preset => preset.name.startsWith('Blue PvP starter') && (!preset.enableWhen || preset.enableWhen(this.player)))?.gear;\n\t\t\tthis.player.setGear(eventID, this.sim.db.lookupEquipmentSpec(starterGear ?? this.individualConfig.defaults.gear));",
    );
}

export function patchTankSimSource(source, key) {
  if (!Object.hasOwn(tankStarterDefinitions, key)) throw new Error("Unknown tank starter spec");
  const warning = "Tank gear is a projected level-65 scenario, not confirmed obtainable loot.";
  const weightsStart = "\t\tepWeights: Stats.fromMap(";
  const weightsEnd = "\t\t// Default consumes settings.";
  if (
    source.split(warning).length !== 2 ||
    source.split(weightsStart).length !== 2 ||
    source.split(weightsEnd).length !== 2
  )
    throw new Error("Upstream tank defaults changed");
  const start = source.indexOf(weightsStart),
    end = source.indexOf(weightsEnd, start);
  if (end < start) throw new Error("Invalid upstream tank weight boundaries");
  const replacement = `\t\tepWeights: Stats.fromMap(KfcStarters.${key}.weights, { [PseudoStat.PseudoStatMainHandDps]: KfcStarters.${key}.weaponDpsWeight }),\n`;
  let result =
    "import KfcStarters from '../core/kfc_tank_starters.json';\n" +
    (source.slice(0, start) + replacement + source.slice(end)).replace(
      warning,
      "The blue PvP starter is a stat-weighted baseline, not BiS. PvP unlocks, item effects and some tank mechanics remain provisional.",
    );
  if (tankStarterDefinitions[key].threatAccessories) {
    const horde = "[Faction.Horde]: {\n\t\t\t\t\t1: Presets.DefaultGear.gear,";
    if (result.split(horde).length !== 2) throw new Error("Upstream Horde raid starter changed");
    result = result.replace(horde, "[Faction.Horde]: {\n\t\t\t\t\t1: Presets.GearHorde.gear,");
  }
  if (key === "tank_warrior")
    result = result.replace("builds: [Presets.PresetBuildTanky],", "builds: [],");
  return result;
}

export function patchGearPresetLoad(source) {
  const marker = "\t\t\t\t\ttooltip: presetGear.tooltip,";
  if (source.split(marker).length !== 2) throw new Error("Upstream gear preset loading changed");
  return source.replace(marker, marker + "\n\t\t\t\t\tonLoad: presetGear.onLoad,");
}

export function patchPresetEligibility(source) {
  const marker = "dataElem.addEventListener('click', () => {";
  if (source.split(marker).length !== 2)
    throw new Error("Upstream saved preset activation changed");
  return source.replace(
    marker,
    marker + "\n\t\t\tif (config.enableWhen && !config.enableWhen(this.modObject)) return;",
  );
}

export function patchBuildPresetLoad(source) {
  const marker =
    "if (gear) this.simUI.player.setGear(eventID, this.simUI.sim.db.lookupEquipmentSpec(gear.gear));";
  if (source.split(marker).length !== 2) throw new Error("Upstream build preset loading changed");
  return source.replace(marker, marker + "\n\t\t\tgear?.onLoad?.(this.simUI.player);");
}

export async function adaptTankStarters(root, original, catalog, equipment, accessories) {
  const starters = createTankStarters(
    catalog,
    equipment,
    original("assets/db_inputs/forever_vendor_items.json"),
    accessories,
  );
  await writeFile(join(root, "ui/core/kfc_tank_starters.json"), JSON.stringify(starters.profiles));
  for (const key of Object.keys(starters.profiles)) {
    if (tankStarterTalents[key]) {
      const playerClass = key === "tank_warrior" ? "warrior" : "druid";
      validateTankStarterTalents(
        JSON.parse(await readFile(join(root, `ui/core/talents/trees/${playerClass}.json`), "utf8")),
        key,
      );
    }
    const path = `ui/${key}/presets.ts`;
    await writeFile(
      join(root, path),
      patchTankTalentSource(patchTankPresetSource(originalText(root, path), key), key),
    );
    const simPath = `ui/${key}/sim.ts`;
    await writeFile(join(root, simPath), patchTankSimSource(originalText(root, simPath), key));
  }
  const individualPath = "ui/core/individual_sim_ui.ts";
  await writeFile(
    join(root, individualPath),
    patchTankDefaults(originalText(root, individualPath)),
  );
  const gearPath = "ui/core/components/individual_sim_ui/gear_tab.ts";
  await writeFile(join(root, gearPath), patchGearPresetLoad(originalText(root, gearPath)));
  const buildPath = "ui/core/components/individual_sim_ui/preset_configuration_picker.tsx";
  await writeFile(join(root, buildPath), patchBuildPresetLoad(originalText(root, buildPath)));
  const savedPath = "ui/core/components/saved_data_manager.tsx";
  await writeFile(join(root, savedPath), patchPresetEligibility(originalText(root, savedPath)));
  for (const [source, target] of [
    ["tank-starter-sets.go", "sim/core/kfc_tank_starter_sets.go"],
    ["tank-starter-sets_test.go", "sim/core/kfc_tank_starter_sets_test.go"],
  ])
    await copyFile(new URL(`./${source}`, import.meta.url), join(root, target));
  return starters;
}

function originalText(root, path) {
  return execFileSync("git", ["show", `HEAD:${path}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32_000_000,
  });
}
