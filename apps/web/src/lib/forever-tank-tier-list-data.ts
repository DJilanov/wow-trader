import { createHash } from "node:crypto";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cache } from "react";
import { z } from "zod";
import { simulatorManifestSchema } from "@wow-trader/forever-data/simulator";
import soloData from "./data/forever-tank-tier-list.solo.json";
import raidData from "./data/forever-tank-tier-list.raid.json";
import raidSupport from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { raidBenchmarkDebuffs } from "../../../../infra/simulator/tier-scenarios.mjs";
import { tankTierPolicy, tankTierUnranked } from "../../../../infra/simulator/tank-tier-policy.mjs";
import { simulatorDirectory } from "./forever-simulator";
import {
  tankTierSnapshotSchema,
  type TankTierScenario,
  type TankTierSnapshot,
} from "./forever-tank-tier-list";

const sources = { solo: soloData, raid: raidData };
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const selectionSchema = z
  .object({
    schema: z.literal("kfc-simulator-model-update-selection.v1"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
  })
  .passthrough();
const overridesSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-selection.v1"),
    profiles: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export async function readTankTierSnapshot(
  scenario: TankTierScenario,
  directory: string = simulatorDirectory(),
  source: unknown = sources[scenario],
): Promise<TankTierSnapshot | null> {
  return readVerifiedTankSnapshot(scenario, directory, source);
}

// Metadata and the page share verification within one render, never across requests.
const readVerifiedTankSnapshot = cache(async function readVerifiedTankSnapshot(
  scenario: TankTierScenario,
  directory: string,
  source: unknown,
): Promise<TankTierSnapshot | null> {
  try {
    const snapshot = tankTierSnapshotSchema.parse(source);
    if (
      snapshot.policy.scenario !== scenario ||
      hash(tankTierPolicy(scenario)) !== snapshot.policySha256 ||
      hash({ support: raidSupport, debuffs: raidBenchmarkDebuffs }) !== snapshot.supportSha256 ||
      hash(snapshot.policy) !== snapshot.policySha256 ||
      hash(snapshot.unranked) !== hash(tankTierUnranked)
    )
      throw new Error("Tank comparison policy changed");
    const active: unknown = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
    const selection: unknown = JSON.parse(
      await readFile(join(directory, "model-update.json"), "utf8"),
    );
    const overrides = overridesSchema.parse(
      JSON.parse(await readFile(join(directory, "profile-model-updates.json"), "utf8")),
    );
    if (
      hash(active) !== snapshot.approvedSelection.activeManifestSha256 ||
      hash(selection) !== snapshot.approvedSelection.modelSelectionSha256
    )
      throw new Error("The approved tank model selection changed");
    const selected = selectionSchema.parse(selection);
    const rawManifest: unknown = JSON.parse(
      await readFile(join(directory, selected.release, "manifest.json"), "utf8"),
    );
    const manifest = simulatorManifestSchema.parse(rawManifest);
    for (const entry of snapshot.entries) {
      if (
        Object.hasOwn(overrides.profiles, entry.profile) ||
        manifest.release !== entry.release ||
        selected.release !== entry.release ||
        hash(rawManifest) !== entry.manifestSha256 ||
        manifest.files["lib.wasm"]?.sha256 !== entry.wasmSha256 ||
        manifest.files["assets/database/db.json"]?.sha256 !== entry.databaseSha256 ||
        manifest.files["kfc-tank-starters.json"]?.sha256 !== entry.starterSha256
      )
        throw new Error("The selected tank model or starter needs a new measurement");
    }
    return snapshot;
  } catch (error: unknown) {
    console.warn(
      "[simulator] Tank tier list unavailable",
      error instanceof Error ? error.message : "Unknown error",
    );
    return null;
  }
});
