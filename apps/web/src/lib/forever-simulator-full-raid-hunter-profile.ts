import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import {
  fullRaidHunterBuildEntrySchema,
  readReviewedFullRaidHunterBuild,
  verifiedFullRaidHunterDelivery,
} from "./forever-simulator-full-raid-hunter";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(300), sha256: digest }).strict();
const release = "29d2a2c67bc4922af0cef622";
const proofSha256 = "b5ad62fafe12e23ed3bdb53ad3084d27ff00f67df1166e0020b3f76d722d4f11";
const publicationSha256 = "a68e48a70b02dec3b6b8e30d55ba0792a2c23691c135e53c831347818c91ee2b";
const ids = [
  "hunter-beast-mastery-static",
  "hunter-marksmanship-static",
  "hunter-survival-static",
] as const;
const pointerSchema = z
  .object({
    sourceRelease: z.literal(verifiedFullRaidHunterDelivery.sourceRelease),
    release: z.literal(release),
    proofSha256: z.literal(proofSha256),
    browserReview: reference,
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-update.hunter-full-raid.v1"),
    profile: z.literal("hunter"),
    sourceRelease: z.literal(verifiedFullRaidHunterDelivery.sourceRelease),
    release: z.literal(release),
    identity: digest,
    sourceManifestSha256: digest,
    nativeBinarySha256: z.literal(verifiedFullRaidHunterDelivery.nativeBinarySha256),
    databaseSha256: z.literal(verifiedFullRaidHunterDelivery.databaseSha256),
    policySha256: digest,
    typecheckDiagnostics: z.literal(0),
    modelAssets: z.record(
      z.string(),
      z.object({ bytes: z.number().int().positive(), sha256: digest }).strict(),
    ),
    builds: z
      .array(fullRaidHunterBuildEntrySchema.extend({ hrefSha256: digest }).strict())
      .length(3),
    bossDebuffOverflowQualified: z.literal(false),
  })
  .passthrough();
