import type { CampaignFundingExecutor } from "./campaign-funding-scenarios.js";
import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { connectEarlyNorthernFollowups } from "./campaign-northern-followups.js";
import { earlyNorthernCourier } from "./campaign-northern-courier.js";
import { earlyPreparationCouriers, earlySpiderCamp } from "./campaign-early-preparation-source.js";
import { reorderEarlyPreparation } from "./campaign-early-preparation-route.js";
import {
  campaignFundingStates,
  campaignFundingProgressBefore,
} from "./campaign-funding-scenarios.js";
import { campaignFundingCollections } from "./campaign-funding-collections.js";
import { campaignFundingBatch } from "./campaign-funding-quests.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";
import { resolveQuestReward } from "./quest-rewards.js";
import { MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP } from "./campaign-combat-policy.js";
import { connectCampaignStarterScouting } from "./campaign-starter-scouting.js";
import { attachWailingCavernsAlternative } from "./campaign-wailing-caverns-alternative.js";

/** Fund the primary early itinerary with connected quest work, preserving the original fallback. */
export function connectEarlyCampaignPreparation(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  data: CombatDataset,
  catalog: QuestCatalog,
  statesForPlan: CampaignFundingExecutor = campaignFundingStates,
): CampaignPlan {
  if (plan.legs.some((leg) => leg.id === "eastern-deadmines-preparation"))
    return connectEarlyNorthernFollowups(plan, sources, data, catalog);
  if (
    !plan.legs.some((leg) => leg.id === "wailing-caverns-catchup") ||
    plan.actions.some((action) =>
      action.questChanges.some((change) => [120, 129].includes(change.questId)),
    )
  )
    return plan;
  const collections = campaignFundingCollections(plan, sources, data, catalog);
  const collection = collections.get(20);
  if (!collection?.retainedByDropRate || collection.maximumEnemyLevel > 21) return plan;
  const existing = plan.actions.filter((action) =>
    action.questChanges.some((change) => change.questId === 20),
  );
  // Earlier funding may already own this complete method in a later section.
  // Relocate that exact work rather than dropping the whole connected itinerary.
  if (
    existing.length &&
    (existing.length !== collection.actions.length ||
      existing.some((action, index) => {
        const captured = collection.actions[index]!;
        return (
          action.kind !== "quests" ||
          action.leaderOnly ||
          action.raidOnly ||
          action.dungeonFinishOnly ||
          action.itemCollections?.length ||
          !["preparation", "xp-bridge"].includes(
            plan.legs.find((leg) => leg.id === action.legId)?.kind ?? "",
          ) ||
          JSON.stringify([action.questChanges, action.source, action.positions]) !==
            JSON.stringify([captured.questChanges, captured.source, captured.positions])
        );
      }))
  )
    return plan;
  const existingIds = new Set(existing.map((action) => action.id));
  const remaining = plan.actions.filter((action) => !existingIds.has(action.id));
  const unallocated: CampaignPlan = existing.length
    ? {
        ...plan,
        actions: remaining,
        legs: plan.legs.map((leg) => ({
          ...leg,
          actionIds: leg.actionIds.filter((id) => !existingIds.has(id)),
          questIds: leg.questIds.filter((id) => id !== 20),
        })),
      }
    : plan;
  const couriers = earlyPreparationCouriers(unallocated, sources, data, catalog);
  const camp = couriers ? earlySpiderCamp(unallocated, data, catalog) : null;
  const routed =
    couriers && camp
      ? reorderEarlyPreparation(
          unallocated,
          couriers,
          camp,
          earlyNorthernCourier(unallocated, sources, data, catalog),
        )
      : null;
  const northern = routed ? connectEarlyNorthernFollowups(routed, sources, data, catalog) : null;
  const reordered = northern
    ? attachWailingCavernsAlternative(
        connectCampaignStarterScouting(northern, sources, data, catalog),
        catalog,
      )
    : null;
  if (!reordered || !plan.questFunding || !plan.partyPolicy) return plan;
  const marker = reordered.actions.find((action) => action.legId === "early-duskwood-spiders");
  const gate = reordered.actions.find(
    (action) =>
      action.kind === "xp-check" &&
      action.targetStopId === "lordaeron" &&
      action.legId === "defias-unlock",
  );
  const root = catalog.quests.find((quest) => quest.questId === 20);
  if (!marker || !gate || !root || resolveQuestReward(20, 18, plan.rewardFacts ?? []).xp === null)
    return plan;
  const minimumReadyLevel = Math.max(
    root.minimumLevel ?? 60,
    collection.maximumEnemyLevel - MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP,
  );
  const states = statesForPlan(reordered);
  const progress = states.map((state) => campaignFundingProgressBefore(state, marker.id));
  if (
    !reordered.sharedQuestsOnly ||
    !progress.length ||
    progress.some((state) =>
      state.members.some(
        (member) =>
          member.level === null ||
          member.level < minimumReadyLevel ||
          member.currentXp === null ||
          member.xpNeedsUpdate,
      ),
    )
  )
    return plan;
  const before = reordered.actions[reordered.actions.indexOf(marker) - 1];
  const position = before?.positions[0]?.position;
  if (!position || position.zone !== "1433") return plan;
  const batch = campaignFundingBatch(root, catalog, data, progress[0]!, {
    legId: "early-redridge-threat",
    checkpointId: gate.id,
    targetLevel: 19,
    previous: position,
    previousZone: "1433",
    resumeZone: "1431",
    forbiddenQuestIds: new Set(
      reordered.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
    ),
    maximumQuestLevel: 21,
    leaderOnly: false,
    ...(reordered.sharedQuestsOnly ? { sharedQuestsOnly: true as const } : {}),
    existingActions: reordered.actions,
    includeGroundPickups: true,
    includeNpcDeliveries: true,
    includePartyElites: true,
    sourceCollections: collections,
  });
  if (
    !batch ||
    batch.questIds.length !== 1 ||
    batch.questIds[0] !== 20 ||
    !Number.isFinite(batch.travelCost)
  )
    return plan;
  const added = (existing.length ? existing : batch.actions).map((action) => ({
    ...action,
    legId: "early-redridge-threat",
    fundingCheckpointId: gate.id,
    libraryBackbone: true,
    xpOptional: false,
  }));
  const at = reordered.actions.indexOf(marker);
  const decisions = new Map(
    reordered.partyPolicy?.decisions.map((decision) => [decision.questId, decision]),
  );
  for (const questId of [120, 129])
    decisions.set(questId, {
      questId,
      objective: "delivery",
      included: true,
      requiredFor: [],
      lootCost: null,
      reason:
        "Captured parcel delivery on the existing Lakeshire, Guard Parker and Stormwind visits; retain both source phases for every player.",
    });
  const candidate: CampaignPlan = {
    ...reordered,
    actions: [...reordered.actions.slice(0, at), ...added, ...reordered.actions.slice(at)],
    legs: reordered.legs.map((leg) =>
      leg.id === "early-redridge-threat"
        ? {
            ...leg,
            title: "Redridge: gnolls and the Blackrock camp",
            questIds: [...leg.questIds, 20],
            actionIds: [...leg.actionIds, ...added.map((action) => action.id)],
          }
        : leg,
    ),
    partyPolicy: {
      ...(reordered.partyPolicy ?? plan.partyPolicy),
      decisions: [...decisions.values()],
    },
    questFunding: {
      ...(reordered.questFunding ?? plan.questFunding),
      addedQuestIds: [
        ...new Set([...(reordered.questFunding ?? plan.questFunding).addedQuestIds, 20, 120, 129]),
      ],
    },
    ...(reordered.sharedSourceQuestIds
      ? { sharedSourceQuestIds: [...new Set([...reordered.sharedSourceQuestIds, 20, 120, 129])] }
      : {}),
  };
  const attached = attachCampaignCombat(
    candidate,
    sources,
    data,
    plan.combat?.revision ?? "early-preparation",
  );
  const partyPolicy = refreshFundedCampaignPartyPolicy(attached, sources, data, catalog);
  return { ...attached, ...(partyPolicy ? { partyPolicy } : {}) };
}
