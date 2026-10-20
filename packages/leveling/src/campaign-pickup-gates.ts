import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { gateQuestIds } from "./dungeon-model.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, getPremadeQuest, premadeEntryLevel } from "./premade.js";
import { questEligibility } from "./quest-eligibility.js";
import { createCampaignPickupBudget } from "./campaign-pickup-budget.js";

function gateAction(action: CampaignAction, minimumLevel: number, questId: number): CampaignAction {
  return {
    id: `${action.legId}-level-${minimumLevel}-${questId}`,
    legId: action.legId,
    title: `Check remaining XP before quest ${questId}`,
    instructions: [
      `Quest ${questId} has a minimum level of ${minimumLevel}. Check ${action.leaderOnly ? "the leader's" : "each participating player's"} progress before this pickup.`,
      "If earlier hand-ins already cover it, continue without extra grinding. Only make up a real remaining XP shortfall; unknown rewards are not assumed earned.",
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
    pickupQuestId: questId,
  };
}

function legGateAction(action: CampaignAction, title: string, leaderOnly: boolean): CampaignAction {
  return {
    id: `${action.legId}-entry-xp`,
    legId: action.legId,
    title: `Record actual XP before ${title}`,
    instructions: [
      "Record fresh actual level and XP for participating players, then continue from those bars.",
      "Chapter level ranges are route references, not entry requirements. Only a quest prerequisite or the next selected stop can require more levels.",
    ],
    questChanges: [],
    positions: action.positions,
    source: null,
    kind: "xp-check",
    leaderOnly,
    targetLevel: null,
    targetCurrentXp: 0,
    targetStopId: null,
    raidOnly: action.raidOnly,
  };
}

function departureGateAction(
  previous: CampaignAction,
  level: number,
  destinationId: string,
  destinationTitle: string,
  stopId: CampaignAction["targetStopId"],
): CampaignAction {
  return {
    id: `${previous.legId}-departure-level-${level}-before-${destinationId}`,
    legId: previous.legId,
    title: `Check required level before ${destinationTitle}`,
    instructions: [
      "Use the next stop's selected difficulty policy and quest requirements, not the source chapter's level range.",
      "Only cover the remaining required XP gap with unfinished eligible quests or suitable nearby enemies; stop once the requirement is met.",
      "Record all five actual XP bars before departure. Forecast quest and combat values guide the gap, but do not mark it complete.",
    ],
    questChanges: [],
    positions: previous.positions,
    source: null,
    kind: "xp-check",
    leaderOnly: false,
    targetLevel: level,
    targetCurrentXp: 0,
    targetStopId: stopId,
    raidOnly: false,
    xpOptional: true,
    xpTargetLevel: level,
  };
}

function actualXpAction(action: CampaignAction): CampaignAction {
  if (action.kind !== "xp-check" || action.source === null || action.targetLevel === null)
    return action;
  const target = `level ${action.targetLevel}${action.targetCurrentXp ? ` + ${action.targetCurrentXp.toLocaleString("en-US")} XP` : ""}`;
  const observed = {
    ...action,
    title: "Record actual level and XP",
    instructions: [
      `The source suggests ${target}; this is a route recommendation, not a mandatory grind.`,
      "Record your actual bars and continue. Extra XP is needed only when the next quest or selected stop requires it.",
    ],
    targetLevel: null,
    targetCurrentXp: 0,
    xpOptional: false,
  };
  delete observed.xpTargetLevel;
  return observed;
}

function legacyDepartureLevel(plan: CampaignPlan, stopId: string, fallback: number): number {
  const stop = PREMADE_STOPS.find((entry) => entry.id === stopId);
  if (!stop) return fallback;
  const base = emptyPremadeProgress();
  // Only preserve bookmarks from the old all-policies maximum; it is not an execution target.
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
  const aliases: Record<string, string> = { ...plan.bookmarkAliases };
  const leaderBudget = createCampaignPickupBudget(plan.rewardFacts ?? []);
  const partyBudget = createCampaignPickupBudget(plan.rewardFacts ?? []);

  function reward(action: CampaignAction, questId: number): void {
    if (action.raidOnly || action.xpOptional) return;
    const quest = getPremadeQuest(questId);
    if (quest?.faction === "horde") return;
    if (
      (!quest?.classSlug || quest.classSlug === plan.leaderClass) &&
      (!quest?.raceIds.length || quest.raceIds.includes(plan.race))
    )
      leaderBudget.reward(questId);
    if (!action.leaderOnly && !quest?.classSlug && !quest?.raceIds.length)
      partyBudget.reward(questId);
  }
  for (const original of plan.actions) {
    if (original.legId !== currentLegId) {
      const leg = plan.legs.find((entry) => entry.id === original.legId);
      if (!leg) throw new Error(`Campaign action has no owning leg: ${original.id}`);
      const previousLeg = plan.legs.find((entry) => entry.id === currentLegId);
      const previousAction = actions.at(-1);
      const departureLevel = leg.kind === "dungeon" || leg.kind === "finish" ? leg.from : null;
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
      ) {
        const departure = departureGateAction(
          previousAction,
          departureLevel,
          leg.stopId ?? leg.id,
          leg.title,
          leg.stopId,
        );
        actions.push(departure);
        if (leg.stopId) {
          const legacyLevel = legacyDepartureLevel(plan, leg.stopId, leg.from);
          aliases[`${previousLeg.id}-departure-level-${legacyLevel}-before-${leg.stopId}`] =
            departure.id;
        }
      }
      currentLegId = original.legId;
      if (!["dungeon", "finish"].includes(leg.kind) && leg.from > 1)
        actions.push(
          legGateAction(original, leg.title, leg.kind === "starter" || original.leaderOnly),
        );
      if (!["dungeon", "finish"].includes(leg.kind)) {
        aliases[`${leg.id}-entry-level-${leg.from}`] = `${leg.id}-entry-xp`;
        if (previousLeg?.kind === "starter")
          aliases[`${previousLeg.id}-departure-level-${previousLeg.to}-before-${leg.id}`] =
            `${leg.id}-entry-xp`;
      }
    }
    const observed = actualXpAction(original);
    const sourceGateConflictQuestIds = observed.questChanges.flatMap((change) => {
      if (change.state !== "accepted" || original.source === null) return [];
      const gate = questEligibility(change.questId, plan.rewardFacts).gate;
      if (!gate) return [];
      const required = gateQuestIds(gate);
      return required.length > 0 && required.every((id) => questStates.get(id) !== "rewarded")
        ? [change.questId]
        : [];
    });
    const action = sourceGateConflictQuestIds.length
      ? { ...observed, sourceGateConflictQuestIds }
      : observed;
    for (const change of action.questChanges) {
      if (change.state === "accepted") break;
      if (change.state === "rewarded") reward(action, change.questId);
    }
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
      const gate = gateAction(action, maximum.minimumLevel, maximum.questId);
      if ((action.leaderOnly ? leaderBudget : partyBudget).isFunded(maximum.minimumLevel))
        aliases[gate.id] = action.id;
      else actions.push(gate);
      if (!action.raidOnly) {
        if (action.leaderOnly) leaderFloor = maximum.minimumLevel;
        else {
          partyFloor = maximum.minimumLevel;
          leaderFloor = Math.max(leaderFloor, maximum.minimumLevel);
        }
      }
    }
    actions.push(action);
    for (const change of action.questChanges) {
      if (change.state === "rewarded") reward(action, change.questId);
      if (change.state === "accepted" && !action.raidOnly && !action.xpOptional) {
        const minimum = questEligibility(change.questId, plan.rewardFacts).minimumLevel;
        if (minimum !== null) {
          leaderBudget.requireLevel(minimum);
          if (!action.leaderOnly) partyBudget.requireLevel(minimum);
        }
      }
    }
    if (action.kind === "xp-check" && action.targetLevel !== null && !action.raidOnly) {
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
    executionRevision: "workflow-20261020-v8",
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
      Object.entries(aliases)
        .map(([alias, target]): [string, string] => [alias, aliases[target] ?? target])
        .filter(([, target]) => ids.has(target)),
    ),
  };
}
