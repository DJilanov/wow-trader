import type { CampaignQuestChange } from "./campaign.js";
import { combatObjectiveKey, type CombatActivity } from "./combat-model.js";

/** Consecutive same-creature objectives share combat; hand-ins and new pickups split phases. */
export function combatActivityPhase(
  activity: CombatActivity,
  changes: readonly CampaignQuestChange[],
  current: CampaignQuestChange,
): CombatActivity {
  const own = activity.objectives.filter(
    (objective) =>
      objective.questId === current.questId &&
      (activity.questWide || objective.objectiveIndex === (current.objectiveIndex ?? 1)),
  );
  const last = activity.objectives.at(-1);
  const separate = {
    ...activity,
    id: `${activity.id}-${current.questId}-${current.objectiveIndex ?? 1}`,
    objectives: own,
    profile:
      last?.questId === current.questId &&
      (activity.questWide || last.objectiveIndex === (current.objectiveIndex ?? 1))
        ? activity.profile
        : null,
  };
  if (activity.questWide || activity.profile || !own.length) return separate;
  const index = changes.indexOf(current);
  if (index < 0) throw new Error("Combat objective is absent from its action phase.");
  let start = index,
    end = index + 1;
  while (start > 0 && changes[start - 1]!.state === "objectives-complete") start--;
  while (end < changes.length && changes[end]!.state === "objectives-complete") end++;
  const keys = new Set(
    changes.slice(start, end).map((change) => `${change.questId}:${change.objectiveIndex ?? 1}`),
  );
  const objectives = activity.objectives.filter((objective) =>
    keys.has(combatObjectiveKey(objective)),
  );
  const npcId = objectives[0]?.npcIds[0];
  if (
    objectives.length < 2 ||
    !objectives.some((objective) => objective.credit === "personal-loot") ||
    !objectives.every((objective) => objective.npcIds.length === 1 && objective.npcIds[0] === npcId)
  )
    return separate;
  return { ...activity, id: `${activity.id}-joint-${start}`, objectives, profile: null };
}
