import assert from "node:assert/strict";
import { prebisEnchantFits } from "./prebis-enchants.mjs";
import { prebisEnchantProblem } from "./enchant-acquisition.mjs";

const raidZones = new Set([1977, 2159, 2677, 2717, 3428, 3429, 3456]);
const raidBosses = new Set([6109, 12397, 14887, 14888, 14889, 14890]);
const raidReputations = new Set([749, 910, 270]);
const slotTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14];
const armorLimits = { 1: 2, 2: 3, 3: 1, 4: 4, 5: 1, 6: 2, 7: 3, 8: 1, 9: 4 };
const replacements = new Map([
  [19687, 18375], // Primal Batskin → Dire Maul bracers.
  [19157, 15063], // Chromatic → Devilsaur gloves.
  [18282, 16004], // Keep gun/ammunition compatibility without Molten Core materials.
  [19167, 18538],
  [19691, 15051],
  [19163, 22232],
  [19682, 18385],
  [19683, 13170],
  [19684, 18735],
]);

export function presetAcquisitionProblem(item, source) {
  if (!item || !source?.sources?.length) return "Missing acquisition evidence";
  const entries = [...source.sources, ...(item.sources ?? [])];
  if (
    entries.some(
      (entry) =>
        raidZones.has(entry.zoneId) ||
        raidZones.has(entry.drop?.zoneId) ||
        raidZones.has(entry.soldBy?.zoneId) ||
        raidBosses.has(entry.drop?.npcId) ||
        raidReputations.has(entry.rep?.repFactionId) ||
        ["raid", "raid-quest", "raid-reputation"].includes(entry.kind),
    )
  )
    return "Raid drop, quest, vendor or reputation";
  if (source.sources.every((entry) => entry.kind === "crafted")) {
    if (source.craftAudit?.status === "raid-dependent") return "Raid-dependent recipe materials";
    if (source.craftAudit?.status !== "recipe-inputs-reviewed")
      return "Unresolved recipe materials";
  }
  return "";
}

export function auditPresetGear(gear, db, sources, inspection) {
  assert.equal(gear.items?.length, 17, "Expected all equipment slots");
  const items = new Map(db.items.map((item) => [item.id, item]));
  return gear.items.flatMap((spec, slot) => {
    if (!spec.id) return [];
    const item = items.get(spec.id);
    const problems = [];
    const acquisition = presetAcquisitionProblem(item, sources.get(spec.id));
    if (acquisition) problems.push({ slot, id: spec.id, name: item?.name, reason: acquisition });
    if (spec.enchant) {
      const recipes = Object.values(inspection.enchants).filter(
        (entry) =>
          entry.effectId === spec.enchant &&
          (entry.type === item?.type || entry.extraTypes.includes(item?.type)),
      );
      if (!recipes.length || recipes.every((entry) => prebisEnchantProblem(entry)))
        problems.push({
          slot,
          id: spec.id,
          name: item?.name,
          enchant: spec.enchant,
          reason: "Raid-only or unresolved enchant recipe",
        });
    }
    return problems;
  });
}

export function repairStarterPreset(preset, db, sources, inspection) {
  assert.equal(preset.gear.items?.length, 17);
  assert(armorLimits[preset.playerClass], "Unknown preset class");
  const items = new Map(db.items.map((item) => [item.id, item]));
  const gear = globalThis.structuredClone(preset.gear);
  const changes = [];
  for (const [slot, spec] of gear.items.entries()) {
    if (!spec.id) continue;
    const problem = presetAcquisitionProblem(items.get(spec.id), sources.get(spec.id));
    if (problem) {
      const id =
        spec.id === 19999
          ? ["rogue", "enhancement_shaman"].includes(preset.profile)
            ? 13404
            : 22267
          : replacements.get(spec.id);
      const replacement = items.get(id);
      assert(replacement, `No reviewed non-raid replacement for ${preset.profile}/${spec.id}`);
      assert.equal(presetAcquisitionProblem(replacement, sources.get(id)), "");
      assert.equal(replacement.type, slotTypes[slot], "Replacement slot mismatch");
      assert((replacement.armorType ?? 0) <= armorLimits[preset.playerClass]);
      assert(
        !replacement.classAllowlist?.length ||
          replacement.classAllowlist.includes(preset.playerClass),
      );
      assert(!replacement.factionRestriction && !replacement.requiredProfession);
      const old = items.get(spec.id);
      if (slot === 14) assert.equal(replacement.handType, old.handType, "Weapon style changed");
      if (slot === 16)
        assert.equal(replacement.rangedWeaponType, old.rangedWeaponType, "Ammo type changed");
      changes.push({ slot, oldId: spec.id, id, reason: problem });
      spec.id = id;
    }
    if (!spec.enchant) continue;
    const item = items.get(spec.id);
    const fits = (entry) =>
      !prebisEnchantProblem(entry) && prebisEnchantFits(entry, item, preset.playerClass, slot);
    const choices = Object.values(inspection.enchants);
    if (choices.some((entry) => entry.effectId === spec.enchant && fits(entry))) continue;
    const caster = [
      "mage",
      "warlock",
      "shadow_priest",
      "smite_priest",
      "balance_druid",
      "elemental_shaman",
    ].includes(preset.profile);
    const alternatives =
      spec.enchant === 2504 ? [2568] : slot === 6 ? (caster ? [8719, 1843] : [1887]) : [];
    const effect = alternatives.find((id) =>
      choices.some((entry) => entry.effectId === id && fits(entry)),
    );
    assert(
      effect && choices.some((entry) => entry.effectId === effect && fits(entry)),
      `No non-raid enchant replacement for ${preset.profile}/${slot}/${spec.enchant}`,
    );
    changes.push({
      slot,
      oldEnchant: spec.enchant,
      enchant: effect,
      reason: "Raid-only enchant recipe",
    });
    spec.enchant = effect;
  }
  assert.deepEqual(auditPresetGear(gear, db, sources, inspection), []);
  return { gear, changes };
}
