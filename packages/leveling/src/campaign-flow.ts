import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CampaignMovement } from "./campaign-flow-model.js";
import {
  campaignActionZones,
  campaignZoneId,
  campaignZoneInText,
  campaignZoneName,
} from "./campaign-geography.js";
import { campaignJourneyInstructions } from "./campaign-transport.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";

/** Preserve source provenance while replacing solo transfers with the selected itinerary. */
export function attachCampaignMovements(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.filter((visit) => selected.has(visit.id)).flatMap(
    (visit) => visit.sourceTag ?? [],
  );
  const sourceSteps = new Map(
    sources.flatMap((source) =>
      source.guide.steps.map((step) => [`${source.guide.chapterId}:${step.id}`, step] as const),
    ),
  );
  const finalStarter = plan.legs.filter((leg) => leg.kind === "starter").at(-1)?.id;
  const actions = plan.actions.map((action, index): CampaignAction => {
    if (!action.source || action.questChanges.length || action.kind !== "instructions")
      return action;
    if (
      action.nativeUtilityTags &&
      !action.nativeUtilityTags.some((tag) => [".fly", ".hs", ".zone"].includes(tag))
    )
      return action;
    const step = sourceSteps.get(`${action.source.chapterId}:${action.source.stepId}`);
    if (!step) return action;
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter(
          (directive) => ![".group", ".solo"].includes(directive.tag),
        ),
      },
      profile,
      { dungeons },
    );
    const directive = view.directives.find((entry) => [".fly", ".hs", ".zone"].includes(entry.tag));
    if (!directive) return action;
    const destination =
      campaignZoneId(directive.arguments.split(",")[0]!) ?? campaignZoneInText(directive.text);
    if (!destination) return action;
    const remaining = plan.actions.slice(index + 1).filter((entry) => entry.legId === action.legId);
    const terminal =
      action.legId === finalStarter &&
      remaining.every((entry) => ["checkpoint", "xp-check"].includes(entry.kind));
    const origin = action.location?.zone ?? campaignActionZones(action)[0];
    const movement: CampaignMovement = {
      kind: directive.tag === ".fly" ? "flight" : directive.tag === ".hs" ? "hearth" : "road",
      destination,
      terminal,
      ...(origin ? { origin } : {}),
    };
    const instructions = view.directives
      .filter((entry) => [".fp", ".trainer", ".vendor"].includes(entry.tag))
      .map(
        (entry) =>
          entry.text ||
          (entry.tag === ".fp"
            ? `Learn the ${entry.arguments} flight path before leaving.`
            : entry.tag === ".trainer"
              ? "Train your class skills before continuing."
              : "Restock supplies before continuing."),
      );
    return { ...action, movement, positions: [], instructions };
  });
  return { ...plan, actions, flowRevision: "player-route-20261031-v1" };
}

/** Applied after optional stops are selected, so omitted visits cannot become travel origins. */
export function campaignTravelActions(
  plan: CampaignPlan,
  actions: readonly CampaignAction[],
  routeAction: (action: CampaignAction) => boolean = () => true,
): readonly CampaignAction[] {
  let current: string | null = null;
  let inside: string | null = null;
  const result: CampaignAction[] = [];
  for (const [index, action] of actions.entries()) {
    const needed = routeAction(action);
    const next = action.movement?.terminal
      ? actions
          .slice(index + 1)
          .find((entry) => routeAction(entry) && (entry.location || entry.movement))
      : undefined;
    const target = action.movement
      ? action.movement.terminal
        ? (next?.movement?.destination ?? next?.location?.zone ?? "1439")
        : action.movement.destination
      : action.location?.zone;
    const origin = current ?? action.movement?.origin ?? null;
    const travel =
      origin && target && origin !== target
        ? [...campaignJourneyInstructions(origin, target, plan.leaderClass)]
        : [];
    const destinationInside = action.location?.insideDungeon ?? null;
    if (!action.movement && destinationInside && inside !== destinationInside) {
      const dungeon = PREMADE_STOPS.find((stop) => stop.id === destinationInside);
      const name =
        (action.dungeonFinishOnly
          ? DUNGEON_VISITS.find((visit) => visit.id === destinationInside)?.name
          : null) ??
        dungeon?.name ??
        destinationInside;
      travel.push(`Enter ${name} together after collecting the outside pickups listed above.`);
    }
    if (!action.movement && inside && target && destinationInside === null) {
      const dungeon = PREMADE_STOPS.find((stop) => stop.id === inside);
      const name =
        (action.dungeonFinishOnly
          ? DUNGEON_VISITS.find((visit) => visit.id === inside)?.name
          : null) ??
        dungeon?.name ??
        inside;
      travel.unshift(`Finish the inside hand-ins, then leave ${name} for the return below.`);
    }
    result.push(
      action.movement
        ? {
            ...action,
            title: `Travel to ${campaignZoneName(target ?? action.movement.destination)}`,
            instructions: action.instructions,
            travelInstructions: [
              ...(action.movement.kind === "hearth" && !action.movement.terminal
                ? [
                    `Use your Hearthstone only if it is ready and bound to ${campaignZoneName(target!)}. Otherwise use the route below.`,
                  ]
                : []),
              ...(travel.length
                ? travel
                : [`Continue in ${campaignZoneName(target ?? action.movement.destination)}.`]),
            ],
          }
        : { ...action, travelInstructions: travel },
    );
    if (needed && target) {
      current = target;
      inside = destinationInside;
    }
  }
  return result;
}
