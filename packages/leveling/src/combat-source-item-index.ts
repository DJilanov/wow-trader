import type { CampaignAction, CampaignSource } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CombatNpc, CombatQuestReference } from "./combat-model.js";
import type { CharacterProfile } from "./profile.js";
import { getGuideStepView } from "./guide-archive.js";
import { indexCombatReferences, resolveCombatObjectives } from "./campaign-combat.js";

export interface CapturedMixedItemCounter {
  readonly questId: number;
  readonly itemId: number;
  readonly objectiveIndex: number;
  readonly source: NonNullable<CampaignAction["source"]>;
  readonly killCounters: readonly {
    readonly objectiveIndex: number;
    readonly npcId: number;
    readonly kills: number;
    readonly source: NonNullable<CampaignAction["source"]>;
  }[];
}

const supportedTags = new Set([
  "text",
  "marker",
  ".complete",
  ".goto",
  ".waypoint",
  ".line",
  ".mob",
  ".target",
  ".unitscan",
  "#sticky",
  "#label",
  "#requires",
  "#completewith",
  "#loop",
  "#xprate",
]);

const normalized = (text: string): string =>
  text.normalize("NFKC").replaceAll("’", "'").replace(/\s+/g, " ").trim().toLowerCase();
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bind one missing trophy counter only when a complete mixed method proves every other kill counter. */
export function capturedMixedItemCounter(
  quest: CombatQuestReference,
  program: CampaignLibraryQuest,
  sources: readonly CampaignSource[],
  npcs: ReadonlyMap<number, CombatNpc>,
  profile: CharacterProfile,
  targetBuild: number,
): CapturedMixedItemCounter | null {
  const item = quest.itemObjectives?.[0];
  if (
    program.questId !== quest.questId ||
    !program.complete ||
    program.held ||
    program.abandoned ||
    !["collection", "named-trophy"].includes(program.objective) ||
    quest.requiredClasses !== 0 ||
    !quest.creatureIds.length ||
    quest.onlyCreatureObjectives ||
    quest.killQuotaConflicts?.length ||
    quest.itemObjectives?.length !== 1 ||
    !item ||
    item.objectiveIndex !== null ||
    item.quantity !== 1 ||
    !item.itemName ||
    item.provided ||
    item.groundPickup ||
    item.objectIds?.length ||
    item.vendorEvidence ||
    item.rewardEvidence ||
    item.npcIds.length !== 1 ||
    quest.itemCreatureIds.length !== 1 ||
    item.npcIds[0] !== quest.itemCreatureIds[0] ||
    quest.creatureIds.includes(item.npcIds[0]!)
  )
    return null;
  const npc = npcs.get(item.npcIds[0]!);
  if (!npc) return null;
  const name = normalized(npc.name),
    itemName = normalized(item.itemName);
  const owner = [`${name}'s `, `${name}' `].find((prefix) => itemName.startsWith(prefix));
  const suffix = ` of ${name}`;
  const trophy = owner
    ? itemName.slice(owner.length)
    : itemName.endsWith(suffix) ? itemName.slice(0, -suffix.length) : null;
  if (!trophy) return null;
  if (!/^[a-z]+(?: [a-z]+)*$/.test(trophy)) return null;
  const providerInstruction = new RegExp(
    `^(?:kill|slay) ${escaped(name)} and take (?:his|her|its|their) ${escaped(trophy)}[.!]?$`,
  );
  const returnInstruction = new RegExp(
    `^(?:bring|take|deliver|return) (?:the )?${escaped(itemName)} to ([^.!?]+)[.!]?$`,
  );
  if (!quest.objectiveText.some((text): boolean => {
    const objective = normalized(text);
    if (providerInstruction.test(objective)) return true;
    const returned = returnInstruction.exec(objective);
    return returned !== null &&
      !/[,;:\r\n]|\b(and|or|then|before|after|while|kill|slay|fight|loot|collect|gather|use|escort|protect|summon|obtain|retrieve|destroy|activate|open|click|inspect|investigate|speak|talk|ask|report|give|deliver|take|return|find|buy|purchase|acquire|must|need)\b/i.test(returned[1]!);
  })) return null;
  const pickup = program.actions.filter((action) => action.questChanges[0]?.state === "accepted");
  const reward = program.actions.filter((action) => action.questChanges[0]?.state === "rewarded");
  const completions = program.actions.filter(
    (action) => action.questChanges[0]?.state === "objectives-complete",
  );
  const origin = pickup[0]?.source;
  if (
    pickup.length !== 1 ||
    reward.length !== 1 ||
    !origin ||
    completions.length !== quest.creatureIds.length + 1 ||
    program.actions.length !== completions.length + 2 ||
    program.actions.some(
      (action) =>
        action.kind !== "quests" ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.questId !== quest.questId ||
        !action.source ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.source.chapterId !== origin.chapterId ||
        action.source.version !== origin.version,
    ) ||
    program.actions.indexOf(pickup[0]!) >=
      Math.min(...completions.map((action) => program.actions.indexOf(action))) ||
    program.actions.indexOf(reward[0]!) <=
      Math.max(...completions.map((action) => program.actions.indexOf(action)))
  )
    return null;
  const references = indexCombatReferences({ npcs: [...npcs.values()], quests: [quest] });
  const kills: CapturedMixedItemCounter["killCounters"][number][] = [];
  const itemCounters: { objectiveIndex: number; source: NonNullable<CampaignAction["source"]> }[] =
    [];
  for (const action of completions) {
    const source = action.source!;
    const chapter = sources.find(
      ({ guide }) =>
        guide.targetBuild === targetBuild &&
        guide.chapterId === source.chapterId &&
        guide.version === source.version,
    )?.guide;
    const step = chapter?.steps.find((step) => step.id === source.stepId);
    if (!step) return null;
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter((row) => ![".group", ".solo"].includes(row.tag)),
      },
      profile,
      { dungeons: [] },
    );
    if (
      view.condition !== "match" ||
      view.conditionalDirectives.length ||
      view.directives.some((row) => !supportedTags.has(row.tag) &&
        !(row.tag === ".isOnQuest" && row.arguments.trim() === String(quest.questId)))
    )
      return null;
    const rows = resolveCombatObjectives(
      view.directives,
      references,
      `${source.chapterId}:${source.version}:${source.stepId}`,
    );
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      row.questId !== quest.questId ||
      row.objectiveIndex > completions.length ||
      row.objectiveIndex !== action.questChanges[0]!.objectiveIndex ||
      row.quotaConflict
    )
      return null;
    if (
      row.credit === "shared-kills" &&
      row.npcIds.length === 1 &&
      row.requiredKills !== null &&
      quest.creatureIds.includes(row.npcIds[0]!)
    ) {
      kills.push({
        objectiveIndex: row.objectiveIndex,
        npcId: row.npcIds[0]!,
        kills: row.requiredKills,
        source,
      });
      continue;
    }
    if (row.credit !== "unknown" && !(row.credit === "personal-loot" &&
      row.npcIds.length === 1 && row.npcIds[0] === npc.id &&
      (!row.loot || (row.loot.itemId === item.itemId && row.loot.quantity === item.quantity))))
      return null;
    const directive = view.directives.find((entry) => entry.tag === ".complete");
    if (
      !directive ||
      directive.arguments !== `${quest.questId},${row.objectiveIndex}` ||
      (directive.text.trim() &&
        !new RegExp(`^${escaped(itemName)}\\s*\\(x?1\\)$`).test(normalized(directive.text)))
    )
      return null;
    const targets = new Set(
      view.directives
        .filter((row) => [".target", ".mob", ".unitscan"].includes(row.tag))
        .map((row) => normalized(row.arguments)),
    );
    const lootInstruction = new RegExp(
      `^(?:kill|slay) ${escaped(name)}[.!] loot (?:him|her|it|them) for (?:his|her|its|their) ${escaped(trophy)}[.!]?$`,
    );
    if (
      targets.size !== 1 ||
      !targets.has(name) ||
      !view.directives.some(
        (row) => row.tag === "text" && lootInstruction.test(normalized(row.text)),
      )
    )
      return null;
    itemCounters.push({ objectiveIndex: row.objectiveIndex, source });
  }
  const itemCounter = itemCounters[0];
  if (
    itemCounters.length !== 1 ||
    !itemCounter ||
    kills.length !== quest.creatureIds.length ||
    new Set(kills.map((row) => row.npcId)).size !== quest.creatureIds.length ||
    new Set([...kills.map((row) => row.objectiveIndex), itemCounter.objectiveIndex]).size !==
      completions.length ||
    quest.killQuotas?.some(
      (quota) =>
        !kills.some(
          (row) =>
            row.objectiveIndex === quota.objectiveIndex &&
            row.npcId === quota.npcId &&
            row.kills === quota.kills,
        ),
    )
  )
    return null;
  return {
    questId: quest.questId,
    itemId: item.itemId,
    objectiveIndex: itemCounter.objectiveIndex,
    source: itemCounter.source,
    killCounters: kills,
  };
}
