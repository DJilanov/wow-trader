import { describe, expect, it } from "vitest";
import { ceilLootKillMean } from "./loot-kill-rounding.js";

describe("integer loot budgets", () => {
  it("snaps machine-scale arithmetic noise without changing genuine fractional means", () => {
    expect(ceilLootKillMean(40 / 0.6666666666666665)).toBe(60);
    expect(ceilLootKillMean(60 + 1e-10)).toBe(61);
    expect(ceilLootKillMean(60 - 1e-10)).toBe(60);
    expect(ceilLootKillMean(60.1)).toBe(61);
    expect(ceilLootKillMean(60)).toBe(60);
    expect(ceilLootKillMean(0)).toBe(0);
    expect(ceilLootKillMean(0.1)).toBe(1);
    expect(ceilLootKillMean(10000 + 1e-8)).toBe(10001);
  });

  it("rejects invalid means", () => {
    for (const mean of [-1, Number.NaN, Infinity, -Infinity])
      expect(() => ceilLootKillMean(mean)).toThrow("Invalid mean loot kill count");
  });
});
