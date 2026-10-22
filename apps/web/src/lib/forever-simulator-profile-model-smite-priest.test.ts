import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  readSimulatorModelUpdate,
  validateSimulatorModelUpdateBuilds,
} from "./forever-simulator-model-updates";
import { readSimulatorProfileModelUpdate } from "./forever-simulator-profile-model-updates";

const record = z.record(z.string(), z.unknown());
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function document(name: string): unknown {
  return JSON.parse(
    gunzipSync(readFileSync(new URL(`./fixtures/${name}.json.gz`, import.meta.url)), {
      maxOutputLength: 64_000_000,
    }).toString("utf8"),
  );
}
const delivery = z
    .object({ documents: record })
    .passthrough()
    .parse(document("model-first-pass-smite-priest")),
  profile = z
    .object({
      schema: z.literal("kfc-smite-priest-profile-reader-fixture.v1"),
      pointer: record,
      publication: z.object({ path: z.string(), sha256: z.string() }),
      documents: record,
    })
    .strict()
    .parse(document("model-profile-smite-priest")),
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
  if (isAbsolute(path) || path.split("/").includes("..") || path.includes("\\"))
    throw new Error("Invalid fixture path");
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
  rewriteBrowser: () => Promise<void>;
  rewriteProof: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-smite-priest-profile-unit-"));
  paths.push(directory);
  const documents = structuredClone({ ...delivery.documents, ...profile.documents }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).smite_priest),
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
    pointer.profiles = { smite_priest: selection };
    await json(directory, path, browser);
    await json(directory, "profile-model-updates.json", pointer);
  }
  async function rewriteProof(): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(proof, null, 2) + "\n"),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    manifest.files = {
      ...object(manifest.files),
      "kfc-reviewed-presets.json": { bytes: bytes.length, sha256 },
    };
    selection.proofSha256 = sha256;
    browser.proofSha256 = sha256;
    await json(directory, release + "/kfc-reviewed-presets.json", proof);
    await json(directory, release + "/manifest.json", manifest);
    await rewriteBrowser();
  }
  return { directory, pointer, selection, documents, browser, proof, rewriteBrowser, rewriteProof };
}

describe("isolated qualified Smite Priest profile delivery", () => {
  it("reads the actual compiled/browser-reviewed Smite release, 40k result and complete source chain", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("smite_priest", value.directory);
    expect(selected?.manifest.release).toBe("02dba4297e92d284c017c0bd");
    expect(selected?.sourceRelease).toBe("bbbde15964092df1ecbf1dec");
    if (!selected) throw new Error("Missing authentic Smite profile");
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
    expect(publication.builds.map((entry): string => entry.id)).toEqual(["priest-smite-static"]);
    expect(publication.builds[0]?.referenceDps).toBe(520.3905540963231);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "smite_priest",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(
      readSimulatorProfileModelUpdate("shadow_priest", value.directory),
    ).resolves.toBeNull();
    await expect(readSimulatorProfileModelUpdate("warlock", value.directory)).resolves.toBeNull();
  }, 15_000);

  it("can reseal unchanged browser/proof metadata without invalidating the authentic model", async (): Promise<void> => {
    const value = await fixture();
    await value.rewriteProof();
    await expect(
      readSimulatorProfileModelUpdate("smite_priest", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "bbbde15964092df1ecbf1dec" });
  }, 15_000);

  it.each([1440, 390])(
    "requires actual full-share evidence at %s px",
    async (width: number): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        shares = z.array(record).parse(evidence.shares),
        other = shares.find((row): boolean => object(row.viewport).width !== width),
        index = shares.findIndex((row): boolean => object(row.viewport).width === width);
      if (index < 0 || !other) throw new Error("Missing actual viewport evidence");
      shares[index] = structuredClone(other);
      evidence.shares = shares;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("smite_priest", value.directory)).rejects.toThrow(
        /desktop\/mobile/,
      );
    },
    15_000,
  );

  it.each(["missing", "duplicate", "changed", "wrong-class", "wrong-schema"])(
    "rejects correctly resealed %s parity claims",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks),
        row = parity[0];
      if (!row) throw new Error("Missing actual Smite parity");
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [row, structuredClone(row)];
      else if (kind === "wrong-schema")
        value.browser.schema = "kfc-profile-model-browser.warlock.v2";
      else if (kind === "wrong-class") row.id = "mage-arcane-static";
      else row.browserDps = Number(row.nativeDps) + 10;
      if (!["missing", "duplicate"].includes(kind)) evidence.parityChecks = parity;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("smite_priest", value.directory)).rejects.toThrow();
    },
    15_000,
  );

  it.each(["empty", "duplicate", "wrong-profile", "wrong-version", "unreviewed"])(
    "rejects a correctly resealed %s proof",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      if (kind === "empty") value.proof.builds = [];
      else if (kind === "duplicate") value.proof.builds = [builds[0], builds[0]];
      else if (kind === "wrong-profile") value.proof.profile = "shadow_priest";
      else if (kind === "wrong-version")
        value.proof.schema = "kfc-simulator-profile-model-update.warlock.v2";
      else value.proof.builds = [{ ...builds[0], id: "priest-shadow-static" }];
      await value.rewriteProof();
      await expect(readSimulatorModelUpdate("smite_priest", value.directory)).rejects.toThrow();
    },
    15_000,
  );

  it.each(["warrior", "mage", "warlock", "shadow_priest"])(
    "requires preservation evidence for %s",
    async (omitted: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence);
      evidence.otherProfiles = z
        .array(record)
        .parse(evidence.otherProfiles)
        .filter((row): boolean => row.profile !== omitted);
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("smite_priest", value.directory)).rejects.toThrow(
        /existing class regression/,
      );
    },
    15_000,
  );

  it("isolates malformed unrelated profile pointers", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = {
      smite_priest: value.selection,
      mage: false,
      shadow_priest: { unavailable: true },
      warlock: { unavailable: true },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(
      readSimulatorProfileModelUpdate("smite_priest", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "bbbde15964092df1ecbf1dec" });
  }, 15_000);
});
