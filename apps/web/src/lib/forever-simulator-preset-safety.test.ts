import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SIMULATOR_REVISION,
  SIMULATOR_SPECS,
  type SimulatorManifest,
} from "@wow-trader/forever-data/simulator";
import {
  readSimulatorPresetSafety,
  remapSimulatorPresetHref,
} from "./forever-simulator-preset-safety";
import type { SimulatorPresentation } from "./forever-simulator-presentation";

const paths: string[] = [];
afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
const sourceRelease = "a".repeat(24),
  parent = "b".repeat(24),
  release = "c".repeat(24);
const parents = { warrior: parent, rogue: parent, hunter: parent };
async function json(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}
async function fixture(): Promise<{
  directory: string;
  presentation: SimulatorPresentation;
  source: SimulatorManifest;
  candidate: SimulatorManifest;
  report: Record<string, unknown>;
  review: Record<string, unknown>;
  pointer: Record<string, unknown>;
  rewrite: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "preset-safety-unit-"));
  paths.push(directory);
  const model = { bytes: 8, sha256: digest("fixture!") };
  const source: SimulatorManifest = {
    schema: "kfc-forever-simulator.v1",
    release: sourceRelease,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-19T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    files: { "lib.wasm": model, "sim_worker.js": model, "assets/database/db.json": model },
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  };
  const candidate: SimulatorManifest = { ...source, release, files: { ...source.files } };
  const presentation: SimulatorPresentation = {
    manifest: { ...source, release: parent },
    sourceRelease,
    kind: "reviewed-presets",
  };
  const report: Record<string, unknown> = {
    schema: "kfc-simulator-preset-safety.v1",
    release,
    sourceRelease,
    parents,
    typecheckDiagnostics: 0,
    modelAssets: source.files,
    repairs: Array.from({ length: 28 }, (_, i) => ({
      profile: "synthetic-unit-only",
      variant: String(i),
    })),
  };
  const review: Record<string, unknown> = {
    schema: "kfc-preset-safety-browser.v1",
    status: "passed",
    release,
    reportSha256: "",
    checked: {
      allPresets: true,
      reviewedShares: true,
      firstVisitDefault: true,
      savedCharacterPreserved: true,
      modelAssetsUnchanged: true,
      desktopMobile: true,
    },
    errors: [],
  };
  const pointer: Record<string, unknown> = {
    schema: "kfc-simulator-preset-safety-selection.v1",
    sourceRelease,
    release,
    parents,
    reportSha256: "",
    browserReview: { path: "optimization/reviews/synthetic-unit-browser.json", sha256: "" },
  };
  const rewrite = async (): Promise<void> => {
    const reportSha = digest(JSON.stringify(report));
    candidate.files["kfc-preset-safety.json"] = {
      bytes: Buffer.byteLength(JSON.stringify(report)),
      sha256: reportSha,
    };
    review.reportSha256 = reportSha;
    pointer.reportSha256 = reportSha;
    pointer.browserReview = {
      path: "optimization/reviews/synthetic-unit-browser.json",
      sha256: digest(JSON.stringify(review)),
    };
    await json(join(directory, `${sourceRelease}/manifest.json`), source);
    await json(join(directory, `${release}/manifest.json`), candidate);
    await json(join(directory, `${release}/kfc-preset-safety.json`), report);
    await json(join(directory, "optimization/reviews/synthetic-unit-browser.json"), review);
    await json(join(directory, "preset-safety.json"), pointer);
  };
  await rewrite();
  return { directory, presentation, source, candidate, report, review, pointer, rewrite };
}

