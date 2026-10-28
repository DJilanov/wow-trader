import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readQualifiedTankSimulatorModelUpdate } from "./forever-simulator-qualified-tank-model";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";
import { readSimulatorPresentation } from "./forever-simulator-presentation";
import { readSimulatorPresetSafety } from "./forever-simulator-preset-safety";
import { readPublishedSimulatorReviews } from "./forever-simulator-published-reviews";

const paths: string[] = [];
const sha = (value: string): string => createHash("sha256").update(value).digest("hex");
function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
interface Fixture {
  directory: string;
  release: string;
  documents: Record<string, string>;
  edit: (name: string, change: (value: Record<string, unknown>) => void) => Promise<void>;
}
async function fixture(name = "qualified-bear-model.json.gz"): Promise<Fixture> {
  const raw = z
    .object({ release: z.string(), documents: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        gunzipSync(await readFile(new URL(`./fixtures/${name}`, import.meta.url))).toString("utf8"),
      ),
    );
  const directory = await mkdtemp(join(tmpdir(), "kfc-qualified-bear-"));
  paths.push(directory);
  for (const [path, content] of Object.entries(raw.documents)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content);
  }
  const edit = async (
    name: string,
    change: (value: Record<string, unknown>) => void,
  ): Promise<void> => {
    const value = record(JSON.parse(raw.documents[name] ?? "null"));
    change(value);
    raw.documents[name] = JSON.stringify(value, null, 2) + "\n";
    await writeFile(join(directory, name), raw.documents[name]);
  };
  return { ...raw, directory, edit };
}
afterEach(async (): Promise<void> => {
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("qualified Bear and Protection model delivery", (): void => {
  it("accepts authentic Protection menus and exact archived native controls through every website reader", async (): Promise<void> => {
    const value = await fixture("qualified-paladin-tank-model.v1.json.gz");
    expect(value.release).toBe("8cc775ad60b492c2508b392d");
    expect(
      (await readQualifiedTankSimulatorModelUpdate("protection_paladin", value.directory))?.manifest
        .release,
    ).toBe(value.release);
    expect(
      (await readSimulatorModelUpdate("protection_paladin", value.directory))?.manifest.release,
    ).toBe(value.release);
    const presentation = await readSimulatorPresentation("protection_paladin", value.directory);
    assert(presentation);
    expect(presentation.manifest.release).toBe(value.release);
    expect(
      await readSimulatorPresetSafety(presentation, "protection_paladin", value.directory),
    ).toBe(value.release);
    const builds = await readPublishedSimulatorReviews(
      presentation,
      "protection_paladin",
      value.directory,
    );
    expect(builds).toHaveLength(6);
    expect(
      builds.every(
        (build): boolean =>
          build.validationIterations === 40000 &&
          build.href?.includes(`/forever-sim/${value.release}/protection_paladin/`) === true &&
          build.rotationGuidance?.talents === "0/42/9",
      ),
    ).toBe(true);
    expect(builds.filter((build): boolean => build.requiresProvisionalEnchantOptIn)).toHaveLength(
      2,
    );
    expect(builds[0]?.rotationGuidance?.priorities.join(" ")).toContain("Swift Judgement");
    expect(
      await readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).toBeNull();
    await writeFile(join(value.directory, "qualified-tank-model.json"), "invalid");
    expect(
      (await readQualifiedTankSimulatorModelUpdate("protection_paladin", value.directory))?.manifest
        .release,
    ).toBe(value.release);
  });

  it("rejects the authentic Paladin candidate until actual menu/native approval exists", async (): Promise<void> => {
    const value = await fixture("qualified-paladin-tank-pending.v1.json.gz");
    await expect(
      readQualifiedTankSimulatorModelUpdate("protection_paladin", value.directory),
    ).rejects.toThrow(/kfc-qualified-tank-browser.v1/);
    expect(
      await readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).toBeNull();
  });

  it("keeps Paladin independent of a complete Bear selection", async (): Promise<void> => {
    const value = await fixture();
    expect(
      await readQualifiedTankSimulatorModelUpdate("protection_paladin", value.directory),
    ).toBeNull();
    await writeFile(join(value.directory, "qualified-paladin-tank-model.json"), "invalid");
    expect(
      (await readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory))?.manifest
        .release,
    ).toBe(value.release);
  });

  it("rejects Bear evidence offered as a Paladin release", async (): Promise<void> => {
    const value = await fixture();
    const selected = record(JSON.parse(value.documents["qualified-tank-model.json"] ?? "null"));
    await writeFile(
      join(value.directory, "qualified-paladin-tank-model.json"),
      JSON.stringify({ ...selected, profile: "protection_paladin" }),
    );
    await expect(
      readQualifiedTankSimulatorModelUpdate("protection_paladin", value.directory),
    ).rejects.toThrow();
  });

  it("accepts authentic recorded numerics, presets and all fourteen browser checks through the website readers", async (): Promise<void> => {
    const value = await fixture();
    expect(
      (await readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory))?.manifest
        .release,
    ).toBe(value.release);
    expect(
      (await readSimulatorModelUpdate("feral_tank_druid", value.directory))?.manifest.release,
    ).toBe(value.release);
    const presentation = await readSimulatorPresentation("feral_tank_druid", value.directory);
    assert(presentation);
    expect(presentation.manifest.release).toBe(value.release);
    expect(await readSimulatorPresetSafety(presentation, "feral_tank_druid", value.directory)).toBe(
      value.release,
    );
    const builds = await readPublishedSimulatorReviews(
      presentation,
      "feral_tank_druid",
      value.directory,
    );
    expect(builds).toHaveLength(6);
    expect(
      builds.every(
        (build): boolean =>
          build.validationIterations === 40000 &&
          build.href?.includes(`/forever-sim/${value.release}/`) === true,
      ),
    ).toBe(true);
    expect(builds.filter((build): boolean => build.requiresProvisionalEnchantOptIn)).toHaveLength(
      2,
    );
    expect(builds[0]?.rotationGuidance?.priorities).toHaveLength(4);
    expect(builds[0]?.rotationGuidance?.caveats.join(" ")).toContain(
      "did not perform a deep rotation search",
    );
  });
  it("leaves other classes and absent selections alone", async (): Promise<void> => {
    expect(
      await readQualifiedTankSimulatorModelUpdate("tank_warrior", "/missing-fixture"),
    ).toBeNull();
    const value = await fixture();
    await rm(join(value.directory, "qualified-tank-model.json"));
    expect(
      await readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).toBeNull();
  });
  it("rejects numerical asset drift", async (): Promise<void> => {
    const value = await fixture();
    await value.edit(value.release + "/manifest.json", (manifest): void => {
      record(record(manifest.files)["lib.wasm"]).sha256 = "f".repeat(64);
    });
    await expect(
      readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).rejects.toThrow(/combat asset/);
  });
  it("rejects changed presets instead of trusting a still-valid proof", async (): Promise<void> => {
    const value = await fixture();
    await value.edit(value.release + "/kfc-tank-native-builds.json", (payload): void => {
      assert(Array.isArray(payload.builds));
      record(record(record(payload.builds[0]).proto).raidBuffs).trueshotAura = false;
    });
    await expect(
      readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).rejects.toThrow(/checksum/);
  });
  it("rejects duplicate setups even after updating the proof checksum", async (): Promise<void> => {
    const value = await fixture(),
      name = value.release + "/kfc-qualified-tank-model.json";
    await value.edit(name, (proof): void => {
      assert(Array.isArray(proof.builds));
      proof.builds[1] = proof.builds[0];
    });
    const digest = sha(value.documents[name] ?? "");
    await value.edit("qualified-tank-model.json", (pointer): void => {
      pointer.proofSha256 = digest;
    });
    await value.edit(value.release + "/manifest.json", (manifest): void => {
      record(record(manifest.files)["kfc-qualified-tank-model.json"]).sha256 = digest;
    });
    await expect(
      readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).rejects.toThrow(/omitted or duplicated/);
  });
  it("requires every mobile browser check after checksum reapproval", async (): Promise<void> => {
    const value = await fixture(),
      name = "tank-browser-reviews/" + value.release + ".json";
    await value.edit(name, (review): void => {
      assert(Array.isArray(review.checks));
      review.checks.pop();
    });
    await value.edit("qualified-tank-model.json", (pointer): void => {
      pointer.browserReviewSha256 = sha(value.documents[name] ?? "");
    });
    await expect(
      readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).rejects.toThrow();
  });
  it("rejects symlinks that escape simulator evidence storage", async (): Promise<void> => {
    const value = await fixture(),
      outside = await mkdtemp(join(tmpdir(), "kfc-bear-outside-"));
    paths.push(outside);
    const name = value.release + "/kfc-qualified-tank-model.json",
      target = join(outside, "proof.json");
    await writeFile(target, value.documents[name] ?? "");
    await rm(join(value.directory, name));
    await symlink(target, join(value.directory, name));
    await expect(
      readQualifiedTankSimulatorModelUpdate("feral_tank_druid", value.directory),
    ).rejects.toThrow(/escaped/);
  });
});