const browserSchema = z
  .object({
    schema: z.literal("kfc-hunter-full-raid-profile-browser.v1"),
    status: z.literal("passed"),
    capturedAt: z.iso
      .datetime()
      .refine(
        (value: string): boolean => Date.parse(value) < Date.parse("2026-10-25T05:03:16.065Z"),
        "Original review window ended",
      ),
    sourceRelease: z.literal(verifiedFullRaidHunterDelivery.sourceRelease),
    release: z.literal(release),
    proofSha256: z.literal(proofSha256),
    uiControls: reference.extend({
      sha256: z.literal("f13b3ac03972c7d9acb8a4e6450bec0b997e9d2d0b0ec1dd2f0746c31334c598"),
    }),
    hostReview: reference.extend({
      sha256: z.literal("8dd4bcbd79ec936da83bc13e485be51f9f3589862cb4b1ac09bc1812d180763a"),
    }),
    savedCharacterReview: reference.extend({
      sha256: z.literal("aa49149c938d9cabaded166ead7c656a63cbdc429b7b378f923791240d9ea21a"),
    }),
    checked: z
      .object({
        exactMeasuredBuilds: z.literal(true),
        completeUnitMetrics: z.literal(true),
        desktopMobile: z.literal(true),
        configAndGearSets: z.literal(true),
        sharesAndSavedCharacters: z.literal(true),
        currentHostCompletionBridge: z.literal(true),
        otherProfilesPreserved: z.literal(true),
        rotationGuide: z.literal(true),
        provisionalConsentOff: z.literal(true),
      })
      .strict(),
    bossDebuffOverflowQualified: z.literal(false),
    errors: z.array(z.never()).length(0),
  })
  .strict();

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
): Promise<{ value: unknown; sha256: string }> {
  requireMatch(
    !isAbsolute(path) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.split("/").includes(".."),
    "Invalid Hunter evidence path",
  );
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Hunter evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= limit, "Invalid Hunter evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= limit, "Hunter evidence exceeded read limit");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
async function proofFor(
  manifest: SimulatorManifest,
  directory: string,
): Promise<z.infer<typeof proofSchema>> {
  requireMatch(
    manifest.release === release &&
      manifest.files["kfc-reviewed-presets.json"]?.sha256 === proofSha256,
    "Unreviewed Hunter presentation",
  );
  const raw = await document(directory, release + "/kfc-reviewed-presets.json");
  requireMatch(raw.sha256 === proofSha256, "Hunter proof checksum changed");
  const proof = proofSchema.parse(raw.value);
  requireMatch(
    proof.identity.slice(0, 24) === release &&
      hash(proof.builds.map((entry) => entry.id)) === hash(ids),
    "Hunter primaries omitted or reordered",
  );
  return proof;
}

/** Preserve the shared metadata validator's four-field build contract. */
export async function validateFullRaidHunterPublication(
  manifest: SimulatorManifest,
  builds: readonly unknown[],
  directory: string,
): Promise<boolean> {
  if (manifest.release !== release) return false;
  const proof = await proofFor(manifest, directory);
  const publishedBuilds = z
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
    .length(3)
    .parse(builds);
  for (const [index, entry] of proof.builds.entries()) {
    const published = publishedBuilds[index];
    requireMatch(
      published &&
        published.id === entry.id &&
        published.referenceDps === entry.referenceDps &&
        published.validationIterations === entry.validationIterations &&
        typeof published.href === "string" &&
        createHash("sha256").update(published.href).digest("hex") === entry.hrefSha256,
      "Hunter published build disagrees with its proof",
    );
  }
  return true;
}

/** Check the complete user-visible rows before the published-reader converts them to local builds. */
export async function validateFullRaidHunterPublishedRows(
  manifest: SimulatorManifest,
  builds: readonly unknown[],
  directory: string,
): Promise<void> {
  if (!(await validateFullRaidHunterPublication(manifest, builds, directory))) return;
  const raw = await document(
    directory,
    `published-reviews/hunter-${publicationSha256.slice(0, 16)}.json`,
  );
  requireMatch(hash(raw.value) === publicationSha256, "Hunter publication checksum changed");
  const publication = z
    .object({ builds: z.array(z.record(z.string(), z.unknown())).length(3) })
    .passthrough()
    .parse(raw.value);
  requireMatch(
    isDeepStrictEqual(builds, publication.builds),
    "Hunter publication lost measured settings, guidance or DPS",
  );
}

/** Select only this reviewed UI after its actual request controls and current-host review pass. */
export async function readFullRaidHunterProfile(
  directory: string,
): Promise<{ readonly manifest: SimulatorManifest; readonly sourceRelease: string } | null> {
  let raw: Awaited<ReturnType<typeof document>>;
  try {
    raw = await document(directory, "profile-model-updates.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const selection = z
    .object({
      schema: z.literal("kfc-simulator-profile-model-selection.v1"),
      profiles: z.record(z.string(), z.unknown()),
    })
    .strict()
    .parse(raw.value);
  if (selection.profiles.hunter === undefined) return null;
  const requested = z
    .object({ release: z.string() })
    .passthrough()
    .parse(selection.profiles.hunter);
  if (requested.release !== release) return null;
  const pointer = pointerSchema.parse(selection.profiles.hunter),
    source = await readSimulatorManifest(directory, pointer.sourceRelease),
    candidate = await readSimulatorManifest(directory, release);
  requireMatch(
    source && candidate && source.pages.includes("hunter") && candidate.pages.includes("hunter"),
    "Missing Hunter model or page",
  );
  const proof = await proofFor(candidate, directory),
    sourceDocument = await document(directory, source.release + "/manifest.json", 8_000_000);
  requireMatch(
    hash(sourceDocument.value) === proof.sourceManifestSha256,
    "Hunter numerical parent changed",
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
      hash(source[key]) === hash(candidate[key]),
      "Hunter presentation changed model scope: " + key,
    );
  const numericalKeys = (manifest: SimulatorManifest): string[] =>
    Object.keys(manifest.files)
      .filter((name: string): boolean => /wasm|worker|^assets\/database\//.test(name))
      .sort();
  const keys = numericalKeys(source);
  requireMatch(
    hash(keys) === hash(numericalKeys(candidate)) &&
      hash(keys) === hash(Object.keys(proof.modelAssets).sort()),
    "Hunter numerical assets incomplete",
  );
  for (const key of keys)
    requireMatch(
      hash(source.files[key]) === hash(candidate.files[key]) &&
        hash(source.files[key]) === hash(proof.modelAssets[key]),
      "Hunter numerical assets changed",
    );
  requireMatch(
    candidate.files["lib.wasm"]?.sha256 === verifiedFullRaidHunterDelivery.wasmSha256 &&
      candidate.files["assets/database/db.json"]?.sha256 ===
        verifiedFullRaidHunterDelivery.databaseSha256,
    "Hunter qualified engine changed",
  );
  const policy = await document(directory, source.release + "/kfc-item-weapon-skills.json");
  requireMatch(
    policy.sha256 === proof.policySha256 &&
      candidate.files["kfc-item-weapon-skills.json"]?.sha256 === proof.policySha256 &&
      hash(policy.value) === hash(source.itemWeaponSkillPolicy),
    "Hunter item-skill policy changed",
  );
  for (const entry of proof.builds) {
    const { hrefSha256: _hrefSha256, ...reviewedEntry } = entry;
    await readReviewedFullRaidHunterBuild(reviewedEntry, {
      sourceRelease: source.release,
      revision: source.revision,
      databaseSha256: proof.databaseSha256,
      reference: async (ref): Promise<unknown> => {
        const value = await document(
          directory,
          ref.path.replace(/^artifacts\/forever-simulator\//, ""),
        );
        if (ref.byteSha256)
          requireMatch(value.sha256 === ref.byteSha256, "Hunter build bytes changed");
        return value.value;
      },
    });
  }
  requireMatch(
    pointer.browserReview.path ===
      `optimization/reviews/hunter-full-raid-browser-${pointer.browserReview.sha256.slice(0, 16)}.json`,
    "Unexpected Hunter browser review path",
  );
  const browserDocument = await document(directory, pointer.browserReview.path);
  requireMatch(
    hash(browserDocument.value) === pointer.browserReview.sha256,
    "Hunter browser approval checksum changed",
  );
  const browser = browserSchema.parse(browserDocument.value);
  const browserEvidence: unknown[] = [];
  for (const ref of [browser.uiControls, browser.hostReview, browser.savedCharacterReview]) {
    const evidence = await document(
      directory,
      ref.path.replace(/^artifacts\/forever-simulator\//, ""),
      8_000_000,
    );
    requireMatch(hash(evidence.value) === ref.sha256, "Hunter browser evidence changed");
    browserEvidence.push(evidence.value);
  }
  const controls = z
    .object({
      schema: z.literal("kfc-hunter-full-raid-ui-control-summary.v1"),
      sourceReport: reference.extend({
        sha256: z.literal("bfc4c196907410dc327768703dc9e1521a78c15ead5216785ed5712a9f7bf7cc"),
      }),
      release: z.literal(release),
      sourceRelease: z.literal(verifiedFullRaidHunterDelivery.sourceRelease),
      records: z
        .array(
          z
            .object({
              id: z.enum(ids),
              mode: z.enum(["desktop", "mobile"]),
              iterations: z.literal(25),
              seed: z.literal(189830001),
              nativeDps: z.number().finite().positive(),
              browserDps: z.number().finite().positive(),
              completeUnitMetricsVerified: z.literal(true),
              procConsentOff: z.literal(true),
            })
            .passthrough(),
        )
        .length(6),
      errors: z.array(z.never()).length(0),
      freshHoldouts: z.literal(0),
      referenceDpsChanged: z.literal(false),
    })
    .passthrough()
    .parse(browserEvidence[0]);
  requireMatch(
    new Set(controls.records.map((row): string => row.id + "/" + row.mode)).size === 6 &&
      controls.records.every((row): boolean => Math.abs(row.nativeDps - row.browserDps) < 1e-8),
    "Hunter desktop/mobile selected controls incomplete or unequal",
  );
  z.object({
    schema: z.literal("kfc-hunter-full-raid-host-summary.v1"),
    sourceReport: reference.extend({
      sha256: z.literal("8705903e0f3d5b462332f657276bf1ce2c8127a468bd15bc824ae64aef8c497e"),
    }),
    status: z.literal("passed"),
    release: z.literal(release),
    bridge: z
      .object({
        schema: z.literal("kfc-hunter-current-host-completion-review.v1"),
        release: z.literal(release),
        adapterVersion: z.literal("events-v2"),
        successfulNotifications: z.literal(1),
        successExactlyOnce: z.literal(true),
        engineValidationErrorPreserved: z.literal(true),
        cancellationAndLateResultSuppressed: z.literal(true),
        privacyChecks: z.tuple([z.literal("doNotTrack"), z.literal("globalPrivacyControl")]),
        numericalQualificationEvidence: z.literal(false),
      })
      .passthrough(),
    numericalQualificationEvidence: z.literal(false),
  })
    .passthrough()
    .parse(browserEvidence[1]);
  const savedCharacters = z
    .object({
      schema: z.literal("kfc-hunter-full-raid-saved-character.v1"),
      status: z.literal("passed"),
      release: z.literal(release),
      records: z
        .array(
          z
            .object({
              mode: z.enum(["desktop", "mobile"]),
              firstVisitDefaultVerified: z.literal(true),
              personalCharacterRestored: z.literal(true),
              personalWeaponEnchantPreserved: z.literal(true),
              personalEncounterPreserved: z.literal(true),
            })
            .passthrough(),
        )
        .length(2),
      nativeJobs: z.literal(0),
      browserCombatJobs: z.literal(0),
      ownerBrowserStorageTouched: z.literal(false),
      errors: z.array(z.never()).length(0),
    })
    .passthrough()
    .parse(browserEvidence[2]);
  requireMatch(
    new Set(savedCharacters.records.map((row): string => row.mode)).size === 2,
    "Hunter saved-character review omitted a viewport",
  );
  return { manifest: candidate, sourceRelease: source.release };
}
