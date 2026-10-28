import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readQualifiedWarriorTankSimulatorModelUpdate } from "./forever-simulator-qualified-warrior-tank-model";
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
async function fixture(): Promise<Fixture> {
  const raw = z
    .object({ release: z.string(), documents: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        gunzipSync(
          await readFile(
            new URL("./fixtures/qualified-warrior-tank-model.v1.json.gz", import.meta.url),
          ),
        ).toString("utf8"),
      ),
    );
  const directory = await mkdtemp(join(tmpdir(), "kfc-qualified-warrior-tank-"));
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

describe("current Warrior tank model delivery", (): void => {
  it("accepts authentic recorded numerics, presets and all fourteen browser checks through the website readers", async (): Promise<void> => {
    const value = await fixture();
    expect(
      (await readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory))
        ?.manifest.release,
    ).toBe(value.release);
    expect(
      (await readSimulatorModelUpdate("tank_warrior", value.directory))?.manifest.release,
    ).toBe(value.release);
    const presentation = await readSimulatorPresentation("tank_warrior", value.directory);
    assert(presentation);
    expect(presentation.manifest.release).toBe(value.release);
    expect(await readSimulatorPresetSafety(presentation, "tank_warrior", value.directory)).toBe(
      value.release,
    );
    const builds = await readPublishedSimulatorReviews(
      presentation,
      "tank_warrior",
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
    expect(
      builds.every(
        (build): boolean =>
          build.rotationGuidance?.talents === "8/5/38" &&
          build.rotationGuidance.priorities.length === 11,
      ),
    ).toBe(true);
    expect(builds[0]?.stage).toContain("2%");
    expect(builds[0]?.rotationGuidance?.caveats.join(" ")).toContain(
      "did not perform a deep rotation timing search",
    );
  });
  it("leaves other classes and absent selections alone", async (): Promise<void> => {
    expect(
      await readQualifiedWarriorTankSimulatorModelUpdate("mage", "/missing-fixture"),
    ).toBeNull();
    const value = await fixture();
    await rm(join(value.directory, "qualified-warrior-tank-model.json"));
    expect(
      await readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
    ).toBeNull();
  });
  it("rejects numerical asset drift", async (): Promise<void> => {
    const value = await fixture();
    await value.edit(value.release + "/manifest.json", (manifest): void => {
      record(record(manifest.files)["lib.wasm"]).sha256 = "f".repeat(64);
    });
    await expect(
      readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
    ).rejects.toThrow(/combat asset/);
  });
  it("rejects changed presets instead of trusting a still-valid proof", async (): Promise<void> => {
    const value = await fixture();
    await value.edit(value.release + "/kfc-tank-native-builds.json", (payload): void => {
      assert(Array.isArray(payload.builds));
      record(record(record(payload.builds[0]).proto).raidBuffs).trueshotAura = false;
    });
    await expect(
      readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
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
    await value.edit("qualified-warrior-tank-model.json", (pointer): void => {
      pointer.proofSha256 = digest;
    });
    await value.edit(value.release + "/manifest.json", (manifest): void => {
      record(record(manifest.files)["kfc-qualified-tank-model.json"]).sha256 = digest;
    });
    await expect(
      readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
    ).rejects.toThrow(/omitted or duplicated/);
  });
  it("requires every mobile browser check after checksum reapproval", async (): Promise<void> => {
    const value = await fixture(),
      name = "warrior-tank-browser-reviews/" + value.release + ".json";
    await value.edit(name, (review): void => {
      assert(Array.isArray(review.checks));
      review.checks.pop();
    });
    await value.edit("qualified-warrior-tank-model.json", (pointer): void => {
      pointer.browserReviewSha256 = sha(value.documents[name] ?? "");
    });
    await expect(
      readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
    ).rejects.toThrow();
  });
  it.each(["parity", "consent", "deadline"] as const)(
    "rejects reapproved browser evidence with invalid %s",
    async (kind): Promise<void> => {
      const value = await fixture(),
        name = "warrior-tank-browser-reviews/" + value.release + ".json";
      await value.edit(name, (review): void => {
        if (kind === "deadline") {
          review.completedAt = "2099-01-01T00:00:00.000Z";
          return;
        }
        assert(Array.isArray(review.checks));
        const check = review.checks
          .map(record)
          .find(
            (row): boolean => row.kind === "preset" && row.id === "tank-warrior-raid-threat-procs",
          );
        assert(check);
        if (kind === "consent") check.consentExplicit = false;
        else check.browserDps = Number(check.nativeDps) + 10;
      });
      await value.edit("qualified-warrior-tank-model.json", (pointer): void => {
        pointer.browserReviewSha256 = sha(value.documents[name] ?? "");
      });
      await expect(
        readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
      ).rejects.toThrow();
    },
  );
  it("rejects symlinks that escape simulator evidence storage", async (): Promise<void> => {
    const value = await fixture(),
      outside = await mkdtemp(join(tmpdir(), "kfc-warrior-outside-"));
    paths.push(outside);
    const name = value.release + "/kfc-qualified-tank-model.json",
      target = join(outside, "proof.json");
    await writeFile(target, value.documents[name] ?? "");
    await rm(join(value.directory, name));
    await symlink(target, join(value.directory, name));
    await expect(
      readQualifiedWarriorTankSimulatorModelUpdate("tank_warrior", value.directory),
    ).rejects.toThrow(/escaped/);
  });
});
