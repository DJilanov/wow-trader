import { describe, expect, it } from "vitest";
import { estimateJointLootKills } from "./loot-joint-distribution.js";

describe("joint fixed-stack loot completion", () => {
  it("uses E[max(T1,T2)] rather than the maximum of their means", () => {
    const result = estimateJointLootKills([
      { successes: 1, probability: 0.5, independentPlayers: 1 },
      { successes: 1, probability: 0.5, independentPlayers: 1 },
    ]);
    expect(result).toMatchObject({
      status: "estimated",
      minimumKills: 1,
      fastKills: 1,
      slowKills: 5,
    });
    if (result.status !== "estimated") throw new Error(result.reason);
    expect(result.expectedKills).toBeCloseTo(8 / 3, 9);
    expect(result.expectedKillsLowerBound).toBeLessThanOrEqual(8 / 3);
    expect(result.expectedKillsUpperBound).toBeGreaterThanOrEqual(8 / 3);
    expect(result.expectedKillsUpperBound - result.expectedKillsLowerBound).toBeLessThan(1e-10);
  });
  it("includes a deterministic kill requirement without discarding collection progress", () => {
    const result = estimateJointLootKills(
      [{ successes: 1, probability: 0.5, independentPlayers: 1 }],
      3,
    );
    expect(result).toMatchObject({
      status: "estimated",
      minimumKills: 3,
      fastKills: 3,
      slowKills: 4,
      expectedKills: 3.25,
      expectedKillsLowerBound: 3.25,
      expectedKillsUpperBound: 3.25,
    });
  });
  it("waits for the last independent player, while pooled quotas are explicit success counts", () => {
    const expected = [1, 2, 3].reduce(
      (sum, k) => sum + ((-1) ** (k + 1) * [0, 3, 3, 1][k]!) / (1 - 0.5 ** k),
      0,
    );
    const result = estimateJointLootKills([
      { successes: 1, probability: 0.5, independentPlayers: 3 },
    ]);
    if (result.status !== "estimated") throw new Error(result.reason);
    expect(result.expectedKills).toBeCloseTo(expected, 9);
    expect(
      estimateJointLootKills([{ successes: 5, probability: 0.5, independentPlayers: 1 }]),
    ).toMatchObject({ expectedKills: 10 });
  });
  it("handles guaranteed copies and fast/slow quantiles together", () => {
    expect(
      estimateJointLootKills([
        { successes: 8, probability: 1, independentPlayers: 5 },
        { successes: 10, probability: 1, independentPlayers: 1 },
      ]),
    ).toMatchObject({ expectedKills: 10, fastKills: 10, slowKills: 10, minimumKills: 10 });
  });
  it("matches an independent binomial survival calculation for the actual candle/dust quotas", () => {
    const incomplete = (kills: number, required: number, p: number): number => {
      let combination = 1,
        sum = 0;
      for (let successes = 0; successes < required && successes <= kills; successes++) {
        if (successes) combination *= (kills - successes + 1) / successes;
        sum += combination * p ** successes * (1 - p) ** (kills - successes);
      }
      return sum;
    };
    let expected = 0;
    for (let kills = 0; kills < 500; kills++) {
      const a = incomplete(kills, 8, 0.66),
        b = incomplete(kills, 10, 0.5);
      expected += a + b - a * b;
    }
    const result = estimateJointLootKills([
      { successes: 8, probability: 0.66, independentPlayers: 1 },
      { successes: 10, probability: 0.5, independentPlayers: 1 },
    ]);
    if (result.status !== "estimated") throw new Error(result.reason);
    expect(result.expectedKills).toBeCloseTo(expected, 8);
    expect(result.expectedKills).toBeGreaterThan(20);
  });
  it("rejects invalid inputs and holds unbounded or oversized calculations", () => {
    expect(() => estimateJointLootKills([])).toThrow();
    expect(() =>
      estimateJointLootKills([{ successes: 1, probability: 1.1, independentPlayers: 1 }]),
    ).toThrow();
    expect(
      estimateJointLootKills([{ successes: 1, probability: 0, independentPlayers: 1 }]).status,
    ).toBe("unknown");
    expect(
      estimateJointLootKills([{ successes: 10000, probability: 0.5, independentPlayers: 1 }])
        .status,
    ).toBe("unknown");
  });
});
