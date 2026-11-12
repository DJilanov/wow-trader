import { campaignSourceDungeonTags } from "./campaign-source-dungeons.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import {
  hasUnrestrictedQuestAccess,
  isUnrestrictedFundingQuest,
  questGroundPickups,
} from "./quest-catalog.js";
import { npcDeliveryRecipients, providedItemDeliveryRecipients } from "./quest-catalog-delivery.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { capturedQuestNpc } from "./campaign-source-endpoints.js";
import { capturedObjectDelivery } from "./campaign-object-deliveries.js";
import { isParentItemHandoff } from "./campaign-parent-item-handoff.js";
import { hasOnlyPrePickupReset } from "./campaign-source-reset.js";
import { guaranteedQuestPrerequisites } from "./quest-prerequisite-closure.js";
import {
  reviewedHandoffRequirements,
  reviewedHandoffInstruction,
} from "./campaign-reviewed-handoff.js";
import {
  capturedNpcPickupApproach,
  type CapturedNpcPickupApproach,
} from "./campaign-source-npc-approach.js";
import { getGuideStepView } from "./guide-archive.js";
import { isCapturedSourceNpcTimer } from "./campaign-source-npc-timers.js";
import { isUnselectedNpcQuestGuard } from "./campaign-source-npc-guards.js";
import {
  CAMPAIGN_QUEST_GUARDS,
  freshQuestGuardSatisfied,
  normalizeQuestPickupGuard,
} from "./campaign-native-guards.js";

export interface CampaignSourceDelivery {
  readonly quest: QuestCatalogEntry;
  readonly actions: readonly CampaignAction[];
  readonly approaches?: readonly CapturedNpcPickupApproach[];
  readonly requiresFreshStart?: true;
  readonly requiresFreshQuestIds?: readonly number[];
  /** A proved ordinary courier can be carried while the party completes another visit. */
  readonly canLeaveAfterPickup?: true;
  /** A scene can require an encounter without establishing creature deaths or kill XP. */
  readonly maximumEnemyLevel?: number;
}

const supportedTags = new Set([
  "text",
  "marker",
  ".accept",
  ".turnin",
  ".goto",
  ".waypoint",
  ".line",
  ".target",
  ".dungeon",
  ".group",
  ".solo",
  ".xp",
  ".maxlevel",
  "#label",
  "#requires",
  "#completewith",
  "#sticky",
  "#loop",
  "#optional",
  "#xprate",
]);

function isProvidedLetterDescription(
  itemName: string,
  description: string,
  giver: QuestCatalogEntry["starts"][number],
  recipient: QuestCatalogEntry["ends"][number],
): boolean {
  const normalize = (text: string): string =>
    text.normalize("NFKC").replaceAll("’", "'").trim().toLowerCase();
  const names = (name: string): readonly string[] => {
    const full = normalize(name),
      first = full.split(" ")[0]!;
    return first.length >= 4 ? [full, first] : [full];
  };
  const item = normalize(itemName),
    objective = normalize(description),
    senders = names(giver.name),
    addressees = names(recipient.name);
  // The item identifies the recipient, while the objective identifies its sender.
  if (addressees.some((name) => item === `letter to ${name}`))
    return senders.some((name) => objective === `${name}'s letter`);
  if (senders.some((name) => item === `${name}'s response` || item === `the ${name}'s response`))
    return senders.some((name) => objective === `${name}'s letter of response`);
  return false;
}

function corpseOwnerName(name: string): string | null {
  const owner = /^(.+?)(?:['’]s|['’]) corpse$/i.exec(name)?.[1];
  return owner && owner.length >= 4 ? owner : null;
}

