import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  parseShamanHealerGroupPayload,
  shamanHealerLibraryIndexSchema,
} from "./shaman-healer-library.js";
import { shamanHealerPresentationSchema } from "./shaman-healer-release.js";
import {
  configurationForShamanHealerBuild,
  isOriginalShamanConfiguration,
  shamanHealerConfigurationProblem,
  shamanHealerSourceConfiguration,
  shamanHealerTalentsString,
} from "./shaman-healer-workspace.js";

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(
    gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))).toString("utf8"),
  ) as Record<string, unknown>;
}
const library = fixture("shaman-healer-library.v2.json.gz");
const index = shamanHealerLibraryIndexSchema.parse(library.index);
const group = parseShamanHealerGroupPayload(index, library.payload);
const presentation = shamanHealerPresentationSchema.parse(
  fixture("shaman-healer-presentation.v1.json.gz").presentation,
);
const release = "a".repeat(24);
const original = configurationForShamanHealerBuild(index, group, release);

describe("Shaman personal healing configuration", () => {
  it("loads the actual legal Dwarf default and its complete casting plan", () => {
    expect(
      shamanHealerConfigurationProblem(index, group, presentation, original, release),
    ).toBeNull();
    expect(isOriginalShamanConfiguration(index, group, original)).toBe(true);
    const source = shamanHealerSourceConfiguration(index, group, original, release);
    expect(original.gear).toEqual(source.gear);
    expect(original.cooldowns).toEqual(source.job.workload.cooldowns);
    expect(shamanHealerTalentsString(presentation, original.fields)).toBe(source.talentsString);
    expect(isOriginalShamanConfiguration(index, group, { ...original, iterations: 64 })).toBe(true);
  });
  it("rejects stale model, release and source configurations", () => {
    for (const patch of [
      { release: "b".repeat(24) },
      { modelIdentity: "b".repeat(64) },
      { sourceConfigurationId: "b".repeat(64) },
      { groupId: "unknown" },
    ])
      expect(
        shamanHealerConfigurationProblem(
          index,
          group,
          presentation,
          { ...original, ...patch },
          release,
        ),
      ).not.toBeNull();
  });
  it("rejects other-faction equipment, impossible enchants and incomplete talents", () => {
    const gear = structuredClone(original.gear);
    gear[12] = { id: 18471 };
    expect(
      shamanHealerConfigurationProblem(index, group, presentation, { ...original, gear }, release),
    ).not.toBeNull();
    gear[12] = { ...original.gear[12]!, enchant: 999999 };
    expect(
      shamanHealerConfigurationProblem(index, group, presentation, { ...original, gear }, release),
    ).not.toBeNull();
    expect(
      shamanHealerConfigurationProblem(
        index,
        group,
        presentation,
        { ...original, fields: {} },
        release,
      ),
    ).not.toBeNull();
  });
  it("rejects unlearned spells, invalid conditions and unavailable resource uses", () => {
    for (const priority of [
      { ...original.priorities[0]!, spellId: 999999 },
      { ...original.priorities[0]!, raidIndex: 39 },
      { ...original.priorities[0]!, minimumMissingHealth: 100 },
      { ...original.priorities[0]!, keepHot: true },
    ])
      expect(
        shamanHealerConfigurationProblem(
          index,
          group,
          presentation,
          { ...original, priorities: [priority] },
          release,
        ),
      ).not.toBeNull();
    for (const patch of [
      { itemId: original.gear[0]!.id },
      { itemId: 999999 },
      { earliestMs: 180000 },
    ])
      expect(
        shamanHealerConfigurationProblem(
          index,
          group,
          presentation,
          { ...original, cooldowns: [{ ...original.cooldowns[0]!, ...patch }] },
          release,
        ),
      ).not.toBeNull();
    expect(
      shamanHealerConfigurationProblem(
        index,
        group,
        presentation,
        { ...original, consumes: { ...original.consumes, defaultPotion: 0 } },
        release,
      ),
    ).not.toBeNull();
  });
  it("does not display recorded scores for changed equipment or casting rules", () => {
    const config = structuredClone(original);
    config.priorities[0]!.minimumMissingMana = 1;
    expect(isOriginalShamanConfiguration(index, group, config)).toBe(false);
    const gear = structuredClone(original.gear);
    delete gear[0]!.enchant;
    expect(isOriginalShamanConfiguration(index, group, { ...original, gear })).toBe(false);
  });
});
