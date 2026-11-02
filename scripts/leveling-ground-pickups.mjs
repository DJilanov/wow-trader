import {
  singleGroundPickupObjectName,
  groundPickupReferenceSchema,
} from "../packages/leveling/dist/index.js";
import { catalogEntityPositions } from "./leveling-quest-catalog.mjs";

const key = (text) => text.normalize("NFKC").trim().toLowerCase();
const sourceTags = new Set([
  "text",
  "marker",
  ".goto",
  ".waypoint",
  ".line",
  ".complete",
  ".link",
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

/** Derive reference records only; eligibility flags, rewards and original inputs stay intact. */
export function deriveGroundPickupReferences(catalog, combat, chapters, items, objects, areaMap) {
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  const proofs = new Map();
  const conflicts = new Set();
  for (const chapter of chapters) {
    for (const step of chapter.steps) {
      for (const directive of step.directives) {
        if (directive.tag !== ".complete" || directive.questId === null) continue;
        const quest = references.get(directive.questId);
        if (
          [step.condition, directive.condition].some(
            (condition) => condition.trim().toLowerCase() === "skip",
          )
        )
          continue;
        if (
          step.directives.some(
            (entry) =>
              !sourceTags.has(entry.tag) &&
              !(entry.tag === ".isOnQuest" && entry.arguments.trim() === String(directive.questId)),
          )
        )
          continue;
        const name = singleGroundPickupObjectName(
          quest,
          Number(directive.arguments.split(",")[1] ?? 1),
          step.directives,
        );
        if (!name) continue;
        const item = quest.itemObjectives[0];
        if (item.objectiveIndex !== 1) continue;
        const exportedItem = items.get(item.itemId);
        if (!exportedItem?.name || key(exportedItem.name) !== key(item.itemName)) continue;
        const targets = Object.values(exportedItem.data.objectDrops ?? {})
          .map((id) => objects.get(id))
          .filter((object) => object?.name && key(object.name) === key(name));
        if (targets.length !== 1) continue;
        const object = targets[0];
        const positions = catalogEntityPositions(object, areaMap);
        const sourceZones = new Set(step.directives.flatMap((entry) => entry.position?.zone ?? []));
        if (!positions.length || positions.some((position) => !sourceZones.has(position.zone)))
          continue;
        const proof = groundPickupReferenceSchema.parse({
          questId: quest.questId,
          itemId: item.itemId,
          objectiveIndex: item.objectiveIndex,
          objectId: object.id,
          objectName: object.name,
          positions,
          sourceArchiveSha256: catalog.sourceArchiveSha256,
          source: { chapterId: chapter.chapterId, version: chapter.version, stepId: step.id },
        });
        const previous = proofs.get(quest.questId);
        if (
          previous &&
          (previous.itemId !== proof.itemId ||
            previous.objectId !== proof.objectId ||
            JSON.stringify(previous.positions) !== JSON.stringify(proof.positions))
        )
          conflicts.add(quest.questId);
        else if (!previous) proofs.set(quest.questId, proof);
      }
    }
  }
  for (const id of conflicts) proofs.delete(id);
  const byId = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  for (const id of proofs.keys()) {
    const quest = byId.get(id);
    if (!quest || quest.category !== "unsupported" || quest.objectives.length || quest.providedItem)
      proofs.delete(id);
  }
  return { proofs, conflicts: [...conflicts].sort((a, b) => a - b) };
}
