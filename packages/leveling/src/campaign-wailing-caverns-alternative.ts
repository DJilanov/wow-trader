import type { CampaignPlan } from "./campaign.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";

/** Keep the demonstrated late coastal filler only in the route that skips WC. */
export function attachWailingCavernsAlternative(
  plan: CampaignPlan,
  catalog: QuestCatalog,
): CampaignPlan {
  if (
    !plan.sharedQuestsOnly ||
    plan.race !== "human" ||
    plan.leaderClass !== "warrior" ||
    plan.partyPolicy?.partySize !== 5 ||
    catalog.targetBuild !== plan.targetBuild ||
    catalog.sourceArchiveSha256 !== plan.sourceArchiveSha256
  )
    return plan;
  const trip = plan.legs.filter(
    (leg) => leg.dungeonVisitId === "wailing-caverns" && leg.optionalQuestId === 959,
  );
  if (trip.length !== 1) return plan;
  const tripActions = plan.actions.filter((action) => action.legId === trip[0]!.id);
  if (
    trip[0]!.questIds.length !== 3 ||
    ![959, 1487, 6981].every(
      (id) =>
        trip[0]!.questIds.includes(id) &&
        tripActions
          .flatMap((action) => action.questChanges)
          .filter((change) => change.questId === id && change.state === "rewarded").length === 1,
    )
  )
    return plan;
  const coast = plan.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === 152),
  );
  const expected = [
    "accepted:0",
    "objectives-complete:1",
    "objectives-complete:2",
    "objectives-complete:3",
    "objectives-complete:4",
    "rewarded:0",
  ];
  if (
    coast.length !== expected.length ||
    coast.some((action, index) => {
      const change = action.questChanges[0];
      return (
        action.questChanges.length !== 1 ||
        !change ||
        `${change.state}:${change.objectiveIndex ?? 0}` !== expected[index] ||
        action.kind !== "quests" ||
        action.source !== null ||
        action.leaderOnly ||
        action.raidOnly ||
        action.itemCollections?.length ||
        action.auctionSupplies?.length ||
        action.nativeUtilityTags?.length ||
        (action.location !== undefined && action.location.zone !== "1436") ||
        (!action.location && !action.positions.length) ||
        action.positions.some(({ position }) => campaignZoneId(position.zone) !== "1436") ||
        !action.fundingCheckpointId ||
        action.fundingCheckpointId !== coast[0]!.fundingCheckpointId ||
        (action.excludedByOptionalQuestId !== undefined && action.excludedByOptionalQuestId !== 959)
      );
    })
  )
    return plan;
  const gate = plan.actions.find((action) => action.id === coast[0]!.fundingCheckpointId);
  const lastTrip = plan.actions.indexOf(tripActions.at(-1)!);
  if (
    !gate ||
    gate.kind !== "xp-check" ||
    gate.targetStopId !== "lordaeron" ||
    gate.targetLevel !== 18 ||
    lastTrip < 0 ||
    lastTrip >= plan.actions.indexOf(coast[0]!) ||
    plan.actions.indexOf(coast.at(-1)!) >= plan.actions.indexOf(gate)
  )
    return plan;
  const quest = catalog.quests.find((entry) => entry.questId === 152);
  const coastrunner = plan.combat?.npcs.find((npc) => npc.id === 126);
  if (
    !quest ||
    quest.category !== "shared-kills" ||
    quest.requiredClasses !== 0 ||
    quest.requiredRaces !== 0 ||
    quest.unsupportedRequirements.length ||
    quest.objectives.length !== 4 ||
    quest.objectives.some(
      (objective, index) =>
        objective.index !== index + 1 ||
        objective.npcId !== [126, 171, 127, 517][index] ||
        objective.count !== 7,
    ) ||
    !coastrunner ||
    coastrunner.minimumLevel !== 12 ||
    coastrunner.maximumLevel !== 13 ||
    coastrunner.rank !== 0 ||
    catalog.quests.some((entry) =>
      [...entry.prerequisites.allOf, ...entry.prerequisites.anyOf].includes(152),
    )
  )
    return plan;
  const coastIds = new Set(coast.map((action) => action.id));
  if (
    plan.actions.some(
      (action) =>
        !coastIds.has(action.id) &&
        (action.requiredQuestIds?.includes(152) ||
          action.sourceGateConflictQuestIds?.includes(152) ||
          action.source?.conditions?.checks.some((check) =>
            check.arguments.split(",").map(Number).includes(152),
          )),
    )
  )
    return plan;
  if (coast.every((action) => action.excludedByOptionalQuestId === 959)) return plan;
  return {
    ...plan,
    actions: plan.actions.map((action) =>
      coastIds.has(action.id) ? { ...action, excludedByOptionalQuestId: 959 } : action,
    ),
    partyPolicy: {
      ...plan.partyPolicy,
      decisions: plan.partyPolicy.decisions.map((decision) =>
        decision.questId === 152
          ? {
              ...decision,
              reason:
                "Outdoor alternative when Wailing Caverns is skipped; keep all four seven-kill objectives and the hand-in together.",
            }
          : decision,
      ),
    },
  };
}
