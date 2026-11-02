import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatKillEstimate,
  type CombatXpPosition,
} from "./combat-xp.js";

export interface PartyCreatureKillInput {
  readonly npc: CombatNpc;
  readonly kills: number;
  readonly positions: readonly CombatXpPosition[];
  readonly environment: "outdoor" | "dungeon";
  readonly dungeonMultiplier?: number | null;
  readonly evidence?: readonly KillXpEvidence[];
  readonly build?: number;
  readonly xpMultiplier?: number;
}

/** All members receive each kill at the same instant, before anyone's next kill is evaluated. */
export function estimatePartyCreatureKills(
  input: PartyCreatureKillInput,
): readonly CombatKillEstimate[] {
  const { positions, kills, ...shared } = input;
  if (
    positions.length < 1 ||
    positions.length > 5 ||
    !Number.isInteger(kills) ||
    kills < 0 ||
    kills > 10000
  )
    throw new Error("Invalid shared-party combat inputs.");
  const initial = positions.map((position) => advanceCombatPosition(position, 0));
  const estimate = (
    bars: readonly CombatXpPosition[],
    playerIndex: number,
    count: number,
    synchronizedParty = false,
  ): CombatKillEstimate =>
    estimateCreatureKills({
      ...shared,
      kills: count,
      position: bars[playerIndex]!,
      partySize: bars.length,
      partyLevels: bars.map((bar) => bar.level),
      playerIndex,
      synchronizedParty,
    });
  const zero = initial.map((_, player) => estimate(initial, player, 0));
  if (!kills) return zero;
  const identical = initial.every(
    (bar) => bar.level === initial[0]!.level && bar.currentXp === initial[0]!.currentXp,
  );
  if (identical) return initial.map((_, player) => estimate(initial, player, kills, true));

  const unknown = (reason: string): readonly CombatKillEstimate[] =>
    initial.map((exit) => ({
      xp: null,
      maximumXp: null,
      exit,
      basis: "unknown",
      reason,
    }));
  // A level interval does not specify which member crosses a boundary first. Fixed peer
  // levels are safe only when even the maximum payout cannot change any member's level.
  if (input.npc.minimumLevel !== input.npc.maximumLevel) {
    const fixed = initial.map((_, player) => estimate(initial, player, kills));
    if (
      fixed.every(
        (entry, player) =>
          entry.maximumXp !== null &&
          advanceCombatPosition(initial[player]!, entry.maximumXp).level === initial[player]!.level,
      )
    )
      return fixed;
    return unknown(
      "An unequal party crossing levels needs an exact creature level; no mob-level distribution is assumed.",
    );
  }
  const totals = initial.map(() => 0);
  const bases = initial.map(() => new Set<CombatKillEstimate["basis"]>());
  const sources = initial.map(() => new Set<string>());
  let current = initial;
  for (let kill = 0; kill < kills; kill++) {
    const payouts = current.map((_, player) => estimate(current, player, 1));
    const missing = payouts.find((payout) => payout.xp === null || payout.xp !== payout.maximumXp);
    if (missing)
      return unknown(missing.reason ?? "Conflicting shared-party kill payouts require review.");
    for (const [player, payout] of payouts.entries()) {
      totals[player]! += payout.xp!;
      bases[player]!.add(payout.basis);
      for (const source of payout.observedSources ?? []) sources[player]!.add(source);
    }
    current = payouts.map((payout) => payout.exit);
  }
  return current.map((exit, player): CombatKillEstimate => {
    const basis = bases[player]!.has("reference-estimate")
      ? "reference-estimate"
      : bases[player]!.has("observed")
        ? "observed"
        : "excluded";
    return {
      xp: totals[player]!,
      maximumXp: totals[player]!,
      exit,
      basis,
      reason: null,
      ...(basis === "observed" ? { observedSources: [...sources[player]!] } : {}),
    };
  });
}
