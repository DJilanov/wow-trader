import type { CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";

export interface CampaignCollectionSharedKill {
  readonly objectiveIndex: number;
  readonly npcId: number;
  readonly kills: number;
}

/** Preserve every explicit creature counter alongside a collection's distinct item counter. */
export function collectionSharedKills(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference,
): readonly CampaignCollectionSharedKill[] | null {
  if (quest.questId !== reference.questId || reference.killQuotaConflicts?.length) return null;
  if (!quest.objectives.length && !reference.creatureIds.length)
    return reference.killQuotas?.length ? null : [];
  if (
    !quest.objectives.length ||
    quest.objectives.length !== reference.creatureIds.length ||
    reference.killQuotas?.length !== quest.objectives.length ||
    new Set(reference.creatureIds).size !== reference.creatureIds.length ||
    reference.itemObjectives?.some(
      (item) =>
        item.objectiveIndex === null ||
        quest.objectives.some((row) => row.index === item.objectiveIndex),
    )
  )
    return null;
  const result: CampaignCollectionSharedKill[] = [];
  for (const objective of quest.objectives) {
    const quota = reference.killQuotas.find((row) => row.objectiveIndex === objective.index);
    if (
      !quota ||
      objective.count === null ||
      !objective.positions.length ||
      quota.npcId !== objective.npcId ||
      quota.kills !== objective.count ||
      !reference.creatureIds.includes(objective.npcId)
    )
      return null;
    result.push({
      objectiveIndex: objective.index,
      npcId: objective.npcId,
      kills: objective.count,
    });
  }
  return new Set(result.map((row) => row.npcId)).size === reference.creatureIds.length
    ? result
    : null;
}
