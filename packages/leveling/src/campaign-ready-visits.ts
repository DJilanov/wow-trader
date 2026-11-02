import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { PremadeProgress } from "./premade-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { providedItemDeliveryRecipients, npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import { campaignNativeInstructions } from "./campaign-addon-native.js";
import { campaignZoneId } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import type { ImportedDirective } from "./guide-archive.js";
import { forecastCampaignXp, type CampaignXpForecastOptions } from "./campaign-xp.js";
import {
  campaignFundingProgressBefore,
  campaignFundingXpBoundsBefore,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";

const visitCommands = new Set([
  ".goto",
  ".waypoint",
  ".line",
  ".target",
  ".accept",
  ".turnin",
  ".link",
]);
const objectiveRequirements = new Set([
  "provided-item-interaction",
  "unresolved-objective-text",
  "non-outdoor-zone",
  "source-completion-objective",
]);

function supportsVisitDirective(
  directive: ImportedDirective,
  index: number,
  directives: readonly ImportedDirective[],
): boolean {
  if (visitCommands.has(directive.tag)) return true;
  if (
    directive.tag !== ".timer" ||
    directives[index - 1]?.tag !== ".turnin" ||
    directives[index + 1]?.tag !== ".accept"
  )
    return false;
  const [duration, label, ...callbacks] = directive.arguments.split(",");
  // A plain timer annotates the preceding hand-in. Callback/event forms can change its meaning.
  return (
    callbacks.length === 0 &&
    /^\d+(?:\.\d+)?$/.test(duration?.trim() ?? "") &&
    Number(duration) > 0 &&
    Number(duration) <= 60 &&
    Boolean(label?.trim())
  );
}

function unrestrictedVisit(quest: QuestCatalogEntry): boolean {
  const allianceRaces = 4294967373n;
  return (
    quest.requiredClasses === 0 &&
    (quest.requiredRaces === 0 ||
      (BigInt(quest.requiredRaces) & allianceRaces) === allianceRaces) &&
    quest.minimumLevel !== null &&
    quest.unsupportedRequirements.every((requirement) => objectiveRequirements.has(requirement))
  );
}

function ready(
  plan: CampaignPlan,
  visit: CampaignAction,
  progress: PremadeProgress,
  quests: ReadonlyMap<number, QuestCatalogEntry>,
  combat: CombatDataset,
  includeNpcDeliveries: boolean,
  initialBounds?: CampaignXpForecastOptions["initialBounds"],
): boolean {
  const members = visit.leaderOnly ? progress.members.slice(0, 1) : progress.members;
  for (const member of members) {
    if (member.level === null || member.currentXp === null) return false;
    const states = { ...member.questStates };
    for (const change of visit.questChanges) {
      const quest = quests.get(change.questId)!;
      const state = states[String(change.questId)];
      if (change.state === "accepted") {
        if (
          (state && state !== "not-started") ||
          [...quest.prerequisites.allOf, ...(visit.requiredQuestIds ?? [])].some(
            (id) => states[String(id)] !== "rewarded",
          ) ||
          (quest.prerequisites.anyOf.length > 0 &&
            !quest.prerequisites.anyOf.some((id) => states[String(id)] === "rewarded")) ||
          quest.exclusiveWith.some(
            (id) => states[String(id)] && states[String(id)] !== "not-started",
          )
        )
          return false;
      } else if (
        state !== "objectives-complete" &&
        (state !== "accepted" ||
          deliveryRecipients(quest, combat, includeNpcDeliveries).length === 0)
      )
        return false;
      states[String(change.questId)] = change.state;
    }
  }
  const prototype: CampaignPlan = {
    ...plan,
    actions: [visit],
    catchUpBatches: [],
    defaultCatchUpBatches: {},
    library: { revision: "source-backbone-20261021-v3", choices: [] },
    legs: plan.legs.filter((leg) => leg.id === visit.legId),
  };
  const rows = forecastCampaignXp(prototype, progress, initialBounds ? { initialBounds } : {})
    .flatMap((section) => section.members)
    .filter((member) => !visit.leaderOnly || member.player === 1);
  return (
    rows.length === members.length &&
    rows.every(
      (row) =>
        row.endpoint !== null &&
        row.blockedReason === null &&
        row.unknownQuestIds.length === 0 &&
        row.referenceQuestXp + row.estimatedQuestXp > 0 &&
        row.steps.filter((step) => step.questId !== null).length === visit.questChanges.length &&
        row.steps.every(
          (step) =>
            step.status === "projected" &&
            (step.phase !== "accepted" ||
              (step.questId !== null &&
                step.before !== null &&
                step.before.level >= quests.get(step.questId)!.minimumLevel!)),
        ),
    )
  );
}

function deliveryRecipients(
  quest: QuestCatalogEntry,
  combat: CombatDataset,
  includeNpcDeliveries: boolean,
): readonly QuestCatalogEntry["ends"][number][] {
  const reference = combat.quests.find((entry) => entry.questId === quest.questId);
  const provided = providedItemDeliveryRecipients(quest, reference);
  return provided.length || !includeNpcDeliveries
    ? provided
    : npcDeliveryRecipients(quest, reference);
}

/** Move a whole, already-selected NPC visit, preserving its source and bookmark identity. */
export function promoteReadyCampaignVisit(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
  states: readonly CampaignFundingState[],
  state: CampaignFundingState,
  gate: CampaignAction,
  includeNpcTimers = true,
  includeNpcDeliveries = false,
): CampaignPlan | null {
  if (!sources.length) return null;
  const gateIndex = plan.actions.findIndex((action) => action.id === gate.id);
  const origin = [...plan.actions.slice(0, gateIndex)]
    .reverse()
    .flatMap((action) => action.positions)
    .map(({ position }) => campaignZoneId(position.zone))
    .find((zone) => zone !== null);
  if (!origin) return null;
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const native = campaignNativeInstructions(plan, sources);
  const effectiveGate = state.actions.find((action) => action.id === gate.id)!;
  const active = new Set(state.actions.map((action) => action.id));
  const candidates = plan.actions
    .slice(gateIndex + 1)
    .filter(
      (visit) =>
        active.has(visit.id) &&
        visit.legId === gate.legId &&
        visit.leaderOnly === gate.leaderOnly &&
        visit.kind === "quests" &&
        visit.source !== null &&
        !visit.raidOnly &&
        !visit.dungeonFinishOnly &&
        !visit.xpOptional &&
        !visit.fundingCheckpointId &&
        !visit.sourceGateConflictQuestIds?.length &&
        !visit.nativeUtilityTags?.length &&
        visit.questChanges.some((change) => change.state === "rewarded") &&
        visit.questChanges.every(
          (change) => change.state !== "objectives-complete" && quests.has(change.questId),
        ),
    );
  for (const visit of candidates) {
    const entries = visit.questChanges.map((change) => quests.get(change.questId)!);
    if (!entries.every(unrestrictedVisit)) continue;
    const givers = visit.questChanges.map((change, index) => {
      const quest = entries[index]!;
      const proven =
        change.state === "rewarded" ? deliveryRecipients(quest, combat, includeNpcDeliveries) : [];
      return (
        change.state === "accepted" ? quest.starts : proven.length ? proven : quest.ends
      ).filter((giver) => giver.friendlyToAlliance && giver.positions.length > 0);
    });
    const common = givers[0]!.filter((giver) =>
      givers.every((group) => group.some((entry) => entry.npcId === giver.npcId)),
    );
    const instructions = native(visit);
    if (
      !common.length ||
      !instructions ||
      (!includeNpcTimers &&
        instructions.directives.some((directive) => directive.tag === ".timer")) ||
      !instructions.directives.every(supportsVisitDirective) ||
      !instructions.directives.some((directive) => directive.tag === ".turnin")
    )
      continue;
    const destinations = visit.positions.flatMap(({ position }) => {
      const zone = campaignZoneId(position.zone);
      return zone ? [zone] : [];
    });
    if (
      !destinations.length ||
      destinations.some(
        (zone) =>
          !common.some((giver) => giver.positions.some((position) => position.zone === zone)) ||
          (zone !== origin &&
            (!campaignGroundJourney(origin, zone) || !campaignGroundJourney(zone, origin))),
      ) ||
      instructions.directives.some(
        (directive) =>
          directive.tag === ".target" &&
          !common.some((giver) => giver.name === directive.arguments.trim()),
      )
    )
      continue;
    const effective = { ...visit, leaderOnly: effectiveGate.leaderOnly };
    if (
      !ready(
        plan,
        effective,
        campaignFundingProgressBefore(state, gate.id),
        quests,
        combat,
        includeNpcDeliveries,
        campaignFundingXpBoundsBefore(state, gate.id),
      )
    )
      continue;
    const compatible = states.every((other) => {
      const active = other.actions.find((action) => action.id === gate.id);
      if (!active) return true;
      const progress = campaignFundingProgressBefore(other, gate.id);
      const members = active.leaderOnly ? progress.members.slice(0, 1) : progress.members;
      if (members.some((member) => member.level === null || member.currentXp === null)) return true;
      return ready(
        plan,
        { ...visit, leaderOnly: active.leaderOnly },
        progress,
        quests,
        combat,
        includeNpcDeliveries,
        campaignFundingXpBoundsBefore(other, gate.id),
      );
    });
    if (!compatible) continue;
    const actions = plan.actions.filter((action) => action.id !== visit.id);
    actions.splice(gateIndex, 0, visit);
    return {
      ...plan,
      actions,
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    };
  }
  return null;
}
