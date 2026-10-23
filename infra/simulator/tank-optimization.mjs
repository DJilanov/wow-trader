import assert from "node:assert/strict";
import { eligiblePrebis, legalPrebisGear, prebisSetSubsets } from "./prebis-pool.mjs";
import { carryCompatibleEnchants, prebisEnchantFits } from "./prebis-enchants.mjs";
import { tankStarterDefinitions } from "./tank-starters-adapter.mjs";

export function admitPublishedTankSources(sources, profile, published, items) {
  const definition = tankStarterDefinitions[profile];
  assert(definition, "Unknown tank starter");
  assert.deepEqual(published.core, definition.core, "Published starter admission changed");
  const added = [];
  for (const id of definition.core) {
    const item = items.get(id);
    assert(
      item &&
        item.classAllowlist?.includes(definition.playerClass) &&
        item.quality === 3 &&
        item.ilvl === 60,
      `Invalid published tank armor ${id}`,
    );
    if (sources.has(id)) continue;
    // These exact client-verified armor IDs were admitted separately from the
    // source-filtered general catalog. Preserve their provisional vendor access.
    const source = {
      id,
      requiredLevel: 60,
      sources: [{ kind: "pvp" }],
      acquisitionProvenance: "published-starter-provisional",
      acquisition:
        "Published client-verified tank armor; vendor access and phase unlocks remain provisional.",
    };
    sources.set(id, source);
    added.push(source);
  }
  return added;
}

export const tankSearchPolicy = Object.freeze({
  schema: "kfc-tank-item-search-policy.v1",
  screeningIterations: 80,
  shortlistIterations: 500,
  selectionIterations: 2000,
  validationIterations: 20000,
  searchSeed: 78491001,
  validationSeeds: [81491001, 82491001],
  maximumPasses: 6,
  objectives: ["threat", "mitigation"],
  minimumGain: { threat: 0.1, mitigation: 0.1 },
  notice:
    "All admitted eligible items, legal jewelry and weapon/shield pairs, set subsets and compatible pre-raid enchants. Fixed talents, rotation, race and professions. Threat maximizes TPS; mitigation minimizes physical DTPS. Report health and armor alongside both objectives; an optional explicit starter-HP floor is a separate constrained search. Independent seeds confirm gains. No overall tank score or exhaustive global-BiS claim.",
});

export function tankSearchMetric(result, objective) {
  assert(tankSearchPolicy.objectives.includes(objective), "Unknown tank objective");
  const metric = result.metrics?.[objective === "threat" ? "threat" : "dtps"];
  assert(
    Number.isFinite(metric?.avg) &&
      metric.avg > 0 &&
      Number.isFinite(metric.stdev) &&
      metric.stdev >= 0 &&
      Number.isSafeInteger(result.iterations) &&
      result.iterations > 0 &&
      Number.isFinite(result.health) &&
      result.health > 0,
    "Invalid tank search metrics",
  );
  return { avg: metric.avg, stdev: metric.stdev, iterations: result.iterations };
}

export function tankObjectiveScore(result, objective, minimumHealth) {
  const metric = tankSearchMetric(result, objective);
  if (result.health + 0.001 < minimumHealth) return -Infinity;
  return objective === "threat" ? metric.avg : -metric.avg;
}

export function tankImprovement(
  candidate,
  baseline,
  objective,
  minimumHealth,
  independent = false,
) {
  const gain =
    tankObjectiveScore(candidate, objective, minimumHealth) -
    tankObjectiveScore(baseline, objective, minimumHealth);
  const a = tankSearchMetric(candidate, objective),
    b = tankSearchMetric(baseline, objective);
  const margin = independent
    ? 1.96 * Math.sqrt(a.stdev ** 2 / a.iterations + b.stdev ** 2 / b.iterations)
    : 0;
  return gain > Math.max(tankSearchPolicy.minimumGain[objective], margin);
}

