import { describe, expect, it } from "vitest";
import type { CombatNpc, KillXpEvidence } from "./combat-model.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatXpPosition,
} from "./combat-xp.js";
import { estimateBoundedPartyKills, resolveBoundedQuestReward } from "./campaign-xp-bounds.js";
import { FOREVER_XP_CURVE } from "./westfall.js";

const npc: CombatNpc = {
  id: 1,
  name: "Synthetic ranged creature",
  minimumLevel: 1,
  maximumLevel: 2,
  rank: 0,
  zoneIds: [12],
  xpEligibility: "assumed",
};
const start = [390, 0, 0, 0, 0].map((currentXp) => ({ level: 1, currentXp }));

function total(position: CombatXpPosition): number {
  return (
    position.currentXp +
    Array.from(
      { length: position.level - 1 },
      (_value, index) => FOREVER_XP_CURVE[index + 1]!,
    ).reduce((sum, xp) => sum + xp, 0)
  );
}

function enumerate(
  positions: readonly CombatXpPosition[],
  kills: number,
): readonly (readonly CombatXpPosition[])[] {
  if (!kills) return [positions];
  return [1, 2].flatMap((level) => {
    const payouts = positions.map((position, playerIndex) =>
      estimateCreatureKills({
        npc: { ...npc, minimumLevel: level, maximumLevel: level },
        kills: 1,
        position,
        environment: "outdoor",
        partySize: positions.length,
        partyLevels: positions.map((bar) => bar.level),
        playerIndex,
      }),
    );
    expect(payouts.every((payout) => payout.xp !== null && payout.xp === payout.maximumXp)).toBe(
      true,
    );
    return enumerate(
      positions.map((bar, player) => advanceCombatPosition(bar, payouts[player]!.xp!)),
      kills - 1,
    );
  });
}

