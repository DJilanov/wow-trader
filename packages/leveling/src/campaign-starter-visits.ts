import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignFundingStates } from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { CAMPAIGN_STARTER_VISIT_RULES } from "./campaign-starter-visit-rules.js";
import { proposeCampaignStarterVisit } from "./campaign-starter-visit-proposal.js";
import { deferUnfundedStarterPickups } from "./campaign-pickup-order.js";

/** Defer unavailable starter work to its reviewed later visit without dropping its lifecycle. */
export function deferCampaignStarterVisits(
  initial: CampaignPlan,
  sources: readonly CampaignSource[],
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    initial.race !== "human" ||
    initial.targetBuild !== catalog.targetBuild ||
    initial.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    initial.combat?.targetBuild !== initial.targetBuild ||
    initial.combat.sourceRevision !== catalog.providerRevision
  )
    return initial;
  let plan = initial;
  const starterOnly = initial.legs.every((leg) => leg.kind === "starter");
  const original = campaignFundingStates(plan);
  let states = original;
  const movedTriggers = new Set<number>();
  for (const rule of CAMPAIGN_STARTER_VISIT_RULES) {
    if (rule.classSlug && rule.classSlug !== plan.leaderClass) continue;
    const minimumLevel = rule.minimumLevel ?? 10;
    if (
      catalog.quests.find((quest) => quest.questId === rule.triggerQuestId)?.minimumLevel !==
      minimumLevel
    )
      continue;
    const blocked = states.some((state) =>
      state.forecast.some((section) =>
        section.members.some((member) =>
          member.steps.some(
            (step) =>
              step.questId === rule.triggerQuestId &&
              step.phase === "accepted" &&
              step.status === "blocked" &&
              step.minimumLevel === minimumLevel &&
              step.shortfallXp > 0,
          ),
        ),
      ),
    );
    if (!blocked) continue;
    const proposal = proposeCampaignStarterVisit(
      plan,
      rule,
      catalog,
      campaignNativeInstructions(plan, sources),
    );
    if (!proposal) continue;
    plan = deferUnfundedStarterPickups(proposal);
    states = campaignFundingStates(plan);
    movedTriggers.add(rule.triggerQuestId);
  }
  // Only the complete compound proposal is executable; an intermediate move may expose the next gate.
  if (
    regressedFundingScenarios(initial, original, states).length ||
    states.some((state) => {
      const party = guidePartyScenario(plan, state.progress, state.starterMode);
      return auditCampaignQuestLog(party.plan, party.progress, party).some(
        (member) => !member.withinCapacity,
      );
    })
  )
    return initial;
  // A partial deferral can merely expose another unavailable pickup before the replacement visit.
  if (
    states.some((state) =>
      state.progress.members
        .slice(0, starterOnly ? 1 : state.progress.members.length)
        .some((_member, player) =>
          [...movedTriggers].some(
            (questId) =>
              !state.forecast.some((section) =>
                section.members[player]!.steps.some(
                  (step) =>
                    step.questId === questId &&
                    step.phase === "accepted" &&
                    step.status === "projected",
                ),
              ),
          ),
        ),
    )
  )
    return initial;
  return plan;
}
