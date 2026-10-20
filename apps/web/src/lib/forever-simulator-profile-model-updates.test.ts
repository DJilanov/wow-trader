import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readSimulatorManifest } from "./forever-simulator";
import {
  readSimulatorModelUpdate,
  validateSimulatorModelUpdateBuilds,
} from "./forever-simulator-model-updates";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";

const record = z.record(z.string(), z.unknown());
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function fixtureDocument(name: string): unknown {
  return JSON.parse(
    gunzipSync(readFileSync(new URL(`./fixtures/${name}.json.gz`, import.meta.url)), {
      maxOutputLength: 64_000_000,
    }).toString("utf8"),
  );
}
const evidence = z
  .object({ documents: record })
  .passthrough()
  .parse(fixtureDocument("model-first-pass-frost"));
const rawProfile = fixtureDocument("model-profile-frost");
const profile = z
  .object({
    schema: z.literal("kfc-frost-profile-reader-fixture.v1"),
    pointer: record,
    publication: z.object({ path: z.string(), sha256: z.string() }),
    documents: record,
  })
  .strict()
  .parse(rawProfile);
const paths: string[] = [];
afterEach(async (): Promise<void> => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function json(directory: string, path: string, value: unknown): Promise<void> {
  const target = join(directory, path);
  await mkdir(dirname(target), { recursive: true });
  // The original frozen policy is compact; preserve its byte identity in the fixture too.
  await writeFile(
    target,
    path.endsWith("/kfc-item-weapon-skills.json")
      ? JSON.stringify(value)
      : JSON.stringify(value, null, 2) + "\n",
  );
}
interface Fixture {
  directory: string;
  pointer: Record<string, unknown>;
  selection: Record<string, unknown>;
  documents: Record<string, unknown>;
  browser: Record<string, unknown>;
  rewriteBrowser: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-frost-profile-unit-"));
  paths.push(directory);
  const documents = structuredClone({ ...evidence.documents, ...profile.documents }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).mage),
    browserRef = object(selection.browserReview),
    browser = object(documents[z.string().parse(browserRef.path)]);
  for (const [path, value] of Object.entries(documents))
    await json(directory, path.replace(/^artifacts\/forever-simulator\//, ""), value);
  await json(directory, "profile-model-updates.json", pointer);
  return {
    directory,
    pointer,
    selection,
    documents,
    browser,
    rewriteBrowser: async (): Promise<void> => {
      const sha256 = hash(browser),
        path = `optimization/reviews/profile-model-browser-${sha256.slice(0, 16)}.json`;
      selection.browserReview = { path, sha256 };
      pointer.profiles = { mage: selection };
      await json(directory, path, browser);
      await json(directory, "profile-model-updates.json", pointer);
    },
  };
}
describe("isolated, browser-approved Mage model selection", () => {
  it("accepts the actual staged Mage model and publication without changing another profile", async () => {
    expect(hash(rawProfile)).toBe(
      "525ab86c2e2326fe2b7cec370034d07e3b3ad1591e22ef3da5b6e76df40cbdc1",
    );
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("mage", value.directory);
    expect(selected?.sourceRelease).toBe("a4eabfa5c89f3813c1b74bde");
    expect(selected?.manifest.release).toBe("b2bc9edeae51d6f3b2306182");
    if (!selected) throw new Error("Missing authentic Mage selection");
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
      .parse(value.documents[profile.publication.path]);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "mage",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(readSimulatorProfileModelUpdate("warrior", value.directory)).resolves.toBeNull();
    await expect(readSimulatorProfileModelUpdate("hunter", value.directory)).resolves.toBeNull();
  });
  it("rejects a stale proof, changed numerical asset, or lost reviewed preset", async () => {
    const value = await fixture(),
      release = z.string().parse(value.selection.release),
      candidatePath = release + "/manifest.json",
      candidate = object(value.documents[candidatePath]);
    const files = object(candidate.files),
      wasm = object(files["lib.wasm"]);
    files["lib.wasm"] = { ...wasm, sha256: "0".repeat(64) };
    candidate.files = files;
    await json(value.directory, candidatePath, candidate);
    await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow(
      /numerical assets/,
    );
    await json(value.directory, candidatePath, value.documents[candidatePath]);
    value.selection.proofSha256 = "1".repeat(64);
    value.pointer.profiles = { mage: value.selection };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow();
  });
  it("requires genuine mobile and native/browser evidence even if an approval is rehashed", async () => {
    const value = await fixture(),
      evidence = object(value.browser.evidence);
    evidence.shares = [];
    value.browser.evidence = evidence;
    await value.rewriteBrowser();
    await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow();
    const second = await fixture(),
      evidence2 = object(second.browser.evidence),
      parity = z.array(record).parse(evidence2.parityChecks);
    if (!parity[0]) throw new Error("Missing actual parity");
    parity[0].browserDps = Number(parity[0].nativeDps) + 10;
    evidence2.parityChecks = parity;
    second.browser.evidence = evidence2;
    await second.rewriteBrowser();
    await expect(readSimulatorModelUpdate("mage", second.directory)).rejects.toThrow(/parity/);
  });
  it("rejects an unmeasured public DPS/share and requires the sole Frost build", async () => {
    const value = await fixture(),
      manifest = await readSimulatorManifest(value.directory, "b2bc9edeae51d6f3b2306182");
    if (!manifest) throw new Error("Missing actual candidate");
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
        .parse(value.documents[profile.publication.path]),
      build = publication.builds[0];
    if (!build) throw new Error("Missing authentic build");
    for (const builds of [
      [],
      [{ ...build, referenceDps: build.referenceDps + 1 }],
      [{ ...build, href: build.href + "A" }],
      [build, build],
    ])
      await expect(
        validateSimulatorModelUpdateBuilds("mage", manifest, builds, value.directory),
      ).rejects.toThrow();
  });
  it("contains failures to Mage and rejects pointer traversal", async () => {
    const value = await fixture();
    value.selection.browserReview = { path: "../approval.json", sha256: "f".repeat(64) };
    value.pointer.profiles = { mage: value.selection };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow();
    await expect(readSimulatorProfileModelUpdate("rogue", value.directory)).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("balance_druid", value.directory),
    ).resolves.toBeNull();
  });
});
