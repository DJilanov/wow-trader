import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import type { CampaignFundingCollection } from "./campaign-funding-collections.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingStates, type CampaignFundingState } from "./campaign-funding-scenarios.js";
import {
  regressedFundingScenarios,
  unsafePartyFundingScenarios,
} from "./campaign-funding-quality.js";
import { attachCampaignLocations } from "./campaign-flow-locations.js";
import { campaignActionZones } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { batchCampaignVisitWindows } from "./campaign-visit-windows.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { getGuideStepView } from "./guide-archive.js";

const movableSourceTags = new Set([
  "text",
  ".goto",
  ".waypoint",
  ".line",
  ".mob",
  ".target",
  ".unitscan",
  ".accept",
  ".complete",
  ".turnin",
  ".link",
]);

function partyRegions(actions: readonly CampaignAction[]): readonly string[] {
  const regions: string[] = [];
  for (const action of actions) {
    if (action.leaderOnly || action.movement || ["checkpoint", "xp-check"].includes(action.kind))
      continue;
    const zones = campaignActionZones(action);
    if (zones.length !== 1) continue;
    const zone = zones[0]!;
    if (regions.at(-1) !== zone) regions.push(zone);
  }
  return regions;
}

function transportHops(actions: readonly CampaignAction[]): number | null {
  const regions = partyRegions(actions);
  let hops = 0;
  for (let index = 1; index < regions.length; index++) {
    const journey = campaignGroundJourney(regions[index - 1]!, regions[index]!);
    if (!journey) return null;
    hops += journey.length;
  }
  return hops;
}

function legJourney(plan: CampaignPlan, legId: string): readonly CampaignAction[] {
  const first = plan.actions.findIndex((action) => action.legId === legId);
  let last = first;
  while (plan.actions[last + 1]?.legId === legId) last++;
  const located = (action: CampaignAction): boolean =>
    !action.leaderOnly &&
    !action.movement &&
    !["checkpoint", "xp-check"].includes(action.kind) &&
    campaignActionZones(action).length === 1;
  const previous = plan.actions.slice(0, first).reverse().find(located);
  const next = plan.actions.slice(last + 1).find(located);
  return [
    ...(previous ? [previous] : []),
    ...plan.actions.slice(first, last + 1),
    ...(next ? [next] : []),
  ];
}

function fixedActions(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  states: readonly CampaignFundingState[],
  collections: ReadonlyMap<number, CampaignFundingCollection>,
): ReadonlySet<string> {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const steps = new Map(
    sources
      .filter((source) => source.guide.targetBuild === plan.targetBuild)
      .flatMap(({ guide }) =>
        guide.steps.map(
          (step) => [`${guide.chapterId}:${guide.version}:${step.id}`, step] as const,
        ),
      ),
  );
  const reached = new Set<string>(),
    barriers = new Set<string>();
  for (const state of states)
    for (const section of state.forecast)
      for (const member of section.members)
        for (const step of member.steps) {
          if (step.status !== "projected") continue;
          reached.add(step.actionId);
          if (step.before && step.after && step.before.level !== step.after.level)
            barriers.add(step.actionId);
        }
  for (const action of plan.actions) {
    if (
      action.kind !== "quests" ||
      action.leaderOnly ||
      action.raidOnly ||
      action.dungeonFinishOnly ||
      action.bundleId ||
      !reached.has(action.id) ||
      campaignActionZones(action).length !== 1
    ) {
      barriers.add(action.id);
      continue;
    }
    const activities =
      plan.combat?.activities.filter((activity) => activity.actionId === action.id) ?? [];
    if (
      activities.some((activity) =>
        activity.objectives.some(
          (objective) =>
            objective.credit === "unknown" ||
            (objective.credit === "personal-loot" && !collections.has(objective.questId)),
        ),
      )
    )
      barriers.add(action.id);
    if (!action.source) continue;
    const step = steps.get(
      `${action.source.chapterId}:${action.source.version}:${action.source.stepId}`,
    );
    if (!step) {
      barriers.add(action.id);
      continue;
    }
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter(
          (directive) => ![".group", ".solo"].includes(directive.tag),
        ),
      },
      profile,
      { dungeons: [] },
    );
    if (
      view.condition !== "match" ||
      view.conditionalDirectives.length ||
      view.directives.some((directive) => !movableSourceTags.has(directive.tag))
    )
      barriers.add(action.id);
  }
  return barriers;
}

function withinCapacity(plan: CampaignPlan, states: readonly CampaignFundingState[]): boolean {
  return states.every((state) => {
    const party = guidePartyScenario(plan, state.progress, state.starterMode);
    return auditCampaignQuestLog(party.plan, party.progress, party).every(
      (member) => member.withinCapacity,
    );
  });
}

/** Reduce regional returns after funding without borrowing levels from later quest work. */
export function batchFundedCampaignVisits(
  initial: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !initial.combat ||
    initial.combat.targetBuild !== initial.targetBuild ||
    initial.combat.sourceRevision !== combat.provider.revision ||
    initial.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    initial.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256
  )
    return initial;
  const legIds = initial.legs
    .filter(
      (leg) =>
        ["preparation", "xp-bridge"].includes(leg.kind) &&
        initial.actions.some(
          (action) => action.legId === leg.id && !action.leaderOnly && action.fundingCheckpointId,
        ),
    )
    .map((leg) => leg.id);
  if (!legIds.length) return initial;
  const collections = campaignFundingCollections(initial, sources, combat, catalog);
  let plan = initial,
    states = campaignFundingStates(plan);
  let accepted: boolean;
  do {
    accepted = false;
    for (const legId of legIds) {
      const located = attachCampaignLocations(plan, sources);
      const originals = new Map(plan.actions.map((action) => [action.id, action]));
      const ordered = batchCampaignVisitWindows(
        located,
        sources,
        legId,
        fixedActions(located, sources, states, collections),
      );
      if (ordered === located.actions) continue;
      const actions = ordered.map((action) => originals.get(action.id)!);
      const proposed: CampaignPlan = {
        ...plan,
        actions,
        legs: plan.legs.map((leg) => ({
          ...leg,
          actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
        })),
      };
      if (partyRegions(actions).length >= partyRegions(plan.actions).length) continue;
      const before = transportHops(legJourney(plan, legId)),
        after = transportHops(legJourney(proposed, legId));
      if (after === null || before === null || after > before) continue;
      const moved = new Set(
        actions
          .filter((action, index) => action !== plan.actions[index])
          .map((action) => action.id),
      );
      const next = campaignFundingStates(proposed);
      if (
        regressedFundingScenarios(plan, states, next, { allowLargerDeficitAtSameAction: true })
          .length ||
        unsafePartyFundingScenarios(plan, next, catalog, combat, collections, moved).length ||
        !withinCapacity(proposed, next)
      )
        continue;
      plan = proposed;
      states = next;
      accepted = true;
    }
    // Each accepted proposal strictly reduces an integer transition count, so this terminates.
  } while (accepted);
  return plan;
}
