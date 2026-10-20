import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export const COMBAT_XP_RULE = "classic-reference-level-weighted-no-bonus-20261020-v2";
export interface CombatXpPosition {
  readonly level: number;
  readonly currentXp: number;
}
export interface CombatKillEstimate {
  readonly xp: number | null;
  readonly maximumXp: number | null;
  readonly exit: CombatXpPosition;
  readonly basis: "reference-estimate" | "observed" | "excluded" | "unknown";
  readonly reason: string | null;
  readonly observedSources?: readonly string[];
}

function validLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= 60;
}
function grayLevel(level: number): number {
  return level <= 5
    ? 0
    : level <= 39
      ? level - 5 - Math.floor(level / 10)
      : level <= 59
        ? level - 1 - Math.floor(level / 5)
        : level - 9;
}

export function advanceCombatPosition(position: CombatXpPosition, xp: number): CombatXpPosition {
  if (
    !validLevel(position.level) ||
    !Number.isSafeInteger(position.currentXp) ||
    position.currentXp < 0 ||
    (position.level === 60
      ? position.currentXp !== 0
      : position.currentXp >= FOREVER_XP_CURVE[position.level]!) ||
    !Number.isSafeInteger(xp) ||
    xp < 0 ||
    xp > 100_000_000
  )
    throw new Error("Invalid combat XP position.");
  let level = position.level,
    currentXp = position.currentXp + xp;
  while (level < 60 && currentXp >= FOREVER_XP_CURVE[level]!) {
    currentXp -= FOREVER_XP_CURVE[level]!;
    level++;
  }
  return { level, currentXp: level === 60 ? 0 : currentXp };
}

// Historical mathematical baseline only; neither server tuning nor a party-bonus claim.
export function classicNormalKillXp(playerLevel: number, mobLevel: number): number {
  if (!validLevel(playerLevel) || !Number.isInteger(mobLevel) || mobLevel < 1 || mobLevel > 100)
    throw new Error("Invalid combat level.");
  if (playerLevel === 60) return 0;
  const gray = grayLevel(playerLevel);
  if (mobLevel <= gray) return 0;
  const baseline = 45 + 5 * playerLevel;
  if (mobLevel >= playerLevel)
    return Math.floor(baseline * (1 + Math.min(4, mobLevel - playerLevel) / 20));
  const bands = [
    [8, 5],
    [10, 6],
    [12, 7],
    [16, 8],
    [20, 9],
    [30, 11],
    [40, 12],
    [45, 13],
    [50, 14],
    [55, 15],
    [60, 16],
    [61, 17],
  ] as const;
  const difference = bands.find(([until]) => playerLevel < until)![1];
  return Math.max(0, Math.floor(baseline * (1 - (playerLevel - mobLevel) / difference)));
}

