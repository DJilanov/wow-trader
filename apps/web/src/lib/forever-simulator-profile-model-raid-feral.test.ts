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
    .parse(document("feral-raid-delivery")),
  raw = document("model-profile-feral-raid-v1"),
  profile = z
    .object({
      schema: z.literal("kfc-feral-raid-profile-reader-fixture.v1"),
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
  manifest: Record<string, unknown>;
  rewriteBrowser: () => Promise<void>;
  rewriteProof: () => Promise<void>;
}
async function fixture(): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-demonology-profile-unit-"));
  paths.push(directory);
  const documents = structuredClone({ ...delivery.documents, ...profile.documents }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).feral_druid),
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
    pointer.profiles = { feral_druid: selection };
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

describe("isolated verified raid-revalidated Cat profile delivery", () => {
  it("reads the authentic compiled/browser-reviewed release and full mixed-version source chain without changing other class selections", async (): Promise<void> => {
    expect(hash(raw)).toBe("86cbc213455e5757cbd2c32b3b44d2ddc2fe08ed4fd3cc0a6164c6e3f8ac9ca6");
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("feral_druid", value.directory);
    expect(selected?.manifest.release).toBe(
      z.string().parse(object(object(profile.pointer.profiles).feral_druid).release),
    );
    expect(selected?.sourceRelease).toBe("a4eabfa5c89f3813c1b74bde");
    if (!selected) throw new Error("Missing actual raid-revalidated Cat profile");
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
    expect(publication.builds.map((row): string => row.id)).toEqual(["feral-cat-static"]);
    expect(publication.builds[0]?.referenceDps).toBe(752.0645151927594);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "feral_druid",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(readSimulatorProfileModelUpdate("mage", value.directory)).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("balance_druid", value.directory),
    ).resolves.toBeNull();
  }, 15_000);
  it.each([1440, 390])(
    "requires the actual Cat share at%s px",
    async (width: number): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence);
      const shares = z.array(record).parse(evidence.shares),
        index = shares.findIndex((row): boolean => object(row.viewport).width === width),
        other = shares.find((row): boolean => object(row.viewport).width !== width);
      if (index < 0 || !other) throw new Error("Missing genuine viewport evidence");
      shares[index] = structuredClone(other);
      evidence.shares = shares;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("feral_druid", value.directory)).rejects.toThrow(
        /desktop\/mobile/,
      );
    },
  );
  it.each(["missing", "duplicate", "changed", "wrong-class", "wrong-schema"])(
    "rejects resealed %s browser parity claims",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks),
        row = parity[0];
      if (!row) throw new Error("Missing genuine Cat parity");
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [row, structuredClone(row)];
      else if (kind === "wrong-schema") value.browser.schema = "kfc-profile-model-browser.v3";
      else if (kind === "wrong-class") row.id = "mage-arcane-static";
      else row.browserDps = Number(row.nativeDps) + 10;
      if (!["missing", "duplicate"].includes(kind)) evidence.parityChecks = parity;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("feral_druid", value.directory)).rejects.toThrow();
    },
  );
  it.each(["empty", "duplicate", "mage"])(
    "cannot turn a resealed %s proof into an approved Cat build",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      if (kind === "empty") value.proof.builds = [];
      else if (kind === "duplicate") value.proof.builds = [builds[0], builds[0]];
      else value.proof.schema = "kfc-simulator-profile-model-update.v3";
      await value.rewriteProof();
      await expect(readSimulatorModelUpdate("feral_druid", value.directory)).rejects.toThrow();
    },
  );
  it.each(["warrior", "rogue", "hunter", "mage", "balance_druid", "warlock"])(
    "requires preservation evidence for the existing%s delivery",
    async (omitted: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence);
      evidence.otherProfiles = z
        .array(record)
        .parse(evidence.otherProfiles)
        .filter((row): boolean => row.profile !== omitted);
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("feral_druid", value.directory)).rejects.toThrow(
        /existing class regression/,
      );
    },
  );
  it("keeps malformed unrelated pointers isolated from the valid requested profile", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = {
      feral_druid: value.selection,
      mage: false,
      balance_druid: { unavailable: true },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(
      readSimulatorProfileModelUpdate("feral_druid", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "a4eabfa5c89f3813c1b74bde" });
  }, 15_000);
});
