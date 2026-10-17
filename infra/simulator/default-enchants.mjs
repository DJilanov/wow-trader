import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enchantKey } from "./inspection-data.mjs";
import { selectDefaultTrinkets } from "./default-trinkets.mjs";
import { selectDefaultRings } from "./default-rings.mjs";

// Editorial starting choices, not a cap-aware optimizer or a promise of recipe availability.
// Keys are proto ItemType, not zero-based ItemSlot.
const strength = { 1: 1506, 3: 2488, 4: 247, 5: 1891, 6: 1885, 7: 927, 9: 1506, 10: 1887 };
const agility = { ...strength, 1: 1508, 9: 1508, 6: 247, 7: 2564 };
const caster = { 1: 2544, 3: 2488, 4: 1888, 5: 1891, 6: 2566, 7: 2617, 9: 2544, 10: 929 };

export const defaultEnchantProfiles = {
  warrior: { playerClass: 9, variants: ["fury", "arms"], armor: strength, weapon: 2563 },
  rogue: {
    playerClass: 6,
    variants: ["combat", "mutilate", "subtlety"],
    armor: agility,
    weapon: 2564,
  },
  hunter: {
    playerClass: 2,
    variants: ["beast_mastery", "marksmanship", "survival"],
    armor: agility,
    weapon: 2564,
    twoHand: 2646,
    scope: 8720,
  },
  feral_druid: {
    playerClass: 1,
    variants: ["feral"],
    armor: { ...strength, 7: 2564 },
    weapon: 2563,
    twoHand: 2646,
  },
  retribution_paladin: { playerClass: 4, variants: ["retribution"], armor: strength, weapon: 2563 },
  enhancement_shaman: { playerClass: 7, variants: ["enhancement"], armor: strength, weapon: 2563 },
  mage: {
    playerClass: 3,
    variants: ["arcane", "fire", "frost"],
    armor: caster,
    gloves: { fire: 2616, frost: 2615 },
    weapon: 2504,
  },
  warlock: {
    playerClass: 8,
    variants: ["demonology", "affliction", "ds_ruin", "destruction"],
    armor: { ...caster, 7: 2614 },
    gloves: { destruction: 2616 },
    weapon: 2504,
  },
  shadow_priest: {
    playerClass: 5,
    variants: ["shadow"],
    armor: { ...caster, 7: 2614 },
    weapon: 2504,
  },
  smite_priest: { playerClass: 5, variants: ["smite"], armor: caster, weapon: 2504 },
  balance_druid: { playerClass: 1, variants: ["balance"], armor: caster, weapon: 2504 },
  elemental_shaman: {
    playerClass: 7,
    variants: ["elemental", "stormcaller"],
    armor: caster,
    weapon: 2504,
    shield: 7603,
  },
  tank_warrior: { playerClass: 9, armor: { ...strength, 4: 1889 }, weapon: 2563, shield: 929 },
  feral_tank_druid: { playerClass: 1, armor: { ...agility, 6: 1885 }, weapon: 2563, twoHand: 2646 },
  protection_paladin: {
    playerClass: 4,
    armor: { 1: 1507, 3: 2488, 4: 1889, 5: 8719, 6: 1886, 7: 8719, 9: 8719, 10: 8719 },
    weapon: 2504,
    shield: 929,
  },
};

const slotTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
export const defaultEnchantNotice =
  "Reviewed role-based default enchants, not simulated BiS. Recipe, reputation and release unlocks need in-game confirmation. Unverified procs are excluded. Saved builds are not changed; select a gear preset to load these enchants.";

