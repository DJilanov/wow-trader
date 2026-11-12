import type { QuestLootDrop } from "./quest-loot.js";

export interface LootProbabilityResolution {
  readonly probability: number;
  readonly source: string | null;
}

/** Use the captured table percentage as a planning estimate; preserve its source and date. */
export function resolveLootProbability(drop: QuestLootDrop): LootProbabilityResolution {
  return {
    probability: drop.probability,
    source:
      drop.probabilityBasis === "sample-ratio"
        ? `Captured drop-table estimate ${drop.probability} from ${drop.capturedAt}: ${drop.sourceUrl}`
        : null,
  };
}
