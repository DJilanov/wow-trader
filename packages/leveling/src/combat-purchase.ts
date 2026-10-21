import type { CombatNpc } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { QuestVendorEvidence } from "./quest-loot.js";
import { objectiveDirectiveContext } from "./combat-objective-context.js";

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/^\+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A named purchase and its named vendor must agree; merchant availability alone is insufficient. */
export function isExplicitVendorPurchase(
  directives: readonly ImportedDirective[],
  offset: number,
  objectiveLabel: string | undefined,
  evidence: QuestVendorEvidence | undefined,
  npcs: ReadonlyMap<number, CombatNpc>,
): boolean {
  const segment = objectiveDirectiveContext(directives, offset);
  if (!evidence || !objectiveLabel || !segment) return false;
  const item = normalized(objectiveLabel).replace(/^(?:collect|obtain|buy|purchase)\s+/, "");
  const context = segment.all;
  const vendors = new Set(
    evidence.npcIds.flatMap((id) => {
      const npc = npcs.get(id);
      return npc ? [normalized(npc.name)] : [];
    }),
  );
  if (!context.some((entry) => entry.tag === ".target" && vendors.has(normalized(entry.arguments))))
    return false;
  return context.some((entry) => {
    if (
      entry.tag !== "text" ||
      /\b(?:or|if|unless|instead|not|no|never|none|except|excluding)\b|\bdon['’]t\b/i.test(
        entry.text,
      )
    )
      return false;
    // Match the leading product list, not bracketed vendor names later in the sentence.
    const purchase =
      /^\s*(?:buy|purchase)\s+(?:(?:a|an|some|the|\d+)\s+)?(\[[^\]]+\](?:\s*(?:,|and|&)\s*(?:(?:a|an|some|the|\d+)\s+)?\[[^\]]+\])*)/i.exec(
        entry.text,
      );
    return (
      purchase !== null &&
      [...purchase[1]!.matchAll(/\[([^\]]+)\]/g)].some((match) => normalized(match[1]!) === item)
    );
  });
}
