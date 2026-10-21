import { describe, expect, it } from "vitest";
import { capturedItemObjectives } from "./loot-quantities.js";

describe("named quantities retained in older objective captures", () => {
  it("recovers named counters without interpreting prose numbers", () => {
    expect(
      capturedItemObjectives(
        ["Bring the head to Dun Modr. Head of Deepfury (1)"],
        [{ itemId: 3640, name: "Head of Deepfury" }],
      ).get(3640),
    ).toEqual({ quantity: 1, provided: false });
    expect(
      capturedItemObjectives(
        ["Collect 2 Pristine Yeti Horns."],
        [{ itemId: 12367, name: "Pristine Yeti Horn" }],
      ).size,
    ).toBe(0);
  });
  it("distinguishes multiple full names and regular-expression punctuation", () => {
    expect([
      ...capturedItemObjectives(
        ["Bring the tablets. First Mosh'aru Tablet (1) Second Mosh'aru Tablet (2)"],
        [
          { itemId: 10660, name: "First Mosh'aru Tablet" },
          { itemId: 10661, name: "Second Mosh'aru Tablet" },
        ],
      ),
    ]).toEqual([
      [10660, { quantity: 1, provided: false }],
      [10661, { quantity: 2, provided: false }],
    ]);
    expect(
      capturedItemObjectives(["Item [A]+ (2)"], [{ itemId: 1, name: "Item [A]+" }]).get(1)
        ?.quantity,
    ).toBe(2);
  });
  it("rejects conflicting, ambiguous, provided-item and out-of-budget counters", () => {
    expect(
      capturedItemObjectives(["Meat (8)", "Meat (9)"], [{ itemId: 750, name: "Meat" }]).size,
    ).toBe(0);
    expect(
      capturedItemObjectives(
        ["Meat (8)"],
        [
          { itemId: 750, name: "Meat" },
          { itemId: 751, name: "Meat" },
        ],
      ).size,
    ).toBe(0);
    expect(
      capturedItemObjectives(
        ["Use your supplies. Provided item: Meat (8)"],
        [{ itemId: 750, name: "Meat" }],
      ).size,
    ).toBe(0);
    expect(capturedItemObjectives(["Meat (9999999)"], [{ itemId: 750, name: "Meat" }]).size).toBe(
      0,
    );
  });
  it("does not bind a shorter name embedded in another item's title", () => {
    expect(capturedItemObjectives(["Massive Paw (8)"], [{ itemId: 1, name: "Paw" }]).size).toBe(0);
    expect([
      ...capturedItemObjectives(
        ["Massive Paw (8) Paw (2)"],
        [
          { itemId: 1, name: "Paw" },
          { itemId: 2, name: "Massive Paw" },
        ],
      ),
    ]).toEqual([
      [2, { quantity: 8, provided: false }],
      [1, { quantity: 2, provided: false }],
    ]);
  });
  it("retains Provided markers without adding collection work after pickup", () => {
    expect(
      capturedItemObjectives(
        ["Bring the relic. Titan Relic (Provided) (1)"],
        [{ itemId: 270865, name: "Titan Relic" }],
      ).get(270865),
    ).toEqual({ quantity: 1, provided: true });
    expect(
      capturedItemObjectives(["Relic (1)", "Relic (Provided) (1)"], [{ itemId: 1, name: "Relic" }])
        .size,
    ).toBe(0);
  });
});
