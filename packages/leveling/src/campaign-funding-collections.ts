import { isOptionalTrophyUtilityUse } from "./combat-source-utility.js";
import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { hasUnrestrictedQuestAccess, questGroundPickups } from "./quest-catalog.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { campaignCollectionPhaseSources } from "./campaign-collection-sources.js";
import { partyQuestLootCost, type PartyCollectionKillCost } from "./party-quest-cost.js";
import { getGuideStepView } from "./guide-archive.js";
import { isCapturedSourceNpcTimer } from "./campaign-source-npc-timers.js";
import { isUnselectedNpcQuestGuard } from "./campaign-source-npc-guards.js";
import { capturedFundingObjectiveLocations, type CampaignFundingLootTarget } from "./campaign-funding-approach.js";
import { campaignZoneId } from "./campaign-geography.js";
import { hasOnlyPostTurnInCleanup } from "./campaign-source-cleanup.js";
import { hasOnlyPrePickupReset } from "./campaign-source-reset.js";
import { guaranteedQuestPrerequisites } from "./quest-prerequisite-closure.js";
import { batchCampaignSourceObjectives } from "./campaign-source-objectives.js";
import {
  collectionSharedKills,
  type CampaignCollectionSharedKill,
} from "./campaign-collection-kills.js";
import {
  isPassiveSuppliedCollection,
  isActiveSuppliedCollection,
  hasCapturedSuppliedToolMethod,
  suppliedCollectionSourceMatches,
} from "./campaign-supplied-collection.js";
import {
  CAMPAIGN_QUEST_GUARDS,
  normalizeQuestPickupGuard,
  freshQuestGuardSatisfied,
} from "./campaign-native-guards.js";

export interface CampaignFundingCollection {
  readonly actions: readonly CampaignAction[];
  readonly objectiveIndex: number;
  readonly npcId: number;
  readonly lootObjectives?: readonly CampaignFundingLootTarget[];
  readonly maximumEnemyLevel: number;
  readonly expectedKills: number;
  readonly slowKills: number;
  readonly retainedByDropRate?: true;
  readonly budgetedKills?: PartyCollectionKillCost;
  readonly sharedKills?: readonly CampaignCollectionSharedKill[];
}

const supportedTags = new Set([
  "text",
  "marker",
  ".accept",
  ".complete",
  ".turnin",
  ".goto",
  ".waypoint",
  ".line",
  ".mob",
  ".target",
  ".unitscan",
  ".collect",
  ".link",
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
  "#era",
  "#era/som",
  "#season",
  "#softcore",
  "#softcoreserver",
  ".dungeon",
]);

