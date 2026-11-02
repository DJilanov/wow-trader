import { combatNpcSchema } from "./combat-model.js";
import {
  partyXpFrontierBounds,
  type PartyCreatureBatch,
  type PartyXpFrontier,
  type PartyXpFrontierBound,
} from "./combat-party-frontier.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatKillEstimate,
  type CombatXpPosition,
} from "./combat-xp.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

export interface PartyXpEnvelope {
  readonly domain: "conservative-box";
  /** This box contains the possible joint bars. Its corners need not be attainable. */
  readonly members: readonly PartyXpFrontierBound[];
  readonly combatBasis: PartyXpFrontier["combatBasis"];
  readonly observedSources: PartyXpFrontier["observedSources"];
}

export type PartyXpEnvelopeResult =
  | { readonly status: "bounded"; readonly envelope: PartyXpEnvelope; readonly transitions: number }
  | { readonly status: "unknown"; readonly reason: string; readonly transitions: number };

const levelTotals: number[] = [0, 0];
for (let level = 2; level <= 60; level++)
  levelTotals[level] = levelTotals[level - 1]! + FOREVER_XP_CURVE[level - 1]!;
const cap = levelTotals[60]!;

function total(bar: CombatXpPosition): number {
  return levelTotals[bar.level]! + bar.currentXp;
}

function fromTotal(xp: number): CombatXpPosition {
  return advanceCombatPosition({ level: 1, currentXp: 0 }, Math.min(cap, xp));
}

function validXp(xp: number): boolean {
  return Number.isSafeInteger(xp) && xp >= 0;
}

function validate(envelope: PartyXpEnvelope): number {
  const size = envelope.members.length;
  if (
    envelope.domain !== "conservative-box" ||
    size < 1 ||
    size > 5 ||
    envelope.combatBasis.length !== size ||
    envelope.observedSources.length !== size ||
    envelope.combatBasis.some(
      (basis) => !["excluded", "observed", "reference-estimate"].includes(basis),
    )
  )
    throw new Error("Invalid party XP envelope.");
  for (const member of envelope.members) {
    advanceCombatPosition(member.minimumExit, 0);
    advanceCombatPosition(member.maximumExit, 0);
    if (
      !validXp(member.minimumXp) ||
      !validXp(member.maximumXp) ||
      member.minimumXp > member.maximumXp ||
      total(member.minimumExit) > total(member.maximumExit)
    )
      throw new Error("Invalid party XP envelope bounds.");
  }
  return size;
}

function* levelCombinations(
  members: readonly PartyXpFrontierBound[],
  player = 0,
  prefix: readonly number[] = [],
): Generator<readonly number[]> {
  if (player === members.length) {
    yield prefix;
    return;
  }
  const member = members[player]!;
  for (let level = member.minimumExit.level; level <= member.maximumExit.level; level++)
    yield* levelCombinations(members, player + 1, [...prefix, level]);
}

function intervalAtLevel(member: PartyXpFrontierBound, level: number): readonly [number, number] {
  return [
    Math.max(total(member.minimumExit), levelTotals[level]!),
    Math.min(total(member.maximumExit), level === 60 ? cap : levelTotals[level + 1]! - 1),
  ];
}

export function enclosePartyXpFrontier(frontier: PartyXpFrontier): PartyXpEnvelope {
  return {
    domain: "conservative-box",
    members: partyXpFrontierBounds(frontier),
    combatBasis: [...frontier.combatBasis],
    observedSources: frontier.observedSources.map((sources) => [...sources]),
  };
}

