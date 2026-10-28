import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePaladinHealerFramePayload } from "./paladin-healer-frame.js";
import {
  configurationForPaladinHealerFrame,
  paladinHealerFrameBrowserInput,
  paladinHealerFrameConfigurationSourceProblem,
  paladinHealerFrameWorkspaceConfigurationSchema,
} from "./paladin-healer-workspace.js";

const fixture = z
  .object({ assets: z.array(z.object({ payload: z.unknown() })) })
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/paladin-healer-frames.v2.json.gz", import.meta.url)),
      ).toString("utf8"),
    ),
  );
const frames = fixture.assets.map((entry) => parsePaladinHealerFramePayload(entry.payload));
const release = "a".repeat(24);
const frame = frames[1]!;
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("version-four Paladin frame workspace", () => {
  it("loads all 56 measured scenarios with their complete profile and original workload bytes", () => {
    let count = 0;
    for (const payload of frames) {
      for (const source of payload.configurations) {
        const config = configurationForPaladinHealerFrame(payload, release, source.scenarioId);
        expect(paladinHealerFrameWorkspaceConfigurationSchema.parse(config)).toBe(config);
        expect(paladinHealerFrameConfigurationSourceProblem(payload, config, release)).toBeNull();
        expect(config.context).toEqual(payload.frame.context);
        expect(config.sourceRequestBase64).toBe(source.job.requestBase64);
        expect(config.sourceOptionId).toBe(source.optionId);
        expect(config.gear).toEqual(source.option.gear.items);
        expect(config.fields).toEqual(source.option.state.fields);
        expect(hash(config.workload)).toBe(source.workloadId);
        expect(config.version).toBe(4);
        count++;
      }
    }
    expect(count).toBe(56);
  });

  it("returns editable copies without modifying any archived source", () => {
    const before = JSON.stringify(frame);
    const config = configurationForPaladinHealerFrame(frame, release);
    config.gear[0]!.id = 1;
    config.fields.divineFavor = 0;
    config.context.professions[0] = 1;
    config.workload.priorities[0]!.minimumMissingHealth += 1;
    config.workload.cooldowns.length = 0;
    expect(JSON.stringify(frame)).toBe(before);
  });

  it("rejects saved builds for another model, release, frame, scenario or source request", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    for (const changes of [
      { release: "b".repeat(24) },
      { modelIdentity: "0".repeat(64) },
      { frameId: frames[0]!.frame.id },
      { scenarioId: "unknown" },
      { sourceConfigurationId: "0".repeat(64) },
      { sourceOptionId: "0".repeat(64) },
      { sourceRequestBase64: "YQ==" },
    ])
      expect(
        paladinHealerFrameConfigurationSourceProblem(frame, { ...config, ...changes }, release),
      ).not.toBeNull();
  });

  it("rejects altered race, faction and profession bindings", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    for (const changes of [
      { raceId: 8 },
      { faction: 2 as const },
      { professions: [1, 2] as [number, number] },
    ])
      expect(
        paladinHealerFrameConfigurationSourceProblem(
          frame,
          { ...config, context: { ...config.context, ...changes } },
          release,
        ),
      ).not.toBeNull();
  });

  it("keeps measured encounter and mechanics assumptions fixed while permitting personal casting controls", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    const casting = structuredClone(config);
    casting.workload.priorities[0]!.minimumMissingHealth += 100;
    casting.workload.cooldowns.length = 0;
    casting.workload.useDivineFavor = false;
    casting.workload.divineFavorMinimumBaseCost = 0;
    expect(paladinHealerFrameConfigurationSourceProblem(frame, casting, release)).toBeNull();
    for (const field of ["name", "targets", "damage", "rankScaling"] as const) {
      const changed = structuredClone(config);
      if (field === "name") changed.workload.name = changed.workload.name.replace("300s", "180s");
      else if (field === "targets") changed.workload.targets[1]!.x += 1;
      else if (field === "damage") changed.workload.damage[0]!.amount += 1;
      else changed.workload.rankScaling.id = "edited-reference";
      expect(paladinHealerFrameConfigurationSourceProblem(frame, changed, release)).not.toBeNull();
    }
  });

  it("creates a source-bound browser input without changing the selected adaptive priorities", () => {
    const source = frame.configurations.find((entry): boolean => Boolean(entry.adaptivePolicy))!;
    const config = configurationForPaladinHealerFrame(frame, release, source.scenarioId);
    const input = paladinHealerFrameBrowserInput(frame, config, release, {
      id: "paladin-frame-test",
      seed: 206270001,
    });
    expect(input.sourceRequestBase64).toBe(source.job.requestBase64);
    expect(input.sourceContext).toEqual(frame.frame.context);
    expect(input.frame).toEqual(frame.frame.variant);
    expect(input.workload).toEqual(config.workload);
    expect(hash(input.workload)).toBe(source.workloadId);
    expect(input.workload).not.toBe(config.workload);
    input.gear[0]!.id = 1;
    expect(config.gear[0]!.id).not.toBe(1);
  });

  it("rejects another configuration version and invalid browser job options", () => {
    const config = configurationForPaladinHealerFrame(frame, release);
    for (const changed of [
      { ...config, version: 3 },
      { ...config, iterations: 0 },
      { ...config, unknown: true },
    ])
      expect(paladinHealerFrameWorkspaceConfigurationSchema.safeParse(changed).success).toBe(false);
    for (const options of [
      { id: "../bad", seed: 1 },
      { id: "test", seed: 0 },
      { id: "test", seed: 1.5 },
    ])
      expect(() => paladinHealerFrameBrowserInput(frame, config, release, options)).toThrow();
    expect(() => configurationForPaladinHealerFrame(frame, release, "unknown")).toThrow();
  });
});
