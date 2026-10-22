import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { gateQuestIds } from "./dungeon-model.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { PREMADE_STOPS, getPremadeQuest, premadeEntryLevel } from "./premade.js";
import { questEligibility } from "./quest-eligibility.js";
import { createCampaignPickupBudget } from "./campaign-pickup-budget.js";
import { forecastCampaignXp } from "./campaign-xp.js";

function gateAction(action: CampaignAction, minimumLevel: number, questId: number): CampaignAction {
  return {
    id: `${action.legId}-level-${minimumLevel}-${questId}`,
    legId: action.legId,
    title: `Level ${minimumLevel} required: ${action.questChanges.find((change) => change.questId === questId)?.title ?? `quest ${questId}`}`,
    instructions: [
      `${action.leaderOnly ? "You need" : "Everyone taking this quest needs"} level ${minimumLevel} to accept it. If you are already high enough, continue to the pickup.`,
      "Otherwise, finish nearby quests or defeat enemies until you reach the required level.",
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
      stopId
        ? `Get the party ready for ${destinationTitle}. The required level follows your dungeon difficulty setting.`
        : `Reach level ${level} together to finish the route.`,
      "If everyone is high enough, continue. If someone is behind, finish nearby quests or defeat enemies together until they catch up.",
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
  // Source .xp recommendations and targetless reminders are not gameplay tasks.
  // Keep their saved positions at the next task, before any new XP is earned.
  const reminders = new Set(
    plan.actions
      .filter(
        (action) =>
          action.kind === "xp-check" &&
          action.questChanges.length === 0 &&
          ((action.source !== null &&
            action.targetStopId === null &&
            action.pickupQuestId === undefined) ||
            (action.targetLevel === null && action.targetStopId === null)),
      )
      .map((action) => action.id),
  );
  const routeActions = plan.actions.filter((action) => !reminders.has(action.id));
  let nextTask: CampaignAction | undefined;
  for (const action of [...plan.actions].reverse()) {
    if (!reminders.has(action.id)) nextTask = action;
    else if (nextTask) aliases[action.id] = nextTask.id;
  }
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
  for (const original of routeActions) {
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
      if (!["dungeon", "finish"].includes(leg.kind)) {
        aliases[`${leg.id}-entry-xp`] = original.id;
        aliases[`${leg.id}-entry-level-${leg.from}`] = `${leg.id}-entry-xp`;
        if (previousLeg?.kind === "starter")
          aliases[`${previousLeg.id}-departure-level-${previousLeg.to}-before-${leg.id}`] =
            `${leg.id}-entry-xp`;
      }
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
    let action = sourceGateConflictQuestIds.length
      ? { ...original, sourceGateConflictQuestIds }
      : original;
    const originalChanges = action.questChanges;
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
      else {
        const firstPickup = action.questChanges.findIndex((change) => change.state === "accepted");
        if (firstPickup > 0) {
          const prefix = action.questChanges.slice(0, firstPickup);
          const labels = prefix.map(
            (change) => `${change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
          );
          actions.push({
            ...action,
            id: `${action.id}-before-pickup`,
            questChanges: prefix,
            title: labels.join(" · "),
            instructions: labels,
          });
          const remaining = action.questChanges.slice(firstPickup);
          action = {
            ...action,
            questChanges: remaining,
            title: remaining
              .map(
                (change) =>
                  `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
              )
              .join(" · "),
            instructions: action.instructions.filter((line) => !labels.includes(line)),
          };
        }
        actions.push(gate);
      }
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
    for (const change of originalChanges) questStates.set(change.questId, change.state);
  }
  const ids = new Set(actions.map((action) => action.id));
  if (ids.size !== actions.length) throw new Error("Duplicate campaign pickup gate identity.");
  const compiled: CampaignPlan = {
    ...plan,
    executionRevision: "workflow-20261022-v10",
    actions,
    legs: plan.legs.flatMap((leg) => {
      const owned = actions.filter((action) => action.legId === leg.id);
      if (!owned.length && plan.actions.some((action) => action.legId === leg.id)) return [];
      return [
        {
          ...leg,
          actionIds: owned.map((action) => action.id),
          questIds: [
            ...new Set(
              owned.flatMap((action) => action.questChanges.map((change) => change.questId)),
            ),
          ],
        },
      ];
    }),
    bookmarkAliases: Object.fromEntries(
      Object.entries(aliases)
        .map(([alias, originalTarget]): [string, string] => {
          let target = originalTarget;
          const visited = new Set([alias]);
          while (!ids.has(target) && aliases[target] && !visited.has(target)) {
            visited.add(target);
            target = aliases[target]!;
          }
          return [alias, target];
        })
        .filter(([, target]) => ids.has(target)),
    ),
  };
  if (!plan.combat) return compiled;
  // This is a hypothetical route start, never a write to the player's actual progress.
  const progress = emptyPremadeProgress();
  progress.members = progress.members.map((member, index) => ({
    ...member,
    level: 1,
    currentXp: 0,
    xpNeedsUpdate: false,
    classSlug: index === 0 ? plan.leaderClass : null,
  }));
  const events = forecastCampaignXp(compiled, progress, { noAssumedGrinding: true });
  const funded = new Map(
    events.flatMap((section) =>
      section.members.flatMap((member) =>
        member.steps
          .filter(
            (step) =>
              step.phase === "accepted" && step.shortfallXp === 0 && step.status === "projected",
          )
          .map((step) => [`${member.player}:${step.actionId}:${step.questId}`, true] as const),
      ),
    ),
  );
  const omitted = new Map<string, string>();
  for (const [index, action] of compiled.actions.entries()) {
    const questId = action.pickupQuestId;
    if (questId === undefined) continue;
    const next = compiled.actions[index + 1];
    const players = action.leaderOnly ? [1] : [1, 2, 3, 4, 5];
    if (next && players.every((player) => funded.has(`${player}:${next.id}:${questId}`)))
      omitted.set(action.id, next.id);
  }
  return {
    ...compiled,
    actions: compiled.actions.filter((action) => !omitted.has(action.id)),
    legs: compiled.legs.map((leg) => ({
      ...leg,
      actionIds: leg.actionIds.filter((id) => !omitted.has(id)),
    })),
    bookmarkAliases: Object.fromEntries(
      Object.entries({ ...compiled.bookmarkAliases, ...Object.fromEntries(omitted) }).map(
        ([alias, target]) => [alias, omitted.get(target) ?? target],
      ),
    ),
  };
}
