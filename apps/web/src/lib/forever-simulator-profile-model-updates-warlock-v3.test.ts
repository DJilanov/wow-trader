import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";
import { validateSimulatorModelUpdateBuilds } from "./forever-simulator-model-updates";

const record = z.record(z.string(), z.unknown());
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function document(name: string): Record<string, unknown> {
  return object(
    JSON.parse(
      gunzipSync(readFileSync(new URL(`./fixtures/${name}.json.gz`, import.meta.url)), {
        maxOutputLength: 64_000_000,
      }).toString("utf8"),
    ),
  );
}
const profile = z
    .object({
      schema: z.literal("kfc-warlock-three-spec-profile-reader-fixture.v1"),
      pointer: record,
      publication: z.object({ path: z.string(), sha256: z.string() }),
      documents: record,
    })
    .strict()
    .parse(document("model-profile-warlock-v3")),
  sourceDocuments = Object.assign(
    {},
    ...[
      "model-first-pass-demonology",
      "model-first-pass-affliction",
      "model-first-pass-ds-ruin",
      "model-warlock-compatibility",
    ].map((name): Record<string, unknown> => object(document(name).documents)),
    profile.documents,
  ),
  paths: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    paths.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function json(directory: string, path: string, value: unknown): Promise<void> {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes(".."))
    throw new Error("Invalid real fixture path");
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(
    join(directory, path),
    path.endsWith("/kfc-item-weapon-skills.json")
      ? JSON.stringify(value)
      : JSON.stringify(value, null, 2) + "\n",
  );
}
interface Fixture {
  readonly directory: string;
  readonly pointer: Record<string, unknown>;
  readonly selection: Record<string, unknown>;
  readonly documents: Record<string, unknown>;
  readonly proof: Record<string, unknown>;
  readonly browser: Record<string, unknown>;
  readonly manifest: Record<string, unknown>;
  readonly rewriteProof: () => Promise<void>;
  readonly rewriteBrowser: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-warlock-v3-profile-unit-"));
  paths.push(directory);
  const documents = structuredClone(sourceDocuments),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).warlock),
    release = z.string().parse(selection.release),
    browserRef = object(selection.browserReview),
    proof = object(documents[release + "/kfc-reviewed-presets.json"]),
    browser = object(documents[z.string().parse(browserRef.path)]),
    manifest = object(documents[release + "/manifest.json"]);
  for (const [path, value] of Object.entries(documents))
    await json(directory, path.replace(/^artifacts\/forever-simulator\//, ""), value);
  await json(directory, "profile-model-updates.json", pointer);
  async function rewriteBrowser(): Promise<void> {
    const sha256 = hash(browser),
      path = `optimization/reviews/profile-model-browser-${sha256.slice(0, 16)}.json`;
    selection.browserReview = { path, sha256 };
    pointer.profiles = { warlock: selection };
    await json(directory, path, browser);
    await json(directory, "profile-model-updates.json", pointer);
  }
  async function rewriteProof(): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(proof, null, 2) + "\n"),
      sha256 = createHash("sha256").update(bytes).digest("hex"),
      files = object(manifest.files);
    files["kfc-reviewed-presets.json"] = { bytes: bytes.length, sha256 };
    manifest.files = files;
    selection.proofSha256 = sha256;
    browser.proofSha256 = sha256;
    await json(directory, release + "/kfc-reviewed-presets.json", proof);
    await json(directory, release + "/manifest.json", manifest);
    await rewriteBrowser();
  }
  return {
    directory,
    pointer,
    selection,
    documents,
    proof,
    browser,
    manifest,
    rewriteProof,
    rewriteBrowser,
  };
}

describe("actual source-aware three-spec Warlock presentation", (): void => {
  it("accepts genuine staged browser evidence, keeping historical scores/source models alongside newly qualified DS/Ruin", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorProfileModelUpdate("warlock", value.directory);
    expect(selected?.manifest.release).toBe(value.selection.release);
    expect(selected?.sourceRelease).toBe("e945e98f232cc81948ee9060");
    if (!selected) throw new Error("Missing actual Warlock v3 presentation");
    const publication = object(value.documents[profile.publication.path]),
      builds = z
        .array(
          z
            .object({
              id: z.string(),
              href: z.string(),
              referenceDps: z.number(),
              validationIterations: z.number(),
            })
            .passthrough(),
        )
        .parse(publication.builds);
    expect(builds.map((build): string => build.id)).toEqual([
      "warlock-demonology-static",
      "warlock-affliction-static",
      "warlock-ds-ruin-static",
    ]);
    expect(builds.map((build): number => build.referenceDps)).toEqual([
      830.2573884583082, 747.6164254231074, 712.37549486789,
    ]);
    await expect(
      validateSimulatorModelUpdateBuilds("warlock", selected.manifest, builds, value.directory),
    ).resolves.toBeUndefined();
  });

  it.each([
    "omit-ds",
    "reorder",
    "wrong-legacy-source",
    "wrong-compatibility",
    "relabel-historical-score",
  ] as const)("rejects correctly resealed %s evidence", async (kind): Promise<void> => {
    const value = await fixture(),
      builds = z.array(record).parse(value.proof.builds);
    if (kind === "omit-ds") value.proof.builds = builds.slice(0, 2);
    else if (kind === "reorder") value.proof.builds = [builds[2], builds[1], builds[0]];
    else if (kind === "relabel-historical-score")
      value.proof.builds = builds.map((build, index): Record<string, unknown> =>
        index === 0 ? { ...build, referenceDps: 9999 } : build,
      );
    else {
      const preserved = object(value.proof.preservedSource);
      if (kind === "wrong-legacy-source") preserved.sourceRelease = "e945e98f232cc81948ee9060";
      else preserved.compatibility = { ...object(preserved.compatibility), sha256: "0".repeat(64) };
      value.proof.preservedSource = preserved;
    }
    await value.rewriteProof();
    await expect(readSimulatorProfileModelUpdate("warlock", value.directory)).rejects.toThrow();
  });

  it.each([
    "missing-ds-mobile",
    "altered-ds-parity",
    "missing-privacy",
    "unchecked-compatibility",
  ] as const)("rejects a resealed browser claim with %s", async (kind): Promise<void> => {
    const value = await fixture(),
      evidence = object(value.browser.evidence);
    if (kind === "unchecked-compatibility")
      value.browser.checked = {
        ...object(value.browser.checked),
        preservedModelCompatibility: false,
      };
    else if (kind === "missing-privacy")
      evidence.completionBridgeReview = {
        ...object(evidence.completionBridgeReview),
        privacyChecks: [],
      };
    else if (kind === "missing-ds-mobile")
      evidence.shares = z
        .array(record)
        .parse(evidence.shares)
        .filter(
          (share): boolean =>
            share.id !== "warlock-ds-ruin-static" || object(share.viewport).width !== 390,
        );
    else
      evidence.parityChecks = z
        .array(record)
        .parse(evidence.parityChecks)
        .map((row): Record<string, unknown> =>
          row.id === "warlock-ds-ruin-static" ? { ...row, browserDps: 9999 } : row,
        );
    value.browser.evidence = evidence;
    await value.rewriteBrowser();
    await expect(readSimulatorProfileModelUpdate("warlock", value.directory)).rejects.toThrow();
  });
});
