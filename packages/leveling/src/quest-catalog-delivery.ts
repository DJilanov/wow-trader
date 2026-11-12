import type { CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { campaignZoneId, campaignZoneInText } from "./campaign-geography.js";

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
      `^${prefix}${literal(recipient.name)}(?:(?:,)? (in|at|of|on the border of|on) ([^.!?]+))?[.!?]?$`,
      "i",
    ).exec(text);
    if (!match) return false;
    const place = match[2] ?? "";
    if (!isPlaceDescription(place, match[1]?.toLowerCase() === "on the border of")) return false;
    const zones = place.split(/\s+and\s+/i).flatMap((part) => campaignZoneInText(part) ?? []);
    return (
      !zones.length ||
      recipient.positions.some((point) => zones.includes(campaignZoneId(point.zone) ?? ""))
    );
  });
}

function isPlaceDescription(value: string, border = false): boolean {
  return (
    !/[,;:\r\n]|\b(kill|slay|collect|gather|use|using|loot|acquire|escort|protect|summon|find|obtain|retrieve|destroy|activate|return|speak|talk|ask|report|give|bring|deliver|take|need|must|where|which|open|click|interact|buy|purchase|fight|attack|defeat|inspect|investigate|then|before|after|while|or)\b/i.test(
      value,
    ) &&
    (border
      ? value.split(/\s+and\s+/i).length <= 2 &&
        value.split(/\s+and\s+/i).every((part) => part.trim().length > 0)
      : !/\band\b/i.test(value))
  );
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
  const itemName = quest.providedItem.name.replace(/^(?:a|an|the)\s+/i, "").trim();
  if (!itemName) return [];
  const item = `(?:(?:the|a|an) )?${literal(itemName)}`;
  const direct = namedRecipients(quest, text, `(?:Bring|Take|Deliver|Return|Give) ${item} to `);
  if (direct.length) return direct;
  // A giver's named plea and the objective's note refer to the same supplied letter.
  for (const giver of quest.starts) {
    if (!giver.friendlyToAlliance || !giver.positions.length) continue;
    const full = literal(giver.name);
    const possessive = /s$/i.test(giver.name) ? "['’](?:s)?" : "['’]s";
    if (!new RegExp(`^${full}${possessive} (?:Letter|Note|Plea|Response)$`, "i").test(itemName)) continue;
    const first = giver.name.trim().split(/\s+/)[0]!;
    const aliases = [giver.name];
    if (first.length >= 4 && quest.starts.filter((npc) =>
      npc.name.trim().split(/\s+/)[0]!.toLowerCase() === first.toLowerCase()).length === 1)
      aliases.push(first);
    for (const alias of aliases) {
      const owner = literal(alias), suffix = /s$/i.test(alias) ? "['’](?:s)?" : "['’]s";
      const recipients = namedRecipients(quest, text,
        `(?:Bring|Take|Deliver|Return|Give) ${owner}${suffix} (?:letter|note|letter of response) to `);
      if (recipients.length) return recipients;
    }
  }
  const reverse = quest.ends.filter(
    (recipient) =>
      recipient.friendlyToAlliance &&
      recipient.positions.length > 0 &&
      new RegExp(`^(?:Give|Bring) ${literal(recipient.name)} ${item}[.!?]?$`, "i").test(text),
  );
  if (reverse.length) return reverse;
  const returned = new RegExp(
    `^(Return to [^.!?]+)[.!?]\\s+Give (?:him|her|them) ${item}[.!?]?$`,
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
  if (text === null) return [];
  const direct = namedRecipients(
    quest,
    text,
    "(?:Speak (?:with|to)|Talk to|Return to|Report to|Travel to) ",
  );
  if (direct.length) return direct;
  const reported = namedRecipients(quest, text, "Report (?:your|the) [^.!?]+? to ").filter((recipient) => {
    const end = text.toLowerCase().lastIndexOf(` to ${recipient.name.toLowerCase()}`);
    return end > 0 && !/[,;:\r\n]|\b(and|or|open|click|interact|buy|purchase|must|need|fight|slay|kill|collect|gather|use)\b/i.test(
      text.slice("Report ".length, end),
    );
  });
  if (reported.length) return reported;
  const travel = /^(?:Go|Travel) to ([^.!?]+?)(?:,)? and speak (?:with|to) (.+?)[.!?]?$/i.exec(
    text,
  );
  if (travel && isPlaceDescription(travel[1]!)) {
    const recipients = namedRecipients(quest, travel[2]!, "");
    const zone = campaignZoneInText(travel[1]!);
    return zone === null
      ? recipients
      : recipients.filter((recipient) =>
          recipient.positions.some((point) => campaignZoneId(point.zone) === zone),
        );
  }
  return quest.starts.flatMap((giver) =>
    giver.friendlyToAlliance && giver.positions.length
      ? namedRecipients(quest, text, `${literal(giver.name)} wants you to speak (?:with|to) `)
      : [],
  );
}

/** A pickup-provided parcel is ready to return; a key, tool or missing objective is not. */
export function isProvidedItemDelivery(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
): boolean {
  return providedItemDeliveryRecipients(quest, reference).length > 0;
}
