import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignSourceDeliveries } from "./campaign-source-deliveries.js";
import { campaignActionZones } from "./campaign-geography.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { attachCampaignCombat } from "./campaign-combat.js";

function closedParent(quest: QuestCatalogEntry, parent: number | null): boolean {
  const parents = [...quest.prerequisites.allOf, ...quest.prerequisites.anyOf];
  return parent === null
    ? parents.length === 0
    : parents.length > 0 && parents.every((id) => id === parent);
}

function ownedMethod(
  plan: CampaignPlan,
  questId: number,
  captured: readonly CampaignAction[],
  states: readonly string[],
  zones: readonly string[],
  parent: number | null,
): readonly CampaignAction[] | null {
  const owned = plan.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === questId),
  );
  if (owned.length !== captured.length || owned.length !== states.length) return null;
  if (
    owned.some(
      (action, index) =>
        action.kind !== "quests" ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.bundleId ||
        action.movement ||
        action.itemCollections?.length ||
        action.auctionSupplies?.length ||
        action.optionalForQuestIds?.length ||
        action.excludedByOptionalQuestId !== undefined ||
        !action.fundingCheckpointId ||
        !action.source ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.state !== states[index] ||
        !action.positions.length ||
        action.positions.some((entry) => entry.position.zone !== zones[index]) ||
        action.requiredQuestIds?.some((id) => id !== parent) ||
        !["preparation", "xp-bridge"].includes(
          plan.legs.find((leg) => leg.id === action.legId)?.kind ?? "",
        ) ||
        JSON.stringify([action.questChanges, action.source, action.positions]) !==
          JSON.stringify([
            captured[index]!.questChanges,
            captured[index]!.source,
            captured[index]!.positions,
          ]),
    )
  )
    return null;
  return owned;
}

function sameCapturedStop(first: CampaignAction, second: CampaignAction): boolean {
  return (
    JSON.stringify([first.source, first.positions]) ===
    JSON.stringify([second.source, second.positions])
  );
}

/** Keep the owned Althalaxx collection and road handoff on the earlier northern visit. */
export function connectEarlyNorthernFollowups(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset,
  catalog: QuestCatalog,
): CampaignPlan {
  if (!plan.sharedQuestsOnly || plan.race !== "human" || plan.partyPolicy?.partySize !== 5)
    return plan;
  const northern = plan.legs.find((leg) => leg.id === "northern-approach");
  const trips = plan.legs.filter(
    (leg) => leg.dungeonVisitId === "wailing-caverns" && leg.optionalQuestId === 959,
  );
  if (
    !northern ||
    trips.length !== 1 ||
    plan.actions.some(
      (action) =>
        action.legId === northern.id &&
        action.questChanges.some((change) => change.questId === 966 || change.questId === 967),
    )
  )
    return plan;
  const collection = campaignFundingCollections(plan, sources, data, catalog).get(966);
  const deliveries = campaignSourceDeliveries(
    {
      ...plan,
      actions: plan.actions.filter(
        (action) =>
          !action.questChanges.some((change) => change.questId === 965 || change.questId === 967),
      ),
    },
    sources,
    data,
    catalog,
  );
  const initial = deliveries.get(965),
    onward = deliveries.get(967);
  const collectionQuest = catalog.quests.find((quest) => quest.questId === 966);
  if (
    !collection?.retainedByDropRate ||
    collection.sharedKills?.length ||
    !initial ||
    !onward ||
    initial.requiresFreshStart ||
    onward.requiresFreshStart ||
    initial.approaches?.length ||
    onward.approaches?.length ||
    !collectionQuest ||
    !closedParent(initial.quest, null) ||
    !closedParent(collectionQuest, 965) ||
    !closedParent(onward.quest, 966)
  )
    return plan;
  const first = ownedMethod(
    plan,
    965,
    initial.actions,
    ["accepted", "rewarded"],
    ["1439", "1439"],
    null,
  );
  const second = ownedMethod(
    plan,
    966,
    collection.actions,
    ["accepted", "objectives-complete", "rewarded"],
    ["1439", "1439", "1439"],
    965,
  );
  const third = ownedMethod(
    plan,
    967,
    onward.actions,
    ["accepted", "rewarded"],
    ["1439", "1440"],
    966,
  );
  if (
    !first ||
    !second ||
    !third ||
    first.some((action) => action.legId !== northern.id) ||
    !sameCapturedStop(first[1]!, second[0]!) ||
    !sameCapturedStop(second[2]!, third[0]!)
  )
    return plan;
  const trip = trips[0]!;
  const start = plan.actions.findIndex((action) => action.legId === trip.id);
  const approach = plan.actions[start];
  const previous = plan.actions[start - 1];
  if (
    !approach ||
    !previous ||
    approach.kind !== "instructions" ||
    approach.source ||
    approach.questChanges.length ||
    approach.location?.zone !== "1413" ||
    previous.legId !== northern.id ||
    plan.actions.indexOf(first[0]!) >= plan.actions.indexOf(first[1]!) ||
    plan.actions.indexOf(first[1]!) >= start ||
    [...second, ...third].some((action) => plan.actions.indexOf(action) <= start)
  )
    return plan;
  const originalRoad = campaignGroundJourney("1439", "1413");
  const northRoad = campaignGroundJourney("1439", "1440");
  const onwardRoad = campaignGroundJourney("1440", "1413");
  if (
    !originalRoad ||
    !northRoad ||
    !onwardRoad ||
    [...northRoad, ...onwardRoad].some((leg) => leg.mode !== "road") ||
    JSON.stringify(originalRoad) !== JSON.stringify([...northRoad, ...onwardRoad])
  )
    return plan;
  const handoffAnchor = plan.actions
    .slice(plan.actions.indexOf(first[1]!) + 1, start + 1)
    .find((action) => {
      const target = action.location?.zone ?? campaignActionZones(action)[0];
      const road = target ? campaignGroundJourney("1439", target) : null;
      return (
        road !== null &&
        road.length > 0 &&
        road[0]!.from === "1439" &&
        road[0]!.to === "1440" &&
        road.every((leg) => leg.mode === "road")
      );
    });
  if (!handoffAnchor) return plan;
  const movedIds = new Set([...second, ...third].map((action) => action.id));
  const relocate = (action: CampaignAction): CampaignAction => ({
    ...action,
    legId: northern.id,
    libraryBackbone: true,
    xpOptional: false,
  });
  const pickupWork = [...second, third[0]!].map(relocate);
  const handoff: CampaignAction = {
    ...relocate(third[1]!),
    location: { zone: "1440", visitOverride: true },
  };
  const priorDirections = new Set(originalRoad.map((leg) => leg.instruction));
  const actions = plan.actions.flatMap((action): readonly CampaignAction[] => {
    if (movedIds.has(action.id)) return [];
    const current =
      action === approach && handoffAnchor === approach
        ? {
            ...action,
            instructions: [
              ...action.instructions.filter((line) => !priorDirections.has(line)),
              ...onwardRoad.map((leg) => leg.instruction),
            ],
          }
        : action;
    const retained = action === first[1] ? [current, ...pickupWork] : [current];
    return action === handoffAnchor ? [handoff, ...retained] : retained;
  });
  return attachCampaignCombat(
    {
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
    },
    sources,
    data,
    plan.combat?.revision ?? "northern-followups",
  );
}
