import {
  combatObjectiveKey,
  type CampaignCombatPlan,
  type CombatActivity,
  type CombatNpc,
  type CombatObjective,
} from "./combat-model.js";

export interface SharedPartyCombatIndex {
  readonly combat: CampaignCombatPlan;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
  readonly objectivesByNpc: ReadonlyMap<number, ReadonlyMap<string, CombatObjective>>;
  readonly conflictingQuestsByNpc: ReadonlyMap<number, ReadonlySet<number>>;
}

/** Build once per forecast; each action then examines only the creatures it actually needs. */
export function indexSharedPartyCombat(
  combat: CampaignCombatPlan,
  activities: readonly CombatActivity[] = combat.activities,
): SharedPartyCombatIndex {
  if (activities !== combat.activities) {
    const own = new Set(combat.activities);
    if (activities.some((activity) => !own.has(activity)))
      throw new Error("Shared combat reference activity belongs to another plan.");
  }
  const objectives = new Map<string, CombatObjective>();
  const conflicts = new Map<number, Set<number>>();
  for (const activity of activities)
    for (const objective of activity.objectives) {
      const key = combatObjectiveKey(objective),
        previous = objectives.get(key);
      if (
        objective.quotaConflict ||
        (previous &&
          (previous.credit !== objective.credit ||
            previous.requiredKills !== objective.requiredKills ||
            previous.npcIds.length !== objective.npcIds.length ||
            previous.npcIds.some((npcId, index) => npcId !== objective.npcIds[index])))
      )
        for (const npcId of new Set([...objective.npcIds, ...(previous?.npcIds ?? [])])) {
          const quests = conflicts.get(npcId) ?? new Set<number>();
          quests.add(objective.questId);
          conflicts.set(npcId, quests);
        }
      if (!previous) objectives.set(key, objective);
    }

  const dropNpcs = new Map<number, Set<number>>();
  for (const drop of [...(combat.lootDrops ?? []), ...(combat.historicalLoot?.drops ?? [])]) {
    const npcs = dropNpcs.get(drop.itemId) ?? new Set<number>();
    npcs.add(drop.npcId);
    dropNpcs.set(drop.itemId, npcs);
  }
  const byNpc = new Map<number, Map<string, CombatObjective>>();
  for (const [key, objective] of objectives) {
    const targets = new Set(objective.npcIds);
    if (objective.loot)
      for (const npcId of dropNpcs.get(objective.loot.itemId) ?? []) targets.add(npcId);
    for (const npcId of targets) {
      const related = byNpc.get(npcId) ?? new Map<string, CombatObjective>();
      related.set(key, objective);
      byNpc.set(npcId, related);
    }
  }
  return {
    combat,
    npcs: new Map(combat.npcs.map((npc) => [npc.id, npc])),
    objectivesByNpc: byNpc,
    conflictingQuestsByNpc: conflicts,
  };
}
