import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { gateQuestIds } from "./dungeon-model.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, premadeEntryLevel } from "./premade.js";
import { questEligibility } from "./quest-eligibility.js";

function gateAction(action: CampaignAction, minimumLevel: number, questId: number): CampaignAction {
  return {
    id: `${action.legId}-level-${minimumLevel}-${questId}`,
    legId: action.legId,
    title: `Reach level ${minimumLevel} before quest ${questId}`,
    instructions: [
      `Every participating player must reach level ${minimumLevel} before accepting quest ${questId}.`,
      "Continue unfinished source quests or fight suitable nearby enemies, then record the actual XP bars. The planner does not award unobserved combat XP.",
    ],
    questChanges: [],
    positions: action.positions,
    source: null,
    kind: "xp-check",
    leaderOnly: action.leaderOnly,
    targetLevel: minimumLevel,
    targetCurrentXp: 0,
    targetStopId: null,
    raidOnly: action.raidOnly,
    xpOptional: true,
    xpTargetLevel: minimumLevel,
  };
}

function legGateAction(action: CampaignAction, level: number): CampaignAction {
  return {
    id: `${action.legId}-entry-level-${level}`,
    legId: action.legId,
    title: `Confirm level ${level} before this route phase`,
    instructions: [
      `Record fresh actual XP for all participating players and continue unfinished source work until everyone reaches level ${level}.`,
      "This checkpoint makes the route handoff explicit; it does not award assumed quest or combat XP.",
    ],
    questChanges: [],
    positions: action.positions,
    source: null,
    kind: "xp-check",
    leaderOnly: action.leaderOnly,
    targetLevel: level,
    targetCurrentXp: 0,
    targetStopId: null,
    raidOnly: action.raidOnly,
    xpOptional: true,
    xpTargetLevel: level,
  };
}

function departureGateAction(
  previous: CampaignAction,
  level: number,
  destinationId: string,
  destinationTitle: string,
  leaderOnly = false,
): CampaignAction {
  return {
    id: `${previous.legId}-departure-level-${level}-before-${destinationId}`,
    legId: previous.legId,
    title: `Reach level ${level} before ${destinationTitle}`,
    instructions: [
      `Finish the remaining source quests or suitable nearby enemies until every participating player reaches level ${level}.`,
      "Record all five actual XP bars before departure. Forecast quest and combat values guide the gap, but do not mark it complete.",
    ],
    questChanges: [],
    positions: previous.positions,
    source: null,
    kind: "xp-check",
    leaderOnly,
    targetLevel: level,
    targetCurrentXp: 0,
    targetStopId: null,
    raidOnly: false,
    xpOptional: true,
    xpTargetLevel: level,
  };
}

function conservativeDungeonEntry(plan: CampaignPlan, stopId: string, fallback: number): number {
  const stop = PREMADE_STOPS.find((entry) => entry.id === stopId);
  if (!stop) return fallback;
  const base = emptyPremadeProgress();
  return Math.max(
    fallback,
    ...(["at-level", "experienced-premade"] as const).flatMap((difficultyPolicy) =>
      [true, false].map((raidGoals) =>
        premadeEntryLevel(stop, { ...base, difficultyPolicy, raidGoals }, plan.rewardFacts),
      ),
    ),
  );
}

