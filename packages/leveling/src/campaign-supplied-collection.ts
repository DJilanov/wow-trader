import type { CampaignAction } from "./campaign.js";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import type { GuideStepView } from "./guide-archive.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A quest-supplied tool can coexist with a separate, fully counted loot objective. */
export function isActiveSuppliedCollection(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): boolean {
  const supplied = quest.providedItem, item = reference?.itemObjectives?.[0];
  if (
    !supplied || !reference || reference.questId !== quest.questId || reference.startItem ||
    reference.itemObjectives?.length !== 1 || !item?.itemName || item.quantity === null ||
    item.itemId === supplied.itemId || item.provided || item.groundPickup ||
    reference.creatureIds.length || reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length || reference.onlyCreatureObjectives ||
    reference.onlyInteractionObjectives || quest.objectives.length ||
    quest.unsupportedRequirements.some((flag) => flag !== "provided-item-interaction")
  ) return false;
  const texts = reference.objectiveText.map((text) => text.trim()).filter(Boolean);
  return texts.length === 1 && !/[\r\n]/.test(texts[0]!) &&
    quest.ends.filter((recipient) => recipient.friendlyToAlliance && recipient.positions.length &&
      new RegExp(`^Bring ${item.quantity} [^.!?]+ and (?:the )?${literal(supplied.name)} to ${literal(recipient.name)}(?: (?:in|at) [^.!?]+)?[.!?]?$`, "i").test(texts[0]!),
    ).length === 1;
}

/** Preserve the actual use instruction; possession of a tool alone is not a complete method. */
export function hasCapturedSuppliedToolMethod(
  view: GuideStepView,
  quest: QuestCatalogEntry,
  reference: CombatQuestReference,
  npcs: ReadonlyMap<number, CombatNpc>,
): boolean {
  const supplied = quest.providedItem, item = reference.itemObjectives?.[0];
  if (!supplied || !item || view.condition !== "match" || view.conditionalDirectives.length)
    return false;
  const uses = view.directives.filter((row) => row.tag === ".use");
  if (uses.some((row) => row.arguments.trim() !== String(supplied.itemId) || row.condition.trim()))
    return false;
  const instruction = new RegExp(`^Use the \\[${literal(supplied.name)}\\](?: at| on| to) `, "i");
  if (!view.directives.some((row) => ["text", ".use"].includes(row.tag) && instruction.test(row.text)))
    return false;
  const targets = view.directives.filter((row) => row.tag === ".mob").map((row) => row.arguments.trim());
  return item.npcIds.length > 0 && item.npcIds.every((id) => {
    const npc = npcs.get(id);
    return npc !== undefined && targets.includes(npc.name);
  });
}

/** Distinguish a carried pickup item from the separate acquired-item objective. */
export function isPassiveSuppliedCollection(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): boolean {
  const supplied = quest.providedItem,
    item = reference?.itemObjectives?.[0];
  if (
    !supplied ||
    !reference ||
    reference.questId !== quest.questId ||
    reference.startItem ||
    reference.itemObjectives?.length !== 1 ||
    !item?.itemName ||
    item.quantity === null ||
    item.itemId === supplied.itemId ||
    item.provided ||
    item.groundPickup ||
    reference.creatureIds.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    reference.onlyCreatureObjectives ||
    reference.onlyInteractionObjectives
  )
    return false;
  const texts = reference.objectiveText.map((text) => text.trim()).filter(Boolean);
  if (texts.length !== 1 || /[\r\n]/.test(texts[0]!)) return false;
  return (
    quest.ends.filter((recipient) => {
      if (!recipient.friendlyToAlliance || !recipient.positions.length) return false;
      const match = new RegExp(
        `^(?:Find|Collect) (?:the )?${literal(item.itemName!)} and return to ${literal(recipient.name)}(?: (?:in|at) ([^.!?]+?))? with (?:the )?${literal(supplied.name)}[.!?]?$`,
        "i",
      ).exec(texts[0]!);
      return (
        match !== null &&
        !/\b(and|or|then|before|after|while|use|using|kill|slay|fight|defeat|collect|gather|obtain|retrieve|destroy|activate|escort|protect|summon|bring|give|deliver|speak|talk|ask|report|return|open|click|interact|where|which|must|need)\b/i.test(
          match[1] ?? "",
        )
      );
    }).length === 1
  );
}

/** Keep the supplied item passive and bind both NPC phases to actual source targets. */
export function suppliedCollectionSourceMatches(
  action: CampaignAction,
  view: GuideStepView,
  quest: QuestCatalogEntry,
): boolean {
  const supplied = quest.providedItem;
  if (
    !supplied ||
    view.conditionalDirectives.length ||
    view.directives.some((row) => row.tag === ".collect")
  )
    return false;
  const state = action.questChanges[0]?.state;
  if (state === "objectives-complete") return true;
  if (state !== "accepted" && state !== "rewarded") return false;
  const targets = new Set(
    view.directives
      .filter((row) => row.tag === ".target")
      .map((row) => row.arguments.trim().toLowerCase()),
  );
  if (targets.size !== 1) return false;
  return (
    (state === "accepted" ? quest.starts : quest.ends).filter(
      (npc) =>
        npc.friendlyToAlliance &&
        targets.has(npc.name.toLowerCase()) &&
        action.positions.some(
          ({ position }) =>
            Number.isFinite(position.x) &&
            Number.isFinite(position.y) &&
            npc.positions.some(
              (point) =>
                campaignZoneId(point.zone) !== null &&
                campaignZoneId(point.zone) === campaignZoneId(position.zone),
            ),
        ),
    ).length === 1
  );
}
