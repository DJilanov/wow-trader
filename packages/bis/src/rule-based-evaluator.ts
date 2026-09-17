import type {
  ActiveEffect,
  ConstraintViolation,
  EvaluationInput,
  EvaluatorMetadata,
  LoadoutEvaluation,
  LoadoutEvaluator,
  ScoreContribution,
  StatKey,
} from "./types.js";
import type {
  EffectScoreRule,
  RuleBasedEvaluatorConfig,
  StatCurveSegment,
  StatMinimum,
  StatScoreRule,
} from "./rule-types.js";

export type {
  EffectCondition,
  EffectScoreRule,
  RuleBasedEvaluatorConfig,
  StatCurveSegment,
  StatMinimum,
  StatScoreRule,
} from "./rule-types.js";

interface ResolvedEffects {
  readonly flatScore: number;
  readonly statBonuses: Readonly<Record<StatKey, number>>;
  readonly contributions: readonly ScoreContribution[];
  readonly unresolvedSpellIds: readonly number[];
}

export function createRuleBasedEvaluator(config: RuleBasedEvaluatorConfig): LoadoutEvaluator {
  validateConfig(config);
  const effectRules = new Map(config.effectRules.map((rule) => [rule.spellId, rule]));
  const ignoredEffects = new Set(config.ignoredEffectSpellIds);

  function calculate(input: EvaluationInput, enforceMinimums: boolean): LoadoutEvaluation {
    const itemStats = aggregateItemStats(input);
    const effects = resolveEffects(input.activeEffects, input, effectRules, ignoredEffects);
    const totalStats = mergeStats(
      input.context.character.baseStats,
      itemStats,
      effects.statBonuses,
    );
    const contributions: ScoreContribution[] = [];
    let score = effects.flatScore;

    for (const rule of config.statRules) {
      const value = totalStats[rule.stat] ?? 0;
      const statScore = scoreCurve(value, rule.segments);
      score += statScore;
      if (statScore !== 0) {
        contributions.push({
          kind: "stat",
          key: rule.stat,
          label: rule.label,
          score: statScore,
        });
      }
    }
    contributions.push(...effects.contributions);

    const violations = enforceMinimums ? getMinimumViolations(totalStats, config.minimumStats) : [];
    return {
      valid: violations.length === 0,
      score,
      totalStats,
      metrics: { score },
      contributions: contributions.sort(compareContributions),
      violations,
      unresolvedEffectSpellIds: effects.unresolvedSpellIds,
    };
  }

  return {
    metadata: config.metadata,
    estimatePartial(input: EvaluationInput): number {
      return calculate(input, false).score;
    },
    evaluate(input: EvaluationInput): LoadoutEvaluation {
      return calculate(input, true);
    },
  };
}

function aggregateItemStats(input: EvaluationInput): Readonly<Record<StatKey, number>> {
  const result: Record<StatKey, number> = {};
  for (const { item } of input.loadout.items) {
    for (const [stat, value] of Object.entries(item.stats)) {
      result[stat] = (result[stat] ?? 0) + value;
    }
  }
  return result;
}

function resolveEffects(
  effects: readonly ActiveEffect[],
  input: EvaluationInput,
  rules: ReadonlyMap<number, EffectScoreRule>,
  ignoredEffects: ReadonlySet<number>,
): ResolvedEffects {
  const statBonuses: Record<StatKey, number> = {};
  const contributions: ScoreContribution[] = [];
  const unresolved = new Set<number>();
  let flatScore = 0;

  for (const effect of effects) {
    const rule = rules.get(effect.spellId);
    if (!rule) {
      if (!ignoredEffects.has(effect.spellId)) unresolved.add(effect.spellId);
      continue;
    }
    if (!conditionMatches(rule, input)) continue;
    for (const [stat, value] of Object.entries(rule.statBonuses)) {
      statBonuses[stat] = (statBonuses[stat] ?? 0) + value;
    }
    flatScore += rule.flatScore;
    if (rule.flatScore !== 0) {
      contributions.push({
        kind: "effect",
        key: String(rule.spellId),
        label: rule.label,
        score: rule.flatScore,
      });
    }
  }

  return {
    flatScore,
    statBonuses,
    contributions,
    unresolvedSpellIds: [...unresolved].sort((left, right) => left - right),
  };
}

