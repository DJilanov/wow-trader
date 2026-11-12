import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { hasUnrestrictedQuestAccess } from "./quest-catalog.js";
import { buildCampaignQuestLibrary, campaignLibraryOptions } from "./campaign-library.js";
import { campaignPlanSourceProfile } from "./campaign-source-profile.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { getGuideStepView } from "./guide-archive.js";
import { capturedQuestNpc } from "./campaign-source-endpoints.js";
import {
  CAMPAIGN_QUEST_GUARDS,
  freshQuestGuardSatisfied,
  normalizeQuestPickupGuard,
} from "./campaign-native-guards.js";

const pickupTags = new Set([
  "text",
  "marker",
  ".accept",
  ".turnin",
  ".goto",
  ".target",
  ".xp",
  "#label",
  "#optional",
  "#xprate",
]);

/** Recover a missing prerequisite for already-qualified kill counters, without importing another route's combat method. */
export function campaignSourcePrerequisites(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): ReadonlyMap<number, readonly number[]> {
  const result = new Map<number, readonly number[]>();
  if (
    plan.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision ||
    catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256
  )
    return result;
  const profile = campaignPlanSourceProfile(plan),
    options = campaignLibraryOptions(plan);
  if (options) sources = sharedCampaignQuestSources(sources, plan.race, options.ordinaryQuestIds);
  const programs = buildCampaignQuestLibrary(
    sources,
    profile,
    [],
    new Set(),
    combat.quests,
    options,
  );
  const entries = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  for (const quest of catalog.quests) {
    if (
      quest.category !== "shared-kills" ||
      quest.unsupportedRequirements.length !== 1 ||
      quest.unsupportedRequirements[0] !== "unresolved-source-prerequisite" ||
      quest.prerequisites.allOf.length ||
      quest.prerequisites.anyOf.length ||
      !hasUnrestrictedQuestAccess({ ...quest, unsupportedRequirements: [] })
    )
      continue;
    const reference = combat.quests.find((entry) => entry.questId === quest.questId);
    if (
      !reference?.onlyCreatureObjectives ||
      reference.itemObjectives?.length ||
      reference.itemCreatureIds.length ||
      reference.killQuotaConflicts?.length ||
      !quest.objectives.length ||
      reference.killQuotas?.length !== quest.objectives.length ||
      quest.objectives.some(
        (objective) =>
          !reference.killQuotas?.some(
            (quota) =>
              quota.objectiveIndex === objective.index &&
              quota.npcId === objective.npcId &&
              quota.kills === objective.count,
          ),
      )
    )
      continue;
    const program = programs.find((entry) => entry.questId === quest.questId);
    const pickup = program?.actions.find((action) => action.questChanges[0]?.state === "accepted");
    if (!pickup?.source || pickup.leaderOnly || pickup.raidOnly) continue;
    const guide = sources.find(
      ({ guide }) =>
        guide.chapterId === pickup.source!.chapterId &&
        guide.version === pickup.source!.version &&
        guide.targetBuild === plan.targetBuild,
    )?.guide;
    const step = guide?.steps.find((entry) => entry.id === pickup.source!.stepId);
    if (!step) continue;
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter((row) => ![".group", ".solo"].includes(row.tag)),
      },
      profile,
      { dungeons: [] },
    );
    if (view.condition !== "match" || view.conditionalDirectives.length) continue;
    const giver = capturedQuestNpc(pickup, view.directives, quest.starts);
    const at = view.directives.findIndex(
      (row) => row.tag === ".accept" && row.questId === quest.questId,
    );
    if (!giver || at < 0) continue;
    const parents = new Set(
      view.directives
        .slice(0, at)
        .flatMap((row) =>
          row.tag === ".turnin" && row.questId !== null && row.questId !== quest.questId
            ? [row.questId]
            : [],
        ),
    );
    for (const row of view.directives)
      if (row.tag === ".isQuestTurnedIn" && /^\d+$/.test(row.arguments.trim()))
        parents.add(Number(row.arguments));
    if (
      !parents.size ||
      parents.has(quest.questId) ||
      [...parents].some(
        (id) =>
          !entries.get(id)?.ends.some((npc) => npc.friendlyToAlliance && npc.npcId === giver.npcId),
      )
    )
      continue;
    const action = { ...pickup, requiredQuestIds: [...parents] };
    if (
      view.directives.some((row) =>
        CAMPAIGN_QUEST_GUARDS.has(row.tag)
          ? !freshQuestGuardSatisfied(
              normalizeQuestPickupGuard(row, action, view.directives),
              quest.questId,
              "accepted",
              parents,
            )
          : !pickupTags.has(row.tag) &&
            !(row.tag === "#season" && row.arguments.trim() === "0" && !row.condition.trim()),
      )
    )
      continue;
    result.set(quest.questId, [...parents]);
  }
  return result;
}
