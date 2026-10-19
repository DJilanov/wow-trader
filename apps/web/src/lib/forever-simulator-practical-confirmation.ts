export const practicalSimulatorConfirmationPolicy = Object.freeze({
  version: "practical-first-pass-confirmation.v1",
  iterations: 20000,
  ranges: 2,
  reservedRangeIterations: 100000,
  inspectedIterations: 10000,
  inspectedSeed: 77191,
  maximumArms: 12,
  maximumRetainedGapFraction: 0.01,
  standardErrorMultiplier: 3,
});

export interface PracticalSimulatorConfirmationPolicy {
  readonly version: string;
  readonly iterations: number;
  readonly ranges: number;
  readonly reservedRangeIterations: number;
  readonly inspectedIterations: number;
  readonly inspectedSeed: number;
  readonly maximumArms: number;
  readonly maximumRetainedGapFraction: number;
  readonly standardErrorMultiplier: number;
}
export interface PracticalSimulatorMetric {
  readonly id: string;
  readonly dps: number;
  readonly stdev: number;
  readonly iterations: number;
}
export interface PracticalSimulatorConfirmationRecord {
  readonly seed: number;
  readonly arm: string;
  readonly metric: PracticalSimulatorMetric;
}
export interface PracticalSimulatorConfirmationPlan {
  readonly arms: readonly { readonly name: string; readonly category: string }[];
  readonly policy: PracticalSimulatorConfirmationPolicy;
  readonly seeds: readonly number[];
  readonly requestIds: readonly string[];
  readonly inspectedSeedRanges: readonly { readonly seed: number; readonly iterations: number }[];
}
export interface PracticalSimulatorComparisonRange {
  readonly seed: number;
  readonly selected: PracticalSimulatorMetric;
  readonly contender: PracticalSimulatorMetric;
  readonly difference: number;
  readonly standardError: number;
  readonly threshold: number;
  readonly conservativeGapFraction: number;
}
export interface PracticalSimulatorComparison {
  readonly arm: string;
  readonly category: string;
  readonly ranges: readonly PracticalSimulatorComparisonRange[];
  readonly challengerConfirmedBetter: boolean;
  readonly selectedConfirmedBetter: boolean;
  readonly averageChallengerDpsDifference: number;
  readonly largestConservativeGapFraction: number;
}
export interface PracticalSimulatorConfirmationMath {
  readonly status:
    | "accepted-practical-first-pass"
    | "accepted-with-disclosed-nearby-gains"
    | "material-challenger-or-uncertainty-needs-correction";
  readonly accepted: boolean;
  readonly strictRetainedDominancePassed: boolean;
  readonly selectedArm: string;
  readonly selectedDps: number;
  readonly selectedIterations: number;
  readonly iterationsPerRange: number;
  readonly largestConservativeRetainedGapFraction: number;
  readonly maximumRetainedGapFraction: number;
  readonly comparisons: readonly PracticalSimulatorComparison[];
}

function requireMatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Recomputes comparison math only; the delivery reader must authenticate source/wire/model/legality evidence. */
export function evaluatePracticalSimulatorConfirmation(
  plan: PracticalSimulatorConfirmationPlan,
  records: readonly PracticalSimulatorConfirmationRecord[],
): PracticalSimulatorConfirmationMath {
  const policy = practicalSimulatorConfirmationPolicy;
  requireMatch(
    Object.keys(plan.policy).length === Object.keys(policy).length &&
      Object.entries(policy).every(
        ([key, value]) => plan.policy[key as keyof PracticalSimulatorConfirmationPolicy] === value,
      ),
    "Practical confirmation policy or sample precision changed",
  );
  const width = plan.arms.length,
    selectedArm = plan.arms[0];
  requireMatch(
    width >= 2 && width <= policy.maximumArms && selectedArm?.category === "selected",
    "Missing frozen selected incumbent",
  );
  const categories = new Set([
    "selected",
    "gear",
    "enchant",
    "talent",
    "rotation",
    "poison",
    "family",
  ]);
  requireMatch(
    plan.arms.filter((arm) => arm.category === "selected").length === 1 &&
      new Set(plan.arms.map((arm) => arm.name)).size === width &&
      plan.arms.every(
        (arm) => /^[a-z][a-z0-9:_-]{0,79}$/.test(arm.name) && categories.has(arm.category),
      ),
    "Invalid or duplicate confirmation arms",
  );
  requireMatch(plan.seeds.length === policy.ranges, "Two confirmation ranges are required");
  const ranges = [
    ...plan.inspectedSeedRanges,
    ...plan.seeds.map((seed) => ({ seed, iterations: policy.reservedRangeIterations })),
  ]
    .map((range) => {
      requireMatch(
        Number.isSafeInteger(range.seed) &&
          range.seed > 0 &&
          Number.isSafeInteger(range.iterations) &&
          range.iterations > 0 &&
          Number.isSafeInteger(range.seed + range.iterations),
        "Invalid confirmation RNG range",
      );
      return { start: range.seed, end: range.seed + range.iterations };
    })
    .sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index++) {
    const previous = ranges[index - 1],
      current = ranges[index];
    requireMatch(
      previous && current && previous.end <= current.start,
      "Confirmation RNG overlaps previously inspected ranges",
    );
  }
  requireMatch(
    records.length === width * policy.ranges &&
      plan.requestIds.length === records.length &&
      new Set(plan.requestIds).size === records.length &&
      new Set(records.map((row) => row.metric.id)).size === records.length,
    "Missing, duplicate or extra confirmation records",
  );
  for (const [index, row] of records.entries()) {
    const arm = plan.arms[index % width],
      metric = row.metric;
    requireMatch(
      row.arm === arm?.name && row.seed === plan.seeds[Math.floor(index / width)],
      "Confirmation record order or seed changed",
    );
    requireMatch(
      /^[a-f0-9]{64}$/.test(metric.id) &&
        metric.id === plan.requestIds[index] &&
        metric.iterations === policy.iterations &&
        Number.isFinite(metric.dps) &&
        metric.dps > 0 &&
        Number.isFinite(metric.stdev) &&
        metric.stdev >= 0,
      "Invalid confirmation request identity, metric or sample precision",
    );
  }
  const comparisons = plan.arms.slice(1).map((arm, index): PracticalSimulatorComparison => {
    const comparedRanges = plan.seeds.map((seed, range): PracticalSimulatorComparisonRange => {
      const selected = records[range * width]?.metric,
        contender = records[range * width + index + 1]?.metric;
      requireMatch(selected && contender, "Missing comparison metric");
      const difference = contender.dps - selected.dps,
        standardError = Math.hypot(selected.stdev, contender.stdev) / Math.sqrt(policy.iterations),
        threshold = Math.max(0.001, policy.standardErrorMultiplier * standardError);
      requireMatch(
        Number.isFinite(difference) && Number.isFinite(standardError) && Number.isFinite(threshold),
        "Confirmation arithmetic exceeded its supported range",
      );
      const conservativeGapFraction = Math.max(0, (difference + threshold) / selected.dps);
      requireMatch(Number.isFinite(conservativeGapFraction), "Invalid relative confirmation gap");
      return {
        seed,
        selected,
        contender,
        difference,
        standardError,
        threshold,
        conservativeGapFraction,
      };
    });
    const averageChallengerDpsDifference =
      comparedRanges.reduce((sum, row) => sum + row.difference, 0) / comparedRanges.length;
    requireMatch(Number.isFinite(averageChallengerDpsDifference), "Invalid comparison mean");
    return {
      arm: arm.name,
      category: arm.category,
      ranges: comparedRanges,
      challengerConfirmedBetter: comparedRanges.every((row) => row.difference > row.threshold),
      selectedConfirmedBetter: comparedRanges.every((row) => -row.difference > row.threshold),
      averageChallengerDpsDifference,
      largestConservativeGapFraction: Math.max(
        ...comparedRanges.map((row) => row.conservativeGapFraction),
      ),
    };
  });
  const largestConservativeRetainedGapFraction = Math.max(
      0,
      ...comparisons.map((row) => row.largestConservativeGapFraction),
    ),
    strictRetainedDominancePassed = !comparisons.some((row) => row.challengerConfirmedBetter),
    accepted = largestConservativeRetainedGapFraction <= policy.maximumRetainedGapFraction;
  const selectedDps =
    plan.seeds.reduce((sum, _, index) => {
      const selected = records[index * width];
      requireMatch(selected, "Missing selected range");
      return sum + selected.metric.dps;
    }, 0) / plan.seeds.length;
  requireMatch(Number.isFinite(selectedDps), "Invalid selected confirmation mean");
  return {
    status: accepted
      ? strictRetainedDominancePassed
        ? "accepted-practical-first-pass"
        : "accepted-with-disclosed-nearby-gains"
      : "material-challenger-or-uncertainty-needs-correction",
    accepted,
    strictRetainedDominancePassed,
    selectedArm: selectedArm.name,
    selectedDps,
    selectedIterations: policy.iterations * policy.ranges,
    iterationsPerRange: policy.iterations,
    largestConservativeRetainedGapFraction,
    maximumRetainedGapFraction: policy.maximumRetainedGapFraction,
    comparisons,
  };
}
