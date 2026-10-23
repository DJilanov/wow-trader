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
    .parse(document("model-first-pass-retribution-paladin")),
  shockadinDelivery = z
    .object({ documents: record })
    .passthrough()
    .parse(document("model-first-pass-shockadin")),
  profile = z
    .object({
      schema: z.literal("kfc-paladin-dps-profile-reader-fixture.v1"),
      pointer: record,
      publication: z.object({ path: z.string(), sha256: z.string() }),
      documents: record,
    })
    .strict()
    .parse(document("model-profile-paladin-dps")),
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
  const directory = await mkdtemp(join(tmpdir(), "kfc-paladin-dps-profile-unit-"));
  temporaryPaths.push(directory);
  const documents = structuredClone({
      ...delivery.documents,
      ...shockadinDelivery.documents,
      ...profile.documents,
    }),
    pointer = structuredClone(profile.pointer),
    selection = object(object(pointer.profiles).retribution_paladin),
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
    pointer.profiles = { retribution_paladin: selection };
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

describe("isolated cumulative qualified Paladin profile delivery", () => {
  it("reads the actual cumulative compiled/browser-reviewed profile with both qualified40k results and all29gear rows", async (): Promise<void> => {
    const value = await fixture(),
      selected = await readSimulatorModelUpdate("retribution_paladin", value.directory);
    expect(selected?.sourceRelease).toBe("e945e98f232cc81948ee9060");
    expect(selected?.manifest.release).toBe("135c3be07ddf4be41de2e554");
    if (!selected) throw new Error("Missing genuine cumulative Paladin profile");
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
      "paladin-retribution-static",
      "paladin-shockadin-static",
    ]);
    expect(publication.builds.map((entry): number => entry.referenceDps)).toEqual([
      975.0313336343517, 762.3068917171573,
    ]);
    expect(z.array(record).parse(value.proof.presets)).toHaveLength(29);
    expect(value.proof.measurementBridge).toMatchObject({
      compiledEmitter: false,
      htmlAdapter: "events-v2",
    });
    await expect(
      validateSimulatorModelUpdateBuilds(
        "retribution_paladin",
        selected.manifest,
        publication.builds,
        value.directory,
      ),
    ).resolves.toBeUndefined();
    await expect(
      readSimulatorProfileModelUpdate("protection_paladin", value.directory),
    ).resolves.toBeNull();
  }, 20_000);

  it.each([
    "missing",
    "legacy",
    "zero-success",
    "cancelled",
    "privacy",
    "qualification",
    "missing-source",
  ])(
    "rejects resealed %s current-host completion bridge evidence",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        bridge = object(evidence.completionBridgeReview);
      if (kind === "missing") delete evidence.completionBridgeReview;
      else {
        if (kind === "legacy") bridge.adapterVersion = "events-v1";
        else if (kind === "zero-success") bridge.successfulNotifications = 0;
        else if (kind === "cancelled") bridge.cancellationAndLateResultSuppressed = false;
        else if (kind === "privacy") bridge.privacyChecks = ["doNotTrack"];
        else if (kind === "qualification") bridge.numericalQualificationEvidence = true;
        else
          bridge.sourceFiles = z
            .array(record)
            .parse(bridge.sourceFiles)
            .filter(
              (row): boolean => row.path !== "apps/web/src/lib/forever-simulator-measurement.ts",
            );
        evidence.completionBridgeReview = bridge;
      }
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow();
    },
    20_000,
  );

  it.each(["missing-check", "compiled-emitter", "virtual-hash", "missing-gear-row"])(
    "rejects resealed %s cumulative presentation metadata",
    async (kind: string): Promise<void> => {
      const value = await fixture();
      if (kind === "missing-check") {
        const checked = object(value.browser.checked);
        delete checked.currentHostCompletionBridge;
        value.browser.checked = checked;
        await value.rewriteBrowser();
      } else {
        if (kind === "missing-gear-row")
          value.proof.presets = z.array(record).parse(value.proof.presets).slice(0, -1);
        else {
          const bridge = object(value.proof.measurementBridge);
          if (kind === "compiled-emitter") bridge.compiledEmitter = true;
          else bridge.virtualSha256 = "0".repeat(64);
          value.proof.measurementBridge = bridge;
        }
        await value.rewriteProof();
      }
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow();
    },
    20_000,
  );

  it.each([1440, 390])(
    "requires full measured shares at %s px",
    async (width: number): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        shares = z.array(record).parse(evidence.shares),
        other = shares.find((row): boolean => object(row.viewport).width !== width),
        index = shares.findIndex((row): boolean => object(row.viewport).width === width);
      if (index < 0 || !other) throw new Error("Missing genuine viewport evidence");
      shares[index] = structuredClone(other);
      evidence.shares = shares;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow(/desktop\/mobile/);
    },
    20_000,
  );

  it.each(["missing", "duplicate", "changed", "wrong-class", "wrong-schema"])(
    "rejects resealed %s parity claims",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        evidence = object(value.browser.evidence),
        parity = z.array(record).parse(evidence.parityChecks),
        row = parity[0];
      if (!row) throw new Error("Missing actual Ret parity");
      if (kind === "missing") evidence.parityChecks = [];
      else if (kind === "duplicate") evidence.parityChecks = [row, structuredClone(row)];
      else if (kind === "wrong-schema")
        value.browser.schema = "kfc-profile-model-browser.shaman-enhancement.v1";
      else if (kind === "wrong-class") row.id = "shaman-enhancement-static";
      else row.browserDps = Number(row.nativeDps) + 10;
      if (!["missing", "duplicate"].includes(kind)) evidence.parityChecks = parity;
      value.browser.evidence = evidence;
      await value.rewriteBrowser();
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow();
    },
    20_000,
  );

  it.each(["empty", "duplicate", "wrong-profile", "wrong-version", "unreviewed"])(
    "rejects resealed %s proof",
    async (kind: string): Promise<void> => {
      const value = await fixture(),
        builds = z.array(record).parse(value.proof.builds);
      if (kind === "empty") value.proof.builds = [];
      else if (kind === "duplicate") value.proof.builds = [builds[0], builds[0]];
      else if (kind === "wrong-profile") value.proof.profile = "enhancement_shaman";
      else if (kind === "wrong-version")
        value.proof.schema = "kfc-simulator-profile-model-update.shaman-enhancement.v1";
      else value.proof.builds = [{ ...builds[0], id: "shaman-enhancement-static" }];
      await value.rewriteProof();
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow();
    },
    20_000,
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
    "enhancement_shaman",
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
      await expect(
        readSimulatorModelUpdate("retribution_paladin", value.directory),
      ).rejects.toThrow(/existing class regression/);
    },
    20_000,
  );

  it("isolates unrelated malformed pointers and does not authorize unfinished Paladin specs", async (): Promise<void> => {
    const value = await fixture();
    value.pointer.profiles = {
      retribution_paladin: value.selection,
      mage: false,
      enhancement_shaman: { unavailable: true },
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(
      readSimulatorProfileModelUpdate("retribution_paladin", value.directory),
    ).resolves.toMatchObject({ sourceRelease: "e945e98f232cc81948ee9060" });
    await expect(
      readSimulatorProfileModelUpdate("protection_paladin", value.directory),
    ).resolves.toBeNull();
  }, 20_000);

  it("rejects a replaced numerical asset instead of allowing a presentation to change combat", async (): Promise<void> => {
    const value = await fixture(),
      release = z.string().parse(value.selection.release),
      manifest = object(value.documents[release + "/manifest.json"]);
    manifest.files = {
      ...object(manifest.files),
      "lib.wasm": {
        ...object(object(manifest.files)["lib.wasm"]),
        sha256: "0".repeat(64),
      },
    };
    await json(value.directory, release + "/manifest.json", manifest);
    await expect(readSimulatorModelUpdate("retribution_paladin", value.directory)).rejects.toThrow(
      /numerical assets/,
    );
  }, 20_000);
});
