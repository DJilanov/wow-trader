import { defaultEnchantFits } from "./default-enchants.mjs";
import { enchantKey } from "./inspection-data.mjs";
import { prebisEnchantProblem } from "./enchant-acquisition.mjs";

const deterministicEffects = new Set([
  32, 33, 34, 241, 249, 250, 663, 664, 805, 853, 854, 931, 943, 1897, 2523, 2543, 2613, 2621, 8720,
  8721,
]);
export const provisionalPrebisEffectIds = [36, 803, 1898, 1900];

export function prebisEnchantPolicy(baseline) {
  const policy = baseline.enchantPolicy ?? {
    schema: "kfc-enchant-model-policy.v1",
    provisionalEffectIds: [],
  };
  if (
    policy.schema !== "kfc-enchant-model-policy.v1" ||
    !Array.isArray(policy.provisionalEffectIds) ||
    new Set(policy.provisionalEffectIds).size !== policy.provisionalEffectIds.length ||
    policy.provisionalEffectIds.some((id) => !provisionalPrebisEffectIds.includes(id))
  )
    throw new Error("Unreviewed provisional enchant policy");
  return policy;
}

export function prebisEnchantFits(enchant, item, playerClass, slot, policy) {
  const provisional =
    enchant.status === "provisional" &&
    provisionalPrebisEffectIds.includes(enchant.effectId) &&
    policy?.schema === "kfc-enchant-model-policy.v1" &&
    Array.isArray(policy.provisionalEffectIds) &&
    policy.provisionalEffectIds.includes(enchant.effectId);
  const deterministic = enchant.status === "scripted" && deterministicEffects.has(enchant.effectId);
  // Reuse mechanical slot/level restrictions only; the original provisional
  // status is retained in every result and never becomes a verified static bonus.
  return (
    !prebisEnchantProblem(enchant) &&
    defaultEnchantFits(
      provisional || deterministic ? { ...enchant, status: "static" } : enchant,
      item,
      playerClass,
      slot,
    )
  );
}

export function carryCompatibleEnchants(proposal, incumbent, playerClass, db, inspection, policy) {
  const result = globalThis.structuredClone(proposal);
  for (const [slot, spec] of result.items.entries()) {
    const effectId = incumbent.items[slot]?.enchant;
    if (spec.enchant || !spec.id || !effectId) continue;
    const item = db.items.find((item) => item.id === spec.id);
    if (
      item &&
      Object.values(inspection.enchants).some(
        (enchant) =>
          enchant.effectId === effectId &&
          prebisEnchantFits(enchant, item, playerClass, slot, policy),
      )
    )
      spec.enchant = effectId;
  }
  return result;
}

export function describePrebisGear(gear, profile, variant, playerClass, db, inspection, policy) {
  if (gear.items?.length !== 17) throw new Error("Invalid optimized equipment slots");
  const choices = [],
    enchantTotals = Array(44).fill(0);
  for (const [slot, spec] of gear.items.entries()) {
    if (!spec.enchant) continue;
    const item = db.items.find((item) => item.id === spec.id);
    const candidates = Object.values(inspection.enchants)
      .filter(
        (entry) =>
          entry.effectId === spec.enchant &&
          item &&
          prebisEnchantFits(entry, item, playerClass, slot, policy),
      )
      .sort(
        (a, b) => (a.spellId || 0) - (b.spellId || 0) || enchantKey(a).localeCompare(enchantKey(b)),
      );
    if (!candidates.length)
      throw new Error(
        `Unreviewed or incompatible optimized enchant ${spec.enchant} in slot ${slot}`,
      );
    const enchant = candidates[0];
    // Several acquisition spells can apply the same engine enchant effect.
    if (
      candidates.some(
        (entry) =>
          entry.status !== enchant.status ||
          JSON.stringify(entry.stats) !== JSON.stringify(enchant.stats),
      )
    )
      throw new Error(`Conflicting optimized enchant recipes ${spec.enchant} in slot ${slot}`);
    const provisional = enchant.status === "provisional";
    if (provisional && enchant.stats.some((value) => value !== 0))
      throw new Error("A provisional proc cannot also supply unevaluated static stats");
    const engineEffect = provisional || enchant.status === "scripted";
    if (
      (!engineEffect && enchant.stats.length !== 44) ||
      (engineEffect && ![0, 44].includes(enchant.stats.length)) ||
      enchant.stats.some((value) => !Number.isFinite(value))
    )
      throw new Error("Invalid optimized enchant stats");
    choices.push({
      gearIndex: slot,
      itemId: spec.id,
      key: enchantKey(enchant),
      effectId: enchant.effectId,
      name: enchant.name,
      status: enchant.status,
      ...(candidates.length > 1 ? { recipeKeys: candidates.map(enchantKey) } : {}),
    });
    enchant.stats.forEach((value, index) => {
      enchantTotals[index] += value;
    });
  }
  if (choices.length < 9) throw new Error("Incomplete optimized enchants");
  return {
    profile,
    variant,
    playerClass,
    gear: globalThis.structuredClone(gear),
    choices,
    enchantTotals,
    enchantPolicy: policy ?? prebisEnchantPolicy({}),
  };
}
