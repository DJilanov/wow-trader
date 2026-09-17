import type { EvaluatorMetadata, StatKey } from "./types.js";

export interface StatCurveSegment {
  readonly upTo: number | null;
  readonly weight: number;
}

export interface StatScoreRule {
  readonly stat: StatKey;
  readonly label: string;
  readonly segments: readonly StatCurveSegment[];
}

export interface StatMinimum {
  readonly stat: StatKey;
  readonly label: string;
  readonly minimum: number;
}

export interface EffectCondition {
  readonly targetCreatureTypes: readonly string[];
  readonly minimumDurationSeconds: number | null;
  readonly maximumDurationSeconds: number | null;
  readonly minimumTargetCount: number | null;
  readonly maximumTargetCount: number | null;
}

export interface EffectScoreRule {
  readonly spellId: number;
  readonly label: string;
  readonly statBonuses: Readonly<Record<StatKey, number>>;
  readonly flatScore: number;
  readonly condition: EffectCondition | null;
}

export interface RuleBasedEvaluatorConfig {
  readonly metadata: EvaluatorMetadata;
  readonly statRules: readonly StatScoreRule[];
  readonly minimumStats: readonly StatMinimum[];
  readonly effectRules: readonly EffectScoreRule[];
  readonly ignoredEffectSpellIds: readonly number[];
}
