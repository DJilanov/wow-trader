import { campaignActionReasons, type CampaignAction, type CampaignPlan } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import {
  isUnrestrictedFundingQuest,
  type QuestCatalog,
  type QuestCatalogEntry,
} from "./quest-catalog.js";
import { campaignActionZones } from "./campaign-geography.js";
import {
  campaignFundingProgressBefore,
  campaignFundingStates,
} from "./campaign-funding-scenarios.js";
import { regressedFundingScenarios } from "./campaign-funding-quality.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";

type Giver = QuestCatalogEntry["starts"][number];

function giver(
  quest: QuestCatalogEntry,
  side: "starts" | "ends",
  id: number,
  zone: string,
): Giver | null {
  const entries = quest[side];
  return entries.length === 1 &&
    entries[0]!.npcId === id &&
    entries[0]!.friendlyToAlliance &&
    entries[0]!.positions.length > 0 &&
    entries[0]!.positions.every((point) => point.zone === zone)
    ? entries[0]!
    : null;
}

function plannedPartyVisits(actions: readonly CampaignAction[]): number {
  let previous: string | null = null,
    count = 0;
  for (const action of actions) {
    if (
      action.leaderOnly ||
      action.movement ||
      ["checkpoint", "xp-check"].includes(action.kind) ||
      action.nativeUtilityTags?.some((tag) => [".fly", ".hs", ".zone"].includes(tag))
    )
      continue;
    const zones = campaignActionZones(action);
    if (zones.length !== 1) continue;
    if (zones[0] !== previous) count++;
    previous = zones[0]!;
  }
  return count;
}

