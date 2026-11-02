import type { LootKillEstimate } from "./quest-loot.js";

export interface JointLootComponent {
  readonly successes: number;
  readonly probability: number;
  readonly independentPlayers: number;
}

export interface EstimatedJointLootKills extends Extract<
  LootKillEstimate,
  { status: "estimated" }
> {
  readonly expectedKillsLowerBound: number;
  readonly expectedKillsUpperBound: number;
}

export type JointLootKillEstimate =
  EstimatedJointLootKills | Extract<LootKillEstimate, { status: "unknown" }>;

/** Independent fixed-stack completion times; the caller must establish independence. */
export function estimateJointLootKills(
  components: readonly JointLootComponent[],
  minimumKills = 0,
): JointLootKillEstimate {
  if (
    !components.length ||
    components.length > 100 ||
    !Number.isInteger(minimumKills) ||
    minimumKills < 0 ||
    minimumKills > 10000
  )
    throw new Error("Invalid joint collection inputs.");
  for (const component of components)
    if (
      !Number.isInteger(component.successes) ||
      component.successes < 1 ||
      component.successes > 10000 ||
      !Number.isFinite(component.probability) ||
      component.probability < 0 ||
      component.probability > 1 ||
      !Number.isInteger(component.independentPlayers) ||
      component.independentPlayers < 1 ||
      component.independentPlayers > 5
    )
      throw new Error("Invalid joint collection component.");
  const unknown = (reason: string): JointLootKillEstimate => ({ status: "unknown", reason });
  if (components.some((component) => component.probability === 0))
    return unknown("A joint collection has no positive drop probability.");
  if (components.some((component) => component.successes / component.probability > 10000))
    return unknown("Expected joint collection exceeds the planning budget.");
  const deterministic = Math.max(
    minimumKills,
    ...components
      .filter((component) => component.probability === 1)
      .map((component) => component.successes),
  );
  const random = components.filter((component) => component.probability < 1);
  const minimum = Math.max(deterministic, ...components.map((component) => component.successes));
  if (!random.length)
    return {
      status: "estimated",
      minimumKills: minimum,
      fastKills: minimum,
      slowKills: minimum,
      expectedKills: minimum,
      expectedKillsLowerBound: minimum,
      expectedKillsUpperBound: minimum,
    };
  if (random.reduce((sum, component) => sum + component.successes, 0) > 100000)
    return unknown("Joint collection state exceeds the calculation budget.");
  const states = random.map((component) => {
    const current = new Float64Array(component.successes + 1);
    current[component.successes] = 1;
    return { ...component, current, next: new Float64Array(current.length), complete: 0 };
  });
  let operations = 0,
    expected = 0,
    cdf = 0;
  let fast: number | null = null,
    slow: number | null = null;
  // For one random collector, E[max(N,T)] = N + E[remaining time after N kills].
  let exactMean =
    states.length === 1 && states[0]!.independentPlayers === 1 && deterministic === 0
      ? states[0]!.successes / states[0]!.probability
      : null;
  for (let kills = 1; kills <= 10000; kills++) {
    expected += 1 - cdf;
    cdf = kills >= deterministic ? 1 : 0;
    let residual = Math.max(0, deterministic - kills);
    for (const state of states) {
      state.next.fill(0);
      let remainingMean = 0;
      for (let remaining = 1; remaining <= state.successes; remaining++) {
        if (++operations > 5000000)
          return unknown("Joint collection exceeds the calculation budget.");
        const mass = state.current[remaining]!;
        state.next[remaining] = state.next[remaining]! + mass * (1 - state.probability);
        if (remaining === 1) state.complete += mass * state.probability;
        else state.next[remaining - 1] = state.next[remaining - 1]! + mass * state.probability;
      }
      for (let remaining = 1; remaining <= state.successes; remaining++) {
        if (++operations > 5000000)
          return unknown("Joint collection exceeds the calculation budget.");
        remainingMean += (state.next[remaining]! * remaining) / state.probability;
      }
      residual += state.independentPlayers * remainingMean;
      if (states.length === 1 && state.independentPlayers === 1 && kills === deterministic)
        exactMean = deterministic + remainingMean;
      state.complete = Math.min(1, Math.max(0, state.complete));
      cdf *= state.complete ** state.independentPlayers;
      [state.current, state.next] = [state.next, state.current];
    }
    if (fast === null && cdf >= 0.1) fast = kills;
    if (slow === null && cdf >= 0.9) slow = kills;
    if (fast !== null && slow !== null && residual <= 1e-10) {
      const lower = exactMean ?? expected,
        upper = exactMean ?? expected + residual;
      if (upper > 10000) return unknown("Expected joint collection exceeds the planning budget.");
      return {
        status: "estimated",
        minimumKills: minimum,
        fastKills: fast,
        slowKills: slow,
        expectedKills: (lower + upper) / 2,
        expectedKillsLowerBound: lower,
        expectedKillsUpperBound: upper,
      };
    }
  }
  return unknown("Joint collection variance exceeds the bounded distribution.");
}
