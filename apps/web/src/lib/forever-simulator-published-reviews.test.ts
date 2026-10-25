import { createHash } from "node:crypto";
import console from "node:console";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import type { LocalSimulatorBuildReview } from "./forever-simulator-local-reviews";
import type { SimulatorPresentation } from "./forever-simulator-presentation";
import {
  createPublishedSimulatorProfile,
  readPublishedSimulatorReviews,
} from "./forever-simulator-published-reviews";

const directories: string[] = [];
const source = "a".repeat(24);
const release = "b".repeat(24);
const proof = "c".repeat(64);
const presentation: SimulatorPresentation = {
  kind: "reviewed-presets",
  sourceRelease: source,
  manifest: {
    schema: "kfc-forever-simulator.v1",
    release,
    revision: SIMULATOR_REVISION,
    upstream: "https://github.com/gunba/wow-forever-sim",
    preparedAt: "2026-10-18T00:00:00Z",
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    itemCount: 1,
    excludedModeledItems: 0,
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
    files: { "kfc-reviewed-presets.json": { bytes: 1, sha256: proof } },
  },
};
const reviewed: LocalSimulatorBuildReview = {
  id: "two-hand-fury-static",
  spec: "warrior/fury",
  faction: "Alliance",
  scenario: "standard",
  stage: "calculations reviewed",
  status: "reviewed",
  href: `/forever-sim/${release}/warrior/#${"A".repeat(128)}`,
  referenceDps: 123,
  requiresProvisionalEnchantOptIn: false,
  warnings: ["Synthetic unit fixture, not a recommendation."],
  displayName: "Synthetic unit fixture",
  validationIterations: 200_000,
};
const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

