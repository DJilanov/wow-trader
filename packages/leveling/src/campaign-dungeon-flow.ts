import type { CampaignAction, CampaignPlan } from "./campaign.js";
import type { DungeonGate } from "./dungeon-model.js";
import { PREMADE_STOPS } from "./premade.js";
import { campaignDungeonQuest as getPremadeQuest } from "./campaign-dungeon-reference.js";
import { campaignGroundJourney } from "./campaign-transport.js";
import { campaignHubOrder } from "./campaign-hub-order.js";

const insideObjectives: Readonly<Record<string, readonly number[]>> = {
  blackfathom: [971, 1198, 1200, 1199, 1275],
  "razorfen-kraul": [1101, 1221, 1144],
  uldaman: [2398, 2240, 2418, 2278],
  maraudon: [7041, 7044, 7046, 7065],
  "sunken-temple": [3446, 3447, 1475, 1446, 3528, 3373],
};

function gateEvents(
  gate: DungeonGate,
  actions: readonly CampaignAction[],
): readonly { questId: number; state: string }[] {
  if (gate.kind === "quest") return [gate];
  if (gate.kind === "all") return gate.gates.flatMap((child) => gateEvents(child, actions));
  if (gate.kind === "any") {
    const possible = gate.gates.map((child) => gateEvents(child, actions));
    return (
      possible.find(
        (branch) =>
          branch.length &&
          branch.every((event) =>
            actions.some((action) =>
              action.questChanges.some(
                (change) => change.questId === event.questId && change.state === event.state,
              ),
            ),
          ),
      ) ?? []
    );
  }
  return [];
}

function phaseRank(action: CampaignAction): number {
  const change = action.questChanges[0];
  if (!change)
    return action.id.endsWith("-brief") ? -10 : action.id.endsWith("-deliveries") ? 10 : -5;
  const quest = getPremadeQuest(change.questId);
  if (change.state === "accepted") {
    if (quest?.pickupStage === "before") return 0;
    if (quest?.pickupStage === "inside" && /^Escort\b/i.test(quest.objective ?? "")) return 5;
    if (
      quest?.pickupStage === "inside" &&
      /\b(?:dropped|looted|quest-start(?:ing)? item|after (?:defeating|killing))\b|^Use\b/i.test(
        quest.pickup ?? "",
      )
    )
      return 5;
    return 2;
  }
  if (change.state === "objectives-complete") return quest?.objectiveStage === "before" ? 1 : 3;
  // Speak to an inside NPC as soon as the prerequisite objective is ready.
  // Waiting for every collection counter can carry the party past the follow-up boss.
  return action.location?.insideDungeon ? 2 : 6;
}

/** Complete inside continuations before travelling away for city rewards. */
function orderDungeonActions(
  actions: readonly CampaignAction[],
  exit: string | undefined,
  stopId: string,
): readonly CampaignAction[] {
  const phase = { accepted: 0, "objectives-complete": 1, rewarded: 2 };
  const pending = [...actions],
    result: CampaignAction[] = [];
  while (pending.length) {
    const ready = pending.filter(
      (action) =>
        !pending.some(
          (other) =>
            other !== action &&
            action.questChanges.some((change) => {
              const gate =
                change.state === "accepted" ? getPremadeQuest(change.questId)?.gate : undefined;
              return other.questChanges.some(
                (parent) =>
                  (parent.questId === change.questId &&
                    phase[parent.state] < phase[change.state]) ||
                  (change.state === "accepted" &&
                    parent.state === "rewarded" &&
                    action.requiredQuestIds?.includes(parent.questId)) ||
                  (gate &&
                    gateEvents(gate, actions).some(
                      (event) => event.questId === parent.questId && event.state === parent.state,
                    )),
              );
            }),
        ),
    );
    const objectiveRank = (action: CampaignAction): number => {
      if (action.questChanges[0]?.state !== "objectives-complete") return 0;
      const order = insideObjectives[stopId] ?? [];
      const index = order.indexOf(action.questChanges[0].questId);
      return index < 0 ? order.length : index;
    };
    ready.sort(
      (left, right) =>
        phaseRank(left) - phaseRank(right) || objectiveRank(left) - objectiveRank(right),
    );
    const current = [...result].reverse().find((action) => action.location)?.location?.zone;
    if (current && ready[0] && phaseRank(ready[0]) === 6) {
      const hubs = campaignHubOrder(
        current,
        pending
          .filter((action) => phaseRank(action) === 6)
          .flatMap((action) => action.location?.zone ?? []),
        exit,
      );
      const hubRank = (action: CampaignAction): number => {
        const index = hubs.indexOf(action.location?.zone ?? "");
        return index < 0 ? hubs.length : index;
      };
      ready.sort(
        (left, right) => phaseRank(left) - phaseRank(right) || hubRank(left) - hubRank(right),
      );
    }
    const next = ready[0];
    if (!next) throw new Error(`Cyclic dungeon quest flow in ${actions[0]?.legId}.`);
    result.push(next);
    pending.splice(pending.indexOf(next), 1);
  }
  return result;
}