/** Abstract interpretation: enumerate all allowed joint levels, then enclose their resulting bars. */
export function advancePartyXpEnvelopeKills(
  envelope: PartyXpEnvelope,
  input: PartyCreatureBatch,
  maximumTransitions = 250000,
): PartyXpEnvelopeResult {
  const size = validate(envelope);
  combatNpcSchema.parse(input.npc);
  if (
    !Number.isSafeInteger(input.kills) ||
    input.kills < 0 ||
    input.kills > 10000 ||
    !Number.isSafeInteger(maximumTransitions) ||
    maximumTransitions < 1 ||
    maximumTransitions > 1000000
  )
    throw new Error("Invalid party XP envelope budget.");
  const estimate = (
    levels: readonly number[],
    mobLevel: number,
    player: number,
    kills: number,
  ): CombatKillEstimate =>
    estimateCreatureKills({
      ...input,
      npc: { ...input.npc, minimumLevel: mobLevel, maximumLevel: mobLevel },
      kills,
      position: { level: levels[player]!, currentXp: 0 },
      partySize: size,
      partyLevels: levels,
      playerIndex: player,
    });
  const initialLevels = envelope.members.map((member) => member.minimumExit.level);
  initialLevels.forEach((_level, player) =>
    estimate(initialLevels, input.npc.minimumLevel ?? 1, player, 0),
  );
  let transitions = 0;
  const unknown = (reason: string): PartyXpEnvelopeResult => ({
    status: "unknown",
    reason,
    transitions,
  });
  if (
    !input.kills ||
    input.npc.xpEligibility === "excluded" ||
    envelope.members.every((member) => member.minimumExit.level === 60)
  )
    return { status: "bounded", envelope, transitions };
  const { minimumLevel, maximumLevel } = input.npc;
  if (
    input.npc.xpEligibility === "unknown" ||
    minimumLevel === null ||
    maximumLevel === null ||
    input.npc.rank === null
  )
    return unknown("Creature level, rank or XP eligibility is unresolved.");
  if (maximumLevel - minimumLevel > 10)
    return unknown("Creature level distribution is too broad for a party envelope.");
  let members = envelope.members;
  const combatBasis = [...envelope.combatBasis];
  const sources = envelope.observedSources.map((entries) => new Set(entries));
  const cache = new Map<string, readonly CombatKillEstimate[]>();
  for (let kill = 0; kill < input.kills; kill++) {
    const lower = members.map(() => Infinity),
      upper = members.map(() => 0);
    const minimumPayout = members.map(() => Infinity),
      maximumPayout = members.map(() => 0);
    for (const levels of levelCombinations(members)) {
      for (let mobLevel = minimumLevel; mobLevel <= maximumLevel; mobLevel++) {
        if (transitions === maximumTransitions)
          return unknown(
            "Party XP enclosure exceeded its transition budget; no partial payout is returned.",
          );
        transitions++;
        const key = levels.join(",") + ":" + mobLevel;
        let payouts = cache.get(key);
        if (!payouts) {
          payouts = levels.map((_level, player) => estimate(levels, mobLevel, player, 1));
          cache.set(key, payouts);
        }
        for (const [player, payout] of payouts.entries()) {
          if (payout.xp === null || payout.maximumXp === null || payout.basis === "unknown")
            return unknown(payout.reason ?? "A party XP envelope payout is unresolved.");
          const [lo, hi] = intervalAtLevel(members[player]!, levels[player]!);
          lower[player] = Math.min(lower[player]!, Math.min(cap, lo + payout.xp));
          upper[player] = Math.max(upper[player]!, Math.min(cap, hi + payout.maximumXp));
          minimumPayout[player] = Math.min(minimumPayout[player]!, payout.xp);
          maximumPayout[player] = Math.max(maximumPayout[player]!, payout.maximumXp);
          if (
            payout.basis === "reference-estimate" ||
            (payout.basis === "observed" && combatBasis[player] === "excluded")
          )
            combatBasis[player] = payout.basis;
          for (const source of payout.observedSources ?? []) sources[player]!.add(source);
        }
      }
    }
    members = members.map((member, player) => ({
      minimumXp: member.minimumXp + minimumPayout[player]!,
      maximumXp: member.maximumXp + maximumPayout[player]!,
      minimumExit: fromTotal(lower[player]!),
      maximumExit: fromTotal(upper[player]!),
    }));
    if (members.some((member) => !validXp(member.minimumXp) || !validXp(member.maximumXp)))
      throw new Error("Party XP enclosure exceeds safe integer precision.");
  }
  return {
    status: "bounded",
    envelope: {
      domain: "conservative-box",
      members,
      combatBasis,
      observedSources: sources.map((set) => [...set]),
    },
    transitions,
  };
}

/** Enclose level-dependent, one-time awards after the caller has proved pickup and hand-in eligibility. */
export function awardPartyXpEnvelope(
  envelope: PartyXpEnvelope,
  rewardsByPlayer: readonly (ReadonlyMap<number, number | null> | null)[],
): PartyXpEnvelopeResult {
  const size = validate(envelope);
  if (rewardsByPlayer.length !== size)
    throw new Error("Party reward count differs from its XP envelope.");
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
  const members: PartyXpFrontierBound[] = [];
  for (const [player, member] of envelope.members.entries()) {
    const rewards = rewardsByPlayer[player];
    if (rewards === null) {
      members.push(member);
      continue;
    }
    let lower = Infinity,
      upper = 0,
      minimumPayout = Infinity,
      maximumPayout = 0;
    for (let level = member.minimumExit.level; level <= member.maximumExit.level; level++) {
      const xp = rewards!.get(level);
      if (xp === undefined || xp === null)
        return {
          status: "unknown",
          reason:
            "A party hand-in reward is unresolved at an enclosed level; no partial payout is returned.",
          transitions: 0,
        };
      const [lo, hi] = intervalAtLevel(member, level);
      lower = Math.min(lower, Math.min(cap, lo + xp));
      upper = Math.max(upper, Math.min(cap, hi + xp));
      minimumPayout = Math.min(minimumPayout, xp);
      maximumPayout = Math.max(maximumPayout, xp);
    }
    const minimumXp = member.minimumXp + minimumPayout,
      maximumXp = member.maximumXp + maximumPayout;
    if (!validXp(minimumXp) || !validXp(maximumXp))
      throw new Error("Party XP enclosure exceeds safe integer precision.");
    members.push({
      minimumXp,
      maximumXp,
      minimumExit: fromTotal(lower),
      maximumExit: fromTotal(upper),
    });
  }
  return { status: "bounded", envelope: { ...envelope, members }, transitions: 0 };
}
