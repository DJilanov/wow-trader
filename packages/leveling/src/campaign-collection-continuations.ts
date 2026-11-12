import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { CampaignFundingCollection } from "./campaign-funding-collections.js";
import { requiresDungeonQuestVisit } from "./campaign-funding-quests.js";
import { campaignFundingProgressBefore, type CampaignFundingState } from "./campaign-funding-scenarios.js";
import { MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP } from "./campaign-combat-policy.js";

export interface CampaignCollectionContinuation {
  readonly questId: number;
  readonly plan: CampaignPlan;
  readonly movedActionIds: ReadonlySet<string>;
}

function sameSourcePhase(action: CampaignAction, qualified: CampaignAction): boolean {
  return action.source !== null && qualified.source !== null &&
    JSON.stringify(action.source) === JSON.stringify(qualified.source) &&
    JSON.stringify(action.questChanges) === JSON.stringify(qualified.questChanges);
}

/** Propose only the unexecuted tail. Full-route replay, rather than a fresh-quota prototype, validates it. */
export function* campaignCollectionContinuations(
  plan: CampaignPlan,
  gate: CampaignAction,
  state: CampaignFundingState,
  collections: ReadonlyMap<number, CampaignFundingCollection>,
  minimumInsertionIndex: number,
): Generator<CampaignCollectionContinuation> {
  const gateIndex = plan.actions.findIndex((action) => action.id === gate.id);
  if (!plan.sharedQuestsOnly || gate.leaderOnly || gateIndex < minimumInsertionIndex) return;
  const progress = campaignFundingProgressBefore(state, gate.id);
  if (progress.members.length !== 5 || progress.members.some((member) => member.level === null)) return;
  const enemyCeiling = Math.min(...progress.members.map((member) => member.level!)) +
    MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP;
  const activeIds = new Set(state.actions.map((action) => action.id));
  for (const [questId, method] of collections) {
    if (method.maximumEnemyLevel > enemyCeiling || requiresDungeonQuestVisit(questId) ||
      progress.members.some((member) => member.questStates[String(questId)] !== "accepted")) continue;
    const own = plan.actions.filter((action) => action.questChanges.some((change) => change.questId === questId));
    if (own.some((action) => action.kind !== "quests" || !action.source ||
      action.leaderOnly || action.raidOnly || action.dungeonFinishOnly ||
      action.location?.insideDungeon || !activeIds.has(action.id) ||
      plan.legs.find((leg) => leg.id === action.legId)?.kind === "dungeon")) continue;
    const pickups = own.filter((action) => action.questChanges.some((change) =>
      change.questId === questId && change.state === "accepted"));
    const remaining = own.filter((action) => !pickups.includes(action));
    const qualified = method.actions.filter((action) => action.questChanges.every((change) => change.state !== "accepted"));
    if (pickups.length !== 1 || plan.actions.indexOf(pickups[0]!) >= gateIndex ||
      progress.members.some((_member, player) => !state.forecast.some((section) =>
        section.members[player]!.steps.some((step) => step.actionId === pickups[0]!.id &&
          step.questId === questId && step.phase === "accepted" && step.status === "projected"))) ||
      remaining.length !== qualified.length || remaining.length < 2 ||
      remaining.some((action, index) => plan.actions.indexOf(action) <= gateIndex ||
        action.questChanges.some((change) => change.questId !== questId) ||
        !sameSourcePhase(action, qualified[index]!))) continue;
    const movedActionIds = new Set(remaining.map((action) => action.id));
    const moved = remaining.map((action) => ({ ...action, legId: gate.legId }));
    const actions = plan.actions.filter((action) => !movedActionIds.has(action.id));
    actions.splice(gateIndex, 0, ...moved);
    yield {
      questId,
      movedActionIds,
      plan: {
        ...plan,
        actions,
        legs: plan.legs.map((leg) => {
          const own = actions.filter((action) => action.legId === leg.id);
          return { ...leg, actionIds: own.map((action) => action.id),
            questIds: [...new Set(own.flatMap((action) => action.questChanges.map((change) => change.questId)))] };
        }),
      },
    };
  }
}
