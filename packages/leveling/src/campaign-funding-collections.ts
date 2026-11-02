import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { isUnrestrictedFundingQuest } from "./quest-catalog.js";
import { buildCampaignQuestLibrary } from "./campaign-library.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { existingFundingPrerequisite } from "./campaign-funding-prerequisites.js";
import { partyQuestLootCost } from "./party-quest-cost.js";
import { getGuideStepView } from "./guide-archive.js";
import { campaignZoneId } from "./campaign-geography.js";
import { hasOnlyPostTurnInCleanup } from "./campaign-source-cleanup.js";
import {
  CAMPAIGN_QUEST_GUARDS,
  normalizeQuestPickupGuard,
  freshQuestGuardSatisfied,
} from "./campaign-native-guards.js";

export interface CampaignFundingCollection {
  readonly actions: readonly CampaignAction[];
  readonly objectiveIndex: number;
  readonly npcId: number;
  readonly maximumEnemyLevel: number;
  readonly expectedKills: number;
  readonly slowKills: number;
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
  ".dungeon",
]);

/** Reuse complete, bounded single-item source tasks without broadening the captured catalog. */
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
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const library = buildCampaignQuestLibrary(sources, profile, [], new Set(), combat.quests);
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
    return (
      quest.complete &&
      !quest.held &&
      (!quest.abandoned ||
        hasOnlyPostTurnInCleanup(
          quest.questId,
          quest.actions,
          sources,
          profile,
          plan.targetBuild,
        )) &&
      ["collection", "named-trophy"].includes(quest.objective) &&
      entry !== undefined &&
      isUnrestrictedFundingQuest(entry) &&
      entry.category === "unsupported" &&
      !entry.providedItem &&
      !entry.groundPickup &&
      entry.objectives.length === 0 &&
      reference?.itemObjectives?.length === 1 &&
      !reference.onlyCreatureObjectives &&
      !reference.onlyInteractionObjectives &&
      !reference.creatureIds.length &&
      !reference.killQuotas?.length &&
      !reference.killQuotaConflicts?.length &&
      !reference.itemObjectives[0]!.provided &&
      !reference.itemObjectives[0]!.groundPickup
    );
  });
  if (!candidates.length) return result;
  const sourceActions = candidates.flatMap((quest) => quest.actions);
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
    const entry = quests.get(quest.questId)!;
    const own = existingFundingPrerequisite(entry, quests, sourceActions);
    if (!own || own.length !== 3 || own.some((action) => action.questChanges.length !== 1))
      continue;
    if (
      own.some(
        (action) =>
          !action.positions.some(
            ({ position }) =>
              campaignZoneId(position.zone) !== null &&
              (position.space === "world" ||
                [position.x, position.y].every((value) => value >= 0 && value <= 100)),
          ),
      )
    )
      continue;
    const changes = own.map((action) => action.questChanges[0]!);
    if (
      changes[0]!.state !== "accepted" ||
      changes[1]!.state !== "objectives-complete" ||
      changes[2]!.state !== "rewarded" ||
      changes[1]!.objectiveIndex === null
    )
      continue;
    const prerequisites = new Set(own[0]!.requiredQuestIds ?? []);
    if (
      own.some((action) => {
        const source = action.source!;
        const view = steps.get(`${source.chapterId}:${source.version}:${source.stepId}`);
        return (
          !view ||
          view.condition !== "match" ||
          view.directives.some((directive) =>
            CAMPAIGN_QUEST_GUARDS.has(directive.tag)
              ? !freshQuestGuardSatisfied(
                  normalizeQuestPickupGuard(directive, action, view.directives),
                  quest.questId,
                  action.questChanges[0]!.state,
                  prerequisites,
                )
              : !supportedTags.has(directive.tag),
          )
        );
      })
    )
      continue;
    const objectives = reviewed
      .combat!.activities.flatMap((activity) => activity.objectives)
      .filter((objective) => objective.questId === quest.questId);
    if (objectives.length !== 1) continue;
    const objective = objectives[0]!;
    if (
      objective.credit !== "personal-loot" ||
      objective.objectiveIndex !== changes[1]!.objectiveIndex ||
      objective.npcIds.length !== 1 ||
      objective.loot?.quantity === null ||
      objective.loot === undefined
    )
      continue;
    const npc = npcs.get(objective.npcIds[0]!);
    if (!npc || ![0, 1].includes(npc.rank ?? -1) || npc.maximumLevel === null) continue;
    const drop = combat.lootDrops?.find(
      (entry) => entry.itemId === objective.loot!.itemId && entry.npcId === npc.id,
    );
    // Unstarted quest state proves a fresh quota only for a quest-only item
    // that another modeled quest could not already have put in the bag.
    if (
      drop?.probabilityReference?.questOnly !== true ||
      itemQuests.get(objective.loot.itemId)?.size !== 1
    )
      continue;
    const cost = partyQuestLootCost(quest.questId, reviewed, combat);
    if (!cost.eligible || cost.expectedKills === null || cost.slowKills === null) continue;
    result.set(quest.questId, {
      actions: own,
      objectiveIndex: objective.objectiveIndex,
      npcId: npc.id,
      maximumEnemyLevel: npc.maximumLevel,
      expectedKills: cost.expectedKills,
      slowKills: cost.slowKills,
    });
  }
  return result;
}
