import assert from "node:assert/strict";
import { comparePairedHealingBatches } from "./healing-paired-comparison.mjs";
import { selectPaladinHealingHistoryAwareTraining } from "./paladin-healing-failure-history.mjs";

const validId = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const finite = (value) => Number.isFinite(value) && value >= 0;

/** Require four disjoint 512-fight batches outside the authenticated prior seed set.
 * @param {{rounds:{seed:number,iterations:number}[],excludedSeeds:number[]}} input
 * @returns {{seed:number,iterations:number}[]}
 */
export function paladinCoupledConfirmationRounds({ rounds, excludedSeeds }) {
  assert(Array.isArray(rounds) && rounds.length === 4);
  assert(Array.isArray(excludedSeeds));
  assert(excludedSeeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0));
  const previous = [...excludedSeeds];
  for (const round of rounds) {
    assert(Number.isSafeInteger(round.seed) && round.seed > 0);
    assert.equal(round.iterations, 512);
    assert(
      previous.every((seed) => Math.abs(seed - round.seed) >= 10000),
      "Confirmation seeds overlap an earlier batch",
    );
    previous.push(round.seed);
  }
  return structuredClone(rounds);
}

/** Freeze a training choice and a declared objective/diverse-gear comparison cohort.
 * Source authentication, full-build legality and actual request binding belong to the caller.
 * All training evidence stays represented; this never chooses from holdout results.
 * @param {{caseId:string,selectedOptionId:string|null,sourceSelectedOptionId:string,measurements:object[],failedGameplayKeys:Set<string>,plannedDamage:number,feedbackComplete:boolean}} input
 * @returns {object}
 */
export function freezePaladinCoupledConfirmationCase({
  caseId,
  selectedOptionId,
  sourceSelectedOptionId,
  measurements,
  failedGameplayKeys,
  plannedDamage,
  feedbackComplete,
}) {
  assert(typeof caseId === "string" && caseId.length > 0);
  assert(selectedOptionId === null || validId(selectedOptionId));
  assert(validId(sourceSelectedOptionId));
  assert.equal(typeof feedbackComplete, "boolean");
  // Reuse complete training validation while preserving the supplied frozen choice below.
  selectPaladinHealingHistoryAwareTraining({
    candidates: measurements,
    failedGameplayKeys,
    plannedIncomingDamage: plannedDamage,
  });
  for (const row of measurements) {
    assert(validId(row.gearId));
    assert(Array.isArray(row.requestKeys) && row.requestKeys.length === 2);
    assert(row.requestKeys.every(validId));
    assert.equal(new Set(row.requestKeys).size, 2, "Two genuine training batches are required");
  }
  const byId = new Map(measurements.map((row) => [row.optionId, row])),
    selected = selectedOptionId === null ? null : byId.get(selectedOptionId);
  assert(selectedOptionId === null || selected, "Missing frozen training choice");
  const status = !selected
      ? "no-survivor"
      : failedGameplayKeys.has(selected.gameplayKey)
        ? "known-failure"
        : !selected.feasible
          ? "failed-training"
          : !feedbackComplete
            ? "feedback-incomplete"
            : "ready",
    eligible = measurements.filter(
      (row) => row.feasible && !failedGameplayKeys.has(row.gameplayKey),
    ),
    ranked = eligible.toSorted(
      (a, b) => a.meanMissingHealth - b.meanMissingHealth || a.optionId.localeCompare(b.optionId),
    ),
    cohort = new Map();
  assert(
    selectedOptionId !== null || eligible.length === 0,
    "Missing frozen choice despite an admissible training survivor",
  );
  function add(row, reason) {
    if (!row) return;
    if (!cohort.has(row.optionId))
      cohort.set(row.optionId, {
        optionId: row.optionId,
        gearId: row.gearId,
        gameplayKey: row.gameplayKey,
        trainingRequestKeys: [...row.requestKeys],
        reasons: [],
      });
    cohort.get(row.optionId).reasons.push(reason);
  }
  if (status === "ready") {
    add(selected, "frozen-training-choice");
    add(
      eligible.find((row) => row.optionId === sourceSelectedOptionId),
      "original-incumbent",
    );
    const objectives = new Set();
    for (const row of ranked) {
      if (objectives.has(row.gameplayKey)) continue;
      objectives.add(row.gameplayKey);
      add(row, "top-eight-distinct-training-objectives");
      if (objectives.size === 8) break;
    }
    const gears = new Set();
    for (const row of ranked) {
      if (gears.has(row.gearId)) continue;
      gears.add(row.gearId);
      add(row, "top-five-distinct-gears");
      if (gears.size === 5) break;
    }
  }
  const sourceIncumbent = byId.get(sourceSelectedOptionId),
    sourceIncumbentStatus = !sourceIncumbent
      ? "not-in-training-domain"
      : failedGameplayKeys.has(sourceIncumbent.gameplayKey)
        ? "known-failure"
        : !sourceIncumbent.feasible
          ? "failed-training"
          : "included-if-ready";
  return {
    schema: "kfc-paladin-coupled-confirmation-case.v1",
    caseId,
    status,
    selectedOptionId,
    selectedFrozenFromTraining: true,
    sourceSelectedOptionId,
    sourceIncumbentStatus,
    plannedDamage,
    feedbackComplete,
    candidates: [...cohort.values()],
    trainingCandidateIds: measurements.map((row) => row.optionId),
    trainingCandidatesOutsideCohort: measurements
      .filter((row) => !cohort.has(row.optionId))
      .map((row) => row.optionId),
    excludedKnownFailures: measurements
      .filter((row) => failedGameplayKeys.has(row.gameplayKey))
      .map((row) => ({ optionId: row.optionId, gameplayKey: row.gameplayKey })),
    cohortPolicy: {
      objectiveLeaders: 8,
      objectiveLeadersUseDistinctGameplay: true,
      distinctGearLeaders: 5,
      includesAdmissibleSourceIncumbent: true,
      availableAdmissibleGears: new Set(eligible.map((row) => row.gearId)).size,
      allTrainingEvidenceRetained: true,
      globalOptimalityClaim: false,
    },
    independentConfirmationRequired: true,
    classQualified: false,
    publicationAllowed: false,
  };
}

