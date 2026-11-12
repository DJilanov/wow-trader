import {
  campaignFundingProgressAfter,
  campaignFundingXpBoundsAfter,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";
import type { CampaignXpBounds } from "./campaign-xp-bounds.js";
import { premadeProgressSchema, type PremadeProgress } from "./premade-model.js";
import type { CampaignCombatProjection } from "./campaign-combat-projection.js";

export interface CampaignRouteHandoff {
  readonly kind: "projected-reference-xp";
  readonly afterActionId: string;
  readonly progress: PremadeProgress;
  readonly xpBounds: readonly CampaignXpBounds[];
  readonly combatProjection?: CampaignCombatProjection;
}

/** A validation snapshot is projected state, never a report of an actual player's progress. */
export function campaignRouteHandoff(
  state: CampaignFundingState,
  afterActionId: string,
): CampaignRouteHandoff {
  const boundary = state.actions.findIndex((action) => action.id === afterActionId);
  if (boundary < 0) throw new Error("Route handoff action is not active in this scenario.");
  const prefix = new Set(state.actions.slice(0, boundary + 1).map((action) => action.id));
  for (const section of state.forecast)
    for (const member of section.members) {
      if (member.blockedAtActionId && prefix.has(member.blockedAtActionId))
        throw new Error(`Route handoff crosses a blocked checkpoint at ${member.blockedAtActionId}.`);
      for (const step of member.steps)
        if (prefix.has(step.actionId) && (step.status !== "projected" || step.after === null))
          throw new Error(`Route handoff crosses an unresolved forecast at ${step.actionId}.`);
    }
  const bounds = campaignFundingXpBoundsAfter(state, afterActionId);
  const xpBounds = bounds.map((value): CampaignXpBounds => {
    if (value === null) throw new Error("Route handoff needs known XP bounds for every player.");
    return value;
  });
  const progress = premadeProgressSchema.parse(campaignFundingProgressAfter(state, afterActionId));
  if (progress.members.some((member) => member.level === null || member.currentXp === null || member.xpNeedsUpdate))
    throw new Error("Route handoff needs a known projected bar for every player.");
  const projections = state.forecast.flatMap((section) => section.combatProjections?.[afterActionId]
    ? [section.combatProjections[afterActionId]!] : []);
  if (projections.length > 1) throw new Error("Route handoff has duplicate combat snapshots.");
  return { kind: "projected-reference-xp", afterActionId, progress, xpBounds,
    ...(projections[0] ? { combatProjection: projections[0] } : {}) };
}
