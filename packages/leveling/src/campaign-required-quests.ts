import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";

/** Keep complete configured source handoffs when their shared visit's XP target is already met. */
export function retainCampaignBridgeQuests(plan: CampaignPlan): CampaignPlan {
  if (!plan.sharedQuestsOnly) return plan;
  const retained = new Set<string>();
  for (const block of CAMPAIGN_BRIDGES) {
    if (!plan.legs.some((leg) => leg.id === block.id && leg.kind === block.purpose)) continue;
    for (const group of block.mandatoryQuestGroups ?? []) {
      if (!group.length) continue;
      const ids = new Set(group);
      const actions = plan.actions.filter((action) =>
        action.questChanges.some((change) => ids.has(change.questId)),
      );
      if (
        !actions.length ||
        actions.some(
          (action) =>
            action.legId !== block.id ||
            action.kind !== "quests" ||
            !action.source ||
            action.leaderOnly ||
            action.raidOnly ||
            action.dungeonFinishOnly ||
            action.bundleId !== undefined ||
            action.questChanges.some((change) => !ids.has(change.questId)),
        )
      )
        continue;
      const complete = [...ids].every((questId) => {
        const phases = actions.flatMap((action) =>
          action.questChanges.filter((change) => change.questId === questId),
        );
        return (
          phases.length === 2 && phases[0]?.state === "accepted" && phases[1]?.state === "rewarded"
        );
      });
      if (complete) for (const action of actions) retained.add(action.id);
    }
  }
  if (!plan.actions.some((action) => retained.has(action.id) && !action.libraryRequired))
    return plan;
  return {
    ...plan,
    actions: plan.actions.map((action): CampaignAction =>
      retained.has(action.id) ? { ...action, libraryRequired: true } : action,
    ),
  };
}
