import { campaignCatchUpTarget, type CampaignPlan, type CampaignAction } from "./campaign.js";
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

export function compileCampaignFunding(plan: CampaignPlan): CampaignPlan {
  const facts = plan.rewardFacts ?? [];
  const assigned = new Set<string>();
  const defaults: Record<string, string[]> = {};
  const candidates = (plan.catchUpBatches ?? [])
    .filter((batch) => {
      const fact = facts.find((entry) => entry.questId === batch.questId);
      return (
        batch.objectiveType === "shared-kills" &&
        !batch.conditional &&
        batch.actions.every((action) => !(action.requiredQuestIds?.length ?? 0)) &&
        fact?.status === "available" &&
        fact.evidenceKind !== "historical-reference" &&
        fact.minimumLevel !== null &&
        !questEligibility(batch.questId, facts).minimumConflict
      );
    })
    .sort(
      (left, right) => left.referenceLevel - right.referenceLevel || left.questId - right.questId,
    );
  for (const batch of candidates) {
    const minimum = questEligibility(batch.questId, facts).minimumLevel!;
    const legs = plan.legs
      .map((leg, index) => ({
        leg,
        index,
        block: CAMPAIGN_BRIDGES.find((entry) => entry.id === leg.id),
      }))
      .filter(
        ({ leg, block }) =>
          leg.kind === "xp-bridge" &&
          block !== undefined &&
          Math.max(minimum, batch.referenceLevel) <= leg.to &&
          batch.sourceIds.some((sourceId) => block.sourceIds.includes(sourceId)),
      )
      .sort(
        (left, right) =>
          Math.abs(left.leg.to - batch.referenceLevel) -
            Math.abs(right.leg.to - batch.referenceLevel) || left.index - right.index,
      );
    const leg = legs[0]?.leg;
    if (!leg || assigned.has(batch.id)) continue;
    (defaults[leg.id] ??= []).push(batch.id);
    assigned.add(batch.id);
  }
  return {
    ...plan,
    defaultCatchUpBatches: Object.fromEntries(
      Object.entries(defaults).filter(([, batchIds]) => batchIds.length > 0),
    ),
  };
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
  const targetLevel = campaignCatchUpTarget(plan, progress, legId);
  const needsXp = progress.members.map((member) =>
    xpToCheckpoint(member.level!, member.currentXp!, targetLevel, FOREVER_XP_CURVE),
  );
  if (!needsXp.some((gap) => gap !== null && gap > 0)) return [];
  const chosen = new Set([
    ...Object.values(plan.defaultCatchUpBatches ?? {}).flat(),
    ...Object.values(progress.selectedBatches ?? {}).flat(),
  ]);
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
