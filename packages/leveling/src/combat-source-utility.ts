import type { CombatObjective, CombatQuestReference, CombatNpc } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";

export const SOURCE_BREATHING_ITEM_ID = 5996;

function isBreathingUse(directive: ImportedDirective): boolean {
  return directive.tag === ".use" && /^\d+$/.test(directive.arguments.trim()) &&
    Number(directive.arguments) === SOURCE_BREATHING_ITEM_ID;
}

/** A breathing aid does not replace a separately proved creature-death counter. */
export function isOptionalCombatUtilityUse(
  directive: ImportedDirective,
  quest: CombatQuestReference | undefined,
  objectiveIndex: number,
): boolean {
  if (
    !isBreathingUse(directive) ||
    quest?.onlyCreatureObjectives !== true || quest.onlyInteractionObjectives ||
    quest.itemCreatureIds.length || quest.itemObjectives?.length || quest.killQuotaConflicts?.length
  ) return false;
  const counters = quest.killQuotas?.filter((counter) => counter.objectiveIndex === objectiveIndex) ?? [];
  return counters.length === 1 && quest.creatureIds.includes(counters[0]!.npcId) && counters[0]!.kills > 0;
}

/** Retain the utility on its selected native counter after combat reconciliation. */
export function isCombatUtilityForObjective(directive: ImportedDirective, objective: CombatObjective): boolean {
  return isBreathingUse(directive) && objective.credit === "shared-kills" &&
    !objective.quotaConflict && objective.npcIds.length === 1 &&
    objective.requiredKills !== null && objective.requiredKills > 0;
}

/** A captured optional consumable is not a requirement for an independently described trophy kill. */
export function isOptionalTrophyUtilityUse(
  directive: ImportedDirective,
  directives: readonly ImportedDirective[],
  quest: CombatQuestReference | undefined,
  objectiveIndex: number | null,
  npcs: ReadonlyMap<number, CombatNpc>,
): boolean {
  const item = quest?.itemObjectives?.[0];
  if (directive.tag !== ".use" || directive.arguments.trim() !== "4852" || directive.condition.trim() ||
    !quest || quest.requiredClasses !== 0 || quest.onlyCreatureObjectives || quest.onlyInteractionObjectives ||
    quest.creatureIds.length || quest.killQuotas?.length || quest.killQuotaConflicts?.length || quest.startItem ||
    quest.itemObjectives?.length !== 1 || !item || item.quantity !== 1 || !item.itemName ||
    item.provided || item.groundPickup || item.npcIds.length !== 1 || item.objectiveIndex !== objectiveIndex ||
    item.itemId === 4852 || item.sharing !== "shared-roll" || quest.itemCreatureIds.length !== 1 ||
    quest.itemCreatureIds[0] !== item.npcIds[0]) return false;
  const npc = npcs.get(item.npcIds[0]!);
  if (!npc || ![0, 1].includes(npc.rank ?? -1) || npc.minimumLevel === null || npc.maximumLevel === null)
    return false;
  const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kill = new RegExp(`^Kill ${escaped(npc.name)}[.] Loot (?:him|her|it|them) for (?:the )?${escaped(item.itemName)}[.!]?$`, "i");
  return directives.some((row) => row.tag === ".mob" && !row.condition.trim() &&
      row.arguments.replace(/^\+/, "").trim() === npc.name) &&
    directives.some((row) => row.tag === ".complete" && row.questId === quest.questId &&
      row.arguments.trim() === `${quest.questId},${objectiveIndex}` && !row.condition.trim()) &&
    directives.some((row) => row.tag === "text" && !row.condition.trim() && kill.test(row.text.trim())) &&
    directives.some((row) => row.tag === "text" && !row.condition.trim() &&
      /^If you saved the \[Flash Bomb\] from the Badlands you can use it to \[Fear\] him[.] This fear DOES NOT break on damage making it very useful for bringing him below the 50% threshold while CCd$/.test(row.text.trim()));
}
