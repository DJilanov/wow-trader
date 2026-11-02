import type { QuestLootDrop } from "./quest-loot.js";
import { classicLootSourceUrl } from "./loot-classic-source.js";

export interface LootProbabilityResolution {
  readonly probability: number | null;
  readonly source: string | null;
  readonly reason: string | null;
}

/** Aggregate corpse samples do not establish a quest-eligible player's drop probability. */
export function resolveLootProbability(drop: QuestLootDrop): LootProbabilityResolution {
  if (drop.probabilityBasis !== "sample-ratio")
    return { probability: drop.probability, source: null, reason: null };
  const reference = drop.probabilityReference;
  if (!reference)
    return {
      probability: null,
      source: null,
      reason:
        "The aggregate drop sample does not establish quest eligibility; a compatible quest-roll or non-quest reference is required.",
    };
  return {
    probability: reference.questOnly ? reference.probability : drop.probability,
    source: reference.questOnly
      ? `Historical Classic quest-roll probability ${reference.probability}; base rate multiplier 1, not a measured Forever rate: ${classicLootSourceUrl(reference)}`
      : `Historical Classic non-quest drop context for the captured sample ratio: ${classicLootSourceUrl(reference)}`,
    reason: null,
  };
}
