import { DUNGEON_FACTS, DUNGEON_REFERENCE, DUNGEON_VISITS } from "./dungeon-catalog.js";

export interface DungeonRewardEstimate {
  readonly xp: number | null;
  readonly basis: "reported-forever" | "wowhead-reference" | "base-estimate" | "unknown";
  readonly source: string;
}

export const ORDINARY_DUNGEON_XP_MULTIPLIER = 2.375;
const earlierQuestIds = new Set(
  DUNGEON_VISITS.filter((visit) => visit.levels && visit.levels.atLevel <= 33).flatMap(
    (visit) => visit.questIds,
  ),
);
const laterQuestIds = new Set(
  DUNGEON_VISITS.filter((visit) => visit.levels && visit.levels.atLevel > 33)
    .flatMap((visit) => visit.questIds)
    .filter((id) => !earlierQuestIds.has(id)),
);

export function isUnplayedDungeonQuest(questId: number): boolean {
  return laterQuestIds.has(questId);
}

export function isDungeonTableQuest(questId: number): boolean {
  return (
    DUNGEON_FACTS.associations.some((entry) => entry.questId === questId) ||
    DUNGEON_REFERENCE.associations.some((entry) => entry.questId === questId)
  );
}

export function estimateDungeonTableXp(
  baseXp: number,
  questLevel: number,
  handInLevel: number,
  coefficient = ORDINARY_DUNGEON_XP_MULTIPLIER,
): number | null {
  if (
    !Number.isSafeInteger(baseXp) ||
    baseXp < 0 ||
    baseXp > 1_000_000 ||
    !Number.isInteger(questLevel) ||
    questLevel < 1 ||
    questLevel > 60 ||
    !Number.isInteger(handInLevel) ||
    handInLevel < 1 ||
    handInLevel > 60 ||
    !Number.isFinite(coefficient) ||
    coefficient <= 0 ||
    coefficient > 20
  )
    return null;
  if (handInLevel === 60) return 0;
  const difference = handInLevel - questLevel;
  const reduction = difference >= 10 ? 0.1 : difference >= 6 ? 1 - (difference - 5) * 0.2 : 1;
  const amount = Math.round(baseXp * coefficient) * reduction;
  const step = amount < 1000 ? 10 : 50;
  return Math.round(amount / step) * step;
}
const reported: Readonly<Record<number, number>> = {
  214: 2950,
  378: 5750,
  2922: 4750,
  95189: 6200,
  96403: 2950,
  96800: 6750,
  92457: 9400,
  92458: 9400,
  96984: 9400,
  6565: 6489,
  6921: 6746,
  6922: 7468,
  95646: 6150,
  95647: 4900,
  95772: 6150,
  95809: 6150,
};
const reviewedBaseReferences = new Set([
  386, 377, 387, 388, 391, 2922, 2926, 2962, 2928, 2924, 2930, 2929, 2841, 2904, 2948, 2950, 1050,
  92456, 92489, 98823, 98824,
]);

export function estimateDungeonReward(
  questId: number,
  level: number,
  fallback?: {
    readonly baseXp: number | null;
    readonly questLevel: number | null;
    readonly source: string;
  },
  mode: "ordinary" | "crest" = "ordinary",
): DungeonRewardEstimate {
  const quest = DUNGEON_FACTS.quests.find((entry) => entry.id === questId);
  if (level === 60)
    return {
      xp: 0,
      basis: "base-estimate",
      source: "At level 60 quests add no leveling XP; money conversion is separate.",
    };
  const questLevel = quest?.questLevel ?? fallback?.questLevel ?? null;
  if (
    !Number.isInteger(level) ||
    level < 1 ||
    level > 60 ||
    questLevel === null ||
    level > questLevel + 5
  )
    return {
      xp: null,
      basis: "unknown",
      source: "Hand-in level or overlevel reduction is unconfirmed.",
    };
  const actual = reported[questId];
  if (actual !== undefined)
    return {
      xp: actual,
      basis: "reported-forever",
      source: "Reported Forever reward; runtime context needs verification. Not multiplied again.",
    };
  const base =
    quest?.baseXp ??
    (reviewedBaseReferences.has(questId) ? quest?.referenceXp : null) ??
    fallback?.baseXp ??
    null;
  if (base === null)
    return { xp: null, basis: "unknown", source: "Reward basis is not established." };
  const dungeon =
    DUNGEON_FACTS.associations.some((entry) => entry.questId === questId) || fallback !== undefined;
  if (!dungeon)
    return {
      xp: base,
      basis: "base-estimate",
      source: "World prerequisite reference; no dungeon bonus.",
    };
  const multiplier =
    mode === "crest"
      ? 31 / 13
      : [96393, 96394, 96395, 98423].includes(questId)
        ? 2.2
        : ORDINARY_DUNGEON_XP_MULTIPLIER;
  return {
    xp:
      mode === "crest" ? Math.round(base * multiplier) : 50 * Math.round((base * multiplier) / 50),
    basis: "base-estimate",
    source: `${fallback?.source ?? "Journal base reference"} · ${multiplier.toFixed(3)}× planning estimate, not a verified server formula.`,
  };
}

export function reportedForeverReward(questId: number): number | null {
  return reported[questId] ?? null;
}
