import type { CombatNpc } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { QuestRewardItemEvidence } from "./quest-loot.js";
import { objectiveDirectiveContext } from "./combat-objective-context.js";

interface CollectionItem {
  readonly quantity: number | null;
  readonly npcIds: readonly number[];
  readonly rewardEvidence?: QuestRewardItemEvidence | undefined;
}

function normalized(value: string): string {
  return value.normalize("NFKC").replace(/^\+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function namesTarget(line: string, prefix: string, name: string): boolean {
  const expected = `${prefix}${name}`;
  if (!line.startsWith(expected)) return false;
  const rest = line.slice(expected.length).trim();
  return rest === "" || /^[.!](?:\s|$)/.test(rest);
}

export function nonKillCollectionMethod(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly questId: number;
  readonly item: CollectionItem;
  readonly sourceQuantity: number | null;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
}): "quest-reward" | "pickpocket" | null {
  const { directives, offset, questId, item, sourceQuantity, npcs } = input;
  const rewardQuests = item.rewardEvidence?.quests;
  const context = objectiveDirectiveContext(directives, offset);
  if (!context || item.quantity !== 1 || (sourceQuantity !== null && sourceQuantity !== 1))
    return null;
  if (context.all.some((entry) => [".use", ".cast"].includes(entry.tag))) return null;
  const text = context.all
    .filter((entry) => entry.tag === "text")
    .map((entry) => normalized(entry.text));
  if (text.some((line) => /^(?:kill|slay|destroy|defeat)\s/.test(line))) return null;
  if (
    rewardQuests &&
    !context.all.some((entry) => entry.tag === ".mob") &&
    context.before.some(
      (entry) =>
        entry.tag === ".turnin" &&
        entry.questId !== null &&
        entry.questId !== questId &&
        rewardQuests.some((quest) => quest.questId === entry.questId),
    )
  )
    return "quest-reward";

  if (text.some((line) => /\b(?:kill|slay|destroy|defeat)\b/.test(line))) return null;
  const targets = new Set(
    context.all
      .filter((entry) => [".mob", ".target"].includes(entry.tag))
      .map((entry) => normalized(entry.arguments)),
  );
  for (const id of item.npcIds) {
    const npc = npcs.get(id);
    if (!npc) continue;
    const name = normalized(npc.name);
    if (
      targets.has(name) &&
      text.some((line) => namesTarget(line, "cast [pick pocket] on ", name)) &&
      text.some((line) => namesTarget(line, "avoid fighting ", name))
    )
      return "pickpocket";
  }
  return null;
}
