import { combatNpcSchema, type CombatNpc, type KillXpEvidence } from "./combat-model.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatKillEstimate,
  type CombatXpPosition,
} from "./combat-xp.js";

export const PARTY_XP_FRONTIER_REVISION = "joint-party-xp-frontier-20261102-v1";
type KnownCombatBasis = Exclude<CombatKillEstimate["basis"], "unknown">;

export interface PartyXpState {
  readonly positions: readonly CombatXpPosition[];
  /** Marginal earned-XP bounds for paths merged at these exact joint bars. */
  readonly minimumEarnedXp: readonly number[];
  readonly maximumEarnedXp: readonly number[];
}

export interface PartyXpFrontier {
  readonly states: readonly PartyXpState[];
  readonly combatBasis: readonly KnownCombatBasis[];
  readonly observedSources: readonly (readonly string[])[];
}

export type PartyXpFrontierResult =
  | { readonly status: "bounded"; readonly frontier: PartyXpFrontier; readonly transitions: number }
  | { readonly status: "unknown"; readonly reason: string; readonly transitions: number };

export interface PartyXpFrontierLimits {
  readonly maximumStates?: number;
  readonly maximumTransitions?: number;
}

export interface PartyCreatureBatch {
  readonly npc: CombatNpc;
  readonly kills: number;
  readonly environment: "outdoor" | "dungeon";
  readonly dungeonMultiplier?: number | null;
  readonly evidence?: readonly KillXpEvidence[];
  readonly build?: number;
  readonly xpMultiplier?: number;
}

export interface PartyXpFrontierBound {
  readonly minimumXp: number;
  readonly maximumXp: number;
  readonly minimumExit: CombatXpPosition;
  readonly maximumExit: CombatXpPosition;
}

function compareBars(left: CombatXpPosition, right: CombatXpPosition): number {
  return left.level - right.level || left.currentXp - right.currentXp;
}

function validXp(xp: number): boolean {
  return Number.isSafeInteger(xp) && xp >= 0;
}

function validateFrontier(frontier: PartyXpFrontier): number {
  const size = frontier.combatBasis.length;
  if (
    size < 1 ||
    size > 5 ||
    !frontier.states.length ||
    frontier.states.length > 10000 ||
    frontier.observedSources.length !== size ||
    frontier.combatBasis.some(
      (basis) => !["excluded", "observed", "reference-estimate"].includes(basis),
    )
  )
    throw new Error("Invalid joint-party XP frontier.");
  for (const state of frontier.states) {
    if (
      state.positions.length !== size ||
      state.minimumEarnedXp.length !== size ||
      state.maximumEarnedXp.length !== size
    )
      throw new Error("Joint-party XP state sizes disagree.");
    state.positions.forEach((bar, player) => {
      advanceCombatPosition(bar, 0);
      if (
        !validXp(state.minimumEarnedXp[player]!) ||
        !validXp(state.maximumEarnedXp[player]!) ||
        state.minimumEarnedXp[player]! > state.maximumEarnedXp[player]!
      )
        throw new Error("Invalid joint-party earned XP bounds.");
    });
  }
  return size;
}

function mergeState(states: Map<string, PartyXpState>, state: PartyXpState): void {
  const key = state.positions.map((bar) => `${bar.level}:${bar.currentXp}`).join(",");
  const previous = states.get(key);
  states.set(
    key,
    previous
      ? {
          positions: state.positions,
          minimumEarnedXp: state.minimumEarnedXp.map((xp, player) =>
            Math.min(xp, previous.minimumEarnedXp[player]!),
          ),
          maximumEarnedXp: state.maximumEarnedXp.map((xp, player) =>
            Math.max(xp, previous.maximumEarnedXp[player]!),
          ),
        }
      : state,
  );
}

