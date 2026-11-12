import type { CombatDataset } from "./combat-model.js";

export interface CombatItemQuantityConflict {
  readonly questId: number;
  readonly itemId: number;
  readonly itemName: string;
  readonly quantity: number;
  readonly objectiveQuantities: readonly number[];
}

function normalized(text: string): string {
  return text.normalize("NFKC").replaceAll("’", "'").replace(/\s+/g, " ").trim();
}

/** Detect contradictions only; unmatched prose never establishes a replacement count. */
export function conflictingItemQuantities(
  text: readonly string[],
  itemName: string | undefined,
  quantity: number | null,
): readonly number[] {
  if (!itemName?.trim() || quantity === null) return [];
  const escaped = normalized(itemName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\b(?:obtain|collect|gather|bring|retrieve)\\s+(\\d+)\\s+${escaped}s?(?=$|[\\s,.!?:;])`,
    "gi",
  );
  const counts = new Set<number>();
  for (const line of text) {
    const objective = normalized(line);
    if (/\b(?:not|don't|avoid|between|at least|up to)\b/i.test(objective)) continue;
    for (const match of objective.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isSafeInteger(value) && value >= 1 && value <= 1000) counts.add(value);
    }
  }
  return [...counts].some((value) => value !== quantity) ? [...counts].sort((a, b) => a - b) : [];
}

/** Preserve conflicting evidence while excluding its unqualified quantity from forecasts. */
export function holdConflictingCombatItemQuantities(data: CombatDataset): {
  readonly data: CombatDataset;
  readonly conflicts: readonly CombatItemQuantityConflict[];
} {
  const conflicts: CombatItemQuantityConflict[] = [];
  const quests = data.quests.map((quest) => {
    let changed = false;
    const itemObjectives = quest.itemObjectives?.map((item) => {
      const quantities = conflictingItemQuantities(
        quest.objectiveText,
        item.itemName,
        item.quantity,
      );
      if (!quantities.length || item.quantity === null || !item.itemName) return item;
      changed = true;
      conflicts.push({
        questId: quest.questId,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        objectiveQuantities: quantities,
      });
      return { ...item, quantity: null };
    });
    return changed ? { ...quest, itemObjectives } : quest;
  });
  return {
    data: conflicts.length
      ? {
          ...data,
          quests,
          provider: {
            ...data.provider,
            limitations: [
              ...data.provider.limitations,
              "Item quantities contradicting explicit current objective text remain unknown; neither claim is promoted to observed server evidence.",
            ],
          },
        }
      : data,
    conflicts,
  };
}
