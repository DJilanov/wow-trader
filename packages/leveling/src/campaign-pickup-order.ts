import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { emptyPremadeProgress } from "./premade-model.js";
import { forecastCampaignXp } from "./campaign-xp.js";
import { questEligibility } from "./quest-eligibility.js";

/** Evaluate generated pickup reminders after preparation, immediately before their actual pickup. */
export function alignCampaignPickupChecks(plan: CampaignPlan): CampaignPlan {
  const destinations = new Map<string, CampaignAction[]>();
  const relocated = new Set<string>();
  for (const [index, action] of plan.actions.entries()) {
    if (
      action.kind !== "xp-check" ||
      action.source !== null ||
      action.questChanges.length ||
      action.pickupQuestId === undefined
    )
      continue;
    const candidates: CampaignAction[] = [];
    for (const next of plan.actions.slice(index + 1)) {
      if (next.legId !== action.legId) break;
      if (
        next.leaderOnly === action.leaderOnly &&
        next.raidOnly === action.raidOnly &&
        next.dungeonFinishOnly === action.dungeonFinishOnly &&
        next.questChanges.some(
          (change) => change.questId === action.pickupQuestId && change.state === "accepted",
        )
      )
        candidates.push(next);
    }
    if (candidates.length !== 1) continue;
    const pickup = candidates[0]!;
    destinations.set(pickup.id, [...(destinations.get(pickup.id) ?? []), action]);
    relocated.add(action.id);
  }
  if (!relocated.size) return plan;
  const actions = plan.actions.flatMap((action) =>
    relocated.has(action.id) ? [] : [...(destinations.get(action.id) ?? []), action],
  );
  if (actions.every((action, index) => action === plan.actions[index])) return plan;
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}

function questPart(
  action: CampaignAction,
  changes: CampaignAction["questChanges"],
  id: string,
): CampaignAction {
  const removed = action.questChanges.filter((change) => !changes.includes(change));
  return {
    ...action,
    id,
    questChanges: changes,
    title: changes
      .map(
        (change) =>
          `${change.state === "accepted" ? "Accept" : change.state === "rewarded" ? "Turn in" : "Complete"} ${change.title}`,
      )
      .join(" · "),
    instructions: action.instructions.filter(
      (line) =>
        !removed.some((change) => line.includes(change.title)) ||
        changes.some((change) => line.includes(change.title)),
    ),
  };
}

