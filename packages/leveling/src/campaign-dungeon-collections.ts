import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatObjective, CombatNpc } from "./combat-model.js";
import { PREMADE_STOPS, getPremadeQuest } from "./premade.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { isDungeonCollectionException } from "./dungeon-party-selection.js";
import { gateQuestIds } from "./dungeon-model.js";
import type { ExcludedAcquisitionXp } from "./campaign-acquisition-xp.js";

// Area identities from the provider's creature records. These select sources on the
// chosen instance route; they do not claim that uncaptured alternatives are invalid.
const collectionAreas: Readonly<Record<string, readonly number[]>> = {
  deadmines: [1581],
  stockade: [717],
  gnomeregan: [721],
};

export function selectDungeonCollectionSources(
  objectives: readonly CombatObjective[],
  context: string | null,
  npcs: ReadonlyMap<number, CombatNpc>,
): readonly CombatObjective[] {
  const areas = context ? collectionAreas[context] : undefined;
  if (!areas) return objectives;
  return objectives.map((objective): CombatObjective => {
    if (
      objective.credit !== "personal-loot" ||
      !objective.loot ||
      objective.quotaConflict ||
      isDungeonCollectionException(objective.questId)
    )
      return objective;
    const selected = objective.npcIds.filter((id) => {
      const npc = npcs.get(id);
      return (
        npc &&
        npc.xpEligibility === "assumed" &&
        npc.maximumLevel !== null &&
        npc.zoneIds.some((area) => areas.includes(area))
      );
    });
    if (!selected.length || selected.length === objective.npcIds.length) return objective;
    return {
      ...objective,
      npcIds: selected,
      loot: { ...objective.loot, sourceNpcIds: objective.loot.sourceNpcIds ?? objective.npcIds },
      reason:
        "Collect on the selected instance clear from its known creature sources; alternative outside or uncaptured sources remain in the reference.",
    };
  });
}

/** Plan normal core/selected collections on the run; omit unmodeled kills, never the item quota. */
export function dungeonCollectionXpOmission(
  plan: CampaignPlan,
  action: CampaignAction,
  environment: "outdoor" | "dungeon",
  objective: CombatObjective,
): ExcludedAcquisitionXp | null {
  const loot = objective.loot;
  if (
    plan.dungeonCollectionPolicy !== "selected-clear" ||
    action.leaderOnly ||
    action.raidOnly ||
    isDungeonCollectionException(objective.questId) ||
    objective.credit !== "personal-loot" ||
    objective.quotaConflict ||
    !loot ||
    loot.quantity === null ||
    !Number.isSafeInteger(loot.quantity) ||
    loot.quantity < 1
  ) return null;
  const leg = plan.legs.find((entry) => entry.id === action.legId);
  const context = action.location?.insideDungeon ?? leg?.dungeonVisitId ?? leg?.stopId;
  const stop = PREMADE_STOPS.find(
    (entry) => entry.id === context || entry.visitIds.includes(context ?? ""),
  );
  const selectedFinish =
    environment === "dungeon" &&
    plan.dungeonFinish === true &&
    leg?.kind === "finish" &&
    action.dungeonFinishOnly === true &&
    plan.finishCircuitReview?.wingIds.includes(context ?? "") === true &&
    plan.finishCircuitReview.plannedQuestIds.includes(objective.questId) &&
    DUNGEON_VISITS.some(
      (visit) => visit.id === context && visit.questIds.includes(objective.questId),
    );
  const prerequisite =
    environment === "outdoor" &&
    PREMADE_STOPS.some((entry) =>
      entry.quests.some(
        (choice) =>
          choice.sharedPartyDefault &&
          gateQuestIds(
            getPremadeQuest(choice.questId)?.gate ?? { kind: "all", gates: [] },
          ).includes(objective.questId) &&
          plan.actions.some((candidate) =>
            candidate.questChanges.some((change) => change.questId === choice.questId),
          ),
      ),
    );
  const selectedStock = action.itemCollections?.some(
    (target) =>
      target.questId === objective.questId &&
      target.itemId === loot?.itemId &&
      target.quantity === loot.quantity &&
      target.objectiveBitmask === 1 &&
      objective.objectiveIndex === 1,
  );
  if (
    (environment !== "dungeon" && !prerequisite) ||
    (!prerequisite && !selectedFinish && !stop?.quests.some((choice) =>
      choice.questId === objective.questId &&
      (choice.role === "core" || choice.sharedPartyDefault))) ||
    getPremadeQuest(objective.questId)?.classSlug ||
    !objective.npcIds.length ||
    !objective.npcIds.every((id) => plan.combat?.npcs.some((npc) => npc.id === id)) ||
    !plan.itemRequirements?.some(
      (item) =>
        item.questId === objective.questId &&
        item.objectiveIndex === objective.objectiveIndex &&
        item.itemId === loot.itemId &&
        item.quantity === loot.quantity &&
        !item.conflict,
    ) ||
    (!selectedStock &&
      !action.questChanges.some(
        (change) =>
          change.questId === objective.questId &&
          change.state === "objectives-complete" &&
          (action.wholeQuestObjectives ||
            (change.objectiveIndex ?? 1) === objective.objectiveIndex),
      ))
  )
    return null;
  return {
    questId: objective.questId,
    objectiveIndex: objective.objectiveIndex,
    itemId: loot.itemId,
    quantityPerPlayer: loot.quantity,
    npcId: objective.npcIds[0]!,
    npcIds: objective.npcIds,
    sourceUrl: objective.source,
    planningBasis: prerequisite ? "selected-dungeon-prerequisite" : "selected-dungeon-clear",
    reason:
      "Owner-selected dungeon collection, planned during the quest run. Each player must finish the full item quota; additional acquisition kills and XP are not estimated.",
  };
}
