import type { CampaignAction, CampaignLeg, CampaignPlan } from "./campaign.js";
import type { CampaignPartyStarter } from "./restedxp-documents.js";

export interface CampaignPartyExport {
  readonly plan: CampaignPlan;
  readonly actions: readonly CampaignAction[];
  readonly personalActionIds: ReadonlySet<string>;
  readonly personalPlan: CampaignPlan;
}

/** Uses the same personal branches as the browser's independent-party XP ledger. */
export function campaignPartyExport(
  plan: CampaignPlan,
  actions: readonly CampaignAction[],
  starter: CampaignPartyStarter,
): CampaignPartyExport {
  const same = starter.race === plan.race && starter.classSlug === plan.leaderClass;
  const branch = plan.starters?.routes.find(
    (route) => route.race === starter.race && route.classSlug === starter.classSlug,
  );
  if (!same && !branch)
    throw new Error("The selected party member's personal starter is unavailable.");
  const sourceLegs = same ? plan.legs.filter((leg) => leg.kind === "starter") : branch!.legs;
  const legIds = new Set(sourceLegs.map((leg) => leg.id));
  const sourceActions = same
    ? actions.filter((action) => action.leaderOnly && legIds.has(action.legId))
    : branch!.actionIndexes.map((index) => plan.starters!.entries[index]!.action);
  if (!sourceActions.length)
    throw new Error("The selected party member's personal starter has no actions.");
  const prefix = "party-personal-";
  const personal = sourceActions.map((action): CampaignAction => ({
    ...action,
    id: `${prefix}${action.id}`,
    legId: `${prefix}${action.legId}`,
    leaderOnly: true,
  }));
  const personalLegs = sourceLegs
    .map((leg): CampaignLeg => ({
      ...leg,
      id: `${prefix}${leg.id}`,
      actionIds: personal
        .filter((action) => action.legId === `${prefix}${leg.id}`)
        .map((action) => action.id),
    }))
    .filter((leg) => leg.actionIds.length > 0);
  const shared = actions.filter((action) => !action.leaderOnly);
  const sharedLegIds = new Set(shared.map((action) => action.legId));
  const combined = [...personal, ...shared];
  return {
    plan: {
      ...plan,
      legs: [...personalLegs, ...plan.legs.filter((leg) => sharedLegIds.has(leg.id))],
      actions: combined,
    },
    actions: combined,
    personalActionIds: new Set(personal.map((action) => action.id)),
    personalPlan: { ...plan, race: starter.race, leaderClass: starter.classSlug },
  };
}
