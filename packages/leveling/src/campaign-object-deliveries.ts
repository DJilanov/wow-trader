import type { CampaignAction } from "./campaign.js";
import type { CampaignLibraryQuest } from "./campaign-library.js";
import type { CampaignSourceDelivery } from "./campaign-source-deliveries.js";
import type { CombatQuestReference } from "./combat-model.js";
import type { QuestCatalogEntry } from "./quest-catalog.js";
import { hasUnrestrictedQuestAccess, questGroundPickups } from "./quest-catalog.js";
import type { getGuideStepView } from "./guide-archive.js";
import { capturedQuestNpc, capturedQuestObject } from "./campaign-source-endpoints.js";
import { npcDeliveryRecipients, providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";
import { guaranteedQuestPrerequisites } from "./quest-prerequisite-closure.js";
import {
  CAMPAIGN_QUEST_GUARDS,
  freshQuestGuardSatisfied,
  normalizeQuestPickupGuard,
} from "./campaign-native-guards.js";

type SourceView = ReturnType<typeof getGuideStepView>;

const supportedTags = new Set([
  "text",
  "marker",
  ".accept",
  ".turnin",
  ".goto",
  ".waypoint",
  ".line",
  ".target",
  ".group",
  ".solo",
  ".xp",
  ".maxlevel",
  ".dungeon",
  "#label",
  "#requires",
  "#completewith",
  "#sticky",
  "#loop",
  "#optional",
  "#xprate",
]);

function isObjectVisitText(reference: CombatQuestReference, giverName?: string): boolean {
  const text = reference.objectiveText.map((row) => row.trim()).filter(Boolean);
  if (text.length !== 1) return false;
  const name = giverName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const objective = name ? text[0]!.replace(new RegExp(`^${name} wants you to `, "i"), "") : text[0]!;
  return (
    /^(?:Search|Continue searching|Look for|Find|Check|Inspect|Investigate|Explore|Scout) [^.!?]+[.!?]?$/i.test(objective) &&
    !/[,;:\r\n]|\b(kill|slay|fight|collect|gather|loot|bring|deliver|use|escort|protect|summon|obtain|retrieve|destroy|activate|open|click|then|before|after|while|and|or|must|need)\b/i.test(
      objective.replace(/\bcrates and barrels\b/i, "containers"),
    )
  );
}

function isProvidedReturnText(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference,
  recipient: QuestCatalogEntry["ends"][number],
): boolean {
  return providedItemDeliveryRecipients(quest, reference).some(
    (candidate) => candidate.npcId === recipient.npcId,
  );
}

/** Qualify complete object visits, conversation returns and supplied parcels without new counters. */
export function capturedObjectDelivery(
  program: CampaignLibraryQuest,
  original: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
  views: ReadonlyMap<string, SourceView>,
  options: {
    readonly freshReset?: boolean;
    readonly reviewedNarrative?: boolean;
    readonly sourcePrerequisites?: readonly QuestCatalogEntry[];
    readonly catalog: ReadonlyMap<number, QuestCatalogEntry>;
  },
): CampaignSourceDelivery | null {
  if (
    (!original.objectStarts?.length && !original.objectEnds?.length) ||
    program.questId !== original.questId ||
    !program.complete ||
    program.held ||
    (program.abandoned && !options.freshReset) ||
    program.objective !== "delivery" ||
    program.actions.length !== 2 ||
    original.category !== "delivery" ||
    original.objectives.length ||
    questGroundPickups(original).length ||
    original.unsupportedRequirements.some(
      (flag) =>
        flag !== "unresolved-objective-text" &&
        !(
          flag === "unresolved-source-prerequisite" &&
          options.reviewedNarrative &&
          options.sourcePrerequisites?.length
        ) &&
        !(flag === "provided-item-interaction" && original.providedItem),
    ) ||
    !hasUnrestrictedQuestAccess({ ...original, unsupportedRequirements: [] }) ||
    !reference ||
    reference.questId !== original.questId ||
    reference.creatureIds.length ||
    reference.itemCreatureIds.length ||
    reference.itemObjectives?.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    reference.startItem ||
    reference.onlyCreatureObjectives ||
    reference.onlyInteractionObjectives
  )
    return null;
  const [pickup, reward] = program.actions;
  if (
    !pickup ||
    !reward ||
    pickup.questChanges[0]?.state !== "accepted" ||
    reward.questChanges[0]?.state !== "rewarded"
  )
    return null;
  const lookup = (action: CampaignAction): SourceView | undefined =>
    action.source
      ? views.get(`${action.source.chapterId}:${action.source.version}:${action.source.stepId}`)
      : undefined;
  const from = lookup(pickup),
    to = lookup(reward);
  if (
    !from ||
    !to ||
    from.condition !== "match" ||
    to.condition !== "match" ||
    from.conditionalDirectives.length ||
    to.conditionalDirectives.length ||
    [pickup, reward].some(
      (action) =>
        !action.source ||
        action.kind !== "quests" ||
        action.leaderOnly ||
        action.raidOnly ||
        action.dungeonFinishOnly ||
        action.questChanges.length !== 1 ||
        action.questChanges[0]!.questId !== original.questId,
    )
  )
    return null;
  const giverObject = original.objectStarts?.length
    ? capturedQuestObject(pickup, from.directives, original.objectStarts)
    : null;
  const giverNpc = original.starts.length
    ? capturedQuestNpc(pickup, from.directives, original.starts)
    : null;
  const recipientObject = original.objectEnds?.length
    ? capturedQuestObject(reward, to.directives, original.objectEnds)
    : null;
  const recipientNpc = original.ends.length
    ? capturedQuestNpc(reward, to.directives, original.ends)
    : null;
  if (
    (giverObject === null) === (giverNpc === null) ||
    (recipientObject === null) === (recipientNpc === null) ||
    (original.providedItem
      ? !giverObject ||
        !recipientNpc ||
        (!options.reviewedNarrative && !isProvidedReturnText(original, reference, recipientNpc))
      : recipientObject
        ? !options.reviewedNarrative && !isObjectVisitText(reference, giverNpc?.name)
        : !giverObject || !recipientNpc || !npcDeliveryRecipients(original, reference).some(
            (candidate) => candidate.npcId === recipientNpc.npcId,
          ))
  )
    return null;
  const sourceParents = new Set(
    (pickup.requiredQuestIds ?? []).filter((id) => !original.prerequisites.anyOf.includes(id)),
  );
  const pickupAt = from.directives.findIndex(
    (row) => row.tag === ".accept" && row.questId === original.questId,
  );
  for (const parent of options.sourcePrerequisites ?? []) {
    if (
      !giverNpc ||
      !parent.ends.some((npc) => npc.friendlyToAlliance && npc.npcId === giverNpc.npcId) ||
      !from.directives
        .slice(0, pickupAt)
        .some((row) => row.tag === ".turnin" && row.questId === parent.questId)
    )
      return null;
    sourceParents.add(parent.questId);
  }
  const parents = guaranteedQuestPrerequisites(original, options.catalog, sourceParents);
  if (!parents) return null;
  if (
    [
      { action: pickup, view: from },
      { action: reward, view: to },
    ].some(
      ({ action, view }) =>
        !view.directives.some(
          (row) =>
            row.tag === (action === pickup ? ".accept" : ".turnin") &&
            row.questId === original.questId,
        ) ||
        view.directives.some((row) =>
          CAMPAIGN_QUEST_GUARDS.has(row.tag)
            ? !freshQuestGuardSatisfied(
                normalizeQuestPickupGuard(row, action, view.directives),
                original.questId,
                action.questChanges[0]!.state,
                parents,
              )
            : !supportedTags.has(row.tag),
        ),
    )
  )
    return null;
  const quest: QuestCatalogEntry = {
    ...original,
    starts: giverNpc ? [giverNpc] : [],
    ends: recipientNpc ? [recipientNpc] : [],
    ...(giverObject ? { objectStarts: [giverObject] } : {}),
    ...(recipientObject ? { objectEnds: [recipientObject] } : {}),
    unsupportedRequirements: [],
    prerequisites: {
      ...original.prerequisites,
      allOf: [...new Set([...original.prerequisites.allOf, ...sourceParents])],
    },
  };
  return {
    quest,
    requiresFreshStart: true,
    actions: [
      {
        ...pickup,
        libraryQuestId: quest.questId,
        ...(sourceParents.size ? { requiredQuestIds: [...sourceParents] } : {}),
        ...(quest.providedItem
          ? {
              instructions: [
                ...pickup.instructions,
                `Each player receives ${quest.providedItem.name} when accepting this quest. Keep it for the hand-in.`,
              ],
            }
          : {}),
      },
      { ...reward, libraryQuestId: quest.questId },
    ],
  };
}
