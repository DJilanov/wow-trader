import type {
  AvailabilityPolicy,
  GearItem,
  IneligibilityReason,
  OptimizationContext,
} from "./types.js";

export function getIneligibilityReasons(
  item: GearItem,
  context: OptimizationContext,
  availabilityPolicy: AvailabilityPolicy,
): readonly IneligibilityReason[] {
  const reasons: IneligibilityReason[] = [];
  const { build, character } = context;

  if (item.availability === "unavailable") reasons.push("availability_unavailable");
  if (item.availability === "unknown" && availabilityPolicy === "available_only") {
    reasons.push("availability_unknown");
  }
  if (item.requiredLevel > character.level) reasons.push("level");
  if (item.allowedClassIds.length > 0 && !item.allowedClassIds.includes(character.classId)) {
    reasons.push("class");
  }
  if (item.allowedRaceIds.length > 0 && !item.allowedRaceIds.includes(character.raceId)) {
    reasons.push("race");
  }
  if (
    item.allowedFactions.length > 0 &&
    (character.faction === null || !item.allowedFactions.includes(character.faction))
  ) {
    reasons.push("faction");
  }
  if (
    item.requiredProfessionId !== null &&
    !character.professionIds.includes(item.requiredProfessionId)
  ) {
    reasons.push("profession");
  }
  if (
    item.requiredProfessionSpecializationId !== null &&
    !character.professionSpecializationIds.includes(item.requiredProfessionSpecializationId)
  ) {
    reasons.push("profession_specialization");
  }
  if (
    item.requiredProficiencyIds.some(
      (proficiencyId) => !character.proficiencyIds.includes(proficiencyId),
    )
  ) {
    reasons.push("proficiency");
  }
  if (item.requiredAbilityIds.some((abilityId) => !character.abilityIds.includes(abilityId))) {
    reasons.push("ability");
  }
  if (
    item.requiredSkillId !== null &&
    (character.skillRanks[item.requiredSkillId] ?? 0) < item.requiredSkillRank
  ) {
    reasons.push("skill_rank");
  }
  if (
    item.requiredReputation !== null &&
    (character.reputationRanks[item.requiredReputation.factionId] ?? -1) <
      item.requiredReputation.minimumRank
  ) {
    reasons.push("reputation");
  }

  const hasPhaseBoundary = item.availableFromPhase !== null || item.availableThroughPhase !== null;
  if (hasPhaseBoundary && build.phase === null) {
    reasons.push("phase_not_selected");
  } else if (
    build.phase !== null &&
    ((item.availableFromPhase !== null && build.phase < item.availableFromPhase) ||
      (item.availableThroughPhase !== null && build.phase > item.availableThroughPhase))
  ) {
    reasons.push("phase");
  }

  return reasons;
}
