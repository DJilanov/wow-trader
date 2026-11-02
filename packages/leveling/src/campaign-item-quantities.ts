import type { CombatQuestReference } from "./combat-model.js";

interface ItemQuantity {
  readonly quantity: number | null;
  readonly conflict: boolean;
}

const normalize = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** A collection reminder can be partial; supplement quantities from the quest's objective prose. */
export function campaignItemObjectiveQuantity(
  quest: CombatQuestReference,
  itemName: string | undefined,
): ItemQuantity {
  if (!itemName?.trim()) return { quantity: null, conflict: false };
  const name = normalize(itemName);
  const forms = new Set([name, `${name}s`]);
  const of = name.indexOf(" of ");
  if (of > 0) forms.add(`${name.slice(0, of)}s${name.slice(of)}`);
  const aliases = [...forms]
    .sort((left, right) => right.length - left.length)
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const counts = new Set<number>();
  for (const line of quest.objectiveText) {
    const text = normalize(line);
    if (!/^(?:bring|collect|gather|deliver|return|catch)\b/.test(text)) continue;
    const numeric = new RegExp(
      `(?:^|[\\s,;(])(\\d+)\\s+(?:pieces?\\s+of\\s+)?(?:${aliases})(?=$|[\\s,;.!?)])`,
      "g",
    );
    for (const match of text.matchAll(numeric)) {
      const quantity = Number(match[1]);
      if (Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 10_000)
        counts.add(quantity);
    }
    const singular = new RegExp(
      `^(?:bring(?: back)?|deliver|return) an? ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} to [^.!?]+[.!?]?$`,
    );
    if (singular.test(text)) counts.add(1);
  }
  return {
    quantity: counts.size === 1 ? [...counts][0]! : null,
    conflict: counts.size > 1,
  };
}
