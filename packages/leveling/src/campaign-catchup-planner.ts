import { type CampaignPlan, type CampaignAction } from "./campaign.js";
import { CAMPAIGN_BRIDGES } from "./campaign-route.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { questEligibility } from "./quest-eligibility.js";
import type { PremadeProgress } from "./premade-model.js";
import { xpToCheckpoint } from "./calculator.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export interface CampaignCatchUpRecommendation {
  readonly batchId: string;
  readonly questId: number;
  readonly title: string;
  readonly zone: string;
  readonly legId: string;
  readonly targetLevel: number;
  readonly xpByPlayer: readonly number[];
  readonly score: number;
  readonly sourceUrl: string;
}

export function recommendCampaignCatchUp(
  plan: CampaignPlan,
  legId: string,
  progress: PremadeProgress,
): readonly CampaignCatchUpRecommendation[] {
  const leg = plan.legs.find((entry) => entry.id === legId);
  const block = CAMPAIGN_BRIDGES.find((entry) => entry.id === legId);
  if (!leg || !block || leg.kind === "dungeon" || leg.kind === "finish") return [];
  if (
    progress.members.some(
      (member) => member.level === null || member.currentXp === null || member.xpNeedsUpdate,
    )
  )
    return [];
  const targetLevel = leg.to;
  const needsXp = progress.members.map((member) =>
    xpToCheckpoint(member.level!, member.currentXp!, targetLevel, FOREVER_XP_CURVE),
  );
  if (!needsXp.some((gap) => gap !== null && gap > 0)) return [];
  const chosen = new Set(Object.values(progress.selectedBatches ?? {}).flat());
  const recommendations: CampaignCatchUpRecommendation[] = [];
  for (const batch of plan.catchUpBatches ?? []) {
    if (
      chosen.has(batch.id) ||
      batch.objectiveType !== "shared-kills" ||
      batch.conditional ||
      !batch.sourceIds.some((id) => block.sourceIds.includes(id))
    )
      continue;
    const fact = plan.rewardFacts?.find((entry) => entry.questId === batch.questId);
    if (
      !fact ||
      fact.status !== "available" ||
      fact.minimumLevel === null ||
      questEligibility(batch.questId, plan.rewardFacts).minimumConflict
    )
      continue;
    const actions: readonly CampaignAction[] = batch.actions.map((action) => ({
      ...action,
      id: `${legId}-${action.id}`,
      legId,
    }));
    const forecast = forecastCampaignXp(
      { ...plan, actions, catchUpBatches: [] },
      { ...progress, selectedBatches: {} },
    );
    const row = forecast.find((entry) =>
      entry.members.some((member) =>
        member.rewards.some((reward) => reward.questId === batch.questId),
      ),
    );
    if (
      !row ||
      row.members.some(
        (member, player) =>
          needsXp[player]! > 0 &&
          (member.endpoint === null ||
            member.estimatedQuestXp > 0 ||
            member.evidenceIssues.length > 0),
      )
    )
      continue;
    const xpByPlayer = row.members.map((member) => member.referenceQuestXp);
    const score = Math.min(...xpByPlayer.filter((_xp, player) => needsXp[player]! > 0));
    if (score <= 0) continue;
    recommendations.push({
      batchId: batch.id,
      questId: batch.questId,
      title: batch.title,
      zone: batch.zone,
      legId,
      targetLevel,
      xpByPlayer,
      score,
      sourceUrl: fact.sourceUrl,
    });
  }
  return recommendations
    .sort((left, right) => right.score - left.score || left.questId - right.questId)
    .slice(0, 8);
}
