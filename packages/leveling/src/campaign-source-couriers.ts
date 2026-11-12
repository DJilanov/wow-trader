import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CampaignPartyQuestDecision } from "./campaign-party-policy.js";

function sourceKey(action: CampaignAction): string | null {
  const source = action.source;
  return source
    ? JSON.stringify([source.chapterId, source.version, source.stepId, source.conditions ?? null])
    : null;
}

/** Both courier phases must share independently selected stops, not add a new journey. */
export function campaignSourceCouriers(
  plan: CampaignPlan,
  library: readonly CampaignLibraryQuest[],
  decisions: ReadonlyMap<number, CampaignPartyQuestDecision>,
): ReadonlyMap<number, readonly (readonly number[])[]> {
  if (!plan.sharedQuestsOnly) return new Map();
  const stops = new Map<string, Set<number>>();
  for (const action of plan.actions) {
    const key = sourceKey(action);
    if (!key) continue;
    const ids = stops.get(key) ?? new Set<number>();
    for (const change of action.questChanges)
      if (decisions.get(change.questId)?.included) ids.add(change.questId);
    if (ids.size) stops.set(key, ids);
  }
  const result = new Map<number, readonly (readonly number[])[]>();
  for (const quest of library) {
    if (
      decisions.get(quest.questId)?.included ||
      quest.objective !== "delivery" ||
      !quest.complete ||
      quest.held ||
      quest.abandoned ||
      quest.actions.length !== 2
    )
      continue;
    if (
      quest.actions.some((action) => action.questChanges.length !== 1) ||
      quest.actions[0]!.questChanges[0]!.state !== "accepted" ||
      quest.actions[1]!.questChanges[0]!.state !== "rewarded"
    )
      continue;
    const anchors = quest.actions.map((action) => {
      const key = sourceKey(action);
      return key ? [...(stops.get(key) ?? [])].filter((id) => id !== quest.questId) : [];
    });
    if (anchors.every((ids) => ids.length > 0)) result.set(quest.questId, anchors);
  }
  return result;
}