export function shortlistTankCandidates(results, objective, minimumHealth, minimumCount) {
  assert(Number.isSafeInteger(minimumCount) && minimumCount > 0);
  const ordered = results
    .filter((result) => tankObjectiveScore(result, objective, minimumHealth) > -Infinity)
    .sort(
      (a, b) =>
        tankObjectiveScore(b, objective, minimumHealth) -
        tankObjectiveScore(a, objective, minimumHealth),
    );
  if (!ordered.length) return [];
  const best = tankSearchMetric(ordered[0], objective);
  const bestScore = tankObjectiveScore(ordered[0], objective, minimumHealth);
  return ordered.filter((result, index) => {
    const metric = tankSearchMetric(result, objective);
    const margin =
      1.96 * Math.sqrt(best.stdev ** 2 / best.iterations + metric.stdev ** 2 / metric.iterations);
    return (
      index < minimumCount ||
      bestScore - tankObjectiveScore(result, objective, minimumHealth) <= margin
    );
  });
}

export function tankCandidatePools(db, sources, context) {
  return context.originalItems.map((original, slot) =>
    original
      ? db.items
          .filter((item) => eligiblePrebis(item, sources.get(item.id), context, slot))
          .sort((a, b) => a.id - b.id)
      : [],
  );
}

export function tankSearchGroups(pools) {
  return [
    ["sets"],
    ...Array.from({ length: 10 }, (_, slot) => [slot]),
    [14],
    [15],
    [16],
    ...(pools[15].length ? [[14, 15]] : []),
    ["sets"],
    [10, 11],
    [12, 13],
    ...Array.from({ length: 17 }, (_, slot) => [`enchant:${slot}`]),
  ];
}

export function tankGearProposals(current, group, pools, db, sources, context, inspection, policy) {
  const items = new Map(db.items.map((item) => [item.id, item]));
  const proposals = [],
    seen = new Set();
  const propose = (gear) => {
    if (!legalPrebisGear(gear, items, sources, context)) return;
    const next = carryCompatibleEnchants(
      gear,
      current,
      context.playerClass,
      db,
      inspection,
      policy,
    );
    const key = JSON.stringify(next.items);
    if (!seen.has(key)) {
      seen.add(key);
      proposals.push(next);
    }
  };
  propose(current);
  const change = (entries) => {
    const gear = globalThis.structuredClone(current);
    for (const [slot, item] of entries) gear.items[slot] = { id: item.id };
    propose(gear);
  };
  if (group[0] === "sets") {
    const sets = new Map();
    for (const [slot, pool] of pools.entries())
      for (const item of pool) {
        if (!item.setId) continue;
        const slots = sets.get(item.setId) ?? new Map();
        const alternatives = slots.get(slot) ?? [];
        alternatives.push(item);
        slots.set(slot, alternatives);
        sets.set(item.setId, slots);
      }
    // Keep every eligible item variant within a set; no EP filter hides a candidate.
    const combinations = (slots, index, selected) => {
      if (index === slots.length) {
        change(selected);
        return;
      }
      const [slot, alternatives] = slots[index];
      for (const item of alternatives) combinations(slots, index + 1, [...selected, [slot, item]]);
    };
    for (const slots of sets.values())
      for (const subset of prebisSetSubsets([...slots])) combinations(subset, 0, []);
  } else if (typeof group[0] === "string") {
    assert(/^enchant:\d+$/.test(group[0]), "Unknown search group");
    const slot = Number(group[0].slice(8)),
      item = items.get(current.items[slot].id);
    if (item)
      for (const enchant of Object.values(inspection.enchants)) {
        if (!prebisEnchantFits(enchant, item, context.playerClass, slot, policy)) continue;
        const gear = globalThis.structuredClone(current);
        gear.items[slot].enchant = enchant.effectId;
        propose(gear);
      }
  } else if (group.length === 2) {
    for (const a of pools[group[0]])
      for (const b of pools[group[1]])
        change([
          [group[0], a],
          [group[1], b],
        ]);
  } else {
    for (const item of pools[group[0]]) change([[group[0], item]]);
  }
  return proposals;
}
