import type { CampaignPlan } from "./campaign.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";

function knownObjectiveIndexes(quest: CombatQuestReference): readonly number[] {
  const kills = quest.onlyCreatureObjectives
    ? (quest.killQuotas ?? [])
        .filter((quota) => quest.creatureIds[quota.objectiveIndex - 1] === quota.npcId)
        .map((quota) => quota.objectiveIndex)
    : [];
  const items = (quest.itemObjectives ?? []).flatMap((item) =>
    item.objectiveIndex === null ? [] : [item.objectiveIndex],
  );
  // A held index without a mapped objective is a requirement to review, not a new task to invent.
  return [...new Set([...kills, ...items])].sort((a, b) => a - b);
}

/** Fill generated full-objective tasks without changing source-owned or partial stages. */
export function expandCampaignDungeonObjectives(
  plan: CampaignPlan,
  reference: Pick<CombatDataset, "targetBuild" | "quests">,
): CampaignPlan {
  if (reference.targetBuild !== plan.targetBuild)
    throw new Error("Dungeon objective references belong to a different route build.");
  const indices = new Map(
    reference.quests.map((quest) => [quest.questId, knownObjectiveIndexes(quest)]),
  );
  let changed = false;
  const actions = plan.actions.map((action) => {
    if (!action.wholeQuestObjectives) return action;
    const first = action.questChanges[0];
    if (
      action.source ||
      action.kind !== "quests" ||
      !first ||
      first.state !== "objectives-complete" ||
      action.questChanges.some(
        (change) => change.questId !== first.questId || change.state !== "objectives-complete",
      )
    )
      throw new Error(`Invalid generated whole-quest objective task: ${action.id}.`);
    const existing = new Set(action.questChanges.map((change) => change.objectiveIndex ?? 1));
    const added = (indices.get(first.questId) ?? []).filter((index) => !existing.has(index));
    if (!added.length) return action;
    changed = true;
    return {
      ...action,
      questChanges: [
        ...action.questChanges,
        ...added.map((objectiveIndex) => ({ ...first, objectiveIndex })),
      ],
    };
  });
  return changed ? { ...plan, actions } : plan;
}