function addPayouts(state: PartyXpState, payouts: readonly number[]): PartyXpState {
  const minimumEarnedXp = state.minimumEarnedXp.map((xp, player) => xp + payouts[player]!);
  const maximumEarnedXp = state.maximumEarnedXp.map((xp, player) => xp + payouts[player]!);
  if (![...minimumEarnedXp, ...maximumEarnedXp].every(validXp))
    throw new Error("Joint-party XP exceeds safe integer precision.");
  return {
    positions: state.positions.map((bar, player) => advanceCombatPosition(bar, payouts[player]!)),
    minimumEarnedXp,
    maximumEarnedXp,
  };
}

export function createPartyXpFrontier(positions: readonly CombatXpPosition[]): PartyXpFrontier {
  if (positions.length < 1 || positions.length > 5)
    throw new Error("Joint XP requires one to five players.");
  return {
    states: [
      {
        positions: positions.map((bar) => advanceCombatPosition(bar, 0)),
        minimumEarnedXp: positions.map(() => 0),
        maximumEarnedXp: positions.map(() => 0),
      },
    ],
    combatBasis: positions.map(() => "excluded"),
    observedSources: positions.map(() => []),
  };
}

/** Bounds are marginal summaries. Their minimum bars must never seed a new joint frontier. */
export function partyXpFrontierBounds(frontier: PartyXpFrontier): readonly PartyXpFrontierBound[] {
  const size = validateFrontier(frontier);
  return Array.from({ length: size }, (_unused, player): PartyXpFrontierBound => {
    const bars = frontier.states.map((state) => state.positions[player]!);
    return {
      minimumXp: frontier.states.reduce(
        (xp, state) => Math.min(xp, state.minimumEarnedXp[player]!),
        Infinity,
      ),
      maximumXp: frontier.states.reduce(
        (xp, state) => Math.max(xp, state.maximumEarnedXp[player]!),
        0,
      ),
      minimumExit: { ...bars.reduce((a, b) => (compareBars(a, b) <= 0 ? a : b)) },
      maximumExit: { ...bars.reduce((a, b) => (compareBars(a, b) >= 0 ? a : b)) },
    };
  });
}

