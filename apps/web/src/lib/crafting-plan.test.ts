import { describe, expect, it } from "vitest";

import {
  parseCraftingPlan,
  serializeCraftingPlan,
  summarizeCraftingPlan,
  type CraftingPlanEntry,
} from "./crafting-plan";

describe("crafting plan", () => {
  it("round trips valid entries and rejects malformed storage", () => {
    expect(parseCraftingPlan(serializeCraftingPlan([entry]))).toEqual([entry]);
    expect(parseCraftingPlan('{"version":1,"entries":[{"id":false}]}')).toEqual([]);
    expect(parseCraftingPlan("invalid")).toEqual([]);
  });

  it("combines shopping quantities and standalone quote totals", () => {
    const totals = summarizeCraftingPlan([
      entry,
      {
        ...entry,
        id: "2:vendor",
        capitalCopper: "200",
        profitCopper: "40",
        inputs: [{ itemId: 1, name: "Ore", quantity: 3 }],
      },
    ]);

    expect(totals.capitalCopper).toBe(300n);
    expect(totals.profitCopper).toBe(65n);
    expect(totals.materials).toEqual([{ itemId: 1, name: "Ore", quantity: 5 }]);
  });
});

const entry: CraftingPlanEntry = {
  id: "1:auction_house",
  clientProduct: "wow_classic_beta",
  market: "UNKNOWN|Realm|alliance",
  recipeSpellId: 1,
  recipeName: "Smelt Test",
  outputLabel: "Test Bar",
  professionName: "Mining",
  routeLabel: "Auction House",
  quoteCapturedAt: "2026-09-27T08:00:00.000Z",
  crafts: 2,
  capitalCopper: "100",
  profitCopper: "25",
  inputs: [{ itemId: 1, name: "Ore", quantity: 2 }],
  craftSteps: [],
};
