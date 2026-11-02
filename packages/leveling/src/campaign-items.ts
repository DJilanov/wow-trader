import type { ImportedDirective } from "./guide-archive.js";

export interface CampaignItemTarget {
  readonly questId: number;
  readonly itemId: number;
  readonly quantity: number;
  readonly objectiveBitmask: number;
}

export interface CampaignItemCollection extends CampaignItemTarget {
  readonly confirmationKey: string;
}

export interface CampaignItemRequirement {
  readonly questId: number;
  readonly objectiveIndex: number;
  readonly itemId: number;
  readonly quantity: number | null;
  readonly sourceProvided?: true;
  readonly conflict?: true;
}

/** Bind saved holdings to the character's current reports; unrelated XP corrections do not alter bags. */
export function campaignItemStateSignature(
  questStates: Readonly<Record<string, string>>,
  confirmations: Readonly<Record<string, boolean>>,
): string {
  return JSON.stringify([
    Object.entries(questStates).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
    Object.entries(confirmations)
      .filter(([key]) => key.startsWith("campaign-objective-") || key.startsWith("campaign-item-"))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  ]);
}

/** Flag 1 only hides the checkbox; other flags can alter counts or completion semantics. */
export function parseCampaignItemTarget(directive: ImportedDirective): CampaignItemTarget | null {
  if (directive.tag !== ".collect") return null;
  const args = directive.arguments.split(",").map((value) => value.trim());
  if (args.length !== 4 && !(args.length === 5 && ["0", "1"].includes(args[4]!))) return null;
  if (args.slice(0, 4).some((value) => !/^\d+$/.test(value))) return null;
  const [itemId, quantity, questId, objectiveBitmask] = args.map(Number);
  if (
    ![itemId, quantity, questId, objectiveBitmask].every(Number.isSafeInteger) ||
    itemId! < 1 ||
    questId! < 1 ||
    quantity! < 1 ||
    quantity! > 10_000 ||
    objectiveBitmask! < 0 ||
    objectiveBitmask! > 255
  )
    return null;
  return {
    itemId: itemId!,
    quantity: quantity!,
    questId: questId!,
    objectiveBitmask: objectiveBitmask!,
  };
}

export function mergeCampaignItemRequirements(
  groups: readonly (readonly CampaignItemRequirement[] | undefined)[],
): readonly CampaignItemRequirement[] {
  const merged = new Map<string, CampaignItemRequirement>();
  for (const group of groups)
    for (const row of group ?? []) {
      const key = `${row.questId}:${row.objectiveIndex}:${row.itemId}`;
      const previous = merged.get(key);
      const conflict =
        row.conflict ||
        previous?.conflict ||
        (row.quantity !== null && previous?.quantity != null && row.quantity !== previous.quantity);
      merged.set(key, {
        ...row,
        quantity: conflict ? null : (row.quantity ?? previous?.quantity ?? null),
        ...(row.sourceProvided || previous?.sourceProvided ? { sourceProvided: true } : {}),
        ...(conflict ? { conflict: true } : {}),
      });
    }
  return [...merged.values()];
}