function journeyLength(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null;
  return campaignGroundJourney(from, to)?.length ?? null;
}

/** Batch outside pickups on existing preparation visits; never before their recorded prerequisites. */
export function batchCampaignDungeonFlow(plan: CampaignPlan): CampaignPlan {
  const actions = [...plan.actions];
  for (const leg of plan.legs.filter(
    (entry) => entry.kind === "dungeon" && entry.stopId !== "blackrock-depths" && !entry.bundleId,
  )) {
    const stop = PREMADE_STOPS.find((entry) => entry.id === leg.stopId);
    if (!stop) continue;
    const legIndex = plan.legs.indexOf(leg);
    let previous = legIndex - 1;
    while (
      previous >= 0 &&
      plan.legs[previous]?.kind !== "dungeon" &&
      plan.legs[previous]?.kind !== "starter"
    )
      previous--;
    const preparation = new Set(plan.legs.slice(previous + 1, legIndex).map((entry) => entry.id));
    const pickups = actions.filter(
      (action) =>
        action.legId === leg.id &&
        action.questChanges.length === 1 &&
        action.questChanges[0]?.state === "accepted" &&
        getPremadeQuest(action.questChanges[0].questId)?.pickupStage === "before" &&
        action.location,
    );
    for (const pickup of pickups) {
      const quest = getPremadeQuest(pickup.questChanges[0]!.questId)!;
      const events = gateEvents(quest.gate, actions);
      if (
        events.some(
          (event) =>
            !actions.some((action) =>
              action.questChanges.some(
                (change) => change.questId === event.questId && change.state === event.state,
              ),
            ),
        )
      )
        continue;
      const floor = Math.max(
        -1,
        ...events.map((event) =>
          actions.findIndex((action) =>
            action.questChanges.some(
              (change) => change.questId === event.questId && change.state === event.state,
            ),
          ),
        ),
      );
      const candidates: { index: number; legId: string; distance: number }[] = [];
      for (const [index, next] of actions.entries()) {
        if (index <= floor || !preparation.has(next.legId)) continue;
        const targetLeg = plan.legs.find((entry) => entry.id === next.legId)!;
        if (quest.minimumLevel !== null && targetLeg.from < quest.minimumLevel) continue;
        const before = actions
          .slice(0, index)
          .reverse()
          .find((entry) => entry.location);
        const after = actions.slice(index).find((entry) => entry.location && entry !== pickup);
        const direct = journeyLength(before?.location?.zone, after?.location?.zone);
        const first = journeyLength(before?.location?.zone, pickup.location?.zone);
        const last = journeyLength(pickup.location?.zone, after?.location?.zone);
        if (direct === null || first === null || last === null) continue;
        candidates.push({ index, legId: next.legId, distance: first + last - direct });
      }
      candidates.sort((left, right) => left.distance - right.distance || right.index - left.index);
      const best = candidates[0];
      if (!best) continue;
      const old = actions.indexOf(pickup);
      if (old < best.index) continue;
      actions.splice(old, 1);
      actions.splice(best.index, 0, { ...pickup, legId: best.legId });
    }
    const after = actions.findIndex((action) => action.legId === leg.id);
    const last = actions.reduce(
      (index, action, offset) => (action.legId === leg.id ? offset : index),
      after,
    );
    const exit = actions.slice(last + 1).find((action) => action.location)?.location?.zone;
    const ordered = orderDungeonActions(
      actions.filter((action) => action.legId === leg.id),
      exit,
      stop.id,
    );
    const start = actions.findIndex((action) => action.legId === leg.id);
    if (start >= 0) actions.splice(start, ordered.length, ...ordered);
  }
  return {
    ...plan,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  };
}
