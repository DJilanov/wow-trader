import { DUNGEON_QUESTS } from "./dungeon-catalog.js";
import type { DungeonGate, GateResult } from "./dungeon-model.js";
import type { PremadeMember } from "./premade-model.js";
import type { QuestRewardFact } from "./quest-rewards.js";

const quests = new Map(DUNGEON_QUESTS.map((quest) => [quest.id, quest]));
const reviewedMinimums: Readonly<Record<number, number>> = { 261: 34, 1053: 34, 1100: 29 };

export interface QuestEligibility {
  readonly minimumLevel: number | null;
  readonly minimumConflict: boolean;
  readonly minimumClaims: readonly number[];
  readonly gate: DungeonGate | null;
  readonly lifecycleKnown: boolean;
}

export function questEligibility(
  questId: number,
  facts: readonly QuestRewardFact[] = [],
): QuestEligibility {
  const quest = quests.get(questId);
  const fact = facts.find((entry) => entry.questId === questId);
  const claims = [
    ...new Set(
      [quest?.minimumLevel, reviewedMinimums[questId], fact?.minimumLevel].filter(
        (level): level is number => level !== null && level !== undefined,
      ),
    ),
  ];
  return {
    minimumLevel: claims.length ? Math.max(...claims) : null,
    minimumConflict: claims.length > 1,
    minimumClaims: claims,
    gate: quest?.gate ?? null,
    lifecycleKnown: quest !== undefined && quest.pickupStage !== "unknown",
  };
}

export function questGateResult(gate: DungeonGate, member: PremadeMember): GateResult {
  if (gate.kind === "item" || gate.kind === "confirmation") {
    const result = member.confirmations[gate.kind === "item" ? `item-${gate.itemId}` : gate.id];
    return result === undefined ? "unknown" : result ? "ready" : "blocked";
  }
  if (gate.kind === "quest") {
    const state = member.questStates[String(gate.questId)];
    const rank = { "not-started": 0, accepted: 1, "objectives-complete": 2, rewarded: 3 };
    return state && rank[state] >= rank[gate.state] ? "ready" : "blocked";
  }
  const children = gate.gates.map((child) => questGateResult(child, member));
  if (gate.kind === "all")
    return children.includes("blocked")
      ? "blocked"
      : children.includes("unknown")
        ? "unknown"
        : "ready";
  return children.includes("ready")
    ? "ready"
    : children.includes("unknown")
      ? "unknown"
      : "blocked";
}
