import type { CampaignFundingExecutor } from "./campaign-funding-scenarios.js";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignFundingBatch } from "./campaign-funding-quests.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";
import { campaignActionZones } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignFundingStates, type CampaignFundingState } from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import type { CampaignXpEvent } from "./campaign-xp-event.js";
import { campaignTimedQuestMethodIssues } from "./campaign-quest-timing.js";

function journey(actions: readonly CampaignAction[]): { visits: number; hops: number } | null {
  let previous: string | undefined;
  let visits = 0;
  let hops = 0;
  for (const action of actions) {
    if (action.leaderOnly || action.movement || ["checkpoint", "xp-check"].includes(action.kind))
      continue;
    const zones = campaignActionZones(action);
    if (zones.length !== 1 || zones[0] === previous) continue;
    if (previous) {
      const path = campaignGroundJourney(previous, zones[0]!);
      if (!path) return null;
      hops += path.length;
    }
    visits++;
    previous = zones[0];
  }
  return { visits, hops };
}

function eventKey(step: CampaignXpEvent): string {
  return `${step.actionId}:${step.questId}:${step.phase}:${step.objectiveIndex}`;
}

function preservesReachedWork(
  before: CampaignFundingState,
  after: CampaignFundingState,
  moved: ReadonlySet<string>,
  actions: readonly CampaignAction[],
  catalog: QuestCatalog,
): boolean {
  return before.progress.members.every((_member, player) => {
    const original = before.forecast.flatMap((section) => section.members[player]!.steps);
    const next = after.forecast.flatMap((section) => section.members[player]!.steps);
    const events = new Map(next.map((step) => [eventKey(step), step]));
    // Moving rewards must not lower the level available for any previously reached encounter.
    if (
      original.some((step) => {
        if (step.status !== "projected" || moved.has(step.actionId)) return false;
        const candidate = events.get(eventKey(step));
        return (
          !candidate ||
          candidate.status !== "projected" ||
          candidate.before.level < step.before.level
        );
      })
    )
      return false;
    return actions.every((action) => {
      const change = action.questChanges[0]!;
      const step = events.get(
        `${action.id}:${change.questId}:${change.state}:${change.objectiveIndex}`,
      );
      const quest = catalog.quests.find((entry) => entry.questId === change.questId)!;
      return step?.status === "projected" && step.before.level >= quest.minimumLevel!;
    });
  });
}

/** Place an already-qualified, whole NPC delivery batch in an earlier visit to its zone. */
export function batchFundingNpcVisit(
  plan: CampaignPlan,
  batch: CampaignFundingBatch,
  catalog: QuestCatalog,
  states: readonly CampaignFundingState[],
  statesForPlan: CampaignFundingExecutor = campaignFundingStates,
): { readonly plan: CampaignPlan; readonly states: readonly CampaignFundingState[] } {
  const unchanged = { plan, states };
  const ids = new Set(batch.actions.map((action) => action.id));
  const actions = plan.actions.filter((action) => ids.has(action.id));
  const first = plan.actions.findIndex((action) => ids.has(action.id));
  const zones = new Set(actions.flatMap(campaignActionZones));
  const legId = actions[0]?.legId;
  if (
    !states.length ||
    states.some((state) => state.progress.members.length !== 5) ||
    batch.requiredKills !== 0 ||
    !batch.questIds.length ||
    new Set(batch.questIds).size !== batch.questIds.length ||
    actions.length !== batch.questIds.length * 2 ||
    actions.length !== batch.actions.length ||
    zones.size !== 1 ||
    actions.some(
      (action, index) =>
        plan.actions[first + index] !== action ||
        action.legId !== legId ||
        action.kind !== "quests" ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.bundleId ||
        !action.fundingCheckpointId ||
        action.nativeUtilityTags?.length ||
        campaignActionZones(action).length !== 1 ||
        action.questChanges.length !== 1 ||
        !["accepted", "rewarded"].includes(action.questChanges[0]!.state),
    ) ||
    batch.questIds.some((id) => {
      const quest = catalog.quests.find((entry) => entry.questId === id);
      const phases = actions
        .flatMap((action) => action.questChanges)
        .filter((change) => change.questId === id);
      return (
        !quest ||
        quest.minimumLevel === null ||
        !isUnrestrictedFundingQuest(quest) ||
        quest.category !== "delivery" ||
        quest.objectives.length > 0 ||
        quest.objectStarts?.length ||
        phases.length !== 2 ||
        phases[0]!.state !== "accepted" ||
        phases[1]!.state !== "rewarded"
      );
    })
  )
    return unchanged;
  const zone = [...zones][0]!;
  // Include adjacent legs in the travel comparison without letting an unrelated later
  // uncalibrated journey disable this local improvement.
  let start = first;
  let end = first + actions.length;
  while (start > 0 && plan.actions[start - 1]!.legId === legId) start--;
  while (end < plan.actions.length && plan.actions[end]!.legId === legId) end++;
  const scoped = (entries: readonly CampaignAction[]): readonly CampaignAction[] =>
    entries.slice(Math.max(0, start - 1), Math.min(entries.length, end + 1));
  const beforeJourney = journey(scoped(plan.actions));
  if (!beforeJourney) return unchanged;
  for (let index = first - 1; index >= start; index--) {
    const anchor = plan.actions[index]!;
    if (["checkpoint", "xp-check"].includes(anchor.kind)) break;
    if (
      anchor.kind !== "quests" ||
      anchor.leaderOnly ||
      anchor.raidOnly ||
      anchor.dungeonFinishOnly ||
      campaignActionZones(anchor).length !== 1 ||
      campaignActionZones(anchor)[0] !== zone ||
      states.some((state) =>
        state.progress.members.some(
          (_member, player) =>
            !state.forecast.some((section) =>
              section.members[player]!.steps.some(
                (step) => step.actionId === anchor.id && step.status === "projected",
              ),
            ),
        ),
      )
    )
      continue;
    const ordered = plan.actions.flatMap((action) =>
      ids.has(action.id) ? [] : action.id === anchor.id ? [action, ...actions] : [action],
    );
    const afterJourney = journey(scoped(ordered));
    const timings = catalog.quests.flatMap((quest) => quest.timeLimitSeconds === undefined ? [] : [{ questId: quest.questId, title: quest.title, timeLimitSeconds: quest.timeLimitSeconds }]);
    const beforeTimingIssues = campaignTimedQuestMethodIssues(plan.actions, timings);
    if ([...campaignTimedQuestMethodIssues(ordered, timings)].some(([id, reason]) => beforeTimingIssues.get(id) !== reason)) continue;
    if (
      !afterJourney ||
      afterJourney.visits >= beforeJourney.visits ||
      afterJourney.hops > beforeJourney.hops
    )
      continue;
    const proposed: CampaignPlan = {
      ...plan,
      actions: ordered,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: ordered.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    };
    const next = statesForPlan(proposed);
    if (
      regressedFundingScenarios(plan, states, next).length ||
      next.some((state, at) => {
        const scenario = guidePartyScenario(proposed, state.progress, state.starterMode);
        return (
          !preservesReachedWork(states[at]!, state, ids, actions, catalog) ||
          auditCampaignQuestLog(scenario.plan, scenario.progress, scenario).some(
            (member) => !member.withinCapacity,
          )
        );
      })
    )
      continue;
    return { plan: proposed, states: next };
  }
  return unchanged;
}