export function defaultEnchantFits(enchant, item, playerClass, slot) {
  if (slotTypes[slot] !== item.type) return false;
  if (enchant.type !== item.type && !enchant.extraTypes.includes(item.type)) return false;
  if (enchant.status !== "static" && !(enchant.status === "scripted" && enchant.effectId === 8720))
    return false;
  if (enchant.requiredProfession || enchant.requiredSkill || enchant.condition) return false;
  if (enchant.classAllowlist.length && !enchant.classAllowlist.includes(playerClass)) return false;
  if (enchant.armorTypes.length && !enchant.armorTypes.includes(item.armorType)) return false;
  if (60 < enchant.minLevel || (enchant.maxLevel && 60 > enchant.maxLevel)) return false;
  if (
    item.ilvl < enchant.itemLevelMin ||
    (enchant.itemLevelMax && item.ilvl > enchant.itemLevelMax)
  )
    return false;
  if (enchant.enchantType === 1 && item.handType !== 4) return false;
  if ((enchant.enchantType === 2) !== (item.weaponType === 7)) return false;
  if (enchant.enchantType === 4 && item.weaponType !== 8) return false;
  if (item.type === 13) {
    if (item.weaponType === 5 || (slot === 14 && (item.weaponType === 7 || item.handType === 3)))
      return false;
    if (slot === 15 && (item.handType === 1 || item.handType === 4)) return false;
  }
  return item.type !== 14 || [1, 2, 3].includes(item.rangedWeaponType);
}

export function enchantDefaultGear(gear, profile, variant, db, inspection) {
  const definition = defaultEnchantProfiles[profile];
  if (!definition) throw new Error(`Unknown default enchant profile ${profile}`);
  if (!Array.isArray(gear.items) || gear.items.length !== 17)
    throw new Error(`Invalid default gear ${profile}/${variant}`);
  const items = new Map(db.items.map((item) => [item.id, item]));
  const result = globalThis.structuredClone(gear);
  const choices = [];
  const enchantTotals = Array(44).fill(0);
  for (const [slot, spec] of result.items.entries()) {
    delete spec.enchant;
    if (!spec.id) continue;
    const item = items.get(spec.id);
    if (!item) throw new Error(`Default gear references missing item ${spec.id}`);
    let effectId = definition.armor[item.type];
    if (item.type === 7) effectId = definition.gloves?.[variant] ?? effectId;
    if ([14, 15].includes(slot) && item.weaponType !== 5) {
      effectId =
        item.weaponType === 7
          ? definition.shield
          : item.handType === 4
            ? (definition.twoHand ?? definition.weapon)
            : definition.weapon;
    }
    if (slot === 16 && [1, 2, 3].includes(item.rangedWeaponType)) effectId = definition.scope;
    if (!effectId) continue;
    const candidates = Object.values(inspection.enchants).filter(
      (enchant) =>
        enchant.effectId === effectId &&
        defaultEnchantFits(enchant, item, definition.playerClass, slot),
    );
    if (candidates.length !== 1)
      throw new Error(
        `No unique reviewed default enchant ${effectId} for ${profile}/${variant} slot ${slot} item ${item.id}`,
      );
    const enchant = candidates[0];
    if (
      enchant.status === "static" &&
      (enchant.stats.length !== 44 || enchant.stats.some((value) => !Number.isFinite(value)))
    )
      throw new Error(`Invalid default enchant stats ${effectId}`);
    spec.enchant = effectId;
    choices.push({
      gearIndex: slot,
      itemId: item.id,
      key: enchantKey(enchant),
      effectId,
      name: enchant.name,
      status: enchant.status,
    });
    enchant.stats.forEach((value, index) => {
      enchantTotals[index] += value;
    });
  }
  if (choices.length < 9) throw new Error(`Incomplete default enchants ${profile}/${variant}`);
  return {
    profile,
    variant,
    playerClass: definition.playerClass,
    gear: result,
    choices,
    enchantTotals,
  };
}

export function patchDefaultEnchantPresetSource(source) {
  const original = "tooltip: 'Level 60 Forever equipment.'";
  const replacement = `tooltip: ${JSON.stringify("Level 60 Forever equipment. " + defaultEnchantNotice)}`;
  if (source.includes(original)) return source.replaceAll(original, replacement);
  if (source.includes(replacement)) return source;
  throw new Error("Upstream default gear preset tooltip changed");
}

