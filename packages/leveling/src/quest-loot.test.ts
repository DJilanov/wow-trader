import { describe, expect, it } from "vitest";
import { estimateLootKills, questLootDropSchema } from "./quest-loot.js";

const input = {
  quantity: 8,
  probability: 0.4,
  minimumQuantity: 1,
  maximumQuantity: 1,
  partySize: 1,
  sharing: "unknown" as const,
};
describe("conditional quest loot planning", () => {
  it("uses n/p rather than assuming every kill drops an item", () => {
    const result = estimateLootKills(input);
    expect(result).toMatchObject({ status: "estimated", minimumKills: 8, expectedKills: 20 });
    if (result.status !== "estimated") throw Error("Expected a complete distribution");
    expect(result.fastKills).toBeLessThan(20);
    expect(result.slowKills).toBeGreaterThan(20);
  });
  it("handles guaranteed fixed stacks and an incomplete last stack", () => {
    expect(
      estimateLootKills({ ...input, probability: 1, minimumQuantity: 3, maximumQuantity: 3 }),
    ).toEqual({
      status: "estimated",
      minimumKills: 3,
      fastKills: 3,
      expectedKills: 3,
      slowKills: 3,
    });
  });
  it("models a shared pool and independent per-player completion differently", () => {
    const pooled = estimateLootKills({ ...input, partySize: 5, sharing: "pooled" });
    const independent = estimateLootKills({ ...input, partySize: 5, sharing: "independent" });
    expect(pooled).toMatchObject({ status: "estimated", expectedKills: 100 });
    expect(independent.status).toBe("estimated");
    if (independent.status === "estimated") {
      expect(independent.expectedKills).toBeGreaterThan(20);
      expect(independent.expectedKills).toBeLessThan(100);
    }
  });
  it("needs only the successful-drop probability for a one-item solo quota", () => {
    const single = { ...input, quantity: 1, minimumQuantity: null, maximumQuantity: null };
    const before = JSON.stringify(single);
    expect(estimateLootKills(single)).toEqual({
      status: "estimated",
      minimumKills: 1,
      fastKills: 1,
      expectedKills: 2.5,
      slowKills: 5,
    });
    expect(JSON.stringify(single)).toBe(before);
    expect(estimateLootKills({ ...single, probability: 1 })).toMatchObject({
      status: "estimated",
      expectedKills: 1,
      fastKills: 1,
      slowKills: 1,
    });
  });
  it("models the last independent one-item collector without inferring stack sizes", () => {
    const probability = 0.4;
    const result = estimateLootKills({
      ...input,
      quantity: 1,
      probability,
      minimumQuantity: null,
      maximumQuantity: null,
      sharing: "independent",
      partySize: 5,
    });
    if (result.status !== "estimated") throw Error("Expected geometric completion distribution");
    const exactMean = [5, -10, 10, -5, 1].reduce(
      (sum, coefficient, index) => sum + coefficient / (1 - (1 - probability) ** (index + 1)),
      0,
    );
    expect(result.expectedKills).toBeCloseTo(exactMean, 9);
    for (const [quantile, kills] of [
      [0.1, result.fastKills],
      [0.9, result.slowKills],
    ] as const) {
      expect((1 - (1 - probability) ** kills) ** 5).toBeGreaterThanOrEqual(quantile);
      expect((1 - (1 - probability) ** (kills - 1)) ** 5).toBeLessThan(quantile);
    }
  });
  it("does not confuse one item per player with a single pooled item", () => {
    const single = { ...input, quantity: 1, minimumQuantity: null, maximumQuantity: null };
    expect(estimateLootKills({ ...single, partySize: 5, sharing: "unknown" })).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("sharing"),
    });
    expect(estimateLootKills({ ...single, partySize: 5, sharing: "pooled" })).toMatchObject({
      status: "unknown",
      reason: expect.stringContaining("Items per"),
    });
    expect(estimateLootKills({ ...single, quantity: 2 })).toMatchObject({ status: "unknown" });
  });
  it("uses a known lower stack bound when one success satisfies the entire quota", () => {
    expect(
      estimateLootKills({
        ...input,
        quantity: 1,
        partySize: 5,
        sharing: "pooled",
        minimumQuantity: 5,
        maximumQuantity: null,
      }),
    ).toMatchObject({
      status: "estimated",
      expectedKills: 2.5,
      minimumKills: 1,
    });
    expect(
      estimateLootKills({ ...input, quantity: 4, minimumQuantity: 5, maximumQuantity: 10 }),
    ).toMatchObject({
      status: "estimated",
      expectedKills: 2.5,
      minimumKills: 1,
    });
  });
  it.each([
    { probability: 0 },
    { minimumQuantity: null },
    { maximumQuantity: 2 },
    { partySize: 5 },
    { probability: 0.00000001 },
  ])("keeps unsupported or unbounded inputs unresolved: %j", (overrides) => {
    expect(estimateLootKills({ ...input, ...overrides }).status).toBe("unknown");
  });
  it.each([
    { probability: -1 },
    { probability: 1.1 },
    { partySize: 0 },
    { quantity: 1.5 },
    { minimumQuantity: 0 },
    { probability: Number.NaN },
  ])("rejects invalid inputs: %j", (overrides) => {
    expect(() => estimateLootKills({ ...input, ...overrides })).toThrow();
  });
  it("bounds extreme distributions without numerical underflow or unbounded loops", () => {
    const result = estimateLootKills({ ...input, quantity: 1000, probability: 0.5 });
    expect(result).toMatchObject({ status: "estimated", expectedKills: 2000 });
  });
  it("rejects inconsistent or non-finite evidence at the data boundary", () => {
    expect(questLootDropSchema.safeParse({ probability: Infinity }).success).toBe(false);
  });
});