function validateSummary(summary, plannedDamage, durationSeconds) {
  for (const name of [
    "survivalRate",
    "hps",
    "hpsStdev",
    "absorbedHps",
    "effectiveHealingHps",
    "missingHealthSecondsMean",
    "finalMissingHealthMean",
    "manaRemainingMean",
    "manaBlockedSecondsMean",
    "deliveredIncomingDamageMean",
    "meanMissingHealth",
  ])
    assert(finite(summary[name]), "Invalid confirmation metric: " + name);
  const tolerance = Math.max(1, plannedDamage) * 1e-7;
  assert(summary.survivalRate <= 1);
  assert(summary.deliveredIncomingDamageMean <= plannedDamage + tolerance);
  assert.equal(
    summary.feasible,
    summary.survivalRate === 1 &&
      Math.abs(summary.deliveredIncomingDamageMean - plannedDamage) <= tolerance,
  );
  assert(
    Math.abs(summary.meanMissingHealth * durationSeconds - summary.missingHealthSecondsMean) <=
      Math.max(1, summary.missingHealthSecondsMean) * 1e-7,
    "Confirmation duration and missing-health summary disagree",
  );
}

/** Compare fresh results against a frozen choice; never replace it with a validation winner.
 * Caller must authenticate native origins and bind every request to these exact rounds/builds.
 * @param {{plan:object,rounds:{seed:number,iterations:number}[],excludedSeeds:number[],durationSeconds:number,reviewed:object[]}} input
 * @returns {object}
 */
