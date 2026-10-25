import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  readSimulatorModelUpdate,
  validateSimulatorModelUpdateBuilds,
} from "./forever-simulator-model-updates";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";
import { readPublishedSimulatorReviews } from "./forever-simulator-published-reviews";
import { validateFullRaidHunterPublishedRows } from "./forever-simulator-full-raid-hunter-profile";

const record = z.record(z.string(), z.unknown());
const source = z
  .object({
    schema: z.literal("kfc-hunter-full-raid-profile-fixture.v1"),
    profilePointer: record,
    publication: z.object({ path: z.string(), sha256: z.string() }).strict(),
    documents: record,
  })
  .strict()
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL("./fixtures/model-profile-hunter-full-raid-v1.json.gz", import.meta.url),
        ),
        { maxOutputLength: 16_000_000 },
      ).toString("utf8"),
    ),
  );
const paths: string[] = [];
const release = "29d2a2c67bc4922af0cef622";
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function json(directory: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(
    join(directory, path),
    JSON.stringify(value, null, path.endsWith("/kfc-item-weapon-skills.json") ? undefined : 2) +
      (path.endsWith("/kfc-item-weapon-skills.json") ? "" : "\n"),
  );
}
interface Fixture {
  readonly directory: string;
  readonly documents: Record<string, unknown>;
  readonly pointer: Record<string, unknown>;
  readonly selection: Record<string, unknown>;
  readonly browser: Record<string, unknown>;
  readonly rewriteBrowser: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-hunter-full-raid-profile-"));
  paths.push(directory);
  const documents = structuredClone(source.documents),
    pointer = structuredClone(source.profilePointer),
    selection = object(object(pointer.profiles).hunter),
    browserReference = object(selection.browserReview),
    browser = object(documents[z.string().parse(browserReference.path)]);
  await Promise.all(
    Object.entries(documents).map(async ([path, value]): Promise<void> =>
      json(directory, path, value),
    ),
  );
  await json(directory, "profile-model-updates.json", pointer);
  await json(directory, "published-reviews.json", {
    schema: "kfc-published-simulator-reviews.v1",
    profiles: { hunter: source.publication },
  });
  return {
    directory,
    documents,
    pointer,
    selection,
    browser,
    rewriteBrowser: async (): Promise<void> => {
      const sha256 = hash(browser),
        path = `optimization/reviews/hunter-full-raid-browser-${sha256.slice(0, 16)}.json`;
      selection.browserReview = { path, sha256 };
      pointer.profiles = { hunter: selection };
      await json(directory, path, browser);
      await json(directory, "profile-model-updates.json", pointer);
    },
  };
}
afterEach(async (): Promise<void> => {
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("qualified full-raid Hunter profile and library", (): void => {
  it("reads the real compiled candidate and all three frozen publications through the application wrappers", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("hunter", value.directory);
    expect(selected?.manifest.release).toBe(release);
    expect(selected?.sourceRelease).toBe("50df0df3d3d0124bb3b14791");
    if (!selected) throw new Error("Missing actual Hunter selection");
    const builds = await readPublishedSimulatorReviews(
      { ...selected, kind: "reviewed-presets" },
      "hunter",
      value.directory,
    );
    expect(builds.map((build): string => build.id)).toEqual([
      "hunter-beast-mastery-static",
      "hunter-marksmanship-static",
      "hunter-survival-static",
    ]);
    expect(builds.map((build): number | null => build.referenceDps)).toEqual([
      918.9706067376396, 922.3686672986331, 883.4312431205306,
    ]);
    expect(builds[0]?.rotationGuidance?.talents).toBe("31/20/0");
    expect(builds[0]?.rotationGuidance?.prepull).toEqual([
      "Use Aspect of the Hawk 10 seconds before the pull.",
    ]);
    expect(builds.every((build): boolean => !build.requiresProvisionalEnchantOptIn)).toBe(true);
  });
  it("keeps invalid Hunter selection isolated from other class pointers", async (): Promise<void> => {
    const value = await fixture();
    value.selection.release = "f".repeat(24);
    value.pointer.profiles = { hunter: value.selection };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(readSimulatorProfileModelUpdate("hunter", value.directory)).rejects.toThrow();
    await expect(readSimulatorProfileModelUpdate("mage", value.directory)).resolves.toBeNull();
    await expect(readSimulatorProfileModelUpdate("rogue", value.directory)).resolves.toBeNull();
  });
  it("rejects changed numerical assets even when a candidate manifest remains schema-valid", async (): Promise<void> => {
    const value = await fixture(),
      manifest = object(value.documents[release + "/manifest.json"]),
      files = object(manifest.files);
    files["lib.wasm"] = { ...object(files["lib.wasm"]), sha256: "1".repeat(64) };
    manifest.files = files;
    await json(value.directory, release + "/manifest.json", manifest);
    await expect(readSimulatorModelUpdate("hunter", value.directory)).rejects.toThrow(
      /numerical assets changed/,
    );
  });
  it("requires the exact recorded UI, current-host and saved-character evidence despite a rehashed approval", async (): Promise<void> => {
    for (const field of ["uiControls", "hostReview", "savedCharacterReview"]) {
      const value = await fixture();
      value.browser[field] = { ...object(value.browser[field]), sha256: "0".repeat(64) };
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("hunter", value.directory)).rejects.toThrow();
    }
  });
  it("rejects late qualification and any invented debuff-overflow approval", async (): Promise<void> => {
    for (const change of [
      (browser: Record<string, unknown>): void => {
        browser.capturedAt = "2026-10-25T05:03:16.065Z";
      },
      (browser: Record<string, unknown>): void => {
        browser.bossDebuffOverflowQualified = true;
      },
      (browser: Record<string, unknown>): void => {
        browser.checked = { ...object(browser.checked), currentHostCompletionBridge: false };
      },
    ]) {
      const value = await fixture();
      change(value.browser);
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("hunter", value.directory)).rejects.toThrow();
    }
  });
  it("does not allow measured DPS to conceal changed guidance, missing builds or a changed share", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("hunter", value.directory);
    if (!selected) throw new Error("Missing actual Hunter selection");
    const publication = z
      .object({
        builds: z.array(
          z
            .object({
              id: z.string(),
              href: z.string(),
              referenceDps: z.number(),
              validationIterations: z.number(),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(value.documents[source.publication.path]);
    const first = publication.builds[0];
    if (!first) throw new Error("Missing actual Beast Mastery build");
    for (const builds of [
      publication.builds.slice(1),
      [...publication.builds, first],
      [{ ...first, referenceDps: first.referenceDps + 1 }, ...publication.builds.slice(1)],
      [{ ...first, href: first.href + "A" }, ...publication.builds.slice(1)],
    ])
      await expect(
        validateSimulatorModelUpdateBuilds("hunter", selected.manifest, builds, value.directory),
      ).rejects.toThrow();
    await expect(
      validateSimulatorModelUpdateBuilds(
        "hunter",
        selected.manifest,
        publication.builds.map(({ id, href, referenceDps, validationIterations }) => ({
          id,
          href,
          referenceDps,
          validationIterations,
        })),
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(
      validateFullRaidHunterPublishedRows(
        selected.manifest,
        [
          { ...first, rotationGuidance: { ...object(first.rotationGuidance), prepull: [] } },
          ...publication.builds.slice(1),
        ],
        value.directory,
      ),
    ).rejects.toThrow(/guidance/);
  });
  it("rejects evidence traversal and changed raw qualified build bytes", async (): Promise<void> => {
    const value = await fixture();
    value.selection.browserReview = { path: "../approval.json", sha256: "0".repeat(64) };
    value.pointer.profiles = { hunter: value.selection };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(readSimulatorModelUpdate("hunter", value.directory)).rejects.toThrow();
    const second = await fixture(),
      path = Object.keys(second.documents).find((path): boolean =>
        /\/build-beast_mastery-/.test(path),
      );
    if (!path) throw new Error("Missing raw qualified Beast Mastery build");
    await writeFile(join(second.directory, path), JSON.stringify(second.documents[path]));
    await expect(readSimulatorModelUpdate("hunter", second.directory)).rejects.toThrow(
      /bytes changed/,
    );
  });
});

describe("Hunter release compatibility", (): void => {
  it("preserves the previously reviewed Hunter model and library when the new release is not selected", async (): Promise<void> => {
    const legacy = z
        .object({
          pointer: record,
          publication: z.object({ path: z.string(), sha256: z.string() }),
          documents: record,
        })
        .passthrough()
        .parse(
          JSON.parse(
            gunzipSync(
              readFileSync(
                new URL("./fixtures/model-profile-hunter-raid-v1.json.gz", import.meta.url),
              ),
            ).toString("utf8"),
          ),
        ),
      directory = await mkdtemp(join(tmpdir(), "kfc-hunter-legacy-fallback-"));
    paths.push(directory);
    await Promise.all(
      Object.entries(legacy.documents).map(async ([path, value]): Promise<void> =>
        json(directory, path, value),
      ),
    );
    const legacyEvidence = z
      .object({ documents: record })
      .passthrough()
      .parse(
        JSON.parse(
          gunzipSync(
            readFileSync(new URL("./fixtures/hunter-raid-delivery.json.gz", import.meta.url)),
          ).toString("utf8"),
        ),
      );
    await Promise.all(
      Object.entries(legacyEvidence.documents).map(async ([path, value]): Promise<void> =>
        json(directory, path.replace(/^artifacts\/forever-simulator\//, ""), value),
      ),
    );
    await json(directory, "profile-model-updates.json", legacy.pointer);
    await json(directory, "published-reviews.json", {
      schema: "kfc-published-simulator-reviews.v1",
      profiles: { hunter: legacy.publication },
    });
    const selected = await readSimulatorModelUpdate("hunter", directory);
    expect(selected?.manifest.release).toBe("c98e5e028954b29c1ee0354e");
    if (!selected) throw new Error("Missing legacy Hunter selection");
    const builds = await readPublishedSimulatorReviews(
      { ...selected, kind: "reviewed-presets" },
      "hunter",
      directory,
    );
    expect(builds).toHaveLength(3);
  });
});
