import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  isEncodedDpsTalents,
  readQualifiedDpsSimulatorModelUpdate,
} from "./forever-simulator-qualified-dps-model";
import { readSimulatorModelUpdate } from "./forever-simulator-model-updates";
import { readSimulatorPresentation } from "./forever-simulator-presentation";
import {
  readSimulatorPresetSafety,
  remapSimulatorPresetHref,
} from "./forever-simulator-preset-safety";
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
type DpsFixtureProfile =
  | "mage"
  | "warlock"
  | "shadow_priest"
  | "smite_priest"
  | "elemental_shaman"
  | "enhancement_shaman"
  | "retribution_paladin";
interface DeliveryCase {
  profile: DpsFixtureProfile;
  label: string;
  buildCount: number;
  defaultBuildId: string;
}
async function fixture(profile: DpsFixtureProfile): Promise<Fixture> {
  const raw = z
    .object({ release: z.string(), documents: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(
        gunzipSync(
          await readFile(
            new URL(`./fixtures/qualified-${profile}-dps-model.v1.json.gz`, import.meta.url),
          ),
        ).toString("utf8"),
      ),
    );
  const directory = await mkdtemp(join(tmpdir(), `kfc-qualified-${profile}-combat-`));
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

const cases: DeliveryCase[] = [
  {
    profile: "retribution_paladin",
    label: "Retribution and Shockadin",
    buildCount: 2,
    defaultBuildId: "paladin-retribution-static",
  },
  { profile: "mage", label: "Mage", buildCount: 3, defaultBuildId: "mage-arcane-static" },
  {
    profile: "warlock",
    label: "Warlock",
    buildCount: 4,
    defaultBuildId: "warlock-demonology-static",
  },
  {
    profile: "shadow_priest",
    label: "Shadow Priest",
    buildCount: 1,
    defaultBuildId: "priest-shadow-static",
  },
  {
    profile: "smite_priest",
    label: "Smite Priest",
    buildCount: 1,
    defaultBuildId: "priest-smite-static",
  },
  {
    profile: "elemental_shaman",
    label: "Elemental and Stormcaller Shaman",
    buildCount: 2,
    defaultBuildId: "shaman-elemental-static",
  },
  {
    profile: "enhancement_shaman",
    label: "Enhancement Shaman",
    buildCount: 1,
    defaultBuildId: "shaman-enhancement-static",
  },
];
it("keeps the original control seed mandatory for standard browser approvals", async (): Promise<void> => {
  const value = await fixture("mage"),
    name = `dps-browser-reviews/${value.release}.json`;
  await value.edit(name, (review): void => {
    assert(Array.isArray(review.checks));
    const row = review.checks.map(record).find((row): boolean => row.kind === "simulation");
    assert(row);
    row.seed = 98127001;
  });
  await value.edit("qualified-dps-models.json", (pointer): void => {
    record(record(pointer.profiles).mage).browserReviewSha256 = sha(value.documents[name] ?? "");
  });
  await expect(readQualifiedDpsSimulatorModelUpdate("mage", value.directory)).rejects.toThrow(
    /control seed changed/,
  );
});
it.each(["seed", "request", "source", "native-pool", "protocol"] as const)(
  "rejects a reapproved Paladin native replay with changed %s evidence",
  async (kind): Promise<void> => {
    const value = await fixture("retribution_paladin"),
      name = `dps-browser-reviews/${value.release}.json`;
    await value.edit(name, (review): void => {
      if (kind === "protocol") {
        review.schema = "kfc-current-combat-menu-browser.v2";
        return;
      }
      if (kind === "native-pool") {
        review.nativePoolCreated = true;
        return;
      }
      if (kind === "source") {
        assert(Array.isArray(review.nativeReplaySources));
        const source = record(review.nativeReplaySources[0]);
        source.sourceJson = String(source.sourceJson) + " ";
        return;
      }
      assert(Array.isArray(review.checks));
      const row = review.checks.map(record).find((row): boolean => row.kind === "simulation");
      assert(row);
      if (kind === "seed") row.seed = 155270001;
      else row.requestSha256 = "f".repeat(64);
    });
    await value.edit("qualified-dps-models.json", (pointer): void => {
      record(record(pointer.profiles).retribution_paladin).browserReviewSha256 = sha(
        value.documents[name] ?? "",
      );
    });
    await expect(
      readQualifiedDpsSimulatorModelUpdate("retribution_paladin", value.directory),
    ).rejects.toThrow();
  },
);
it.each(["", "-", "--", "000--", "6--", "1---1", "1--x", "1 1"])(
  "rejects malformed talent encoding %j",
  (value: string): void => {
    expect(isEncodedDpsTalents(value)).toBe(false);
  },
);
it("keeps Paladin on its existing delivery until its own complete qualified selection exists", async (): Promise<void> => {
  const value = await fixture("mage");
  expect(
    await readQualifiedDpsSimulatorModelUpdate("retribution_paladin", value.directory),
  ).toBeNull();
  await value.edit("qualified-dps-models.json", (pointer): void => {
    record(pointer.profiles).retribution_paladin = { release: value.release };
  });
  await expect(
    readQualifiedDpsSimulatorModelUpdate("retribution_paladin", value.directory),
  ).rejects.toThrow();
});
describe.each(cases)(
  "current $label model delivery",
  ({ profile, buildCount, defaultBuildId }: DeliveryCase): void => {
    const otherProfile: DpsFixtureProfile = profile === "mage" ? "warlock" : "mage";
    it("accepts authentic recorded numerics, presets and all recorded browser checks through the website readers", async (): Promise<void> => {
      const value = await fixture(profile);
      expect(
        (await readQualifiedDpsSimulatorModelUpdate(profile, value.directory))?.manifest.release,
      ).toBe(value.release);
      expect((await readSimulatorModelUpdate(profile, value.directory))?.manifest.release).toBe(
        value.release,
      );
      const presentation = await readSimulatorPresentation(profile, value.directory);
      assert(presentation);
      expect(presentation.manifest.release).toBe(value.release);
      expect(await readSimulatorPresetSafety(presentation, profile, value.directory)).toBe(
        value.release,
      );
      const builds = await readPublishedSimulatorReviews(presentation, profile, value.directory);
      expect(builds).toHaveLength(buildCount);
      expect(builds[0]?.id).toBe(defaultBuildId);
      for (const build of builds) {
        assert(build.href);
        expect(remapSimulatorPresetHref(build.href, profile, value.release, value.release)).toBe(
          build.href,
        );
      }
      expect(
        builds.every(
          (build): boolean =>
            build.validationIterations === 40000 &&
            build.href?.includes(`/forever-sim/${value.release}/`) === true,
        ),
      ).toBe(true);
      expect(builds.filter((build): boolean => build.requiresProvisionalEnchantOptIn)).toHaveLength(
        0,
      );
      expect(
        builds.every((build): boolean => (build.rotationGuidance?.priorities.length ?? 0) >= 5),
      ).toBe(true);
      expect(builds[0]?.rotationGuidance?.caveats.join(" ")).toContain("2%");
    });
    it("leaves other classes and absent selections alone", async (): Promise<void> => {
      expect(await readQualifiedDpsSimulatorModelUpdate("warrior", "/missing-fixture")).toBeNull();
      const value = await fixture(profile);
      await rm(join(value.directory, "qualified-dps-models.json"));
      expect(await readQualifiedDpsSimulatorModelUpdate(profile, value.directory)).toBeNull();
    });
    it("keeps the reviewed profile available when another profile has an unfinished pointer", async (): Promise<void> => {
      const value = await fixture(profile);
      await value.edit("qualified-dps-models.json", (pointer): void => {
        record(pointer.profiles)[otherProfile] = { release: "unfinished" };
      });
      expect(
        (await readQualifiedDpsSimulatorModelUpdate(profile, value.directory))?.manifest.release,
      ).toBe(value.release);
      await expect(
        readQualifiedDpsSimulatorModelUpdate(otherProfile, value.directory),
      ).rejects.toThrow();
    });
    it("rejects numerical asset drift", async (): Promise<void> => {
      const value = await fixture(profile);
      await value.edit(value.release + "/manifest.json", (manifest): void => {
        record(record(manifest.files)["lib.wasm"]).sha256 = "f".repeat(64);
      });
      await expect(readQualifiedDpsSimulatorModelUpdate(profile, value.directory)).rejects.toThrow(
        /combat asset/,
      );
    });
    it("rejects changed presets instead of trusting a still-valid proof", async (): Promise<void> => {
      const value = await fixture(profile);
      await value.edit(value.release + "/kfc-combat-native-builds.json", (payload): void => {
        assert(Array.isArray(payload.builds));
        record(record(record(payload.builds[0]).proto).raidBuffs).trueshotAura = false;
      });
      await expect(readQualifiedDpsSimulatorModelUpdate(profile, value.directory)).rejects.toThrow(
        /checksum/,
      );
    });
    it("rejects duplicate setups even after updating the proof checksum", async (): Promise<void> => {
      const value = await fixture(profile),
        name = value.release + "/kfc-qualified-combat-model.json";
      await value.edit(name, (proof): void => {
        assert(Array.isArray(proof.builds));
        proof.builds[1] = proof.builds[0];
      });
      const digest = sha(value.documents[name] ?? "");
      await value.edit("qualified-dps-models.json", (pointer): void => {
        record(record(pointer.profiles)[profile]).proofSha256 = digest;
      });
      await value.edit(value.release + "/manifest.json", (manifest): void => {
        record(record(manifest.files)["kfc-qualified-combat-model.json"]).sha256 = digest;
      });
      await expect(readQualifiedDpsSimulatorModelUpdate(profile, value.directory)).rejects.toThrow(
        /omitted or duplicated/,
      );
    });
    it("requires every mobile browser check after checksum reapproval", async (): Promise<void> => {
      const value = await fixture(profile),
        name = "dps-browser-reviews/" + value.release + ".json";
      await value.edit(name, (review): void => {
        assert(Array.isArray(review.checks));
        review.checks.pop();
      });
      await value.edit("qualified-dps-models.json", (pointer): void => {
        record(record(pointer.profiles)[profile]).browserReviewSha256 = sha(
          value.documents[name] ?? "",
        );
      });
      await expect(
        readQualifiedDpsSimulatorModelUpdate(profile, value.directory),
      ).rejects.toThrow();
    });
    it.each(["parity", "consent", "deadline"] as const)(
      "rejects reapproved browser evidence with invalid %s",
      async (kind): Promise<void> => {
        const value = await fixture(profile),
          name = "dps-browser-reviews/" + value.release + ".json";
        await value.edit(name, (review): void => {
          if (kind === "deadline") {
            review.completedAt = "2099-01-01T00:00:00.000Z";
            return;
          }
          assert(Array.isArray(review.checks));
          const check = review.checks
            .map(record)
            .find((row): boolean => row.kind === "simulation" && row.id === defaultBuildId);
          assert(check);
          if (kind === "consent") check.consentExplicit = true;
          else check.browserDps = Number(check.nativeDps) + 10;
        });
        await value.edit("qualified-dps-models.json", (pointer): void => {
          record(record(pointer.profiles)[profile]).browserReviewSha256 = sha(
            value.documents[name] ?? "",
          );
        });
        await expect(
          readQualifiedDpsSimulatorModelUpdate(profile, value.directory),
        ).rejects.toThrow();
      },
    );
    it("rejects symlinks that escape simulator evidence storage", async (): Promise<void> => {
      const value = await fixture(profile),
        outside = await mkdtemp(join(tmpdir(), "kfc-warrior-outside-"));
      paths.push(outside);
      const name = value.release + "/kfc-qualified-combat-model.json",
        target = join(outside, "proof.json");
      await writeFile(target, value.documents[name] ?? "");
      await rm(join(value.directory, name));
      await symlink(target, join(value.directory, name));
      await expect(readQualifiedDpsSimulatorModelUpdate(profile, value.directory)).rejects.toThrow(
        /escaped/,
      );
    });
  },
);
