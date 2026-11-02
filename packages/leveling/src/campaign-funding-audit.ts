import type { CampaignPlan } from "./campaign.js";
import { activeCampaignActions, campaignXpTarget } from "./campaign.js";
import { forecastCampaignGuide, type CampaignGuideForecast } from "./campaign-guide.js";
import type { PremadeProgress } from "./premade-model.js";
import type { XpPosition } from "./campaign-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { campaignXpBoundsConserved } from "./campaign-xp-bounds.js";

export interface CampaignFundingPlayerAudit {
  readonly player: number;
  readonly start: XpPosition | null;
  readonly finish: XpPosition | null;
  readonly lastCalculated: XpPosition | null;
  readonly questXp: number;
  readonly requiredKillXp: number;
  readonly missingXp: number | null;
  readonly failedCheckpointIds: readonly string[];
  readonly missingQuestIds: readonly number[];
  readonly blockedReason: string | null;
  readonly witnessErrors: readonly string[];
  readonly usesEstimates: boolean;
  readonly xpBoundsVerified?: boolean;
  readonly funded: boolean;
}

export interface CampaignFundingChapterAudit {
  readonly id: string;
  readonly title: string;
  readonly targetLevel: number;
  readonly players: readonly CampaignFundingPlayerAudit[];
  readonly funded: boolean;
}

export interface CampaignFundingAudit {
  readonly revision: "no-grind-funding-20261031-v1";
  readonly release: string;
  readonly chapters: readonly CampaignFundingChapterAudit[];
  readonly funded: boolean;
  readonly witnessPassed: boolean;
}

function total(position: XpPosition): number {
  let amount = position.currentXp;
  for (let level = 1; level < position.level; level++) amount += FOREVER_XP_CURVE[level]!;
  return amount;
}
const maximumXp = total({ level: 60, currentXp: 0 });

