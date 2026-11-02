import type { CampaignAction } from "./campaign.js";
import type { CampaignCombatRow, CampaignCombatState } from "./campaign-combat.js";
import {
  combatObjectiveKey,
  type CombatActivity,
  type CampaignCombatPlan,
  type CombatObjective,
} from "./combat-model.js";
import { estimatePartyCreatureKills } from "./combat-party-xp.js";
import {
  estimateBoundedPartyKills,
  type BoundedCombatKillEstimate,
  type CampaignXpBounds,
} from "./campaign-xp-bounds.js";
import type { CombatXpPosition } from "./combat-xp.js";
import type { PremadeMember } from "./premade-model.js";
import {
  indexSharedPartyCombat,
  type SharedPartyCombatIndex,
} from "./campaign-shared-combat-index.js";

export interface SharedPartyCombatParticipant {
  readonly actionRequired?: boolean;
  readonly references?: SharedPartyCombatIndex;
  readonly position: CombatXpPosition;
  readonly maximumPosition?: CombatXpPosition;
  readonly questStates: PremadeMember["questStates"];
  readonly state: CampaignCombatState;
}

export interface SharedPartyCombatForecast {
  readonly xp: number;
  readonly maximumXp?: number;
  readonly exitBounds?: CampaignXpBounds;
  readonly rows: readonly CampaignCombatRow[];
  readonly issues: readonly string[];
  readonly state: CampaignCombatState;
}

