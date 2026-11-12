import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { combatObjectiveKey, type CombatDataset } from "./combat-model.js";
import { resolveCombatQuota } from "./combat-loot.js";
import {
  REVIEWED_LOOT_TARGETS,
  type ReviewedLootTarget,
} from "./campaign-reviewed-loot-targets.js";

type LootProvider = Pick<CombatDataset["provider"], "revision" | "npcSha256">;

function matchesQualification(
  action: CampaignAction,
  plan: CampaignPlan,
  target: ReviewedLootTarget,
  provider?: LootProvider,
): boolean {
  const proof = target.qualification;
  if (!proof) return true;
  return (
    plan.sharedQuestsOnly === true &&
    !action.leaderOnly &&
    plan.targetBuild === proof.targetBuild &&
    plan.combat?.targetBuild === proof.targetBuild &&
    plan.sourceArchiveSha256 === proof.sourceArchiveSha256 &&
    action.source?.version === proof.sourceVersion &&
    provider?.revision === proof.providerRevision &&
    provider.npcSha256 === proof.providerNpcSha256 &&
    action.positions.length === proof.worldWaypoints.length &&
    action.positions.every(
      ({ position }, index) =>
        position.zone === proof.zone &&
        position.space === "world" &&
        position.floor === 0 &&
        position.x === proof.worldWaypoints[index]![0] &&
        position.y === proof.worldWaypoints[index]![1],
    )
  );
}

/** An explicit player instruction and its forecast must select the same reviewed source creature. */
export function attachCampaignLootTargets(
  plan: CampaignPlan,
  provider?: LootProvider,
): CampaignPlan {
  for (const target of REVIEWED_LOOT_TARGETS) plan = attachReviewedTarget(plan, target, provider);
  return plan;
}

function attachReviewedTarget(
  plan: CampaignPlan,
  reviewedTarget: ReviewedLootTarget,
  provider?: LootProvider,
): CampaignPlan {
  const combat = plan.combat;
  if (!combat) return plan;
  const npc = combat.npcs.find((npc) => npc.id === reviewedTarget.npcId);
  if (
    !npc ||
    npc.name !== reviewedTarget.name ||
    npc.rank !== 0 ||
    npc.maximumLevel === null ||
    npc.maximumLevel > reviewedTarget.maximumEnemyLevel ||
    (reviewedTarget.qualification &&
      (npc.minimumLevel !== reviewedTarget.qualification.minimumEnemyLevel ||
        npc.maximumLevel !== reviewedTarget.maximumEnemyLevel ||
        !npc.zoneIds.includes(reviewedTarget.qualification.areaId)))
  )
    return plan;
  const actions = new Set(
    plan.actions
      .filter(
        (action) =>
          action.source?.chapterId === reviewedTarget.chapterId &&
          action.source.stepId === reviewedTarget.stepId &&
          matchesQualification(action, plan, reviewedTarget, provider) &&
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
                    objective.loot.quantity !== null &&
                    (!reviewedTarget.qualification ||
                      (objective.loot.itemId === reviewedTarget.qualification.itemId &&
                        objective.loot.quantity === reviewedTarget.qualification.quantity &&
                        combat.lootDrops?.some(
                          (drop) => drop.itemId === objective.loot!.itemId && drop.npcId === npc.id,
                        ) &&
                        resolveCombatQuota(
                          { ...objective, npcIds: [npc.id] },
                          combat,
                          5,
                          "expected",
                        ).kills !== null)),
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
                      source: objective.source.endsWith(reviewedTarget.sourceSuffix)
                        ? objective.source
                        : objective.source + reviewedTarget.sourceSuffix,
                    }
                  : objective,
              ),
            }
          : activity,
      ),
    },
  };
}
