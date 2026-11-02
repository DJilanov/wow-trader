import type { CombatQuestReference } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";

/** A sourced one-item world-object pickup, without a mob-drop or repeated-node quota. */
export function singleGroundPickupObjectName(
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
  directives: readonly ImportedDirective[],
): string | null {
  const item = quest?.itemObjectives?.[0];
  if (
    !quest ||
    quest.onlyCreatureObjectives ||
    quest.creatureIds.length ||
    quest.itemCreatureIds.length ||
    quest.itemObjectives?.length !== 1 ||
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
  if (!counter || normalize(counter[1]!) !== normalize(item.itemName)) return null;
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
