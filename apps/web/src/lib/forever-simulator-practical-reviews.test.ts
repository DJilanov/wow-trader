import { describe, expect, it } from "vitest";
import { createPracticalSimulatorDeliveryReader } from "./forever-simulator-practical-reviews";
import { hunterBeastMasteryDeliveryDefinition } from "./forever-simulator-hunter-reviews";

describe("shared practical-delivery class boundary", () => {
  it("requires the actual profile/protobuf class instead of allowing a relabelled Rogue contract", () => {
    for (const changes of [
      { playerClass: 6, playerClassName: "ClassRogue" },
      { playerClass: 9 },
      { playerClassName: "ClassMage" },
      { profile: "unreviewed-profile" },
    ])
      expect(() =>
        createPracticalSimulatorDeliveryReader({
          ...hunterBeastMasteryDeliveryDefinition,
          ...changes,
        }),
      ).toThrow(/class mismatch/);
  });

  it("does not accept filesystem escapes or malformed optional pointer names", () => {
    for (const pointerFile of [
      "../secret.json",
      "/tmp/secret.json",
      "C:\\secret.json",
      "hunter.json/other",
      "hunter\\.json",
      "hunter.json\0",
    ])
      expect(() =>
        createPracticalSimulatorDeliveryReader({
          ...hunterBeastMasteryDeliveryDefinition,
          pointerFile,
        }),
      ).toThrow(/pointer/);
  });

  it("requires a finite, unique17-slot empty-hand contract", () => {
    for (const allowedEmptySlots of [[-1], [17], [15, 15], [Number.NaN], [1.5]])
      expect(() =>
        createPracticalSimulatorDeliveryReader({
          ...hunterBeastMasteryDeliveryDefinition,
          allowedEmptySlots,
        }),
      ).toThrow(/empty-slot/);
  });
});
