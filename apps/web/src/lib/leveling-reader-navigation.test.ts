import { describe, expect, it } from "vitest";
import {
  nextReaderStep,
  readerPositionFromHistory,
  readerStepFromHash,
} from "./leveling-reader-navigation";

describe("chapter reader deep-link selection", () => {
  it("selects only known steps from the correct reader edition", () => {
    expect(readerStepFromHash("#guide-step-5", "guide-", ["step-5"])).toBe("step-5");
    expect(readerStepFromHash("#route-step-5", "route-", ["step-5"])).toBe("step-5");
    expect(readerStepFromHash("#route-step-5", "guide-", ["step-5"])).toBeNull();
    expect(readerStepFromHash("#guide-excluded", "guide-", ["step-5"])).toBeNull();
  });
  it("keeps calculator and unknown or malformed anchors out of quest selection", () => {
    expect(readerStepFromHash("#planner", "route-", ["step-5"])).toBeNull();
    expect(readerStepFromHash("#guide-%E0%A4%A", "guide-", ["step-5"])).toBeNull();
    expect(readerStepFromHash("#guide-step%2D5", "guide-", ["step-5"])).toBe("step-5");
  });
});

describe("following a chapter from the current reading position", () => {
  const ids = ["step-1", "step-2", "step-51", "step-52", "step-53"];
  it("does not return to earlier unchecked steps after a later step is selected", () => {
    expect(nextReaderStep(ids, ids, "step-51")).toBe("step-51");
    expect(nextReaderStep(ids, ["step-1", "step-2", "step-52"], "step-51")).toBe("step-52");
    expect(nextReaderStep(ids, ["step-1", "step-2"], "step-51")).toBeNull();
  });
  it("only advances through eligible pending steps and does not wrap at the end", () => {
    expect(nextReaderStep(ids, ["excluded", "step-53"], "step-51")).toBe("step-53");
    expect(nextReaderStep(ids, ["step-1"], "step-53")).toBeNull();
    expect(nextReaderStep(ids, ["step-2"], null)).toBe("step-2");
    expect(nextReaderStep([], [], null)).toBeNull();
  });
  it("restores a valid following cursor only for the same character/chapter/build", () => {
    const position = { scope: "character:chapter:build", id: "step-51", mode: "follow" };
    const state = { __NA: true, levelingReaderPosition: position };
    expect(readerPositionFromHistory(state, position.scope, ids)).toEqual(position);
    expect(readerPositionFromHistory(state, "other-character:chapter:build", ids)).toBeNull();
    expect(readerPositionFromHistory(state, position.scope, ["step-1"])).toBeNull();
  });
  it("refuses malformed browser history without treating it as a saved cursor", () => {
    for (const state of [
      null,
      "bad",
      {},
      { levelingReaderPosition: null },
      { levelingReaderPosition: { scope: "scope", id: "step-51", mode: "invalid" } },
    ])
      expect(readerPositionFromHistory(state, "scope", ids)).toBeNull();
  });
});