export function estimateCreatureKills(input: {
  readonly npc: CombatNpc;
  readonly kills: number;
  readonly position: CombatXpPosition;
  readonly partySize: number;
  readonly environment: "outdoor" | "dungeon";
  readonly dungeonMultiplier?: number | null;
  readonly evidence?: readonly KillXpEvidence[];
  readonly build?: number;
  readonly partyLevels?: readonly (number | null)[];
  readonly xpMultiplier?: number;
  readonly playerIndex?: number;
}): CombatKillEstimate {
  const { npc, kills, position, partySize, environment } = input;
  advanceCombatPosition(position, 0);
  if (
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > 5 ||
    !Number.isSafeInteger(kills) ||
    kills < 0 ||
    kills > 10000 ||
    (input.xpMultiplier !== undefined &&
      (!Number.isFinite(input.xpMultiplier) ||
        input.xpMultiplier < 0 ||
        input.xpMultiplier > 100)) ||
    (input.playerIndex !== undefined &&
      (!Number.isInteger(input.playerIndex) ||
        input.playerIndex < 0 ||
        input.playerIndex >= partySize)) ||
    (input.dungeonMultiplier !== null &&
      input.dungeonMultiplier !== undefined &&
      (!Number.isFinite(input.dungeonMultiplier) ||
        input.dungeonMultiplier < 0 ||
        input.dungeonMultiplier > 10))
  )
    throw new Error("Invalid creature combat inputs.");
  if (kills === 0 || position.level === 60 || npc.xpEligibility === "excluded")
    return { xp: 0, maximumXp: 0, exit: position, basis: "excluded", reason: null };
  const unknown = (reason: string): CombatKillEstimate => ({
    xp: null,
    maximumXp: null,
    exit: position,
    basis: "unknown",
    reason,
  });
  if (
    npc.xpEligibility === "unknown" ||
    npc.minimumLevel === null ||
    npc.maximumLevel === null ||
    npc.rank === null
  )
    return unknown("Creature level, rank or XP eligibility is unresolved.");
  if (npc.maximumLevel <= grayLevel(position.level))
    return { xp: 0, maximumXp: 0, exit: position, basis: "excluded", reason: null };
  if (npc.maximumLevel - npc.minimumLevel > 10)
    return unknown("Creature level distribution is too broad for a useful kill estimate.");
  if (
    input.partyLevels &&
    (input.partyLevels.length !== partySize ||
      input.partyLevels.some((level) => level === null || !validLevel(level)))
  )
    return unknown("Party member levels are missing; shared kill XP cannot be established.");
  if (
    partySize > 1 &&
    input.partyLevels?.some((level) => level !== null && grayLevel(level) >= npc.minimumLevel!)
  )
    return unknown(
      "An overleveled party member may trigger dungeon/boosting XP suppression; no shared payout is assumed.",
    );
  const elite = npc.rank === 1 || npc.rank === 2 || npc.rank === 3;
  const rankFactor = elite ? (environment === "dungeon" ? 2.5 : 2) : 1;
  const tuning = environment === "dungeon" ? input.dungeonMultiplier! : 1;
  let lower = position,
    upper = position,
    xp = 0,
    maximumXp = 0;
  let observed = true;
  const observedSources = new Set<string>();
  const payouts = (level: number): readonly number[] | null => {
    const values: number[] = [];
    for (let mobLevel = npc.minimumLevel!; mobLevel <= npc.maximumLevel!; mobLevel++) {
      const partyLevels = (
        input.partyLevels ?? Array.from({ length: partySize }, () => position.level)
      ).map((memberLevel, index) => (index === (input.playerIndex ?? 0) ? level : memberLevel!));
      const matching = input.evidence?.filter(
        (entry) =>
          entry.npcId === npc.id &&
          entry.build === input.build &&
          entry.playerLevel === level &&
          entry.mobLevel === mobLevel &&
          entry.partySize === partySize &&
          entry.environment === environment,
      );
      if (
        matching?.length &&
        partyLevels.length === partySize &&
        partyLevels.every((entry) => entry === level)
      ) {
        for (const entry of matching) observedSources.add(entry.source);
        values.push(...matching.map((entry) => entry.unrestedXpPerPlayer));
        continue;
      }
      observed = false;
      if (
        environment === "dungeon" &&
        (input.dungeonMultiplier === null || input.dungeonMultiplier === undefined)
      )
        return null;
      values.push(
        Math.floor(
          (Math.floor(
            classicNormalKillXp(Math.max(...partyLevels), mobLevel) *
              rankFactor *
              tuning *
              (input.xpMultiplier ?? 1),
          ) *
            level) /
            partyLevels.reduce((sum, value) => sum + value, 0),
        ),
      );
    }
    return values;
  };
  for (let kill = 0; kill < kills; kill++) {
    const lows = payouts(lower.level),
      highs = payouts(upper.level);
    if (!lows || !highs)
      return unknown("Current Forever dungeon kill tuning has not been calibrated for this path.");
    const low = Math.min(...lows),
      high = Math.max(...highs);
    xp += low;
    maximumXp += high;
    lower = advanceCombatPosition(lower, low);
    upper = advanceCombatPosition(upper, high);
  }
  return {
    xp,
    maximumXp,
    exit: lower,
    basis: observed ? "observed" : "reference-estimate",
    reason: null,
    ...(observed ? { observedSources: [...observedSources] } : {}),
  };
}
