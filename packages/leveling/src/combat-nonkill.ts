import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
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

/** A living capture counter and a matching item-use instruction do not establish a death. */
export function isLivingCaptureObjective(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly objectiveIndex: number;
  readonly quest: CombatQuestReference;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
}): boolean {
  const { directives, offset, objectiveIndex, quest, npcs } = input;
  const context = objectiveDirectiveContext(directives, offset);
  if (
    !context ||
    objectiveIndex !== 1 ||
    directives[offset]!.questId !== quest.questId ||
    quest.creatureIds.length !== 1 ||
    quest.itemCreatureIds.length ||
    quest.itemObjectives?.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length
  )
    return false;
  const npc = npcs.get(quest.creatureIds[0]!);
  if (!npc) return false;
  const name = normalized(npc.name);
  const uses = context.all.filter((entry) => entry.tag === ".use");
  const targets = context.all.filter((entry) => [".unitscan", ".target"].includes(entry.tag));
  if (
    normalized(directives[offset]!.text) !== `${name} captured (1)` ||
    uses.length !== 1 ||
    !/^[1-9]\d*$/.test(uses[0]!.arguments.trim()) ||
    targets.length !== 1 ||
    normalized(targets[0]!.arguments) !== name ||
    context.all.some((entry) => [".mob", ".cast", ".gossip", ".interact"].includes(entry.tag))
  )
    return false;
  const objective = normalized(quest.objectiveText.join(" "));
  if (!objective.startsWith(`capture a living ${name} and bring it back`)) return false;
  const hostile = /\b(?:kill|killed|slay|slain|destroy|defeat|attack|damage|harm)\b/;
  return (
    !hostile.test(objective) &&
    !context.all.some((entry) => hostile.test(normalized(entry.text))) &&
    context.before.some((entry) => {
      if (entry.tag !== "text") return false;
      const command = /^use \[[^\]]+\] on (?:a |an |the )?(.+?)(?:[.!]|$)/.exec(
        normalized(entry.text),
      );
      return command?.[1]?.trim() === name;
    })
  );
}

/** Item-start quests can credit a named speaker while directing the player to identify an item. */
export function isItemDialogueObjective(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly objectiveIndex: number;
  readonly quest: CombatQuestReference;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
}): boolean {
  const { directives, offset, objectiveIndex, quest, npcs } = input;
  const context = objectiveDirectiveContext(directives, offset);
  if (
    !context ||
    objectiveIndex !== 1 ||
    directives[offset]!.questId !== quest.questId ||
    !quest.startItem ||
    quest.creatureIds.length !== 1 ||
    quest.itemCreatureIds.length ||
    quest.itemObjectives?.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length
  )
    return false;
  const npc = npcs.get(quest.creatureIds[0]!);
  const objectives = quest.objectiveText.map(normalized).filter(Boolean);
  const route = /^travel to (.+?) to find someone that can tell you more about (?:the )?(.+)$/.exec(
    (objectives[0] ?? "").replace(/[.!]$/, ""),
  );
  if (
    !npc ||
    !route ||
    objectives.length !== 2 ||
    objectives[1] !== "then, deliver the shard as you are directed." ||
    route[2] !== normalized(quest.startItem.name)
  )
    return false;
  const targets = context.all.filter((entry) => entry.tag === ".target");
  const gossip = context.all.filter((entry) => entry.tag === ".skipgossip");
  const label = normalized(directives[offset]!.text).replace(/[.!]$/, "");
  const hostile =
    /\b(?:kill|killed|killing|slay|slain|destroy|defeat|attack|damage|harm|fight|fighting)\b/;
  return (
    targets.length === 1 &&
    normalized(targets[0]!.arguments) === normalized(npc.name) &&
    gossip.length === 1 &&
    /^(?:[1-9]\d{0,5})?$/.test(gossip[0]!.arguments.trim()) &&
    (label === "" || label === `speak with someone in ${route[1]} about the ${route[2]}`) &&
    !context.all.some((entry) =>
      [".mob", ".use", ".cast", ".gossip", ".interact"].includes(entry.tag),
    ) &&
    !objectives.some((line) => hostile.test(line)) &&
    !context.all.some((entry) => hostile.test(normalized(entry.text))) &&
    context.before.some(
      (entry) =>
        entry.tag === "text" &&
        namesTarget(normalized(entry.text), "talk to ", normalized(npc.name)),
    )
  );
}