describe("Pre-raid preset safety selection", () => {
  it("selects only a model-identical, all-preset browser-approved UI", async () => {
    const f = await fixture();
    expect(await readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).toBe(release);
    expect(
      await readSimulatorPresetSafety(
        { ...f.presentation, kind: "base", manifest: f.source },
        "mage",
        f.directory,
      ),
    ).toBe(release);
  });
  it("does not require an overlay before one is deployed", async () => {
    const f = await fixture();
    await rm(join(f.directory, "preset-safety.json"));
    expect(await readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).toBeNull();
  });
  it("blocks unsafe fallback after a numerical update until presets are reviewed", async () => {
    const f = await fixture();
    await expect(
      readSimulatorPresetSafety(
        { ...f.presentation, sourceRelease: "d".repeat(24) },
        "rogue",
        f.directory,
      ),
    ).rejects.toThrow(/new numerical source/);
  });
  it("rejects stale parent approvals, partial preset coverage and failed browser checks", async () => {
    const f = await fixture();
    await expect(
      readSimulatorPresetSafety({ ...f.presentation, manifest: f.source }, "rogue", f.directory),
    ).rejects.toThrow(/parent/);
    f.report.repairs = [];
    await f.rewrite();
    await expect(readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).rejects.toThrow();
    f.report.repairs = Array.from({ length: 28 }, () => ({ profile: "unit", variant: "unit" }));
    f.review.errors = ["fixture failure"];
    await f.rewrite();
    await expect(readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).rejects.toThrow();
  });
  it("rejects changed WASM/database metadata even with an otherwise valid report", async () => {
    const f = await fixture();
    f.candidate.files["lib.wasm"] = { bytes: 9, sha256: digest("different") };
    await f.rewrite();
    await expect(readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).rejects.toThrow(
      /numerical/,
    );
  });
  it("rejects tampered reports and browser evidence path traversal", async () => {
    const f = await fixture();
    await json(join(f.directory, `${release}/kfc-preset-safety.json`), {
      ...f.report,
      typecheckDiagnostics: 1,
    });
    await expect(readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).rejects.toThrow(
      /checksum/,
    );
    await f.rewrite();
    f.pointer.browserReview = { path: "../missing.json", sha256: digest("x") };
    await json(join(f.directory, "preset-safety.json"), f.pointer);
    await expect(readSimulatorPresetSafety(f.presentation, "rogue", f.directory)).rejects.toThrow();
  });
  it("remaps the presentation URL only, preserving the exact measured share", () => {
    expect(
      remapSimulatorPresetHref(`/forever-sim/${parent}/rogue/#abc%2Bdef`, "rogue", parent, release),
    ).toBe(`/forever-sim/${release}/rogue/#abc%2Bdef`);
    for (const href of [
      `https://other.invalid/forever-sim/${parent}/rogue/`,
      `//other.invalid/`,
      `/forever-sim/${parent}/warrior/`,
      `/forever-sim/${parent}/rogue/?run=1`,
    ])
      expect(() => remapSimulatorPresetHref(href, "rogue", parent, release)).toThrow();
  });
  it("preserves reviewed full-settings imports for supported damage and tank profiles", (): void => {
    for (const profile of [
      "warrior",
      "mage",
      "warlock",
      "shadow_priest",
      "smite_priest",
      "elemental_shaman",
      "enhancement_shaman",
      "retribution_paladin",
      "tank_warrior",
      "feral_tank_druid",
      "protection_paladin",
    ]) {
      expect(
        remapSimulatorPresetHref(
          `/forever-sim/${parent}/${profile}/?i=gtrcmxeu#abc`,
          profile,
          parent,
          release,
        ),
      ).toBe(`/forever-sim/${release}/${profile}/?i=gtrcmxeu#abc`);
      expect(() =>
        remapSimulatorPresetHref(
          `/forever-sim/${parent}/${profile}/?i=gtrcmxeu&run=1#abc`,
          profile,
          parent,
          release,
        ),
      ).toThrow();
    }
    expect(() =>
      remapSimulatorPresetHref(
        `/forever-sim/${parent}/rogue/?i=gtrcmxeu#abc`,
        "rogue",
        parent,
        release,
      ),
    ).toThrow();
  });
});
