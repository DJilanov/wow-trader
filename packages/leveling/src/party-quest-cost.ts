import type { CampaignPlan, CampaignSource } from "./campaign.js";
import { resolveCombatQuota } from "./combat-loot.js";
import {
  combatObjectiveKey,
  type CampaignCombatPlan,
  type CombatDataset,
  type CombatObjective,
} from "./combat-model.js";
import {
  campaignAuctionMeatSupplies,
  MAXIMUM_ROUTE_MEAT_ITEMS_PER_PLAYER,
  type CampaignAuctionSupply,
} from "./campaign-meat-supplies.js";
import { purchasedCampaignQuestItems } from "./campaign-quest-purchases.js";
import { groundCampaignQuestItemKeys } from "./campaign-quest-ground-items.js";

export const FIVE_PLAYER_LOOT_BUDGET = {
  partySize: 5,
  maximumExpectedKills: 100,
  maximumSlowKills: 150,
  minimumCampDropProbability: 0.25,
} as const;

const STANDARD_LOOT_BUDGET = {
  maximumExpectedKills: 20,
  maximumSlowKills: 40,
} as const;

interface CollectionKillBudget {
  readonly maximumExpectedKills: number;
  readonly maximumSlowKills: number;
}

export function partyQuestCollectionBudget(
  partySize: number,
  sharedQuestsOnly: boolean,
): CollectionKillBudget {
  return sharedQuestsOnly && partySize === 5 ? FIVE_PLAYER_LOOT_BUDGET : STANDARD_LOOT_BUDGET;
}

export interface PartyQuestLootCost {
  readonly eligible: boolean;
  readonly expectedKills: number | null;
  readonly slowKills: number | null;
  readonly reason: string;
  readonly auctionItems?: readonly CampaignAuctionSupply[];
  readonly retainedByDropRate?: true;
  readonly budgetedKills?: PartyCollectionKillCost;
}

export interface PartyCollectionKillCost {
  readonly expectedKills: number;
  readonly slowKills: number;
}

function hasCapturedCampRate(objective: CombatObjective, combat: CampaignCombatPlan): boolean {
  if (objective.npcIds.length !== 1 || !objective.loot) return false;
  const npcId = objective.npcIds[0]!;
  const npc = combat.npcs.find((npc) => npc.id === npcId);
  const captures =
    combat.lootDrops?.filter(
      (drop) => drop.npcId === npcId && drop.itemId === objective.loot!.itemId,
    ) ?? [];
  const drop = captures[0];
  return (
    npc?.rank === 0 &&
    npc.minimumLevel !== null &&
    npc.maximumLevel !== null &&
    captures.length === 1 &&
    drop !== undefined &&
    drop.targetBuild === combat.targetBuild &&
    (drop.sourceBuild == null || drop.sourceBuild === combat.targetBuild) &&
    drop.probabilityBasis !== "reported-override" &&
    drop.probability > FIVE_PLAYER_LOOT_BUDGET.minimumCampDropProbability &&
    combat.activities.some(
      (activity) =>
        activity.environment === "outdoor" &&
        activity.profile === null &&
        activity.objectives.some(
          (entry) =>
            entry.credit === "personal-loot" &&
            entry.loot?.itemId === objective.loot!.itemId &&
            combatObjectiveKey(entry) === combatObjectiveKey(objective) &&
            entry.npcIds.length === 1 &&
            entry.npcIds[0] === npcId,
        ),
    )
  );
}

