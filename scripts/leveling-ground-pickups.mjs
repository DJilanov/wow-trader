import {
  singleGroundPickupObjectName,
  isMultiItemGroundCollectionSource,
  isExplicitGroundPickup,
  groundPickupReferenceSchema,
  campaignZoneId,
} from "../packages/leveling/dist/index.js";
import { catalogEntityPositions } from "./leveling-quest-catalog.mjs";

const key = (text) => text.normalize("NFKC").trim().toLowerCase();
const label = (text) => key(text).replace(/['’]s\b/g, "");
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

function namesPickupItem(step, item) {
  return step.directives.some((entry) => {
    if (
      entry.tag !== "text" ||
      !/^(?:loot|open|click|pick up|collect|gather)\b|^on\b.+\bpress\b.+\bto loot\b/i.test(
        entry.text,
      )
    )
      return false;
    const match =
      /\b(?:loot|pick up|collect|gather|recover|retrieve) (?:the )?(.+?)(?: (?:from|on|off|inside|outside)\b.*|[.!])?$/i.exec(
        entry.text,
      );
    return match !== null && label(match[1]) === label(item.itemName);
  });
}

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
        const index = Number(directive.arguments.split(",")[1] ?? 1);
        const item = quest?.itemObjectives?.find((objective) => objective.objectiveIndex === index);
        if (
          !item ||
          item.provided ||
          item.npcIds.length ||
          item.vendorEvidence ||
          item.rewardEvidence
        )
          continue;
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
              !(entry.tag === "#loop" && item.quantity > 1) &&
              !(entry.tag === ".isOnQuest" && entry.arguments.trim() === String(directive.questId)),
          )
        )
          continue;
        const name = singleGroundPickupObjectName(
          quest,
          Number(directive.arguments.split(",")[1] ?? 1),
          step.directives,
        );
        if (name && !directive.text.trim() && step.condition.trim()) continue;
        const exportedItem = items.get(item.itemId);
        if (!item.itemName || !exportedItem?.name || key(exportedItem.name) !== key(item.itemName))
          continue;
        const namedPickup =
          item.quantity === 1 &&
          isExplicitGroundPickup(quest, index, step.directives) &&
          namesPickupItem(step, item) &&
          !step.directives.some(
            (entry) =>
              entry.tag === "text" &&
              /\b(?:kill|slay|defeat|fight|attack|buy|purchase|auction|cast|use|summon|escort|defend|protect|traps?)\b/i.test(
                entry.text,
              ),
          );
        const targets = [...new Set(Object.values(exportedItem.data.objectDrops ?? {}))]
          .map((id) => objects.get(id))
          .filter(
            (object) =>
              object?.name &&
              (!item.objectIds || item.objectIds.includes(object.id)) &&
              (name
                ? key(object.name) === key(name)
                : namedPickup ||
                  isMultiItemGroundCollectionSource({
                    quest,
                    objectiveIndex: item.objectiveIndex,
                    directives: step.directives,
                    objectName: object.name,
                  })),
          );
        const sourceZones = new Set(step.directives.flatMap((entry) => {
          const zone = entry.position ? campaignZoneId(entry.position.zone) : null;
          return zone ? [zone] : [];
        }));
        if (
          targets.length !== 1 &&
          !(
            item.quantity > 1 &&
            item.objectIds?.length &&
            targets.length > 1 &&
            targets.every(
              (object) =>
                item.objectIds.includes(object.id) && key(object.name) === key(targets[0].name),
            )
          )
        )
          continue;
        const candidates = targets
          .map((object) => ({ object, positions: catalogEntityPositions(object, areaMap) }))
          .filter(
            ({ positions }) =>
              positions.length && positions.every((position) => sourceZones.has(position.zone)),
          )
          .sort(
            (left, right) =>
              right.positions.length - left.positions.length || left.object.id - right.object.id,
          );
        const selected = candidates[0];
        if (!selected) continue;
        const { object, positions } = selected;
        const proof = groundPickupReferenceSchema.parse({
          questId: quest.questId,
          itemId: item.itemId,
          ...(item.quantity === 1 ? {} : { quantity: item.quantity }),
          objectiveIndex: item.objectiveIndex,
          objectId: object.id,
          objectName: object.name,
          positions,
          sourceArchiveSha256: catalog.sourceArchiveSha256,
          source: { chapterId: chapter.chapterId, version: chapter.version, stepId: step.id },
        });
        const objectiveKey = `${quest.questId}:${index}`;
        const previous = proofs.get(objectiveKey);
        if (
          previous &&
          ((previous.quantity ?? 1) !== (proof.quantity ?? 1) ||
            previous.itemId !== proof.itemId ||
            previous.objectId !== proof.objectId ||
            JSON.stringify(previous.positions) !== JSON.stringify(proof.positions))
        )
          conflicts.add(quest.questId);
        else if (!previous) proofs.set(objectiveKey, proof);
      }
    }
  }
  const single = new Map(),
    multiProofs = new Map();
  const byId = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  for (const [id, reference] of references) {
    const quest = byId.get(id),
      objectives = reference.itemObjectives;
    if (
      conflicts.has(id) ||
      !quest ||
      quest.category !== "unsupported" ||
      quest.objectives.length ||
      quest.providedItem ||
      !objectives?.length
    )
      continue;
    const entries = objectives.map((item) => proofs.get(`${id}:${item.objectiveIndex}`));
    if (
      entries.some((entry) => !entry) ||
      new Set(entries.map((entry) => entry.objectiveIndex)).size !== entries.length ||
      new Set(entries.map((entry) => entry.itemId)).size !== entries.length
    )
      continue;
    entries.sort((left, right) => left.objectiveIndex - right.objectiveIndex);
    if (entries.some((entry, index) => entry.objectiveIndex !== index + 1)) continue;
    if (entries.length === 1) single.set(id, entries[0]);
    else multiProofs.set(id, entries);
  }
  return { proofs: single, multiProofs, conflicts: [...conflicts].sort((a, b) => a - b) };
}