function isHandoffReference(
  quest: QuestCatalogEntry,
  reference: CombatQuestReference | undefined,
  giver: QuestCatalogEntry["starts"][number],
  recipient: QuestCatalogEntry["ends"][number],
  parentItemHandoff: boolean,
  reviewedNarrative: boolean,
): boolean {
  if (
    !reference ||
    reference.questId !== quest.questId ||
    reference.creatureIds.length ||
    reference.itemCreatureIds.length ||
    reference.itemObjectives?.length ||
    reference.killQuotas?.length ||
    reference.killQuotaConflicts?.length ||
    reference.onlyCreatureObjectives ||
    reference.startItem
  )
    return false;
  // Wording is separate from availability; the full captured prerequisite check below remains required.
  const wording = {
    ...quest,
    unsupportedRequirements: quest.unsupportedRequirements.filter(
      (flag) => flag !== "unresolved-source-prerequisite",
    ),
  };
  if (
    reviewedNarrative ||
    npcDeliveryRecipients(wording, reference).some((npc) => npc.npcId === recipient.npcId) ||
    providedItemDeliveryRecipients(wording, reference).some((npc) => npc.npcId === recipient.npcId)
  )
    return true;
  const texts = reference.objectiveText.map((text) => text.trim()).filter(Boolean);
  if (texts.length !== 1 || /[\r\n]/.test(texts[0]!)) return false;
  const parcel = /^(?:Bring|Take|Deliver) (.+?) to (.+?)[.!?]?$/i.exec(texts[0]!);
  const describedVisit =
    /^Check on the (?:old|elderly) (?:man|woman) in the (?:shack|house|hut) (?:near|in|outside) [^.!?]+[.!?]?$/i.test(
      texts[0]!,
    );
  let subject =
    /^(?:Find|Seek out|Speak (?:with|to)|Talk to|Return to|Report to|Travel to) (.+?)[.!?]?$/i.exec(
      texts[0]!,
    )?.[1] ??
    /^Travel (?:north|south|east|west|northeast|northwest|southeast|southwest) and check on (.+?)[.!?]?$/i.exec(
      texts[0]!,
    )?.[1];
  if (quest.providedItem) {
    if (
      parcel &&
      isProvidedLetterDescription(quest.providedItem.name, parcel[1]!, giver, recipient)
    )
      subject = parcel[2];
    else if (!parentItemHandoff) return false;
  }
  if (
    describedVisit &&
    !quest.providedItem &&
    quest.ends.length === 1 &&
    !/\b(kill|slay|fight|attack|damage|collect|gather|use|escort|protect|summon|bring|give|buy|purchase|open|click|interact|obtain|retrieve|destroy|activate|investigate|inspect|return|speak|talk|ask|report|need|must|then|before|after|while|and|or)\b/i.test(
      texts[0]!,
    )
  )
    return true;
  if (
    !subject ||
    /\b(kill|slay|fight|defeat|collect|gather|loot|acquire|buy|purchase|investigate|inspect|use|using|escort|protect|summon|obtain|retrieve|destroy|activate|bring|give|deliver|open|click|interact|where|which|must|need|then|before|after|while|and|or)\b/i.test(
      subject,
    )
  )
    return false;
  const name = recipient.name.toLowerCase();
  const title = /\bthe (.+)$/.exec(name)?.[0];
  const owner = corpseOwnerName(name);
  const first = name.split(" ")[0]!;
  const names = owner ? [name, owner] : first.length >= 4 ? [name, first] : [name];
  // The full source target remains mandatory when prose adds an article or uses a short name.
  return [subject, subject.replace(/^the /i, "")].some((description): boolean => {
    const normalized = description.toLowerCase();
    if (normalized === name) return true;
    if (normalized === name.split(" ")[0] && normalized.length >= 4) return true;
    if (title && normalized === title) return true;
    return names.some((candidate): boolean => {
      if (normalized === candidate) return true;
      const place = description.slice(candidate.length + 1);
      return (
        normalized.startsWith(candidate + " ") &&
        /^(?:in|at|near|overlooking) [^.!?]+$/i.test(place) &&
        !/\b(return|speak|talk|ask|report)\b/i.test(place)
      );
    });
  });
}

