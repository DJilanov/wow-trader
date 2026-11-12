import type { CombatQuestReference } from "./combat-model.js";
import type { CampaignSource } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";
import { objectiveDirectiveContext } from "./combat-objective-context.js";
import { campaignItemObjectiveQuantity } from "./campaign-item-quantities.js";
import { SOURCE_BREATHING_ITEM_ID } from "./combat-source-utility.js";
import {
  MAXIMUM_GROUND_COLLECTION_QUANTITY,
  type GroundPickupReference,
} from "./quest-ground-pickup.js";

const collectionSourceTags = new Set([
  "text",
  "marker",
  ".goto",
  ".waypoint",
  ".line",
  ".complete",
  "#loop",
  "#label",
  "#requires",
  "#completewith",
  "#sticky",
  "#optional",
  "#hidewindow",
  "#xprate",
  "#season",
  "#softcore",
  "#hardcore",
  ".group",
  ".solo",
]);

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

// These source-guide helpers reveal existing pickups or extend breath; they do not create quest items.
const pickupUtilityItems = new Set([4491, SOURCE_BREATHING_ITEM_ID, 9978]);
const pickupInstruction =
  /^(?:loot|open|click|pick up|collect|gather)\b|^on\b.+\bpress\b.+\bto loot\b/;

/** Generated tasks need a positive object relation; only a single item may omit its count. */
export function isGeneratedGroundPickup(
  quest: CombatQuestReference,
  objectiveIndex: number,
  instructions: readonly string[],
): boolean {
  const item = quest.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex);
  if (
    !item?.itemName ||
    !item.objectIds?.length ||
    item.npcIds.length ||
    item.provided ||
    item.quantity === null ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.onlyCreatureObjectives ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length
  )
    return false;
  const lines = instructions.map(normalized);
  if (
    lines.some((line) =>
      /\b(?:kill|slay|defeat|attack|buy|purchase|auction|cast|use|summon)\b/.test(line),
    )
  )
    return false;
  const name = normalized(item.itemName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quantity = item.quantity === 1 ? "(?:1 |the )?" : `${item.quantity} `;
  const plural = item.quantity === 1 ? "" : "s?";
  const counter = new RegExp(
    `^(?:collect|loot|gather|pick up|recover|retrieve) ${quantity}${name}${plural}(?: (?:from|on|off) .+)?[.!]?$`,
  );
  return lines.some((line) => counter.test(line));
}

