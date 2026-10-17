import { eligiblePrebis, legalPrebisGear, prebisContext, prebisSlotTypes } from "./prebis-pool.mjs";
import { prebisEnchantFits, prebisEnchantPolicy } from "./prebis-enchants.mjs";
import { validationSeedPolicy } from "./simulation-seeds.mjs";

export function hasCurrentPrebisCoverage(
  result,
  baseline,
  db,
  sources,
  inspection,
  minimumIterations = 20000,
) {
  if (
    !Number.isSafeInteger(minimumIterations) ||
    minimumIterations < 20000 ||
    minimumIterations > 100000
  )
    return false;
  if (!result?.converged || result.candidateIdsBySlot?.length !== 17) return false;
  if (result.validationSeedPolicy !== validationSeedPolicy) return false;
  if (
    result.validation?.length !== 2 ||
    result.validation.some((row) =>
      [row.baseline, row.candidate].some(
        (metric) =>
          !Number.isSafeInteger(metric?.iterations) || metric.iterations < minimumIterations,
      ),
    )
  )
    return false;
  const items = new Map(db.items.map((item) => [item.id, item]));
  const context = prebisContext(baseline, items);
  if (!legalPrebisGear(result.gear, items, sources, context)) return false;
  const policy = prebisEnchantPolicy(baseline);
  const original = baseline.settings.player.equipment.items;
  for (const [slot, spec] of original.entries()) {
    const expected = spec.id
      ? db.items.filter((item) => eligiblePrebis(item, sources.get(item.id), context, slot))
      : [];
    const recorded = result.candidateIdsBySlot[slot];
    if (
      !Array.isArray(recorded) ||
      (!spec.id && recorded.length > 0) ||
      recorded.some(
        (id) => !Number.isSafeInteger(id) || items.get(id)?.type !== prebisSlotTypes[slot],
      )
    )
      return false;
    const recordedIds = new Set(recorded);
    // A tighter acquisition policy may remove unselected candidates. Every currently eligible
    // candidate must still have been tested; newly admitted items always require a new search.
    if (recordedIds.size !== recorded.length || expected.some((item) => !recordedIds.has(item.id)))
      return false;
  }
  const comparisons = result.comparisons;
  if (!Array.isArray(comparisons) || !comparisons.length) return false;
  if (comparisons.some((entry) => !Number.isSafeInteger(entry.pass) || entry.pass < 0))
    return false;
  const finalPass = Math.max(...comparisons.map((entry) => entry.pass));
  const final = comparisons.filter((entry) => entry.pass === finalPass);
  if (final.some((entry) => entry.accepted)) return false;
  for (const [slot, spec] of result.gear.items.entries()) {
    const item = items.get(spec.id);
    if (!item) continue;
    const effects = new Set([
      spec.enchant ?? 0,
      ...Object.values(inspection.enchants)
        .filter((entry) => prebisEnchantFits(entry, item, baseline.playerClass, slot, policy))
        .map((entry) => entry.effectId),
    ]);
    if (effects.size <= 1) continue;
    const sweep = final.find((entry) => entry.slots?.join("+") === `enchant:${slot}`);
    if (!sweep || sweep.screened !== effects.size) return false;
  }
  return true;
}
