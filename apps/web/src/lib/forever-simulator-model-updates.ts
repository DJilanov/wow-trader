import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";
import {
  readSimulatorModelFirstPassBuild,
  simulatorModelFirstPassEntrySchema,
} from "./forever-simulator-model-first-pass";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^[a-f0-9]{24}$/);
const reference = z.object({ path: z.string().min(1).max(240), sha256: digest }).strict();
const asset = z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict();
const buildId = z.enum([
  "arms-alliance",
  "arms-alliance-procs",
  "fury-horde",
  "fury-horde-procs",
  "two-hand-fury-static",
  "rogue-combat-static",
  "rogue-mutilate-static",
  "rogue-subtlety-static",
  "hunter-beast-mastery-static",
]);
const selectionSchema = z
  .object({
    schema: z.literal("kfc-simulator-model-update-selection.v1"),
    sourceRelease: releaseId,
    release: releaseId,
    proofSha256: digest,
    browserReview: reference,
  })
  .strict();
const proofSchema = z
  .object({
    schema: z.literal("kfc-simulator-item-skill-update.v1"),
    sourceRelease: releaseId,
    release: releaseId,
    previousRelease: releaseId,
    previousManifestSha256: digest,
    sourceManifestSha256: digest,
    nativeBinarySha256: digest,
    databaseSha256: digest,
    policySha256: digest,
    parentSafety: z.object({ release: releaseId, reportSha256: digest }).strict(),
    typecheckDiagnostics: z.literal(0),
    modelAssets: z.record(z.string(), asset),
    virtualSourceFiles: z
      .array(z.object({ path: z.string().min(1).max(240), sha256: digest }).strict())
      .min(1)
      .max(160),
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
    builds: z
      .array(
        z
          .object({
            id: buildId,
            profile: z.enum(["warrior", "rogue", "hunter"]),
            correction: reference,
            settingsSha256: digest,
            hrefSha256: digest,
            referenceDps: z.number().finite().positive(),
            validationIterations: z.literal(40000),
          })
          .strict(),
      )
      .length(9),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const proofWithBuildsSchema = proofSchema
  .extend({
    schema: z.literal("kfc-simulator-model-update-with-builds.v1"),
    firstPassBuilds: z.array(simulatorModelFirstPassEntrySchema).min(1).max(24),
  })
  .strict();
const approvedProofSchema = z.discriminatedUnion("schema", [proofSchema, proofWithBuildsSchema]);
const metricSchema = z
  .object({
    id: digest,
    dps: z.number().finite().positive(),
    stdev: z.number().finite().nonnegative(),
    iterations: z.literal(20000),
  })
  .passthrough();
const correctionSchema = z
  .object({
    schema: z.literal("kfc-item-skill-correction-result.v1"),
    id: buildId,
    profile: z.enum(["warrior", "rogue", "hunter"]),
    release: releaseId,
    nativeBinarySha256: digest,
    databaseSha256: digest,
    settings: z.record(z.string(), z.unknown()),
    requestBase64: z.string().min(20).max(512_000),
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
    verdict: z.object({ selected: z.enum(["incumbent", "candidate"]) }).passthrough(),
    confirmation: z
      .array(
        z
          .object({
            seed: z.number().int().positive(),
            incumbent: metricSchema,
            candidate: metricSchema,
          })
          .strict(),
      )
      .length(2),
    browserControl: z
      .object({
        seed: z.literal(819000001),
        iterations: z.literal(25),
        dps: z.number().finite().positive(),
        nativeDps: z.number().finite().positive(),
        historicalDps: z.number().finite().positive(),
      })
      .strict(),
    affected: z.boolean(),
  })
  .passthrough();
export const simulatorModelUpdateBrowserChecks = {
  allPresets: true,
  reviewedShares: true,
  firstVisitDefault: true,
  savedCharacterPreserved: true,
  provisionalConsentOff: true,
  nativeBrowserParity: true,
  desktopMobile: true,
  itemSkillsIgnored: true,
  assetIntegrity: true,
} as const;
const browserSchema = z
  .object({
    schema: z.literal("kfc-item-skill-update-browser.v1"),
    status: z.literal("passed"),
    capturedAt: z.iso.datetime(),
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
      })
      .strict(),
    evidence: z.record(z.string(), z.unknown()),
    errors: z.array(z.string()).length(0),
  })
  .strict();

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  limit: number,
): Promise<{ value: unknown; sha256: string }> {
  const root = await realpath(directory);
  const target = await realpath(resolve(root, path));
  const offset = relative(root, target);
  if (!offset || offset === ".." || offset.startsWith("../") || isAbsolute(offset))
    throw new Error("Model update evidence escaped simulator storage");
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > limit)
    throw new Error("Invalid model update evidence size");
  const bytes = await readFile(target);
  if (bytes.length > limit) throw new Error("Model update evidence exceeded read limit");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export interface SimulatorModelUpdate {
  readonly manifest: SimulatorManifest;
  readonly sourceRelease: string;
}

