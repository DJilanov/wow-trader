import type { CampaignPlan } from "./campaign.js";
import type { CombatQuestReference } from "./combat-model.js";

/** Explicit provider indices remain required even when a route retains only one objective. */
export function referencedQuestObjectiveIndexes(
  quests: readonly CombatQuestReference[],
): Readonly<Record<string, readonly number[]>> {
  const entries: [string, readonly number[]][] = [];
  for (const quest of quests) {
    const indices = new Set([
      ...(quest.killQuotas?.map((quota) => quota.objectiveIndex) ?? []),
      ...(quest.killQuotaConflicts ?? []),
      ...(quest.itemObjectives?.flatMap((objective) =>
        objective.objectiveIndex === null ? [] : [objective.objectiveIndex],
      ) ?? []),
    ]);
    if (indices.size) entries.push([String(quest.questId), [...indices].sort((a, b) => a - b)]);
  }
  return Object.fromEntries(entries);
}

export function campaignQuestObjectiveIndexes(
  plan: CampaignPlan,
): ReadonlyMap<number, ReadonlySet<number>> {
  const indices = new Map<number, Set<number>>();
  for (const row of plan.itemRequirements ?? []) {
    const own = indices.get(row.questId) ?? new Set<number>();
    own.add(row.objectiveIndex);
    indices.set(row.questId, own);
  }
  for (const [id, required] of Object.entries(plan.combat?.questObjectiveIndexes ?? {}))
    indices.set(Number(id), new Set([...(indices.get(Number(id)) ?? []), ...required]));
  for (const action of plan.actions)
    for (const change of action.questChanges) {
      if (change.state !== "objectives-complete") continue;
      const required = indices.get(change.questId) ?? new Set<number>();
      required.add(change.objectiveIndex ?? 1);
      indices.set(change.questId, required);
    }
  return indices;
}

export function mergeQuestObjectiveIndexes(
  entries: readonly (Readonly<Record<string, readonly number[]>> | undefined)[],
): Readonly<Record<string, readonly number[]>> {
  const merged = new Map<string, Set<number>>();
  for (const entry of entries)
    for (const [id, indices] of Object.entries(entry ?? {})) {
      const required = merged.get(id) ?? new Set<number>();
      for (const index of indices) required.add(index);
      merged.set(id, required);
    }
  return Object.fromEntries(
    [...merged].map(([id, indices]) => [id, [...indices].sort((a, b) => a - b)]),
  );
}