/** Carry the existing Defias courier on the selected Sentinel Hill → Lakeshire visit. */
export function batchCampaignChainVisits(
  plan: CampaignPlan,
  combat: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    plan.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256
  )
    return plan;
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const courier = quests.get(65),
    carried = quests.get(132),
    militia = quests.get(14),
    tools = quests.get(125);
  if (
    !courier ||
    !carried ||
    !militia ||
    !tools ||
    courier.category !== "delivery" ||
    carried.category !== "delivery" ||
    courier.providedItem ||
    !carried.providedItem ||
    courier.objectives.length ||
    carried.objectives.length ||
    courier.minimumLevel === null ||
    carried.minimumLevel === null ||
    !isUnrestrictedFundingQuest({ ...courier, unsupportedRequirements: [] }) ||
    !isUnrestrictedFundingQuest({ ...carried, unsupportedRequirements: [] }) ||
    courier.unsupportedRequirements.some((flag) => flag !== "unresolved-objective-text") ||
    carried.unsupportedRequirements.some(
      (flag) => !["unresolved-objective-text", "provided-item-interaction"].includes(flag),
    ) ||
    courier.prerequisites.allOf.length ||
    courier.prerequisites.anyOf.length ||
    courier.exclusiveWith.length ||
    carried.prerequisites.allOf.length ||
    carried.prerequisites.anyOf.length !== 1 ||
    carried.prerequisites.anyOf[0] !== 65 ||
    carried.exclusiveWith.length
  )
    return plan;
  const reference = combat.quests.find((entry) => entry.questId === 65);
  if (
    !reference ||
    reference.onlyCreatureObjectives ||
    reference.creatureIds.length ||
    reference.itemCreatureIds.length ||
    reference.itemObjectives?.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    reference.objectiveText.length !== 1 ||
    !/^(?:Gryan Stoutmantle wants you to talk to Wiley|Talk to Wiley the Black) in Lakeshire\.?$/i.test(
      reference.objectiveText[0]!.trim(),
    ) ||
    providedItemDeliveryRecipients(
      carried,
      combat.quests.find((entry) => entry.questId === 132),
    ).length !== 1
  )
    return plan;
  // These are specific authored town visits. A shared zone alone does not imply nearby NPCs.
  const start = giver(courier, "starts", 234, "1436"),
    recipient = giver(courier, "ends", 266, "1433"),
    pickupVisit = giver(militia, "ends", 234, "1436"),
    destinationVisit = giver(tools, "starts", 341, "1433");
  if (
    !start ||
    !recipient ||
    !pickupVisit ||
    !destinationVisit ||
    !giver(carried, "starts", 266, "1433") ||
    !giver(carried, "ends", 234, "1436") ||
    !recipient.positions.every((a) =>
      destinationVisit.positions.some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= 10),
    )
  )
    return plan;
  const phases = plan.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === 65),
  );
  const [pickup, objective, handin] = phases;
  if (
    phases.length !== 3 ||
    !pickup ||
    !objective ||
    !handin ||
    phases.some(
      (action) =>
        action.legId !== "defias-unlock" ||
        action.kind !== "quests" ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.xpOptional ||
        action.nativeUtilityTags?.length,
    ) ||
    pickup.questChanges.length !== 1 ||
    pickup.questChanges[0]!.state !== "accepted" ||
    !pickup.source ||
    objective.questChanges.length !== 1 ||
    objective.questChanges[0]!.state !== "objectives-complete" ||
    handin.questChanges.length !== 2 ||
    handin.questChanges[0]!.questId !== 65 ||
    handin.questChanges[0]!.state !== "rewarded" ||
    handin.questChanges[1]!.questId !== 132 ||
    handin.questChanges[1]!.state !== "accepted" ||
    !handin.source
  )
    return plan;
  const anchor = (questId: number, state: "accepted" | "rewarded"): CampaignAction | undefined =>
    plan.actions.find(
      (action) =>
        action.legId === "northern-approach" &&
        !action.leaderOnly &&
        action.kind === "quests" &&
        !action.raidOnly &&
        !action.dungeonFinishOnly &&
        action.questChanges.some((change) => change.questId === questId && change.state === state),
    );
  const from = anchor(14, "rewarded"),
    to = anchor(125, "accepted");
  if (
    !from ||
    !to ||
    (to.xpOptional && !to.libraryBackbone) ||
    plan.actions.indexOf(from) >= plan.actions.indexOf(to) ||
    plan.actions.indexOf(to) >= plan.actions.indexOf(pickup) ||
    !campaignActionZones(from).includes("1436") ||
    !campaignActionZones(to).includes("1433")
  )
    return plan;
  const before = campaignFundingStates(plan);
  let reachable = false;
  for (const state of before) {
    const reachesPickup =
      state.forecast.every((section) => section.members.length === 5) &&
      state.progress.members.every((_member, player) =>
        state.forecast.some((section) =>
          section.members[player]!.steps.some(
            (step) =>
              step.actionId === from.id &&
              step.questId === 14 &&
              step.phase === "rewarded" &&
              step.status === "projected",
          ),
        ),
      );
    if (!reachesPickup) continue;
    reachable = true;
    const next = state.actions[state.actions.findIndex((action) => action.id === from.id) + 1];
    if (!next) return plan;
    const progress = campaignFundingProgressBefore(state, next.id);
    if (
      progress.members.some(
        (member) =>
          member.level === null ||
          member.currentXp === null ||
          member.level < Math.max(courier.minimumLevel!, carried.minimumLevel!),
      ) ||
      campaignActionReasons(pickup, progress, plan.rewardFacts).length
    )
      return plan;
  }
  if (!reachable) return plan;
  const ids = new Set(phases.map((action) => action.id));
  const actions = plan.actions.flatMap((action) =>
    ids.has(action.id)
      ? []
      : action.id === from.id
        ? [action, { ...pickup, legId: from.legId }]
        : action.id === to.id
          ? [
              { ...objective, legId: to.legId },
              {
                ...handin,
                legId: to.legId,
                instructions: [
                  ...handin.instructions,
                  "Keep Wiley's Note for the later return to Gryan Stoutmantle. Continue the Lakeshire tasks below.",
                ],
              },
              action,
            ]
          : [action],
  );
  const proposed: CampaignPlan = {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === leg.id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    })),
  };
  const after = campaignFundingStates(proposed);
  if (
    regressedFundingScenarios(plan, before, after).length ||
    after.some((state, index): boolean => {
      const scenario = guidePartyScenario(proposed, state.progress, state.starterMode);
      return (
        plannedPartyVisits(state.actions) >= plannedPartyVisits(before[index]!.actions) ||
        state.forecast.some((section) =>
          section.members.some((member) =>
            member.steps.some((step) => ids.has(step.actionId) && step.status !== "projected"),
          ),
        ) ||
        auditCampaignQuestLog(scenario.plan, scenario.progress, scenario).some(
          (member) => !member.withinCapacity,
        )
      );
    })
  )
    return plan;
  return proposed;
}