export function compileCampaignPickupGates(plan: CampaignPlan): CampaignPlan {
  let leaderFloor = 1;
  let partyFloor = 1;
  let currentLegId: string | null = null;
  const questStates = new Map<number, CampaignAction["questChanges"][number]["state"]>();
  const actions: CampaignAction[] = [];
  for (const original of plan.actions) {
    if (original.legId !== currentLegId) {
      const leg = plan.legs.find((entry) => entry.id === original.legId);
      if (!leg) throw new Error(`Campaign action has no owning leg: ${original.id}`);
      const previousLeg = plan.legs.find((entry) => entry.id === currentLegId);
      const previousAction = actions.at(-1);
      const destinationLevel =
        leg.kind === "dungeon" && leg.stopId
          ? conservativeDungeonEntry(plan, leg.stopId, leg.from)
          : leg.kind === "finish"
            ? leg.from
            : null;
      const departureLevel =
        destinationLevel ??
        (previousLeg?.kind === "starter" && previousLeg.to > previousLeg.from
          ? previousLeg.to
          : null);
      if (
        departureLevel !== null &&
        departureLevel > 1 &&
        previousLeg &&
        previousLeg.kind !== "dungeon" &&
        previousAction?.legId === previousLeg.id &&
        !(
          previousAction.kind === "xp-check" &&
          previousAction.targetLevel !== null &&
          previousAction.targetLevel >= departureLevel
        )
      )
        actions.push(
          departureGateAction(
            previousAction,
            departureLevel,
            leg.stopId ?? leg.id,
            leg.title,
            previousLeg.kind === "starter",
          ),
        );
      leaderFloor = leg.from;
      partyFloor = leg.from;
      currentLegId = original.legId;
      if (!["dungeon", "finish"].includes(leg.kind) && leg.from > 1)
        actions.push(legGateAction(original, leg.from));
    }
    const sourceGateConflictQuestIds = original.questChanges.flatMap((change) => {
      if (change.state !== "accepted" || original.source === null) return [];
      const gate = questEligibility(change.questId, plan.rewardFacts).gate;
      if (!gate) return [];
      const required = gateQuestIds(gate);
      return required.length > 0 && required.every((id) => questStates.get(id) !== "rewarded")
        ? [change.questId]
        : [];
    });
    const action = sourceGateConflictQuestIds.length
      ? { ...original, sourceGateConflictQuestIds }
      : original;
    const pickups = action.questChanges.filter((change) => change.state === "accepted");
    const requirements = pickups
      .map((change) => ({
        questId: change.questId,
        minimumLevel: questEligibility(change.questId, plan.rewardFacts).minimumLevel,
      }))
      .filter(
        (entry): entry is { readonly questId: number; readonly minimumLevel: number } =>
          entry.minimumLevel !== null,
      )
      .sort(
        (left, right) => left.minimumLevel - right.minimumLevel || left.questId - right.questId,
      );
    const floor = action.leaderOnly ? leaderFloor : partyFloor;
    const required = requirements.find((entry) => entry.minimumLevel > floor);
    if (required) {
      const maximum = requirements.at(-1)!;
      actions.push(gateAction(action, maximum.minimumLevel, maximum.questId));
      if (action.leaderOnly) leaderFloor = maximum.minimumLevel;
      else {
        partyFloor = maximum.minimumLevel;
        leaderFloor = Math.max(leaderFloor, maximum.minimumLevel);
      }
    }
    actions.push(action);
    if (action.kind === "xp-check" && action.targetLevel !== null) {
      if (action.leaderOnly) leaderFloor = Math.max(leaderFloor, action.targetLevel);
      else {
        partyFloor = Math.max(partyFloor, action.targetLevel);
        leaderFloor = Math.max(leaderFloor, action.targetLevel);
      }
    }
    for (const change of action.questChanges) questStates.set(change.questId, change.state);
  }
  const ids = new Set(actions.map((action) => action.id));
  if (ids.size !== actions.length) throw new Error("Duplicate campaign pickup gate identity.");
  return {
    ...plan,
    executionRevision: "workflow-20261018-v6",
    actions,
    legs: plan.legs.map((leg) => {
      const owned = actions.filter((action) => action.legId === leg.id);
      return {
        ...leg,
        actionIds: owned.map((action) => action.id),
        questIds: [
          ...new Set(
            owned.flatMap((action) => action.questChanges.map((change) => change.questId)),
          ),
        ],
      };
    }),
    bookmarkAliases: Object.fromEntries(
      Object.entries(plan.bookmarkAliases ?? {}).filter(([, target]) => ids.has(target)),
    ),
  };
}