function itemLabel(value: string): string {
  return normalized(value).replace(/'s\b/g, "");
}

/** Preserve the captured inside-boat alternative when generated arrows point at the actual chest. */
export function groundPickupTravelHints(
  proof: GroundPickupReference,
  sources: readonly CampaignSource[],
  targetBuild: number,
): readonly string[] {
  const guide = sources.find(
    (source) =>
      source.guide.chapterId === proof.source.chapterId &&
      source.guide.version === proof.source.version &&
      source.guide.targetBuild === targetBuild,
  )?.guide;
  const step = guide?.steps.find((step) => step.id === proof.source.stepId);
  if (
    !step ||
    !step.directives.some(
      (row) =>
        row.tag === ".complete" &&
        row.questId === proof.questId &&
        Number(row.arguments.split(",")[1] ?? 1) === proof.objectiveIndex,
    )
  )
    return [];
  const text = step.directives
    .filter((row) => row.tag === "text" && !row.condition.trim())
    .map((row) => row.text);
  if (
    !text.some((line) => /breath meter/i.test(line)) ||
    !text.some((line) => /swim underwater into the bottom floor of the boat then loot/i.test(line))
  )
    return [];
  return [
    `Swim into the bottom floor of the boat to reach ${proof.objectName}. Watch your breath and surface as needed.`,
    "Regroup at the surface before continuing to the next wreck.",
  ];
}

function matchesItemLabel(value: string, name: string, quantity: number): boolean {
  const label = itemLabel(value),
    item = itemLabel(name);
  const of = item.indexOf(" of ");
  return (
    label === item ||
    (quantity > 1 &&
      (label === `${item}s` || (of > 0 && label === `${item.slice(0, of)}s${item.slice(of)}`)))
  );
}

/** Source pickup instructions bound to an item objective, including unlabeled archived counters. */
export function isExplicitGroundPickup(
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
  directives: readonly ImportedDirective[],
): boolean {
  const item = quest?.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex);
  const hasObjectReference = Boolean(item?.objectIds?.length);
  if (
    !quest ||
    !item?.itemName ||
    item.provided ||
    (item.npcIds.length > 0 && !hasObjectReference) ||
    item.quantity === null ||
    quest.killQuotaConflicts?.includes(objectiveIndex) ||
    quest.killQuotas?.some((quota) => quota.objectiveIndex === objectiveIndex)
  )
    return false;
  const offset = directives.findIndex(
    (entry) =>
      entry.tag === ".complete" &&
      entry.questId === quest.questId &&
      Number(entry.arguments.split(",")[1] ?? 1) === objectiveIndex,
  );
  const context = objectiveDirectiveContext(directives, offset);
  if (
    !context ||
    (!hasObjectReference &&
      !context.all.some((entry) => entry.tag === ".goto" && entry.position !== null)) ||
    context.all.some((entry) =>
      hasObjectReference && entry.tag === ".use"
        ? !pickupUtilityItems.has(Number(entry.arguments.trim()))
        : (hasObjectReference
            ? [".cast", ".gossip", ".collect"]
            : [".mob", ".unitscan", ".target", ".use", ".cast", ".gossip", ".interact", ".collect"]
          ).includes(entry.tag),
    )
  )
    return false;
  const label = directives[offset]!.text;
  const counter = /^(.*?)\s*\(x?(\d+)\)\s*$/i.exec(label);
  const slash = /^(.*?)\s+(\d+)\s*\/\s*(\d+)\s*$/.exec(label);
  const name = counter?.[1] ?? slash?.[1];
  const quantity = Number(counter?.[2] ?? slash?.[3]);
  const unlabeledProviderCounter = !label.trim() && hasObjectReference;
  if (
    !unlabeledProviderCounter &&
    (!name ||
      !matchesItemLabel(name.replace(/^collect\s+/i, ""), item.itemName, item.quantity) ||
      quantity !== item.quantity ||
      (slash && Number(slash[2]) > quantity))
  )
    return false;
  const explicitGround = context.all.some((entry) => {
    if (entry.tag !== "text") return false;
    const ground =
      /^(?:loot|pick up|collect|gather) (?:the )?(.+?) (?:on|off|from) (?:the )?ground[.!]?$/i.exec(
        normalized(entry.text),
      );
    return ground !== null && ground[1] === normalized(item.itemName!);
  });
  if (explicitGround) return true;
  const sameQuestCounters = directives.every(
    (entry) => entry.tag !== ".complete" || entry.questId === quest.questId,
  );
  const text = (sameQuestCounters ? directives : context.all)
    .filter((entry) => entry.tag === "text")
    .map((entry) => normalized(entry.text));
  const itemPickupInSharedStep = directives.some(
    (entry) =>
      entry.tag === "text" &&
      pickupInstruction.test(normalized(entry.text)) &&
      normalized(entry.text).includes(normalized(item.itemName!)) &&
      !/\b(?:kill|slay|defeat|attack|buy|purchase|auction)\b/.test(normalized(entry.text)),
  );
  return (
    hasObjectReference &&
    item.npcIds.length === 0 &&
    ((!sameQuestCounters && itemPickupInSharedStep) ||
      (text.some((line) => pickupInstruction.test(line)) &&
        !text.some((line) => /\b(?:kill|slay|defeat|attack|buy|purchase|auction)\b/.test(line))))
  );
}

