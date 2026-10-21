import type { LootKillEstimate } from "./quest-loot.js";

export interface LootStackWeight {
  readonly quantity: number;
  readonly percent: number;
}

/** Absorbing collection model; callers validate weights and supply a positive drop-event rate. */
export function estimateVariableStackKills(input: {
  readonly requiredItems: number;
  readonly probability: number;
  readonly independentPlayers: number;
  readonly weights: readonly LootStackWeight[];
}): LootKillEstimate {
  const { requiredItems, probability, independentPlayers } = input;
  const totalWeight = input.weights.reduce((sum, entry) => sum + entry.percent, 0);
  const weights = input.weights
    .filter((entry) => entry.percent > 0)
    .map((entry) => ({ quantity: entry.quantity, probability: entry.percent / totalWeight }));
  const minimumKills = Math.ceil(requiredItems / Math.max(...weights.map((w) => w.quantity)));
  const unknown = (reason: string): LootKillEstimate => ({ status: "unknown", reason });
  if (minimumKills / probability > 10000)
    return unknown("Expected collection exceeds the 10,000-kill planning budget.");

  let operations = 0;
  const maximumOperations = 5_000_000;
  const meanRemaining = new Float64Array(requiredItems + 1);
  // Conditioning on the first successful drop removes the no-drop self-transition.
  for (let remaining = 1; remaining <= requiredItems; remaining++) {
    let mean = 1 / probability;
    for (const weight of weights) {
      if (++operations > maximumOperations)
        return unknown("Variable-stack distribution exceeds the calculation budget.");
      mean += weight.probability * meanRemaining[Math.max(0, remaining - weight.quantity)]!;
    }
    meanRemaining[remaining] = mean;
  }
  if (meanRemaining[requiredItems]! > 10000)
    return unknown("Expected collection exceeds the 10,000-kill planning budget.");

  let current = new Float64Array(requiredItems + 1);
  let next = new Float64Array(requiredItems + 1);
  current[requiredItems] = 1;
  let complete = 0;
  let expectedMaximum = 0;
  let fast: number | null = null;
  let slow: number | null = null;
  for (let kills = 1; kills <= 10000; kills++) {
    expectedMaximum += 1 - complete ** independentPlayers;
    next.fill(0);
    for (let remaining = 1; remaining <= requiredItems; remaining++) {
      if (++operations > maximumOperations)
        return unknown("Variable-stack distribution exceeds the calculation budget.");
      const mass = current[remaining]!;
      if (mass === 0) continue;
      next[remaining] = next[remaining]! + mass * (1 - probability);
      for (const weight of weights) {
        if (++operations > maximumOperations)
          return unknown("Variable-stack distribution exceeds the calculation budget.");
        const transfer = mass * probability * weight.probability;
        if (weight.quantity >= remaining) complete += transfer;
        else next[remaining - weight.quantity] = next[remaining - weight.quantity]! + transfer;
      }
    }
    complete = Math.min(1, Math.max(0, complete));
    const allComplete = complete ** independentPlayers;
    if (fast === null && allComplete >= 0.1) fast = kills;
    if (slow === null && allComplete >= 0.9) slow = kills;
    if (fast !== null && slow !== null) {
      let residualMean = 0;
      if (independentPlayers > 1)
        for (let remaining = 1; remaining <= requiredItems; remaining++) {
          if (++operations > maximumOperations)
            return unknown("Variable-stack distribution exceeds the calculation budget.");
          residualMean += next[remaining]! * meanRemaining[remaining]!;
        }
      // The remaining maximum is bounded by the sum of all personal remaining times.
      if (independentPlayers * residualMean <= 1e-8) {
        const expectedKills =
          independentPlayers === 1 ? meanRemaining[requiredItems]! : expectedMaximum;
        if (expectedKills > 10000)
          return unknown("Expected collection exceeds the 10,000-kill planning budget.");
        return {
          status: "estimated",
          minimumKills,
          fastKills: fast,
          expectedKills,
          slowKills: slow,
        };
      }
    }
    [current, next] = [next, current];
  }
  return unknown("Drop variance exceeds the bounded planning distribution.");
}
