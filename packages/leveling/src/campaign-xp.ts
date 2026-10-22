import {
  activeCampaignActions,
  campaignOptionalXpReady,
  campaignXpTarget,
  campaignUnmodeledExtras,
  type CampaignPlan,
} from "./campaign.js";
import { campaignSections, campaignSectionTarget } from "./campaign-sections.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { getPremadeQuest, PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { resolveQuestReward, type QuestRewardFact } from "./quest-rewards.js";
import type { CampaignXpAnchor, PremadeProgress } from "./premade-model.js";
import { questEligibility, questGateResult } from "./quest-eligibility.js";
import { estimateGroupCombat, type GroupCombatInput } from "./group-combat.js";
import {
  applyCampaignCombat,
  createCampaignCombatState,
  type CampaignCombatRow,
} from "./campaign-combat.js";
import {
  campaignEvidenceIssueKey,
  summarizeCampaignEvidence,
  type CampaignEvidenceIssue,
  type CampaignEvidenceSummary,
} from "./campaign-evidence.js";
import { grindMeasurementTotal, type CampaignGrindEvidence } from "./grind-evidence.js";
import {
  forecastDungeonBundle,
  getDungeonBundle,
  type DungeonBundleRewardRow,
} from "./dungeon-bundles.js";
import {
  createQuestValidationResolver,
  type QuestValidationResolution,
} from "./quest-validation-coverage.js";
import type { CampaignQuestValidationEvidence } from "./quest-validation-evidence.js";
import { LEVELING_RACES } from "./profile.js";
import { createQuestValidationCertificateResolver } from "./quest-validation-certificates.js";
import { CAMPAIGN_ADDON_COMPILER_REVISION } from "./campaign-addon.js";
import type { CampaignXpEvent } from "./campaign-xp-event.js";
import type { LootScenario } from "./quest-loot.js";
export const CAMPAIGN_XP_REVISION = "checkpoint-ledger-20261021-v19";

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
  readonly estimatedCombatXp: number;
  readonly outdoorCombatXp: number;
  readonly dungeonCombatXp: number;
  readonly combatRows: readonly CampaignCombatRow[];
  readonly rewards: readonly CampaignXpRewardRow[];
  readonly steps: readonly CampaignXpEvent[];
  readonly bundleRewards: readonly (DungeonBundleRewardRow & { readonly actionId: string })[];
  readonly unknownQuestIds: readonly number[];
  readonly eligibilityIssues: readonly string[];
  readonly evidenceIssues: readonly string[];
  readonly issues: readonly CampaignEvidenceIssue[];
  readonly validationResolutions: readonly QuestValidationResolution[];
  readonly inheritedIssueCount: number;
  readonly inheritedEvidence: CampaignEvidenceSummary;
  readonly evidence: CampaignEvidenceSummary;
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
  readonly planningOnly: boolean;
}
export interface CampaignXpSectionForecast {
  readonly sectionId: string;
  readonly members: readonly CampaignXpMemberForecast[];
  readonly skippedOptionalActionIds: readonly string[];
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

export interface CampaignXpForecastOptions {
  /** Forecast-only personal branches; actual quest reporting remains leader-only. Players are 1-based. */
  readonly personalActionPlayers?: Readonly<Record<string, number>>;
  readonly fromActionId?: string;
  readonly throughActionId?: string;
  readonly combat?: readonly CampaignCombatScenario[];
  readonly groupCombat?: readonly CampaignGroupCombatScenario[];
  readonly facts?: readonly QuestRewardFact[];
  readonly noAssumedGrinding?: boolean;
  readonly lootScenario?: LootScenario;
  readonly outdoorXpMultiplier?: number;
  readonly anchors?: readonly (CampaignXpAnchor & { readonly player: number })[];
  readonly grindEvidence?: CampaignGrindEvidence;
  readonly grindRuntimeBuild?: number;
  readonly questValidation?: {
    readonly evidences: readonly CampaignQuestValidationEvidence[];
    readonly runtimeBuild: number;
    readonly compilerRevision: string;
  };
}

export function forecastCampaignXp(
  plan: CampaignPlan,
  progress: PremadeProgress,
  options: CampaignXpForecastOptions = {},
): readonly CampaignXpSectionForecast[] {
  const actions = activeCampaignActions(plan, progress);
  const personalActions = new Set(
    plan.actions.filter((action) => action.leaderOnly).map((action) => action.id),
  );
  for (const [id, player] of Object.entries(options.personalActionPlayers ?? {})) {
    if (
      !Number.isInteger(player) ||
      player < 1 ||
      player > progress.members.length ||
      !personalActions.has(id)
    )
      throw new Error("Invalid personal forecast action owner.");
  }
  const anchors = new Map<string, NonNullable<CampaignXpForecastOptions["anchors"]>[number][]>();
  const anchoredPlayers = new Set<number>();
  for (const anchor of options.anchors ?? []) {
    if (
      anchor.release !== plan.release ||
      !actions.some((action) => action.id === anchor.actionId) ||
      !Number.isInteger(anchor.player) ||
      anchor.player < 1 ||
      anchor.player > progress.members.length ||
      anchoredPlayers.has(anchor.player) ||
      !Number.isInteger(anchor.level) ||
      anchor.level < 1 ||
      anchor.level > 60 ||
      !Number.isInteger(anchor.currentXp) ||
      anchor.currentXp < 0 ||
      (anchor.level === 60
        ? anchor.currentXp !== 0
        : anchor.currentXp >= FOREVER_XP_CURVE[anchor.level]!)
    )
      throw new Error("Invalid or duplicate campaign XP anchor.");
    anchoredPlayers.add(anchor.player);
    anchors.set(anchor.actionId, [...(anchors.get(anchor.actionId) ?? []), anchor]);
  }
  const resolveValidation = options.questValidation
    ? createQuestValidationResolver(
        options.questValidation.evidences,
        options.questValidation.runtimeBuild,
        options.questValidation.compilerRevision,
      )
    : null;
  const resolveCertificate = plan.questValidationCoverage
    ? createQuestValidationCertificateResolver(
        plan.questValidationCoverage,
        options.questValidation?.runtimeBuild ??
          plan.questValidationRuntimeBuild ??
          plan.rewardBuild ??
          plan.targetBuild,
        CAMPAIGN_ADDON_COMPILER_REVISION,
      )
    : null;
  const objectiveIndexes = new Map<number, Set<number>>();
  for (const action of actions)
    for (const change of action.questChanges) {
      if (change.state !== "objectives-complete") continue;
      const indexes = objectiveIndexes.get(change.questId) ?? new Set<number>();
      indexes.add(change.objectiveIndex ?? 1);
      objectiveIndexes.set(change.questId, indexes);
    }
  if (plan.combat && plan.combat.targetBuild !== plan.targetBuild)
    throw new Error("Combat data belongs to a different route build.");
  const grindMeasurements = options.grindEvidence?.measurements ?? [];
  const grindRuntimeBuild = options.grindRuntimeBuild ?? plan.targetBuild;
  if (!Number.isSafeInteger(grindRuntimeBuild) || grindRuntimeBuild <= 0)
    throw new Error("Grind runtime build is invalid.");
  if (grindMeasurements.some((measurement) => measurement.build !== grindRuntimeBuild))
    throw new Error("Grind evidence belongs to a different runtime build.");
  const automaticCombat = new Map(
    actions.map((action) => [
      action.id,
      plan.combat?.activities.filter((activity) => activity.actionId === action.id) ?? [],
    ]),
  );
  const unmodeledExtras = new Set(campaignUnmodeledExtras(plan, progress));
  const from =
    options.fromActionId === undefined
      ? 0
      : actions.findIndex((a) => a.id === options.fromActionId);
  if (from < 0) throw new Error("Unknown forecast starting action.");
  const through =
    options.throughActionId === undefined
      ? actions.length - 1
      : actions.findIndex((action) => action.id === options.throughActionId);
  if (options.throughActionId !== undefined && through < from)
    throw new Error("Unknown or reversed forecast ending action.");
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
    const progressIssue: CampaignEvidenceIssue | null = invalid
      ? {
          code: "saved-xp-invalid",
          domain: "progress",
          message:
            "The saved XP bar does not fit the reference level curve; verify the curve and record fresh actual XP.",
          resolution: "in-game",
          actionId: null,
          questId: null,
          blocksForecast: true,
        }
      : null;
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
      bundlePaid: new Set(
        Object.entries(member.bundleSlotStates ?? {})
          .filter(([, state]) => state === "rewarded")
          .map(([key]) => key),
      ),
      incomplete: false,
      unknown: new Set<number>(),
      blocked: new Set<number>(),
      halt: null as { actionId: string; reason: string; data: boolean } | null,
      issue: progressIssue?.message ?? null,
      issues: new Map(
        progressIssue ? [[campaignEvidenceIssueKey(progressIssue), progressIssue]] : [],
      ),
      combat: createCampaignCombatState(plan.combat, member),
    };
  });
  const selected = new Set(actions.slice(from, through + 1).map((a) => a.id));
  const sections = campaignSections(plan, progress);
  return sections.map((section, sectionIndex): CampaignXpSectionForecast => {
    const entries = actions.filter((a) => selected.has(a.id) && section.actionIds.includes(a.id));
    const targetLevel = campaignSectionTarget(sections, sectionIndex, progress, facts).level;
    const skippedOptionalActionIds: string[] = [];
    const summaries = ledgers.map((ledger) => ({
      start: ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total),
      rewards: [] as CampaignXpRewardRow[],
      steps: [] as CampaignXpEvent[],
      bundleRewards: [] as (DungeonBundleRewardRow & { readonly actionId: string })[],
      eligibilityIssues: ledger.issue ? [ledger.issue] : ([] as string[]),
      evidenceIssues: [] as string[],
      issues: [] as CampaignEvidenceIssue[],
      validationResolutions: [] as QuestValidationResolution[],
      inheritedIssueCount: ledger.issues.size,
      inheritedEvidence: summarizeCampaignEvidence([...ledger.issues.values()]),
      checkpoints: [] as CampaignXpCheckpoint[],
      referenceQuestXp: 0,
      estimatedQuestXp: 0,
      combatXp: 0,
      estimatedCombatXp: 0,
      outdoorCombatXp: 0,
      dungeonCombatXp: 0,
      combatRows: [] as CampaignCombatRow[],
    }));
    for (const action of entries) {
      for (const anchor of anchors.get(action.id) ?? []) {
        const player = anchor.player - 1;
        const ledger = ledgers[player]!;
        const questStates = { ...ledger.states, ...anchor.questStates };
        const confirmations = { ...ledger.confirmations, ...anchor.confirmations };
        const bundleSlotStates = {
          ...Object.fromEntries([...ledger.bundlePaid].map((key) => [key, "rewarded" as const])),
          ...anchor.bundleSlotStates,
        };
        const member = {
          ...progress.members[player]!,
          ...anchor,
          questStates,
          confirmations,
          bundleSlotStates,
        };
        ledger.total = cumulative(anchor);
        ledger.states = questStates;
        ledger.confirmations = confirmations;
        ledger.paid = new Set(
          Object.entries(questStates)
            .filter(([, state]) => state === "rewarded")
            .map(([id]) => Number(id)),
        );
        ledger.bundlePaid = new Set(
          Object.entries(bundleSlotStates)
            .filter(([, state]) => state === "rewarded")
            .map(([key]) => key),
        );
        ledger.unknown.clear();
        ledger.blocked.clear();
        ledger.issues.clear();
        ledger.halt = null;
        ledger.issue = null;
        ledger.incomplete = false;
        ledger.combat = createCampaignCombatState(plan.combat, member);
        // This bar supersedes earlier estimates, not earlier actual quest reports. Only
        // work after its fixed step is added; moving the reader cursor cannot move it.
        Object.assign(summaries[player]!, {
          start: position(ledger.total),
          rewards: [],
          steps: [],
          bundleRewards: [],
          eligibilityIssues: [],
          evidenceIssues: [],
          issues: [],
          validationResolutions: [],
          inheritedIssueCount: 0,
          inheritedEvidence: summarizeCampaignEvidence([]),
          checkpoints: [],
          referenceQuestXp: 0,
          estimatedQuestXp: 0,
          combatXp: 0,
          estimatedCombatXp: 0,
          outdoorCombatXp: 0,
          dungeonCombatXp: 0,
          combatRows: [],
        });
      }
      const partyLevels = ledgers.map((ledger) =>
        ledger.total === null ? null : position(ledger.total).level,
      );
      const modeled: PremadeProgress = {
        ...progress,
        members: ledgers.map((ledger, player) => ({
          ...progress.members[player]!,
          ...(ledger.total === null ? { level: null, currentXp: null } : position(ledger.total)),
          questStates: ledger.states,
          confirmations: ledger.confirmations,
          xpNeedsUpdate: ledger.total === null || ledger.unknown.size > 0 || ledger.halt !== null,
        })),
      };
      const personalPlayer = (options.personalActionPlayers?.[action.id] ?? 1) - 1;
      const optionalModel = action.leaderOnly
        ? { ...modeled, members: [modeled.members[personalPlayer]!] }
        : modeled;
      if (campaignOptionalXpReady(plan, optionalModel, action)) {
        skippedOptionalActionIds.push(action.id);
        continue;
      }
      for (const [player, ledger] of ledgers.entries()) {
        const summary = summaries[player]!;
        const { rewards, eligibilityIssues } = summary;
        const markIssue = (
          issue: CampaignEvidenceIssue,
          bucket: "evidence" | "eligibility" = "evidence",
        ): void => {
          if (
            (resolveValidation || resolveCertificate) &&
            issue.questId !== null &&
            !issue.blocksForecast
          ) {
            const eligibility = questEligibility(issue.questId, facts);
            const context = {
              release: plan.release,
              raceId: player === 0 ? plan.race : (progress.members[player]!.raceId ?? null),
              classSlug:
                player === 0
                  ? (plan.leaderClass ?? progress.members[player]!.classSlug)
                  : progress.members[player]!.classSlug,
              partySize: progress.members.length,
              partyMembers: progress.members.map((member, index) => ({
                raceId: index === 0 ? plan.race : (member.raceId ?? null),
                classSlug: index === 0 ? (plan.leaderClass ?? member.classSlug) : member.classSlug,
              })),
              objectiveIndexes:
                issue.code === "named-target-unverified"
                  ? action.questChanges
                      .filter(
                        (change) =>
                          change.questId === issue.questId &&
                          change.state === "objectives-complete",
                      )
                      .map((change) => change.objectiveIndex ?? 1)
                  : [...(objectiveIndexes.get(issue.questId) ?? [])].sort(
                      (left, right) => left - right,
                    ),
              targetNpcIds: [
                ...new Set(
                  (automaticCombat.get(action.id) ?? []).flatMap((activity) =>
                    activity.objectives
                      .filter((objective) => objective.questId === issue.questId)
                      .flatMap((objective) => objective.npcIds),
                  ),
                ),
              ].sort((left, right) => left - right),
              minimumLevelClaims: eligibility.minimumClaims,
              prerequisiteGate: eligibility.gate,
            };
            const resolution =
              resolveValidation?.(issue, context) ?? resolveCertificate?.(issue, context);
            if (resolution) {
              summary.validationResolutions.push(resolution);
              return;
            }
          }
          ledger.incomplete = true;
          summary.issues.push(issue);
          ledger.issues.set(campaignEvidenceIssueKey(issue), issue);
          (bucket === "evidence" ? summary.evidenceIssues : eligibilityIssues).push(issue.message);
        };
        if (action.leaderOnly && player !== personalPlayer) continue;
        if (ledger.total === null || ledger.halt) continue;
        const needed = (change: (typeof action.questChanges)[number]): boolean => {
          const state = ledger.states[String(change.questId)];
          if (ledger.paid.has(change.questId)) return false;
          if (change.state === "accepted") return !state || state === "not-started";
          if (!state || state === "not-started") return false;
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
          markIssue({
            code: "named-target-unverified",
            domain: "route",
            message: `${action.libraryQuestId}: named-target loot/credit for five players is unverified; no one-kill completion or drop rate is assumed.`,
            resolution: "in-game",
            actionId: action.id,
            questId: action.libraryQuestId ?? null,
            blocksForecast: false,
          });
        }
        const halt = (issue: CampaignEvidenceIssue, data = false): void => {
          ledger.halt = { actionId: action.id, reason: issue.message, data };
          markIssue(issue, data ? "evidence" : "eligibility");
        };
        if (
          action.kind !== "checkpoint" &&
          action.questChanges.some((change) => change.state === "accepted" && needed(change)) &&
          action.requiredQuestIds?.some((id) => ledger.states[String(id)] !== "rewarded")
        ) {
          halt({
            code: "source-prerequisite-missing",
            domain: "route",
            message: `${action.id}: required source-chain hand-ins remain missing (${action.requiredQuestIds.join(", ")}).`,
            resolution: "offline",
            actionId: action.id,
            questId: null,
            blocksForecast: true,
          });
          continue;
        }
        if (action.kind === "checkpoint") {
          const entryStop = PREMADE_STOPS.find((entry) => entry.id === action.targetStopId);
          const missingExtra = entryStop?.quests.find((choice) =>
            unmodeledExtras.has(choice.questId),
          );
          if (missingExtra) {
            halt(
              {
                code: "optional-quest-unmodeled",
                domain: "route",
                message: `${entryStop!.name}: optional quest ${missingExtra.questId} is selected but not modeled in this route. Review or deselect it in the detailed dungeon planner; no assumed reward is added.`,
                resolution: "offline",
                actionId: action.id,
                questId: missingExtra.questId,
                blocksForecast: true,
              },
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
          const planningOnly = entryStop?.dataStatus === "guaranteed-bundle";
          summary.checkpoints.push({
            actionId: action.id,
            targetLevel: minimum ?? targetLevel,
            position: current,
            missingXp,
            ready,
            planningOnly,
          });
          if (!ready) {
            const missingAccessData = entryStop?.dataStatus === "missing-quest-data";
            halt({
              code: missingAccessData ? "dungeon-access-unverified" : "checkpoint-not-ready",
              domain: missingAccessData ? "route" : "progress",
              message: missingAccessData
                ? `${entryStop.name}: the quest/access bundle is unverified.`
                : missingQuests.length
                  ? `${action.id}: required preparation hand-ins remain missing (${missingQuests.join(", ")}).`
                  : `${action.id}: entry requires level ${minimum ?? "unknown"}; forecast is level ${current.level}. Future rewards cannot fund this departure.`,
              resolution: missingAccessData ? "offline-or-in-game" : "in-game",
              actionId: action.id,
              questId: missingQuests[0] ?? null,
              blocksForecast: true,
            });
            continue;
          }
          if (planningOnly)
            markIssue({
              code: "dungeon-details-pending",
              domain: "route",
              message: `${entryStop.name}: four faction quests are owner-confirmed. Planning continues, but quest identities, access and executable instructions remain pending.`,
              resolution: "offline-or-in-game",
              actionId: action.id,
              questId: null,
              blocksForecast: false,
            });
        }
        if (action.bundleId) {
          const bundle = getDungeonBundle(action.bundleId, "alliance", progress.guaranteedBundles);
          if (!bundle) throw new Error("Unknown guaranteed dungeon bundle.");
          const forecast = forecastDungeonBundle(
            bundle,
            position(ledger.total),
            {
              questStates: ledger.states,
              classSlug:
                player === 0
                  ? (plan.leaderClass ?? progress.members[player]!.classSlug)
                  : progress.members[player]!.classSlug,
              raceId: player === 0 ? plan.race : progress.members[player]!.raceId,
              bundleSlotStates: {
                ...progress.members[player]!.bundleSlotStates,
                ...Object.fromEntries(
                  [...ledger.bundlePaid].map((key) => [key, "rewarded" as const]),
                ),
              },
            },
            (questId, level) => resolveQuestReward(questId, level, facts),
          );
          summary.bundleRewards.push(
            ...forecast.rows.map((row) => ({ ...row, actionId: action.id })),
          );
          if (forecast.endpoint === null) {
            halt(
              {
                code: "reward-unresolved",
                domain: "reward",
                message: `${action.id}: a mapped real quest has unresolved reward evidence; later XP cannot be predicted.`,
                resolution: "offline-or-in-game",
                actionId: action.id,
                questId: null,
                blocksForecast: true,
              },
              true,
            );
            continue;
          }
          ledger.total = cumulative(forecast.endpoint);
          summary.referenceQuestXp += forecast.referenceXp;
          summary.estimatedQuestXp += forecast.estimatedXp;
          for (const row of forecast.rows) {
            if (row.state !== "selected") continue;
            ledger.bundlePaid.add(row.slotKey);
            if (row.questId !== null) {
              ledger.paid.add(row.questId);
              ledger.states[String(row.questId)] = "rewarded";
            }
          }
          markIssue({
            code: "dungeon-details-pending",
            domain: "route",
            message: `${action.id}: guaranteed slots are planning entries, not executable quest identities or observed hand-ins.`,
            resolution: "offline-or-in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: false,
          });
          if (forecast.estimatedXp > 0)
            markIssue({
              code: "dungeon-bundle-estimated",
              domain: "reward",
              message: `${action.id}: ${forecast.estimatedXp} quest XP is estimated from the level-${bundle.planningQuestLevel} Dalaran-tier bundle, not multiplied party XP or collected rewards.`,
              resolution: "offline-or-in-game",
              actionId: action.id,
              questId: null,
              blocksForecast: false,
            });
          continue;
        }
        if (action.kind === "unverified") {
          halt({
            code: "quest-bundle-unverified",
            domain: "route",
            message: `${action.id}: the quest bundle is unverified.`,
            resolution: "offline-or-in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: true,
          });
          continue;
        }
        const xpTarget = campaignXpTarget(action, progress, facts);
        if (action.kind === "xp-check" && xpTarget !== null) {
          const target = cumulative(xpTarget);
          if (ledger.total < target) {
            const required = target - ledger.total;
            if (options.noAssumedGrinding) continue;
            const measured = grindMeasurements.some(
              (measurement) =>
                measurement.checkpointId === action.id &&
                measurement.release === plan.release &&
                measurement.party.size === progress.members.length &&
                grindMeasurementTotal(measurement.start) < target &&
                grindMeasurementTotal(measurement.finish) >= target,
            );
            ledger.total = target;
            summary.combatXp += required;
            summary.estimatedCombatXp += required;
            summary.outdoorCombatXp += required;
            if (!measured)
              markIssue({
                code: "adaptive-grind-unmeasured",
                domain: "combat",
                message: `${action.id}: the next requirement needs ${required} additional XP at this checkpoint; the forecast advances to the target, but a reviewed five-player camp, kill mix, XP gain, and duration that reaches this checkpoint is unavailable.`,
                resolution: "in-game",
                actionId: action.id,
                questId: null,
                blocksForecast: false,
              });
          }
          continue;
        }
        const kills = combat.get(action.id)?.[player] ?? 0;
        if (unknownCombat.has(action.id)) {
          markIssue({
            code: "combat-input-unknown",
            domain: "combat",
            message: `${action.id}: kill count or solo kill XP is unknown; no group combat XP has been added.`,
            resolution: "offline-or-in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: false,
          });
        }
        summary.combatXp += kills;
        if (kills > 0)
          markIssue({
            code: "combat-scenario-estimated",
            domain: "combat",
            message: `${action.id}: an explicit combat scenario contributes XP, but it is not accepted as observed route evidence.`,
            resolution: "in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: false,
          });
        if (ledger.total !== null) ledger.total += kills;
        for (const change of action.questChanges) {
          if (!needed(change)) continue;
          const level =
            ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total).level;
          const eligibility = questEligibility(change.questId, facts);
          const minimum = eligibility.minimumLevel;
          const before = position(ledger.total);
          const questXpBefore = summary.referenceQuestXp + summary.estimatedQuestXp;
          const combatXpBefore = summary.combatXp;
          try {
            if (eligibility.minimumConflict) {
              markIssue({
                code: "pickup-level-conflict",
                domain: "eligibility",
                message: `${change.questId}: pickup minimum claims disagree (${eligibility.minimumClaims.join(" / ")}); using conservative level ${minimum}.`,
                resolution: "offline-or-in-game",
                actionId: action.id,
                questId: change.questId,
                blocksForecast: false,
              });
            }
            if (change.state === "accepted") {
              if (minimum && (level === null || level < minimum)) {
                halt({
                  code: "checkpoint-not-ready",
                  domain: "progress",
                  message: `${change.questId}: pickup requires level ${minimum}; forecast is below the gate.`,
                  resolution: "in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                });
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
                if (action.sourceGateConflictQuestIds?.includes(change.questId)) {
                  markIssue({
                    code: "source-gate-conflict",
                    domain: "eligibility",
                    message: `${change.questId}: the selected build-specific source offers this pickup before the older reference gate is satisfied; verify actual eligibility in game.`,
                    resolution: "in-game",
                    actionId: action.id,
                    questId: change.questId,
                    blocksForecast: false,
                  });
                } else {
                  halt({
                    code: "source-prerequisite-missing",
                    domain: "eligibility",
                    message: `${change.questId}: required prerequisite or item check has not been completed before pickup.`,
                    resolution: "offline-or-in-game",
                    actionId: action.id,
                    questId: change.questId,
                    blocksForecast: true,
                  });
                  break;
                }
              }
              const quest = getPremadeQuest(change.questId);
              const memberRace = player === 0 ? plan.race : progress.members[player]!.raceId;
              const memberFaction =
                LEVELING_RACES.find((race) => race.id === memberRace)?.faction ?? "alliance";
              if (minimum === null || (quest && !eligibility.lifecycleKnown)) {
                markIssue({
                  code: "quest-lifecycle-unverified",
                  domain: "eligibility",
                  message: `${change.questId}: pickup level or dungeon quest lifecycle remains unverified.`,
                  resolution: "offline-or-in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: false,
                });
              }
              if (
                (quest && quest.faction !== "both" && quest.faction !== memberFaction) ||
                (quest?.classSlug && member.classSlug && quest.classSlug !== member.classSlug) ||
                (memberRace && quest?.raceIds.length && !quest.raceIds.includes(memberRace))
              ) {
                halt({
                  code: "quest-ineligible",
                  domain: "eligibility",
                  message: `${change.questId}: faction, class or race is not eligible for this pickup.`,
                  resolution: "offline",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                });
                break;
              }
              if (
                gate === "unknown" ||
                (quest?.classSlug && !member.classSlug) ||
                (!memberRace && quest?.raceIds.length)
              ) {
                markIssue({
                  code: "personal-eligibility-unverified",
                  domain: "eligibility",
                  message: `${change.questId}: lifecycle, item or personal eligibility needs confirmation.`,
                  resolution: "in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: false,
                });
              }
              ledger.states[String(change.questId)] = "accepted";
              continue;
            }
            if (
              !ledger.states[String(change.questId)] ||
              ledger.states[String(change.questId)] === "not-started"
            ) {
              halt({
                code: "quest-pickup-missing",
                domain: "route",
                message: `${change.questId}: no earlier pickup or confirmed held quest exists before ${change.state}.`,
                resolution: "offline",
                actionId: action.id,
                questId: change.questId,
                blocksForecast: true,
              });
              break;
            }
            if (change.state !== "rewarded") {
              if (plan.combat && !combat.has(action.id) && !unknownCombat.has(action.id))
                for (const activity of automaticCombat.get(action.id) ?? []) {
                  const objectives = activity.objectives.filter(
                    (objective) =>
                      objective.questId === change.questId &&
                      (activity.questWide ||
                        objective.objectiveIndex === (change.objectiveIndex ?? 1)),
                  );
                  if (!objectives.length) continue;
                  if (
                    activity.environment === "dungeon" &&
                    plan.legs.find((leg) => leg.id === action.legId)?.kind !== "dungeon"
                  ) {
                    halt(
                      {
                        code: "dungeon-objective-misordered",
                        domain: "route",
                        message: `${action.id}: an inside-dungeon objective is placed before its dungeon visit; no future clear XP or hand-in is credited.`,
                        resolution: "offline",
                        actionId: action.id,
                        questId: change.questId,
                        blocksForecast: true,
                      },
                      true,
                    );
                    break;
                  }
                  const last = activity.objectives.at(-1);
                  const result = applyCampaignCombat({
                    activity: {
                      ...activity,
                      id: `${activity.id}-${change.questId}-${change.objectiveIndex ?? 1}`,
                      objectives,
                      profile:
                        last?.questId === change.questId &&
                        (activity.questWide || last.objectiveIndex === (change.objectiveIndex ?? 1))
                          ? activity.profile
                          : null,
                    },
                    combat: plan.combat,
                    state: ledger.combat,
                    questStates: ledger.states,
                    position: position(ledger.total),
                    partySize: action.leaderOnly ? 1 : 5,
                    partyLevels: action.leaderOnly ? [position(ledger.total).level] : partyLevels,
                    lootScenario: options.lootScenario ?? "expected",
                    xpMultiplier:
                      activity.environment === "outdoor"
                        ? (options.outdoorXpMultiplier ??
                          progress.combatPlanning?.outdoorXpMultiplier ??
                          1)
                        : 1,
                    playerIndex: action.leaderOnly ? 0 : player,
                  });
                  ledger.total += result.xp;
                  summary.combatXp += result.xp;
                  if (activity.environment === "outdoor") summary.outdoorCombatXp += result.xp;
                  else summary.dungeonCombatXp += result.xp;
                  summary.combatRows.push(...result.rows);
                  for (const message of result.issues)
                    markIssue({
                      code: "combat-profile-unverified",
                      domain: "combat",
                      message,
                      resolution: "offline-or-in-game",
                      actionId: action.id,
                      questId: change.questId,
                      blocksForecast: false,
                    });
                }
              if (ledger.halt) break;
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
              halt({
                code: "quest-objectives-incomplete",
                domain: "route",
                message: `${change.questId}: required objectives have not all been completed before hand-in.`,
                resolution: "offline",
                actionId: action.id,
                questId: change.questId,
                blocksForecast: true,
              });
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
                {
                  code: "reward-unresolved",
                  domain: "reward",
                  message: `${change.questId}: reward at the next hand-in is unresolved; later levels cannot be predicted.`,
                  resolution: "offline-or-in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                },
                true,
              );
            } else {
              if (reward.basis === "base-estimate") {
                summary.estimatedQuestXp += reward.xp;
                if (reward.xp > 0)
                  markIssue({
                    code: "reward-historical-estimate",
                    domain: "reward",
                    message: `${change.questId}: the reward uses a historical estimate instead of published Forever XP evidence.`,
                    resolution: "offline-or-in-game",
                    actionId: action.id,
                    questId: change.questId,
                    blocksForecast: false,
                  });
              } else summary.referenceQuestXp += reward.xp;
              if (ledger.total !== null) ledger.total += reward.xp;
            }
            ledger.paid.add(change.questId);
            if (!ledger.blocked.has(change.questId))
              ledger.states[String(change.questId)] = "rewarded";
            if (ledger.halt) break;
          } finally {
            summary.steps.push({
              actionId: action.id,
              questId: change.questId,
              phase: change.state,
              objectiveIndex: change.objectiveIndex,
              title: change.title,
              before,
              after: ledger.halt || ledger.unknown.size ? null : position(ledger.total),
              questXp: summary.referenceQuestXp + summary.estimatedQuestXp - questXpBefore,
              combatXp: summary.combatXp - combatXpBefore,
              minimumLevel: minimum,
              shortfallXp:
                change.state === "accepted" && minimum !== null
                  ? Math.max(0, cumulative({ level: minimum, currentXp: 0 }) - cumulative(before))
                  : 0,
              status: ledger.unknown.size ? "unknown" : ledger.halt ? "blocked" : "projected",
            });
          }
        }
      }
    }
    const members = ledgers.map((ledger, player): CampaignXpMemberForecast => {
      const {
        start,
        rewards,
        steps,
        bundleRewards,
        eligibilityIssues,
        evidenceIssues,
        issues,
        validationResolutions,
        inheritedIssueCount,
        inheritedEvidence,
        checkpoints,
        referenceQuestXp,
        estimatedQuestXp,
        combatXp,
        estimatedCombatXp,
        outdoorCombatXp,
        dungeonCombatXp,
        combatRows,
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
        estimatedCombatXp,
        outdoorCombatXp,
        dungeonCombatXp,
        combatRows,
        rewards,
        steps,
        bundleRewards,
        unknownQuestIds: [...ledger.unknown],
        eligibilityIssues,
        evidenceIssues: [...new Set(evidenceIssues)],
        issues: [
          ...new Map(
            issues.map((issue) => [
              `${issue.code}:${issue.actionId ?? ""}:${issue.questId ?? ""}:${issue.message}`,
              issue,
            ]),
          ).values(),
        ],
        inheritedIssueCount,
        validationResolutions,
        inheritedEvidence,
        evidence: summarizeCampaignEvidence([...ledger.issues.values()]),
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
    return { sectionId: section.id, members, skippedOptionalActionIds };
  });
}
