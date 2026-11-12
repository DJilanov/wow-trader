import type { CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";

/** Prove item continuity without changing an alternative prerequisite into a requirement. */
export function isParentItemHandoff(
  quest: QuestCatalogEntry,
  giverNpcId: number,
  catalog: ReadonlyMap<number, QuestCatalogEntry>,
  references: ReadonlyMap<number, CombatQuestReference>,
): boolean {
  const supplied = quest.providedItem;
  if (!supplied) return false;
  const normalize = (text: string): string =>
    text.normalize("NFKC").replaceAll("’", "'").trim().toLowerCase();
  const hasItem = (id: number): boolean => {
    const parent = catalog.get(id),
      reference = references.get(id);
    if (
      !parent ||
      parent.requiredClasses !== 0 ||
      parent.category !== "unsupported" ||
      parent.providedItem?.itemId === supplied.itemId ||
      !reference ||
      reference.questId !== id ||
      !parent.ends.some((npc) => npc.npcId === giverNpcId && npc.friendlyToAlliance) ||
      parent.ends.some((npc) => npc.friendlyToAlliance && npc.npcId !== giverNpcId)
    )
      return false;
    const items = reference.itemObjectives?.filter((item) => item.itemId === supplied.itemId) ?? [];
    const item = items[0];
    return (
      items.length === 1 &&
      item !== undefined &&
      item.quantity !== null &&
      !item.provided &&
      item.itemName !== undefined &&
      normalize(item.itemName) === normalize(supplied.name)
    );
  };
  return (
    quest.prerequisites.allOf.some(hasItem) ||
    (quest.prerequisites.anyOf.length > 0 && quest.prerequisites.anyOf.every(hasItem))
  );
}
