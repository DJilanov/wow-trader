import type { CampaignPlan } from "./campaign.js";
import type {
  CombatDataset,
  CombatObjective,
} from "./combat-model.js";
import reviewed from "./fixtures/felvine-conversion-70205.json" with { type: "json" };

/** Preserve the guarded shard conversion and each player's sealed result without invented kill XP. */
export function felvineConversionObjectives(
  plan: CampaignPlan,
  dataset: CombatDataset,
): ReadonlyMap<string, CombatObjective> {
  const objectives = new Map<string, CombatObjective>();
  const quest = dataset.quests.find((entry) => entry.questId === reviewed.questId);
  const item = quest?.itemObjectives?.[0];
  if (
    plan.targetBuild !== reviewed.targetBuild ||
    dataset.targetBuild !== reviewed.targetBuild ||
    dataset.provider.revision !== reviewed.providerRevision ||
    dataset.provider.questSha256 !== reviewed.questSha256 ||
    dataset.provider.itemSha256 !== reviewed.itemSha256 ||
    dataset.provider.npcSha256 !== reviewed.npcSha256 ||
    dataset.provider.objectSha256 !== reviewed.objectSha256 ||
    !quest ||
    quest.requiredClasses !== 0 ||
    quest.onlyCreatureObjectives ||
    quest.onlyInteractionObjectives ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length ||
    quest.startItem ||
    quest.itemObjectives?.length !== 1 ||
    JSON.stringify(quest.objectiveText) !== JSON.stringify(reviewed.objectiveText) ||
    item?.objectiveIndex !== reviewed.objectiveIndex ||
    item.itemId !== reviewed.outputItemId ||
    item.itemName !== reviewed.outputItemName ||
    item.quantity !== reviewed.quantity ||
    item.provided ||
    item.npcIds.length ||
    item.objectIds?.length ||
    item.vendorEvidence ||
    item.rewardEvidence ||
    !dataset.npcs.some(
      (npc) =>
        npc.id === reviewed.physicalNpc.id &&
        npc.name === reviewed.physicalNpc.name &&
        npc.xpEligibility === "assumed",
    )
  )
    return objectives;
  const legs = new Map(plan.legs.map((leg) => [leg.id, leg]));
  const selected = plan.actions.filter((action) => {
    const leg = legs.get(action.legId);
    const context = action.location?.insideDungeon ?? leg?.dungeonVisitId ?? leg?.stopId;
    return (
      context === "dire-maul-east" &&
      action.kind === "quests" &&
      !action.source &&
      !action.leaderOnly &&
      !action.raidOnly &&
      action.wholeQuestObjectives &&
      action.questChanges.length === 1 &&
      action.questChanges[0]!.questId === reviewed.questId &&
      action.questChanges[0]!.state === "objectives-complete" &&
      action.questChanges[0]!.objectiveIndex === reviewed.objectiveIndex
    );
  });
  if (selected.length !== 1) return objectives;
  objectives.set(selected[0]!.id, {
    questId: reviewed.questId,
    objectiveIndex: reviewed.objectiveIndex,
    credit: "non-combat",
    npcIds: [],
    requiredKills: null,
    combatAccess: {
      npcIds: [reviewed.physicalNpc.id],
      itemId: reviewed.outputItemId,
      quantity: reviewed.quantity,
    },
    source: `QuestieDB ${reviewed.providerRevision}; quest ${reviewed.questId} objective and supplied component; matched historical item counter ${reviewed.counterReference.source.sha256}`,
    reason:
      "Gather the Felvine Shard after Alzzin and seal it in each player's supplied Reliquary. The encounter remains a physical requirement; no additional kill count or XP is inferred.",
  });
  return objectives;
}
