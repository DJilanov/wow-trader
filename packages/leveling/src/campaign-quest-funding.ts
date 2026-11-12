import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { isSharedFundingQuest, isGroundPickupFundingQuest } from "./quest-catalog.js";
import {
  campaignFundingBatch,
  requiresDungeonQuestVisit,
  type CampaignFundingBatch,
  type CampaignFundingPosition,
} from "./campaign-funding-quests.js";
import {
  campaignFundingCollections,
  type CampaignFundingCollection,
} from "./campaign-funding-collections.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { attachCampaignCombat } from "./campaign-combat.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { campaignZoneId } from "./campaign-geography.js";
import { deferUnfundedStarterPickups } from "./campaign-pickup-order.js";
import { fundingInsertionActions } from "./campaign-funding-insertion.js";
import { batchFundingNpcVisit } from "./campaign-funding-visit.js";
import { MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP } from "./campaign-combat-policy.js";
import { promoteReadyCampaignVisit } from "./campaign-ready-visits.js";
import {
  regressedFundingScenarios,
  unsafePartyFundingScenarios,
} from "./campaign-funding-quality.js";
import {
  providedDeliveryFundingCatalog,
  npcDeliveryFundingCatalog,
  fundingDeliveryPickupQuestIds,
} from "./campaign-funding-deliveries.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import { campaignFundingReview } from "./campaign-funding-review.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { CAMPAIGN_DEFERRED_PARTY_QUESTS } from "./campaign-route.js";
import { refreshFundedCampaignPartyPolicy } from "./campaign-funding-policy.js";
import { skippedSharedKillFundingCatalog } from "./campaign-skipped-kills.js";
import { applyNarrativeEncounterReferences, campaignNarrativeEvents } from "./campaign-narrative-events.js";
import { movableMandatoryFundingQuests } from "./campaign-funding-mandatory.js";
import { conditionalFundingAlternative } from "./campaign-funding-alternatives.js";
import { relocateFundingBatch } from "./campaign-funding-relocation.js";
import { campaignCollectionContinuations } from "./campaign-collection-continuations.js";
import {
  campaignSourceDeliveries,
  sourceDeliveryFundingCatalog,
  type CampaignSourceDelivery,
} from "./campaign-source-deliveries.js";
import {
  campaignFundingStates,
  campaignFundingProgressBefore,
  campaignFundingXpBoundsBefore,
  campaignFundingScenarioKey,
  campaignFundingCheckpoints,
  type CampaignFundingScenario,
  type CampaignFundingState,
  type CampaignFundingExecutor,
} from "./campaign-funding-scenarios.js";

export interface CampaignQuestFundingGap {
  readonly checkpointId: string;
  readonly missingXpByPlayer: readonly (number | null)[];
}

interface FundingProposal {
  readonly plan: CampaignPlan;
  readonly states: readonly CampaignFundingState[];
}

interface FundingExecution {
  readonly execute: CampaignFundingExecutor;
  readonly states?: readonly CampaignFundingState[];
  readonly minimumInsertionIndex: number;
}

type QuestFundingPolicy =
  | "none"
  | "plain"
  | "npc-dialogue"
  | "provided-deliveries"
  | "ground-pickups"
  | "npc-deliveries"
  | "party-combat"
  | "source-collections";

export interface CampaignQuestFunding {
  readonly revision: "explicit-quest-funding-20261105-v81";
  readonly readyVisitReview?: {
    readonly stages: readonly {
      readonly policy: Exclude<QuestFundingPolicy, "none">;
      readonly accepted: boolean;
      readonly regressedScenarios: readonly string[];
    }[];
  };
  readonly providerRevision: string;
  readonly addedQuestIds: readonly number[];
  readonly remaining: readonly CampaignQuestFundingGap[];
  readonly scenarios: readonly (CampaignFundingScenario & {
    readonly remaining: readonly CampaignQuestFundingGap[];
    readonly blockedReasonsByPlayer: readonly (string | null)[];
  })[];
}

function total(level: number, xp: number): number {
  let result = xp;
  for (let at = 1; at < level; at++) result += FOREVER_XP_CURVE[at]!;
  return result;
}

