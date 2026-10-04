import { describe, expect, it } from "vitest";
import { createPlannerState, readPlannerState } from "./leveling-planner-state";

describe("saved leveling plans", () => {
  it("restores a versioned plan without turning unknown values into zero", () => {
    const state = createPlannerState();
    state.fields.currentXp = "400";
    const restored = readPlannerState(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(restored?.fields.travel).toBe("");
  });
  it("rejects malformed, stale or oversized browser state", () => {
    expect(readPlannerState("{broken")).toBeNull();
    expect(readPlannerState(JSON.stringify({ ...createPlannerState(), version: 2 }))).toBeNull();
    expect(readPlannerState(" ".repeat(12001))).toBeNull();
  });
  it("rejects unsupported factions/classes and missing estimate fields", () => {
    expect(
      readPlannerState(JSON.stringify({ ...createPlannerState(), faction: "unknown" })),
    ).toBeNull();
    expect(
      readPlannerState(JSON.stringify({ ...createPlannerState(), classSlug: "death-knight" })),
    ).toBeNull();
    expect(readPlannerState(JSON.stringify({ ...createPlannerState(), fields: {} }))).toBeNull();
  });
});
