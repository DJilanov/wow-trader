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
import type { CampaignGrindEvidence } from "./grind-evidence.js";
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
import { combatObjectiveKey } from "./combat-model.js";
import { createQuestValidationCertificateResolver } from "./quest-validation-certificates.js";
import { CAMPAIGN_ADDON_COMPILER_REVISION } from "./campaign-addon.js";
import type { CampaignXpEvent } from "./campaign-xp-event.js";
import type { LootScenario } from "./quest-loot.js";
import { combatActivityPhase } from "./campaign-combat-phase.js";
import { forecastSharedPartyCombat } from "./campaign-shared-party-combat.js";
import { campaignMemberReferences } from "./campaign-member-references.js";
import { campaignSourceChecks } from "./campaign-source-conditions.js";
import {
  evaluateCampaignSourceChecks,
  type CampaignSourceSkip,
  type CampaignSourceDecision,
} from "./campaign-source-condition-state.js";
import { QUEST_LOG_CAPACITY, QuestLogLedger, type QuestLogSlotKey } from "./quest-log.js";
import { CampaignItemLedger, indexCampaignItems } from "./campaign-item-ledger.js";
import {
  campaignItemsForMember,
  refreshCampaignItemReadiness,
} from "./campaign-item-reports.js";
import { campaignItemProgressEvent } from "./campaign-item-progress.js";
import { campaignMaterialTargetNeeded, forecastCampaignMaterialCombat } from "./campaign-material-combat.js";
import { campaignXpBoundsConserved, campaignXpBoundsTransition, resolveBoundedQuestReward, type CampaignXpBounds } from "./campaign-xp-bounds.js";
import {
  GUARANTEED_DUNGEON_IDS,
  dungeonBundleSlotKey,
  type DungeonBundle,
} from "./dungeon-bundle-model.js";
export const CAMPAIGN_XP_REVISION = "quest-funded-real-pickup-timing-20261102-v87";

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
  readonly maximumXp?: number;
  readonly basis: ReturnType<typeof resolveQuestReward>["basis"];
  readonly source: string;
}
export interface CampaignXpMemberForecast {
  readonly sourceSkips?: readonly CampaignSourceSkip[];
  readonly player: number;
  readonly start: XpPosition | null;
  readonly endpoint: XpPosition | null;
  readonly knownEndpoint: XpPosition | null;
  readonly xpBounds?: {
    readonly kind: "conservative-box";
    readonly start: CampaignXpBounds | null;
    readonly finish: CampaignXpBounds | null;
  };
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
  readonly questLog: {
    readonly capacity: typeof QUEST_LOG_CAPACITY;
    readonly used: number;
    readonly peak: number;
  };
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
  /** Explicit hypothetical intervals for internal continuations; never persisted as observations. */
  readonly initialBounds?: readonly (CampaignXpBounds | null)[];
  /** Forecast-only personal branches; actual quest reporting remains leader-only. Players are 1-based. */
  readonly personalActionPlayers?: Readonly<Record<string, number>>;
  readonly fromActionId?: string;
  readonly throughActionId?: string;
  readonly combat?: readonly CampaignCombatScenario[];
  readonly groupCombat?: readonly CampaignGroupCombatScenario[];
  readonly facts?: readonly QuestRewardFact[];
  /** Compatibility with earlier callers; checkpoints never contribute XP. */
  readonly noAssumedGrinding?: true;
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
  if (options.initialBounds && options.initialBounds.length !== progress.members.length)
    throw new Error("Initial XP bounds must match all party members.");
  if (options.initialBounds && Array.from(options.initialBounds).some((bounds) => bounds === undefined))
    throw new Error("Initial XP bounds cannot contain missing members.");
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
  const memberReferences = progress.members.map((_member, player) =>
    campaignMemberReferences(plan, player + 1, options.personalActionPlayers),
  );
  const itemIndex = indexCampaignItems(plan.itemRequirements ?? []);
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
  const materialWorkByAction = new Map(plan.combat?.materialWork?.map((work) => [work.actionId, work]) ?? []);
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
  const memberObjectiveKeys = memberReferences.map((references) => new Map(
    [...references.objectiveIndexes].map(([id, indices]) => [
      id, new Set([...indices].map((index) => `campaign-objective-${id}-${index}`)),
    ]),
  ));
  const ledgers = progress.members.map((member, player) => {
    const references = memberReferences[player]!;
    const objectiveIndexes = references.objectiveIndexes;
    const questLog = new QuestLogLedger(member.questStates);
    const states = { ...member.questStates },
      confirmations = { ...member.confirmations };
    const items = campaignItemsForMember(itemIndex, member, plan.targetBuild);
    refreshCampaignItemReadiness(itemIndex, items, states, confirmations, objectiveIndexes);
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
    const logIssue: CampaignEvidenceIssue | null =
      questLog.used > QUEST_LOG_CAPACITY
        ? {
            code: "quest-log-full",
            domain: "progress",
            message: `The recorded quest log contains ${questLog.used} active quests; the limit is ${QUEST_LOG_CAPACITY}. Correct the carried quest states before continuing.`,
            resolution: "in-game",
            actionId: actions[from]?.id ?? null,
            questId: null,
            blocksForecast: true,
          }
        : null;
    const initialIssues = [progressIssue, logIssue].filter(
      (issue): issue is CampaignEvidenceIssue => issue !== null,
    );
    const initialTotal = invalid || member.level === null || member.currentXp === null || member.xpNeedsUpdate
      ? null : cumulative({ level: member.level, currentXp: member.currentXp });
    const initialBounds = options.initialBounds?.[player];
    if (initialBounds) {
      campaignXpBoundsConserved({ before: initialBounds, after: initialBounds, minimumXp: 0, maximumXp: 0 });
      if (initialTotal === null || cumulative(initialBounds.minimum) !== initialTotal)
        throw new Error("Initial XP bounds do not match the continuation's minimum bar.");
    }
    return {
      total: initialTotal,
      maximumTotal: initialBounds ? cumulative(initialBounds.maximum) : options.initialBounds && initialBounds === null ? null : initialTotal,
      states,
      items,
      freshInventoryReference: from === 0 && member.level === 1 && member.currentXp === 0 && !member.xpNeedsUpdate &&
        !member.itemHoldings && Object.keys(member.questStates).length === 0 && Object.keys(member.confirmations).length === 0,
      materialEncounters: new Set<number>(),
      questLog,
      confirmations,
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
      bundleSkipped: new Set(
        Object.entries(member.bundleSlotStates ?? {})
          .filter(([, state]) => state === "skipped")
          .map(([key]) => key),
      ),
      incomplete: logIssue !== null,
      unknown: new Set<number>(),
      blocked: new Set<number>(),
      halt: (logIssue
        ? { actionId: logIssue.actionId, reason: logIssue.message, data: true }
        : null) as { actionId: string | null; reason: string; data: boolean } | null,
      issue: initialIssues[0]?.message ?? null,
      issues: new Map(initialIssues.map((issue) => [campaignEvidenceIssueKey(issue), issue])),
      combat: createCampaignCombatState(references.combat, member),
    };
  });
  const selected = new Set(actions.slice(from, through + 1).map((a) => a.id));
  const bundleLogKeys = new Map<string, QuestLogSlotKey>(
    GUARANTEED_DUNGEON_IDS.flatMap((id) => {
      const bundle = getDungeonBundle(id, "alliance", progress.guaranteedBundles)!;
      return bundle.slots.map((slot) => {
        const key = dungeonBundleSlotKey(bundle, slot.index);
        return [key, slot.questId === null ? `bundle:${key}` : `quest:${slot.questId}`] as const;
      });
    }),
  );
  const pendingBundleReservations = (bundle: DungeonBundle, player: number): QuestLogSlotKey[] => {
    const ledger = ledgers[player]!;
    return bundle.included
      ? bundle.slots.flatMap((slot): QuestLogSlotKey[] => {
          const key = dungeonBundleSlotKey(bundle, slot.index);
          return !slot.selected ||
            ledger.bundlePaid.has(key) ||
            ledger.bundleSkipped.has(key) ||
            (slot.questId !== null && ledger.paid.has(slot.questId))
            ? []
            : [bundleLogKeys.get(key)!];
        })
      : [];
  };
  const sections = campaignSections(plan, progress);
  return sections.map((section, sectionIndex): CampaignXpSectionForecast => {
    const entries = actions.filter((a) => selected.has(a.id) && section.actionIds.includes(a.id));
    const targetLevel = campaignSectionTarget(sections, sectionIndex, progress, facts).level;
    const skippedOptionalActionIds: string[] = [];
    const summaries = ledgers.map((ledger) => ({
      sourceSkips: [] as CampaignSourceSkip[],
      start: ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total),
      maximumStart: ledger.maximumTotal === null || ledger.unknown.size > 0 ? null : position(ledger.maximumTotal),
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
        const references = memberReferences[player]!;
        const objectiveIndexes = references.objectiveIndexes;
        const resetItems =
          Object.entries(anchor.questStates).some(([id, state]) => state !== ledger.states[id]) ||
          Object.entries(anchor.confirmations).some(([key, value]) => value !== ledger.confirmations[key]);
        const questStates = { ...ledger.states, ...anchor.questStates };
        const confirmations = { ...ledger.confirmations, ...anchor.confirmations };
        const bundleSlotStates = {
          ...Object.fromEntries([...ledger.bundleSkipped].map((key) => [key, "skipped" as const])),
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
        ledger.maximumTotal = ledger.total;
        ledger.freshInventoryReference = false;
        ledger.materialEncounters.clear();
        ledger.states = questStates;
        ledger.questLog.sync(questStates);
        ledger.confirmations = confirmations;
        if (resetItems) {
          ledger.items = new CampaignItemLedger(itemIndex, anchor.questStates);
          refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes);
        }
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
        ledger.bundleSkipped = new Set(
          Object.entries(bundleSlotStates)
            .filter(([, state]) => state === "skipped")
            .map(([key]) => key),
        );
        for (const key of [...ledger.bundlePaid, ...ledger.bundleSkipped]) {
          const reservation = bundleLogKeys.get(key);
          if (reservation) ledger.questLog.releaseReservation(reservation);
        }
        ledger.unknown.clear();
        ledger.blocked.clear();
        ledger.issues.clear();
        ledger.halt = null;
        ledger.issue = null;
        ledger.incomplete = false;
        ledger.combat = createCampaignCombatState(references.combat, member);
        if (ledger.questLog.used > QUEST_LOG_CAPACITY) {
          const issue: CampaignEvidenceIssue = {
            code: "quest-log-full",
            domain: "progress",
            message: `Player ${player + 1}'s recorded quest log contains ${ledger.questLog.used} active quests; the limit is ${QUEST_LOG_CAPACITY}. Correct the carried quest states before continuing.`,
            resolution: "in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: true,
          };
          ledger.halt = { actionId: action.id, reason: issue.message, data: true };
          ledger.issue = issue.message;
          ledger.incomplete = true;
          ledger.issues.set(campaignEvidenceIssueKey(issue), issue);
        }
        // This bar supersedes earlier estimates, not earlier actual quest reports. Only
        // work after its fixed step is added; moving the reader cursor cannot move it.
        Object.assign(summaries[player]!, {
          sourceSkips: [],
          start: position(ledger.total),
          maximumStart: position(ledger.total),
          rewards: [],
          steps: [],
          bundleRewards: [],
          eligibilityIssues: [],
          evidenceIssues: [],
          issues: [],
          validationResolutions: [],
          inheritedIssueCount: ledger.issues.size,
          inheritedEvidence: summarizeCampaignEvidence([...ledger.issues.values()]),
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
      const sourceChecks =
        action.questChanges.length || action.itemCollections?.length ? campaignSourceChecks(action) : [];
      const sourceDecisions = ledgers.map((ledger): CampaignSourceDecision =>
        sourceChecks.length
          ? evaluateCampaignSourceChecks(sourceChecks, {
              questStates: ledger.states,
              itemLowerBounds: ledger.items.lowerBounds,
            })
          : "execute",
      );
      const actionQuestIds = [
        ...new Set([
          ...action.questChanges.map((change) => change.questId),
          ...(action.requiredQuestIds ?? []),
        ]),
      ];
      const firstLedger = ledgers[0]!;
      const partyIdentities = progress.members.map(
        (member, index) =>
          `${index === 0 ? plan.race : member.raceId}:${index === 0 ? (plan.leaderClass ?? member.classSlug) : member.classSlug}`,
      );
      const synchronizedParty =
        !action.leaderOnly &&
        sourceDecisions.every((decision) => decision === "execute") &&
        firstLedger.total !== null &&
        partyIdentities.every((identity) => identity === partyIdentities[0]) &&
        ledgers.every(
          (ledger) =>
            ledger.total === firstLedger.total &&
            ledger.halt === null &&
            ledger.unknown.size === 0 &&
            actionQuestIds.every(
              (questId) => ledger.states[String(questId)] === firstLedger.states[String(questId)],
            ) &&
            JSON.stringify(ledger.confirmations) === JSON.stringify(firstLedger.confirmations),
        );
      const activities = automaticCombat.get(action.id) ?? [];
      const objectiveKeysForAction = [
        ...new Set(activities.flatMap((activity) => activity.objectives.map(combatObjectiveKey))),
      ];
      const pathKeys = activities.flatMap((activity) =>
        activity.pathId
          ? (activity.profile?.packs ?? []).map((pack) => `${activity.pathId}:${pack.npcId}`)
          : [],
      );
      const lastObjective = action.questChanges
        .map((change) => change.state)
        .lastIndexOf("objectives-complete");
      const alignedParty =
        !action.leaderOnly &&
        sourceDecisions.every((decision) => decision === "execute") &&
        lastObjective >= 0 &&
        action.questChanges
          .slice(0, lastObjective)
          .every((change) => change.state !== "rewarded") &&
        ledgers.every(
          (ledger) =>
            ledger.total !== null &&
            ledger.halt === null &&
            ledger.unknown.size === 0 &&
            actionQuestIds.every(
              (questId) => ledger.states[String(questId)] === firstLedger.states[String(questId)],
            ) &&
            objectiveKeysForAction.every(
              (key) => ledger.combat.counters.get(key) === firstLedger.combat.counters.get(key),
            ) &&
            pathKeys.every(
              (key) => ledger.combat.pathKills.get(key) === firstLedger.combat.pathKills.get(key),
            ),
        );
      const initialPartyBars = alignedParty
        ? ledgers.map((ledger) => position(ledger.total!))
        : null;
      const partyClocks = ledgers.map((): readonly XpPosition[] | null => initialPartyBars);
      const maximumPartyKnown = ledgers.every((ledger) => ledger.total !== null && ledger.maximumTotal !== null);
      const initialPartyBounds = alignedParty && maximumPartyKnown
        ? ledgers.map((ledger): CampaignXpBounds => ({ minimum: position(ledger.total!), maximum: position(ledger.maximumTotal!) }))
        : null;
      const partyBoundsClocks = ledgers.map((): readonly CampaignXpBounds[] | null => initialPartyBounds);
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
      const maximumModeled: PremadeProgress = { ...modeled, members: modeled.members.map((member, player) => {
        const maximum = ledgers[player]!.maximumTotal;
        return maximum === null ? { ...member, level: null, currentXp: null, xpNeedsUpdate: true } : { ...member, ...position(maximum) };
      }) };
      const optionalBoundsAmbiguous = action.kind !== "xp-check" && campaignOptionalXpReady(plan,
        action.leaderOnly ? { ...maximumModeled, members: [maximumModeled.members[personalPlayer]!] } : maximumModeled, action);
      const dungeonCombatAllowed = (questId: number): boolean => {
        const legKind = plan.legs.find((leg) => leg.id === action.legId)?.kind;
        return (
          legKind === "dungeon" ||
          Boolean(
            action.dungeonFinishOnly &&
            legKind === "finish" &&
            action.location?.insideDungeon &&
            plan.finishCircuitReview?.wingIds.includes(action.location.insideDungeon) &&
            plan.finishCircuitReview.plannedQuestIds.includes(questId),
          )
        );
      };
      const work = materialWorkByAction.get(action.id);
      const materialPlayers = action.leaderOnly ? [personalPlayer] : ledgers.map((_ledger, player) => player);
      const materialCombat = work && plan.combat && !combat.has(action.id) && !unknownCombat.has(action.id) &&
        !optionalBoundsAmbiguous && materialPlayers.every((player) => sourceDecisions[player] === "execute" && ledgers[player]!.total !== null && ledgers[player]!.maximumTotal !== null &&
          !ledgers[player]!.halt && ledgers[player]!.unknown.size === 0)
        ? forecastCampaignMaterialCombat({ action, work, combat: plan.combat, participants: materialPlayers.map((player) => {
            const ledger = ledgers[player]!;
            return { position: position(ledger.total!), maximumPosition: position(ledger.maximumTotal!), questStates: ledger.states, confirmations: ledger.confirmations,
              minimumItems: ledger.items.lowerBounds, freshInventoryReference: ledger.freshInventoryReference,
              encounteredNpcIds: ledger.materialEncounters, state: ledger.combat, combat: memberReferences[player]!.combat! };
          }), lootScenario: options.lootScenario ?? "expected", xpMultiplier: options.outdoorXpMultiplier ?? progress.combatPlanning?.outdoorXpMultiplier ?? 1 })
        : null;
      if (materialCombat?.status === "planned" && !action.leaderOnly)
        for (let player = 0; player < ledgers.length; player++) {
          partyClocks[player] = materialCombat.forecasts.map((forecast) => forecast.exit);
          partyBoundsClocks[player] = materialCombat.forecasts.map((forecast) => ({ minimum: forecast.exit, maximum: forecast.maximumExit ?? forecast.exit }));
        }
      const sharedPartyCombat =
        materialCombat?.status !== "planned" &&
        (!alignedParty || maximumPartyKnown) &&
        !optionalBoundsAmbiguous &&
        !action.leaderOnly &&
        action.kind === "quests" &&
        action.questChanges.length > 0 &&
        action.questChanges.every((change) => change.state === "objectives-complete") &&
        plan.combat &&
        !combat.has(action.id) &&
        !unknownCombat.has(action.id) &&
        activities.every(
          (activity) =>
            activity.environment !== "dungeon" ||
            activity.objectives.every((objective) => dungeonCombatAllowed(objective.questId)),
        ) &&
        ledgers.every(
          (ledger) => ledger.total !== null && ledger.maximumTotal !== null && ledger.halt === null && ledger.unknown.size === 0,
        )
          ? forecastSharedPartyCombat({
              action,
              activities,
              combat: plan.combat,
              participants: ledgers.map((ledger, player) => {
                const references = memberReferences[player]!.sharedCombatIndex();
                return {
                  ...(references ? { references } : {}),
                  actionRequired: sourceDecisions[player] === "execute",
                  position: position(ledger.total!),
                  maximumPosition: position(ledger.maximumTotal!),
                  questStates: ledger.states,
                  state: ledger.combat,
                };
              }),
              xpMultiplier:
                options.outdoorXpMultiplier ?? progress.combatPlanning?.outdoorXpMultiplier ?? 1,
            })
          : null;
      const checkpointStop =
        action.kind === "checkpoint"
          ? PREMADE_STOPS.find((entry) => entry.id === action.targetStopId)
          : undefined;
      const checkpointMinimum = checkpointStop
        ? premadeEntryLevel(checkpointStop, progress, facts)
        : action.targetLevel;
      const checkpointBundle =
        checkpointStop?.dataStatus === "guaranteed-bundle"
          ? getDungeonBundle(checkpointStop.id, "alliance", progress.guaranteedBundles)
          : null;
      const checkpointReservations =
        action.kind === "checkpoint"
          ? ledgers.map((_ledger, player) =>
              checkpointBundle ? pendingBundleReservations(checkpointBundle, player) : [],
            )
          : [];
      // Snapshot all readiness before one member's halt or reservation changes local state.
      const checkpointReady =
        action.kind === "checkpoint"
          ? ledgers.map(
              (ledger, player) =>
                ledger.total !== null &&
                ledger.halt === null &&
                ledger.unknown.size === 0 &&
                checkpointMinimum !== null &&
                ledger.total >= cumulative({ level: checkpointMinimum, currentXp: 0 }) &&
                (action.requiredQuestIds ?? []).every((id) => ledger.states[String(id)] === "rewarded") &&
                checkpointStop?.dataStatus !== "missing-quest-data" &&
                ledger.questLog.canReserve(checkpointReservations[player]!),
            )
          : [];
      const waitingPlayers = checkpointReady.flatMap((ready, player) => (ready ? [] : [player + 1]));
      // Personal branches run independently. Shared work cannot continue after one
      // participant stops; snapshot before this action changes anyone's ledger.
      const unavailablePartyPlayers = action.leaderOnly ? [] : ledgers.flatMap((ledger, player) =>
        ledger.total === null || ledger.halt || ledger.unknown.size
          ? [{ player: player + 1, reason: ledger.halt?.reason ?? "Level and XP are not known." }]
          : [],
      );
      for (const [player, ledger] of ledgers.entries()) {
        const { combat: memberCombat, objectiveIndexes } = memberReferences[player]!;
        const objectiveKeys = memberObjectiveKeys[player]!;
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
        const halt = (issue: CampaignEvidenceIssue, data = false): void => {
          ledger.halt = { actionId: action.id, reason: issue.message, data };
          markIssue(issue, data ? "evidence" : "eligibility");
        };
        if (optionalBoundsAmbiguous) {
          halt({ code: "xp-range-ambiguous", domain: "progress", actionId: action.id, questId: null,
            message: `${action.id}: possible XP outcomes disagree on whether this optional source work is still required.`,
            resolution: "offline-or-in-game", blocksForecast: true }, true);
          continue;
        }
        if (unavailablePartyPlayers.length) {
          halt({
            code: "checkpoint-not-ready",
            domain: "progress",
            message: `Wait for ${unavailablePartyPlayers.map((member) => `Player ${member.player}`).join(", ")} before continuing together. ${unavailablePartyPlayers.map((member) => `Player ${member.player}: ${member.reason}`).join(" ")}`,
            resolution: "in-game",
            actionId: action.id,
            questId: null,
            blocksForecast: true,
          });
          continue;
        }
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
        if (
          action.questChanges.length &&
          !action.questChanges.some(needed) &&
          !action.itemCollections?.some((target) => campaignMaterialTargetNeeded(target, ledger.states, ledger.confirmations, ledger.items.lowerBounds)) &&
          !sharedPartyCombat?.[player]?.rows.length
        )
          continue;
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
        const sourceDecision = sourceDecisions[player]!;
        const sourceIssue: CampaignEvidenceIssue | null =
          sourceDecision === "unknown" && !action.source?.conditions?.optional
            ? {
                code: "source-condition-unobserved",
                domain: "route",
                message: `${action.id}: a required source condition needs unrecorded resources; no quest completion or reward is assumed.`,
                resolution: "offline-or-in-game",
                actionId: action.id,
                questId: null,
                blocksForecast: true,
              }
            : null;
        if (sourceDecision !== "execute" && (action.questChanges.length || action.itemCollections?.length)) {
          summary.sourceSkips.push({ actionId: action.id, decision: sourceDecision });
          if (!sharedPartyCombat?.[player]?.rows.length) {
            if (sourceIssue) halt(sourceIssue, true);
            continue;
          }
        }
        let collectedItems = false;
        const materialForecast = materialCombat?.status === "planned" ? materialCombat.forecasts[materialPlayers.indexOf(player)] : undefined;
        if (materialForecast) {
          const before = position(ledger.total);
          const maximumBefore = ledger.maximumTotal === null ? null : position(ledger.maximumTotal);
          ledger.total = cumulative(materialForecast.exit);
          ledger.maximumTotal = materialForecast.maximumExit ? cumulative(materialForecast.maximumExit) : ledger.maximumTotal === null ? null : ledger.maximumTotal + (materialForecast.maximumXp ?? materialForecast.xp);
          ledger.combat = materialForecast.state;
          summary.combatXp += materialForecast.xp;
          summary.outdoorCombatXp += materialForecast.xp;
          summary.combatRows.push(...materialForecast.rows);
          for (const row of materialForecast.rows) ledger.materialEncounters.add(row.npcId);
          const xpBounds = campaignXpBoundsTransition({ before, maximumBefore, after: position(ledger.total), maximumAfter: ledger.maximumTotal === null ? null : position(ledger.maximumTotal), maximumQuestXp: 0, maximumCombatXp: materialForecast.maximumXp ?? materialForecast.xp, minimumXp: materialForecast.xp });
          summary.steps.push({ actionId: action.id, title: action.title, before, after: position(ledger.total), ...(xpBounds ? { xpBounds } : {}),
            questId: null, phase: "combat", objectiveIndex: null, questXp: 0, combatXp: materialForecast.xp,
            minimumLevel: null, shortfallXp: 0, status: "projected" });
        }
        for (const target of sourceDecision === "execute" ? action.itemCollections ?? [] : []) {
          if (ledger.confirmations[target.confirmationKey]) continue;
          const before = ledger.items.lowerBounds.get(target.itemId) ?? 0;
          if (ledger.items.collect(target, ledger.states)) {
            collectedItems = true;
            refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes);
            if (before < target.quantity)
              markIssue({
                code: "item-acquisition-unqualified",
                domain: "route",
                message: materialForecast
                  ? `${action.id}: gathering combat uses a conditional fresh-stock reference workload, including overlapping required kills once. Actual stock, drop rates and payouts remain unqualified.`
                  : `${action.id}: the listed item target can fund its hand-in after collection, but its acquisition and combat XP are unqualified; no kills or bonus XP are assumed.${materialCombat?.status === "unknown" ? ` ${materialCombat.reason}` : ""}`,
                resolution: "offline-or-in-game",
                actionId: action.id,
                questId: target.questId,
                blocksForecast: true,
              });
          }
        }
        if (collectedItems)
          summary.steps.push(campaignItemProgressEvent(
            action, position(ledger.total), itemIndex, ledger.items, ledger.states, ledger.confirmations,
          ));
        if (collectedItems && !materialForecast)
          for (const target of work?.targets ?? [])
            for (const npcId of target.possibleDropNpcIds) ledger.materialEncounters.add(npcId);
        if (action.kind === "checkpoint") {
          const entryStop = checkpointStop;
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
          const minimum = checkpointMinimum;
          const current = position(ledger.total);
          const missingXp =
            minimum === null
              ? null
              : Math.max(0, cumulative({ level: minimum, currentXp: 0 }) - ledger.total);
          const missingQuests =
            action.requiredQuestIds?.filter((id) => ledger.states[String(id)] !== "rewarded") ?? [];
          const planningOnly = entryStop?.dataStatus === "guaranteed-bundle";
          const reservationKeys = checkpointReservations[player]!;
          const capacityReady = ledger.questLog.canReserve(reservationKeys);
          const ready =
            checkpointReady[player]! && (action.leaderOnly || waitingPlayers.length === 0);
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
            const logFull =
              !capacityReady && missingXp === 0 && missingQuests.length === 0 && !missingAccessData;
            halt({
              code: logFull
                ? "quest-log-full"
                : missingAccessData
                  ? "dungeon-access-unverified"
                  : "checkpoint-not-ready",
              domain: logFull || missingAccessData ? "route" : "progress",
              message: logFull
                ? `Player ${player + 1} needs room for the selected dungeon quests before entry. The quest log is limited to ${QUEST_LOG_CAPACITY}; hand in carried quests first.`
                : missingAccessData
                  ? `${entryStop.name}: the quest/access bundle is unverified.`
                  : checkpointReady[player] && !action.leaderOnly
                    ? `${entryStop?.name ?? action.title}: wait for ${waitingPlayers.map((member) => `Player ${member}`).join(", ")}. The whole party must be ready before continuing.`
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
          ledger.questLog.reserve(reservationKeys);
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
          if (ledger.maximumTotal === null) {
            halt({ code: "reward-unresolved", domain: "reward", actionId: action.id, questId: null,
              message: `${action.id}: combat left the XP range unresolved; dungeon hand-in rewards cannot yet be bounded.`,
              resolution: "offline-or-in-game", blocksForecast: true }, true);
            continue;
          }
          if (!ledger.questLog.reserve(pendingBundleReservations(bundle, player))) {
            halt({
              code: "quest-log-full",
              domain: "route",
              message: `Player ${player + 1} needs room for the selected dungeon quests. The quest log is limited to ${QUEST_LOG_CAPACITY}; hand in carried quests before taking this bundle.`,
              resolution: "in-game",
              actionId: action.id,
              questId: null,
              blocksForecast: true,
            });
            continue;
          }
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
                ...Object.fromEntries(
                  [...ledger.bundleSkipped].map((key) => [key, "skipped" as const]),
                ),
                ...Object.fromEntries(
                  [...ledger.bundlePaid].map((key) => [key, "rewarded" as const]),
                ),
              },
            },
            (questId, level) => resolveQuestReward(questId, level, facts),
            ledger.maximumTotal === null ? undefined : position(ledger.maximumTotal),
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
          ledger.maximumTotal = forecast.maximumEndpoint ? cumulative(forecast.maximumEndpoint) : null;
          summary.referenceQuestXp += forecast.referenceXp;
          summary.estimatedQuestXp += forecast.estimatedXp;
          for (const row of forecast.rows) {
            if (row.state !== "selected") continue;
            ledger.bundlePaid.add(row.slotKey);
            const reservation = bundleLogKeys.get(row.slotKey);
            if (reservation) ledger.questLog.releaseReservation(reservation);
            if (row.questId !== null) {
              ledger.questLog.handIn(row.questId);
              ledger.paid.add(row.questId);
              ledger.states[String(row.questId)] = "rewarded";
              const consumed = ledger.items.consume(row.questId);
              refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes, consumed);
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
          const missingXp = Math.max(0, cumulative(xpTarget) - ledger.total);
          summary.checkpoints.push({
            actionId: action.id,
            targetLevel: xpTarget.level,
            position: position(ledger.total),
            missingXp,
            ready: missingXp === 0,
            planningOnly: false,
          });
          continue;
        }
        const shared = sharedPartyCombat?.[player];
        if (shared) {
          const before = position(ledger.total);
          const maximumBefore = ledger.maximumTotal === null ? null : position(ledger.maximumTotal);
          ledger.total = shared.exitBounds ? cumulative(shared.exitBounds.minimum) : ledger.total + shared.xp;
          ledger.maximumTotal = shared.exitBounds ? cumulative(shared.exitBounds.maximum) : ledger.maximumTotal === null ? null : ledger.maximumTotal + (shared.maximumXp ?? shared.xp);
          ledger.combat = shared.state;
          summary.combatXp += shared.xp;
          summary.outdoorCombatXp += shared.rows
            .filter((row) => row.environment === "outdoor")
            .reduce((sum, row) => sum + (row.xp ?? 0), 0);
          summary.dungeonCombatXp += shared.rows
            .filter((row) => row.environment === "dungeon")
            .reduce((sum, row) => sum + (row.xp ?? 0), 0);
          summary.combatRows.push(...shared.rows);
          for (const row of shared.rows) if (row.kills > 0) ledger.materialEncounters.add(row.npcId);
          for (const message of shared.issues)
            markIssue({
              code: "combat-profile-unverified",
              domain: "combat",
              message,
              resolution: "offline-or-in-game",
              actionId: action.id,
              questId: null,
              blocksForecast: false,
            });
          const xpBounds = campaignXpBoundsTransition({ before, maximumBefore, after: position(ledger.total), maximumAfter: ledger.maximumTotal === null ? null : position(ledger.maximumTotal), maximumQuestXp: 0, maximumCombatXp: shared.maximumXp ?? shared.xp, minimumXp: shared.xp });
          if (shared.rows.length)
            summary.steps.push({
              ...(xpBounds ? { xpBounds } : {}),
              actionId: action.id,
              questId: null,
              phase: "combat",
              objectiveIndex: null,
              title: "Required group combat",
              before,
              after: position(ledger.total),
              questXp: 0,
              combatXp: shared.xp,
              minimumLevel: null,
              shortfallXp: 0,
              status: "projected",
            });
        }
        const kills = combat.get(action.id)?.[player] ?? 0;
        if (combat.has(action.id) || unknownCombat.has(action.id))
          ledger.freshInventoryReference = false;
        if (sourceDecision !== "execute" && action.questChanges.length) {
          if (sourceIssue) halt(sourceIssue, true);
          continue;
        }
        if (unknownCombat.has(action.id)) {
          ledger.maximumTotal = null;
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
        if (ledger.maximumTotal !== null) ledger.maximumTotal += kills;
        for (const change of action.questChanges) {
          if (!needed(change)) continue;
          const level =
            ledger.total === null || ledger.unknown.size > 0 ? null : position(ledger.total).level;
          const eligibility = questEligibility(change.questId, facts);
          const minimum = eligibility.minimumLevel;
          const before = position(ledger.total);
          const maximumBefore = ledger.maximumTotal === null ? null : position(ledger.maximumTotal);
          const rewardsBefore = rewards.length, combatRowsBefore = summary.combatRows.length;
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
              if (action.requiredQuestIds?.some((id) => ledger.states[String(id)] !== "rewarded")) {
                halt({
                  code: "source-prerequisite-missing",
                  domain: "route",
                  message: `${action.id}: required source-chain hand-ins remain missing (${action.requiredQuestIds.join(", ")}).`,
                  resolution: "offline",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                });
                break;
              }
              if (minimum && (level === null || level < minimum)) {
                const uncertain = ledger.maximumTotal !== null && position(ledger.maximumTotal).level >= minimum;
                halt({
                  code: uncertain ? "xp-range-ambiguous" : "checkpoint-not-ready",
                  domain: "progress",
                  message: uncertain ? `${change.questId}: possible XP outcomes cross pickup level ${minimum}; eligibility is unresolved.` : `${change.questId}: pickup requires level ${minimum}; forecast is below the gate.`,
                  resolution: "in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                }, uncertain);
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
              if (!ledger.questLog.accept(change.questId)) {
                halt({
                  code: "quest-log-full",
                  domain: "route",
                  message: `Player ${player + 1}'s quest log is full (${ledger.questLog.used}/${QUEST_LOG_CAPACITY}). Hand in an existing quest before accepting ${change.title}.`,
                  resolution: "offline-or-in-game",
                  actionId: action.id,
                  questId: change.questId,
                  blocksForecast: true,
                });
                break;
              }
              ledger.states[String(change.questId)] = "accepted";
              refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes);
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
              if (
                memberCombat &&
                !sharedPartyCombat &&
                !combat.has(action.id) &&
                !unknownCombat.has(action.id)
              )
                for (const activity of automaticCombat.get(action.id) ?? []) {
                  const phase = combatActivityPhase(activity, action.questChanges, change);
                  const objectives = phase.objectives;
                  if (!objectives.length) continue;
                  for (const objective of objectives.filter((objective) => objective.quotaConflict))
                    markIssue({
                      code: "combat-quota-conflict",
                      domain: "combat",
                      message: `${objective.questId}:${objective.objectiveIndex}: ${objective.reason ?? "Required kill count references conflict."}`,
                      resolution: "offline",
                      actionId: action.id,
                      questId: objective.questId,
                      blocksForecast: true,
                    });
                  if (activity.environment === "dungeon" && !dungeonCombatAllowed(change.questId)) {
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
                  const result = applyCampaignCombat({
                    activity: phase,
                    combat: memberCombat,
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
                    synchronizedParty,
                    partyBounds: action.leaderOnly
                      ? ledger.maximumTotal === null ? null : [{ minimum: position(ledger.total), maximum: position(ledger.maximumTotal) }]
                      : partyBoundsClocks[player]!,
                    ...(!action.leaderOnly && !synchronizedParty
                      ? { partyPositions: partyClocks[player]! }
                      : {}),
                  });
                  for (const objective of phase.objectives)
                    if (objective.credit !== "non-combat")
                      for (const npcId of objective.npcIds) ledger.materialEncounters.add(npcId);
                  if (result.partyExit !== undefined) partyClocks[player] = result.partyExit;
                  if (result.partyBounds !== undefined) partyBoundsClocks[player] = result.partyBounds;
                  ledger.total += result.xp;
                  if (ledger.maximumTotal !== null) {
                    if (result.rows.some((row) => row.maximumXp === null)) ledger.maximumTotal = null;
                    else ledger.maximumTotal += result.rows.reduce((sum, row) => sum + row.maximumXp!, 0);
                  }
                  const resultBounds = result.partyBounds?.[action.leaderOnly ? 0 : player];
                  if (resultBounds) { ledger.total = cumulative(resultBounds.minimum); ledger.maximumTotal = cumulative(resultBounds.maximum); }
                  if (result.partyBounds === null) ledger.maximumTotal = null;
                  if (result.partyBounds === null || result.rows.some((row) => row.maximumXp === null))
                    markIssue({ code: "combat-input-unknown", domain: "combat", actionId: action.id, questId: change.questId,
                      message: `${action.id}: a required physical combat stream has no supported XP enclosure.`,
                      resolution: "offline-or-in-game", blocksForecast: true });
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
              ledger.items.completeObjective(change.questId, change.objectiveIndex ?? 1);
              ledger.states[String(change.questId)] = [
                ...(objectiveKeys.get(change.questId) ?? []),
              ].every((key) => ledger.confirmations[key])
                ? "objectives-complete"
                : "accepted";
              refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes);
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
              level === null || ledger.maximumTotal === null || ledger.blocked.has(change.questId) || (minimum && level < minimum)
                ? {
                    xp: null,
                    basis: "unknown" as const,
                    source:
                      level === null
                        ? "Record fresh actual XP before forecasting."
                        : ledger.maximumTotal === null
                          ? "The possible XP range is unresolved after required combat."
                        : "The quest's pickup gate is not met in this forecast.",
                  }
                : resolveBoundedQuestReward({ minimum: position(ledger.total), maximum: position(ledger.maximumTotal) },
                    (possibleLevel) => resolveQuestReward(change.questId, possibleLevel, facts));
            rewards.push({
              actionId: action.id,
              questId: change.questId,
              title: change.title,
              handInLevel: level,
              xp: reward.xp, basis: reward.basis, source: reward.source,
              ...("maximumXp" in reward && reward.maximumXp !== null && reward.maximumXp !== reward.xp ? { maximumXp: reward.maximumXp } : {}),
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
              if (reward.exitBounds) { ledger.total = cumulative(reward.exitBounds.minimum); ledger.maximumTotal = cumulative(reward.exitBounds.maximum); }
            }
            ledger.paid.add(change.questId);
            if (!ledger.blocked.has(change.questId)) {
              ledger.questLog.handIn(change.questId);
              ledger.states[String(change.questId)] = "rewarded";
              const consumed = ledger.items.consume(change.questId);
              refreshCampaignItemReadiness(itemIndex, ledger.items, ledger.states, ledger.confirmations, objectiveIndexes, consumed);
            }
            if (ledger.halt) break;
          } finally {
            const questStateAfter = ledger.states[String(change.questId)];
            const changedRows = summary.combatRows.slice(combatRowsBefore);
            const xpBounds = campaignXpBoundsTransition({ before, maximumBefore, after: position(ledger.total), maximumAfter: ledger.maximumTotal === null ? null : position(ledger.maximumTotal),
              minimumXp: summary.referenceQuestXp + summary.estimatedQuestXp - questXpBefore + summary.combatXp - combatXpBefore,
              maximumQuestXp: rewards.slice(rewardsBefore).reduce((sum, row) => sum + (row.maximumXp ?? row.xp ?? 0), 0),
              maximumCombatXp: changedRows.some((row) => row.maximumXp === null) ? null : changedRows.reduce((sum, row) => sum + row.maximumXp!, 0) });
            summary.steps.push({
              ...(xpBounds ? { xpBounds } : {}),
              actionId: action.id,
              questId: change.questId,
              ...(questStateAfter ? { questStateAfter } : {}),
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
            if (itemIndex.byQuest.has(change.questId) && !ledger.halt && !ledger.unknown.size)
              summary.steps.push(campaignItemProgressEvent(
                action, position(ledger.total), itemIndex, ledger.items, ledger.states, ledger.confirmations,
              ));
          }
        }
      }
    }
    const members = ledgers.map((ledger, player): CampaignXpMemberForecast => {
      const {
        sourceSkips,
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
        ...(sourceSkips.length ? { sourceSkips } : {}),
        player: player + 1,
        start,
        endpoint,
        knownEndpoint: ledger.total === null ? null : position(ledger.total),
        ...(steps.some((step) => step.xpBounds !== undefined) || ledger.maximumTotal !== ledger.total || summaries[player]!.maximumStart?.level !== start?.level || summaries[player]!.maximumStart?.currentXp !== start?.currentXp
          ? { xpBounds: { kind: "conservative-box" as const,
              start: start && summaries[player]!.maximumStart ? { minimum: start, maximum: summaries[player]!.maximumStart! } : null,
              finish: ledger.total !== null && ledger.maximumTotal !== null ? { minimum: position(ledger.total), maximum: position(ledger.maximumTotal) } : null } }
          : {}),
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
        questLog: {
          capacity: QUEST_LOG_CAPACITY,
          used: ledger.questLog.used,
          peak: ledger.questLog.peak,
        },
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