/** Reuse complete source collections, retaining every item and shared kill counter. */
export function campaignFundingCollections(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): ReadonlyMap<number, CampaignFundingCollection> {
  const result = new Map<number, CampaignFundingCollection>();
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
  const profile = campaignPlanSourceProfile(plan);
  const libraryOptions = campaignLibraryOptions(plan);
  if (libraryOptions)
    sources = sharedCampaignQuestSources(sources, plan.race, libraryOptions.ordinaryQuestIds);
  const library = buildCampaignQuestLibrary(
    sources,
    profile,
    [],
    new Set(),
    combat.quests,
    libraryOptions,
  );
  const quests = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const references = new Map(combat.quests.map((quest) => [quest.questId, quest]));
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const itemQuests = new Map<number, Set<number>>();
  for (const quest of combat.quests)
    for (const item of quest.itemObjectives ?? []) {
      const ids = itemQuests.get(item.itemId) ?? new Set<number>();
      ids.add(quest.questId);
      itemQuests.set(item.itemId, ids);
    }
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
                      (directive) => ![".group", ".solo"].includes(directive.tag),
                    ),
                  },
                  profile,
                  { dungeons: [] },
                ),
              ] as const,
          )
        : [],
    ),
  );
  const candidates = library.filter((quest) => {
    const entry = quests.get(quest.questId);
    const reference = references.get(quest.questId);
    const suppliedItem = entry && (isPassiveSuppliedCollection(entry, reference) ||
      isActiveSuppliedCollection(entry, reference));
    const sharedKills = entry && reference ? collectionSharedKills(entry, reference) : null;
    return (
      quest.complete &&
      !quest.held &&
      (!quest.abandoned ||
        hasOnlyPrePickupReset(
          quest.questId,
          quest.actions,
          sources,
          profile,
          plan.targetBuild,
          libraryOptions?.ordinaryQuestIds,
        ) ||
        hasOnlyPostTurnInCleanup(
          quest.questId,
          quest.actions,
          sources,
          profile,
          plan.targetBuild,
          libraryOptions?.ordinaryQuestIds,
        )) &&
      ["collection", "named-trophy"].includes(quest.objective) &&
      entry !== undefined &&
      hasUnrestrictedQuestAccess(
        suppliedItem
          ? {
              ...entry,
              unsupportedRequirements: entry.unsupportedRequirements.filter(
                (flag) => flag !== "provided-item-interaction",
              ),
            }
          : entry,
      ) &&
      (!entry.starts.length || entry.starts.some((giver) => giver.friendlyToAlliance)) &&
      (!entry.ends.length || entry.ends.some((giver) => giver.friendlyToAlliance)) &&
      entry.category === "unsupported" &&
      (!entry.providedItem || suppliedItem) &&
      questGroundPickups(entry).length === 0 &&
      sharedKills !== null &&
      reference !== undefined &&
      (reference.itemObjectives?.length ?? 0) > 0 &&
      !reference.onlyCreatureObjectives &&
      !reference.onlyInteractionObjectives &&
      !reference.killQuotaConflicts?.length &&
      reference.itemObjectives!.every((item) => !item.provided && !item.groundPickup)
    );
  });
  if (!candidates.length) return result;
  const alternatives = campaignCollectionPhaseSources(
    sources,
    profile,
    plan.targetBuild,
    new Map(
      candidates
        .filter((quest) => !quests.get(quest.questId)!.objectives.length &&
          references.get(quest.questId)!.itemObjectives!.length === 1)
        .flatMap((quest) => {
          const completion = quest.actions.find(
            (action) => action.questChanges[0]?.state === "objectives-complete",
          );
          return completion ? [[quest.questId, completion] as const] : [];
        }),
    ),
    libraryOptions?.ordinaryQuestIds,
  );
  const pickups = campaignCollectionPhaseSources(
    sources,
    profile,
    plan.targetBuild,
    new Map(
      candidates
        .filter((quest) => !quests.get(quest.questId)!.objectives.length &&
          references.get(quest.questId)!.itemObjectives!.length === 1)
        .flatMap((quest) => {
          const pickup = quest.actions.find(
            (action) => action.questChanges[0]?.state === "accepted",
          );
          return pickup ? [[quest.questId, pickup] as const] : [];
        }),
    ),
    libraryOptions?.ordinaryQuestIds,
    "accepted",
  );
  const sourceActions = candidates.flatMap((quest) => [
    ...quest.actions,
    ...(alternatives.get(quest.questId) ?? []),
    ...(pickups.get(quest.questId) ?? []),
  ]);
  const actions = sourceActions.map((action) => ({ ...action, legId: "collection-review" }));
  const reviewed = attachCampaignCombat(
    {
      ...plan,
      actions,
      legs: [
        {
          id: "collection-review",
          title: "Collection reference review",
          kind: "preparation",
          from: 1,
          to: 60,
          stopId: null,
          actionIds: actions.map((action) => action.id),
          questIds: candidates.map((quest) => quest.questId),
          unresolvedQuestIds: [],
        },
      ],
    },
    sources,
    combat,
    plan.combat?.revision ?? "collection-review",
  );
  for (const quest of candidates) {
    const definition = quests.get(quest.questId)!;
    const reference = references.get(quest.questId)!;
    const activeTool = isActiveSuppliedCollection(definition, reference);
    const sharedKills = collectionSharedKills(definition, references.get(quest.questId)!)!;
    const itemCount = references.get(quest.questId)!.itemObjectives!.length;
    const expectedActions = 2 + itemCount + sharedKills.length;
    if (quest.actions.length !== expectedActions) continue;
    // Optional source branches can record completion before pickup. Only order
    // this bounded lifecycle; the source guards and phase bindings stay intact.
    const captured = (["accepted", "objectives-complete", "rewarded"] as const).flatMap((state) =>
      quest.actions.filter((action) => action.questChanges[0]?.state === state),
    );
    if (
      captured.length !== expectedActions ||
      ((sharedKills.length > 0 || itemCount > 1) &&
        captured.some((action, index) => action !== quest.actions[index])) ||
      captured.some(
        (action) =>
          action.questChanges.length !== 1 ||
          action.questChanges[0]!.questId !== quest.questId ||
          !action.source ||
          action.kind !== "quests" ||
          (sharedKills.length > 0 && action.leaderOnly) ||
          action.raidOnly ||
          action.dungeonFinishOnly,
      )
    )
      continue;
    const variants = sharedKills.length || itemCount > 1
      ? [captured]
      : [captured[1]!, ...(alternatives.get(quest.questId) ?? [])].flatMap((completion) =>
          [captured[0]!, ...(pickups.get(quest.questId) ?? [])].map((pickup) => [
            pickup, completion, captured[2]!,
          ]),
        );
    for (const own of variants) {
      const changes = own.map((action) => action.questChanges[0]!);
      if (
        changes[0]!.state !== "accepted" ||
        changes.at(-1)!.state !== "rewarded" ||
        changes
          .slice(1, -1)
          .some(
            (change) => change.state !== "objectives-complete" || change.objectiveIndex === null,
          ) ||
        new Set(changes.slice(1, -1).map((change) => change.objectiveIndex)).size !== own.length - 2
      )
        continue;
      const prerequisites = guaranteedQuestPrerequisites(
        definition,
        quests,
        own[0]!.requiredQuestIds ?? [],
      );
      if (!prerequisites) continue;
      if (
        own.some((action) => {
          const source = action.source!;
          const view = steps.get(`${source.chapterId}:${source.version}:${source.stepId}`);
          return (
            !view ||
            view.condition !== "match" ||
            ((sharedKills.length > 0 || itemCount > 1) && view.conditionalDirectives.length > 0) ||
            (definition.providedItem &&
              !suppliedCollectionSourceMatches(action, view, definition)) ||
            (activeTool && action.questChanges[0]!.state === "objectives-complete" &&
              !hasCapturedSuppliedToolMethod(view, definition, reference, npcs)) ||
            view.directives.some((directive) =>
              CAMPAIGN_QUEST_GUARDS.has(directive.tag)
                ? !(plan.sharedQuestsOnly && isUnselectedNpcQuestGuard(
                    action, directive, view.directives, quests,
                  )) && !freshQuestGuardSatisfied(
                    normalizeQuestPickupGuard(directive, action, view.directives),
                    quest.questId,
                    action.questChanges[0]!.state,
                    prerequisites,
                  )
                : !supportedTags.has(directive.tag) &&
                  !(activeTool && action.questChanges[0]!.state === "objectives-complete" &&
                    directive.tag === ".use" &&
                    directive.arguments.trim() === String(definition.providedItem!.itemId) &&
                    directive.condition.trim() === "") &&
                  !isCapturedSourceNpcTimer(action, directive, view.directives, quests) &&
                  !isOptionalTrophyUtilityUse(directive, view.directives, references.get(quest.questId),
                    action.questChanges[0]!.objectiveIndex, npcs),
            )
          );
        })
      )
        continue;
      const completionIds = new Set(own.slice(1, -1).map((action) => action.id));
      const activities = reviewed.combat!.activities.filter((activity) =>
        completionIds.has(activity.actionId),
      );
      const objectives = activities
        .flatMap((activity) => activity.objectives)
        .filter((objective) => objective.questId === quest.questId);
      if (objectives.length !== itemCount + sharedKills.length) continue;
      const loot = objectives.filter((objective) => objective.credit === "personal-loot");
      if (loot.length !== itemCount) continue;
      const objective = loot[0]!;
      if (
        loot.some((item) =>
          !changes.some((change) => change.state === "objectives-complete" &&
            change.objectiveIndex === item.objectiveIndex) ||
          item.npcIds.length !== 1 || item.loot?.quantity === null || item.loot === undefined,
        )
      )
        continue;
      const lootTargets = loot.map((item): CampaignFundingLootTarget => ({
        objectiveIndex: item.objectiveIndex, itemId: item.loot!.itemId, npcId: item.npcIds[0]!,
      }));
      if (own.some((action) => !action.positions.some(({ position }) =>
        campaignZoneId(position.zone) !== null && (position.space === "world" ||
          [position.x, position.y].every((value) => value >= 0 && value <= 100))) &&
        !capturedFundingObjectiveLocations(action, definition, combat, sharedKills, lootTargets)))
        continue;
      const kills = objectives.filter((row) => row.credit === "shared-kills");
      if (
        kills.length !== sharedKills.length ||
        sharedKills.some(
          (kill) =>
            !kills.some(
              (row) =>
                row.objectiveIndex === kill.objectiveIndex &&
                row.npcIds.length === 1 &&
                row.npcIds[0] === kill.npcId &&
                row.requiredKills === kill.kills &&
                !row.quotaConflict,
            ),
        )
      )
        continue;
      const enemies = [...loot.map((item) => item.npcIds[0]!), ...sharedKills.map((kill) => kill.npcId)].map((id) =>
        npcs.get(id),
      );
      if (
        enemies.some((npc) => !npc || ![0, 1].includes(npc.rank ?? -1) || npc.maximumLevel === null)
      )
        continue;
      const maximumEnemyLevel = Math.max(...enemies.map((npc) => npc!.maximumLevel!));
      const npc = npcs.get(objective.npcIds[0]!);
      if (!npc || ![0, 1].includes(npc.rank ?? -1) || npc.maximumLevel === null) continue;
      // Unstarted quest state proves a fresh quota only for a quest-only item
      // that another modeled quest could not already have put in the bag.
      if (
        loot.some((item) =>
          combat.lootDrops?.find((entry) => entry.itemId === item.loot!.itemId &&
            entry.npcId === item.npcIds[0])?.probabilityReference?.questOnly !== true ||
          itemQuests.get(item.loot!.itemId)?.size !== 1,
        )
      )
        continue;
      const variant: CampaignPlan = {
        ...reviewed,
        actions: own,
        combat: { ...reviewed.combat!, activities },
      };
      const cost = partyQuestLootCost(quest.questId, variant, combat);
      if (!cost.eligible || cost.expectedKills === null || cost.slowKills === null) continue;
      const previous = result.get(quest.questId);
      if (
        previous &&
        (previous.maximumEnemyLevel < maximumEnemyLevel ||
          (previous.maximumEnemyLevel === maximumEnemyLevel &&
            previous.expectedKills <= cost.expectedKills))
      )
        continue;
      result.set(quest.questId, {
        actions: definition.providedItem
          ? own.map((action, index) =>
              index === 0
                ? {
                    ...action,
                    instructions: [
                      ...action.instructions,
                      `Each player receives ${definition.providedItem!.name} when accepting this quest. Keep it for the hand-in.`,
                    ],
                  }
                : action,
            )
          : itemCount > 1
            ? batchCampaignSourceObjectives({
                ...reviewed,
                actions: own.map((action) => ({ ...action,
                  libraryQuestId: quest.questId,
                  libraryObjective: quest.objective,
                })),
              }, 0).actions
            : own,
        objectiveIndex: objective.objectiveIndex,
        npcId: npc.id,
        lootObjectives: lootTargets,
        maximumEnemyLevel,
        expectedKills: cost.expectedKills,
        slowKills: cost.slowKills,
        ...(cost.retainedByDropRate ? { retainedByDropRate: true as const } : {}),
        ...(cost.budgetedKills ? { budgetedKills: cost.budgetedKills } : {}),
        ...(sharedKills.length ? { sharedKills } : {}),
      });
    }
  }
  return result;
}
