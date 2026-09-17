import { getIneligibilityReasons } from "./eligibility.js";
import type {
  ActiveEffect,
  ConfidenceIssue,
  EquippedItem,
  EquipmentSlot,
  EvaluationInput,
  ExclusionCount,
  GearItem,
  GearSetBonus,
  IneligibilityReason,
  Loadout,
  LoadoutEvaluation,
  OptimizationContext,
  OptimizationRequest,
  OptimizationResult,
  RankedLoadout,
  SlotDefinition,
} from "./types.js";

const DEFAULT_BEAM_WIDTH = 5_000;
const DEFAULT_RESULT_LIMIT = 20;

interface SearchState {
  readonly assignments: ReadonlyMap<EquipmentSlot, GearItem>;
  readonly blockedSlots: ReadonlySet<EquipmentSlot>;
  readonly itemCounts: ReadonlyMap<number, number>;
  readonly uniqueGroupCounts: ReadonlyMap<number, number>;
}

interface EvaluatedState {
  readonly state: SearchState;
  readonly loadout: Loadout;
  readonly evaluation: LoadoutEvaluation;
  readonly signature: string;
}

export function optimizeLoadouts(request: OptimizationRequest): OptimizationResult {
  validateRequest(request);
  const beamWidth = request.options?.beamWidth ?? DEFAULT_BEAM_WIDTH;
  const resultLimit = request.options?.resultLimit ?? DEFAULT_RESULT_LIMIT;
  const availabilityPolicy = request.options?.availabilityPolicy ?? "available_only";
  validatePositiveInteger(beamWidth, "beam width");
  validatePositiveInteger(resultLimit, "result limit");
  validateModelApplicability(request);

  const exclusionCounts = new Map<IneligibilityReason, number>();
  const eligibleItems = request.items.filter((item) => {
    const reasons = getIneligibilityReasons(item, request.context, availabilityPolicy);
    for (const reason of reasons) increment(exclusionCounts, reason);
    return reasons.length === 0;
  });
  const candidateItemsBySlot = new Map(
    request.slots.map((slot) => [
      slot.slot,
      eligibleItems.filter((item) => item.slots.includes(slot.slot)).sort(compareItems),
    ]),
  );

  let states: readonly SearchState[] = [emptyState()];
  let expandedStateCount = 0;
  let deduplicatedStateCount = 0;
  let truncatedStateCount = 0;

  for (const slot of request.slots) {
    const expanded: SearchState[] = [];
    for (const state of states) {
      if (state.blockedSlots.has(slot.slot)) {
        if (!slot.required) expanded.push(state);
        continue;
      }
      if (!slot.required) expanded.push(state);
      for (const item of candidateItemsBySlot.get(slot.slot) ?? []) {
        if (!canEquip(state, slot.slot, item)) continue;
        expanded.push(equip(state, slot.slot, item));
      }
    }
    expandedStateCount += expanded.length;

    const uniqueStates = deduplicateStates(expanded, request.slots);
    deduplicatedStateCount += expanded.length - uniqueStates.length;
    const scoredStates = uniqueStates
      .map((state) => ({
        state,
        score: finiteScore(
          request.evaluator.estimatePartial(
            evaluationInput(state, request.setBonuses, request.context),
          ),
          "partial estimate",
        ),
        signature: stateSignature(state, request.slots),
      }))
      .sort(
        (left, right) => right.score - left.score || left.signature.localeCompare(right.signature),
      );
    if (scoredStates.length > beamWidth) {
      truncatedStateCount += scoredStates.length - beamWidth;
    }
    states = scoredStates.slice(0, beamWidth).map(({ state }) => state);
    if (states.length === 0) break;
  }

  const evaluatedStates: EvaluatedState[] = states.map((state) => {
    const input = evaluationInput(state, request.setBonuses, request.context);
    const evaluation = request.evaluator.evaluate(input);
    finiteScore(evaluation.score, "loadout evaluation");
    return {
      state,
      loadout: input.loadout,
      evaluation,
      signature: stateSignature(state, request.slots),
    };
  });
  const acceptedStates = evaluatedStates
    .filter(({ evaluation }) => evaluation.valid)
    .sort(compareEvaluatedStates);
  const validStates = acceptedStates.slice(0, resultLimit);
  const searchComplete = truncatedStateCount === 0;
  const unresolvedCandidateEffectSpellIds = [
    ...new Set(evaluatedStates.flatMap(({ evaluation }) => evaluation.unresolvedEffectSpellIds)),
  ].sort((left, right) => left - right);
  const loadouts = validStates.map((result, index) =>
    rankedLoadout(result, index + 1, request, searchComplete, unresolvedCandidateEffectSpellIds),
  );

  return {
    model: request.evaluator.metadata,
    loadouts,
    diagnostics: {
      searchMode: searchComplete ? "exhaustive" : "beam",
      searchComplete,
      expandedStateCount,
      evaluatedLoadoutCount: evaluatedStates.length,
      rejectedLoadoutCount: evaluatedStates.length - acceptedStates.length,
      deduplicatedStateCount,
      truncatedStateCount,
      candidateCounts: request.slots.map((slot) => ({
        slot: slot.slot,
        count: candidateItemsBySlot.get(slot.slot)?.length ?? 0,
      })),
      exclusionCounts: [...exclusionCounts.entries()]
        .map(([reason, count]): ExclusionCount => ({ reason, count }))
        .sort((left, right) => left.reason.localeCompare(right.reason)),
      unresolvedCandidateEffectSpellIds,
    },
  };
}