/** Plan one physical shared-kill stream; personal quest history only determines remaining demand. */
export function forecastSharedPartyCombat(input: {
  readonly action: CampaignAction;
  readonly activities: readonly CombatActivity[];
  readonly combat: CampaignCombatPlan;
  readonly participants: readonly SharedPartyCombatParticipant[];
  readonly xpMultiplier: number;
  readonly references?: SharedPartyCombatIndex;
}): readonly SharedPartyCombatForecast[] | null {
  const { action, activities, combat, participants } = input;
  if (
    action.leaderOnly ||
    action.kind !== "quests" ||
    participants.length !== 5 ||
    !action.questChanges.length ||
    action.questChanges.some((change) => change.state !== "objectives-complete") ||
    !activities.length ||
    activities.some((activity) => activity.profile || activity.pathId || activity.questWide) ||
    activities.some((activity) => activity.environment !== activities[0]!.environment)
  )
    return null;

  const objectives = new Map<string, CombatObjective>();
  for (const objective of activities.flatMap((activity) => activity.objectives)) {
    const key = combatObjectiveKey(objective);
    const previous = objectives.get(key);
    if (
      previous &&
      (previous.requiredKills !== objective.requiredKills ||
        previous.npcIds[0] !== objective.npcIds[0])
    )
      return null;
    if (
      objective.credit !== "shared-kills" ||
      objective.quotaConflict ||
      objective.loot ||
      objective.npcIds.length !== 1 ||
      objective.requiredKills === null ||
      !Number.isSafeInteger(objective.requiredKills) ||
      objective.requiredKills < 1 ||
      objective.requiredKills > 10000 ||
      !action.questChanges.some(
        (change) =>
          change.questId === objective.questId &&
          change.objectiveIndex === objective.objectiveIndex,
      )
    )
      return null;
    objectives.set(key, objective);
  }
  if (
    action.questChanges.some(
      (change) =>
        !objectives.has(
          combatObjectiveKey({
            questId: change.questId,
            objectiveIndex: change.objectiveIndex ?? 1,
          }),
        ),
    )
  )
    return null;

  const demand = new Map<number, number>();
  for (const [key, objective] of objectives)
    for (const participant of participants) {
      if (participant.actionRequired === false) continue;
      if (participant.questStates[String(objective.questId)] !== "accepted") continue;
      const counted = participant.state.counters.get(key);
      // An already-held quest has an unknown remaining count until it is observed.
      if (
        counted === null ||
        (counted !== undefined &&
          (!Number.isSafeInteger(counted) || counted < 0 || counted > objective.requiredKills!))
      )
        return null;
      const remaining = objective.requiredKills! - (counted ?? 0);
      demand.set(objective.npcIds[0]!, Math.max(demand.get(objective.npcIds[0]!) ?? 0, remaining));
    }
  const targets = new Set([...demand].filter(([, kills]) => kills > 0).map(([npcId]) => npcId));
  let commonReferences = input.references;
  if (commonReferences && commonReferences.combat !== combat)
    throw new Error("Shared combat index belongs to another plan.");
  const participantReferences = participants.map((participant) => {
    const references =
      participant.references ?? (commonReferences ??= indexSharedPartyCombat(combat));
    if (references.combat !== combat)
      throw new Error("Shared participant reference index belongs to another plan.");
    return references;
  });
  const references = participantReferences[0]!;
  const participantObjectives: CombatObjective[][] = [];
  for (const [player, participant] of participants.entries()) {
    const ownReferences = participantReferences[player]!;
    const overlapping = new Map<string, CombatObjective>();
    for (const npcId of targets) {
      for (const questId of ownReferences.conflictingQuestsByNpc.get(npcId) ?? [])
        if (participant.questStates[String(questId)] === "accepted") return null;
      for (const [key, objective] of ownReferences.objectivesByNpc.get(npcId) ?? [])
        overlapping.set(key, objective);
    }
    const ownObjectives = [...overlapping.values()];
    for (const objective of ownObjectives) {
      if (
        participant.questStates[String(objective.questId)] !== "accepted" ||
        objective.credit === "shared-kills"
      )
        continue;
      return null;
    }
    participantObjectives.push(ownObjectives);
  }

  const rows = participants.map((): CampaignCombatRow[] => []);
  const issues = participants.map((): string[] => []);
  const xp = participants.map(() => 0);
  const maximumXp = participants.map(() => 0);
  let positions = participants.map((participant) => participant.position);
  let maximumPositions = participants.map(
    (participant) => participant.maximumPosition ?? participant.position,
  );
  const bounded = participants.every((participant) => participant.maximumPosition !== undefined);
  for (const [npcId, kills] of demand) {
    if (!kills) continue;
    const npc = references.npcs.get(npcId);
    if (!npc) return null;
    const batch = {
      npc,
      kills,
      environment: activities[0]!.environment,
      evidence: combat.killXpEvidence ?? [],
      build: combat.targetBuild,
      xpMultiplier: activities[0]!.environment === "outdoor" ? input.xpMultiplier : 1,
    };
    const estimates: readonly BoundedCombatKillEstimate[] = bounded
      ? estimateBoundedPartyKills({
          ...batch,
          positions: positions.map((minimum, player) => ({
            minimum,
            maximum: maximumPositions[player]!,
          })),
        })
      : estimatePartyCreatureKills({ ...batch, positions }).map((estimate) => ({
          ...estimate,
          maximumExit: estimate.exit,
        }));
    if (
      estimates.some(
        (estimate) =>
          estimate.xp === null ||
          estimate.maximumXp === null ||
          (!bounded && estimate.maximumXp !== estimate.xp),
      )
    )
      return null;
    const source = [
      ...new Set(
        [...objectives.values()]
          .filter((objective) => objective.npcIds[0] === npcId)
          .map((objective) => objective.source),
      ),
    ].join("; ");
    for (const [player, estimate] of estimates.entries()) {
      xp[player]! += estimate.xp!;
      maximumXp[player]! += estimate.maximumXp!;
      rows[player]!.push({
        activityId: activities[0]!.id,
        environment: activities[0]!.environment,
        npcId,
        name: npc.name,
        minimumLevel: npc.minimumLevel,
        maximumLevel: npc.maximumLevel,
        kills,
        xp: estimate.xp,
        maximumXp: estimate.maximumXp,
        source:
          estimate.basis === "observed" ? (estimate.observedSources?.join("; ") ?? source) : source,
        basis: estimate.basis,
      });
      if (estimate.basis === "reference-estimate")
        issues[player]!.push(
          `${activities[0]!.id}:${npcId}: combat XP is estimated from the historical formula; this exact creature, party and build have no matching observation.`,
        );
    }
    positions = estimates.map((estimate) => estimate.exit);
    maximumPositions = estimates.map((estimate) => estimate.maximumExit!);
  }

  // Return new counters only after every physical payout is supported. Failed plans mutate nothing.
  return participants.map((participant, player) => {
    const counters = new Map(participant.state.counters);
    for (const objective of participantObjectives[player]!) {
      if (
        objective.credit !== "shared-kills" ||
        objective.npcIds.length !== 1 ||
        objective.requiredKills === null ||
        !Number.isSafeInteger(objective.requiredKills) ||
        objective.requiredKills < 1 ||
        participant.questStates[String(objective.questId)] !== "accepted"
      )
        continue;
      const kills = demand.get(objective.npcIds[0]!);
      const key = combatObjectiveKey(objective),
        counted = counters.get(key);
      if (kills && counted !== null)
        counters.set(key, Math.min(objective.requiredKills, (counted ?? 0) + kills));
    }
    return {
      xp: xp[player]!,
      ...(bounded ? { maximumXp: maximumXp[player]! } : {}),
      ...(bounded
        ? { exitBounds: { minimum: positions[player]!, maximum: maximumPositions[player]! } }
        : {}),
      rows: rows[player]!,
      issues: issues[player]!,
      state: {
        counters,
        paid: new Set(participant.state.paid),
        pathKills: new Map(participant.state.pathKills),
      },
    };
  });
}
