import type { CampaignAction, CampaignQuestChange } from "./campaign.js";
import type { PremadeMember } from "./premade-model.js";
import { campaignSourceChecks } from "./campaign-source-conditions.js";
import {
  evaluateCampaignSourceChecks,
  type CampaignSourceDecision,
} from "./campaign-source-condition-state.js";

type QuestState = PremadeMember["questStates"][string];

export interface CampaignQuestLogConditions {
  readonly inferredCarriedQuestIds: readonly number[];
  decision(action: CampaignAction): CampaignSourceDecision;
  advance(change: CampaignQuestChange, decision: CampaignSourceDecision): void;
}

/** Overapproximate conditional branches; an uncertain hand-in cannot free a slot. */
export function createCampaignQuestLogConditions(
  actions: readonly CampaignAction[],
  member: PremadeMember,
  objectiveIndices: ReadonlyMap<number, ReadonlySet<number>>,
  recordedTurnIns: readonly number[] = [],
): CampaignQuestLogConditions {
  const states: Record<string, QuestState | readonly QuestState[]> = { ...member.questStates };
  for (const id of recordedTurnIns) {
    const prior = member.questStates[String(id)];
    states[String(id)] =
      prior === "accepted" || prior === "objectives-complete" ? [prior, "rewarded"] : "rewarded";
  }
  const inferred = new Set<number>(),
    seen = new Set<number>();
  for (const action of actions)
    for (const change of action.questChanges) {
      if (seen.has(change.questId)) continue;
      seen.add(change.questId);
      const prior = member.questStates[String(change.questId)];
      if (
        change.state !== "accepted" &&
        states[String(change.questId)] !== "rewarded" &&
        prior !== "accepted" &&
        prior !== "objectives-complete"
      ) {
        inferred.add(change.questId);
        states[String(change.questId)] = ["not-started", "accepted", "objectives-complete"];
      }
    }
  const completed = new Map<number, Set<number>>();
  for (const [id, indices] of objectiveIndices)
    completed.set(
      id,
      new Set(
        [...indices].filter((index) => member.confirmations[`campaign-objective-${id}-${index}`]),
      ),
    );
  const uncertain = new Set<number>([
    ...inferred,
    ...Object.entries(member.questStates)
      .filter(([, state]) => state === "accepted")
      .map(([id]) => Number(id)),
  ]);
  const possibilities = (id: number): readonly QuestState[] => {
    const value = states[String(id)] ?? "not-started";
    return typeof value === "string" ? [value] : value;
  };
  return {
    inferredCarriedQuestIds: [...inferred],
    decision: (action): CampaignSourceDecision =>
      evaluateCampaignSourceChecks(campaignSourceChecks(action), {
        questStates: states,
      }),
    advance: (change, decision): void => {
      if (decision === "skip") return;
      const before = possibilities(change.questId);
      const next = new Set<QuestState>();
      const indices = completed.get(change.questId) ?? new Set<number>();
      if (change.state === "objectives-complete") {
        if (decision === "execute") indices.add(change.objectiveIndex ?? 1);
        else uncertain.add(change.questId);
        completed.set(change.questId, indices);
      }
      const done = [...(objectiveIndices.get(change.questId) ?? [])].every((index) =>
        indices.has(index),
      );
      for (const state of before) {
        if (state === "rewarded") next.add(state);
        else if (change.state === "accepted") {
          next.add(state === "not-started" ? "accepted" : state);
          // Pre-collected items can make a newly accepted quest ready immediately.
          if (state === "not-started") {
            next.add("objectives-complete");
            uncertain.add(change.questId);
          }
        } else if (change.state === "rewarded")
          next.add(state === "not-started" ? state : "rewarded");
        else if (state === "not-started") next.add(state);
        else {
          next.add(state === "objectives-complete" || done ? "objectives-complete" : "accepted");
          if (uncertain.has(change.questId)) next.add("objectives-complete");
        }
      }
      if (decision === "unknown") for (const state of before) next.add(state);
      states[String(change.questId)] = next.size === 1 ? [...next][0]! : [...next];
    },
  };
}
