import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CombatDataset, CombatObjective } from "./combat-model.js";
import reviewed from "./fixtures/dungeon-ground-methods-70205.json" with { type: "json" };

type ReviewedMethod = (typeof reviewed.methods)[number];

function corroboratedCounter(method: ReviewedMethod): boolean {
  return (
    reviewed.clientCounterSources.some((source) => source.build === reviewed.targetBuild) &&
    reviewed.clientCounterSources.length >= 2 &&
    new Set(reviewed.clientCounterSources.map((source) => source.build)).size ===
      reviewed.clientCounterSources.length &&
    reviewed.clientCounterSources.every((source) => {
      const matches = source.quests.filter((quest) => quest.questId === method.questId);
      const quest = matches[0],
        objective = quest?.objectives[0];
      return (
        /^[a-f0-9]{64}$/.test(source.source.sha256) &&
        matches.length === 1 &&
        quest?.objectives.length === 1 &&
        objective?.type === "item" &&
        objective.typeId === 1 &&
        objective.objectId === method.itemId &&
        objective.amount === method.quantity
      );
    })
  );
}

/** Explicitly reviewed ground methods can qualify without inventing a missing world-object ID. */
export function attachReviewedDungeonGroundMethods(
  plan: CampaignPlan,
  dataset: CombatDataset,
): { readonly plan: CampaignPlan; readonly objectives: ReadonlyMap<string, CombatObjective> } {
  const objectives = new Map<string, CombatObjective>();
  if (
    plan.targetBuild !== reviewed.targetBuild ||
    dataset.targetBuild !== reviewed.targetBuild ||
    dataset.provider.revision !== reviewed.providerRevision ||
    dataset.provider.questSha256 !== reviewed.questSha256 ||
    dataset.provider.itemSha256 !== reviewed.itemSha256
  )
    return { plan, objectives };
  const legs = new Map(plan.legs.map((leg) => [leg.id, leg]));
  const instructions = new Map<string, readonly string[]>();
  for (const method of reviewed.methods) {
    const quest = dataset.quests.find((entry) => entry.questId === method.questId);
    const item = quest?.itemObjectives?.[0];
    if (
      !corroboratedCounter(method) ||
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
      JSON.stringify(quest.objectiveText) !== JSON.stringify(method.objectiveText) ||
      item?.objectiveIndex !== method.objectiveIndex ||
      item.itemId !== method.itemId ||
      item.itemName !== method.itemName ||
      item.quantity !== method.quantity ||
      item.provided ||
      item.npcIds.length ||
      item.objectIds?.length ||
      item.vendorEvidence ||
      item.rewardEvidence ||
      method.accessNpcs.some(
        (access) =>
          !dataset.npcs.some(
            (npc) =>
              npc.id === access.id && npc.name === access.name && npc.xpEligibility === "assumed",
          ),
      )
    )
      continue;
    for (const action of plan.actions) {
      const leg = legs.get(action.legId);
      const context = action.location?.insideDungeon ?? leg?.dungeonVisitId ?? leg?.stopId;
      if (
        context !== method.dungeonId ||
        action.source ||
        action.leaderOnly ||
        action.raidOnly ||
        !action.wholeQuestObjectives ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]?.questId !== method.questId ||
        action.questChanges[0].state !== "objectives-complete" ||
        (action.questChanges[0].objectiveIndex ?? 1) !== method.objectiveIndex
      )
        continue;
      objectives.set(action.id, {
        questId: method.questId,
        objectiveIndex: method.objectiveIndex,
        npcIds: [],
        requiredKills: null,
        credit: "non-combat",
        combatAccess: {
          npcIds: method.accessNpcs.map((npc) => npc.id),
          itemId: method.itemId,
          quantity: method.quantity,
        },
        source: method.sources.map((source) => source.url).join("; "),
        reason:
          "The reviewed method gathers the item from a plant. Its guarding encounter remains a physical requirement; no additional kill count or XP is invented.",
      });
      instructions.set(action.id, method.instructions);
    }
  }
  if (!objectives.size) return { plan, objectives };
  return {
    plan: {
      ...plan,
      actions: plan.actions.map((action): CampaignAction => {
        const added = instructions.get(action.id);
        return added
          ? { ...action, instructions: [...new Set([...action.instructions, ...added])] }
          : action;
      }),
    },
    objectives,
  };
}