function emptyState(): SearchState {
  return {
    assignments: new Map(),
    blockedSlots: new Set(),
    itemCounts: new Map(),
    uniqueGroupCounts: new Map(),
  };
}

function canEquip(state: SearchState, slot: EquipmentSlot, item: GearItem): boolean {
  if (state.assignments.has(slot) || state.blockedSlots.has(slot)) return false;
  if (
    [...state.assignments.keys()].some((equippedSlot) => item.blocksSlots.includes(equippedSlot))
  ) {
    return false;
  }
  if ((state.itemCounts.get(item.itemId) ?? 0) >= item.maximumEquipped) return false;
  if (
    item.uniqueGroupId !== null &&
    (state.uniqueGroupCounts.get(item.uniqueGroupId) ?? 0) >= item.uniqueGroupMaximum
  ) {
    return false;
  }
  return true;
}

function equip(state: SearchState, slot: EquipmentSlot, item: GearItem): SearchState {
  const assignments = new Map(state.assignments);
  const blockedSlots = new Set(state.blockedSlots);
  const itemCounts = new Map(state.itemCounts);
  const uniqueGroupCounts = new Map(state.uniqueGroupCounts);
  assignments.set(slot, item);
  for (const blockedSlot of item.blocksSlots) blockedSlots.add(blockedSlot);
  itemCounts.set(item.itemId, (itemCounts.get(item.itemId) ?? 0) + 1);
  if (item.uniqueGroupId !== null) {
    uniqueGroupCounts.set(item.uniqueGroupId, (uniqueGroupCounts.get(item.uniqueGroupId) ?? 0) + 1);
  }
  return { assignments, blockedSlots, itemCounts, uniqueGroupCounts };
}

function evaluationInput(
  state: SearchState,
  setBonuses: readonly GearSetBonus[],
  context: OptimizationContext,
): EvaluationInput {
  const loadout = makeLoadout(state);
  return {
    loadout,
    activeEffects: getActiveEffects(loadout, setBonuses),
    context,
  };
}

function makeLoadout(state: SearchState): Loadout {
  const items = [...state.assignments.entries()]
    .map(([slot, item]): EquippedItem => ({ slot, item }))
    .sort((left, right) => left.slot.localeCompare(right.slot));
  return { items };
}

function getActiveEffects(
  loadout: Loadout,
  setBonuses: readonly GearSetBonus[],
): readonly ActiveEffect[] {
  const effects: ActiveEffect[] = loadout.items.flatMap(({ item }) =>
    item.effectSpellIds.map((spellId) => ({
      spellId,
      source: "item" as const,
      sourceId: item.itemId,
    })),
  );
  const setCounts = new Map<number, number>();
  for (const { item } of loadout.items) {
    if (item.setId !== null) increment(setCounts, item.setId);
  }
  for (const bonus of setBonuses) {
    if ((setCounts.get(bonus.setId) ?? 0) >= bonus.threshold) {
      effects.push({ spellId: bonus.spellId, source: "set", sourceId: bonus.setId });
    }
  }
  return effects.sort(
    (left, right) =>
      left.spellId - right.spellId ||
      left.source.localeCompare(right.source) ||
      left.sourceId - right.sourceId,
  );
}