export async function validateSimulatorModelUpdateBuilds(
  profile: string,
  manifest: SimulatorManifest,
  builds: readonly {
    readonly id: string;
    readonly href: string;
    readonly referenceDps: number;
    readonly validationIterations: number;
  }[],
  directory: string = simulatorDirectory(),
): Promise<void> {
  if (!manifest.files["kfc-item-weapon-skills.json"]) return;
  const raw = await document(directory, `${manifest.release}/kfc-reviewed-presets.json`, 2_000_000);
  const proof = approvedProofSchema.parse(raw.value);
  const expected = [
    ...proof.builds,
    ...(proof.schema === "kfc-simulator-model-update-with-builds.v1" ? proof.firstPassBuilds : []),
  ].filter((build) => build.profile === profile);
  requireMatch(expected.length === builds.length, "Corrected publication omitted a reviewed build");
  for (const build of builds) {
    const measured = expected.find((entry) => entry.id === build.id);
    requireMatch(
      measured !== undefined &&
        measured.referenceDps === build.referenceDps &&
        measured.validationIterations === build.validationIterations &&
        measured.hrefSha256 === createHash("sha256").update(build.href).digest("hex"),
      "Published build does not match its corrected evidence",
    );
  }
}

export async function readSimulatorModelUpdate(
  profile: string,
  directory: string = simulatorDirectory(),
): Promise<SimulatorModelUpdate | null> {
  let raw: Awaited<ReturnType<typeof document>>;
  try {
    raw = await document(directory, "model-update.json", 32_000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const pointer = selectionSchema.parse(raw.value);
  const sourceDocument = await document(
    directory,
    `${pointer.sourceRelease}/manifest.json`,
    8_000_000,
  );
  const source = await readSimulatorManifest(directory, pointer.sourceRelease);
  const candidate = await readSimulatorManifest(directory, pointer.release);
  requireMatch(
    source !== null && candidate !== null && candidate.pages.includes(profile),
    "Missing model-update engine or profile",
  );
  const proofDocument = await document(
    directory,
    `${pointer.release}/kfc-reviewed-presets.json`,
    2_000_000,
  );
  requireMatch(
    proofDocument.sha256 === pointer.proofSha256 &&
      candidate.files["kfc-reviewed-presets.json"]?.sha256 === pointer.proofSha256,
    "Model-update proof checksum changed",
  );
  const proof = approvedProofSchema.parse(proofDocument.value);
  requireMatch(
    proof.release === candidate.release &&
      proof.sourceRelease === source.release &&
      proof.sourceManifestSha256 === hash(sourceDocument.value),
    "Model-update numerical provenance changed",
  );
  const activeDocument = await document(directory, "active.json", 8_000_000);
  const active = await readSimulatorManifest(directory);
  requireMatch(
    active !== null &&
      active.release === proof.previousRelease &&
      hash(activeDocument.value) === proof.previousManifestSha256,
    "Model update targets a stale numerical parent",
  );
  for (const name of [
    "revision",
    "itemCount",
    "currentItemCount",
    "provisionalItemCount",
    "excludedModeledItems",
    "pages",
    "dataProvenance",
    "mechanicsStatus",
  ] as const)
    requireMatch(
      JSON.stringify(active[name]) === JSON.stringify(source[name]) &&
        JSON.stringify(source[name]) === JSON.stringify(candidate[name]),
      "Model update changed undeclared catalog scope",
    );
  const modelKeys = Object.keys(source.files)
    .filter((name) => /wasm|worker|^assets\/database\//.test(name))
    .sort();
  requireMatch(
    JSON.stringify(modelKeys) === JSON.stringify(Object.keys(proof.modelAssets).sort()) &&
      JSON.stringify(modelKeys) ===
        JSON.stringify(
          Object.keys(candidate.files)
            .filter((name) => /wasm|worker|^assets\/database\//.test(name))
            .sort(),
        ),
    "Model update has incomplete numerical assets",
  );
  for (const name of [
    "lib.wasm",
    "sim_worker.js",
    "assets/database/db.json",
    "assets/database/db.bin",
    "assets/database/leftover_db.json",
    "assets/database/leftover_db.bin",
  ])
    requireMatch(modelKeys.includes(name), "Model update is missing a required model asset");
  for (const name of modelKeys)
    requireMatch(
      JSON.stringify(source.files[name]) === JSON.stringify(candidate.files[name]) &&
        JSON.stringify(source.files[name]) === JSON.stringify(proof.modelAssets[name]),
      "Model-update UI/native assets disagree",
    );
  const policy = await document(
    directory,
    `${source.release}/kfc-item-weapon-skills.json`,
    1_000_000,
  );
  requireMatch(
    hash(policy.value) === hash(source.itemWeaponSkillPolicy) &&
      hash(policy.value) === hash(candidate.itemWeaponSkillPolicy),
    "Manifest item-skill policy disagrees with its data record",
  );
  requireMatch(
    policy.sha256 === proof.policySha256 &&
      candidate.files["kfc-item-weapon-skills.json"]?.sha256 === policy.sha256,
    "Item-skill policy checksum changed",
  );
  z.object({
    schema: z.literal("kfc-item-weapon-skills.v1"),
    mode: z.literal("ignore-item-bonuses"),
    basis: z.literal("owner-directed-model-assumption"),
  })
    .passthrough()
    .parse(policy.value);
  const parentSafety = await document(
    directory,
    `${proof.parentSafety.release}/kfc-preset-safety.json`,
    1_000_000,
  );
  requireMatch(
    parentSafety.sha256 === proof.parentSafety.reportSha256,
    "Original non-raid preset safety approval changed",
  );
  const originalSafety = z
    .object({
      schema: z.literal("kfc-simulator-preset-safety.v1"),
      release: releaseId,
      sourceRelease: releaseId,
      typecheckDiagnostics: z.literal(0),
      repairs: z.array(z.unknown()).length(28),
    })
    .passthrough()
    .parse(parentSafety.value);
  requireMatch(
    originalSafety.release === proof.parentSafety.release &&
      originalSafety.sourceRelease === proof.previousRelease,
    "Original non-raid preset safety scope changed",
  );
  requireMatch(
    new Set(proof.virtualSourceFiles.map((file) => file.path)).size ===
      proof.virtualSourceFiles.length &&
      proof.virtualSourceFiles.every(
        (file) =>
          /^ui\/[a-z_]+\/(?:presets\.ts|sim\.ts|gear_sets\/[^/]+\.gear\.json|apls\/[^/]+\.apl\.json)$/.test(
            file.path,
          ) || /^ui\/core\/(?:kfc_[a-z_]+\.(?:json|ts)|individual_sim_ui\.ts)$/.test(file.path),
      ),
    "Invalid model-update virtual source scope",
  );
  requireMatch(
    new Set(proof.presets.map((preset) => `${preset.profile}/${preset.variant}`)).size === 28,
    "Incomplete or duplicate preset audit",
  );
  requireMatch(
    new Set(proof.builds.map((build) => build.id)).size === 9,
    "Incomplete or duplicate corrected builds",
  );
  for (const build of proof.builds) {
    requireMatch(
      build.profile ===
        (build.id.startsWith("rogue-")
          ? "rogue"
          : build.id.startsWith("hunter-")
            ? "hunter"
            : "warrior"),
      "Correction build has the wrong class",
    );
    requireMatch(
      build.correction.path === `optimization/item-skill-revalidation-v1/${build.id}.json`,
      "Unexpected correction evidence path",
    );
    const evidence = await document(directory, build.correction.path, 2_000_000);
    requireMatch(
      hash(evidence.value) === build.correction.sha256,
      "Correction evidence checksum changed",
    );
    const result = correctionSchema.parse(evidence.value);
    requireMatch(
      result.id === build.id &&
        result.profile === build.profile &&
        result.release === source.release &&
        result.nativeBinarySha256 === proof.nativeBinarySha256 &&
        result.databaseSha256 === proof.databaseSha256 &&
        hash(result.settings) === build.settingsSha256 &&
        result.referenceDps === build.referenceDps,
      "Correction result is stale or belongs to another build",
    );
    requireMatch(
      Math.abs(result.browserControl.dps - result.browserControl.nativeDps) <= 0.011 &&
        (result.affected ||
          Math.abs(result.browserControl.historicalDps - result.browserControl.nativeDps) < 1e-9),
      "Native/browser or unchanged-build control failed",
    );
    const player = z.record(z.string(), z.unknown()).parse(result.settings.player);
    const gear = z
      .object({ items: z.array(z.record(z.string(), z.unknown())).length(17) })
      .parse(player.equipment);
    let total = 0;
    for (const [index, row] of result.confirmation.entries()) {
      requireMatch(
        row.seed === [819410001, 819450001][index],
        "Correction lacks independent fresh confirmation ranges",
      );
      const metric = result.verdict.selected === "candidate" ? row.candidate : row.incumbent;
      const request = {
        requestBase64: result.requestBase64,
        gear: gear.items,
        talentsString: player.talentsString,
        rotation: player.rotation,
        iterations: 20000,
        seed: row.seed,
      };
      requireMatch(
        metric.id === hash(request),
        "Corrected DPS does not belong to the selected settings",
      );
      total += metric.dps;
    }
    requireMatch(
      Math.abs(total / 2 - result.referenceDps) < 1e-9,
      "Corrected reference DPS is not its measured average",
    );
  }
  if (proof.schema === "kfc-simulator-model-update-with-builds.v1") {
    const allIds = [...proof.builds, ...proof.firstPassBuilds].map((build) => build.id);
    requireMatch(new Set(allIds).size === allIds.length, "Duplicate model first-pass build");
    for (const entry of proof.firstPassBuilds) {
      const firstPass = await readSimulatorModelFirstPassBuild(entry, {
        sourceRelease: source.release,
        revision: source.revision,
        databaseSha256: proof.databaseSha256,
        reference: async (reference): Promise<unknown> => {
          const path = reference.path.replace(/^artifacts\/forever-simulator\//, "");
          const maximumBytes =
            entry.id === "hunter-survival-static" &&
            /^optimization\/bounded-native-studies\/[a-f0-9]{64}\/result-[a-f0-9]{16}\.json$/.test(
              path,
            )
              ? 16_000_000
              : 8_000_000;
          const value = await document(directory, path, maximumBytes);
          if (reference.byteSha256)
            requireMatch(
              reference.byteSha256 === value.sha256,
              "First-pass evidence byte checksum changed",
            );
          return value.value;
        },
      });
      const player = z.record(z.string(), z.unknown()).parse(firstPass.settings.player);
      requireMatch(
        proof.presets.some(
          (preset) =>
            preset.profile === firstPass.profile &&
            preset.variant === firstPass.variant &&
            preset.gearSha256 === hash(player.equipment),
        ),
        "First-pass preset audit does not match its measured gear",
      );
    }
  }
  requireMatch(
    pointer.browserReview.path ===
      `optimization/reviews/item-skills-browser-${pointer.browserReview.sha256.slice(0, 16)}.json`,
    "Unexpected model-update browser review path",
  );
  const browserDocument = await document(directory, pointer.browserReview.path, 2_000_000);
  requireMatch(
    hash(browserDocument.value) === pointer.browserReview.sha256,
    "Model-update browser review checksum changed",
  );
  const browser = browserSchema.parse(browserDocument.value);
  requireMatch(
    browser.release === candidate.release &&
      browser.sourceRelease === source.release &&
      browser.proofSha256 === pointer.proofSha256,
    "Browser review belongs to a different correction release",
  );
  if (proof.schema === "kfc-simulator-model-update-with-builds.v1") {
    const expected = [...proof.builds, ...proof.firstPassBuilds].map((build) => build.id);
    const parity = z
      .array(
        z
          .object({
            id: z.string(),
            iterations: z.literal(25),
            nativeDps: z.number().positive(),
            browserDps: z.number().positive(),
          })
          .passthrough(),
      )
      .parse(browser.evidence.parityChecks);
    requireMatch(
      parity.length === expected.length &&
        new Set(parity.map((row) => row.id)).size === expected.length &&
        expected.every((id) =>
          parity.some((row) => row.id === id && Math.abs(row.nativeDps - row.browserDps) <= 0.011),
        ),
      "Browser approval omitted or failed a new first-pass delivery",
    );
    const shares = z
      .array(
        z
          .object({
            id: z.string(),
            viewport: z.object({ width: z.number() }).passthrough(),
            fullMeasuredSettingsPreserved: z.literal(true),
          })
          .passthrough(),
      )
      .parse(browser.evidence.shares);
    requireMatch(
      expected.every((id) =>
        [1440, 390].every((width) =>
          shares.some((row) => row.id === id && row.viewport.width === width),
        ),
      ),
      "Desktop/mobile approval omitted a first-pass full build",
    );
  }
  return { manifest: candidate, sourceRelease: source.release };
}