/** Enumerate permitted creature levels, without assigning spawn probabilities or inventing payout correlations. */
export function advancePartyXpKills(
  frontier: PartyXpFrontier,
  input: PartyCreatureBatch,
  limits: PartyXpFrontierLimits = {},
): PartyXpFrontierResult {
  const size = validateFrontier(frontier);
  combatNpcSchema.parse(input.npc);
  const maximumStates = limits.maximumStates ?? 4096;
  const maximumTransitions = limits.maximumTransitions ?? 250000;
  if (
    !Number.isSafeInteger(input.kills) ||
    input.kills < 0 ||
    input.kills > 10000 ||
    !Number.isSafeInteger(maximumStates) ||
    maximumStates < 1 ||
    maximumStates > 10000 ||
    !Number.isSafeInteger(maximumTransitions) ||
    maximumTransitions < 1 ||
    maximumTransitions > 1000000
  )
    throw new Error("Invalid joint-party combat budget.");
  const estimate = (
    bars: readonly CombatXpPosition[],
    npc: CombatNpc,
    player: number,
    kills: number,
  ): CombatKillEstimate =>
    estimateCreatureKills({
      ...input,
      npc,
      kills,
      position: bars[player]!,
      partySize: size,
      partyLevels: bars.map((bar) => bar.level),
      playerIndex: player,
    });
  const initialBars = frontier.states[0]!.positions;
  initialBars.forEach((_bar, player) => estimate(initialBars, input.npc, player, 0));
  let transitions = 0;
  const unknown = (reason: string): PartyXpFrontierResult => ({
    status: "unknown",
    reason,
    transitions,
  });
  if (frontier.states.length > maximumStates)
    return unknown("The joint-party starting frontier exceeds its state budget.");
  if (
    !input.kills ||
    input.npc.xpEligibility === "excluded" ||
    frontier.states.every((state) => state.positions.every((bar) => bar.level === 60))
  )
    return { status: "bounded", frontier, transitions };
  const { minimumLevel, maximumLevel } = input.npc;
  if (
    input.npc.xpEligibility === "unknown" ||
    minimumLevel === null ||
    maximumLevel === null ||
    input.npc.rank === null
  )
    return unknown("Creature level, rank or XP eligibility is unresolved.");
  if (maximumLevel - minimumLevel > 10)
    return unknown("Creature level distribution is too broad for a joint kill estimate.");
  let states = frontier.states;
  const combatBasis = [...frontier.combatBasis];
  const sources = frontier.observedSources.map((entries) => new Set(entries));
  const cache = new Map<string, readonly CombatKillEstimate[]>();
  for (let kill = 0; kill < input.kills; kill++) {
    const next = new Map<string, PartyXpState>();
    for (const state of states) {
      for (let level = minimumLevel; level <= maximumLevel; level++) {
        if (transitions === maximumTransitions)
          return unknown(
            "Joint-party combat exceeded its transition budget; no partial payout is returned.",
          );
        transitions++;
        const key = state.positions.map((bar) => bar.level).join(",") + ":" + level;
        let payouts = cache.get(key);
        if (!payouts) {
          const npc = { ...input.npc, minimumLevel: level, maximumLevel: level };
          payouts = state.positions.map((_bar, player) =>
            estimate(state.positions, npc, player, 1),
          );
          cache.set(key, payouts);
        }
        for (const [player, payout] of payouts.entries()) {
          if (payout.xp === null || payout.basis === "unknown")
            return unknown(payout.reason ?? "A joint-party creature payout is unresolved.");
          if (payout.maximumXp !== payout.xp)
            return unknown(
              "A creature-level outcome has a non-exact per-player payout; joint payout correlation is unresolved.",
            );
          if (
            payout.basis === "reference-estimate" ||
            (payout.basis === "observed" && combatBasis[player] === "excluded")
          )
            combatBasis[player] = payout.basis;
          for (const source of payout.observedSources ?? []) sources[player]!.add(source);
        }
        // Cached payouts depend on the common pre-kill levels; their cached exit bars do not.
        mergeState(
          next,
          addPayouts(
            state,
            payouts.map((payout) => payout.xp!),
          ),
        );
        if (next.size > maximumStates)
          return unknown(
            "Joint-party combat exceeded its state budget; no partial payout is returned.",
          );
      }
    }
    states = [...next.values()];
  }
  return {
    status: "bounded",
    frontier: { states, combatBasis, observedSources: sources.map((set) => [...set]) },
    transitions,
  };
}

/** Caller proves eligibility and supplies each one-time hand-in once. Null skips that player. */
export function awardPartyXp(
  frontier: PartyXpFrontier,
  rewardsByPlayer: readonly (ReadonlyMap<number, number | null> | null)[],
): PartyXpFrontierResult {
  const size = validateFrontier(frontier);
  if (rewardsByPlayer.length !== size)
    throw new Error("Party reward count differs from its XP frontier.");
  for (const rewards of rewardsByPlayer) {
    if (rewards && rewards.size > 60) throw new Error("Too many party reward levels.");
    for (const [level, xp] of rewards ?? [])
      if (
        !Number.isSafeInteger(level) ||
        level < 1 ||
        level > 60 ||
        (xp !== null && (!validXp(xp) || xp > 100000000))
      )
        throw new Error("Invalid party reward level or XP.");
  }
  const states = new Map<string, PartyXpState>();
  for (const state of frontier.states) {
    const payouts = state.positions.map((bar, player) =>
      rewardsByPlayer[player] === null ? 0 : rewardsByPlayer[player]!.get(bar.level),
    );
    if (!payouts.every((xp): xp is number => xp !== undefined && xp !== null))
      return {
        status: "unknown",
        reason:
          "A party hand-in reward is unresolved at a reachable player level; no partial payout is returned.",
        transitions: 0,
      };
    mergeState(states, addPayouts(state, payouts));
  }
  return {
    status: "bounded",
    frontier: { ...frontier, states: [...states.values()] },
    transitions: 0,
  };
}
