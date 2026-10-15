import {
  activeCampaignActions,
  campaignOptionalXpReady,
  campaignUnmodeledExtras,
  type CampaignPlan,
} from "./campaign.js";
import { campaignSections, campaignSectionTarget } from "./campaign-sections.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { getPremadeQuest, PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import type { PremadeProgress } from "./premade-model.js";
import { questEligibility, questGateResult } from "./quest-eligibility.js";
import { estimateGroupCombat, type GroupCombatInput } from "./group-combat.js";
export const CAMPAIGN_XP_REVISION = "checkpoint-ledger-20261015-v3";

export interface XpPosition {
  readonly level: number;
  readonly currentXp: number;
}
export interface CampaignXpRewardRow {
  readonly actionId: string;
  readonly questId: number;
  readonly title: string;
  readonly handInLevel: number | null;
  readonly xp: number | null;
  readonly basis: ReturnType<typeof resolveQuestReward>["basis"];
  readonly source: string;
}
export interface CampaignXpMemberForecast {
  readonly player: number;
  readonly start: XpPosition | null;
  readonly endpoint: XpPosition | null;
  readonly knownEndpoint: XpPosition | null;
  readonly referenceQuestXp: number;
  readonly estimatedQuestXp: number;
  readonly combatXp: number;
  readonly rewards: readonly CampaignXpRewardRow[];
  readonly unknownQuestIds: readonly number[];
  readonly eligibilityIssues: readonly string[];
  readonly evidenceIssues: readonly string[];
  readonly checkpoints: readonly CampaignXpCheckpoint[];
  readonly blockedAtActionId: string | null;
  readonly blockedReason: string | null;
  readonly targetLevel: number;
  readonly residualXp: number | null;
  readonly status: "covered" | "shortfall" | "incomplete" | "blocked" | "no-start" | "before-start";
}
export interface CampaignXpCheckpoint {
  readonly actionId: string;
  readonly targetLevel: number;
  readonly position: XpPosition | null;
  readonly missingXp: number | null;
  readonly ready: boolean;
}
export interface CampaignXpSectionForecast {
  readonly sectionId: string;
  readonly members: readonly CampaignXpMemberForecast[];
}
export interface CampaignCombatScenario {
  readonly actionId: string;
  readonly activityId?: string;
  readonly xpByPlayer: readonly number[];
}
export interface CampaignGroupCombatScenario extends GroupCombatInput {
  readonly actionId: string;
  readonly activityId: string;
}

function cumulative(position: XpPosition): number {
  let total = position.currentXp;
  for (let level = 1; level < position.level; level++) total += FOREVER_XP_CURVE[level]!;
  return total;
}
function position(total: number): XpPosition {
  let level = 1,
    currentXp = total;
  while (level < 60 && currentXp >= FOREVER_XP_CURVE[level]!) {
    currentXp -= FOREVER_XP_CURVE[level]!;
    level++;
  }
  return { level, currentXp: level === 60 ? 0 : currentXp };
}

