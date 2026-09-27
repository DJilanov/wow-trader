import { describe, expect, it } from "vitest";

import { formatCompactGold } from "./format";

describe("formatCompactGold", () => {
  it("keeps useful sub-gold precision without trailing zeros", () => {
    expect(formatCompactGold(6_060n)).toBe("0.606g");
    expect(formatCompactGold(10_000n)).toBe("1g");
    expect(formatCompactGold(123_456n)).toBe("12.35g");
  });

  it("rounds large values and preserves the sign", () => {
    expect(formatCompactGold(1_234_567n)).toBe("123.5g");
    expect(formatCompactGold(-6_060n)).toBe("−0.606g");
  });
});