/** The provider must independently bind the item to this named world object. */
export function isMultiItemGroundCollectionSource(input: {
  readonly quest: CombatQuestReference | undefined;
  readonly objectiveIndex: number;
  readonly directives: readonly ImportedDirective[];
  readonly objectName: string;
}): boolean {
  const { quest, objectiveIndex, directives, objectName } = input;
  const item = quest?.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex);
  if (
    !quest ||
    quest.onlyCreatureObjectives ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length ||
    (quest.itemObjectives &&
      quest.itemObjectives.length > 1 &&
      quest.itemObjectives.some((objective) => !objective.objectIds?.length)) ||
    !item?.itemName ||
    item.provided ||
    item.vendorEvidence ||
    item.rewardEvidence ||
    item.npcIds.length ||
    item.quantity === null ||
    item.quantity < 2 ||
    item.quantity > MAXIMUM_GROUND_COLLECTION_QUANTITY ||
    item.objectiveIndex !== objectiveIndex ||
    !directives.some((entry) => entry.tag === ".goto" && entry.position !== null) ||
    directives.some(
      (entry) =>
        !collectionSourceTags.has(entry.tag) &&
        !(entry.tag === ".isOnQuest" && entry.arguments.trim() === String(quest.questId)),
    )
  )
    return false;
  const counters = directives.filter((entry) => entry.tag === ".complete");
  if (
    counters.length !== 1 ||
    counters[0]!.questId !== quest.questId ||
    Number(counters[0]!.arguments.split(",")[1] ?? 1) !== objectiveIndex
  )
    return false;
  const counter = /^(.*?)\s*\(x?(\d+)\)\s*$/i.exec(counters[0]!.text);
  const prose = campaignItemObjectiveQuantity(quest, item.itemName);
  const unlabeled =
    !counters[0]!.text.trim() &&
    item.objectIds?.length &&
    prose.quantity === item.quantity &&
    !prose.conflict;
  if (
    prose.conflict ||
    (prose.quantity !== null && prose.quantity !== item.quantity) ||
    (!unlabeled &&
      (!counter ||
        !matchesItemLabel(counter[1]!.replace(/^collect\s+/i, ""), item.itemName, item.quantity) ||
        Number(counter[2]) !== item.quantity))
  )
    return false;
  const name = normalized(objectName);
  if (!name) return false;
  const objectPattern = new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?\\b`,
    "g",
  );
  const objective = normalized(quest.objectiveText.join(" "));
  const objectiveNamesObject = objectPattern.test(objective);
  objectPattern.lastIndex = 0;
  const text = directives
    .filter((entry) => entry.tag === "text")
    .map((entry) => normalized(entry.text));
  const itemPattern = new RegExp(
    `\\b${normalized(item.itemName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
  );
  if (
    !objectiveNamesObject &&
    !(
      (itemPattern.test(objective) || prose.quantity === item.quantity) &&
      text.some((line) => {
        objectPattern.lastIndex = 0;
        return objectPattern.test(line);
      })
    )
  )
    return false;
  objectPattern.lastIndex = 0;
  const loot = text.some((line) => {
    const opening = /^open (?:the )?(.+?)\.\s*(.+)$/.exec(line);
    objectPattern.lastIndex = 0;
    if (opening && !objectPattern.test(opening[1]!)) return false;
    const match = /^loot .+? for (?:the )?(.+?)[.!]?$/.exec(opening?.[2] ?? line);
    if (match !== null && matchesItemLabel(match[1]!, item.itemName!, item.quantity!)) return true;
    const ground = /^loot (?:the )?(.+?) on the ground[.!]?$/.exec(line);
    return (
      ground !== null &&
      matchesItemLabel(ground[1]!, name, item.quantity!) &&
      matchesItemLabel(name, item.itemName!, item.quantity!)
    );
  });
  const encounters = [
    objective,
    ...text.filter(
      (line) => !/^their spawn locations are scattered throughout the island[.!]?$/.test(line),
    ),
  ]
    .join(" ")
    .replace(objectPattern, "");
  return (
    loot &&
    !/\b(?:kill|slay|defeat|fight|attack|defend|protect|aggro|spawn|summon|traps?|escort|waves?)\b/.test(
      encounters,
    )
  );
}

