import type { CampaignAction } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { CampaignCollectionSharedKill } from "./campaign-collection-kills.js";
import {
  isSharedFundingQuest,
  isUnrestrictedFundingQuest,
  type QuestCatalogEntry,
  type QuestCatalogPosition,
} from "./quest-catalog.js";

export interface CapturedFundingObjectiveLocation {
  readonly name: string;
  readonly maximumEnemyLevel: number;
  readonly positions: readonly QuestCatalogPosition[];
  readonly looting?: true;
}

export interface CampaignFundingLootTarget {
  readonly objectiveIndex: number;
  readonly itemId: number;
  readonly npcId: number;
}

/** Separate catalog-backed approach points from a captured counter that has no position. */
export function capturedFundingObjectiveLocations(
  action: CampaignAction,
  quest: QuestCatalogEntry,
  combat: CombatDataset,
  sharedKills: readonly CampaignCollectionSharedKill[] = [],
  lootTargets: readonly CampaignFundingLootTarget[] = [],
): readonly CapturedFundingObjectiveLocation[] | null {
  if (
    !action.source ||
    action.kind !== "quests" ||
    action.positions.length ||
    action.itemCollections?.length ||
    action.raidOnly ||
    action.dungeonFinishOnly ||
    action.bundleId ||
    action.location?.insideDungeon ||
    !((quest.category === "shared-kills" && isSharedFundingQuest(quest)) ||
      (quest.category === "unsupported" && (sharedKills.length > 0 || lootTargets.length > 0) &&
        isUnrestrictedFundingQuest(quest))) ||
    !action.questChanges.length ||
    action.questChanges.some(
      (change) => change.questId !== quest.questId || change.state !== "objectives-complete",
    )
  )
    return null;
  const result: CapturedFundingObjectiveLocation[] = [];
  for (const change of action.questChanges) {
    const objective = quest.objectives.find((entry) => entry.index === change.objectiveIndex);
    if (!objective) {
      const targets = lootTargets.filter((row) => row.objectiveIndex === change.objectiveIndex);
      if (targets.length !== 1) return null;
      const target = targets[0]!;
      const locations = quest.itemObjectiveLocations?.filter((row) => row.index === change.objectiveIndex &&
        row.itemId === target.itemId && row.npcId === target.npcId) ?? [];
      const items = combat.quests.find((row) => row.questId === quest.questId)?.itemObjectives?.filter((row) =>
        row.objectiveIndex === change.objectiveIndex && row.itemId === target.itemId) ?? [];
      const item = items[0];
      const npc = combat.npcs.find((row) => row.id === target.npcId);
      if (locations.length !== 1 || items.length !== 1 || !item ||
        item.provided || item.groundPickup || item.quantity === null ||
        !item.npcIds.includes(target.npcId) || !npc || ![0, 1].includes(npc.rank ?? -1) ||
        npc.minimumLevel === null || npc.maximumLevel === null || npc.xpEligibility !== "assumed")
        return null;
      result.push({ name: npc.name, maximumEnemyLevel: npc.maximumLevel,
        positions: locations[0]!.positions, looting: true });
      continue;
    }
    const npc = combat.npcs.find((entry) => entry.id === objective?.npcId);
    if (
      (quest.category !== "shared-kills" && !sharedKills.some((kill) =>
        kill.objectiveIndex === objective?.index && kill.npcId === objective.npcId &&
        kill.kills === objective.count)) ||
      !objective?.positions.length ||
      !npc ||
      npc.rank !== 0 ||
      npc.maximumLevel === null ||
      npc.minimumLevel === null ||
      npc.xpEligibility !== "assumed"
    )
      return null;
    result.push({
      name: npc.name,
      maximumEnemyLevel: npc.maximumLevel,
      positions: objective.positions,
    });
  }
  return result;
}
