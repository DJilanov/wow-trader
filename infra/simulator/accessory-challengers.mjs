import assert from "node:assert/strict";
import { eligiblePrebis, legalPrebisGear, prebisContext } from "./prebis-pool.mjs";
import { simulationHash } from "./simulation-cache.mjs";
import { assertIndependentSeedRanges } from "./simulation-seeds.mjs";

export function createAccessoryChallenges(baseline, db, sources, kind) {
  assert(["rings", "trinkets"].includes(kind), "Choose rings or trinkets");
  const slots = kind === "rings" ? [10, 11] : [12, 13];
  const items = new Map(db.items.map((item) => [item.id, item]));
  const context = prebisContext(baseline, items);
  const incumbent = baseline.settings.player.equipment;
  assert(legalPrebisGear(incumbent, items, sources, context), "Illegal incumbent equipment");
  assert(
    incumbent.items.every((spec) =>
      Object.keys(spec).every((key) => ["id", "enchant"].includes(key)),
    ),
    "Unreviewed equipment-spec fields",
  );
  assert(
    slots.every((slot) => !incumbent.items[slot].enchant),
    "Accessory enchants need a reviewed compatibility policy",
  );
  const pools = slots.map((slot) =>
    db.items
      .filter((item) => eligiblePrebis(item, sources.get(item.id), context, slot))
      .sort((a, b) => a.id - b.id),
  );
  const candidates = new Map();
  const propose = (gear) => {
    if (!legalPrebisGear(gear, items, sources, context)) return;
    const pair = slots.map((slot) => gear.items[slot].id).join(",");
    if (!candidates.has(pair))
      candidates.set(pair, {
        id: simulationHash(gear),
        gear,
        itemIds: slots.map((slot) => gear.items[slot].id),
      });
  };
  propose(globalThis.structuredClone(incumbent));
  for (const first of pools[0])
    for (const second of pools[1]) {
      const gear = globalThis.structuredClone(incumbent);
      gear.items[slots[0]] = { id: first.id };
      gear.items[slots[1]] = { id: second.id };
      propose(gear);
    }
  return {
    kind,
    slots,
    incumbentId: simulationHash(incumbent),
    eligibleIdsBySlot: pools.map((pool) => pool.map((item) => item.id)),
    candidates: [...candidates.values()],
  };
}

function assertMetric(metric, iterations) {
  assert(metric && Number.isFinite(metric.dps) && metric.dps > 0);
  assert(Number.isFinite(metric.stdev) && metric.stdev >= 0);
  assert.equal(metric.iterations, iterations, "Unexpected challenger precision");
}

const standardError = (a, b) =>
  Math.sqrt(a.stdev ** 2 / a.iterations + b.stdev ** 2 / b.iterations);

export function shortlistAccessoryChallenges(rows, incumbentId) {
  assert(rows.length > 0);
  assert.equal(new Set(rows.map((row) => row.challenge.id)).size, rows.length);
  const incumbent = rows.find((row) => row.challenge.id === incumbentId);
  assert(incumbent, "Missing incumbent screening result");
  rows.forEach((row) => assertMetric(row, 2000));
  return rows
    .filter(
      (row) => row !== incumbent && incumbent.dps - row.dps <= 4 * standardError(incumbent, row),
    )
    .sort((a, b) => b.dps - a.dps || a.challenge.id.localeCompare(b.challenge.id));
}

export function accessoryChallengeVerdict(validation) {
  assert.equal(validation.length, 2, "Two independent challenger ranges required");
  const comparisons = validation.map(({ seed, baseline, candidate }) => {
    assertMetric(baseline, 100000);
    assertMetric(candidate, 100000);
    return {
      seed,
      baseline: { dps: baseline.dps, stdev: baseline.stdev, iterations: baseline.iterations },
      candidate: { dps: candidate.dps, stdev: candidate.stdev, iterations: candidate.iterations },
      difference: candidate.dps - baseline.dps,
      threshold: Math.max(0.001, 3 * standardError(baseline, candidate)),
    };
  });
  assertIndependentSeedRanges(comparisons.map((row) => ({ seed: row.seed, iterations: 100000 })));
  return {
    confirmed: comparisons.every((row) => row.difference > row.threshold),
    averageDpsDifference:
      comparisons.reduce((sum, row) => sum + row.difference, 0) / comparisons.length,
    comparisons,
    notice:
      "Three-standard-error improvement required in BOTH disjoint ranges. This is a conservative modeled comparison, not proof of global BiS, a simultaneous confidence guarantee, or server verification. Non-significant differences remain uncertain.",
  };
}

export function accessoryConfirmationResults(results, seeds, candidateCount) {
  assert.equal(seeds.length, 2);
  assertIndependentSeedRanges(seeds.map((seed) => ({ seed, iterations: 100000 })));
  assert(Number.isSafeInteger(candidateCount) && candidateCount >= 0);
  const width = candidateCount + 1;
  assert.equal(results.length, width * 2, "Incomplete accessory confirmation batch");
  results.forEach((result) => assertMetric(result, 100000));
  return Array.from({ length: candidateCount }, (_, index) =>
    accessoryChallengeVerdict(
      seeds.map((seed, range) => ({
        seed,
        baseline: results[range * width],
        candidate: results[range * width + index + 1],
      })),
    ),
  );
}
