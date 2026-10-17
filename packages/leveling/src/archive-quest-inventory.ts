import type { ChapterReference } from "./chapter-catalog.js";
import { gateQuestIds, type DungeonQuest } from "./dungeon-model.js";
import type { ImportedChapter, ImportedDirective } from "./guide-archive.js";
import type { Faction } from "./model.js";

export interface ArchiveQuestSource {
  readonly guide: ImportedChapter;
  readonly reference: ChapterReference;
}

export type ArchiveQuestOrigin =
  | {
      readonly kind: "guide";
      readonly chapterId: string;
      readonly family: ChapterReference["family"];
      readonly stepId: string;
      readonly sourceLine: number;
      readonly tag: string;
      readonly role: "action" | "condition" | "item-reference";
      readonly stepCondition: string;
      readonly condition: string;
    }
  | {
      readonly kind: "dungeon";
      readonly ownerQuestId: number;
      readonly role: "quest" | "prerequisite" | "association";
    };

export interface ArchiveQuestInventoryEntry {
  readonly id: number;
  readonly factions: readonly Faction[];
  readonly origins: readonly ArchiveQuestOrigin[];
}

const multipleQuestConditions = new Set([
  ".isOnQuest",
  ".isNotOnQuest",
  ".isQuestTurnedIn",
  ".isQuestAvailable",
]);
const singleQuestConditions = new Set([".isQuestComplete", ".isQuestNotComplete"]);

interface DirectiveQuestReference {
  readonly id: number;
  readonly role: "action" | "condition" | "item-reference";
}

function directiveQuestIds(directive: ImportedDirective): readonly DirectiveQuestReference[] {
  const arguments_ = directive.arguments.split(",").map((value) => value.trim());
  const questId = (value: string | undefined, signed = false): number => {
    const id = Number(value);
    if (
      !value ||
      !(signed ? /^-?[1-9]\d*$/ : /^[1-9]\d*$/).test(value) ||
      !Number.isSafeInteger(id)
    )
      throw new Error(`Invalid quest reference in ${directive.tag}`);
    return Math.abs(id);
  };
  let values: readonly string[];
  let role: DirectiveQuestReference["role"];
  if (multipleQuestConditions.has(directive.tag)) {
    values = arguments_.filter(
      (value) =>
        value !== "account" || ![".isQuestTurnedIn", ".isQuestAvailable"].includes(directive.tag),
    );
    role = "condition";
  } else if (singleQuestConditions.has(directive.tag)) {
    values = arguments_.slice(0, 1);
    role = "condition";
  } else if (directive.tag === ".addquestitem") {
    values = arguments_.slice(1, 2);
    role = "item-reference";
  } else if ([".daily", ".dailyturnin"].includes(directive.tag)) {
    values = arguments_;
    role = "action";
  } else if (directive.tag === ".turnin") {
    return [{ id: questId(arguments_[0], true), role: "action" }];
  } else if (directive.tag === ".accept" && (Number(arguments_[1]) & 2) === 2) {
    return [
      { id: questId(arguments_[0]), role: "action" },
      { id: questId(arguments_[2]), role: "condition" },
    ];
  } else {
    return directive.questId === null ? [] : [{ id: directive.questId, role: "action" }];
  }
  const ids = values.map((value): number => questId(value));
  if (!ids.length) throw new Error(`Missing quest reference in ${directive.tag}`);
  return [...new Set(ids)].map((id): DirectiveQuestReference => ({ id, role }));
}

export function buildArchiveQuestInventory(
  sources: readonly ArchiveQuestSource[],
  dungeonQuests: readonly DungeonQuest[],
  dungeonAssociations: readonly { readonly questId: number }[] = [],
): readonly ArchiveQuestInventoryEntry[] {
  const entries = new Map<number, { factions: Set<Faction>; origins: ArchiveQuestOrigin[] }>();
  const add = (id: number, factions: readonly Faction[], origin: ArchiveQuestOrigin): void => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid archive quest identity");
    const entry = entries.get(id) ?? { factions: new Set<Faction>(), origins: [] };
    for (const faction of factions) entry.factions.add(faction);
    entry.origins.push(origin);
    entries.set(id, entry);
  };
  const chapters = new Set<string>();
  for (const { guide, reference } of sources) {
    if (guide.chapterId !== reference.id || chapters.has(guide.chapterId))
      throw new Error("Mismatched or duplicate archive chapter identity");
    chapters.add(guide.chapterId);
    for (const step of guide.steps)
      for (const directive of step.directives) {
        for (const { id, role } of directiveQuestIds(directive))
          add(id, reference.factions, {
            kind: "guide",
            chapterId: guide.chapterId,
            family: reference.family,
            stepId: step.id,
            sourceLine: directive.sourceLine,
            tag: directive.tag,
            role,
            stepCondition: step.condition,
            condition: directive.condition,
          });
      }
  }
  for (const quest of dungeonQuests) {
    const factions: readonly Faction[] =
      quest.faction === "both" ? ["alliance", "horde"] : [quest.faction];
    add(quest.id, factions, { kind: "dungeon", ownerQuestId: quest.id, role: "quest" });
    for (const parent of new Set(gateQuestIds(quest.gate)))
      add(parent, factions, { kind: "dungeon", ownerQuestId: quest.id, role: "prerequisite" });
  }
  for (const association of dungeonAssociations)
    add(association.questId, [], {
      kind: "dungeon",
      ownerQuestId: association.questId,
      role: "association",
    });
  return [...entries]
    .sort(([left], [right]) => left - right)
    .map(([id, entry]): ArchiveQuestInventoryEntry => ({
      id,
      factions: [...entry.factions].sort(),
      origins: entry.origins,
    }));
}