function deduplicateStates(
  states: readonly SearchState[],
  slots: readonly SlotDefinition[],
): readonly SearchState[] {
  const unique = new Map<string, SearchState>();
  for (const state of states) {
    const signature = stateSignature(state, slots);
    if (!unique.has(signature)) unique.set(signature, state);
  }
  return [...unique.values()];
}

function stateSignature(state: SearchState, slots: readonly SlotDefinition[]): string {
  const groups = new Map<string, string[]>();
  const components: string[] = [];
  for (const slot of slots) {
    const variantId = state.assignments.get(slot.slot)?.variantId ?? "-";
    if (slot.interchangeableGroup === null) {
      components.push(`${slot.slot}=${variantId}`);
      continue;
    }
    const group = groups.get(slot.interchangeableGroup) ?? [];
    group.push(variantId);
    groups.set(slot.interchangeableGroup, group);
  }
  for (const [group, variantIds] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    components.push(`${group}=${variantIds.sort().join(",")}`);
  }
  return components.sort().join("|");
}

function rankedLoadout(
  result: EvaluatedState,
  rank: number,
  request: OptimizationRequest,
  searchComplete: boolean,
  unresolvedCandidateEffectSpellIds: readonly number[],
): RankedLoadout {
  const confidenceIssues: ConfidenceIssue[] = [];
  if (request.candidateCoverage !== "complete") {
    confidenceIssues.push({
      code: "candidate_coverage_incomplete",
      message:
        "The item, enhancement, phase, or acquisition candidate frontier is not yet complete.",
    });
  }
  if (!searchComplete) {
    confidenceIssues.push({
      code: "search_not_exhaustive",
      message:
        "The search beam was truncated, so this is the best loadout found, not a proven optimum.",
    });
  }
  if (request.evaluator.metadata.validationStatus !== "validated") {
    confidenceIssues.push({
      code: "model_not_validated",
      message: "The class/spec model has not passed its validation fixtures.",
    });
  }
  if (unresolvedCandidateEffectSpellIds.length > 0) {
    confidenceIssues.push({
      code: "unresolved_item_effect",
      message: `Unsupported spell effects in the legal candidate frontier: ${unresolvedCandidateEffectSpellIds.join(", ")}.`,
    });
  }
  if (result.loadout.items.some(({ item }) => item.availability === "unknown")) {
    confidenceIssues.push({
      code: "unknown_item_availability",
      message: "At least one item is client-visible but does not yet have verified availability.",
    });
  }
  return {
    rank,
    loadout: result.loadout,
    evaluation: result.evaluation,
    classification: confidenceIssues.length === 0 ? "definitive" : "candidate",
    confidenceIssues,
  };
}

function compareEvaluatedStates(left: EvaluatedState, right: EvaluatedState): number {
  return (
    right.evaluation.score - left.evaluation.score || left.signature.localeCompare(right.signature)
  );
}

function compareItems(left: GearItem, right: GearItem): number {
  return left.itemId - right.itemId || left.variantId.localeCompare(right.variantId);
}

function validateRequest(request: OptimizationRequest): void {
  if (request.slots.length === 0) throw new Error("At least one equipment slot is required");
  if (new Set(request.slots.map(({ slot }) => slot)).size !== request.slots.length) {
    throw new Error("Equipment slots must be unique");
  }
  if (new Set(request.items.map(({ variantId }) => variantId)).size !== request.items.length) {
    throw new Error("Gear variant IDs must be unique");
  }
  validateContext(request.context);
  for (const item of request.items) validateItem(item);
  validateUniqueGroups(request.items);
  for (const bonus of request.setBonuses) {
    validatePositiveInteger(bonus.setId, "set ID");
    validatePositiveInteger(bonus.threshold, "set threshold");
    validatePositiveInteger(bonus.spellId, "set effect spell ID");
  }
}

