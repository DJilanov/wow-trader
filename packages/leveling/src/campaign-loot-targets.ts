import type { CampaignPlan } from "./campaign.js";
import { combatObjectiveKey } from "./combat-model.js";

const reviewedTarget = {
  chapterId: "chapter-116-6-11-elwynn-forest",
  stepId: "source-step-0054",
  npcId: 475,
  name: "Kobold Tunneler",
  keys: ["60:1", "47:1"],
  previous:
    "Kill Kobold Tunnelers and Kobold Miners. Loot them for their Kobold Candles and Gold Dust",
  instruction:
    "Kill Kobold Tunnelers in Fargodeep Mine until the listed candle and gold dust objectives are complete.",
} as const;

/** An explicit player instruction and its forecast must select the same reviewed source creature. */
export function attachCampaignLootTargets(plan: CampaignPlan): CampaignPlan {
  const combat = plan.combat;
  if (!combat) return plan;
  const npc = combat.npcs.find((npc) => npc.id === reviewedTarget.npcId);
  if (
    !npc ||
    npc.name !== reviewedTarget.name ||
    npc.rank !== 0 ||
    npc.maximumLevel === null ||
    npc.maximumLevel > 6
  )
    return plan;
  const actions = new Set(
    plan.actions
      .filter(
        (action) =>
          action.source?.chapterId === reviewedTarget.chapterId &&
          action.source.stepId === reviewedTarget.stepId &&
          action.questChanges.length === reviewedTarget.keys.length &&
          (action.instructions.includes(reviewedTarget.previous) ||
            action.instructions.includes(reviewedTarget.instruction)) &&
          reviewedTarget.keys.every((key) =>
            action.questChanges.some(
              (change) =>
                change.state === "objectives-complete" &&
                `${change.questId}:${change.objectiveIndex ?? 1}` === key,
            ),
          ) &&
          combat.activities.some(
            (activity) =>
              activity.actionId === action.id &&
              activity.environment === "outdoor" &&
              activity.objectives.length === reviewedTarget.keys.length &&
              reviewedTarget.keys.every((key) =>
                activity.objectives.some(
                  (objective) =>
                    combatObjectiveKey(objective) === key &&
                    objective.credit === "personal-loot" &&
                    objective.npcIds.includes(npc.id) &&
                    objective.loot !== undefined &&
                    objective.loot.quantity !== null,
                ),
              ),
          ),
      )
      .map((action) => action.id),
  );
  if (!actions.size) return plan;
  return {
    ...plan,
    actions: plan.actions.map((action) =>
      actions.has(action.id)
        ? {
            ...action,
            instructions: action.instructions.map((line) =>
              line === reviewedTarget.previous ? reviewedTarget.instruction : line,
            ),
            creatureTarget: { npcId: npc.id, name: npc.name },
          }
        : action,
    ),
    combat: {
      ...combat,
      activities: combat.activities.map((activity) =>
        actions.has(activity.actionId)
          ? {
              ...activity,
              objectives: activity.objectives.map((objective) =>
                reviewedTarget.keys.some((key) => key === combatObjectiveKey(objective))
                  ? {
                      ...objective,
                      npcIds: [npc.id],
                      source: objective.source.endsWith("; reviewed Fargodeep Tunneler target")
                        ? objective.source
                        : objective.source + "; reviewed Fargodeep Tunneler target",
                    }
                  : objective,
              ),
            }
          : activity,
      ),
    },
  };
}