describe("campaign XP interval propagation", () => {
  it("encloses every simultaneous outcome while unequal players cross levels", () => {
    const positions = start.map((minimum) => ({ minimum, maximum: minimum }));
    const result = estimateBoundedPartyKills({ npc, positions, kills: 7, environment: "outdoor" });
    const outcomes = enumerate(start, 7);
    expect(outcomes).toHaveLength(128);
    for (const bars of outcomes)
      bars.forEach((bar, player) => {
        expect(total(result[player]!.exit)).toBeLessThanOrEqual(total(bar));
        expect(total(result[player]!.maximumExit!)).toBeGreaterThanOrEqual(total(bar));
      });
    expect(result.every((row) => row.xp !== null && row.xp > 0)).toBe(true);
  });

  it("carries an enclosure into another batch without treating marginal minima as one joint state", () => {
    const first = estimateBoundedPartyKills({
      npc,
      positions: start.map((minimum) => ({ minimum, maximum: minimum })),
      kills: 4,
      environment: "outdoor",
    });
    const positions = first.map((row) => ({ minimum: row.exit, maximum: row.maximumExit! }));
    const before = JSON.stringify(positions);
    const next = estimateBoundedPartyKills({ npc, positions, kills: 3, environment: "outdoor" });
    for (const bars of enumerate(start, 7))
      bars.forEach((bar, player) => {
        expect(total(next[player]!.exit)).toBeLessThanOrEqual(total(bar));
        expect(total(next[player]!.maximumExit!)).toBeGreaterThanOrEqual(total(bar));
      });
    expect(JSON.stringify(positions)).toBe(before);
  });

  it("preserves player permutation symmetry", () => {
    const positions = start.map((minimum) => ({ minimum, maximum: minimum }));
    const before = estimateBoundedPartyKills({ npc, positions, kills: 4, environment: "outdoor" });
    const reversed = estimateBoundedPartyKills({
      npc,
      positions: [...positions].reverse(),
      kills: 4,
      environment: "outdoor",
    });
    expect(reversed).toEqual([...before].reverse());
  });

  it("keeps per-player observed 24–30 XP whole rather than dividing it again", () => {
    const elite = { ...npc, minimumLevel: 20, maximumLevel: 20, rank: 1 };
    const evidence: KillXpEvidence[] = [24, 30].map((unrestedXpPerPlayer) => ({
      npcId: 1,
      build: 70450,
      playerLevel: 20,
      mobLevel: 20,
      partySize: 5,
      partyLevels: [20, 20, 20, 20, 20],
      environment: "dungeon",
      unrestedXpPerPlayer,
      sampleCount: 3,
      contextVerified: true,
      source: "Synthetic range fixture, not a server observation",
    }));
    const result = estimateBoundedPartyKills({
      npc: elite,
      positions: Array.from({ length: 5 }, () => ({
        minimum: { level: 20, currentXp: 0 },
        maximum: { level: 20, currentXp: 0 },
      })),
      kills: 3,
      environment: "dungeon",
      evidence,
      build: 70450,
    });
    expect(result.every((row) => row.xp === 72 && row.maximumXp === 90)).toBe(true);
  });

  it("retains unresolved ranks instead of committing a partial batch", () => {
    const result = estimateBoundedPartyKills({
      npc: { ...npc, rank: null },
      positions: start.map((minimum) => ({ minimum, maximum: minimum })),
      kills: 5,
      environment: "outdoor",
    });
    expect(
      result.every((row) => row.xp === null && row.maximumExit === null && row.basis === "unknown"),
    ).toBe(true);
    expect(result.map((row) => row.exit)).toEqual(start);
  });

  it("bounds a hand-in across every enclosed level, including decreasing rewards", () => {
    const result = resolveBoundedQuestReward(
      { minimum: { level: 10, currentXp: 0 }, maximum: { level: 12, currentXp: 10 } },
      (level) => ({
        xp: level === 11 ? 25 : 100,
        basis: "wowhead-reference",
        source: "Synthetic reward",
      }),
    );
    expect(result).toMatchObject({ xp: 25, maximumXp: 100 });
    expect(
      resolveBoundedQuestReward(
        { minimum: { level: 10, currentXp: 0 }, maximum: { level: 12, currentXp: 10 } },
        (level) => ({
          xp: level === 11 ? null : 100,
          basis: level === 11 ? "unknown" : "wowhead-reference",
          source: "Synthetic reward",
        }),
      ),
    ).toMatchObject({ xp: null, maximumXp: null });
  });

  it("rejects reversed input intervals", () => {
    expect(() =>
      estimateBoundedPartyKills({
        npc,
        positions: [{ minimum: { level: 2, currentXp: 0 }, maximum: { level: 1, currentXp: 0 } }],
        kills: 1,
        environment: "outdoor",
      }),
    ).toThrow("Reversed");
  });

  it("reaches the level cap even when some possible starting bars are already capped", () => {
    const result = estimateBoundedPartyKills({
      npc: { ...npc, minimumLevel: 59, maximumLevel: 59 },
      positions: [
        {
          minimum: { level: 59, currentXp: FOREVER_XP_CURVE[59]! - 10 },
          maximum: { level: 60, currentXp: 0 },
        },
      ],
      kills: 1,
      environment: "outdoor",
    });
    expect(result[0]).toMatchObject({
      xp: 0,
      exit: { level: 60, currentXp: 0 },
      maximumExit: { level: 60, currentXp: 0 },
    });
    expect(result[0]!.maximumXp).toBeGreaterThan(10);
  });

  it("reproduces the independently enumerated Stonesplinter crossing reference", () => {
    const positions = [10056, 4781, 4465, 7973, 8320].map((currentXp) => ({
      minimum: { level: 12, currentXp },
      maximum: { level: 12, currentXp },
    }));
    const result = estimateBoundedPartyKills({
      npc: { ...npc, id: 1197, name: "Stonesplinter Shaman", minimumLevel: 15, maximumLevel: 16 },
      positions,
      kills: 10,
      environment: "outdoor",
      build: 70205,
    });
    expect(result.map((row) => [row.xp, row.maximumXp])).toEqual([
      [248, 258],
      [232, 242],
      [232, 242],
      [232, 242],
      [232, 242],
    ]);
  });
});
