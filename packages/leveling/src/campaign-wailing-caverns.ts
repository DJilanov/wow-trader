import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignActionZones } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { partyQuestLootCost } from "./party-quest-cost.js";
import { resolveQuestReward } from "./quest-rewards.js";
import {
  capturedWailingCavernsActions,
  WAILING_CAVERNS_CATCHUP_LEG_ID as legId,
  WAILING_CAVERNS_CATCHUP_QUEST_IDS as questIds,
} from "./campaign-wailing-caverns-source.js";

/** Schedule the primary party's neutral-quest trip; offer other Human editions a catch-up. */
export function offerWailingCavernsCatchUp(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !plan.sharedQuestsOnly ||
    plan.partyPolicy?.partySize !== 5 ||
    plan.race !== "human" ||
    plan.legs.some((leg) => leg.id === legId) ||
    data.targetBuild !== plan.targetBuild ||
    catalog.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256 ||
    catalog.providerRevision !== data.provider.revision ||
    catalog.questSha256 !== data.provider.questSha256 ||
    catalog.npcSha256 !== data.provider.npcSha256 ||
    catalog.itemSha256 !== data.provider.itemSha256
  )
    return plan;
  const requiredVisit = plan.leaderClass === "warrior";
  const gate = plan.actions.find(
    (action) =>
      action.kind === "xp-check" &&
      action.targetStopId === "lordaeron" &&
      plan.legs.find((leg) => leg.id === action.legId)?.kind !== "dungeon",
  );
  if (
    !gate ||
    (!requiredVisit &&
      !plan.questFunding?.remaining.some(
        (gap) =>
          gap.checkpointId === gate.id && gap.missingXpByPlayer.some((xp) => xp !== null && xp > 0),
      ))
  )
    return plan;
  if (
    plan.actions.some((action) =>
      action.questChanges.some((change) => questIds.some((id) => id === change.questId)),
    )
  )
    return plan;
  for (const id of questIds) {
    const quest = catalog.quests.find((entry) => entry.questId === id);
    const reference = data.quests.find((entry) => entry.questId === id);
    if (
      !quest ||
      !reference ||
      quest.requiredClasses !== 0 ||
      quest.requiredRaces !== 0 ||
      reference.requiredClasses !== 0 ||
      quest.minimumLevel === null ||
      quest.minimumLevel > 15 ||
      quest.unsupportedRequirements.some(
        (requirement) => !["non-outdoor-zone", "provided-item-interaction"].includes(requirement),
      ) ||
      resolveQuestReward(id, 15, plan.rewardFacts ?? []).xp === null
    )
      return plan;
    const giverId = id === 959 ? 3665 : id === 1487 ? 5768 : 8418;
    if (
      !quest.ends.some(
        (giver) =>
          giver.npcId === giverId &&
          giver.friendlyToAlliance &&
          giver.positions.some((position) => position.zone === "1413"),
      ) ||
      (id !== 6981 &&
        !quest.starts.some(
          (giver) =>
            giver.npcId === giverId &&
            giver.friendlyToAlliance &&
            giver.positions.some((position) => position.zone === "1413"),
        )) ||
      quest.prerequisites.allOf.length ||
      quest.prerequisites.anyOf.length ||
      quest.exclusiveWith.length
    )
      return plan;
  }
  const bottle = data.quests.find((quest) => quest.questId === 959)?.itemObjectives;
  const shard = data.quests.find((quest) => quest.questId === 6981)?.startItem;
  if (shard?.itemId !== 10441 || shard.name !== "Glowing Shard") return plan;
  if (
    bottle?.length !== 1 ||
    bottle[0]!.itemId !== 5334 ||
    bottle[0]!.quantity !== 1 ||
    bottle[0]!.npcIds.length !== 1 ||
    bottle[0]!.npcIds[0] !== 3655
  )
    return plan;
  const source = sources.find(
    (entry) => entry.reference.sourceId === 6 && entry.guide.targetBuild === plan.targetBuild,
  );
  if (!source) return plan;
  const captured = capturedWailingCavernsActions(plan, source, catalog);
  if (!captured) return plan;
  const at = plan.actions.indexOf(gate),
    parent = plan.legs.findIndex((leg) => leg.id === gate.legId);
  const origin = [...plan.actions.slice(0, at)]
    .reverse()
    .flatMap((action) => action.location?.zone ?? campaignActionZones(action))[0];
  const destination = campaignActionZones(gate)[0] ?? origin;
  if (!origin || !destination) return plan;
  // Keep the early Eastern Kingdoms approach out of high-level Stranglethorn.
  const outward = ["1429", "1433", "1436", "1453"].includes(origin)
      ? (() => {
          const harbor = campaignGroundJourney(origin, "1453"),
            ship = campaignGroundJourney("1453", "1439"),
            cavern = campaignGroundJourney("1439", "1413");
          return harbor && ship && cavern ? [...harbor, ...ship, ...cavern] : null;
        })()
      : campaignGroundJourney(origin, "1413"),
    onward = campaignGroundJourney("1413", destination);
  if (!outward || !onward) return plan;
  const instructions = (
    id: string,
    title: string,
    lines: readonly string[],
    zone: string,
  ): CampaignAction => ({
    id: `${legId}-${id}`,
    legId,
    title,
    instructions: lines,
    questChanges: [],
    positions: [],
    source: null,
    kind: "instructions",
    leaderOnly: false,
    raidOnly: false,
    targetLevel: null,
    targetStopId: null,
    libraryBackbone: true,
    xpOptional: false,
    location: { zone, visitOverride: true },
  });
  const trip = [
    instructions(
      "approach",
      requiredVisit ? "Travel to Wailing Caverns" : "Optional Wailing Caverns catch-up",
      [
        requiredVisit
          ? "Complete all three Wailing Caverns quests as part of this five-player route, including Naralex's final event and the outside hand-ins."
          : "Use this three-quest trip if the party still needs XP for Ruins of Lordaeron. It includes the final Naralex event and all outside hand-ins. It is not a measured one-hour clear.",
        "Deviate Hides is not required. Do not reset or wait for a hundred hides for the party.",
        ...outward.map((leg) => leg.instruction),
      ],
      "1413",
    ),
    ...captured,
    instructions(
      "return",
      "Rejoin the northern route",
      onward.map((leg) => leg.instruction),
      destination,
    ),
    { ...gate, legId },
  ];
  const actions = [...plan.actions.slice(0, at), ...trip, ...plan.actions.slice(at + 1)];
  const previousLeg = plan.legs[parent]!;
  const next: CampaignPlan = {
    ...plan,
    actions,
    legs: [
      ...plan.legs.slice(0, parent),
      { ...previousLeg, actionIds: previousLeg.actionIds.filter((id) => id !== gate.id) },
      {
        id: legId,
        title: requiredVisit ? "Wailing Caverns" : "Wailing Caverns: optional catch-up",
        ...(requiredVisit ? { requiredVisit: true as const } : {}),
        from: 17,
        to: 18,
        kind: "xp-bridge",
        stopId: null,
        dungeonVisitId: "wailing-caverns",
        optionalQuestId: 959,
        questIds,
        unresolvedQuestIds: [],
        actionIds: trip.map((action) => action.id),
      },
      ...plan.legs.slice(parent + 1),
    ],
  };
  const attached = attachCampaignCombat(
    next,
    sources,
    data,
    plan.combat?.revision ?? "wailing-caverns-reference",
  );
  const kills = attached.combat?.activities
    .flatMap((activity) => activity.objectives)
    .filter((objective) => objective.questId === 1487);
  if (
    kills?.length !== 4 ||
    kills.some(
      (objective) => objective.credit !== "shared-kills" || objective.requiredKills !== 7,
    ) ||
    attached.combat?.activities.some((activity) =>
      activity.objectives.some((objective) => objective.questId === 6981),
    )
  )
    return plan;
  const cost = partyQuestLootCost(959, attached, data, 5, sources);
  if (!cost.eligible || cost.expectedKills === null) return plan;
  const decisions = new Map(
    plan.partyPolicy?.decisions.map((decision) => [decision.questId, decision]),
  );
  for (const id of questIds)
    decisions.set(id, {
      questId: id,
      objective: id === 959 ? "collection" : id === 1487 ? "shared-kills" : "interaction",
      included: true,
      requiredFor: [],
      lootCost: id === 959 ? cost : null,
      reason:
        "Captured neutral-quest Wailing Caverns catch-up; complete the full party objectives and outside hand-ins before counting rewards.",
    });
  return {
    ...attached,
    ...(plan.partyPolicy
      ? { partyPolicy: { ...plan.partyPolicy, decisions: [...decisions.values()] } }
      : {}),
  };
}
