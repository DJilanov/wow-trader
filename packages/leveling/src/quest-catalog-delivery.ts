import type { CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";

function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deliveryText(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
  allowedRequirements: readonly string[],
): string | null {
  if (
    quest.category !== "delivery" ||
    quest.objectives.length ||
    !reference ||
    reference.questId !== quest.questId ||
    reference.creatureIds.length ||
    reference.itemCreatureIds.length ||
    reference.itemObjectives?.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    reference.onlyCreatureObjectives ||
    quest.unsupportedRequirements.some((requirement) => !allowedRequirements.includes(requirement))
  )
    return null;
  const objectives = reference.objectiveText.map((text) => text.trim()).filter(Boolean);
  if (
    objectives.length !== 1 ||
    /\b(kill|slay|collect|gather|use|escort|protect|summon|find|obtain|retrieve|destroy|activate|then|before|after|while)\b/i.test(
      objectives[0]!,
    )
  )
    return null;
  return objectives[0]!;
}

function namedRecipients(
  quest: QuestCatalogEntry,
  text: string,
  prefix: string,
): readonly QuestCatalogEntry["ends"][number][] {
  return quest.ends.filter((recipient) => {
    if (!recipient.friendlyToAlliance || !recipient.positions.length) return false;
    const match = new RegExp(
      `^${prefix}${literal(recipient.name)}(?: (?:in|at) ([^.!?]+))?[.!?]?$`,
      "i",
    ).exec(text);
    return match !== null && !/\b(and|or|return|speak|talk|ask|report)\b/i.test(match[1] ?? "");
  });
}

/** Exact recipients supported by both the provided item and the complete objective text. */
export function providedItemDeliveryRecipients(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): readonly QuestCatalogEntry["ends"][number][] {
  if (!quest.providedItem) return [];
  const text = deliveryText(quest, reference, [
    "provided-item-interaction",
    "unresolved-objective-text",
    "non-outdoor-zone",
  ]);
  if (text === null) return [];
  const direct = namedRecipients(
    quest,
    text,
    `(?:Bring|Take|Deliver) (?:the )?${literal(quest.providedItem.name)} to `,
  );
  if (direct.length) return direct;
  const returned = new RegExp(
    `^(Return to [^.!?]+)[.!?]\\s+Give (?:him|her|them) (?:the )?${literal(quest.providedItem.name)}[.!?]?$`,
    "i",
  ).exec(text);
  return returned ? namedRecipients(quest, returned[1]!, "Return to ") : [];
}

/** A complete zero-item conversation objective, bound to its actual friendly recipient. */
export function npcDeliveryRecipients(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): readonly QuestCatalogEntry["ends"][number][] {
  if (quest.providedItem) return [];
  const text = deliveryText(quest, reference, ["unresolved-objective-text", "non-outdoor-zone"]);
  return text === null
    ? []
    : namedRecipients(quest, text, "(?:Speak (?:with|to)|Talk to|Return to|Report to) ");
}

/** A pickup-provided parcel is ready to return; a key, tool or missing objective is not. */
export function isProvidedItemDelivery(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): boolean {
  return providedItemDeliveryRecipients(quest, reference).length > 0;
}
