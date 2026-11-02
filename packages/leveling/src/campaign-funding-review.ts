import type { CampaignPlan } from "./campaign.js";
import type { CampaignQuestFunding, CampaignQuestFundingGap } from "./campaign-quest-funding.js";
import {
  campaignFundingStates,
  campaignFundingCheckpoints,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";

export function campaignFundingReview(
  plan: CampaignPlan,
  states: readonly CampaignFundingState[],
): Pick<CampaignQuestFunding, "remaining" | "scenarios"> {
  if (!states.length) throw new Error("Funding review requires a party configuration.");
  function remaining(state: CampaignFundingState): readonly CampaignQuestFundingGap[] {
    return [
      ...new Set(
        state.progress.members.flatMap((_member, player) =>
          campaignFundingCheckpoints(state, player)
            .filter((checkpoint) => !checkpoint.ready)
            .map((checkpoint) => checkpoint.actionId),
        ),
      ),
    ]
      .filter((id) => plan.actions.some((action) => action.id === id))
      .map((checkpointId) => ({
        checkpointId,
        missingXpByPlayer: state.progress.members.map(
          (_member, player) =>
            campaignFundingCheckpoints(state, player).find(
              (checkpoint) => checkpoint.actionId === checkpointId,
            )?.missingXp ?? null,
        ),
      }));
  }
  return {
    remaining: remaining(states[0]!),
    scenarios: states.map((state) => ({
      difficultyPolicy: state.difficultyPolicy,
      starterMode: state.starterMode,
      strategy: state.strategy,
      optionalStops: state.optionalStops,
      remaining: remaining(state),
      blockedReasonsByPlayer: state.progress.members.map(
        (_member, player) =>
          state.forecast.find((section) => section.members[player]!.blockedReason !== null)
            ?.members[player]!.blockedReason ?? null,
      ),
    })),
  };
}

/** Recalculate diagnostics after task compilation without changing quest allocation or XP. */
export function refreshCampaignFundingReview(plan: CampaignPlan): CampaignPlan {
  if (!plan.questFunding) return plan;
  return {
    ...plan,
    questFunding: {
      ...plan.questFunding,
      ...campaignFundingReview(plan, campaignFundingStates(plan)),
    },
  };
}
