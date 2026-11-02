import type { CampaignPlan } from "./campaign.js";
import { resolveCombatQuota } from "./combat-loot.js";
import type { CombatDataset, CombatObjective } from "./combat-model.js";

export const FIVE_PLAYER_LOOT_BUDGET = {
  partySize: 5,
  maximumExpectedKills: 20,
  maximumSlowKills: 40,
} as const;

export interface PartyQuestLootCost {
  readonly eligible: boolean;
  readonly expectedKills: number | null;
  readonly slowKills: number | null;
  readonly reason: string;
}

export function partyQuestLootCost(
  questId: number,
  plan: CampaignPlan,
  data?: CombatDataset,
  partySize: number = FIVE_PLAYER_LOOT_BUDGET.partySize,
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
  const objectives = new Map<string, CombatObjective>();
  for (const activity of plan.combat.activities)
    for (const objective of activity.objectives)
      if (objective.questId === questId && objective.credit === "personal-loot")
        objectives.set(`${objective.objectiveIndex}:${objective.loot?.itemId ?? 0}`, objective);
  for (const work of plan.combat.materialWork ?? [])
    for (const { objective } of work.targets)
      if (objective.questId === questId && objective.credit === "personal-loot")
        objectives.set(`${objective.objectiveIndex}:${objective.loot?.itemId ?? 0}`, objective);
  const requiredItems = reference?.itemObjectives?.filter((item) => !item.provided) ?? [];
  if (
    !objectives.size ||
    requiredItems.some(
      (item) =>
        ![...objectives.values()].some((objective) => objective.loot?.itemId === item.itemId),
    )
  )
    return unknown("The party's complete item quota and loot-sharing rule are not established.");
  let expectedKills = 0;
  let slowKills = 0;
  for (const objective of objectives.values()) {
    const expected = resolveCombatQuota(objective, plan.combat, partySize, "expected");
    const slow = resolveCombatQuota(objective, plan.combat, partySize, "slow");
    if (expected.kills === null || slow.kills === null)
      return unknown(expected.reason ?? slow.reason ?? "Drop cost is unresolved.");
    expectedKills += expected.kills;
    slowKills += slow.kills;
  }
  const eligible =
    expectedKills <= FIVE_PLAYER_LOOT_BUDGET.maximumExpectedKills &&
    slowKills <= FIVE_PLAYER_LOOT_BUDGET.maximumSlowKills;
  return {
    eligible,
    expectedKills,
    slowKills,
    reason: eligible
      ? `The complete ${partySize === 1 ? "personal" : `${partySize}-player`} loot quota fits the collection budget.`
      : `The complete ${partySize === 1 ? "personal" : `${partySize}-player`} loot quota exceeds the collection budget.`,
  };
}