export function forecastCampaignXp(
  plan: CampaignPlan,
  progress: PremadeProgress,
  options: {
    readonly fromActionId?: string;
    readonly combat?: readonly CampaignCombatScenario[];
    readonly groupCombat?: readonly CampaignGroupCombatScenario[];
    readonly facts?: readonly QuestRewardFact[];
  } = {},
): readonly CampaignXpSectionForecast[] {
  const actions = activeCampaignActions(plan, progress);
  const unmodeledExtras = new Set(campaignUnmodeledExtras(plan, progress));
  const from =
    options.fromActionId === undefined
      ? 0
      : actions.findIndex((a) => a.id === options.fromActionId);
  if (from < 0) throw new Error("Unknown forecast starting action.");
  const combat = new Map<string, readonly number[]>();
  const activities = new Set<string>();
  const unknownCombat = new Set<string>();
  const groupScenarios: CampaignCombatScenario[] = [];
  for (const activity of options.groupCombat ?? []) {
    if (activity.partySize !== 5 || !actions.some((action) => action.id === activity.actionId))
      throw new Error("Group combat requires five members and an active action.");
    const estimate = estimateGroupCombat(activity);
    if (estimate.xpPerPlayer === null) {
      if (unknownCombat.has(activity.actionId) || activities.has(activity.activityId))
        throw new Error("Invalid or duplicate combat scenario.");
      unknownCombat.add(activity.actionId);
      activities.add(activity.activityId);
    } else
      groupScenarios.push({
        actionId: activity.actionId,
        activityId: activity.activityId,
        xpByPlayer: Array.from({ length: 5 }, () => estimate.xpPerPlayer!),
      });
  }
  for (const entry of [...(options.combat ?? []), ...groupScenarios]) {
    if (
      combat.has(entry.actionId) ||
      unknownCombat.has(entry.actionId) ||
      activities.has(entry.activityId ?? entry.actionId) ||
      !actions.some((a) => a.id === entry.actionId) ||
      entry.xpByPlayer.length !== 5 ||
      entry.xpByPlayer.some((xp) => !Number.isSafeInteger(xp) || xp < 0 || xp > 1_000_000)
    )
      throw new Error("Invalid or duplicate combat scenario.");
    combat.set(entry.actionId, entry.xpByPlayer);
    activities.add(entry.activityId ?? entry.actionId);
  }
  const facts = options.facts ?? plan.rewardFacts ?? [];
  const objectiveKeys = new Map<number, Set<string>>();
  for (const action of actions)
    for (const change of action.questChanges) {
      if (change.state !== "objectives-complete") continue;
      const keys = objectiveKeys.get(change.questId) ?? new Set<string>();
      keys.add(`campaign-objective-${change.questId}-${change.objectiveIndex ?? 1}`);
      objectiveKeys.set(change.questId, keys);
    }
  const ledgers = progress.members.map((member) => {
    const invalid =
      member.level !== null &&
      member.currentXp !== null &&
      (member.level === 60
        ? member.currentXp !== 0
        : member.currentXp >= FOREVER_XP_CURVE[member.level]!);
    return {
      total:
        invalid || member.level === null || member.currentXp === null || member.xpNeedsUpdate
          ? null
          : cumulative({ level: member.level, currentXp: member.currentXp }),
      states: { ...member.questStates },
      confirmations: { ...member.confirmations },
      paid: new Set(
        Object.keys(member.questStates)
          .filter((id) => member.questStates[id] === "rewarded")
          .map(Number),
      ),
      incomplete: false,
      unknown: new Set<number>(),
      blocked: new Set<number>(),
      halt: null as { actionId: string; reason: string; data: boolean } | null,
      issue: invalid
        ? "The saved XP bar does not fit the reference level curve; verify the curve and record fresh actual XP."
        : null,
    };
  });
  const selected = new Set(actions.slice(from).map((a) => a.id));
  const sections = campaignSections(plan, progress);
  return sections.map((section, sectionIndex): CampaignXpSectionForecast => {
    const entries = actions.filter((a) => selected.has(a.id) && section.actionIds.includes(a.id));
    const targetLevel = campaignSectionTarget(sections, sectionIndex, progress, facts).level;
    const summaries = ledgers.map((ledger) => ({
      start: ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total),
      rewards: [] as CampaignXpRewardRow[],
      eligibilityIssues: ledger.issue ? [ledger.issue] : ([] as string[]),
      evidenceIssues: [] as string[],
      checkpoints: [] as CampaignXpCheckpoint[],
      referenceQuestXp: 0,
      estimatedQuestXp: 0,
      combatXp: 0,
    }));
    for (const action of entries) {
      const modeled: PremadeProgress = {
        ...progress,
        members: ledgers.map((ledger, player) => ({
          ...progress.members[player]!,
          ...(ledger.total === null ? { level: null, currentXp: null } : position(ledger.total)),
          questStates: ledger.states,
          confirmations: ledger.confirmations,
          xpNeedsUpdate: ledger.total === null || ledger.incomplete,
        })),
      };
      if (campaignOptionalXpReady(plan, modeled, action)) continue;
      for (const [player, ledger] of ledgers.entries()) {
        const summary = summaries[player]!;
        const { rewards, eligibilityIssues } = summary;
        if (action.leaderOnly && player !== 0) continue;
        if (ledger.total === null || ledger.halt) continue;
        const needed = (change: (typeof action.questChanges)[number]): boolean => {
          const state = ledger.states[String(change.questId)];
          if (ledger.paid.has(change.questId)) return false;
          if (change.state === "accepted") return !state || state === "not-started";
          if (change.state === "objectives-complete")
            return (
              state !== "objectives-complete" &&
              !ledger.confirmations[
                `campaign-objective-${change.questId}-${change.objectiveIndex ?? 1}`
              ]
            );
          return true;
        };
        if (action.questChanges.length && !action.questChanges.some(needed)) continue;
        if (
          action.libraryObjective === "named-trophy" &&
          action.questChanges.some(
            (change) => change.state === "objectives-complete" && needed(change),
          )
        ) {
          ledger.incomplete = true;
          summary.evidenceIssues.push(
            `${action.libraryQuestId}: named-target loot/credit for five players is unverified; no one-kill completion or drop rate is assumed.`,
          );
        }
        const halt = (reason: string, data = false): void => {
          ledger.halt = { actionId: action.id, reason, data };
          ledger.incomplete = true;
          (data ? summary.evidenceIssues : eligibilityIssues).push(reason);
        };
        if (
          action.kind !== "checkpoint" &&
          action.questChanges.some((change) => change.state === "accepted" && needed(change)) &&
          action.requiredQuestIds?.some((id) => ledger.states[String(id)] !== "rewarded")
        ) {
          halt(
            `${action.id}: required source-chain hand-ins remain missing (${action.requiredQuestIds.join(", ")}).`,
          );
          continue;
        }
        if (action.kind === "checkpoint") {
          const entryStop = PREMADE_STOPS.find((entry) => entry.id === action.targetStopId);
          const missingExtra = entryStop?.quests.find((choice) =>
            unmodeledExtras.has(choice.questId),
          );
          if (missingExtra) {
            halt(
              `${entryStop!.name}: optional quest ${missingExtra.questId} is selected but not modeled in this route. Review or deselect it in the detailed dungeon planner; no assumed reward is added.`,
              true,
            );
            continue;
          }
          const minimum = entryStop
            ? premadeEntryLevel(entryStop, progress, facts)
            : action.targetLevel;
          const current = position(ledger.total);
          const missingXp =
            minimum === null
              ? null
              : Math.max(0, cumulative({ level: minimum, currentXp: 0 }) - ledger.total);
          const missingQuests =
            action.requiredQuestIds?.filter((id) => ledger.states[String(id)] !== "rewarded") ?? [];
          const ready =
            missingXp === 0 &&
            missingQuests.length === 0 &&
            entryStop?.dataStatus !== "missing-quest-data";
          summary.checkpoints.push({
            actionId: action.id,
            targetLevel: minimum ?? targetLevel,
            position: current,
            missingXp,
            ready,
          });
          if (!ready) {
            halt(
              entryStop?.dataStatus === "missing-quest-data"
                ? `${entryStop.name}: the quest/access bundle is unverified.`
                : missingQuests.length
                  ? `${action.id}: required preparation hand-ins remain missing (${missingQuests.join(", ")}).`
                  : `${action.id}: entry requires level ${minimum ?? "unknown"}; forecast is level ${current.level}. Future rewards cannot fund this departure.`,
            );
            continue;
          }
        }
        if (action.kind === "unverified") {
          halt(`${action.id}: the quest bundle is unverified.`);
          continue;
        }
        const kills = combat.get(action.id)?.[player] ?? 0;
        if (unknownCombat.has(action.id)) {
          ledger.incomplete = true;
          summary.evidenceIssues.push(
            `${action.id}: kill count or solo kill XP is unknown; no group combat XP has been added.`,
          );
        }
        summary.combatXp += kills;
        if (kills > 0) ledger.incomplete = true;
        if (ledger.total !== null) ledger.total += kills;
        for (const change of action.questChanges) {
          if (!needed(change)) continue;
          const level =
            ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total).level;
          const eligibility = questEligibility(change.questId, facts);
          const minimum = eligibility.minimumLevel;
          if (eligibility.minimumConflict) {
            ledger.incomplete = true;
            summary.evidenceIssues.push(
              `${change.questId}: pickup minimum claims disagree (${eligibility.minimumClaims.join(" / ")}); using conservative level ${minimum}.`,
            );
          }
          if (change.state === "accepted") {
            if (minimum && (level === null || level < minimum)) {
              halt(
                `${change.questId}: pickup requires level ${minimum}; forecast is below the gate.`,
              );
              ledger.blocked.add(change.questId);
              break;
            }
            const member = {
              ...progress.members[player]!,
              classSlug:
                player === 0
                  ? (plan.leaderClass ?? progress.members[player]!.classSlug)
                  : progress.members[player]!.classSlug,
              questStates: ledger.states,
              confirmations: ledger.confirmations,
            };
            const gate = eligibility.gate ? questGateResult(eligibility.gate, member) : "ready";
            if (gate === "blocked") {
              halt(
                `${change.questId}: required prerequisite or item check has not been completed before pickup.`,
              );
              break;
            }
            const quest = getPremadeQuest(change.questId);
            if (minimum === null || (quest && !eligibility.lifecycleKnown)) {
              ledger.incomplete = true;
              summary.evidenceIssues.push(
                `${change.questId}: pickup level or dungeon quest lifecycle remains unverified.`,
              );
            }
            if (
              quest?.faction === "horde" ||
              (quest?.classSlug && member.classSlug && quest.classSlug !== member.classSlug) ||
              (player === 0 && quest?.raceIds.length && !quest.raceIds.includes(plan.race))
            ) {
              halt(`${change.questId}: faction, class or race is not eligible for this pickup.`);
              break;
            }
            if (
              gate === "unknown" ||
              (quest?.classSlug && !member.classSlug) ||
              (player !== 0 && quest?.raceIds.length)
            ) {
              ledger.incomplete = true;
              summary.evidenceIssues.push(
                `${change.questId}: lifecycle, item or personal eligibility needs confirmation.`,
              );
            }
            ledger.states[String(change.questId)] = "accepted";
            continue;
          }
          if (
            !ledger.states[String(change.questId)] ||
            ledger.states[String(change.questId)] === "not-started"
          ) {
            halt(
              `${change.questId}: no earlier pickup or confirmed held quest exists before ${change.state}.`,
            );
            break;
          }
          if (change.state !== "rewarded") {
            ledger.confirmations[
              `campaign-objective-${change.questId}-${change.objectiveIndex ?? 1}`
            ] = true;
            ledger.states[String(change.questId)] = [
              ...(objectiveKeys.get(change.questId) ?? []),
            ].every((key) => ledger.confirmations[key])
              ? "objectives-complete"
              : "accepted";
            continue;
          }
          if (
            objectiveKeys.has(change.questId) &&
            ledger.states[String(change.questId)] !== "objectives-complete"
          ) {
            halt(
              `${change.questId}: required objectives have not all been completed before hand-in.`,
            );
            break;
          }
          const reward =
            level === null || ledger.blocked.has(change.questId) || (minimum && level < minimum)
              ? {
                  xp: null,
                  basis: "unknown" as const,
                  source:
                    level === null
                      ? "Record fresh actual XP before forecasting."
                      : "The quest's pickup gate is not met in this forecast.",
                }
              : resolveQuestReward(change.questId, level, facts);
          rewards.push({
            actionId: action.id,
            questId: change.questId,
            title: change.title,
            handInLevel: level,
            ...reward,
          });
          if (reward.xp === null) {
            ledger.unknown.add(change.questId);
            halt(
              `${change.questId}: reward at the next hand-in is unresolved; later levels cannot be predicted.`,
              true,
            );
          } else {
            if (reward.basis === "base-estimate") {
              summary.estimatedQuestXp += reward.xp;
              if (reward.xp > 0) ledger.incomplete = true;
            } else summary.referenceQuestXp += reward.xp;
            if (ledger.total !== null) ledger.total += reward.xp;
          }
          ledger.paid.add(change.questId);
          if (!ledger.blocked.has(change.questId))
            ledger.states[String(change.questId)] = "rewarded";
          if (ledger.halt) break;
        }
      }
    }
    const members = ledgers.map((ledger, player): CampaignXpMemberForecast => {
      const {
        start,
        rewards,
        eligibilityIssues,
        evidenceIssues,
        checkpoints,
        referenceQuestXp,
        estimatedQuestXp,
        combatXp,
      } = summaries[player]!;
      const endpoint =
        ledger.total === null || ledger.unknown.size > 0 || ledger.halt
          ? null
          : position(ledger.total);
      const residualXp =
        ledger.total === null || ledger.unknown.size > 0 || ledger.halt
          ? null
          : Math.max(0, cumulative({ level: targetLevel, currentXp: 0 }) - ledger.total);
      return {
        player: player + 1,
        start,
        endpoint,
        knownEndpoint: ledger.total === null ? null : position(ledger.total),
        referenceQuestXp,
        estimatedQuestXp,
        combatXp,
        rewards,
        unknownQuestIds: [...ledger.unknown],
        eligibilityIssues,
        evidenceIssues: [...new Set(evidenceIssues)],
        checkpoints,
        blockedAtActionId: ledger.halt?.actionId ?? null,
        blockedReason: ledger.halt?.reason ?? null,
        targetLevel,
        residualXp,
        status: !entries.length
          ? "before-start"
          : ledger.total === null
            ? "no-start"
            : ledger.halt && !ledger.halt.data
              ? "blocked"
              : ledger.incomplete
                ? "incomplete"
                : residualXp
                  ? "shortfall"
                  : "covered",
      };
    });
    return { sectionId: section.id, members };
  });
}
