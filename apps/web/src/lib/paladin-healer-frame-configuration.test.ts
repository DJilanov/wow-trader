import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { configurationForPaladinHealerFrame } from "@wow-trader/forever-data/paladin-healer-workspace";
import {
  framePayloadFixtures,
  frameReleaseFixture,
} from "./fixtures/paladin-healer-frame-contract";
import {
  decodePaladinFrameConfiguration,
  encodePaladinFrameConfiguration,
  isOriginalPaladinFrameConfiguration,
  paladinFrameConfigurationStorageKey,
  paladinFrameEquipmentChange,
} from "./paladin-healer-frame-configuration";

const frame = framePayloadFixtures[0]!;
const config = configurationForPaladinHealerFrame(frame, frameReleaseFixture.release);

describe("Personal Paladin frame configurations", () => {
  it("round-trips all authentic coupled cases without changing their measured inputs", () => {
    let cases = 0;
    for (const payload of framePayloadFixtures)
      for (const entry of payload.configurations) {
        const original = configurationForPaladinHealerFrame(
          payload,
          frameReleaseFixture.release,
          entry.scenarioId,
        );
        expect(decodePaladinFrameConfiguration(encodePaladinFrameConfiguration(original))).toEqual(
          original,
        );
        expect(isOriginalPaladinFrameConfiguration(payload, original)).toBe(true);
        cases++;
      }
    expect(cases).toBe(56);
  });

  it("invalidates the measured reference only for numerical character changes", () => {
    expect(isOriginalPaladinFrameConfiguration(frame, { ...config, iterations: 128 })).toBe(true);
    const personal = structuredClone(config);
    personal.workload.priorities[0]!.minimumMissingHealth += 1;
    expect(isOriginalPaladinFrameConfiguration(frame, personal)).toBe(false);
    const changed = structuredClone(config);
    changed.gear[13] = { id: 272438 };
    expect(isOriginalPaladinFrameConfiguration(frame, changed)).toBe(false);
    expect(paladinFrameConfigurationStorageKey(config.release)).toContain(":v4:");
  });

  it("adds newly equipped uses, prunes lost owners and preserves fixed model assumptions", () => {
    const original = structuredClone(config);
    original.gear[13] = { id: 272438 };
    original.workload.cooldowns.push({ itemId: 272438, requireHealingDemand: true });
    const gear = structuredClone(original.gear);
    gear[13] = { id: 20512 };
    const result = paladinFrameEquipmentChange(original, gear, true, "rune-last");
    expect(result.workload.cooldowns.some((entry) => entry.itemId === 272438)).toBe(false);
    expect(result.workload.cooldowns).toContainEqual({
      itemId: 20512,
      minimumMissingMana: 1500,
      requireHealingDemand: true,
    });
    expect({ ...result.workload, cooldowns: [] }).toEqual({ ...original.workload, cooldowns: [] });
    expect(original.gear[13]!.id).toBe(272438);
    expect(original.workload.cooldowns.some((entry) => entry.itemId === 272438)).toBe(true);
  });

  it("retains disabled existing uses and respects utility and rune ordering choices", () => {
    const original = structuredClone(config);
    original.gear[13] = { id: 272438 };
    original.workload.cooldowns = [{ itemId: 12662 }];
    const gear = structuredClone(original.gear);
    gear[0] = { id: 4381 };
    const disabled = paladinFrameEquipmentChange(original, gear, false, "rune-last");
    expect(disabled.workload.cooldowns).toEqual([{ itemId: 12662 }]);
    const enabled = paladinFrameEquipmentChange(original, gear, true, "rune-last");
    expect(enabled.workload.cooldowns.map((entry) => entry.itemId)).toEqual([4381, 12662]);
    const enchanted = structuredClone(original.gear);
    enchanted[0] = { ...enchanted[0]!, enchant: 2543 };
    expect(paladinFrameEquipmentChange(original, enchanted, true, "as-declared").workload).toEqual(
      original.workload,
    );
  });

  it("rejects malformed, oversized and invalid-version shares", () => {
    for (const token of ["", "%", "a".repeat(12_001)])
      expect(() => decodePaladinFrameConfiguration(token)).toThrow();
    const token = (text: string): string =>
      Buffer.from(deflateSync(new TextEncoder().encode(text))).toString("base64url");
    expect(() => decodePaladinFrameConfiguration(token(" ".repeat(65_538)))).toThrow();
    expect(() =>
      decodePaladinFrameConfiguration(token(JSON.stringify({ ...config, version: 3 }))),
    ).toThrow();
  });
});
