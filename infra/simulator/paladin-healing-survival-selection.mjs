import assert from "node:assert/strict";

/** Prefer observed reserve within a fixed 1% fresh-training objective band; independent 2% confirmation remains required.
 * @param {object[]} candidates @returns {object}
 */
export function selectPaladinHealingSurvivalTraining(candidates) {
  assert(Array.isArray(candidates) && candidates.length > 0);
  const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  assert.equal(new Set(candidates.map((row) => row.optionId)).size, candidates.length);
  for (const row of candidates) {
    assert(typeof row.optionId === "string" && finite(row.meanMissingHealth));
    assert(Array.isArray(row.summaries) && row.summaries.length === 2);
    assert.equal(typeof row.feasible, "boolean");
    assert.equal(
      row.feasible,
      row.summaries.every((summary) => summary.feasible),
    );
    for (const summary of row.summaries) {
      assert.equal(typeof summary.feasible, "boolean");
      for (const field of ["manaBlockedSecondsMean", "finalMissingHealthMean", "meanMissingHealth"])
        assert(finite(summary[field]), "Invalid reserve metric: " + field);
    }
  }
  const survivors = candidates.filter((row) => row.feasible);
  assert(survivors.length > 0, "No fully surviving fresh-training candidate");
  const bestMeanMissingHealth = Math.min(...survivors.map((row) => row.meanMissingHealth)),
    bandWidth = Math.max(1, bestMeanMissingHealth) * 0.01,
    eligible = survivors.filter(
      (row) => row.meanMissingHealth - bestMeanMissingHealth <= bandWidth,
    ),
    worst = (row, field) => Math.max(...row.summaries.map((summary) => summary[field])),
    ordered = eligible.toSorted(
      (a, b) =>
        worst(a, "manaBlockedSecondsMean") - worst(b, "manaBlockedSecondsMean") ||
        worst(a, "finalMissingHealthMean") - worst(b, "finalMissingHealthMean") ||
        worst(a, "meanMissingHealth") - worst(b, "meanMissingHealth") ||
        a.meanMissingHealth - b.meanMissingHealth ||
        a.optionId.localeCompare(b.optionId),
    );
  return {
    selected: ordered[0],
    bestMeanMissingHealth,
    trainingRelativeBand: 0.01,
    bandCandidateIds: ordered.map((row) => row.optionId),
    independentConfirmationRequired: true,
    classQualified: false,
    publicationAllowed: false,
  };
}
