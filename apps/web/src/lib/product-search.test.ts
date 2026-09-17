import { describe, expect, it } from "vitest";

import { matchesProductName } from "./product-search";

describe("Trader product search", () => {
  const products = [{ name: "Arcanite Bar" }, { name: "Runic Leather Bracers" }] as const;

  it("matches product names case-insensitively and by partial name", () => {
    expect(matchesProductName(products, "arcanite")).toBe(true);
    expect(matchesProductName(products, "LEATHER BRAC")).toBe(true);
  });

  it("does not match recipe, profession, reagent, or ID terms", () => {
    expect(matchesProductName(products, "Transmute")).toBe(false);
    expect(matchesProductName(products, "Alchemy")).toBe(false);
    expect(matchesProductName(products, "Arcane Crystal")).toBe(false);
    expect(matchesProductName(products, "12360")).toBe(false);
  });

  it("keeps every product when the query is blank", () => {
    expect(matchesProductName(products, "   ")).toBe(true);
  });
});
