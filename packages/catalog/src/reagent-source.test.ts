import type { CatalogBundle } from "@wow-trader/contracts";
import { describe, expect, it } from "vitest";
import { fingerprintRecipeInputs, verifyRecipeReagents } from "./reagent-source.js";

function fixture(): Pick<CatalogBundle, "recipes" | "recipeInputs"> {
  return {
    recipes: [
      {
        recipeSpellId: 10,
        professionSkillLineId: 164,
        requiredSkillRank: 1,
        craftTimeMs: 1000,
        cooldownMs: 0,
        cooldownCategoryId: null,
        categoryCooldownMs: 0,
        outputKind: "item",
        extractionStatus: "complete",
        rawRecord: {},
      },
    ],
    recipeInputs: [{ recipeSpellId: 10, reagentItemId: 20, quantity: 3, optional: false }],
  };
}

describe("recipe reagent source verification", () => {
  it("matches exact source quantities, including unused placeholder slots", () => {
    const bundle = fixture();
    const result = verifyRecipeReagents(bundle, [
      { SpellID: 10, Reagent: [20, 0, -1], ReagentCount: [3, 0, 0] },
    ]);
    expect(result.sourceAvailable).toBe(true);
    expect(result.verifiedRecipeIds).toEqual([10]);
    expect(result.mismatchedRecipeIds).toEqual([]);
    expect(result.inputFingerprint).toBe(fingerprintRecipeInputs(bundle.recipeInputs));
  });
  it("rejects different quantities, item IDs, optional flags and omitted source records", () => {
    for (const [itemId, quantity] of [
      [20, 2],
      [21, 3],
    ]) {
      expect(
        verifyRecipeReagents(fixture(), [
          { SpellID: 10, Reagent: [itemId], ReagentCount: [quantity] },
        ]).mismatchedRecipeIds,
      ).toEqual([10]);
    }
    const bundle = fixture();
    bundle.recipeInputs[0] = { ...bundle.recipeInputs[0]!, optional: true };
    expect(
      verifyRecipeReagents(bundle, [{ SpellID: 10, Reagent: [20], ReagentCount: [3] }])
        .mismatchedRecipeIds,
    ).toEqual([10]);
    expect(verifyRecipeReagents(fixture(), []).mismatchedRecipeIds).toEqual([10]);
  });
  it("keeps duplicate source requirements instead of silently deduplicating them", () => {
    const row = { SpellID: 10, Reagent: [20], ReagentCount: [3] };
    expect(verifyRecipeReagents(fixture(), [row, row]).mismatchedRecipeIds).toEqual([10]);
  });
  it("does not treat unavailable legacy evidence as verified", () => {
    expect(verifyRecipeReagents(fixture(), null)).toMatchObject({
      sourceAvailable: false,
      verifiedRecipeIds: [],
    });
  });
  it("rejects malformed table layouts and noninteger quantities", () => {
    for (const row of [
      { SpellID: 10, Reagent: [20], ReagentCount: [] },
      { SpellID: 10, Reagent: [20], ReagentCount: [2.5] },
      { SpellID: "10", Reagent: [20], ReagentCount: [3] },
    ])
      expect(() => verifyRecipeReagents(fixture(), [row])).toThrow();
  });
  it("binds evidence to all normalized reagent rows and ignores row ordering", () => {
    const bundle = fixture();
    bundle.recipeInputs.push({
      recipeSpellId: 11,
      reagentItemId: 30,
      quantity: 2,
      optional: false,
    });
    const first = fingerprintRecipeInputs(bundle.recipeInputs);
    expect(fingerprintRecipeInputs([...bundle.recipeInputs].reverse())).toBe(first);
    expect(
      fingerprintRecipeInputs([
        { ...bundle.recipeInputs[0]!, quantity: 4 },
        bundle.recipeInputs[1]!,
      ]),
    ).not.toBe(first);
  });
});
