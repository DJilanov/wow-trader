import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset } from "./combat-model.js";
import type { QuestCatalog } from "./quest-catalog.js";
import { isSharedFundingQuest, isGroundPickupFundingQuest } from "./quest-catalog.js";
import {
  campaignFundingBatch,
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
import { getPremadeQuest } from "./premade.js";
import { deferUnfundedStarterPickups } from "./campaign-pickup-order.js";
import { fundingInsertionActions } from "./campaign-funding-insertion.js";
import { promoteReadyCampaignVisit } from "./campaign-ready-visits.js";
import {
  regressedFundingScenarios,
  unsafePartyFundingScenarios,
} from "./campaign-funding-quality.js";
import {
  providedDeliveryFundingCatalog,
  npcDeliveryFundingCatalog,
} from "./campaign-funding-deliveries.js";
import { npcDeliveryRecipients } from "./quest-catalog-delivery.js";
import { campaignFundingReview } from "./campaign-funding-review.js";
import { guidePartyScenario } from "./campaign-guide-party.js";
import { auditCampaignQuestLog } from "./campaign-quest-log.js";
import {
  campaignFundingStates,
  campaignFundingProgressBefore,
  campaignFundingXpBoundsBefore,
  campaignFundingScenarioKey,
  campaignFundingCheckpoints,
  type CampaignFundingScenario,
  type CampaignFundingState,
} from "./campaign-funding-scenarios.js";

export interface CampaignQuestFundingGap {
  readonly checkpointId: string;
  readonly missingXpByPlayer: readonly (number | null)[];
}

interface FundingProposal {
  readonly plan: CampaignPlan;
  readonly states: readonly CampaignFundingState[];
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
  readonly revision: "explicit-quest-funding-20261101-v22";
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

function relocate(
  plan: CampaignPlan,
  batch: CampaignFundingBatch,
  insertion: CampaignAction,
  preserveLaterQuestIds: ReadonlySet<number> = new Set(),
): CampaignPlan {
  const moved = new Set(batch.questIds.filter((id) => !preserveLaterQuestIds.has(id)));
  // Moving a source task must not make another party setup skip its required work.
  const mandatory = new Set(
    plan.actions.flatMap((action) => {
      const leg = plan.legs.find((entry) => entry.id === action.legId);
      return action.libraryBackbone || (!action.xpOptional && leg?.kind !== "xp-bridge")
        ? action.questChanges
            .filter((change) => moved.has(change.questId))
            .map((change) => change.questId)
        : [];
    }),
  );
  const movedActions = batch.actions.map((action) =>
    action.questChanges.some((change) => mandatory.has(change.questId))
      ? { ...action, libraryBackbone: true, xpOptional: false }
      : action,
  );
  const aliases: Record<string, string> = { ...plan.bookmarkAliases };
  const actions: CampaignAction[] = [];
  for (const action of plan.actions) {
    if (action.id === insertion.id) actions.push(...movedActions);
    const retained = action.questChanges.filter((change) => !moved.has(change.questId));
    if (retained.length === action.questChanges.length) {
      actions.push(action);
      continue;
    }
    const first = action.questChanges.find((change) => moved.has(change.questId))!;
    const destination = batch.actions.find((entry) =>
      entry.questChanges.some(
        (change) =>
          change.questId === first.questId &&
          change.state === first.state &&
          change.objectiveIndex === first.objectiveIndex,
      ),
    );
    if (!retained.length) {
      if (destination) aliases[action.id] = destination.id;
      continue;
    }
    const labels = retained.map(
      (change) =>
        `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
    );
    actions.push({
      ...action,
      questChanges: retained,
      title: labels.join(" · "),
      instructions: labels,
    });
  }
  return {
    ...plan,
    actions,
    bookmarkAliases: aliases,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      questIds: [
        ...new Set(
          actions
            .filter((action) => action.legId === leg.id)
            .flatMap((action) => action.questChanges.map((change) => change.questId)),
        ),
      ],
    })),
  };
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
): CampaignPlan {
  // Keep the established quest allocation as the baseline; earlier rewards can reduce later kill XP.
  let selected = fundQuestGaps(initial, sources, combat, catalog, "none");
  const collections = campaignFundingCollections(initial, sources, combat, catalog);
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
    const proposed = fundQuestGaps(
      selected.plan,
      sources,
      combat,
      catalog,
      policy,
      policy === "source-collections" ? collections : undefined,
    );
    const regressions = [
      ...new Set([
        ...regressedFundingScenarios(initial, selected.states, proposed.states),
        ...(policy === "party-combat" || policy === "source-collections"
          ? unsafePartyFundingScenarios(
              selected.plan,
              proposed.states,
              catalog,
              combat,
              collections,
            )
          : []),
      ]),
    ];
    stages.push({ policy, accepted: regressions.length === 0, regressedScenarios: regressions });
    if (!regressions.length) selected = proposed;
  }
  return {
    ...selected.plan,
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
  sourceCollections?: ReadonlyMap<number, CampaignFundingCollection>,
): { readonly plan: CampaignPlan; readonly states: readonly CampaignFundingState[] } {
  if (initial.targetBuild !== catalog.targetBuild || initial.targetBuild !== combat.targetBuild)
    throw new Error("Quest funding inputs belong to different builds.");
  if (catalog.itemSha256 && catalog.itemSha256 !== combat.provider.itemSha256)
    throw new Error("Quest funding provided items belong to a different item export.");
  if (catalog.objectSha256 && catalog.objectSha256 !== combat.provider.objectSha256)
    throw new Error("Quest funding ground objects belong to a different object export.");
  let plan = initial;
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
      ? providedDeliveryFundingCatalog(catalog, combat, selectedQuestIds)
      : catalog;
  const selectionCatalog =
    policy === "npc-deliveries" || policy === "party-combat" || policy === "source-collections"
      ? npcDeliveryFundingCatalog(providedCatalog, combat, selectedQuestIds)
      : providedCatalog;
  const candidates = selectionCatalog.quests.filter(
    (quest) =>
      isSharedFundingQuest(quest) ||
      ((policy === "ground-pickups" ||
        policy === "npc-deliveries" ||
        policy === "party-combat" ||
        policy === "source-collections") &&
        isGroundPickupFundingQuest(quest)) ||
      sourceCollections?.has(quest.questId) === true,
  );
  let states = campaignFundingStates(plan);
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
    const failureKey = `${campaignFundingScenarioKey(state)}/${gap.actionId}`;
    const gate = original.get(gap.actionId)!.action;
    const effectiveGate = state.actions.find((action) => action.id === gate.id)!;
    const gateLeg = plan.legs.find((leg) => leg.id === gate.legId);
    if (gateLeg?.kind === "finish" || gate.dungeonFinishOnly || gateLeg?.kind === "dungeon") {
      exhausted.add(failureKey);
      continue;
    }
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
      states = campaignFundingStates(plan);
      exhausted.clear();
      continue;
    }
    let selected: {
      readonly batch: CampaignFundingBatch;
      readonly score: number;
      readonly insertion: CampaignAction;
      readonly proposal?: FundingProposal;
    } | null = null;
    for (const insertion of fundingInsertionActions(plan, sources, gate)) {
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
      // A later generated opportunity remains available to starters that skip the earlier one.
      const reusable = laterFundingQuestIds(plan, catalog, combat, added, beforeIndex);
      const forbidden = new Set<number>([...added].filter((id) => !reusable.has(id)));
      for (const action of plan.actions) {
        const leg = plan.legs.find((entry) => entry.id === action.legId);
        if (
          (gate.leaderOnly
            ? !action.leaderOnly || action.legId !== gate.legId
            : action.leaderOnly) ||
          action.raidOnly ||
          leg?.kind === "dungeon" ||
          action.libraryRequired
        )
          for (const change of action.questChanges)
            if (!reusable.has(change.questId)) forbidden.add(change.questId);
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
        if (forbidden.has(quest.questId) || getPremadeQuest(quest.questId)) continue;
        // Do not add overlevel-penalized filler; a low-level prerequisite may still
        // be included by the closure of a worthwhile current-level root quest.
        if (players.some((member) => member.level! > quest.questLevel! + 5)) continue;
        const batch = campaignFundingBatch(quest, selectionCatalog, combat, progress, {
          legId: gate.legId,
          checkpointId: gate.id,
          targetLevel: gap.targetLevel,
          previous,
          previousZone,
          resumePosition,
          resumeZone: resume ? campaignZoneId(resume.zone) : previousZone,
          forbiddenQuestIds: forbidden,
          maximumQuestLevel: minimumLevel + 3,
          leaderOnly: gate.leaderOnly,
          additionalPrerequisites: prerequisites,
          existingActions: plan.actions,
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
          ...(sourceCollections ? { sourceCollections } : {}),
        });
        if (
          !batch ||
          !Number.isFinite(batch.travelCost) ||
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
              id: gate.legId,
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
        const rows = forecastCampaignXp(simulated, progress, { initialBounds })
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
        if (batch.questIds.some((id) => reusable.has(id))) {
          const nextPlan = deferUnfundedStarterPickups(
            attachCampaignCombat(
              relocate(plan, batch, insertion, reusable),
              sources,
              combat,
              initial.combat?.revision ?? "quest-funding",
            ),
          );
          const nextStates = campaignFundingStates(nextPlan);
          if (
            regressedFundingScenarios(plan, states, nextStates).length ||
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
        selected = { batch, score, insertion, ...(proposal ? { proposal } : {}) };
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
        relocate(plan, selected.batch, selected.insertion),
        sources,
        combat,
        initial.combat?.revision ?? "quest-funding",
      );
      plan = deferUnfundedStarterPickups(plan);
      states = campaignFundingStates(plan);
    }
    exhausted.clear();
  }
  return {
    states,
    plan: {
      ...plan,
      questFunding: {
        revision: "explicit-quest-funding-20261101-v22",
        providerRevision: catalog.providerRevision,
        addedQuestIds: [...added],
        ...campaignFundingReview(plan, states),
      },
    },
  };
}
