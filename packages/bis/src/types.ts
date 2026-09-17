export type EquipmentSlot = string;
export type StatKey = string;

export type ItemAvailability = "available" | "unknown" | "unavailable";
export type AvailabilityPolicy = "available_only" | "include_unknown";
export type ModelValidationStatus = "draft" | "validated";
export type ResultClassification = "candidate" | "definitive";
export type CandidateCoverage = "complete" | "partial";

export interface BuildReference {
  readonly product: string;
  readonly buildNumber: number;
  readonly phase: number | null;
}

export interface CharacterProfile {
  readonly level: number;
  readonly classId: number;
  readonly raceId: number;
  readonly specializationId: string;
  readonly faction: string | null;
  readonly professionIds: readonly number[];
  readonly professionSpecializationIds: readonly number[];
  readonly proficiencyIds: readonly number[];
  readonly abilityIds: readonly number[];
  readonly skillRanks: Readonly<Record<number, number>>;
  readonly reputationRanks: Readonly<Record<number, number>>;
  readonly baseStats: Readonly<Record<StatKey, number>>;
}

export interface EncounterProfile {
  readonly id: string;
  readonly targetLevel: number;
  readonly targetArmor: number;
  readonly targetCreatureType: string | null;
  readonly durationSeconds: number;
  readonly targetCount: number;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
}

export interface OptimizationContext {
  readonly build: BuildReference;
  readonly character: CharacterProfile;
  readonly encounter: EncounterProfile;
}

export interface GearItem {
  readonly itemId: number;
  readonly variantId: string;
  readonly name: string;
  readonly slots: readonly EquipmentSlot[];
  readonly stats: Readonly<Record<StatKey, number>>;
  readonly effectSpellIds: readonly number[];
  readonly setId: number | null;
  readonly requiredLevel: number;
  readonly allowedClassIds: readonly number[];
  readonly allowedRaceIds: readonly number[];
  readonly allowedFactions: readonly string[];
  readonly requiredProfessionId: number | null;
  readonly requiredProfessionSpecializationId: number | null;
  readonly requiredProficiencyIds: readonly number[];
  readonly requiredAbilityIds: readonly number[];
  readonly requiredSkillId: number | null;
  readonly requiredSkillRank: number;
  readonly requiredReputation: ReputationRequirement | null;
  readonly availableFromPhase: number | null;
  readonly availableThroughPhase: number | null;
  readonly availability: ItemAvailability;
  readonly uniqueGroupId: number | null;
  readonly uniqueGroupMaximum: number;
  readonly maximumEquipped: number;
  readonly blocksSlots: readonly EquipmentSlot[];
  readonly weapon?: WeaponProfile;
}

export interface WeaponDamage {
  readonly school: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface WeaponProfile {
  readonly delayMs: number;
  readonly damages: readonly WeaponDamage[];
}

export interface ReputationRequirement {
  readonly factionId: number;
  readonly minimumRank: number;
}

export interface GearSetBonus {
  readonly setId: number;
  readonly threshold: number;
  readonly spellId: number;
}

export interface SlotDefinition {
  readonly slot: EquipmentSlot;
  readonly required: boolean;
  readonly interchangeableGroup: string | null;
}

export interface EquippedItem {
  readonly slot: EquipmentSlot;
  readonly item: GearItem;
}

export interface Loadout {
  readonly items: readonly EquippedItem[];
}

export interface ActiveEffect {
  readonly spellId: number;
  readonly source: "item" | "set";
  readonly sourceId: number;
}

export interface ScoreContribution {
  readonly kind: "effect" | "stat";
  readonly key: string;
  readonly label: string;
  readonly score: number;
}

export interface ConstraintViolation {
  readonly code: string;
  readonly message: string;
}

export interface EvaluationInput {
  readonly loadout: Loadout;
  readonly activeEffects: readonly ActiveEffect[];
  readonly context: OptimizationContext;
}

export interface LoadoutEvaluation {
  readonly valid: boolean;
  readonly score: number;
  readonly totalStats: Readonly<Record<StatKey, number>>;
  readonly metrics: Readonly<Record<string, number>>;
  readonly contributions: readonly ScoreContribution[];
  readonly violations: readonly ConstraintViolation[];
  readonly unresolvedEffectSpellIds: readonly number[];
}

export interface EvaluatorMetadata {
  readonly modelId: string;
  readonly version: string;
  readonly product: string;
  readonly buildNumber: number;
  readonly specializationId: string;
  readonly objectiveId: string;
  readonly validationStatus: ModelValidationStatus;
}

export interface LoadoutEvaluator {
  readonly metadata: EvaluatorMetadata;
  estimatePartial(input: EvaluationInput): number;
  evaluate(input: EvaluationInput): LoadoutEvaluation;
}

export type IneligibilityReason =
  | "ability"
  | "availability_unknown"
  | "availability_unavailable"
  | "class"
  | "faction"
  | "level"
  | "phase"
  | "phase_not_selected"
  | "profession"
  | "profession_specialization"
  | "proficiency"
  | "race"
  | "reputation"
  | "skill_rank";

export interface OptimizationOptions {
  readonly availabilityPolicy?: AvailabilityPolicy;
  readonly beamWidth?: number;
  readonly resultLimit?: number;
}

export interface OptimizationRequest {
  readonly items: readonly GearItem[];
  readonly slots: readonly SlotDefinition[];
  readonly setBonuses: readonly GearSetBonus[];
  readonly candidateCoverage: CandidateCoverage;
  readonly context: OptimizationContext;
  readonly evaluator: LoadoutEvaluator;
  readonly options?: OptimizationOptions;
}

export interface CandidateCount {
  readonly slot: EquipmentSlot;
  readonly count: number;
}

export interface ExclusionCount {
  readonly reason: IneligibilityReason;
  readonly count: number;
}

export interface OptimizationDiagnostics {
  readonly searchMode: "beam" | "exhaustive";
  readonly searchComplete: boolean;
  readonly expandedStateCount: number;
  readonly evaluatedLoadoutCount: number;
  readonly rejectedLoadoutCount: number;
  readonly deduplicatedStateCount: number;
  readonly truncatedStateCount: number;
  readonly candidateCounts: readonly CandidateCount[];
  readonly exclusionCounts: readonly ExclusionCount[];
  readonly unresolvedCandidateEffectSpellIds: readonly number[];
}

export type ConfidenceIssueCode =
  | "candidate_coverage_incomplete"
  | "model_not_validated"
  | "search_not_exhaustive"
  | "unknown_item_availability"
  | "unresolved_item_effect";

export interface ConfidenceIssue {
  readonly code: ConfidenceIssueCode;
  readonly message: string;
}

export interface RankedLoadout {
  readonly rank: number;
  readonly loadout: Loadout;
  readonly evaluation: LoadoutEvaluation;
  readonly classification: ResultClassification;
  readonly confidenceIssues: readonly ConfidenceIssue[];
}

export interface OptimizationResult {
  readonly model: EvaluatorMetadata;
  readonly loadouts: readonly RankedLoadout[];
  readonly diagnostics: OptimizationDiagnostics;
}