export function isReferencedGroundCollection(
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
  directives: readonly ImportedDirective[],
  source: GroundPickupReference["source"],
): boolean {
  const item = quest?.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex),
    ground = item?.groundPickup;
  if (!quest || !item || !ground) return false;
  return (
    ground.questId === quest.questId &&
    ground.itemId === item.itemId &&
    ground.objectiveIndex === objectiveIndex &&
    ground.quantity === item.quantity &&
    ground.source.chapterId === source.chapterId &&
    ground.source.version === source.version &&
    ground.source.stepId === source.stepId &&
    isMultiItemGroundCollectionSource({
      quest,
      objectiveIndex,
      directives,
      objectName: ground.objectName,
    })
  );
}

/** A sourced one-item objective, without a mob-drop or repeated-node quota. */
export function singleGroundPickupObjectName(
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
  directives: readonly ImportedDirective[],
): string | null {
  const item = quest?.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex);
  if (
    !quest ||
    quest.onlyCreatureObjectives ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length ||
    (quest.itemObjectives &&
      quest.itemObjectives.length > 1 &&
      quest.itemObjectives.some((objective) => !objective.objectIds?.length)) ||
    !item?.itemName ||
    item.provided ||
    item.quantity !== 1 ||
    item.objectiveIndex !== objectiveIndex ||
    item.npcIds.length
  )
    return null;
  const completions = directives.filter((entry) => entry.tag === ".complete");
  if (
    completions.length !== 1 ||
    completions[0]!.questId !== quest.questId ||
    Number(completions[0]!.arguments.split(",")[1] ?? 1) !== objectiveIndex ||
    !directives.some((entry) => entry.tag === ".goto" && entry.position !== null) ||
    directives.some((entry) =>
      [
        ".collect",
        ".mob",
        ".unitscan",
        ".target",
        ".use",
        ".cast",
        ".gossip",
        ".interact",
      ].includes(entry.tag),
    )
  )
    return null;
  const normalize = (value: string): string => value.normalize("NFKC").trim().toLowerCase();
  const counter = /^(.*?)\s*\(1\)\s*$/.exec(completions[0]!.text);
  const unlabeledProviderCounter =
    !completions[0]!.text.trim() &&
    Boolean(item.objectIds?.length) &&
    directives.every((entry) => !entry.condition.trim());
  if (!unlabeledProviderCounter && (!counter || !matchesItemLabel(counter[1]!, item.itemName, 1)))
    return null;
  const text = directives
    .filter((entry) => entry.tag === "text")
    .map((entry) => entry.text)
    .join("\n");
  // This exact archive sentence describes alternate ground-object positions, not an encounter.
  const encounterText = text.replace(
    /^It has multiple spawn locations in the Lake[.!]?[ \t]*$/gim,
    "",
  );
  if (
    /\b(?:kill|slay|defeat|fight|attack|defend|protect|aggro|spawn|summon|trap|escort|waves?)\b/i.test(
      [encounterText, ...quest.objectiveText].join("\n"),
    )
  )
    return null;
  const opening = /^Open (?:the )?([^.\n]+)\.\s+Loot it for (?:the )?([^\n]+?)[.!]?$/im.exec(text);
  return opening !== null && normalize(opening[2]!) === normalize(item.itemName)
    ? opening[1]!.trim()
    : null;
}

export function isSingleGroundPickup(
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
  directives: readonly ImportedDirective[],
): boolean {
  return singleGroundPickupObjectName(quest, objectiveIndex, directives) !== null;
}