function validateItem(item: GearItem): void {
  validatePositiveInteger(item.itemId, "item ID");
  if (item.variantId.trim() === "") throw new Error(`Item ${item.itemId} has an empty variant ID`);
  if (item.name.trim() === "") throw new Error(`Item ${item.itemId} has an empty name`);
  if (item.slots.length === 0) throw new Error(`Item ${item.itemId} has no equipment slots`);
  if (!Number.isInteger(item.requiredLevel) || item.requiredLevel < 0) {
    throw new Error(`Item ${item.itemId} has an invalid required level`);
  }
  if (!Number.isInteger(item.requiredSkillRank) || item.requiredSkillRank < 0) {
    throw new Error(`Item ${item.itemId} has an invalid required skill rank`);
  }
  if (item.requiredSkillId === null && item.requiredSkillRank > 0) {
    throw new Error(`Item ${item.itemId} has a skill rank without a required skill`);
  }
  if (
    item.requiredReputation !== null &&
    (!Number.isInteger(item.requiredReputation.factionId) ||
      item.requiredReputation.factionId <= 0 ||
      !Number.isInteger(item.requiredReputation.minimumRank) ||
      item.requiredReputation.minimumRank < 0)
  ) {
    throw new Error(`Item ${item.itemId} has an invalid required reputation rank`);
  }
  validatePositiveInteger(item.maximumEquipped, `item ${item.itemId} maximum equipped`);
  validatePositiveInteger(item.uniqueGroupMaximum, `item ${item.itemId} unique group maximum`);
  if (
    item.availableFromPhase !== null &&
    item.availableThroughPhase !== null &&
    item.availableFromPhase > item.availableThroughPhase
  ) {
    throw new Error(`Item ${item.itemId} has an invalid phase range`);
  }
  for (const value of Object.values(item.stats)) {
    if (!Number.isFinite(value)) throw new Error(`Item ${item.itemId} has a non-finite stat`);
  }
}

function validateContext(context: OptimizationContext): void {
  validatePositiveInteger(context.build.buildNumber, "build number");
  if (context.build.phase !== null) validatePositiveInteger(context.build.phase, "phase");
  validatePositiveInteger(context.character.level, "character level");
  validatePositiveInteger(context.character.classId, "class ID");
  validatePositiveInteger(context.character.raceId, "race ID");
  if (context.character.specializationId.trim() === "") {
    throw new Error("The character specialization ID cannot be empty");
  }
  for (const [stat, value] of Object.entries(context.character.baseStats)) {
    if (stat.trim() === "" || !Number.isFinite(value)) {
      throw new Error("Character base stats must use non-empty keys and finite values");
    }
  }
  validateRankMap(context.character.skillRanks, "skill");
  validateRankMap(context.character.reputationRanks, "reputation");
  if (context.encounter.id.trim() === "") throw new Error("The encounter ID cannot be empty");
  validatePositiveInteger(context.encounter.targetLevel, "encounter target level");
  if (!Number.isFinite(context.encounter.targetArmor) || context.encounter.targetArmor < 0) {
    throw new Error("Encounter target armor must be a finite non-negative number");
  }
  if (
    !Number.isFinite(context.encounter.durationSeconds) ||
    context.encounter.durationSeconds <= 0
  ) {
    throw new Error("Encounter duration must be a finite positive number");
  }
  validatePositiveInteger(context.encounter.targetCount, "encounter target count");
}

function validateRankMap(ranks: Readonly<Record<number, number>>, label: string): void {
  for (const [id, rank] of Object.entries(ranks)) {
    if (!Number.isInteger(Number(id)) || Number(id) <= 0 || !Number.isFinite(rank) || rank < 0) {
      throw new Error(`Character ${label} ranks must use positive IDs and non-negative values`);
    }
  }
}

function validateUniqueGroups(items: readonly GearItem[]): void {
  const maximumByGroup = new Map<number, number>();
  for (const item of items) {
    if (item.uniqueGroupId === null) continue;
    const existing = maximumByGroup.get(item.uniqueGroupId);
    if (existing !== undefined && existing !== item.uniqueGroupMaximum) {
      throw new Error(
        `Unique group ${item.uniqueGroupId} has inconsistent maximum-equipped values`,
      );
    }
    maximumByGroup.set(item.uniqueGroupId, item.uniqueGroupMaximum);
  }
}

function validateModelApplicability(request: OptimizationRequest): void {
  const { metadata } = request.evaluator;
  const { build, character } = request.context;
  if (metadata.product !== build.product || metadata.buildNumber !== build.buildNumber) {
    throw new Error(
      `Model ${metadata.modelId}@${metadata.version} targets ${metadata.product}/${metadata.buildNumber}, not ${build.product}/${build.buildNumber}`,
    );
  }
  if (metadata.specializationId !== character.specializationId) {
    throw new Error(
      `Model specialization ${metadata.specializationId} does not match ${character.specializationId}`,
    );
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`);
}

function increment<TKey>(map: Map<TKey, number>, key: TKey): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function finiteScore(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`The evaluator returned a non-finite ${label}`);
  return value;
}
