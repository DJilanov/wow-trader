import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import { createReviewedFullRaidDruidBuildReader } from "./forever-simulator-full-raid-druid";
import {
  fullRaidDruidStatisticsModel,
  type FullRaidDruidProfile,
} from "./forever-simulator-full-raid-druid-schema";
import {
  fullRaidDruidBrowserReviewSchema,
  fullRaidDruidHostReviewSchema,
  fullRaidDruidProfilePinsSchema,
  fullRaidDruidProfileProofSchema,
  fullRaidDruidSavedCharactersSchema,
  fullRaidDruidUiControlsSchema,
  type FullRaidDruidProfilePins,
  type FullRaidDruidProfileProof,
} from "./forever-simulator-full-raid-druid-profile-schema";

interface SelectedDruidProfile {
  readonly manifest: SimulatorManifest;
  readonly sourceRelease: string;
}
export interface FullRaidDruidProfileAdapters {
  readonly readProfile: (
    profile: FullRaidDruidProfile,
    directory: string,
  ) => Promise<SelectedDruidProfile | null>;
  readonly validatePublication: (
    profile: FullRaidDruidProfile,
    manifest: SimulatorManifest,
    builds: readonly unknown[],
    directory: string,
  ) => Promise<boolean>;
  readonly validatePublishedRows: (
    profile: FullRaidDruidProfile,
    manifest: SimulatorManifest,
    builds: readonly unknown[],
    directory: string,
  ) => Promise<void>;
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(350), sha256: digest }).strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-selection.v1"),
    profiles: z.record(z.string(), z.unknown()),
  })
  .strict();
const pointerSchema = z
  .object({
    sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    proofSha256: digest,
    browserReview: reference,
  })
  .strict();
const publishedRowsSchema = z
  .array(
    z
      .object({
        id: z.string(),
        href: z.string().min(1).max(512_000),
        referenceDps: z.number().finite().positive(),
        validationIterations: z.number().int().positive().safe(),
      })
      .passthrough(),
  )
  .length(1);