export function assessPaladinCoupledConfirmation({
  plan,
  rounds,
  excludedSeeds,
  durationSeconds,
  reviewed,
}) {
  assert.equal(plan.schema, "kfc-paladin-coupled-confirmation-case.v1");
  assert.equal(plan.status, "ready", "Incomplete feedback cannot enter confirmation");
  assert.equal(plan.selectedFrozenFromTraining, true);
  assert.equal(plan.feedbackComplete, true);
  assert(finite(plan.plannedDamage) && plan.plannedDamage > 0);
  assert(finite(durationSeconds) && durationSeconds > 0);
  const actualRounds = paladinCoupledConfirmationRounds({ rounds, excludedSeeds });
  assert(Array.isArray(reviewed) && reviewed.length === plan.candidates.length);
  assert(reviewed.length > 0);
  assert.equal(new Set(plan.candidates.map((row) => row.optionId)).size, plan.candidates.length);
  const trainingOrigins = new Set(plan.candidates.flatMap((row) => row.trainingRequestKeys));
  const observedOrigins = new Map();
  const results = reviewed.map((row, index) => {
    const candidate = plan.candidates[index];
    assert.equal(row.optionId, candidate.optionId, "Missing or reordered confirmation candidate");
    assert.equal(row.gearId, candidate.gearId);
    assert.equal(row.gameplayKey, candidate.gameplayKey);
    assert.deepEqual(row.rounds, actualRounds);
    assert.equal(row.iterations, 2048);
    assert(Array.isArray(row.requestKeys) && row.requestKeys.length === 4);
    assert(row.requestKeys.every(validId));
    assert.equal(new Set(row.requestKeys).size, 4, "Four actual request origins are required");
    assert(
      !row.requestKeys.some((key) => trainingOrigins.has(key)),
      "Training origin reused as holdout",
    );
    assert(Array.isArray(row.summaries) && row.summaries.length === 4);
    for (const [position, summary] of row.summaries.entries()) {
      validateSummary(summary, plan.plannedDamage, durationSeconds);
      const key = row.requestKeys[position],
        previous = observedOrigins.get(key);
      if (previous) {
        assert.equal(previous.position, position, "One origin cannot represent different seeds");
        assert.equal(previous.gameplayKey, row.gameplayKey, "Shared origins have different setups");
        assert.deepEqual(previous.summary, summary, "Shared origins have different metrics");
      } else observedOrigins.set(key, { position, summary, gameplayKey: row.gameplayKey });
    }
    const feasible = row.summaries.every((summary) => summary.feasible);
    assert.equal(row.feasible, feasible);
    return { ...row, feasible, batches: row.summaries.map((summary) => summary.meanMissingHealth) };
  });
  const selected = results[0];
  assert.equal(selected.optionId, plan.selectedOptionId, "Frozen training choice changed");
  const comparisons = results.slice(1).map((row) => ({
      optionId: row.optionId,
      contenderFeasible: row.feasible,
      sameNumericalInputs: row.requestKeys.every(
        (key, index) => key === selected.requestKeys[index],
      ),
      ...comparePairedHealingBatches(selected.batches, row.batches),
    })),
    eligible = comparisons.filter((row) => row.contenderFeasible && !row.sameNumericalInputs),
    passes = (threshold, interval) =>
      selected.feasible &&
      eligible.length > 0 &&
      eligible.every(
        (row) => (interval ? row.monteCarlo95Interval[1] : row.relativeDifference) <= threshold,
      );
  return {
    caseId: plan.caseId,
    selectedOptionId: plan.selectedOptionId,
    selected,
    reviewed: results,
    comparisons,
    noSurvivingComparator: eligible.length === 0,
    distinctSurvivingComparators: eligible.length,
    observedPractical2Percent: passes(0.02, false),
    observedStrict1Percent: passes(0.01, false),
    perComparison95UpperWithin2Percent: passes(0.02, true),
    perComparison95UpperWithin1Percent: passes(0.01, true),
    largestPerComparison95Upper: eligible.length
      ? Math.max(...eligible.map((row) => row.monteCarlo95Interval[1]))
      : null,
    intervalScope: "Per-comparison four-batch Monte Carlo interval; not simultaneous or global",
    independentComparisonComplete: true,
    reselectionPerformed: false,
    fullFailureHistoryAuditRequired: true,
    classQualified: false,
    publicationAllowed: false,
  };
}