function conditionMatches(rule: EffectScoreRule, input: EvaluationInput): boolean {
  const condition = rule.condition;
  if (condition === null) return true;
  const { encounter } = input.context;
  if (
    condition.targetCreatureTypes.length > 0 &&
    (encounter.targetCreatureType === null ||
      !condition.targetCreatureTypes.includes(encounter.targetCreatureType))
  ) {
    return false;
  }
  if (
    condition.minimumDurationSeconds !== null &&
    encounter.durationSeconds < condition.minimumDurationSeconds
  ) {
    return false;
  }
  if (
    condition.maximumDurationSeconds !== null &&
    encounter.durationSeconds > condition.maximumDurationSeconds
  ) {
    return false;
  }
  if (
    condition.minimumTargetCount !== null &&
    encounter.targetCount < condition.minimumTargetCount
  ) {
    return false;
  }
  if (
    condition.maximumTargetCount !== null &&
    encounter.targetCount > condition.maximumTargetCount
  ) {
    return false;
  }
  return true;
}

function mergeStats(
  ...sources: readonly Readonly<Record<StatKey, number>>[]
): Readonly<Record<StatKey, number>> {
  const result: Record<StatKey, number> = {};
  for (const source of sources) {
    for (const [stat, value] of Object.entries(source)) {
      result[stat] = (result[stat] ?? 0) + value;
    }
  }
  return result;
}

function scoreCurve(value: number, segments: readonly StatCurveSegment[]): number {
  if (value <= 0) return value * (segments[0]?.weight ?? 0);
  let lowerBound = 0;
  let score = 0;
  for (const segment of segments) {
    const upperBound = segment.upTo ?? value;
    const quantity = Math.max(0, Math.min(value, upperBound) - lowerBound);
    score += quantity * segment.weight;
    lowerBound = upperBound;
    if (value <= upperBound || segment.upTo === null) break;
  }
  return score;
}

function getMinimumViolations(
  stats: Readonly<Record<StatKey, number>>,
  minimums: readonly StatMinimum[],
): readonly ConstraintViolation[] {
  return minimums.flatMap((minimum) => {
    const actual = stats[minimum.stat] ?? 0;
    if (actual >= minimum.minimum) return [];
    return [
      {
        code: `minimum:${minimum.stat}`,
        message: `${minimum.label} requires ${minimum.minimum}; the loadout has ${actual}.`,
      },
    ];
  });
}

function compareContributions(left: ScoreContribution, right: ScoreContribution): number {
  return right.score - left.score || left.key.localeCompare(right.key);
}

function validateConfig(config: RuleBasedEvaluatorConfig): void {
  validateMetadata(config.metadata);
  assertUnique(
    config.statRules.map((rule) => rule.stat),
    "stat rule",
  );
  assertUnique(
    config.effectRules.map((rule) => rule.spellId),
    "effect rule",
  );
  assertUnique(
    config.minimumStats.map((rule) => rule.stat),
    "minimum stat rule",
  );
  const scoredEffectIds = new Set(config.effectRules.map((rule) => rule.spellId));
  if (config.ignoredEffectSpellIds.some((spellId) => scoredEffectIds.has(spellId))) {
    throw new Error("An effect spell cannot be both scored and explicitly ignored");
  }

  for (const rule of config.statRules) validateStatRule(rule);
  for (const rule of config.effectRules) validateEffectRule(rule);
  for (const minimum of config.minimumStats) validateMinimum(minimum);
  for (const spellId of config.ignoredEffectSpellIds) assertPositiveInteger(spellId, "spell ID");
}

