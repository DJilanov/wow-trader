import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest } from "./forever-simulator";
import {
  frostModelEntrySchema,
  frostModelEvidenceReferenceSchema,
  readFreshFrostSimulatorBuild,
  type FrostModelEvidenceReference,
} from "./forever-simulator-fresh-frost";
import { fireModelEntrySchema, readFreshFireSimulatorBuild } from "./forever-simulator-fresh-fire";
import {
  greaterBalanceModelEntrySchema,
  readFreshGreaterBalanceSimulatorBuild,
} from "./forever-simulator-fresh-greater-balance";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  releaseId = z.string().regex(/^[a-f0-9]{24}$/),
  reference = z.object({ path: z.string().min(1).max(240), sha256: digest }).strict(),
  asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const profilePointerSchema = z
  .object({
    sourceRelease: releaseId,
    release: releaseId,
    proofSha256: digest,
    browserReview: reference,
  })
  .strict();
const selectionSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-selection.v1"),
    profiles: z
      .object({
        mage: z.unknown().optional(),
        balance_druid: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
const proofFields = {
  sourceRelease: releaseId,
  release: releaseId,
  identity: digest,
  sourceManifestSha256: digest,
  nativeBinarySha256: digest,
  databaseSha256: digest,
  policySha256: digest,
  typecheckDiagnostics: z.literal(0),
  modelAssets: z.record(z.string(), asset),
  virtualSourceFiles: z
    .array(z.object({ path: z.string().min(1).max(240), sha256: digest }).strict())
    .min(1)
    .max(160),
  sourceFiles: z
    .array(z.object({ path: z.string().min(1).max(240), byteSha256: digest }).strict())
    .min(1)
    .max(32),
  presets: z
    .array(
      z
        .object({
          profile: z.string().regex(/^[a-z_]+$/),
          variant: z.string().regex(/^[a-z0-9_-]+$/),
          gearSha256: digest,
        })
        .strict(),
    )
    .length(28),
  notice: z.string().min(1).max(4000),
};
const mageProofSchema = z
  .object({
    ...proofFields,
    schema: z.enum([
      "kfc-simulator-profile-model-update.v1",
      "kfc-simulator-profile-model-update.v2",
    ]),
    profile: z.literal("mage"),
    builds: z.union([
      z.tuple([frostModelEntrySchema]),
      z.tuple([frostModelEntrySchema, fireModelEntrySchema]),
    ]),
  })
  .strict()
  .refine(
    (proof: { readonly schema: string; readonly builds: readonly unknown[] }): boolean => {
      const expected = proof.schema === "kfc-simulator-profile-model-update.v1" ? 1 : 2;
      return proof.builds.length === expected;
    },
    { path: ["builds"], message: "Profile version omitted or added a reviewed Mage spec" },
  );
const balanceProofSchema = z
  .object({
    ...proofFields,
    schema: z.literal("kfc-simulator-profile-model-update.balance.v1"),
    profile: z.literal("balance_druid"),
    builds: z.tuple([greaterBalanceModelEntrySchema]),
  })
  .strict();
const proofSchema = z.union([mageProofSchema, balanceProofSchema]);
export const simulatorProfileModelBrowserChecks = Object.freeze({
  allPresets: true,
  reviewedShares: true,
  firstVisitDefault: true,
  savedCharacterPreserved: true,
  provisionalConsentOff: true,
  nativeBrowserParity: true,
  desktopMobile: true,
  itemSkillsIgnored: true,
  assetIntegrity: true,
  otherProfilesPreserved: true,
  greaterMageblood20: true,
  configAndGearSets: true,
  rotationGuide: true,
});
const browserSchema = z
  .object({
    schema: z.enum([
      "kfc-profile-model-browser.v1",
      "kfc-profile-model-browser.v2",
      "kfc-profile-model-browser.balance.v1",
    ]),
    status: z.literal("passed"),
    capturedAt: z.iso.datetime(),
    profile: z.enum(["mage", "balance_druid"]),
    sourceRelease: releaseId,
    release: releaseId,
    proofSha256: digest,
    checked: z
      .object({
        allPresets: z.literal(true),
        reviewedShares: z.literal(true),
        firstVisitDefault: z.literal(true),
        savedCharacterPreserved: z.literal(true),
        provisionalConsentOff: z.literal(true),
        nativeBrowserParity: z.literal(true),
        desktopMobile: z.literal(true),
        itemSkillsIgnored: z.literal(true),
        assetIntegrity: z.literal(true),
        otherProfilesPreserved: z.literal(true),
        greaterMageblood20: z.literal(true),
        configAndGearSets: z.literal(true),
        rotationGuide: z.literal(true),
      })
      .strict(),
    evidence: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()).length(0),
  })
  .strict();
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  maximumBytes: number,
): Promise<{ value: unknown; sha256: string }> {
  requireMatch(
    !path.includes("\\") &&
      !path.includes("\0") &&
      !path.split("/").includes("..") &&
      !isAbsolute(path),
    "Invalid profile-model evidence path",
  );
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Profile-model evidence escaped storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= maximumBytes, "Invalid profile-model evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= maximumBytes, "Profile-model evidence exceeded read limit");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
async function proofFor(
  manifest: SimulatorManifest,
  directory: string,
): Promise<z.infer<typeof proofSchema>> {
  const raw = await document(directory, manifest.release + "/kfc-reviewed-presets.json", 2_000_000);
  requireMatch(
    raw.sha256 === manifest.files["kfc-reviewed-presets.json"]?.sha256,
    "Profile-model proof checksum changed",
  );
  const proof = proofSchema.parse(raw.value);
  requireMatch(
    proof.release === manifest.release && proof.identity.slice(0, 24) === manifest.release,
    "Profile-model release changed",
  );
  return proof;
}
export async function validateSimulatorProfileModelBuilds(
  profile: string,
  manifest: SimulatorManifest,
  builds: readonly {
    readonly id: string;
    readonly href: string;
    readonly referenceDps: number;
    readonly validationIterations: number;
  }[],
  directory: string,
): Promise<boolean> {
  if (profile !== "mage" && profile !== "balance_druid") return false;
  const raw = await document(directory, manifest.release + "/kfc-reviewed-presets.json", 2_000_000);
  if (
    ![
      "kfc-simulator-profile-model-update.v1",
      "kfc-simulator-profile-model-update.v2",
      "kfc-simulator-profile-model-update.balance.v1",
    ].includes(z.object({ schema: z.string() }).parse(raw.value).schema)
  )
    return false;
  const proof = await proofFor(manifest, directory);
  requireMatch(proof.profile === profile, "Profile publication used another class's proof");
  requireMatch(builds.length === proof.builds.length, "Profile publication omitted/added a build");
  for (const build of builds) {
    const measured = proof.builds.find((entry) => entry.id === build.id);
    requireMatch(
      measured &&
        measured.referenceDps === build.referenceDps &&
        measured.validationIterations === build.validationIterations &&
        measured.hrefSha256 === createHash("sha256").update(build.href).digest("hex"),
      "Profile build does not match measured settings/share/DPS",
    );
  }
  return true;
}
export async function readSimulatorProfileModelUpdate(
  profile: string,
  directory: string,
): Promise<{ readonly manifest: SimulatorManifest; readonly sourceRelease: string } | null> {
  // Validate only the requested pointer so another class's unavailable update stays isolated.
  if (profile !== "mage" && profile !== "balance_druid") return null;
  let raw: Awaited<ReturnType<typeof document>>;
  try {
    raw = await document(directory, "profile-model-updates.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const rawPointer = selectionSchema.parse(raw.value).profiles[profile];
  if (rawPointer === undefined) return null;
  const pointer = profilePointerSchema.parse(rawPointer);
  const source = await readSimulatorManifest(directory, pointer.sourceRelease),
    candidate = await readSimulatorManifest(directory, pointer.release);
  requireMatch(
    source && candidate && source.pages.includes(profile) && candidate.pages.includes(profile),
    "Missing profile-model engine/page",
  );
  const proof = await proofFor(candidate, directory),
    sourceDocument = await document(directory, pointer.sourceRelease + "/manifest.json", 8_000_000);
  requireMatch(proof.profile === profile, "Profile engine used another class's proof");
  requireMatch(
    pointer.proofSha256 === candidate.files["kfc-reviewed-presets.json"]?.sha256 &&
      proof.sourceRelease === source.release &&
      hash(sourceDocument.value) === proof.sourceManifestSha256,
    "Profile numerical provenance changed",
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
      "Profile presentation changed undeclared model scope: " + key,
    );
  const keys = Object.keys(source.files)
    .filter((name) => /wasm|worker|^assets\/database\//.test(name))
    .sort();
  requireMatch(
    hash(keys) === hash(Object.keys(proof.modelAssets).sort()) &&
      hash(keys) ===
        hash(
          Object.keys(candidate.files)
            .filter((name) => /wasm|worker|^assets\/database\//.test(name))
            .sort(),
        ),
    "Profile model has incomplete numerical assets",
  );
  for (const name of [
    "lib.wasm",
    "sim_worker.js",
    "assets/database/db.json",
    "assets/database/db.bin",
    "assets/database/leftover_db.json",
    "assets/database/leftover_db.bin",
  ])
    requireMatch(keys.includes(name), "Profile model missing required numerical asset");
  for (const name of keys)
    requireMatch(
      hash(source.files[name]) === hash(candidate.files[name]) &&
        hash(source.files[name]) === hash(proof.modelAssets[name]),
      "Profile presentation rebuilt numerical assets",
    );
  const policy = await document(
    directory,
    source.release + "/kfc-item-weapon-skills.json",
    1_000_000,
  );
  requireMatch(
    policy.sha256 === proof.policySha256 &&
      candidate.files["kfc-item-weapon-skills.json"]?.sha256 === policy.sha256 &&
      hash(policy.value) === hash(source.itemWeaponSkillPolicy),
    "Profile item-skill policy changed",
  );
  z.object({
    schema: z.literal("kfc-item-weapon-skills.v1"),
    mode: z.literal("ignore-item-bonuses"),
    basis: z.literal("owner-directed-model-assumption"),
  })
    .passthrough()
    .parse(policy.value);
  requireMatch(
    new Set(proof.presets.map((row) => row.profile + "/" + row.variant)).size === 28,
    "Profile starter audit missing/duplicate",
  );
  for (const entry of proof.builds) {
    const options = {
      sourceRelease: source.release,
      revision: source.revision,
      databaseSha256: proof.databaseSha256,
      reference: async (rawReference: FrostModelEvidenceReference): Promise<unknown> => {
        const ref = frostModelEvidenceReferenceSchema.parse(rawReference),
          path = ref.path.replace(/^artifacts\/forever-simulator\//, "");
        // Larger allowances apply only to these already-replayed immutable study results.
        const limit =
            path ===
            "optimization/bounded-native-studies/1b8cd38af0234f6f815c773f0007c59a7de6b3421046077b4c6ad09e1401c27d/result-56e2f089fa20f3f3.json"
              ? 16_000_000
              : path ===
                  "optimization/bounded-native-studies/5d9d1732dd471c3053701b59f7ba0c165a82f2af3729893a372c440b921454a0/result-b660b911c5437803.json"
                ? 48_000_000
                : path ===
                    "optimization/bounded-native-studies/0633bfe09207ed3589eb2b4861a7ba47f498d170f8c8dce3a860cf78f59ded56/result-a4a5d7bbcaae2034.json"
                  ? 16_000_000
                  : path ===
                      "optimization/bounded-native-studies/aed586fd81fa3d1586fa898d07d573d8848a9cbe982ff05ee925090aceac760d/result-049dcd0fd6f6f58b.json"
                    ? 32_000_000
                    : path ===
                        "optimization/bounded-native-studies/d752a04ead822dc7511ca82909e24a96fe6df07fa7ecd9c0c0eeb20e5f597dba/result-1427f90944b15ba2.json"
                      ? 16_000_000
                      : 8_000_000,
          value = await document(directory, path, limit);
        if (ref.byteSha256)
          requireMatch(ref.byteSha256 === value.sha256, "Profile source byte checksum changed");
        return value.value;
      },
    };
    const build =
      entry.id === "mage-frost-static"
        ? await readFreshFrostSimulatorBuild(entry, options)
        : entry.id === "mage-fire-static"
          ? await readFreshFireSimulatorBuild(entry, options)
          : await readFreshGreaterBalanceSimulatorBuild(entry, options);
    const player = z.record(z.string(), z.unknown()).parse(build.settings.player);
    requireMatch(
      proof.presets.some(
        (row) =>
          row.profile === build.profile &&
          row.variant === build.variant &&
          row.gearSha256 === hash(player.equipment),
      ),
      "Profile audit changed measured gear",
    );
  }
  requireMatch(
    pointer.browserReview.path ===
      `optimization/reviews/profile-model-browser-${pointer.browserReview.sha256.slice(0, 16)}.json`,
    "Unexpected profile browser review path",
  );
  const browserDocument = await document(directory, pointer.browserReview.path, 2_000_000);
  requireMatch(
    hash(browserDocument.value) === pointer.browserReview.sha256,
    "Profile browser approval checksum changed",
  );
  const browser = browserSchema.parse(browserDocument.value);
  requireMatch(
    browser.release === candidate.release &&
      browser.profile === profile &&
      browser.sourceRelease === source.release &&
      browser.proofSha256 === pointer.proofSha256 &&
      browser.schema ===
        (proof.schema === "kfc-simulator-profile-model-update.balance.v1"
          ? "kfc-profile-model-browser.balance.v1"
          : proof.schema === "kfc-simulator-profile-model-update.v1"
            ? "kfc-profile-model-browser.v1"
            : "kfc-profile-model-browser.v2"),
    "Profile browser approval belongs to another build",
  );
  const evidence = z
    .object({
      parityChecks: z
        .array(
          z
            .object({
              id: z.enum(["mage-frost-static", "mage-fire-static", "balance-static"]),
              iterations: z.literal(25),
              nativeDps: z.number().finite().positive(),
              browserDps: z.number().finite().positive(),
            })
            .passthrough(),
        )
        .min(1)
        .max(2),
      shares: z
        .array(
          z
            .object({
              id: z.enum(["mage-frost-static", "mage-fire-static", "balance-static"]),
              viewport: z.object({ width: z.number().int().positive() }).passthrough(),
              fullMeasuredSettingsPreserved: z.literal(true),
            })
            .passthrough(),
        )
        .min(2)
        .max(8),
      otherProfiles: z
        .array(
          z
            .object({
              profile: z.string(),
              sourceRelease: z.string(),
              presentationRelease: z.string(),
              unchanged: z.literal(true),
            })
            .strict(),
        )
        .min(1)
        .max(24),
    })
    .passthrough()
    .parse(browser.evidence);
  requireMatch(
    evidence.parityChecks.length === proof.builds.length &&
      new Set(evidence.parityChecks.map((row): string => row.id)).size === proof.builds.length &&
      evidence.parityChecks.every((row) => Math.abs(row.nativeDps - row.browserDps) <= 0.011) &&
      proof.builds.every(
        (build): boolean =>
          evidence.parityChecks.some((row): boolean => row.id === build.id) &&
          [1440, 390].every((width): boolean =>
            evidence.shares.some(
              (row): boolean => row.id === build.id && row.viewport.width === width,
            ),
          ),
      ),
    "Profile browser approval omitted parity/desktop/mobile share import",
  );
  const expectedOtherProfiles =
    profile === "mage"
      ? ["warrior", "rogue", "hunter", "balance_druid", "feral_druid"]
      : ["warrior", "rogue", "hunter", "feral_druid", "mage"];
  requireMatch(
    expectedOtherProfiles.every((profile) =>
      evidence.otherProfiles.some((row) => row.profile === profile),
    ),
    "Profile browser approval omitted existing class regression checks",
  );
  return { manifest: candidate, sourceRelease: source.release };
}
