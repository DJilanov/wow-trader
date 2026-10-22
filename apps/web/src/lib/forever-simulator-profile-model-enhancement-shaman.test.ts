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
    .parse(document("model-first-pass-enhancement-shaman")),
  profile = z
    .object({
      schema: z.literal("kfc-enhancement-shaman-profile-reader-fixture.v1"),
      pointer: record,
      publication: z.object({ path: z.string(), sha256: z.string() }),
      documents: record,
    })
    .strict()
    .parse(document("model-profile-enhancement-shaman")),
  temporaryPaths: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path): Promise<void> => rm(path, { recursive: true, force: true })),
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
  const directory = await mkdtemp(join(tmpdir(), "kfc-enhancement-shaman-profile-unit-"));
  temporaryPaths.push(directory);
  const documents = structuredClone({ ...delivery.documents, ...profile.documents }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).enhancement_shaman),
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
    pointer.profiles = { enhancement_shaman: selection };
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

describe("isolated qualified Enhancement Shaman profile delivery", () => {
  it("reads the actual compiled/browser-reviewed model, 40k result and complete large feedback source", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("enhancement_shaman", value.directory);
    expect(
      Buffer.byteLength(
        JSON.stringify(
          value.documents[
            "artifacts/forever-simulator/optimization/bounded-native-studies/0c6d7bc3698fab970542ff444f4b5b395097795caa48e6419b986826a2282b88/result-6b79141f70d57c34.json"
          ],
          null,
          2,
        ) + "\n",
      ),
    ).toBe(14_973_612);
    expect(selected?.sourceRelease).toBe("137f6ec1ba5757af03c5bb95");
    expect(selected?.manifest.release).toBe(value.selection.release);
    if (!selected) throw new Error("Missing authentic Enhancement Shaman profile");
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
    expect(publication.builds.map((entry): string => entry.id)).toEqual([
      "shaman-enhancement-static",
    ]);
    expect(publication.builds[0]?.referenceDps).toBe(739.4162761173707);
    expect(publication.builds[0]?.validationIterations).toBe(40000);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "enhancement_shaman",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(
      readSimulatorProfileModelUpdate("smite_priest", value.directory),
    ).resolves.toBeNull();
  }, 15_000);

  it.each([1440, 390])(
    "requires real full-share evidence at %s px",
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
      await expect(readSimulatorModelUpdate("enhancement_shaman", value.directory)).rejects.toThrow(
        /desktop\/mobile/,
      );
    },
    15_000,
  );

  it("rejects missing share rows before publication", async (): Promise<void> => {
    const value = await fixture(),
      evidence = object(value.browser.evidence);
    evidence.shares = z.array(record).parse(evidence.shares).slice(0, 1);
    value.browser.evidence = evidence;
    await value.rewriteBrowser();
    await expect(readSimulatorModelUpdate("enhancement_shaman", value.directory)).rejects.toThrow();
  }, 15_000);

  it.each(["missing", "duplicate", "changed", "wrong-class", "wrong-schema"])(
    "rejects correctly resealed %s parity claims",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks),
        row = parity[0];
      if (!row) throw new Error("Missing actual Enhancement parity");
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [row, structuredClone(row)];
      else if (kind === "wrong-schema")
        value.browser.schema = "kfc-profile-model-browser.priest-smite.v1";
      else if (kind === "wrong-class") row.id = "priest-smite-static";
      else row.browserDps = Number(row.nativeDps) + 10;
      if (!["missing", "duplicate"].includes(kind)) evidence.parityChecks = parity;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("enhancement_shaman", value.directory),
      ).rejects.toThrow();
    },
    15_000,
  );

  it.each(["empty", "duplicate", "wrong-profile", "wrong-version", "unreviewed"])(
    "rejects correctly resealed %s proof",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      if (kind === "empty") value.proof.builds = [];
      else if (kind === "duplicate") value.proof.builds = [builds[0], builds[0]];
      else if (kind === "wrong-profile") value.proof.profile = "smite_priest";
      else if (kind === "wrong-version")
        value.proof.schema = "kfc-simulator-profile-model-update.priest-smite.v1";
      else value.proof.builds = [{ ...builds[0], id: "shaman-stormcaller-static" }];
      await value.rewriteProof();
      await expect(
        readSimulatorModelUpdate("enhancement_shaman", value.directory),
      ).rejects.toThrow();
    },
    15_000,
  );

  it.each([
    "warrior",
    "rogue",
    "hunter",
    "feral_druid",
    "balance_druid",
    "mage",
    "warlock",
    "shadow_priest",
    "smite_priest",
    "elemental_shaman",
  ])(
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
      await expect(readSimulatorModelUpdate("enhancement_shaman", value.directory)).rejects.toThrow(
        /existing class regression/,
      );
    },
    15_000,
  );

  it("isolates malformed unrelated pointers without authorizing an unfinished Paladin variant", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = {
      enhancement_shaman: value.selection,
      mage: false,
      smite_priest: { unavailable: true },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(
      readSimulatorProfileModelUpdate("enhancement_shaman", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "137f6ec1ba5757af03c5bb95" });
    await expect(
      readSimulatorProfileModelUpdate("retribution_paladin", value.directory),
    ).resolves.toBeNull();
  }, 15_000);
});
