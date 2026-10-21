import { describe, expect, it } from "vitest";
import { estimateLootKills, plannedLootKills, questLootDropSchema } from "./quest-loot.js";

const input = {
  quantity: 2,
  probability: 1,
  minimumQuantity: 1,
  maximumQuantity: 2,
  quantityDistribution: [
    { quantity: 1, percent: 50 },
    { quantity: 2, percent: 50 },
  ],
  partySize: 1,
  sharing: "unknown" as const,
};

describe("reported variable-stack collection distributions", () => {
  it("uses weighted stacks rather than a uniform range or average-stack shortcut", () => {
    expect(estimateLootKills(input)).toEqual({
      status: "estimated",
      minimumKills: 1,
      fastKills: 1,
      expectedKills: 1.5,
      slowKills: 2,
    });
    expect(
      estimateLootKills({
        ...input,
        quantityDistribution: [
          { quantity: 1, percent: 90 },
          { quantity: 2, percent: 10 },
        ],
      }),
    ).toMatchObject({ status: "estimated", expectedKills: 1.9 });
  });
  it("distinguishes a pooled party quota from waiting for all independent players", () => {
    expect(estimateLootKills({ ...input, partySize: 2, sharing: "pooled" })).toMatchObject({
      status: "estimated",
      expectedKills: 2.875,
    });
    for (const partySize of [2, 3, 4, 5]) {
      const result = estimateLootKills({ ...input, partySize, sharing: "independent" });
      expect(result).toMatchObject({ status: "estimated", expectedKills: 2 - 0.5 ** partySize });
    }
    expect(estimateLootKills({ ...input, partySize: 2 })).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("sharing"),
    });
  });
  it("includes failed drops in its expectation and quantiles", () => {
    expect(estimateLootKills({ ...input, probability: 0.5 })).toEqual({
      status: "estimated",
      minimumKills: 1,
      fastKills: 1,
      expectedKills: 3,
      slowKills: 6,
    });
    const singleCompletion = (kills: number): number =>
      1 - 0.5 ** kills - (kills === 0 ? 0 : kills * 0.25 * 0.5 ** (kills - 1));
    for (const partySize of [2, 5]) {
      const result = estimateLootKills({
        ...input,
        probability: 0.5,
        partySize,
        sharing: "independent",
      });
      if (result.status !== "estimated") throw Error(result.reason);
      const exactMean = Array.from(
        { length: 200 },
        (_, kills) => 1 - singleCompletion(kills) ** partySize,
      ).reduce((sum, term) => sum + term, 0);
      expect(Math.abs(result.expectedKills - exactMean)).toBeLessThan(1e-8);
      expect(singleCompletion(result.fastKills) ** partySize).toBeGreaterThanOrEqual(0.1);
      expect(singleCompletion(result.fastKills - 1) ** partySize).toBeLessThan(0.1);
      expect(singleCompletion(result.slowKills) ** partySize).toBeGreaterThanOrEqual(0.9);
      expect(singleCompletion(result.slowKills - 1) ** partySize).toBeLessThan(0.9);
      expect(plannedLootKills(result, "expected")).toBe(Math.ceil(exactMean));
    }
  });
  it("matches the closed-form renewal expectation across quotas and drop rates", () => {
    for (let quantity = 1; quantity <= 20; quantity++)
      for (const probability of [0.1, 0.3, 1]) {
        const result = estimateLootKills({ ...input, quantity, probability });
        if (result.status !== "estimated") throw Error(result.reason);
        const expectedDrops = (2 * quantity) / 3 + (2 / 9) * (1 - (-0.5) ** quantity);
        expect(result.expectedKills).toBeCloseTo(expectedDrops / probability, 10);
      }
  });
  it("can use explicit quantity weights without fabricating absent bounds", () => {
    expect(
      estimateLootKills({ ...input, minimumQuantity: null, maximumQuantity: null }),
    ).toMatchObject({ status: "estimated", expectedKills: 1.5 });
    expect(
      estimateLootKills({
        ...input,
        quantityDistribution: [
          { quantity: 1, percent: 0 },
          { quantity: 2, percent: 100 },
        ],
      }),
    ).toMatchObject({ status: "estimated", minimumKills: 1, expectedKills: 1 });
    expect(estimateLootKills({ ...input, quantityDistribution: undefined })).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("distribution"),
    });
  });
  it("rejects incomplete, conflicting or invalid distributions at both public boundaries", () => {
    const drop = {
      itemId: 750,
      npcId: 299,
      probability: 0.5,
      minimumQuantity: 1,
      maximumQuantity: 2,
      sampleSize: null,
      targetBuild: 70205,
      sourceUrl: "https://example.test/item=750",
      sourceSha256: "a".repeat(64),
      capturedAt: "2026-10-21T00:00:00.000Z",
    };
    for (const quantityDistribution of [
      [],
      [{ quantity: 1, percent: 50 }],
      [
        { quantity: 1, percent: 50 },
        { quantity: 1, percent: 50 },
      ],
      [
        { quantity: 1, percent: -1 },
        { quantity: 2, percent: 101 },
      ],
      [{ quantity: 0, percent: 100 }],
      [{ quantity: 3, percent: 100 }],
    ]) {
      expect(() => estimateLootKills({ ...input, quantityDistribution })).toThrow();
      expect(questLootDropSchema.safeParse({ ...drop, quantityDistribution }).success).toBe(false);
    }
    expect(
      questLootDropSchema.parse({ ...drop, quantityDistribution: input.quantityDistribution }),
    ).toMatchObject({ quantityDistribution: input.quantityDistribution });
  });
  it("bounds the work and kill horizon without returning partial forecasts as complete", () => {
    expect(estimateLootKills({ ...input, probability: 1e-12 })).toMatchObject({
      status: "unknown",
    });
    expect(estimateLootKills({ ...input, quantity: 10000, probability: 0.5 })).toMatchObject({
      status: "unknown",
    });
    expect(estimateLootKills({ ...input, quantity: 2000, probability: 0.5 })).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("calculation budget"),
    });
  });
});
