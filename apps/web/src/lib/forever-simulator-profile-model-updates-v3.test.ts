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
const frost = z
    .object({ documents: record })
    .passthrough()
    .parse(fixtureDocument("model-first-pass-frost")),
  fire = z
    .object({ documents: record })
    .passthrough()
    .parse(fixtureDocument("model-first-pass-fire")),
  arcane = z
    .object({ documents: record })
    .passthrough()
    .parse(fixtureDocument("model-first-pass-arcane")),
  raw = fixtureDocument("model-profile-mage-v3"),
  profile = z
    .object({
      schema: z.literal("kfc-mage-cumulative-profile-reader-fixture.v3"),
      pointer: record,
      publication: z.object({ path: z.string(), sha256: z.string() }),
      documents: record,
    })
    .strict()
    .parse(raw),
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
  const target = join(directory, path);
  await mkdir(dirname(target), { recursive: true });
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
  proof: Record<string, unknown>;
  manifest: Record<string, unknown>;
  rewriteBrowser: () => Promise<void>;
  rewriteProof: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-mage-v3-unit-"));
  paths.push(directory);
  const documents = structuredClone({
      ...frost.documents,
      ...fire.documents,
      ...arcane.documents,
      ...profile.documents,
    }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).mage),
    release = z.string().parse(selection.release),
    browserRef = object(selection.browserReview),
    browser = object(documents[z.string().parse(browserRef.path)]),
    proof = object(documents[release + "/kfc-reviewed-presets.json"]),
    manifest = object(documents[release + "/manifest.json"]);
  for (const [path, value] of Object.entries(documents))
    await json(directory, path.replace(/^artifacts\/forever-simulator\//, ""), value);
  await json(directory, "profile-model-updates.json", pointer);
  async function rewriteBrowser(): Promise<void> {
    const sha256 = hash(browser),
      path = `optimization/reviews/profile-model-browser-${sha256.slice(0, 16)}.json`;
    selection.browserReview = { path, sha256 };
    pointer.profiles = { mage: selection };
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
    browser,
    proof,
    manifest,
    rewriteBrowser,
    rewriteProof,
  };
}
describe("cumulative verified Frost+Fire+Arcane Mage delivery", () => {
  // This integration case reads and hashes all three genuine, full-sized study chains.
  it("accepts the actual3build staged release, preserving Frost and keeping unrelated profiles isolated", async (): Promise<void> => {
    expect(hash(raw)).toBe("9b2bb0ee5cfbb3c4790578cffa303b8e235421c8e5db4918cc77032973815c85");
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("mage", value.directory);
    expect(selected?.manifest.release).toBe("a5f95c49c57e46f727b0267a");
    expect(selected?.sourceRelease).toBe("a4eabfa5c89f3813c1b74bde");
    if (!selected) throw new Error("Missing authentic cumulative Mage release");
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
    expect(publication.builds.map((row): string => row.id)).toEqual([
      "mage-frost-static",
      "mage-fire-static",
      "mage-arcane-static",
    ]);
    expect(publication.builds.map((row): number => row.referenceDps)).toEqual([
      572.1653473953593, 650.0665533381781, 659.7836986476648,
    ]);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "mage",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(readSimulatorProfileModelUpdate("warrior", value.directory)).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("feral_druid", value.directory),
    ).resolves.toBeNull();
  }, 15_000);
  it.each(["v1", "v2"])(
    "does not reinterpret legacy %s as approval for three reviewed Mage builds",
    async (version: string): Promise<void> => {
      const value = await fixture();
      value.proof.schema = `kfc-simulator-profile-model-update.${version}`;
      await value.rewriteProof();
      await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow(
        /omitted or added a reviewed Mage spec/,
      );
    },
  );
  it("rejects a duplicate desktop share substituted for the required Arcane mobile share", async (): Promise<void> => {
    const value = await fixture(),
      evidence = object(value.browser.evidence),
      shares = z.array(record).parse(evidence.shares),
      desktop = shares.find(
        (row): boolean => row.id === "mage-arcane-static" && object(row.viewport).width === 1440,
      ),
      mobileIndex = shares.findIndex(
        (row): boolean => row.id === "mage-arcane-static" && object(row.viewport).width === 390,
      );
    if (!desktop || mobileIndex < 0) throw new Error("Missing genuine Arcane viewport evidence");
    shares[mobileIndex] = structuredClone(desktop);
    evidence.shares = shares;
    value.browser.evidence = evidence;
    await value.rewriteBrowser();
    await expect(readSimulatorModelUpdate("mage", value.directory)).rejects.toThrow(
      /desktop\/mobile/,
    );
  });
  it.each(["frost", "fire", "arcane", "duplicate"])(
    "rejects lost or duplicated measured build %s even if metadata is resealed",
    async (variant: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      value.proof.builds =
        variant === "duplicate"
          ? [builds[0], builds[1], builds[1]]
          : builds.filter((row): boolean => row.id !== `mage-${variant}-static`);
      await value.rewriteProof();
      await expect(
        readSimulatorModelUpdate("mage", value.directory).then((): boolean => true),
      ).rejects.toThrow();
    },
  );
  it.each([
    ["mage-frost-static", 1440],
    ["mage-frost-static", 390],
    ["mage-fire-static", 1440],
    ["mage-fire-static", 390],
    ["mage-arcane-static", 1440],
    ["mage-arcane-static", 390],
  ])(
    "requires genuine %s share evidence at%s px",
    async (id: string, width: number): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence);
      evidence.shares = z
        .array(record)
        .parse(evidence.shares)
        .filter((row): boolean => row.id !== id || object(row.viewport).width !== width);
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("mage", value.directory).then((): boolean => true),
      ).rejects.toThrow(/desktop\/mobile/);
    },
  );
  it.each(["missing", "duplicate", "changed", "v1", "v2", "wrong-class"])(
    "rejects %s native/browser coverage",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks);
      if (kind === "missing") evidence.parityChecks = parity.slice(0, 2);
      else if (kind === "duplicate") evidence.parityChecks = [parity[0], parity[1], parity[1]];
      else if (kind === "v1" || kind === "v2")
        value.browser.schema = `kfc-profile-model-browser.${kind}`;
      else if (kind === "wrong-class") {
        const row = parity[2];
        if (!row) throw new Error("Missing actual Arcane parity");
        row.id = "balance-static";
        evidence.parityChecks = parity;
      } else {
        const row = parity[2];
        if (!row) throw new Error("Missing actual Arcane parity");
        row.browserDps = Number(row.nativeDps) + 10;
        evidence.parityChecks = parity;
      }
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("mage", value.directory).then((): boolean => true),
      ).rejects.toThrow();
    },
  );
  it("rejects unmeasured public DPS, changed shares, or a dropped/extra public build", async (): Promise<void> => {
    const value = await fixture(),
      manifest = await readSimulatorManifest(value.directory, "a5f95c49c57e46f727b0267a");
    if (!manifest) throw new Error("Missing authentic cumulative manifest");
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
    for (const builds of [
      [],
      publication.builds.slice(0, 1),
      [...publication.builds, ...publication.builds],
      publication.builds.map((row, index) =>
        index === 2 ? { ...row, referenceDps: row.referenceDps + 1 } : row,
      ),
      publication.builds.map((row, index) =>
        index === 2 ? { ...row, href: row.href + "A" } : row,
      ),
    ])
      await expect(
        validateSimulatorModelUpdateBuilds("mage", manifest, builds, value.directory),
      ).rejects.toThrow();
  });
  it("refuses changed numerical assets under the cumulative presentation", async (): Promise<void> => {
    const value = await fixture(),
      files = object(value.manifest.files);
    files["lib.wasm"] = { ...object(files["lib.wasm"]), sha256: "0".repeat(64) };
    value.manifest.files = files;
    await json(value.directory, "a5f95c49c57e46f727b0267a/manifest.json", value.manifest);
    await expect(
      readSimulatorModelUpdate("mage", value.directory).then((): boolean => true),
    ).rejects.toThrow(/numerical assets/);
  });
});