/** Qualify NPC/object handoffs and pickup-provided parcels from complete source programs. */
export function campaignSourceDeliveries(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
  selection: { readonly includeSelected?: boolean } = {},
): ReadonlyMap<number, CampaignSourceDelivery> {
  const result = new Map<number, CampaignSourceDelivery>();
  if (
    plan.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 ||
    !catalog.itemSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256
  )
    return result;
  const profile = campaignPlanSourceProfile(plan),
    options = campaignLibraryOptions(plan);
  const dungeons = campaignSourceDungeonTags();
  if (options) sources = sharedCampaignQuestSources(sources, plan.race, options.ordinaryQuestIds);
  const library = buildCampaignQuestLibrary(
    sources,
    profile,
    dungeons,
    new Set(),
    combat.quests,
    options,
  );
  const entries = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const selected = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  const steps = new Map(
    sources.flatMap(({ guide }) =>
      guide.targetBuild === plan.targetBuild
        ? guide.steps.map(
            (step) =>
              [
                `${guide.chapterId}:${guide.version}:${step.id}`,
                getGuideStepView(
                  {
                    ...step,
                    directives: step.directives.filter(
                      (row) => ![".group", ".solo"].includes(row.tag),
                    ),
                  },
                  profile,
                  { dungeons },
                ),
              ] as const,
          )
        : [],
    ),
  );
  for (const program of library) {
    const original = entries.get(program.questId);
    const reviewedRequirements = original
      ? reviewedHandoffRequirements(
          plan,
          combat.provider,
          program,
          original,
          references.get(original.questId),
        )
      : null;
    const reviewedPrerequisites =
      reviewedRequirements?.prerequisiteIds.flatMap((id) => entries.get(id) ?? []) ?? [];
    const reviewedNarrative =
      reviewedRequirements !== null &&
      reviewedPrerequisites.length === reviewedRequirements.prerequisiteIds.length;
    const freshReset =
      program.abandoned &&
      hasOnlyPrePickupReset(
        program.questId,
        program.actions,
        sources,
        profile,
        plan.targetBuild,
        options?.ordinaryQuestIds,
      );
    if (
      original &&
      (!selected.has(program.questId) || selection.includeSelected) &&
      catalog.objectSha256 &&
      catalog.objectSha256 === combat.provider.objectSha256
    ) {
      const objectDelivery = capturedObjectDelivery(
        program,
        original,
        references.get(original.questId),
        steps,
        {
          freshReset,
          reviewedNarrative,
          sourcePrerequisites: reviewedPrerequisites,
          catalog: entries,
        },
      );
      if (objectDelivery) {
        result.set(original.questId, selected.has(program.questId) && selection.includeSelected
          ? { ...objectDelivery, requiresFreshStart: true } : objectDelivery);
        continue;
      }
    }
    if (
      !original ||
      (selected.has(program.questId) && !selection.includeSelected) ||
      isUnrestrictedFundingQuest(original) ||
      original.category !== "delivery" ||
      questGroundPickups(original).length > 0 ||
      original.objectStarts?.length ||
      original.objectives.length ||
      original.unsupportedRequirements.some(
        (flag) =>
          !["unresolved-objective-text", "unresolved-source-prerequisite"].includes(flag) &&
          !(flag === "provided-item-interaction" && original.providedItem),
      ) ||
      !hasUnrestrictedQuestAccess({ ...original, unsupportedRequirements: [] }) ||
      program.objective !== "delivery" ||
      !program.complete ||
      program.held ||
      (program.abandoned && !freshReset) ||
      program.actions.length !== 2
    )
      continue;
    const pickup = program.actions.find((action) => action.questChanges[0]?.state === "accepted");
    const reward = program.actions.find((action) => action.questChanges[0]?.state === "rewarded");
    if (
      !pickup ||
      !reward ||
      [pickup, reward].some(
        (action) =>
          !action.source ||
          action.kind !== "quests" ||
          action.raidOnly ||
          action.dungeonFinishOnly ||
          action.questChanges.length !== 1 ||
          action.questChanges[0]!.questId !== original.questId,
      )
    )
      continue;
    const lookup = (action: CampaignAction): ReturnType<typeof getGuideStepView> | undefined => {
      const source = action.source!;
      return steps.get(`${source.chapterId}:${source.version}:${source.stepId}`);
    };
    const from = lookup(pickup),
      to = lookup(reward);
    if (
      !from ||
      !to ||
      from.condition !== "match" ||
      to.condition !== "match" ||
      from.conditionalDirectives.length ||
      to.conditionalDirectives.length
    )
      continue;
    const pickupSource = pickup.source!;
    const guide = sources.find(
      ({ guide }) =>
        guide.targetBuild === plan.targetBuild &&
        guide.chapterId === pickupSource.chapterId &&
        guide.version === pickupSource.version,
    )?.guide;
    const pickupIndex = guide?.steps.findIndex((step) => step.id === pickupSource.stepId) ?? -1;
    const previousStep = pickupIndex > 0 ? guide!.steps[pickupIndex - 1] : undefined;
    const previousView = previousStep
      ? steps.get(`${pickupSource.chapterId}:${pickupSource.version}:${previousStep.id}`)
      : undefined;
    const approach = capturedNpcPickupApproach(pickup, from, previousView, original, entries);
    const giver = capturedQuestNpc(
        approach ? { ...pickup, positions: approach.positions } : pickup,
        from.directives,
        original.starts,
      ),
      recipient = capturedQuestNpc(reward, to.directives, original.ends);
    const parentItemHandoff =
      giver !== null && isParentItemHandoff(original, giver.npcId, entries, references);
    if (
      !giver ||
      !recipient ||
      !isHandoffReference(
        original,
        references.get(original.questId),
        giver,
        recipient,
        parentItemHandoff,
        reviewedNarrative,
      )
    )
      continue;
    const pickupAt = from.directives.findIndex(
      (row) => row.tag === ".accept" && row.questId === original.questId,
    );
    const returnAt = to.directives.findIndex(
      (row) => row.tag === ".turnin" && row.questId === original.questId,
    );
    if (pickupAt < 0 || returnAt < 0) continue;
    const sourceParents = new Set(
      (pickup.requiredQuestIds ?? []).filter((id) => !original.prerequisites.anyOf.includes(id)),
    );
    const witnessedParents = new Set<number>();
    let invalidParent = false;
    for (const row of from.directives.slice(0, pickupAt)) {
      if (row.tag !== ".turnin" || row.questId === null || row.questId === original.questId)
        continue;
      const requiredByGuard = from.directives.some(
        (check) =>
          [".isQuestComplete", ".isQuestTurnedIn"].includes(check.tag) &&
          check.arguments.trim() === String(row.questId),
      );
      if (
        !original.unsupportedRequirements.includes("unresolved-source-prerequisite") &&
        !sourceParents.has(row.questId) &&
        !requiredByGuard
      )
        continue;
      const parent = entries.get(row.questId);
      if (
        !parent ||
        !parent.ends.some((npc) => npc.npcId === giver.npcId && npc.friendlyToAlliance)
      ) {
        invalidParent = true;
        break;
      }
      sourceParents.add(row.questId);
      witnessedParents.add(row.questId);
    }
    for (const row of from.directives) {
      if (row.tag !== ".isQuestTurnedIn" || !/^\d+$/.test(row.arguments.trim())) continue;
      if (plan.sharedQuestsOnly && isUnselectedNpcQuestGuard(pickup, row, from.directives, entries))
        continue;
      const id = Number(row.arguments);
      if (id === original.questId || !entries.has(id)) continue;
      sourceParents.add(id);
      witnessedParents.add(id);
    }
    if (
      invalidParent ||
      (original.unsupportedRequirements.includes("unresolved-source-prerequisite") &&
        !witnessedParents.size)
    )
      continue;
    const parents = guaranteedQuestPrerequisites(original, entries, sourceParents);
    if (!parents) continue;
    if (
      [
        { action: pickup, view: from },
        { action: reward, view: to },
      ].some(({ action, view }) =>
        view.directives.some((row) =>
          CAMPAIGN_QUEST_GUARDS.has(row.tag)
            ? !(plan.sharedQuestsOnly && isUnselectedNpcQuestGuard(
                action, row, view.directives, entries,
              )) && !freshQuestGuardSatisfied(
                normalizeQuestPickupGuard(
                  row,
                  { ...action, requiredQuestIds: [...parents] },
                  view.directives,
                ),
                original.questId,
                action.questChanges[0]!.state,
                parents,
              )
            : !supportedTags.has(row.tag) &&
              !isCapturedSourceNpcTimer(action, row, view.directives, entries) &&
              !(row.tag === "#season" && row.arguments.trim() === "0" && !row.condition.trim()),
        ),
      )
    )
      continue;
    const quest: QuestCatalogEntry = {
      ...original,
      starts: [giver],
      ends: [recipient],
      unsupportedRequirements: [],
      prerequisites: {
        ...original.prerequisites,
        allOf: [...new Set([...original.prerequisites.allOf, ...sourceParents])],
      },
    };
    if (!isUnrestrictedFundingQuest(quest)) continue;
    result.set(quest.questId, {
      quest,
      canLeaveAfterPickup: true,
      ...(reviewedRequirements?.freshQuestIds.length
        ? { requiresFreshQuestIds: reviewedRequirements.freshQuestIds }
        : {}),
      ...(freshReset || (selected.has(program.questId) && selection.includeSelected)
        ? { requiresFreshStart: true } : {}),
      ...(approach ? { approaches: [approach] } : {}),
      actions: [
        {
          ...pickup,
          libraryQuestId: quest.questId,
          instructions: pickup.instructions.map((instruction) =>
            reviewedHandoffInstruction(pickup, instruction),
          ),
          requiredQuestIds: [...sourceParents],
          ...(parentItemHandoff
            ? {
                instructions: [
                  ...pickup.instructions,
                  `Each player receives ${original.providedItem!.name} when accepting this quest. Keep it for the hand-in.`,
                ],
              }
            : {}),
        },
        {
          ...reward,
          libraryQuestId: quest.questId,
          instructions: corpseOwnerName(recipient.name)
            ? [
                ...reward.instructions.filter(
                  (instruction) => instruction !== `Talk to ${recipient.name}`,
                ),
                `Inspect ${recipient.name} to turn in ${original.title}.`,
              ]
            : reward.instructions.map((instruction) => reviewedHandoffInstruction(reward, instruction)),
        },
      ],
    });
  }
  return result;
}

export function sourceDeliveryFundingCatalog(
  catalog: QuestCatalog,
  deliveries: ReadonlyMap<number, CampaignSourceDelivery>,
): QuestCatalog {
  return deliveries.size
    ? {
        ...catalog,
        quests: catalog.quests.map((quest) => deliveries.get(quest.questId)?.quest ?? quest),
      }
    : catalog;
}
