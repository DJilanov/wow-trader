import { describe, expect, it } from "vitest";
import { copperInputValue, goldInputToCopper } from "./trader-account-form";
describe("actual gold entry", () => {
  it("converts decimal gold exactly without floating point", () => {
    expect(goldInputToCopper("0.0001")).toBe("1");
    expect(goldInputToCopper("999999999.9999")).toBe("9999999999999");
    expect(goldInputToCopper("")).toBeNull();
    expect(copperInputValue("6060")).toBe("0.6060");
  });
  it("rejects negative, scientific and overprecise amounts", () => {
    for (const value of ["-1", "1e9", "0.00001", "Infinity"])
      expect(() => goldInputToCopper(value)).toThrow();
  });
});