/** Finish independent on-route tasks before returning for a pickup that is not available yet. */
export function deferUnfundedStarterPickups(initial: CampaignPlan): CampaignPlan {
  let plan = initial;
  const base = emptyPremadeProgress();
  const progress = {
    ...base,
    members: base.members.map((member) => ({
      ...member,
      level: 1,
      currentXp: 0,
      xpNeedsUpdate: false,
    })),
  };
  const gates = initial.actions.filter(
    (action) => action.leaderOnly && action.pickupQuestId !== undefined,
  );
  const covered = new Set(gates.map((gate) => gate.pickupQuestId));
  for (const action of initial.actions) {
    if (
      action.kind !== "quests" ||
      !action.leaderOnly ||
      initial.legs.find((leg) => leg.id === action.legId)?.kind !== "starter"
    )
      continue;
    for (const change of action.questChanges) {
      if (change.state !== "accepted" || covered.has(change.questId)) continue;
      const minimum = questEligibility(change.questId, initial.rewardFacts).minimumLevel;
      if (minimum === null || minimum <= 1) continue;
      gates.push({ ...action, pickupQuestId: change.questId, targetLevel: minimum });
      covered.add(change.questId);
    }
  }
  for (const gate of gates) {
    const forecastBefore = forecastCampaignXp(plan, progress);
    const checkpoint = forecastBefore
      .flatMap((section) => section.members[0]!.checkpoints)
      .find((entry) => entry.actionId === gate.id);
    const questId = gate.pickupQuestId!;
    const blockedPickup = forecastBefore
      .flatMap((section) => section.members[0]!.steps)
      .some(
        (step) =>
          step.questId === questId &&
          step.phase === "accepted" &&
          step.status === "blocked" &&
          step.shortfallXp > 0,
      );
    if ((!checkpoint || checkpoint.ready) && !blockedPickup) continue;
    const pickup = plan.actions.find(
      (action) =>
        action.leaderOnly &&
        action.questChanges.every(
          (change) => change.state === "accepted" || change.state === "rewarded",
        ) &&
        action.questChanges.some((change) => change.questId === questId),
    );
    if (
      !pickup ||
      plan.legs.find((leg) => leg.id === pickup.legId)?.kind !== "starter" ||
      gate.targetLevel === null
    )
      continue;
    const otherChanges = pickup.questChanges.filter((change) => change.questId !== questId);
    const deferred = otherChanges.length
      ? questPart(
          pickup,
          pickup.questChanges.filter((change) => change.questId === questId),
          `${pickup.id}-deferred-${questId}`,
        )
      : pickup;
    let probeActions = plan.actions.flatMap((action) => {
      if (gate.kind === "xp-check" && action.id === gate.id) return [];
      if (action.id !== pickup.id) return [action];
      return otherChanges.length
        ? [
            {
              ...questPart(pickup, otherChanges, pickup.id),
              ...(otherChanges.some((change) => change.state === "accepted")
                ? {}
                : { requiredQuestIds: [] }),
            },
          ]
        : [];
    });
    let firstNeed = probeActions.findIndex(
      (action) =>
        action.requiredQuestIds?.includes(questId) ||
        action.questChanges.some(
          (change) => change.questId === questId && change.state !== "accepted",
        ),
    );
    if (firstNeed < 0) continue;
    const needing = probeActions[firstNeed]!;
    const firstChange = needing.questChanges.findIndex((change) => change.questId === questId);
    const prefix = needing.questChanges.slice(0, firstChange);
    let prefixId: string | null = null;
    if (
      firstChange > 0 &&
      prefix.some((change) => change.state === "rewarded") &&
      prefix.every((change) => change.state !== "objectives-complete")
    ) {
      prefixId = `${needing.id}-before-deferred-${questId}`;
      const before: CampaignAction = {
        ...questPart(needing, prefix, prefixId),
        ...(prefix.some((change) => change.state === "accepted") ? {} : { requiredQuestIds: [] }),
      };
      const after = questPart(needing, needing.questChanges.slice(firstChange), needing.id);
      probeActions = [
        ...probeActions.slice(0, firstNeed),
        before,
        after,
        ...probeActions.slice(firstNeed + 1),
      ];
      firstNeed++;
    }
    const order = new Map(probeActions.map((action, index) => [action.id, index]));
    const pickupIndex = plan.actions.findIndex((action) => action.id === pickup.id);
    const forecast = forecastCampaignXp({ ...plan, actions: probeActions }, progress);
    const steps = forecast.flatMap((section) => section.members[0]!.steps);
    const earned = steps.find(
      (step) =>
        step.after !== null &&
        step.after.level >= gate.targetLevel! &&
        step.status === "projected" &&
        steps
          .filter((entry) => entry.actionId === step.actionId)
          .every((entry) => entry.after !== null) &&
        (order.get(step.actionId) ?? Infinity) < firstNeed &&
        plan.actions.findIndex(
          (action) => action.id === (step.actionId === prefixId ? needing.id : step.actionId),
        ) > pickupIndex &&
        probeActions[order.get(step.actionId)!]?.legId === pickup.legId,
    );
    if (!earned) continue;
    const insertion = probeActions.findIndex((action) => action.id === earned.actionId) + 1;
    const actions = [
      ...probeActions.slice(0, insertion),
      deferred,
      ...probeActions.slice(insertion),
    ];
    plan = {
      ...plan,
      actions,
      bookmarkAliases: {
        ...plan.bookmarkAliases,
        ...(gate.kind === "xp-check" ? { [gate.id]: deferred.id } : {}),
      },
      legs: plan.legs.map((leg) => ({
        ...leg,
        actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
      })),
    };
  }
  return plan;
}
