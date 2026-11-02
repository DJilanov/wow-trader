import type { CampaignPlan } from "./campaign.js";
import type { CombatActivity, CombatObjective } from "./combat-model.js";
import { combatObjectiveKey } from "./combat-model.js";
import { resolveJointCombatQuota } from "./combat-loot-joint.js";

function collectionGroups(objectives: readonly CombatObjective[]): readonly CombatObjective[][] {
  const remaining = new Set(objectives);
  const groups: CombatObjective[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value;
    if (!first) break;
    const group = [first];
    const ids = new Set(first.npcIds);
    remaining.delete(first);
    let grew = true;
    while (grew) {
      grew = false;
      for (const objective of remaining) {
        if (!objective.npcIds.some((id) => ids.has(id))) continue;
        group.push(objective);
        remaining.delete(objective);
        for (const id of objective.npcIds) ids.add(id);
        grew = true;
      }
    }
    groups.push(group);
  }
  return groups;
}

/** A declared five-player farming choice, never an inferred creature spawn distribution. */
export function attachCampaignReferenceFarmTargets(plan: CampaignPlan): CampaignPlan {
  const combat = plan.combat;
  if (!combat) return plan;
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const byAction = new Map<string, CombatActivity[]>();
  for (const activity of combat.activities) {
    const entries = byAction.get(activity.actionId) ?? [];
    entries.push(activity);
    byAction.set(activity.actionId, entries);
  }
  const replacements = new Map<string, CombatActivity>();
  const targets = new Map<string, readonly { readonly npcId: number; readonly name: string }[]>();
  for (const action of plan.actions) {
    if (!action.source || action.creatureTarget) continue;
    const activities = byAction.get(action.id) ?? [];
    if (activities.length !== 1) continue;
    const activity = activities[0]!;
    if (
      activity.environment !== "outdoor" ||
      activity.profile ||
      activity.objectives.some((objective) => objective.quotaConflict) ||
      activity.objectives.some((objective) => objective.npcIds.some((id) => !npcs.has(id))) ||
      !activity.objectives.some(
        (objective) => objective.credit === "personal-loot" && objective.npcIds.length > 1,
      )
    )
      continue;
    const collections = activity.objectives.filter(
      (objective) => objective.credit === "personal-loot",
    );
    if (
      activity.objectives.some(
        (objective) => objective.credit !== "personal-loot" && objective.npcIds.length !== 1,
      ) ||
      collections.some(
        (objective) =>
          !objective.loot?.sourceNpcIds?.length ||
          objective.npcIds.some((id) => !objective.loot!.sourceNpcIds!.includes(id)),
      )
    )
      continue;
    const chosen = new Map<string, CombatObjective>();
    for (const group of collectionGroups(collections)) {
      if (group.every((objective) => objective.npcIds.length === 1)) continue;
      const candidates = group[0]!.npcIds.filter((id) =>
        group.every((objective) => objective.npcIds.includes(id)),
      );
      const ranked = candidates
        .flatMap((npcId) => {
          const npc = npcs.get(npcId);
          if (
            !npc ||
            npc.rank === null ||
            npc.minimumLevel === null ||
            npc.maximumLevel === null ||
            npc.xpEligibility !== "assumed"
          )
            return [];
          const name = npc.name.normalize("NFKC").trim().toLowerCase();
          if (
            group.some((objective) =>
              objective.npcIds.some(
                (otherId) =>
                  otherId !== npcId &&
                  npcs.get(otherId)?.name.normalize("NFKC").trim().toLowerCase() === name,
              ),
            )
          )
            return [];
          const narrowed = group.map((objective) => ({ ...objective, npcIds: [npcId] }));
          const kills = activity.objectives.filter(
            (objective) => objective.credit === "shared-kills" && objective.npcIds[0] === npcId,
          );
          const quota = resolveJointCombatQuota([...narrowed, ...kills], combat, 5, "expected");
          return quota.status === "estimated"
            ? [{ npcId, kills: quota.kills, maximumLevel: npc.maximumLevel, objectives: narrowed }]
            : [];
        })
        .sort(
          (left, right) =>
            left.kills - right.kills ||
            left.maximumLevel - right.maximumLevel ||
            left.npcId - right.npcId,
        );
      const best = ranked[0];
      if (!best) break;
      for (const objective of best.objectives)
        chosen.set(combatObjectiveKey(objective), {
          ...objective,
          source: objective.source + "; explicit on-route five-player reference farm target",
        });
    }
    if (
      !chosen.size ||
      collections.some(
        (objective) => objective.npcIds.length > 1 && !chosen.has(combatObjectiveKey(objective)),
      )
    )
      continue;
    const objectives = activity.objectives.map(
      (objective) => chosen.get(combatObjectiveKey(objective)) ?? objective,
    );
    replacements.set(activity.id, { ...activity, objectives });
    targets.set(
      action.id,
      [...new Set(objectives.flatMap((objective) => objective.npcIds))].map((npcId) => ({
        npcId,
        name: npcs.get(npcId)!.name,
      })),
    );
  }
  if (!replacements.size) return plan;
  return {
    ...plan,
    actions: plan.actions.map((action) => {
      const selected = targets.get(action.id);
      if (!selected) return action;
      const instruction = `For these objectives, focus on ${selected.map((target) => target.name).join(" and ")}.`;
      const previousInstruction = action.referenceCreatureTargets
        ? `For these objectives, focus on ${action.referenceCreatureTargets.map((target) => target.name).join(" and ")}.`
        : null;
      return {
        ...action,
        referenceCreatureTargets: selected,
        instructions: [
          ...action.instructions.filter(
            (line) => line !== previousInstruction && line !== instruction,
          ),
          instruction,
        ],
      };
    }),
    combat: {
      ...combat,
      activities: combat.activities.map((activity) => replacements.get(activity.id) ?? activity),
    },
  };
}