function laterFundingQuestIds(
  plan: CampaignPlan,
  catalog: QuestCatalog,
  combat: CombatDataset,
  added: ReadonlySet<number>,
  beforeIndex: number,
): ReadonlySet<number> {
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const owned = new Map<number, { readonly action: CampaignAction; readonly index: number }[]>();
  for (const [index, action] of plan.actions.entries())
    for (const change of action.questChanges)
      if (added.has(change.questId))
        owned.set(change.questId, [...(owned.get(change.questId) ?? []), { action, index }]);
  return new Set(
    [...owned]
      .filter(([id, entries]) => {
        const quest = catalog.quests.find((entry) => entry.questId === id);
        return (
          quest?.category === "shared-kills" &&
          isSharedFundingQuest(quest) &&
          quest.objectives.every((objective) => {
            const npc = npcs.get(objective.npcId);
            return npc?.rank === 0 && npc.maximumLevel !== null;
          }) &&
          entries.every(
            ({ action, index }) =>
              index >= beforeIndex &&
              action.fundingCheckpointId !== undefined &&
              !action.libraryRequired &&
              !action.libraryBackbone &&
              !action.raidOnly &&
              !action.dungeonFinishOnly &&
              !action.bundleId &&
              plan.legs.find((leg) => leg.id === action.legId)?.kind !== "dungeon",
          )
        );
      })
      .map(([id]) => id),
  );
}

export function fundCampaignQuestGaps(
  initial: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
  options: { readonly includeCatalogApproaches?: boolean; readonly includeSourceDeliveries?: boolean;
    readonly fundingExecutor?: CampaignFundingExecutor; readonly minimumInsertionIndex?: number } = {},
): CampaignPlan {
  const statesForPlan = options.fundingExecutor ?? campaignFundingStates;
  const minimumInsertionIndex = options.minimumInsertionIndex ?? 0;
  if (!Number.isInteger(minimumInsertionIndex) || minimumInsertionIndex < 0 || minimumInsertionIndex > initial.actions.length)
    throw new Error("Funding insertion floor must be an action index within the route.");
  // Keep the established quest allocation as the baseline; earlier rewards can reduce later kill XP.
  combat = applyNarrativeEncounterReferences(combat);
  catalog = skippedSharedKillFundingCatalog(initial, sources, combat, catalog);
  let selected = fundQuestGaps(initial, sources, combat, catalog, "none", undefined, false, undefined,
    { execute: statesForPlan, minimumInsertionIndex });
  const collections = campaignFundingCollections(initial, sources, combat, catalog);
  const deliveries = new Map([
    ...(options.includeSourceDeliveries
      ? campaignSourceDeliveries(initial, sources, combat, catalog, { includeSelected: initial.sharedQuestsOnly === true })
      : new Map<number, CampaignSourceDelivery>()),
    ...campaignNarrativeEvents(initial, sources, combat, catalog),
  ]);
  const deliveryCatalog = sourceDeliveryFundingCatalog(catalog, deliveries);
  const stages: NonNullable<CampaignQuestFunding["readyVisitReview"]>["stages"][number][] = [];
  const policies = [
    "plain",
    "npc-dialogue",
    "provided-deliveries",
    ...(catalog.quests.some(isGroundPickupFundingQuest) ? (["ground-pickups"] as const) : []),
    ...(catalog.quests.some(
      (quest) =>
        npcDeliveryRecipients(
          quest,
          combat.quests.find((reference) => reference.questId === quest.questId),
        ).length > 0,
    )
      ? (["npc-deliveries"] as const)
      : []),
    "party-combat",
    ...(collections.size ? (["source-collections"] as const) : []),
  ] as const;
  for (const policy of policies) {
    const fundingCatalog = policy === "plain" ? catalog : deliveryCatalog;
    const proposed = fundQuestGaps(
      selected.plan,
      sources,
      combat,
      fundingCatalog,
      policy,
      policy === "source-collections" ? collections : undefined,
      options.includeCatalogApproaches === true,
      policy === "plain" ? undefined : deliveries,
      { execute: statesForPlan, states: selected.states, minimumInsertionIndex },
    );
    const regressions = [
      ...new Set([
        ...regressedFundingScenarios(initial, selected.states, proposed.states),
        ...(policy === "party-combat" || policy === "source-collections"
          ? unsafePartyFundingScenarios(
              selected.plan,
              proposed.states,
              fundingCatalog,
              combat,
              collections,
            )
          : []),
      ]),
    ];
    stages.push({ policy, accepted: regressions.length === 0, regressedScenarios: regressions });
    if (!regressions.length) selected = proposed;
  }
  const partyPolicy = refreshFundedCampaignPartyPolicy(selected.plan, sources, combat, deliveryCatalog, deliveries);
  return {
    ...selected.plan,
    ...(partyPolicy ? { partyPolicy } : {}),
    questFunding: {
      ...selected.plan.questFunding!,
      readyVisitReview: { stages },
    },
  };
}