export async function prepareDefaultEnchants(root) {
  const db = JSON.parse(await readFile(join(root, "assets/database/db.json"), "utf8"));
  const catalog = JSON.parse(
    await readFile(join(root, "assets/db_inputs/forever_gear_catalog.json"), "utf8"),
  );
  const inspection = JSON.parse(await readFile(join(root, "ui/core/kfc_inspection.json"), "utf8"));
  const startersPath = join(root, "ui/core/kfc_tank_starters.json");
  const starters = JSON.parse(await readFile(startersPath, "utf8"));
  const ranked = JSON.parse(
    await readFile(join(root, "ui/core/forever_ranked_profiles.json"), "utf8"),
  );
  if (ranked.profiles.length)
    throw new Error("New source-ranked profiles require default enchant review");
  const presets = [];
  for (const [profile, definition] of Object.entries(defaultEnchantProfiles)) {
    if (definition.variants) {
      const sourcePath = join(root, `ui/${profile}/presets.ts`);
      const source = execFileSync("git", ["show", `HEAD:ui/${profile}/presets.ts`], {
        cwd: root,
        encoding: "utf8",
      });
      const imports = [
        ...source.matchAll(/import (\w+) from '\.\/gear_sets\/([^']+\.gear\.json)';/g),
      ];
      const used = imports.filter(([, alias]) =>
        new RegExp(`makePresetGear\\([^\\n]+, ${alias}(?:,|\\))`).test(source),
      );
      const paths = definition.variants.map((variant) => `forever_${variant}.gear.json`);
      if (
        JSON.stringify(used.map(([, , file]) => file).sort()) !== JSON.stringify([...paths].sort())
      )
        throw new Error(`Upstream supplied gear lists changed for ${profile}`);
      for (const variant of definition.variants) {
        const path = `ui/${profile}/gear_sets/forever_${variant}.gear.json`;
        const original = JSON.parse(
          execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8" }),
        );
        const trinkets = selectDefaultTrinkets(
          original,
          profile,
          definition.playerClass,
          db,
          catalog,
        );
        const rings = selectDefaultRings(
          trinkets.gear,
          profile,
          definition.playerClass,
          db,
          catalog,
        );
        const preset = enchantDefaultGear(rings.gear, profile, variant, db, inspection);
        preset.trinkets = trinkets.choices;
        preset.rings = rings.choices;
        const alias = used.find(([, , file]) => file === `forever_${variant}.gear.json`)[1];
        const label = source.match(new RegExp(`makePresetGear\\('([^']+)', ${alias}(?:,|\\))`));
        if (!label) throw new Error(`Upstream preset label changed for ${profile}/${variant}`);
        preset.name = label[1];
        await writeFile(join(root, path), JSON.stringify(preset.gear, null, 2) + "\n");
        presets.push(preset);
      }
      await writeFile(sourcePath, patchDefaultEnchantPresetSource(source));
    } else {
      const starter = starters[profile];
      if (!starter) throw new Error(`Missing tank starter ${profile}`);
      for (const [variant, field] of [
        ["alliance", "gear"],
        ...(starter.factionVariants ? [["horde", "hordeGear"]] : []),
      ]) {
        const trinkets = selectDefaultTrinkets(
          starter[field],
          profile,
          definition.playerClass,
          db,
          catalog,
        );
        if (
          JSON.stringify(starter[field].items.slice(12, 14)) !==
          JSON.stringify(trinkets.gear.items.slice(12, 14))
        )
          throw new Error(`Tank starter and trinket policy disagree for ${profile}`);
        const preset = enchantDefaultGear(starter[field], profile, variant, db, inspection);
        preset.trinkets = trinkets.choices;
        preset.name = starter.name + (variant === "horde" ? " · Horde" : "");
        starter[field] = preset.gear;
        starter.enchantTotals = preset.enchantTotals;
        starter.enchantCount = preset.choices.length;
        presets.push(preset);
      }
      if (!starter.factionVariants) starter.hordeGear = globalThis.structuredClone(starter.gear);
    }
  }
  const result = {
    schema: "kfc-default-enchants.v1",
    notice: defaultEnchantNotice,
    source: inspection.source,
    presets,
  };
  await writeFile(startersPath, JSON.stringify(starters));
  await writeFile(join(root, "ui/core/kfc_default_enchants.json"), JSON.stringify(result));
  await writeFile(join(root, "sim/core/kfc_default_enchants.json"), JSON.stringify(result));
  return result;
}
