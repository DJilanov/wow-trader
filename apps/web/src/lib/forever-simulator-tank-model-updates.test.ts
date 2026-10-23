import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import {
  readTankSimulatorModelUpdate,
  type TankSimulatorModelUpdate,
} from "./forever-simulator-tank-model-updates";
import { readOptimizedTankModelsFixture } from "./fixtures/optimized-tank-ranking";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";
import { readSimulatorPresentation } from "./forever-simulator-presentation";
import { readSimulatorPresetSafety } from "./forever-simulator-preset-safety";

const paths: string[] = [];
afterEach(async (): Promise<void> => {
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});
const sha = (value: string): string => createHash("sha256").update(value).digest("hex"),
  hash = (value: unknown): string => sha(JSON.stringify(value)),
  contents = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";
interface Selection {
  profiles: {
    tank_warrior: SelectedProfile;
    feral_tank_druid: SelectedProfile;
    protection_paladin: SelectedProfile;
  };
  engine: string;
}
interface SelectedProfile {
  release: string;
  proofSha256: string;
  browserReview: { path: string; sha256: string };
}
interface Fixture {
  directory: string;
  release: string;
  documents: Record<string, unknown>;
  proof: TankSimulatorModelUpdate["proof"];
  manifest: SimulatorManifest;
  selection: Selection;
  persist: () => Promise<void>;
  reapprove: () => void;
}
async function fixture(
  profile: TankSimulatorModelUpdate["proof"]["profile"] = "tank_warrior",
): Promise<Fixture> {
  const raw = await readOptimizedTankModelsFixture(),
    release = raw.profiles[profile];
  const directory = await mkdtemp(join(tmpdir(), "kfc-tank-model-reader-"));
  paths.push(directory);
  const proof = raw.documents[
      `${release}/kfc-optimized-tank-profile.json`
    ] as TankSimulatorModelUpdate["proof"],
    manifest = raw.documents[`${release}/manifest.json`] as SimulatorManifest,
    selection = raw.documents["tank-model-updates.json"] as Selection;
  const persist = async (): Promise<void> => {
    await Promise.all(
      Object.entries(raw.documents).map(async ([name, value]): Promise<void> => {
        const target = join(directory, name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, contents(value));
      }),
    );
  };
  const reapprove = (): void => {
    const selected = selection.profiles[profile];
    selected.proofSha256 = sha(contents(proof));
    (manifest.files as Record<string, { bytes: number; sha256: string }>)[
      "kfc-optimized-tank-profile.json"
    ] = { bytes: Buffer.byteLength(contents(proof)), sha256: selected.proofSha256 };
    const review = raw.documents[selected.browserReview.path] as { proofSha256: string };
    review.proofSha256 = selected.proofSha256;
    selected.browserReview.sha256 = hash(review);
  };
  await persist();
  return { ...raw, directory, release, proof, manifest, selection, persist, reapprove };
}

describe("optimized tank model publication", (): void => {
  it.each(["tank_warrior", "feral_tank_druid", "protection_paladin"] as const)(
    "accepts recorded %s delivery through the model, presentation and preset-safety readers",
    async (profile): Promise<void> => {
      const value = await fixture(profile),
        result = await readTankSimulatorModelUpdate(profile, value.directory);
      expect(result?.manifest.release).toBe(value.release);
      expect(result?.proof.builds).toHaveLength(6);
      expect(
        result?.proof.builds.filter((build): boolean => !build.requiresProvisionalEnchantOptIn),
      ).toHaveLength(4);
      expect(result?.proof.defaultBuildId).toBe(`${profile.replaceAll("_", "-")}-raid-mitigation`);
      expect((await readSimulatorModelUpdate(profile, value.directory))?.manifest.release).toBe(
        value.release,
      );
      const presentation = await readSimulatorPresentation(profile, value.directory);
      expect(presentation?.manifest.release).toBe(value.release);
      assert(presentation);
      expect(await readSimulatorPresetSafety(presentation, profile, value.directory)).toBe(
        value.release,
      );
    },
  );
  it("does not intercept other classes and requires an explicit tank selection", async (): Promise<void> => {
    expect(
      await readTankSimulatorModelUpdate("warrior", "/missing-unit-fixture-directory"),
    ).toBeNull();
    const value = await fixture();
    await rm(join(value.directory, "tank-model-updates.json"));
    expect(await readTankSimulatorModelUpdate("tank_warrior", value.directory)).toBeNull();
  });
  it("opens the approved tank presentation and its exact preset-safety release", async (): Promise<void> => {
    const value = await fixture(),
      presentation = await readSimulatorPresentation("tank_warrior", value.directory);
    expect(presentation?.kind).toBe("reviewed-presets");
    expect(presentation?.manifest.release).toBe(value.release);
    assert(presentation);
    expect(await readSimulatorPresetSafety(presentation, "tank_warrior", value.directory)).toBe(
      value.release,
    );
  });
  it("rejects cross-profile approval and numerical asset drift", async (): Promise<void> => {
    const value = await fixture();
    value.selection.profiles.protection_paladin = { ...value.selection.profiles.tank_warrior };
    await value.persist();
    await expect(
      readTankSimulatorModelUpdate("protection_paladin", value.directory),
    ).rejects.toThrow(/scope|identity/i);
    (value.manifest.files as Record<string, { bytes: number; sha256: string }>)["lib.wasm"] = {
      bytes: 1,
      sha256: "f".repeat(64),
    };
    await value.persist();
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /assets|numerical/i,
    );
  });
  it("rejects unmeasured action distributions even when totals and approval hashes still match", async (): Promise<void> => {
    const value = await fixture(),
      build = value.proof.builds[0];
    assert(build);
    const [first, second] = build.threatBreakdown;
    assert(first && second);
    first.damagePerSecond += 0.01;
    second.damagePerSecond -= 0.01;
    value.reapprove();
    await value.persist();
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /differs from the measured/i,
    );
  });
  it("rejects unsafe defaults and incomplete browser evidence after checksum reapproval", async (): Promise<void> => {
    const value = await fixture();
    value.proof.defaultBuildId = "tank-warrior-raid-threat";
    value.reapprove();
    await value.persist();
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /default|library/i,
    );
    value.proof.defaultBuildId = "tank-warrior-raid-mitigation";
    value.reapprove();
    const profile = value.selection.profiles.tank_warrior,
      review = value.documents[profile.browserReview.path] as { checked: unknown[] };
    review.checked.pop();
    profile.browserReview.sha256 = hash(review);
    await value.persist();
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /Incomplete|saved-character|browser/i,
    );
  });
  it("rejects modified source measurements and symlink escapes", async (): Promise<void> => {
    const value = await fixture(),
      reference = value.proof.cases[0];
    assert(reference);
    const path = `${value.release}/tank-measurements/${reference.fingerprint}.json`;
    value.documents[path] = {
      ...(value.documents[path] as Record<string, unknown>),
      engine: "f".repeat(64),
    };
    await value.persist();
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /measurements/i,
    );
    const external = await mkdtemp(join(tmpdir(), "kfc-tank-model-outside-"));
    paths.push(external);
    const payloadPath = `${value.release}/kfc-tank-native-builds.json`;
    await writeFile(join(external, "builds.json"), contents(value.documents[payloadPath]));
    await rm(join(value.directory, payloadPath));
    await symlink(join(external, "builds.json"), join(value.directory, payloadPath));
    await expect(readTankSimulatorModelUpdate("tank_warrior", value.directory)).rejects.toThrow(
      /escaped simulator storage/i,
    );
  });
});