function fundQuestGaps(
  initial: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
  policy: QuestFundingPolicy,
  sourceCollections: ReadonlyMap<number, CampaignFundingCollection> | undefined,
  includeCatalogApproaches: boolean,
  sourceDeliveries: ReadonlyMap<number, CampaignSourceDelivery> | undefined,
  execution: FundingExecution,
): { readonly plan: CampaignPlan; readonly states: readonly CampaignFundingState[] } {
  if (initial.targetBuild !== catalog.targetBuild || initial.targetBuild !== combat.targetBuild)
    throw new Error("Quest funding inputs belong to different builds.");
  if (catalog.itemSha256 && catalog.itemSha256 !== combat.provider.itemSha256)
    throw new Error("Quest funding provided items belong to a different item export.");
  if (
    catalog.quests.some((quest) => quest.objectStarts?.length || quest.objectEnds?.length) &&
    catalog.objectSha256 !== combat.provider.objectSha256
  )
    throw new Error("Quest funding object quest endpoints belong to a different object export.");
  if (catalog.objectSha256 && catalog.objectSha256 !== combat.provider.objectSha256)
    throw new Error("Quest funding ground objects belong to a different object export.");
  let plan = initial;
  const statesForPlan = execution.execute;
  const added = new Set<number>(initial.questFunding?.addedQuestIds ?? []);
  const exhausted = new Set<string>();
  const selectedQuestIds = new Set(
    initial.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
  );
  const providedCatalog =
    policy === "provided-deliveries" ||
    policy === "ground-pickups" ||
    policy === "npc-deliveries" ||
    policy === "party-combat" ||
    policy === "source-collections"
      ? providedDeliveryFundingCatalog(catalog, combat, selectedQuestIds, initial.sharedQuestsOnly === true)
      : catalog;
  const selectionCatalog =
    policy === "npc-deliveries" || policy === "party-combat" || policy === "source-collections"
      ? npcDeliveryFundingCatalog(providedCatalog, combat, selectedQuestIds, initial.sharedQuestsOnly === true)
      : providedCatalog;
  const freshDeliveryQuestIds = new Set(selectionCatalog.quests.filter((quest) =>
    initial.sharedQuestsOnly && selectedQuestIds.has(quest.questId) && quest.category === "delivery",
  ).map((quest) => quest.questId));
  const candidates = selectionCatalog.quests.filter(
    (quest) =>
      isSharedFundingQuest(quest) ||
      ((policy === "ground-pickups" ||
        policy === "npc-deliveries" ||
        policy === "party-combat" ||
        policy === "source-collections") &&
        isGroundPickupFundingQuest(quest)) ||
      sourceCollections?.has(quest.questId) === true ||
      sourceDeliveries?.has(quest.questId) === true,
  );
  const safePickupQuestIds = fundingDeliveryPickupQuestIds(selectionCatalog, combat, sourceDeliveries ?? new Map());
  let states = execution.states ?? statesForPlan(plan);
  while (true) {
    const original = new Map(plan.actions.map((action, index) => [action.id, { action, index }]));
    const failures = states
      .flatMap((state) =>
        state.progress.members.flatMap((_member, player) =>
          campaignFundingCheckpoints(state, player)
            .filter(
              (checkpoint) =>
                !checkpoint.ready && checkpoint.missingXp !== null && checkpoint.missingXp > 0,
            )
            .map((checkpoint) => ({ state, checkpoint })),
        ),
      )
      .filter(
        ({ state, checkpoint }) =>
          original.has(checkpoint.actionId) &&
          !exhausted.has(`${campaignFundingScenarioKey(state)}/${checkpoint.actionId}`),
      )
      .sort(
        (left, right) =>
          original.get(left.checkpoint.actionId)!.index -
          original.get(right.checkpoint.actionId)!.index,
      );
    const failure = failures[0];
    if (!failure) break;
    const { state, checkpoint: gap } = failure;
    const activeActionIds = new Set(state.actions.map((action) => action.id));
    const failureKey = `${campaignFundingScenarioKey(state)}/${gap.actionId}`;
    const gate = original.get(gap.actionId)!.action;
    const effectiveGate = state.actions.find((action) => action.id === gate.id)!;
    const gateLeg = plan.legs.find((leg) => leg.id === gate.legId);
    if (gateLeg?.kind === "finish" || gate.dungeonFinishOnly || gateLeg?.kind === "dungeon" || gateLeg?.optionalQuestId !== undefined) {
      exhausted.add(failureKey);
      continue;
    }
    let continued = false;
    if (sourceCollections) for (const proposal of campaignCollectionContinuations(
      plan, gate, state, sourceCollections, execution.minimumInsertionIndex,
    )) {
      const nextPlan = attachCampaignCombat(proposal.plan, sources, combat,
        initial.combat?.revision ?? "quest-funding");
      const nextStates = statesForPlan(nextPlan);
      const nextState = nextStates.find((entry) => campaignFundingScenarioKey(entry) === campaignFundingScenarioKey(state));
      const improves = nextState && state.progress.members.some((_member, player) => {
        const before = campaignFundingCheckpoints(state, player)
          .find((checkpoint) => checkpoint.actionId === gap.actionId);
        const after = campaignFundingCheckpoints(nextState, player)
          .find((checkpoint) => checkpoint.actionId === gap.actionId);
        return before?.missingXp != null && after?.missingXp != null &&
          after.missingXp < before.missingXp;
      });
      if (!improves ||
        regressedFundingScenarios(plan, states, nextStates).length ||
        unsafePartyFundingScenarios(plan, nextStates, selectionCatalog, combat,
          sourceCollections, proposal.movedActionIds).length ||
        nextStates.some((next) => {
          const party = guidePartyScenario(nextPlan, next.progress, next.starterMode);
          return auditCampaignQuestLog(party.plan, party.progress, party)
            .some((member) => !member.withinCapacity);
        })) continue;
      plan = nextPlan;
      states = nextStates;
      added.add(proposal.questId);
      exhausted.clear();
      continued = true;
      break;
    }
    if (continued) continue;
    const readyVisit =
      policy !== "none" &&
      promoteReadyCampaignVisit(
        plan,
        sources,
        combat,
        catalog,
        states,
        state,
        gate,
        policy !== "plain",
        policy === "npc-deliveries" || policy === "party-combat" || policy === "source-collections",
      );
    if (readyVisit) {
      plan = deferUnfundedStarterPickups(readyVisit);
      states = statesForPlan(plan);
      exhausted.clear();
      continue;
    }
    let selected: {
      readonly batch: CampaignFundingBatch;
      readonly score: number;
      readonly insertion: CampaignAction;
      readonly retainedQuestIds: ReadonlySet<number>;
      readonly proposal?: FundingProposal;
    } | null = null;
    for (const insertion of fundingInsertionActions(plan, sources, gate, includeCatalogApproaches
      ? { state, minimumIndex: execution.minimumInsertionIndex, targetLevel: gap.targetLevel,
        safePickupQuestIds } : undefined)) {
      if (!activeActionIds.has(insertion.id)) continue;
      const progress = campaignFundingProgressBefore(state, insertion.id);
      const initialBounds = campaignFundingXpBoundsBefore(state, insertion.id);
      const players = effectiveGate.leaderOnly ? progress.members.slice(0, 1) : progress.members;
      if (players.some((member) => member.level === null || member.currentXp === null)) {
        continue;
      }
      const minimumLevel = Math.min(...players.map((member) => member.level!));
      const beforeIndex = plan.actions.findIndex((action) => action.id === insertion.id);
      const preceding = [...plan.actions.slice(0, beforeIndex)]
        .reverse()
        .flatMap((action) => action.positions)
        .find(({ position }) => campaignZoneId(position.zone) !== null)?.position;
      const previousZone = preceding ? campaignZoneId(preceding.zone) : null;
      if (previousZone === null) {
        continue;
      }
      const previous: CampaignFundingPosition | null =
        preceding && (preceding.space === "map-percent" || sourceCollections)
          ? { ...preceding, zone: campaignZoneId(preceding.zone)! }
          : null;
      const resume = [
        ...insertion.positions,
        ...[...plan.actions.slice(0, beforeIndex)]
          .reverse()
          .filter((action) => !action.fundingCheckpointId)
          .flatMap((action) => action.positions),
      ].find(({ position }) => campaignZoneId(position.zone) !== null)?.position;
      const resumePosition: CampaignFundingPosition | null =
        resume && (resume.space === "map-percent" || sourceCollections)
          ? { ...resume, zone: campaignZoneId(resume.zone)! }
          : null;
      const resumeZone = resume ? campaignZoneId(resume.zone) : previousZone;
      const starterCorridor =
        plan.sharedQuestsOnly && plan.legs.find((leg) => leg.id === gate.legId)?.kind === "starter"
          ? new Set([
              previousZone,
              ...(campaignGroundJourney(previousZone, resumeZone ?? previousZone)?.map(
                (leg) => leg.to,
              ) ?? []),
            ])
          : null;
      // A later generated opportunity remains available to starters that skip the earlier one.
      const reusable = laterFundingQuestIds(plan, catalog, combat, added, beforeIndex);
      const movable = policy === "party-combat" || policy === "source-collections"
        ? movableMandatoryFundingQuests(plan, catalog, beforeIndex, sourceCollections)
        : new Set<number>();
      const forbidden = new Set<number>([
        ...[...added].filter((id) => !reusable.has(id)),
        ...(plan.sharedQuestsOnly ? Object.keys(CAMPAIGN_DEFERRED_PARTY_QUESTS).map(Number) : []),
      ]);
      for (const action of plan.actions) {
        const leg = plan.legs.find((entry) => entry.id === action.legId);
        const outsideAudience =
          (gate.leaderOnly
            ? !action.leaderOnly || action.legId !== gate.legId
            : action.leaderOnly) ||
          action.raidOnly ||
          leg?.kind === "dungeon";
        for (const change of action.questChanges)
          if ((outsideAudience || (action.libraryRequired && !movable.has(change.questId))) &&
            !reusable.has(change.questId)) forbidden.add(change.questId);
      }
      const prerequisites = new Map<number, readonly number[]>();
      for (const action of plan.actions)
        for (const change of action.questChanges)
          if (change.state === "accepted" && action.requiredQuestIds?.length)
            prerequisites.set(change.questId, [
              ...new Set([
                ...(prerequisites.get(change.questId) ?? []),
                ...action.requiredQuestIds,
              ]),
            ]);
      for (const quest of candidates) {
        if (forbidden.has(quest.questId) || requiresDungeonQuestVisit(quest.questId)) continue;
        // Do not add overlevel-penalized filler; a low-level prerequisite may still
        // be included by the closure of a worthwhile current-level root quest.
        if (players.some((member) => member.level! > quest.questLevel! + 5)) continue;
        const proposedBatch = campaignFundingBatch(quest, selectionCatalog, combat, progress, {
          legId: insertion.legId,
          checkpointId: gate.id,
          targetLevel: gap.targetLevel,
          previous,
          previousZone,
          resumePosition,
          resumeZone,
          forbiddenQuestIds: forbidden,
          maximumQuestLevel: minimumLevel + MAXIMUM_NON_BOSS_ENEMY_LEVEL_GAP,
          leaderOnly: gate.leaderOnly,
          ...(plan.sharedQuestsOnly ? { sharedQuestsOnly: true as const,
            prerequisiteProjection: { plan, sources, lootScenario: state.lootScenario },
          } : {}),
          additionalPrerequisites: prerequisites,
          existingActions: plan.actions,
          ...(plan.sharedQuestsOnly ? { allowNearbyGivers: true as const } : {}),
          includeGroundPickups:
            policy === "ground-pickups" ||
            policy === "npc-deliveries" ||
            policy === "party-combat" ||
            policy === "source-collections",
          includeNpcDeliveries:
            policy === "npc-deliveries" ||
            policy === "party-combat" ||
            policy === "source-collections",
          includePartyElites: policy === "party-combat" || policy === "source-collections",
          includeCatalogApproaches,
          groundPickupSources: sources,
          ...(sourceCollections ? { sourceCollections } : {}),
          ...(sourceDeliveries ? { sourceDeliveries } : {}),
          freshQuestIds: freshDeliveryQuestIds,
        });
        // A shared route has one task list; an XP interval must not make its selected preparation optional.
        const selectedBatch =
          proposedBatch && plan.sharedQuestsOnly
            ? {
                ...proposedBatch,
                actions: proposedBatch.actions.map((action) => ({
                  ...action,
                  libraryBackbone: true,
                  xpOptional: false,
                })),
              }
            : proposedBatch;
        const alternative = selectedBatch
          ? conditionalFundingAlternative(plan, selectedBatch, beforeIndex, activeActionIds)
          : null;
        const batch = alternative?.batch;
        if (
          !batch ||
          !Number.isFinite(batch.travelCost) ||
          (starterCorridor &&
            batch.actions.some((action) =>
              action.positions.some(
                ({ position }) => !starterCorridor.has(campaignZoneId(position.zone) ?? ""),
              ),
            )) ||
          (gate.leaderOnly &&
            previousZone &&
            batch.actions.some((action) =>
              action.positions.some(
                ({ position }) => campaignZoneId(position.zone) !== previousZone,
              ),
            ))
        )
          continue;
        const prototype: CampaignPlan = {
          ...plan,
          actions: batch.actions.map((action) => ({
            ...action,
            leaderOnly: effectiveGate.leaderOnly,
          })),
          catchUpBatches: [],
          defaultCatchUpBatches: {},
          library: { revision: "source-backbone-20261021-v3", choices: [] },
          legs: [
            {
              id: insertion.legId,
              title: "Quest preparation",
              kind: "preparation",
              from: minimumLevel,
              to: gap.targetLevel,
              stopId: null,
              actionIds: batch.actions.map((action) => action.id),
              questIds: batch.questIds,
              unresolvedQuestIds: [],
            },
          ],
        };
        const simulated = attachCampaignCombat(
          prototype,
          sources,
          combat,
          plan.combat?.revision ?? "quest-funding",
        );
        const rows = forecastCampaignXp(simulated, progress, { initialBounds, lootScenario: state.lootScenario })
          .flatMap((section) => section.members)
          .filter((member) => !effectiveGate.leaderOnly || member.player === 1);
        if (
          rows.length !== players.length ||
          rows.some(
            (member) =>
              member.endpoint === null ||
              member.unknownQuestIds.length > 0 ||
              member.blockedReason !== null,
          )
        )
          continue;
        const gain = Math.min(
          ...rows.flatMap((member, index) =>
            players[index]!.level! < gap.targetLevel
              ? [
                  total(member.endpoint!.level, member.endpoint!.currentXp) -
                    total(players[index]!.level!, players[index]!.currentXp!),
                ]
              : [],
          ),
        );
        if (!Number.isFinite(gain) || gain <= 0) continue;
        const score = gain / (10 + batch.requiredKills + 10 * batch.travelCost);
        if (selected && score <= selected.score) continue;
        let proposal: FundingProposal | undefined;
        const partyCombat = !effectiveGate.leaderOnly && batch.questIds.some((id) =>
          sourceCollections?.has(id) ||
          selectionCatalog.quests.find((quest) => quest.questId === id)?.category === "shared-kills",
        );
        const retainedQuestIds = new Set([...reusable, ...alternative!.retainedQuestIds]);
        if (partyCombat || batch.questIds.some((id) => retainedQuestIds.has(id) || movable.has(id))) {
          const nextPlan = deferUnfundedStarterPickups(
            attachCampaignCombat(
              relocateFundingBatch(plan, batch, insertion, selectionCatalog, retainedQuestIds),
              sources,
              combat,
              initial.combat?.revision ?? "quest-funding",
            ),
          );
          const nextStates = statesForPlan(nextPlan);
          if (
            regressedFundingScenarios(plan, states, nextStates).length ||
            unsafePartyFundingScenarios(
              plan, nextStates, selectionCatalog, combat, sourceCollections,
              new Set(batch.actions.map((action) => action.id)),
            ).length ||
            nextStates.some((next) => {
              const party = guidePartyScenario(nextPlan, next.progress, next.starterMode);
              return auditCampaignQuestLog(party.plan, party.progress, party).some(
                (member) => !member.withinCapacity,
              );
            })
          )
            continue;
          proposal = { plan: nextPlan, states: nextStates };
        }
        selected = { batch, score, insertion, retainedQuestIds, ...(proposal ? { proposal } : {}) };
      }
    }
    if (!selected) {
      exhausted.add(failureKey);
      continue;
    }
    for (const questId of selected.batch.questIds) added.add(questId);
    if (selected.proposal) {
      plan = selected.proposal.plan;
      states = selected.proposal.states;
    } else {
      plan = attachCampaignCombat(
        relocateFundingBatch(plan, selected.batch, selected.insertion, selectionCatalog, selected.retainedQuestIds),
        sources,
        combat,
        initial.combat?.revision ?? "quest-funding",
      );
      plan = deferUnfundedStarterPickups(plan);
      states = statesForPlan(plan);
    }
    const scheduled = batchFundingNpcVisit(plan, selected.batch, selectionCatalog, states, statesForPlan);
    plan = scheduled.plan;
    states = scheduled.states;
    exhausted.clear();
  }
  return {
    states,
    plan: {
      ...plan,
      questFunding: {
        revision: "explicit-quest-funding-20261105-v81",
        providerRevision: catalog.providerRevision,
        addedQuestIds: [...added],
        ...campaignFundingReview(plan, states),
      },
    },
  };
}
