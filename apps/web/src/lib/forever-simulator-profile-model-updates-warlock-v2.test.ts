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
    .parse(document("model-first-pass-demonology")),
  raw = document("model-profile-warlock-v2"),
  profile = z
    .object({
      schema: z.literal("kfc-warlock-multispec-profile-reader-fixture.v2"),
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
  const directory = await mkdtemp(join(tmpdir(), "kfc-warlock-multispec-profile-unit-"));
  paths.push(directory);
  const affliction = z
    .object({ documents: record })
    .passthrough()
    .parse(document("model-first-pass-affliction"));
  const documents = structuredClone({
      ...delivery.documents,
      ...affliction.documents,
      ...profile.documents,
    }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).warlock),
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
    pointer.profiles = { warlock: selection };
    await json(directory, path, browser);
    await json(directory, "profile-model-updates.json", pointer);
  }
  async function rewriteProof(): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(proof, null, 2) + "\n"),
      sha256 = createHash("sha256").update(bytes).digest("hex"),
      files = object(manifest.files);
    files["kfc-reviewed-presets.json"] = { bytes: bytes.length, sha256 };
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

describe("verified Demonology and full-raid Affliction profile delivery", () => {
  it("reads the authentic compiled/browser-reviewed release and full mixed-version source chain without changing other class selections", async (): Promise<void> => {
    expect(hash(raw)).toBe("d79c0d46f9aa901d9f5fbc1a68868d291900d8cb6298aca65bb2ef64e37589ff");
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("warlock", value.directory);
    expect(selected?.manifest.release).toBe("2e4bfb0b779559053237eb6f");
    expect(selected?.sourceRelease).toBe("a4eabfa5c89f3813c1b74bde");
    if (!selected) throw new Error("Missing actual Demonology profile");
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
      "warlock-demonology-static",
      "warlock-affliction-static",
    ]);
    expect(publication.builds[0]?.referenceDps).toBe(830.2573884583082);
    expect(publication.builds[1]?.referenceDps).toBe(747.6164254231074);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "warlock",
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
    "requires the actual Warlock share at%s px",
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
      await expect(readSimulatorModelUpdate("warlock", value.directory)).rejects.toThrow(
        /desktop\/mobile/,
      );
    },
    15_000,
  );
  it.each(["missing", "duplicate", "changed", "wrong-class", "wrong-schema"])(
    "rejects resealed %s browser parity claims",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks),
        row = parity[0];
      if (!row) throw new Error("Missing genuine Warlock parity");
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [row, structuredClone(row)];
      else if (kind === "wrong-schema") value.browser.schema = "kfc-profile-model-browser.v3";
      else if (kind === "wrong-class") row.id = "mage-arcane-static";
      else row.browserDps = Number(row.nativeDps) + 10;
      if (!["missing", "duplicate"].includes(kind)) evidence.parityChecks = parity;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(readSimulatorModelUpdate("warlock", value.directory)).rejects.toThrow();
    },
    15_000,
  );
  it.each(["empty", "duplicate", "missing-affliction", "reordered", "wrong-version", "mage"])(
    "cannot turn a resealed %s proof into an approved Warlock build",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      if (kind === "empty") value.proof.builds = [];
      else if (kind === "duplicate") value.proof.builds = [builds[0], builds[0]];
      else if (kind === "missing-affliction") value.proof.builds = [builds[0]];
      else if (kind === "reordered") value.proof.builds = [...builds].reverse();
      else if (kind === "wrong-version")
        value.proof.schema = "kfc-simulator-profile-model-update.warlock.v1";
      else value.proof.schema = "kfc-simulator-profile-model-update.v3";
      await value.rewriteProof();
      await expect(readSimulatorModelUpdate("warlock", value.directory)).rejects.toThrow();
    },
    15_000,
  );
  it.each(["mage", "balance_druid"])(
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
      await expect(readSimulatorModelUpdate("warlock", value.directory)).rejects.toThrow(
        /existing class regression/,
      );
    },
    15_000,
  );
  it("keeps malformed unrelated pointers isolated from the valid requested profile", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = {
      warlock: value.selection,
      mage: false,
      balance_druid: { unavailable: true },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(
      readSimulatorProfileModelUpdate("warlock", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "a4eabfa5c89f3813c1b74bde" });
  }, 15_000);
});
