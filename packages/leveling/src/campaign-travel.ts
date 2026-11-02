import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import { getGuideStepView } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { PREMADE_STOPS } from "./premade.js";
import { campaignZoneId } from "./campaign-geography.js";
import { campaignActionSource } from "./campaign-source-conditions.js";

export interface CampaignFlightPath {
  readonly key: string;
  readonly title: string;
  readonly actionId: string;
  readonly chapterId: string;
}

/** Retain source-authored flight masters on actual route visits; no remote unlocks are invented. */
export function attachCampaignFlightPaths(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
): CampaignPlan {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const selected = new Set(PREMADE_STOPS.flatMap((stop) => stop.visitIds));
  const dungeons = DUNGEON_VISITS.flatMap((visit) =>
    selected.has(visit.id) && visit.sourceTag ? [visit.sourceTag] : [],
  );
  const candidates: {
    index: number;
    after: boolean;
    node: CampaignFlightPath;
    action: CampaignAction;
    existing: boolean;
  }[] = [];
  for (const source of sources) {
    const visits = plan.actions.flatMap((action, index) =>
      action.source?.chapterId === source.guide.chapterId &&
      !["xp-check", "checkpoint"].includes(action.kind)
        ? [{ action, index }]
        : [],
    );
    if (!visits.length) continue;
    const ordinals = new Map(source.guide.steps.map((step) => [step.id, step.ordinal]));
    const audienceKey = (action: CampaignAction): string =>
      `${action.leaderOnly ? "leader" : "party"}${action.raidOnly ? "-raid" : ""}`;
    for (const audience of new Set(visits.map(({ action }) => audienceKey(action)))) {
      const routed = visits.filter(({ action }) => audienceKey(action) === audience);
      const visitedZones = new Set(
        routed.flatMap(({ action }) => action.positions.map(({ position }) => position.zone)),
      );
      for (const step of source.guide.steps) {
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
        if (view.condition !== "match") continue;
        const flight = view.directives.find((directive) => directive.tag === ".fp");
        if (!flight) continue;
        const positions = view.directives.flatMap((directive) =>
          directive.position ? [directive.position] : [],
        );
        if (
          visitedZones.size &&
          positions.length &&
          !positions.some((position) => visitedZones.has(position.zone))
        )
          continue;
        const comparable = positions.flatMap((position) =>
          routed.flatMap(({ action }) =>
            action.positions.flatMap(({ position: visit }) =>
              campaignZoneId(position.zone) === campaignZoneId(visit.zone) &&
              position.space === visit.space &&
              position.floor === visit.floor
                ? [{ position, visit }]
                : [],
            ),
          ),
        );
        if (
          comparable.length &&
          !positions.some((position) =>
            ["1453", "1455", "1457"].includes(campaignZoneId(position.zone) ?? ""),
          ) &&
          !comparable.some(
            ({ position, visit }) =>
              Math.hypot(position.x - visit.x, position.y - visit.y) <=
              (position.space === "map-percent" ? 12 : 600),
          )
        )
          continue;
        const target = routed.find(({ action }) => action.source?.stepId === step.id);
        const following = routed.find(
          ({ action }) => (ordinals.get(action.source!.stepId) ?? -1) >= step.ordinal,
        );
        const anchor = target ?? following ?? routed.at(-1)!;
        const key = `${audience}:${flight.arguments.trim() || `${source.reference.sourceId}:${step.id}`}`;
        const actionId =
          target?.action.id ?? `flight-${audience}-${source.reference.sourceId}-${step.ordinal}`;
        const title =
          flight.text ||
          `Learn the ${source.reference.title ?? source.guide.chapterId} flight path`;
        const action: CampaignAction = target?.action ?? {
          id: actionId,
          legId: anchor.action.legId,
          title,
          instructions: [
            flight.text ||
              "Speak to this flight master and learn the flight path. Unlock it now for later dungeon travel.",
          ],
          questChanges: [],
          positions: view.directives.flatMap((directive) =>
            directive.position
              ? [{ sourceLine: directive.sourceLine, position: directive.position }]
              : [],
          ),
          source: campaignActionSource(source.guide, step, view.directives),
          kind: "instructions",
          leaderOnly: anchor.action.leaderOnly,
          targetLevel: null,
          targetStopId: null,
          raidOnly: anchor.action.raidOnly,
          nativeUtilityTags: [".fp"],
        };
        candidates.push({
          index: anchor.index,
          after: !target && !following,
          existing: Boolean(target),
          action,
          node: { key, title, actionId, chapterId: source.guide.chapterId },
        });
      }
    }
  }
  candidates.sort(
    (left, right) => left.index - right.index || Number(left.after) - Number(right.after),
  );
  const nodes = new Map<string, CampaignFlightPath>();
  const before = new Map<number, CampaignAction[]>();
  const after = new Map<number, CampaignAction[]>();
  for (const candidate of candidates) {
    if (nodes.has(candidate.node.key)) continue;
    nodes.set(candidate.node.key, candidate.node);
    if (candidate.existing) continue;
    const placement = candidate.after ? after : before;
    placement.set(candidate.index, [...(placement.get(candidate.index) ?? []), candidate.action]);
  }
  const actions = plan.actions.flatMap((action, index) => [
    ...(before.get(index) ?? []),
    action,
    ...(after.get(index) ?? []),
  ]);
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
    flightPaths: [...nodes.values()],
  };
}
