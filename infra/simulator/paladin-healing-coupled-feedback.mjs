import assert from "node:assert/strict";

/** Select exploratory gear seeds from completed training, never approve an infeasible plan.
 * External-demand delivery and survival precede missing-health/reserve comparisons;
 * raw HPS and self-healing cannot improve this diagnostic ranking.
 * @param {{result:object,plannedDamage:number,maximumDistinctGears?:number}} input
 * @returns {object}
 */
export function selectPaladinCoupledTrainingSeeds({
  result,
  plannedDamage,
  maximumDistinctGears = 3,
}) {
  assert(Number.isFinite(plannedDamage) && plannedDamage > 0);
  assert(
    Number.isInteger(maximumDistinctGears) &&
      maximumDistinctGears >= 1 &&
      maximumDistinctGears <= 5,
  );
  assert(Array.isArray(result.measured) && result.measured.length > 0);
  const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const rows = result.measured.map((row) => {
    assert(/^[a-f0-9]{64}$/.test(row.optionId) && /^[a-f0-9]{64}$/.test(row.gearId));
    assert(Array.isArray(row.summaries) && row.summaries.length === 2);
    assert.equal(
      row.feasible,
      row.summaries.every((summary) => summary.feasible),
    );
    for (const summary of row.summaries) {
      for (const key of [
        "survivalRate",
        "deliveredIncomingDamageMean",
        "meanMissingHealth",
        "manaBlockedSecondsMean",
        "finalMissingHealthMean",
      ])
        assert(finite(summary[key]), "Invalid coupled seed metric: " + key);
      assert(summary.survivalRate <= 1);
      assert(
        summary.deliveredIncomingDamageMean <= plannedDamage + Math.max(1, plannedDamage) * 1e-7,
      );
      assert.equal(
        summary.feasible,
        summary.survivalRate === 1 &&
          Math.abs(summary.deliveredIncomingDamageMean - plannedDamage) <=
            Math.max(1, plannedDamage) * 1e-7,
      );
    }
    return {
      optionId: row.optionId,
      gearId: row.gearId,
      feasible: row.feasible,
      worstSurvivalRate: Math.min(...row.summaries.map((summary) => summary.survivalRate)),
      leastDeliveredDemandFraction: Math.min(
        ...row.summaries.map((summary) => summary.deliveredIncomingDamageMean / plannedDamage),
      ),
      worstMeanMissingHealth: Math.max(
        ...row.summaries.map((summary) => summary.meanMissingHealth),
      ),
      worstManaBlockedSeconds: Math.max(
        ...row.summaries.map((summary) => summary.manaBlockedSecondsMean),
      ),
      worstFinalMissingHealth: Math.max(
        ...row.summaries.map((summary) => summary.finalMissingHealthMean),
      ),
    };
  });
  assert.equal(new Set(rows.map((row) => row.optionId)).size, rows.length);
  const byId = new Map(rows.map((row) => [row.optionId, row]));
  assert(byId.has(result.sourceSelectedOptionId), "The original incumbent must remain in training");
  const anyFeasible = rows.some((row) => row.feasible);
  assert.equal(Boolean(result.selected), anyFeasible);
  if (result.selected) {
    assert(byId.get(result.selected.optionId)?.feasible);
    assert.deepEqual(
      result.selected,
      result.measured.find((row) => row.optionId === result.selected.optionId),
    );
  }
  const ranked = rows.toSorted(
    (a, b) =>
      Number(b.feasible) - Number(a.feasible) ||
      b.worstSurvivalRate - a.worstSurvivalRate ||
      b.leastDeliveredDemandFraction - a.leastDeliveredDemandFraction ||
      a.worstMeanMissingHealth - b.worstMeanMissingHealth ||
      a.worstManaBlockedSeconds - b.worstManaBlockedSeconds ||
      a.worstFinalMissingHealth - b.worstFinalMissingHealth ||
      a.optionId.localeCompare(b.optionId),
  );
  const seeds = [],
    gears = new Set();
  function add(row, reason) {
    const previous = seeds.find((seed) => seed.optionId === row.optionId);
    if (previous) {
      previous.reasons.push(reason);
      return;
    }
    seeds.push({ ...row, reasons: [reason], feedbackOnly: true, recommendation: false });
    gears.add(row.gearId);
  }
  if (result.selected) add(byId.get(result.selected.optionId), "fresh-training-selected");
  for (const row of ranked) {
    if (gears.size >= maximumDistinctGears) break;
    if (!gears.has(row.gearId)) add(row, "distinct-gear-training-seed");
  }
  add(byId.get(result.sourceSelectedOptionId), "original-three-minute-incumbent");
  assert(seeds.length <= maximumDistinctGears + 1);
  return {
    seeds,
    sourceTrainingWinnerId: result.selected?.optionId ?? null,
    noSourceSurvivors: !anyFeasible,
    plannedDamage,
    feedbackOnly: true,
    requiresFinalTrainingSource: true,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
