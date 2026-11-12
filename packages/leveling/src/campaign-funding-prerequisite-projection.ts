import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { PremadeProgress } from "./premade-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import type { LootScenario } from "./quest-loot.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { questCatalogRewardFacts } from "./quest-catalog.js";

export interface FundingPrerequisiteProjection {
  readonly plan: CampaignPlan;
  readonly sources: readonly CampaignSource[];
  readonly lootScenario: LootScenario;
}

/** Earlier required work may unlock a later pickup; future rewards cannot pay for it. */
export function projectedFundingPrerequisitesFit(
  actions: readonly CampaignAction[],
  questIds: readonly number[],
  progress: PremadeProgress,
  catalog: QuestCatalog,
  combat: CombatDataset,
  context: FundingPrerequisiteProjection,
): boolean {
  const legId = actions[0]?.legId;
  if (!legId || catalog.targetBuild !== context.plan.targetBuild ||
    catalog.targetBuild !== combat.targetBuild ||
    catalog.sourceArchiveSha256 !== context.plan.sourceArchiveSha256 || progress.members.some((member) =>
    member.level === null || member.currentXp === null || member.xpNeedsUpdate)) return false;
  const sourceKeys = new Set(actions.flatMap((action) => action.source
    ? [`${action.source.chapterId}:${action.source.version}`] : []));
  const sources = context.sources.filter(({ guide }) =>
    sourceKeys.has(`${guide.chapterId}:${guide.version}`));
  if (sources.length !== sourceKeys.size)
    return false;
  const plan = attachCampaignCombat({
    release: context.plan.release,
    race: context.plan.race,
    leaderClass: context.plan.leaderClass,
    targetBuild: catalog.targetBuild,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
    sharedQuestsOnly: true,
    sharedSourceQuestIds: context.plan.sharedSourceQuestIds ?? [],
    ...(context.plan.outdoorIncidentalKillXpPercent !== undefined
      ? { outdoorIncidentalKillXpPercent: context.plan.outdoorIncidentalKillXpPercent } : {}),
    ...(context.plan.incidentalKillXpPercent !== undefined
      ? { incidentalKillXpPercent: context.plan.incidentalKillXpPercent } : {}),
    actions: actions.map((action) => ({ ...action, xpOptional: false, libraryBackbone: true })),
    legs: [{ id: legId, title: "Required quest chain", kind: "preparation",
      from: Math.min(...progress.members.map((member) => member.level!)), to: 60,
      stopId: null, actionIds: actions.map((action) => action.id), questIds,
      unresolvedQuestIds: [] }],
    rewardFacts: questCatalogRewardFacts(context.plan.rewardFacts ?? [], catalog),
    ...(context.plan.itemRequirements ? { itemRequirements: context.plan.itemRequirements } : {}),
  }, sources, combat, context.plan.combat?.revision ?? "funding-prerequisite-review");
  const definitions = new Map(catalog.quests.map((quest) => [quest.questId, quest]));
  const forecast = forecastCampaignXp(plan, progress, { lootScenario: context.lootScenario });
  return progress.members.every((member, player) => {
    const sections = forecast.map((section) => section.members[player]!);
    const paid = new Set(sections.flatMap((section) => section.rewards.map((reward) => reward.questId)));
    return sections.length > 0 && sections.every((section) =>
      section.blockedAtActionId === null && section.questLog.peak <= 40 &&
      section.steps.every((step) => {
        if (step.status === "blocked" || step.status === "unknown") return false;
        if (step.phase !== "accepted" || step.status !== "projected") return true;
        const minimum = definitions.get(step.questId)?.minimumLevel;
        return minimum !== null && minimum !== undefined && step.before.level >= minimum;
      })) &&
      questIds.every((questId) => member.questStates[String(questId)] === "rewarded" || paid.has(questId));
  });
}
