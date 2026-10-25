import { getPremadeRewardReference, premadeReward } from "./premade.js";
import type { DungeonRewardEstimate } from "./dungeon-xp.js";
import { questEligibility } from "./quest-eligibility.js";
import {
  estimateDungeonTableXp,
  isDungeonTableQuest,
  isUnplayedDungeonQuest,
  ORDINARY_DUNGEON_XP_MULTIPLIER,
} from "./dungeon-xp.js";
import { DUNGEON_FACTS } from "./dungeon-catalog.js";

export interface QuestRewardFact {
  readonly questId: number;
  readonly fullXp: number | null;
  readonly questLevel: number | null;
  readonly minimumLevel: number | null;
  readonly xpByLevel: readonly { readonly level: number; readonly xp: number }[];
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly status: "available" | "unknown" | "conflict";
  readonly evidenceKind?: "published-forever" | "historical-reference" | "observed-forever";
  readonly referenceBaseXp?: number | null;
  readonly pageMultiplier?: number | null;
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
    const tableQuest = DUNGEON_FACTS.quests.find((entry) => entry.id === questId);
    const knownTableBase =
      tableQuest?.baseXp ??
      tableQuest?.referenceXp ??
      getPremadeRewardReference(questId)?.baseXp ??
      null;
    const tableBase =
      fact.referenceBaseXp ??
      (fact.evidenceKind === "historical-reference" && fact.fullXp === knownTableBase
        ? fact.fullXp
        : null);
    const unscaledTable =
      fact.evidenceKind !== "observed-forever" &&
      isDungeonTableQuest(questId) &&
      (isUnplayedDungeonQuest(questId) ||
        fact.pageMultiplier === 1 ||
        fact.evidenceKind === "historical-reference");
    if (
      unscaledTable &&
      tableBase !== null &&
      tableBase !== undefined &&
      fact.questLevel !== null
    ) {
      return {
        xp: estimateDungeonTableXp(tableBase, fact.questLevel, level),
        basis: "base-estimate",
        minimumLevel,
        source: `Dungeon table ${tableBase} XP × ${ORDINARY_DUNGEON_XP_MULTIPLIER} planning coefficient, rounded with overlevel reduction; not an observed reward. ${fact.sourceUrl}`,
      };
    }
    const basis =
      fact.evidenceKind === "historical-reference"
        ? ("base-estimate" as const)
        : fact.evidenceKind === "observed-forever"
          ? ("reported-forever" as const)
          : ("wowhead-reference" as const);
    const reward = fact.xpByLevel.find((entry) => entry.level === level)?.xp;
    if (reward !== undefined)
      return {
        xp: reward,
        basis,
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
        basis,
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
