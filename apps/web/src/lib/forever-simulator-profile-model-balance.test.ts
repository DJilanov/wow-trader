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
import { readPublishedSimulatorReviews } from "./forever-simulator-published-reviews";

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
const delivery = z
    .object({ documents: record })
    .passthrough()
    .parse(fixtureDocument("model-first-pass-greater-balance")),
  raw = fixtureDocument("model-profile-greater-balance"),
  profile = z
    .object({
      schema: z.literal("kfc-greater20-balance-profile-reader-fixture.v1"),
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
async function fixture(withMage: boolean = false): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-balance-model-unit-"));
  paths.push(directory);
  const documents = structuredClone({ ...delivery.documents, ...profile.documents }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).balance_druid),
    release = z.string().parse(selection.release),
    browserRef = object(selection.browserReview),
    browser = object(documents[z.string().parse(browserRef.path)]),
    proof = object(documents[release + "/kfc-reviewed-presets.json"]),
    manifest = object(documents[release + "/manifest.json"]);
  if (withMage) {
    const mage = object(fixtureDocument("model-profile-mage-v2"));
    Object.assign(
      documents,
      object(object(fixtureDocument("model-first-pass-frost")).documents),
      object(object(fixtureDocument("model-first-pass-fire")).documents),
      object(mage.documents),
    );
    pointer.profiles = { ...object(object(mage.pointer).profiles), balance_druid: selection };
  }
  for (const [path, value] of Object.entries(documents))
    await json(directory, path.replace(/^artifacts\/forever-simulator\//, ""), value);
  await json(directory, "profile-model-updates.json", pointer);
  async function rewriteBrowser(): Promise<void> {
    const sha256 = hash(browser),
      path = `optimization/reviews/profile-model-browser-${sha256.slice(0, 16)}.json`;
    selection.browserReview = { path, sha256 };
    pointer.profiles = { ...object(pointer.profiles), balance_druid: selection };
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
const publicationSchema = z
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
  .passthrough();

describe("isolated current20 Balance model delivery", () => {
  it("serves the actual reviewed result through the canonical Balance publication index", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("balance_druid", value.directory);
    if (!selected) throw new Error("Missing authentic Balance model");
    const publication = value.documents[profile.publication.path],
      sha256 = hash(publication),
      path = `published-reviews/balance_druid-${sha256.slice(0, 16)}.json`;
    await json(value.directory, path, publication);
    await json(value.directory, "published-reviews.json", {
      schema: "kfc-published-simulator-reviews.v1",
      profiles: { balance_druid: { path, sha256 } },
    });
    const builds = await readPublishedSimulatorReviews(
      { ...selected, kind: "reviewed-presets" },
      "balance_druid",
      value.directory,
    );
    expect(builds.map((build): string => build.id)).toEqual(["balance-static"]);
    expect(builds[0]?.referenceDps).toBe(573.697415938336);
    expect(builds[0]?.validationIterations).toBe(40000);
  });
  it("accepts the actual one-build staged release, exact40k result and full browser approval", async (): Promise<void> => {
    expect(hash(raw)).toBe("c65c405a9f96d33a363c6cfa2f1a855903608583055f43173109a5505e9e5d8a");
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("balance_druid", value.directory);
    expect(selected?.manifest.release).toBe("8541139367b8024ee87f3632");
    expect(selected?.sourceRelease).toBe("a4eabfa5c89f3813c1b74bde");
    if (!selected) throw new Error("Missing authentic Balance model");
    const publication = publicationSchema.parse(value.documents[profile.publication.path]);
    expect(publication.builds.map((row): string => row.id)).toEqual(["balance-static"]);
    expect(publication.builds[0]?.referenceDps).toBe(573.697415938336);
    await expect(
      validateSimulatorModelUpdateBuilds(
        "balance_druid",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(readSimulatorProfileModelUpdate("warrior", value.directory)).resolves.toBeNull();
    await expect(
      readSimulatorProfileModelUpdate("feral_druid", value.directory),
    ).resolves.toBeNull();
  });
  it.each(["missing", "duplicate", "wrong-class"])(
    "rejects %s measured builds after metadata resealing",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      value.proof.builds =
        kind === "missing"
          ? []
          : kind === "duplicate"
            ? [builds[0], builds[0]]
            : [{ ...builds[0], id: "mage-frost-static", profile: "mage" }];
      await value.rewriteProof();
      await expect(
        readSimulatorModelUpdate("balance_druid", value.directory).then((): boolean => true),
      ).rejects.toThrow();
    },
  );
  it.each([1440, 390])(
    "requires genuine full-share evidence at%s px",
    async (width: number): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence);
      evidence.shares = z
        .array(record)
        .parse(evidence.shares)
        .filter((row): boolean => object(row.viewport).width !== width);
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("balance_druid", value.directory).then((): boolean => true),
      ).rejects.toThrow();
    },
  );
  it.each(["missing", "duplicate", "changed", "old-version", "wrong-class"])(
    "rejects %s native/browser coverage",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks);
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [parity[0], parity[0]];
      else if (kind === "old-version") value.browser.schema = "kfc-profile-model-browser.v1";
      else {
        const row = parity[0];
        if (!row) throw new Error("Missing actual Balance parity");
        if (kind === "wrong-class") row.id = "mage-frost-static";
        else row.browserDps = Number(row.nativeDps) + 10;
        evidence.parityChecks = parity;
      }
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("balance_druid", value.directory).then((): boolean => true),
      ).rejects.toThrow();
    },
  );
  it("rejects changed public DPS/share or dropped/extra public builds", async (): Promise<void> => {
    const value = await fixture(),
      manifest = await readSimulatorManifest(value.directory, "8541139367b8024ee87f3632");
    if (!manifest) throw new Error("Missing authentic Balance manifest");
    const publication = publicationSchema.parse(value.documents[profile.publication.path]);
    for (const builds of [
      [],
      [...publication.builds, ...publication.builds],
      publication.builds.map((row) => ({ ...row, referenceDps: row.referenceDps + 1 })),
      publication.builds.map((row) => ({ ...row, href: row.href + "A" })),
    ])
      await expect(
        validateSimulatorModelUpdateBuilds("balance_druid", manifest, builds, value.directory),
      ).rejects.toThrow();
  });
  it("refuses changed numerical assets underneath the presentation", async (): Promise<void> => {
    const value = await fixture(),
      files = object(value.manifest.files);
    files["lib.wasm"] = { ...object(files["lib.wasm"]), sha256: "0".repeat(64) };
    value.manifest.files = files;
    await json(value.directory, "8541139367b8024ee87f3632/manifest.json", value.manifest);
    await expect(
      readSimulatorModelUpdate("balance_druid", value.directory).then((): boolean => true),
    ).rejects.toThrow(/numerical assets/);
  });
  it("keeps valid Balance usable when an unrelated Mage pointer is malformed", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = { balance_druid: value.selection, mage: { release: "../invalid" } };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    expect(
      (await readSimulatorModelUpdate("balance_druid", value.directory))?.manifest.release,
    ).toBe("8541139367b8024ee87f3632");
    await expect(
      readSimulatorModelUpdate("mage", value.directory).then((): boolean => true),
    ).rejects.toThrow();
  });
  it("keeps existing verified Mage usable when the new Balance pointer is malformed", async (): Promise<void> => {
    const value = await fixture(true);
    value.pointer.profiles = {
      ...object(value.pointer.profiles),
      balance_druid: { release: "../invalid" },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    expect((await readSimulatorModelUpdate("mage", value.directory))?.manifest.release).toBe(
      "84d483057c0282690c1c0cac",
    );
    await expect(
      readSimulatorModelUpdate("balance_druid", value.directory).then((): boolean => true),
    ).rejects.toThrow();
  });
});
