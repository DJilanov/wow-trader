import type { PremadeMember } from "./premade-model.js";
import { questEligibility } from "./quest-eligibility.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const targets: readonly number[] = (() => {
  const result = [0, 0];
  for (let level = 1; level < 60; level++)
    result[level + 1] = result[level]! + FOREVER_XP_CURVE[level]!;
  return result;
})();

export interface CampaignPickupBudget {
  readonly isFunded: (level: number) => boolean;
  readonly requireLevel: (level: number) => void;
  readonly reward: (questId: number) => void;
}

function targetXp(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 60)
    throw new Error("Invalid pickup budget level.");
  return targets[level]!;
}

function rewardFloors(
  fact: QuestRewardFact | undefined,
): { readonly minimumLevel: number; readonly byTarget: readonly number[] } | null {
  if (!fact || fact.status !== "available" || fact.evidenceKind === "historical-reference")
    return null;
  const eligibility = questEligibility(fact.questId, [fact]);
  if (eligibility.minimumLevel === null || eligibility.minimumConflict) return null;
  const result = Array<number>(61).fill(0);
  let minimum = Infinity;
  // If a player has not reached a gate, every earlier hand-in occurred below that level.
  // Use the smallest verified reward in that range, including overlevel reductions.
  for (let level = eligibility.minimumLevel; level < 60; level++) {
    const reward = resolveQuestReward(fact.questId, level, [fact]);
    minimum = Math.min(minimum, reward.xp ?? 0);
    result[level + 1] = minimum;
  }
  return { minimumLevel: eligibility.minimumLevel, byTarget: result };
}

export function createCampaignPickupBudget(
  facts: readonly QuestRewardFact[],
): CampaignPickupBudget {
  const byId = new Map<number, QuestRewardFact>();
  for (const fact of facts) if (!byId.has(fact.questId)) byId.set(fact.questId, fact);
  const lowerBounds = Array<number>(61).fill(0);
  const paid = new Set<number>();
  function requireLevel(level: number): void {
    const floor = targetXp(level);
    for (let target = 1; target <= 60; target++)
      lowerBounds[target] = Math.min(targets[target]!, Math.max(lowerBounds[target]!, floor));
  }
  return {
    isFunded(level: number): boolean {
      return lowerBounds[level]! >= targetXp(level);
    },
    requireLevel,
    reward(questId: number): void {
      if (paid.has(questId)) return;
      paid.add(questId);
      const floors = rewardFloors(byId.get(questId));
      if (floors === null) return;
      requireLevel(floors.minimumLevel);
      for (let level = 2; level <= 60; level++)
        lowerBounds[level] = Math.min(
          targets[level]!,
          lowerBounds[level]! + floors.byTarget[level]!,
        );
    },
  };
}

export function campaignPickupLevelMet(
  member: PremadeMember,
  level: number,
  facts: readonly QuestRewardFact[],
): boolean {
  targetXp(level);
  if (member.level !== null && member.level >= level) return true;
  const budget = createCampaignPickupBudget(facts);
  // Prove only a level floor from reported rewards. Do not add them to an observed XP bar.
  // Reports have no timestamps. Assume the least favorable ordering, not numeric quest-ID order.
  const rewarded = Object.entries(member.questStates)
    .filter(([, state]) => state === "rewarded")
    .map(([id]) => {
      const questId = Number(id);
      return { questId, minimum: questEligibility(questId, facts).minimumLevel ?? 1 };
    })
    .sort((left, right) => left.minimum - right.minimum);
  for (const { questId } of rewarded) {
    budget.reward(questId);
    if (budget.isFunded(level)) return true;
  }
  return budget.isFunded(level);
}
