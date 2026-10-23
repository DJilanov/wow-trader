import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { readTankTierSnapshot } from "./forever-tank-tier-list-data";
import {
  readTankSimulatorModelUpdate,
  type TankSimulatorModelUpdate,
} from "./forever-simulator-tank-model-updates";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";
import { readSimulatorPresentation } from "./forever-simulator-presentation";
import { readSimulatorPresetSafety } from "./forever-simulator-preset-safety";
import { serveSimulatorAsset } from "./forever-simulator";

const root = process.env.FOREVER_TANK_REVIEW_ROOT ?? "";
const profiles = ["tank_warrior", "feral_tank_druid", "protection_paladin"] as const;
const models: TankSimulatorModelUpdate[] = [];
const baseline = new Map<string, Buffer>();
const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const stagingSchema = z.object({
  schema: z.literal("kfc-optimized-tank-staging.v1"),
  status: z.literal("staged-awaiting-runtime-reader-and-public-browser-review"),
  selectionSha256: z.string().regex(/^[a-f0-9]{64}$/),
  preservedSelections: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  productionPointerWrites: z.literal(0),
});

// This gate requires real staged packages. Unit-test identities cannot satisfy it.
describe.skipIf(!root)("real optimized tank runtime publication", (): void => {
  beforeAll(async (): Promise<void> => {
    assert(isAbsolute(root), "FOREVER_TANK_REVIEW_ROOT must be an absolute staged runtime path");
    const staging = stagingSchema.parse(
      JSON.parse(await readFile(join(root, "optimized-tank-staging.json"), "utf8")),
    );
    for (const name of [
      "active.json",
      "model-update.json",
      "profile-model-updates.json",
      "published-reviews.json",
      "tank-model-updates.json",
    ]) {
      const bytes = await readFile(join(root, name));
      baseline.set(name, bytes);
      if (name !== "tank-model-updates.json")
        expect(sha(bytes)).toBe(staging.preservedSelections[name]);
    }
    const results = await Promise.all(
      profiles.map((profile) => readTankSimulatorModelUpdate(profile, root)),
    );
    for (const result of results) {
      assert(result, "Every real tank profile must pass the production model reader");
      models.push(result);
    }
    expect(new Set(models.map((model): string => model.manifest.release)).size).toBe(3);
    expect(new Set(models.map((model): string => model.selectionSha256))).toEqual(
      new Set([staging.selectionSha256]),
    );
  }, 30000);
  afterAll(async (): Promise<void> => {
    for (const [name, bytes] of baseline) expect(await readFile(join(root, name))).toEqual(bytes);
  });

  it("selects each approved native workspace through the production presentation and safety readers", async (): Promise<void> => {
    for (const model of models) {
      const profile = model.proof.profile;
      expect((await readSimulatorModelUpdate(profile, root))?.manifest.release).toBe(
        model.manifest.release,
      );
      const presentation = await readSimulatorPresentation(profile, root);
      assert(presentation);
      expect(presentation.manifest.release).toBe(model.manifest.release);
      expect(await readSimulatorPresetSafety(presentation, profile, root)).toBe(
        model.manifest.release,
      );
      expect(model.proof.defaultBuildId).toBe(`${profile.replaceAll("_", "-")}-raid-mitigation`);
      expect(
        model.proof.builds.filter((build): boolean => !build.requiresProvisionalEnchantOptIn),
      ).toHaveLength(4);
    }
  }, 30000);

  it.each(["raid", "solo"] as const)(
    "derives every %s ranking score, item and exact import from real measured builds",
    async (scenario): Promise<void> => {
      const snapshot = await readTankTierSnapshot(scenario, root);
      assert(snapshot?.schema === "kfc-forever-tank-tier-list.v3");
      expect(snapshot.entries).toHaveLength(6);
      expect(snapshot.policy.iterations).toBe(40000);
      expect(snapshot.policy.seeds).toEqual([81491001, 82491001]);
      for (const entry of snapshot.entries) {
        const model = models.find(
          (candidate): boolean => candidate.proof.profile === entry.profile,
        );
        assert(model);
        const build = model.proof.builds.find(
          (candidate): boolean =>
            candidate.scenario === scenario &&
            candidate.objective === entry.objective &&
            !candidate.requiresProvisionalEnchantOptIn,
        );
        assert(build);
        expect(entry.metrics).toEqual(build.reference.metrics);
        expect(entry.threatBreakdown).toEqual(build.threatBreakdown);
        expect(entry.health).toBe(build.reference.health);
        expect(entry.armor).toBe(build.reference.armor);
        expect(entry.gear.map((item): number => item.id)).toEqual(
          build.gear.map((item): number => item.id),
        );
        expect(entry.benchmarkHref).toBe(build.href);
        expect(entry.release).toBe(model.manifest.release);
      }
    },
    30000,
  );

  it("serves the exact native module and build payload while denying private source measurements", async (): Promise<void> => {
    for (const model of models) {
      for (const name of ["kfc-tank-native-library.js", "kfc-tank-native-builds.json"]) {
        const response = await serveSimulatorAsset(
          new Request(`http://localhost/${name}`),
          model.manifest.release,
          [name],
          root,
        );
        expect(response.status).toBe(200);
        expect(sha(new Uint8Array(await response.arrayBuffer()))).toBe(
          model.manifest.files[name]?.sha256,
        );
      }
      for (const name of [
        "kfc-optimized-tank-profile.json",
        "kfc-tank-browser-research.json",
        `tank-measurements/${model.proof.cases[0]!.fingerprint}.json`,
      ])
        for (const method of ["GET", "HEAD"])
          expect(
            (
              await serveSimulatorAsset(
                new Request("http://localhost/private", { method }),
                model.manifest.release,
                name.split("/"),
                root,
              )
            ).status,
          ).toBe(404);
    }
  }, 30000);
});
