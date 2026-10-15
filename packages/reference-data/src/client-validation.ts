import { referenceQualityGaps, type ReferenceRecord } from "./contracts.js";

export interface ReferenceClientItem {
  readonly itemId: number;
  readonly name: string;
  readonly classId: number;
  readonly subclassId: number;
  readonly requiredLevel: number;
  readonly delayMs?: number;
  readonly stats?: readonly { readonly statType: number; readonly value: number }[];
  readonly damages?: readonly {
    readonly slot: number;
    readonly minimum: number;
    readonly maximum: number;
  }[];
}

const primaryStats: Readonly<Record<string, number>> = { agi: 3, str: 4, int: 5, spi: 6, sta: 7 };

export interface ReferenceValidation {
  readonly conflicts: readonly string[];
  readonly indexGaps: readonly string[];
}

function comparableFacts(item: ReferenceClientItem): Readonly<Record<string, number>> {
  const facts: Record<string, number> = {};
  if (item.stats) {
    for (const [key, type] of Object.entries(primaryStats))
      facts[key] = item.stats
        .filter((stat) => stat.statType === type)
        .reduce((sum, stat) => sum + stat.value, 0);
  }
  const damage = item.damages?.find((entry) => entry.slot === 0);
  if (damage) {
    facts.dmgmin1 = damage.minimum;
    facts.dmgmax1 = damage.maximum;
    if (item.delayMs) facts.speed = item.delayMs / 1000;
  }
  return facts;
}

export function referenceClientConflicts(
  record: ReferenceRecord,
  item: ReferenceClientItem,
): string[] {
  if (record.kind !== "item" || record.id !== item.itemId) return ["client_identity_conflict"];
  const conflicts: string[] = [];
  if (record.name !== item.name) conflicts.push("client_name_conflict");
  for (const [key, value] of Object.entries({ classId: item.classId, subclassId: item.subclassId }))
    if (record.numericFacts[key] !== undefined && record.numericFacts[key] !== value)
      conflicts.push(`client_${key}_conflict`);
  const level = record.numericFacts.reqlevel;
  if (level !== undefined && Math.max(1, level) !== Math.max(1, item.requiredLevel))
    conflicts.push("client_required_level_conflict");
  for (const [key, value] of Object.entries(comparableFacts(item))) {
    const source = record.numericFacts[key];
    if (source !== undefined && Math.abs(source - value) > 0.01)
      conflicts.push(`client_${key}_conflict`);
  }
  return conflicts;
}

export function referenceIndexGaps(record: ReferenceRecord, item?: ReferenceClientItem): string[] {
  const gaps = referenceQualityGaps(record);
  if (!item) return gaps;
  gaps.push(...referenceClientConflicts(record, item));
  for (const [key, value] of Object.entries(comparableFacts(item)))
    if (value > 0 && record.numericFacts[key] === undefined)
      gaps.push(`missing_client_detail_${key}`);
  return gaps;
}

export function referenceDisplayable(record: ReferenceRecord): boolean {
  const gaps = referenceQualityGaps(record);
  if (gaps.includes("placeholder_name") || gaps.includes("unresolved_item_details")) return false;
  return record.kind === "item"
    ? record.tooltipLines.length > 0 || record.relations.length > 0
    : record.objectives.length > 0 || record.rewards.length > 0 || record.relations.length > 0;
}