export function partyQuestLootCost(
  questId: number,
  plan: CampaignPlan,
  data?: CombatDataset,
  partySize: number = FIVE_PLAYER_LOOT_BUDGET.partySize,
  sources: readonly CampaignSource[] = [],
): PartyQuestLootCost {
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 5)
    throw new Error("Invalid quest collection party size.");
  const unknown = (reason: string): PartyQuestLootCost => ({
    eligible: false,
    expectedKills: null,
    slowKills: null,
    reason,
  });
  if (data && data.targetBuild !== plan.targetBuild)
    return unknown("Quest-item references belong to a different build.");
  const reference = data?.quests.find((quest) => quest.questId === questId);
  if (reference?.itemObjectives?.length && reference.itemObjectives.every((item) => item.provided))
    return {
      eligible: true,
      expectedKills: 0,
      slowKills: 0,
      reason: "The required items are provided; no drop farm is needed.",
    };
  if (!plan.combat || plan.combat.targetBuild !== plan.targetBuild)
    return unknown("No compatible party loot evidence is available.");
  const purchases = new Set(
    purchasedCampaignQuestItems(questId, plan, sources, data).map(
      (purchase) => `${purchase.objectiveIndex}:${purchase.itemId}`,
    ),
  );
  const groundItems = groundCampaignQuestItemKeys(questId, plan, sources, data);
  const objectives = new Map<string, CombatObjective>();
  for (const activity of plan.combat.activities)
    for (const objective of activity.objectives)
      if (objective.questId === questId && objective.credit === "personal-loot")
        objectives.set(`${objective.objectiveIndex}:${objective.loot?.itemId ?? 0}`, objective);
  for (const work of plan.combat.materialWork ?? [])
    for (const { objective } of work.targets)
      if (objective.questId === questId && objective.credit === "personal-loot")
        objectives.set(`${objective.objectiveIndex}:${objective.loot?.itemId ?? 0}`, objective);
  for (const key of purchases) objectives.delete(key);
  for (const key of groundItems) objectives.delete(key);
  const requiredItems =
    reference?.itemObjectives?.filter(
      (item) => !item.provided && !purchases.has(`${item.objectiveIndex}:${item.itemId}`) &&
        !groundItems.has(`${item.objectiveIndex}:${item.itemId}`),
    ) ?? [];
  if (!objectives.size && !requiredItems.length && (purchases.size || groundItems.size))
    return {
      eligible: true,
      expectedKills: 0,
      slowKills: 0,
      reason: groundItems.size
        ? "The selected source gathers or buys every required item; complete all personal quotas without a creature-drop farm."
        : "The selected source buys all required items from referenced vendors; no drop farm is needed.",
    };
  if (
    !objectives.size ||
    requiredItems.some(
      (item) =>
        ![...objectives.values()].some((objective) =>
          objective.objectiveIndex === item.objectiveIndex &&
          objective.loot?.itemId === item.itemId &&
          objective.loot.quantity === item.quantity && !objective.quotaConflict,
        ),
    )
  )
    return unknown("The party's complete item quota and loot-sharing rule are not established.");
  let expectedKills = 0;
  let slowKills = 0;
  let budgetedExpectedKills = 0;
  let budgetedSlowKills = 0;
  let highDropCamps = 0;
  for (const objective of objectives.values()) {
    const expected = resolveCombatQuota(objective, plan.combat, partySize, "expected");
    const slow = resolveCombatQuota(objective, plan.combat, partySize, "slow");
    if (expected.kills === null || slow.kills === null)
      return unknown(expected.reason ?? slow.reason ?? "Drop cost is unresolved.");
    expectedKills += expected.kills;
    slowKills += slow.kills;
    if (plan.sharedQuestsOnly === true && partySize === 5 &&
      hasCapturedCampRate(objective, plan.combat)) highDropCamps++;
    else {
      budgetedExpectedKills += expected.kills;
      budgetedSlowKills += slow.kills;
    }
  }
  // These costs already include all five players' items; they are not per-player limits.
  const killBudget = partyQuestCollectionBudget(partySize, plan.sharedQuestsOnly === true);
  const gatheringFits =
    budgetedExpectedKills <= killBudget.maximumExpectedKills &&
    budgetedSlowKills <= killBudget.maximumSlowKills;
  const retainedByDropRate = highDropCamps === objectives.size;
  const mixedCampRates = highDropCamps > 0 && highDropCamps < objectives.size;
  const auctionItems = campaignAuctionMeatSupplies(
    [...objectives.values()],
    plan.combat,
    reference
      ? {
          ...reference,
          itemObjectives: requiredItems,
        }
      : undefined,
  );
  const meatSuppliesFit =
    auctionItems !== null &&
    auctionItems.reduce((total, item) => total + item.quantityPerPlayer, 0) <=
      MAXIMUM_ROUTE_MEAT_ITEMS_PER_PLAYER;
  const eligible = gatheringFits || meatSuppliesFit || retainedByDropRate;
  return {
    eligible,
    expectedKills,
    slowKills,
    ...(meatSuppliesFit ? { auctionItems: auctionItems! } : {}),
    ...(retainedByDropRate ? { retainedByDropRate: true as const } : {}),
    ...(mixedCampRates ? { budgetedKills: {
      expectedKills: budgetedExpectedKills, slowKills: budgetedSlowKills,
    } } : {}),
    reason:
      meatSuppliesFit && !gatheringFits
        ? "Retained ordinary high-drop meat: use existing stock, buy it when affordable, or gather it on route. The listed kill cost applies only to gathering."
        : retainedByDropRate
          ? "Every selected outdoor camp drop exceeds 25% in the captured data; retain the complete five-player quota and its listed kill cost."
          : mixedCampRates && gatheringFits
            ? "Retain the full five-player workload: captured high-drop camps qualify separately, and the remaining drops fit the collection budget."
          : eligible
            ? `The complete ${partySize === 1 ? "personal" : `${partySize}-player`} loot quota fits the collection budget.`
            : `The complete ${partySize === 1 ? "personal" : `${partySize}-player`} loot quota exceeds the collection budget.`,
  };
}