/** Some NPC credit records a gossip-driven view rather than a creature death. */
export function isViewingDialogueObjective(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly objectiveIndex: number;
  readonly quest: CombatQuestReference;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
}): boolean {
  const { directives, offset, objectiveIndex, quest, npcs } = input;
  const context = objectiveDirectiveContext(directives, offset);
  if (
    !context ||
    directives[offset]!.questId !== quest.questId ||
    objectiveIndex !== 1 ||
    quest.creatureIds.length !== 1 ||
    quest.itemCreatureIds.length ||
    quest.itemObjectives?.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length
  )
    return false;
  const npc = npcs.get(quest.creatureIds[0]!);
  if (!npc) return false;
  const name = normalized(npc.name);
  const targets = context.all.filter((entry) => entry.tag === ".target");
  const label = normalized(directives[offset]!.text);
  if (
    targets.length !== 1 ||
    normalized(targets[0]!.arguments) !== name ||
    /[(),;:]|\band\b/.test(label) ||
    context.all.some((entry) => [".mob", ".use", ".cast", ".interact"].includes(entry.tag)) ||
    !context.before.some(
      (entry) => entry.tag === "text" && namesTarget(normalized(entry.text), "talk to ", name),
    )
  )
    return false;
  const hostile =
    /\b(?:kill|killed|killing|slay|slain|destroy|defeat|attack|damage|harm|fight|fighting)\b/;
  const objective = normalized(quest.objectiveText.join(" "));
  if (hostile.test(objective) || context.all.some((entry) => hostile.test(normalized(entry.text))))
    return false;
  if (label === `use ${name.split(" ").at(-1)!}'s farsight`) {
    const speaker = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      new RegExp(
        `^speak with ${speaker}(?:'s)? and ask (?:him|her|them) to lend you (?:his|her|their) farsight to observe\\b`,
      ).test(objective) &&
      context.all.some((entry) => entry.tag === ".skipgossip" && !entry.arguments.trim()) &&
      context.before.some(
        (entry) =>
          entry.tag === "text" &&
          /^you can cancel the farsight once the objective completes[.!]?$/.test(
            normalized(entry.text),
          ),
      )
    );
  }
  if (
    !/^view .{3,}$/.test(label) ||
    !context.all.some(
      (entry) =>
        entry.tag === ".skipgossipid" && /^[1-9]\d*\s*,\s*[1-9]\d*$/.test(entry.arguments.trim()),
    )
  )
    return false;
  const prefix = `speak with ${name}`;
  const viewOffset = objective.indexOf(label, prefix.length);
  return (
    objective.startsWith(prefix) &&
    /^(?:\s+(?:and|to)\b|[,;.!]|$)/.test(objective.slice(prefix.length)) &&
    viewOffset > prefix.length &&
    /\s/.test(objective[viewOffset - 1]!) &&
    /^(?:\s|[,.!;]|$)/.test(objective.slice(viewOffset + label.length))
  );
}

/** A quest-wide creature list does not make its separate exploration counter a kill. */
export function isExplorationObjective(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly objectiveIndex: number;
  readonly quest: CombatQuestReference;
}): boolean {
  const { directives, offset, objectiveIndex, quest } = input;
  const context = objectiveDirectiveContext(directives, offset);
  if (
    !context ||
    quest.killQuotaConflicts?.includes(objectiveIndex) ||
    quest.killQuotas?.some((quota) => quota.objectiveIndex === objectiveIndex) ||
    !quest.killQuotas?.some((quota) => quota.objectiveIndex !== objectiveIndex) ||
    quest.itemObjectives?.some((item) => item.objectiveIndex === objectiveIndex)
  )
    return false;
  const label = normalized(directives[offset]!.text);
  const place = /^(?:fully )?explore (.+?)[.!]?$/.exec(label)?.[1];
  if (!place || place.length < 3 || /[,;:]|\b(?:and|kill|slay|destroy|defeat|attack)\b/.test(place))
    return false;
  if (
    context.all.some((entry) =>
      [".mob", ".target", ".use", ".cast", ".gossip", ".interact"].includes(entry.tag),
    ) ||
    context.all.some(
      (entry) =>
        ["text", ".complete"].includes(entry.tag) &&
        /\b(?:kill|slay|destroy|defeat|attack|clear)\b/.test(normalized(entry.text)),
    )
  )
    return false;
  const expected = `explore ${place}`;
  return quest.objectiveText.some((text) => {
    const objective = normalized(text).replace(/^fully /, "");
    return (
      objective.startsWith(expected) &&
      /^(?:[,;.!]|$|\s+and\b)/.test(objective.slice(expected.length))
    );
  });
}

/** Creature credit can record a friendly healing exercise rather than a death. */
export function isFriendlyHealingObjective(input: {
  readonly directives: readonly ImportedDirective[];
  readonly offset: number;
  readonly quest: CombatQuestReference;
  readonly npcs: ReadonlyMap<number, CombatNpc>;
}): boolean {
  const { quest, npcs } = input;
  const context = objectiveDirectiveContext(input.directives, input.offset);
  if (
    !context ||
    quest.creatureIds.length !== 1 ||
    quest.itemObjectives?.length ||
    quest.killQuotas?.length ||
    quest.killQuotaConflicts?.length
  )
    return false;
  const npc = npcs.get(quest.creatureIds[0]!);
  if (!npc) return false;
  const source = context.all.map((entry) => normalized(entry.text)).join(" ");
  const objective = normalized(quest.objectiveText.join(" "));
  const target = new RegExp(`\\b${normalized(npc.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const hostile = /\b(?:kill|slay|destroy|defeat|attack|damage|harm)\b/;
  const negated = /\b(?:not|never|avoid)\s+(?:\w+\s+){0,2}heal/;
  return (
    target.test(source) &&
    target.test(objective) &&
    /\blesser heal\b/.test(source) &&
    /\blesser heal\b/.test(objective) &&
    /\bpower word:\s*fortitude\b/.test(source) &&
    /\bpower word:\s*fortitude\b/.test(objective) &&
    !hostile.test(source) &&
    !hostile.test(objective) &&
    !negated.test(source) &&
    !negated.test(objective)
  );
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