function validateMetadata(metadata: EvaluatorMetadata): void {
  if (metadata.modelId.trim() === "") throw new Error("The model ID cannot be empty");
  if (metadata.version.trim() === "") throw new Error("The model version cannot be empty");
  if (metadata.product.trim() === "") throw new Error("The model product cannot be empty");
  if (metadata.specializationId.trim() === "") {
    throw new Error("The model specialization ID cannot be empty");
  }
  if (metadata.objectiveId.trim() === "") throw new Error("The model objective ID cannot be empty");
  assertPositiveInteger(metadata.buildNumber, "model build number");
}

function validateStatRule(rule: StatScoreRule): void {
  if (rule.stat.trim() === "") throw new Error("A stat rule has an empty stat key");
  if (rule.label.trim() === "") throw new Error(`Stat rule ${rule.stat} has an empty label`);
  if (rule.segments.length === 0) throw new Error(`Stat rule ${rule.stat} has no curve segments`);
  let previousUpperBound = 0;
  for (const [index, segment] of rule.segments.entries()) {
    assertFinite(segment.weight, `${rule.stat} segment weight`);
    if (segment.upTo === null) {
      if (index !== rule.segments.length - 1) {
        throw new Error(`Only the final ${rule.stat} curve segment may be unbounded`);
      }
      continue;
    }
    if (!Number.isFinite(segment.upTo) || segment.upTo <= previousUpperBound) {
      throw new Error(`${rule.stat} curve boundaries must be finite and strictly increasing`);
    }
    previousUpperBound = segment.upTo;
  }
  if (rule.segments.at(-1)?.upTo !== null) {
    throw new Error(`Stat rule ${rule.stat} must end with an unbounded curve segment`);
  }
}

function validateEffectRule(rule: EffectScoreRule): void {
  assertPositiveInteger(rule.spellId, "effect spell ID");
  if (rule.label.trim() === "") throw new Error(`Effect ${rule.spellId} has an empty label`);
  assertFinite(rule.flatScore, `effect ${rule.spellId} score`);
  for (const [stat, value] of Object.entries(rule.statBonuses)) {
    if (stat.trim() === "") throw new Error(`Effect ${rule.spellId} has an empty stat key`);
    assertFinite(value, `effect ${rule.spellId} stat bonus`);
  }
  if (rule.condition !== null) {
    const condition = rule.condition;
    for (const creatureType of condition.targetCreatureTypes) {
      if (creatureType.trim() === "") {
        throw new Error(`Effect ${rule.spellId} has an empty target creature type`);
      }
    }
    validateNullablePositive(
      condition.minimumDurationSeconds,
      `effect ${rule.spellId} minimum duration`,
      false,
    );
    validateNullablePositive(
      condition.maximumDurationSeconds,
      `effect ${rule.spellId} maximum duration`,
      false,
    );
    validateNullablePositive(
      condition.minimumTargetCount,
      `effect ${rule.spellId} minimum target count`,
      true,
    );
    validateNullablePositive(
      condition.maximumTargetCount,
      `effect ${rule.spellId} maximum target count`,
      true,
    );
    if (
      condition.minimumDurationSeconds !== null &&
      condition.maximumDurationSeconds !== null &&
      condition.minimumDurationSeconds > condition.maximumDurationSeconds
    ) {
      throw new Error(`Effect ${rule.spellId} has an invalid duration range`);
    }
    if (
      condition.minimumTargetCount !== null &&
      condition.maximumTargetCount !== null &&
      condition.minimumTargetCount > condition.maximumTargetCount
    ) {
      throw new Error(`Effect ${rule.spellId} has an invalid target-count range`);
    }
  }
}

function validateMinimum(minimum: StatMinimum): void {
  if (minimum.stat.trim() === "") throw new Error("A minimum stat rule has an empty stat key");
  if (minimum.label.trim() === "") {
    throw new Error(`Minimum stat rule ${minimum.stat} has an empty label`);
  }
  assertFinite(minimum.minimum, `${minimum.stat} minimum`);
}

function assertUnique(values: readonly (number | string)[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function validateNullablePositive(value: number | null, label: string, integer: boolean): void {
  if (value === null) return;
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} must be ${integer ? "a positive integer" : "finite and positive"}`);
  }
}