/** Verifies the XP ledger against reward rows and kill rows, never checkpoint top-ups. */
export function auditCampaignGuideFunding(
  plan: CampaignPlan,
  progress: PremadeProgress,
  forecast: CampaignGuideForecast = forecastCampaignGuide(plan, progress),
): CampaignFundingAudit {
  const actions = new Map(
    activeCampaignActions(plan, progress).map((action) => [action.id, action]),
  );
  const chapters = forecast.sections.map((section): CampaignFundingChapterAudit => {
    const members =
      section.audience === "personal"
        ? section.forecast.members.slice(0, 1)
        : section.forecast.members;
    const players = members.map((member): CampaignFundingPlayerAudit => {
      const errors: string[] = [];
      const questXp =
        member.rewards.reduce((sum, reward) => sum + (reward.xp ?? 0), 0) +
        member.bundleRewards.reduce((sum, reward) => sum + (reward.xp ?? 0), 0);
      const requiredKillXp = member.combatRows.reduce((sum, row) => sum + (row.xp ?? 0), 0);
      if (questXp !== member.referenceQuestXp + member.estimatedQuestXp)
        errors.push("Quest XP has no matching reward rows.");
      if (requiredKillXp !== member.combatXp)
        errors.push("Combat XP has no matching required-kill rows.");
      if (member.estimatedCombatXp !== 0) errors.push("The forecast contains extra grinding XP.");
      if (
        member.start &&
        member.knownEndpoint &&
        !member.xpBounds &&
        total(member.knownEndpoint) !==
          Math.min(maximumXp, total(member.start) + questXp + requiredKillXp)
      )
        errors.push("The chapter XP change differs from its listed rewards and required kills.");
      if (member.xpBounds?.start && member.xpBounds.finish) {
        const maximumEarned =
          [...member.rewards, ...member.bundleRewards].reduce(
            (sum, row) => sum + (row.maximumXp ?? row.xp ?? 0),
            0,
          ) + member.combatRows.reduce((sum, row) => sum + (row.maximumXp ?? row.xp ?? 0), 0);
        if (
          !campaignXpBoundsConserved({
            before: member.xpBounds.start,
            after: member.xpBounds.finish,
            minimumXp: questXp + requiredKillXp,
            maximumXp: maximumEarned,
          })
        )
          errors.push("The chapter XP enclosure differs from its listed contribution bounds.");
        if (
          (member.start && total(member.start) !== total(member.xpBounds.start.minimum)) ||
          (member.knownEndpoint &&
            total(member.knownEndpoint) !== total(member.xpBounds.finish.minimum))
        )
          errors.push("The chapter's displayed minimum differs from its XP enclosure.");
      }
      if (
        member.xpBounds &&
        !member.xpBounds.finish &&
        member.start &&
        member.knownEndpoint &&
        total(member.knownEndpoint) <
          Math.min(maximumXp, total(member.start) + questXp + requiredKillXp)
      )
        errors.push("The known lower XP bound lost a listed contribution.");
      for (const step of member.steps) {
        if (
          step.after &&
          !step.xpBounds &&
          total(step.after) !==
            Math.min(maximumXp, total(step.before) + step.questXp + step.combatXp)
        )
          errors.push(
            `Step ${step.actionId} changes XP without a matching reward or required kill.`,
          );
        if (
          step.xpBounds?.after &&
          step.xpBounds.maximumQuestXp !== null &&
          step.xpBounds.maximumCombatXp !== null &&
          !campaignXpBoundsConserved({
            before: step.xpBounds.before,
            after: step.xpBounds.after,
            minimumXp: step.questXp + step.combatXp,
            maximumXp: step.xpBounds.maximumQuestXp + step.xpBounds.maximumCombatXp,
          })
        )
          errors.push(`Step ${step.actionId} has inconsistent XP contribution bounds.`);
        if (
          step.xpBounds?.after &&
          step.after &&
          (total(step.before) !== total(step.xpBounds.before.minimum) ||
            total(step.after) !== total(step.xpBounds.after.minimum))
        )
          errors.push(`Step ${step.actionId} differs from its displayed XP enclosure.`);
      }
      for (const checkpoint of member.checkpoints) {
        const action = actions.get(checkpoint.actionId);
        if (!action || !checkpoint.position) continue;
        const target = campaignXpTarget(action, progress, plan.rewardFacts);
        if (
          target &&
          checkpoint.missingXp !== Math.max(0, total(target) - total(checkpoint.position))
        )
          errors.push(`Checkpoint ${checkpoint.actionId} has an inconsistent XP gap.`);
      }
      const missingXp = member.endpoint
        ? Math.max(0, total({ level: section.targetLevel, currentXp: 0 }) - total(member.endpoint))
        : null;
      const failedCheckpointIds = member.checkpoints
        .filter((checkpoint) => !checkpoint.ready)
        .map((checkpoint) => checkpoint.actionId);
      return {
        player: member.player,
        start: member.start,
        finish: member.endpoint,
        lastCalculated: member.knownEndpoint,
        questXp,
        requiredKillXp,
        missingXp,
        failedCheckpointIds,
        missingQuestIds: member.unknownQuestIds,
        blockedReason:
          member.blockedReason ??
          member.issues.find((issue) => issue.blocksForecast)?.message ??
          null,
        witnessErrors: errors,
        usesEstimates:
          member.estimatedQuestXp > 0 ||
          member.combatRows.some((row) => row.basis !== "observed" && row.basis !== "excluded") ||
          member.issues.length > 0 ||
          member.inheritedIssueCount > 0,
        ...(member.xpBounds
          ? { xpBoundsVerified: member.xpBounds.start !== null && member.xpBounds.finish !== null }
          : {}),
        funded:
          member.endpoint !== null &&
          (!member.xpBounds ||
            (member.xpBounds.start !== null && member.xpBounds.finish !== null)) &&
          missingXp === 0 &&
          failedCheckpointIds.length === 0 &&
          errors.length === 0 &&
          member.blockedReason === null &&
          !member.issues.some((issue) => issue.blocksForecast),
      };
    });
    return {
      id: section.chapter.id,
      title: section.chapter.title,
      targetLevel: section.targetLevel,
      players,
      funded:
        players.length === (section.audience === "personal" ? 1 : 5) &&
        players.every((player) => player.funded),
    };
  });
  return {
    revision: "no-grind-funding-20261031-v1",
    release: plan.release,
    chapters,
    funded: chapters.length > 0 && chapters.every((chapter) => chapter.funded),
    witnessPassed:
      chapters.length > 0 &&
      chapters.every((chapter) =>
        chapter.players.every((player) => player.witnessErrors.length === 0),
      ),
  };
}