async function fixture(value: unknown): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "published-simulator-test-"));
  directories.push(directory);
  const digest = hash(value);
  const path = `published-reviews/warrior-${digest.slice(0, 16)}.json`;
  await json(join(directory, path), value);
  await json(join(directory, "published-reviews.json"), {
    schema: "kfc-published-simulator-reviews.v1",
    profiles: { warrior: { path, sha256: digest } },
  });
  return { directory, path };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("production reviewed simulator builds", () => {
  it("serves explicitly published reviewed builds and their real precision", async () => {
    const value = createPublishedSimulatorProfile(presentation, "warrior", [reviewed]);
    const { directory } = await fixture(value);
    expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([
      reviewed,
    ]);
    expect(await readPublishedSimulatorReviews(presentation, "rogue", directory)).toEqual([]);
  });

  it("omits an absent display name instead of materializing undefined", async () => {
    const { displayName, ...unnamed } = reviewed;
    expect(displayName).toBe("Synthetic unit fixture");
    const value = createPublishedSimulatorProfile(presentation, "warrior", [unnamed]);
    const { directory } = await fixture(value);
    const [result] = await readPublishedSimulatorReviews(presentation, "warrior", directory);

    expect(result).toEqual(unnamed);
    expect(Object.hasOwn(result ?? {}, "displayName")).toBe(false);
    expect(Object.hasOwn(result ?? {}, "rotationGuidance")).toBe(false);
  });

  it("preserves optional rotation instructions, priorities and caveats through production publication", async () => {
    const guided: LocalSimulatorBuildReview = {
      ...reviewed,
      rotationGuidance: {
        talents: "31/20/0",
        scenario: "Synthetic unit-only single-target scenario.",
        instruction: "Synthetic unit-only priority introduction.",
        prepull: ["Synthetic unit-only pre-pull action."],
        priorities: ["Synthetic first priority.", "Synthetic second priority."],
        caveats: ["Transport fixture only, never a simulated recommendation."],
      },
    };
    const value = createPublishedSimulatorProfile(presentation, "warrior", [guided]);
    const { directory } = await fixture(value);
    expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([
      guided,
    ]);
  });

  it("rejects empty priorities and unreviewed extra guide fields", () => {
    const guide = {
      talents: "31/20/0",
      scenario: "Synthetic unit-only scenario.",
      priorities: ["Synthetic priority."],
      caveats: [],
    };
    for (const rotationGuidance of [
      { ...guide, priorities: [] },
      { ...guide, instruction: "" },
      { ...guide, prepull: [""] },
      { ...guide, unreviewed: true },
    ]) {
      expect(() =>
        createPublishedSimulatorProfile(presentation, "warrior", [
          { ...reviewed, rotationGuidance },
        ]),
      ).toThrow();
    }
  });

  it("keeps legacy guidance without adding an undefined introduction", async () => {
    const guided: LocalSimulatorBuildReview = {
      ...reviewed,
      rotationGuidance: {
        talents: "31/20/0",
        scenario: "Synthetic unit-only scenario.",
        priorities: ["Synthetic priority."],
        caveats: [],
      },
    };
    const value = createPublishedSimulatorProfile(presentation, "warrior", [guided]);
    const { directory } = await fixture(value);
    const [result] = await readPublishedSimulatorReviews(presentation, "warrior", directory);
    expect(result).toEqual(guided);
    expect(Object.hasOwn(result?.rotationGuidance ?? {}, "instruction")).toBe(false);
  });

  it("does not enable research when no publication or approved presentation exists", async () => {
    const { directory } = await fixture({});
    await rm(join(directory, "published-reviews.json"));
    expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([]);
    expect(
      await readPublishedSimulatorReviews({ ...presentation, kind: "base" }, "warrior", directory),
    ).toEqual([]);
    expect(() =>
      createPublishedSimulatorProfile({ ...presentation, kind: "base" }, "warrior", [reviewed]),
    ).toThrow(/browser-approved/);
  });

  it("rejects unfinished, foreign-profile and duplicate builds", () => {
    for (const entry of [
      { ...reviewed, status: "preview" as const },
      { ...reviewed, spec: "rogue/combat" },
      { ...reviewed, referenceDps: null },
    ])
      expect(() => createPublishedSimulatorProfile(presentation, "warrior", [entry])).toThrow();
    expect(() =>
      createPublishedSimulatorProfile(presentation, "warrior", [reviewed, reviewed]),
    ).toThrow(/Duplicate/);
  });

  it("rejects foreign, external and malformed share URLs", () => {
    for (const href of [
      reviewed.href!.replace(release, source),
      `https://other.invalid${reviewed.href}`,
      `//other.invalid${reviewed.href}`,
      reviewed.href!.replace("#", "?test=1#"),
      reviewed.href!.replace(/#.*/, "#bad"),
      reviewed.href!.replace("/warrior/", "/rogue/"),
    ])
      expect(() =>
        createPublishedSimulatorProfile(presentation, "warrior", [{ ...reviewed, href }]),
      ).toThrow();
  });

  it("retains explicit proc consent and rejects mismatched consent policies", () => {
    const provisional = {
      ...reviewed,
      scenario: "provisional-procs",
      requiresProvisionalEnchantOptIn: true,
    };
    expect(
      createPublishedSimulatorProfile(presentation, "warrior", [provisional]).builds[0]
        ?.requiresProvisionalEnchantOptIn,
    ).toBe(true);
    expect(() =>
      createPublishedSimulatorProfile(presentation, "warrior", [
        { ...provisional, requiresProvisionalEnchantOptIn: false },
      ]),
    ).toThrow(/consent/);
  });

  it("fails closed for changed source, UI or proof approval", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = createPublishedSimulatorProfile(presentation, "warrior", [reviewed]);
    for (const field of [
      "sourceRelease",
      "presentationRelease",
      "presentationProofSha256",
    ] as const) {
      const { directory } = await fixture({ ...value, [field]: "d".repeat(value[field].length) });
      expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([]);
    }
  });

  it("rejects checksum changes and paths escaping the publication root", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = createPublishedSimulatorProfile(presentation, "warrior", [reviewed]);
    const { directory, path } = await fixture(value);
    await json(join(directory, path), { ...value, builds: [] });
    expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([]);
    const outside = await fixture(value);
    await rm(join(directory, path));
    await symlink(join(outside.directory, outside.path), join(directory, path));
    expect(await readPublishedSimulatorReviews(presentation, "warrior", directory)).toEqual([]);
  });
});