const ids = { feral_druid: "feral-cat-static", balance_druid: "balance-static" } as const;
const correctionDirectory =
  "artifacts/forever-simulator/optimization/druid-statistics-correction-v1";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  limit = 2_000_000,
): Promise<{ readonly value: unknown; readonly sha256: string }> {
  requireMatch(
    path &&
      !isAbsolute(path) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      path
        .split("/")
        .every((part: string): boolean => part !== "" && part !== "." && part !== ".."),
    "Invalid Druid evidence path",
  );
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Druid evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= limit, "Invalid Druid evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= limit, "Druid evidence exceeded read limit");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
function evidencePath(path: string): string {
  return path.replace(/^artifacts\/forever-simulator\//, "");
}
function numericalKeys(manifest: SimulatorManifest): string[] {
  return Object.keys(manifest.files)
    .filter((name: string): boolean => /wasm|worker|^assets\/database\//.test(name))
    .sort();
}

/** Bind both profiles to independently reviewed, code-owned delivery hashes.
 * Imported metadata cannot supply the pins. Registration waits for actual final
 * numerical, presentation and browser evidence; this factory never selects a release.
 */
export function createReviewedFullRaidDruidProfileAdapters(
  rawPins: FullRaidDruidProfilePins,
): FullRaidDruidProfileAdapters {
  const pins = fullRaidDruidProfilePinsSchema.parse(rawPins),
    readBuild = createReviewedFullRaidDruidBuildReader(pins.buildPins);

  async function proofFor(
    manifest: SimulatorManifest,
    directory: string,
  ): Promise<FullRaidDruidProfileProof> {
    requireMatch(
      manifest.release === pins.release &&
        manifest.files["kfc-reviewed-presets.json"]?.sha256 === pins.proofSha256,
      "Unreviewed Druid presentation",
    );
    const raw = await document(directory, pins.release + "/kfc-reviewed-presets.json");
    requireMatch(raw.sha256 === pins.proofSha256, "Druid proof checksum changed");
    const proof = fullRaidDruidProfileProofSchema.parse(raw.value);
    requireMatch(
      proof.release === pins.release && proof.identity.slice(0, 24) === pins.release,
      "Druid proof identifies another presentation",
    );
    requireMatch(
      proof.correction.path === correctionDirectory + "/completed.json" &&
        proof.confirmation.path === correctionDirectory + "/confirmation-completed.json" &&
        proof.correction.byteSha256 === pins.buildPins.correctionByteSha256 &&
        proof.confirmation.byteSha256 === pins.buildPins.confirmationByteSha256 &&
        proof.supervisor.runSha256 === pins.buildPins.supervisorRunSha256,
      "Druid proof lost its completed correction, confirmation or owner",
    );
    return proof;
  }

  async function validatePublication(
    profile: FullRaidDruidProfile,
    manifest: SimulatorManifest,
    builds: readonly unknown[],
    directory: string,
  ): Promise<boolean> {
    if (manifest.release !== pins.release) return false;
    const proof = await proofFor(manifest, directory),
      entry = proof.builds.find((row): boolean => row.profile === profile),
      published = publishedRowsSchema.parse(builds)[0];
    requireMatch(
      entry &&
        published &&
        published.id === ids[profile] &&
        published.id === entry.id &&
        published.referenceDps === entry.referenceDps &&
        published.validationIterations === entry.validationIterations &&
        createHash("sha256").update(published.href).digest("hex") === entry.hrefSha256,
      "Druid published build disagrees with its profile proof",
    );
    return true;
  }

  async function validatePublishedRows(
    profile: FullRaidDruidProfile,
    manifest: SimulatorManifest,
    builds: readonly unknown[],
    directory: string,
  ): Promise<void> {
    if (!(await validatePublication(profile, manifest, builds, directory))) return;
    const sha256 = pins.publications[profile],
      raw = await document(directory, `published-reviews/${profile}-${sha256.slice(0, 16)}.json`);
    requireMatch(hash(raw.value) === sha256, "Druid publication checksum changed");
    const publication = z
      .object({
        schema: z.literal("kfc-published-simulator-profile.v1"),
        profile: z.literal(profile),
        sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
        presentationRelease: z.literal(pins.release),
        presentationProofSha256: z.literal(pins.proofSha256),
        builds: publishedRowsSchema,
      })
      .strict()
      .parse(raw.value);
    requireMatch(
      isDeepStrictEqual(builds, publication.builds),
      "Druid publication lost measured settings, guidance or DPS",
    );
  }

  async function verifyBrowser(directory: string, ref: z.infer<typeof reference>): Promise<void> {
    requireMatch(
      ref.sha256 === pins.browserReviewSha256 &&
        ref.path ===
          `optimization/reviews/druid-statistics-browser-${pins.browserReviewSha256.slice(0, 16)}.json`,
      "Unexpected Druid browser approval",
    );
    const raw = await document(directory, ref.path);
    requireMatch(hash(raw.value) === ref.sha256, "Druid browser approval checksum changed");
    const browser = fullRaidDruidBrowserReviewSchema.parse(raw.value);
    requireMatch(
      browser.release === pins.release && browser.proofSha256 === pins.proofSha256,
      "Druid browser approval identifies another presentation",
    );
    async function evidence(expected: z.infer<typeof reference>): Promise<unknown> {
      const value = await document(directory, evidencePath(expected.path), 8_000_000);
      requireMatch(hash(value.value) === expected.sha256, "Druid browser evidence changed");
      return value.value;
    }
    const controls = fullRaidDruidUiControlsSchema.parse(await evidence(browser.uiControls)),
      host = fullRaidDruidHostReviewSchema.parse(await evidence(browser.hostReview)),
      saved = fullRaidDruidSavedCharactersSchema.parse(
        await evidence(browser.savedCharacterReview),
      );
    requireMatch(
      [controls.release, host.release, saved.release].every(
        (value: string): boolean => value === pins.release,
      ),
      "Druid browser evidence identifies another presentation",
    );
    requireMatch(
      new Set(controls.records.map((row): string => row.profile + "/" + row.mode)).size === 4 &&
        controls.records.every(
          (row): boolean =>
            row.id === ids[row.profile] && Math.abs(row.nativeDps - row.browserDps) < 1e-8,
        ),
      "Druid desktop/mobile selected controls incomplete or unequal",
    );
    requireMatch(
      new Set(host.records.map((row): string => row.profile)).size === 2,
      "Druid host review omitted a profile",
    );
    requireMatch(
      new Set(saved.records.map((row): string => row.profile + "/" + row.mode)).size === 4,
      "Druid saved-character review omitted a profile or viewport",
    );
  }

  async function readProfile(
    profile: FullRaidDruidProfile,
    directory: string,
  ): Promise<SelectedDruidProfile | null> {
    let raw: Awaited<ReturnType<typeof document>>;
    try {
      raw = await document(directory, "profile-model-updates.json", 32_000);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw error;
    }
    const selection = selectionSchema.parse(raw.value),
      requested = selection.profiles[profile];
    if (requested === undefined) return null;
    if (z.object({ release: z.string() }).passthrough().parse(requested).release !== pins.release)
      return null;
    const pointer = pointerSchema.parse(requested);
    requireMatch(pointer.proofSha256 === pins.proofSha256, "Druid selected proof changed");
    const source = await readSimulatorManifest(directory, pointer.sourceRelease),
      candidate = await readSimulatorManifest(directory, pins.release);
    requireMatch(
      source && candidate && source.pages.includes(profile) && candidate.pages.includes(profile),
      "Missing Druid model or page",
    );
    const proof = await proofFor(candidate, directory),
      sourceDocument = await document(directory, source.release + "/manifest.json", 8_000_000);
    requireMatch(
      hash(sourceDocument.value) === proof.sourceManifestSha256,
      "Druid numerical parent changed",
    );
    for (const key of [
      "revision",
      "itemCount",
      "currentItemCount",
      "provisionalItemCount",
      "excludedModeledItems",
      "pages",
      "dataProvenance",
      "mechanicsStatus",
      "itemWeaponSkillPolicy",
    ] as const)
      requireMatch(
        isDeepStrictEqual(source[key], candidate[key]),
        "Druid presentation changed model scope: " + key,
      );
    const keys = numericalKeys(source);
    requireMatch(
      isDeepStrictEqual(keys, numericalKeys(candidate)) &&
        isDeepStrictEqual(keys, Object.keys(proof.modelAssets).sort()),
      "Druid numerical assets incomplete",
    );
    for (const key of keys)
      requireMatch(
        isDeepStrictEqual(source.files[key], candidate.files[key]) &&
          isDeepStrictEqual(source.files[key], proof.modelAssets[key]),
        "Druid numerical assets changed",
      );
    requireMatch(
      candidate.files["lib.wasm"]?.sha256 === fullRaidDruidStatisticsModel.wasmSha256 &&
        candidate.files["assets/database/db.json"]?.sha256 ===
          fullRaidDruidStatisticsModel.databaseSha256,
      "Druid qualified engine changed",
    );
    const policy = await document(directory, source.release + "/kfc-item-weapon-skills.json");
    requireMatch(
      policy.sha256 === proof.policySha256 &&
        candidate.files["kfc-item-weapon-skills.json"]?.sha256 === proof.policySha256 &&
        isDeepStrictEqual(policy.value, source.itemWeaponSkillPolicy),
      "Druid item-skill policy changed",
    );
    for (const { hrefSha256: _hrefSha256, ...entry } of proof.builds)
      await readBuild(entry, {
        sourceRelease: source.release,
        revision: source.revision,
        databaseSha256: proof.databaseSha256,
        reference: async (ref): Promise<unknown> => {
          const value = await document(directory, evidencePath(ref.path));
          if (ref.byteSha256)
            requireMatch(value.sha256 === ref.byteSha256, "Druid build bytes changed");
          return value.value;
        },
      });
    await verifyBrowser(directory, pointer.browserReview);
    return { manifest: candidate, sourceRelease: source.release };
  }

  return { readProfile, validatePublication, validatePublishedRows };
}
