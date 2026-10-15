import { premadeReward } from "./premade.js";
import type { DungeonRewardEstimate } from "./dungeon-xp.js";
import { questEligibility } from "./quest-eligibility.js";

export interface QuestRewardFact {
  readonly questId: number;
  readonly fullXp: number | null;
  readonly questLevel: number | null;
  readonly minimumLevel: number | null;
  readonly xpByLevel: readonly { readonly level: number; readonly xp: number }[];
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly status: "available" | "unknown" | "conflict";
}

export interface QuestRewardResolution extends DungeonRewardEstimate {
  readonly minimumLevel: number | null;
}

export function resolveQuestReward(
  questId: number,
  level: number,
  facts: readonly QuestRewardFact[] = [],
): QuestRewardResolution {
  const fact = facts.find((entry) => entry.questId === questId);
  const { minimumLevel } = questEligibility(questId, facts);
  const unknown = (source: string): QuestRewardResolution => ({
    xp: null,
    basis: "unknown",
    source,
    minimumLevel,
  });
  if (!Number.isInteger(level) || level < 1 || level > 60) return unknown("Invalid hand-in level.");
  if (level === 60)
    return {
      xp: 0,
      basis: "base-estimate",
      source: "The level-60 cap contributes no further leveling XP.",
      minimumLevel,
    };
  if (fact?.status === "conflict") return unknown(`Conflicting reward evidence: ${fact.sourceUrl}`);
  if (minimumLevel !== null && level < minimumLevel)
    return unknown(
      `Pickup requires level ${minimumLevel}; this is an ineligible hand-in context, not a missing reward.`,
    );
  if (fact?.status === "available") {
    const reward = fact.xpByLevel.find((entry) => entry.level === level)?.xp;
    if (reward !== undefined)
      return {
        xp: reward,
        basis: "wowhead-reference",
        source: fact.sourceUrl,
        minimumLevel,
      };
    if (
      fact.fullXp !== null &&
      fact.questLevel !== null &&
      level < 60 &&
      level <= fact.questLevel + 5
    )
      return {
        xp: fact.fullXp,
        basis: "wowhead-reference",
        source: fact.sourceUrl,
        minimumLevel,
      };
    return unknown(`No reward amount is established at hand-in level ${level}: ${fact.sourceUrl}`);
  }
  return {
    ...premadeReward({ questId, role: "core" }, level),
    minimumLevel,
  };
}
