export const GROUP_COMBAT_RULE = "conservative-solo-xp-divided-by-party-size-v1";

export interface GroupCombatInput {
  readonly soloXpPerKill: number | null;
  readonly kills: number | null;
  readonly partySize: number;
}

export interface GroupCombatEstimate {
  readonly rule: typeof GROUP_COMBAT_RULE;
  readonly xpPerPlayer: number | null;
  readonly creditFraction: number;
  readonly status: "scenario" | "unknown";
}

export function estimateGroupCombat(input: GroupCombatInput): GroupCombatEstimate {
  if (
    !Number.isInteger(input.partySize) ||
    input.partySize < 1 ||
    input.partySize > 5 ||
    (input.soloXpPerKill !== null &&
      (!Number.isSafeInteger(input.soloXpPerKill) ||
        input.soloXpPerKill < 0 ||
        input.soloXpPerKill > 1_000_000)) ||
    (input.kills !== null &&
      (!Number.isSafeInteger(input.kills) || input.kills < 0 || input.kills > 100_000))
  )
    throw new Error("Invalid group combat planning inputs.");
  const xp =
    input.soloXpPerKill === null || input.kills === null
      ? null
      : Math.floor(input.soloXpPerKill / input.partySize) * input.kills;
  return {
    rule: GROUP_COMBAT_RULE,
    xpPerPlayer: xp,
    creditFraction: 1 / input.partySize,
    status: xp === null ? "unknown" : "scenario",
  };
}
