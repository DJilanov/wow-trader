import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { cache } from "react";
import type { SimulatorManifest } from "@wow-trader/forever-data/simulator";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  release = z.string().regex(/^[a-f0-9]{24}$/);
export const tankSimulatorProfileSchema = z.enum([
  "tank_warrior",
  "feral_tank_druid",
  "protection_paladin",
]);
const reference = z.object({ path: z.string().min(1).max(200), sha256: digest }).strict();
const selectedProfile = z
  .object({ release, proofSha256: digest, browserReview: reference })
  .strict();
const selection = z
  .object({
    schema: z.literal("kfc-optimized-tank-selection.v1"),
    sourceRelease: release,
    engine: digest,
    profiles: z
      .object({
        tank_warrior: selectedProfile,
        feral_tank_druid: selectedProfile,
        protection_paladin: selectedProfile,
      })
      .strict(),
  })
  .strict();
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const validation = z
  .object({
    iterations: z.literal(40000),
    health: z.number().finite().positive(),
    armor: z.number().finite().positive(),
    metrics: z.object({ dps: metric, threat: metric, dtps: metric }).strict(),
  })
  .strict();
const caseReference = z
  .object({
    fingerprint: digest,
    report: digest,
    replay: digest,
    imports: digest,
    measurements: digest,
  })
  .strict();
const settingsSchema = z
  .object({
    player: z
      .object({
        equipment: z
          .object({
            items: z
              .array(
                z
                  .object({
                    id: z.number().int().nonnegative().optional(),
                    enchant: z.number().int().nonnegative().optional(),
                  })
                  .passthrough(),
              )
              .length(17),
          })
          .passthrough(),
        race: z.string().regex(/^Race[A-Za-z]+$/),
        talentsString: z.string(),
        profession1: z.string().min(1),
        profession2: z.string().min(1),
      })
      .passthrough(),
    settings: z
      .object({
        iterations: z.literal(5000),
        fixedRngSeed: z.literal("81491001"),
        ruleset: z.literal("RulesetForever"),
      })
      .passthrough(),
    encounter: z
      .object({
        duration: z.union([z.literal(60), z.literal(300)]),
        targets: z.array(z.record(z.string(), z.unknown())).min(1).max(3),
      })
      .passthrough(),
  })
  .passthrough();
// Recorded settings are content-addressed before parsing; retain their original key order.
const recordedSettingsSchema = z.custom<z.infer<typeof settingsSchema>>(
  (value: unknown): boolean => settingsSchema.safeParse(value).success,
);
const buildSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]+$/),
    profile: tankSimulatorProfileSchema,
    scenario: z.enum(["raid", "solo"]),
    objective: z.enum(["threat", "mitigation"]),
    label: z.string().min(1).max(180),
    href: z.string().min(100).max(200000),
    settings: recordedSettingsSchema,
    settingsSha256: digest,
    requiresProvisionalEnchantOptIn: z.boolean(),
    validation,
    reference: validation,
    sourceFingerprint: digest,
    sourceMeasurementsSha256: digest,
    measuredAt: z.iso.datetime(),
    threatBreakdown: z
      .array(
        z
          .object({
            key: z.string().regex(/^(spell|item|other):[A-Za-z0-9]+$/),
            name: z.string().min(1).max(300),
            damagePerSecond: z.number().finite().nonnegative(),
            threatPerSecond: z.number().finite(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    gear: z
      .array(
        z
          .object({
            slot: z.number().int().min(0).max(16),
            id: z.number().int().nonnegative(),
            name: z.string().min(1).max(300).optional(),
          })
          .passthrough(),
      )
      .length(17),
    warnings: z.array(z.string().min(1).max(4000)).max(20),
  })
  .passthrough();
const proofSchema = z
  .object({
    schema: z.literal("kfc-optimized-tank-profile.v1"),
    status: z.literal("staged-awaiting-default-and-preset-review"),
    release,
    profile: tankSimulatorProfileSchema,
    sourceRelease: release,
    researchRelease: release,
    sourceManifestSha256: digest,
    engine: digest,
    nativeBinarySha256: digest,
    wasmSha256: digest,
    databaseSha256: digest,
    inputs: z
      .object({
        parent: digest,
        researchReview: digest,
        engine: digest,
        profile: tankSimulatorProfileSchema,
        cases: z.array(caseReference).length(4),
        payload: digest,
        library: digest,
        compiled: digest,
        styles: digest,
        entryAdapter: digest,
        controller: digest,
      })
      .strict(),
    defaultBuildId: z.string().min(1).max(120),
    cases: z.array(caseReference).length(4),
    builds: z.array(buildSchema).min(4).max(8),
    notice: z.string().min(1).max(4000),
  })
  .strict();
const measurementSchema = z
  .object({
    schema: z.literal("kfc-optimized-tank-measurements.v1"),
    status: z.literal("passed"),
    fingerprint: digest,
    release,
    engine: digest,
    nativeBinarySha256: digest,
    wasmSha256: digest,
    databaseSha256: digest,
    builds: z
      .array(
        buildSchema
          .pick({
            id: true,
            profile: true,
            scenario: true,
            objective: true,
            requiresProvisionalEnchantOptIn: true,
            validation: true,
            gear: true,
            threatBreakdown: true,
          })
          .extend({ settings: z.record(z.string(), z.unknown()) })
          .passthrough(),
      )
      .length(2),
  })
  .passthrough();
const payloadSchema = z
  .object({
    schema: z.literal("kfc-tank-native-library.v1"),
    profile: tankSimulatorProfileSchema,
    defaultBuildId: z.string(),
    builds: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string(),
            scenario: z.enum(["raid", "solo"]),
            objective: z.enum(["threat", "mitigation"]),
            requiresProvisionalEnchantOptIn: z.boolean(),
            warnings: z.array(z.string()),
            reference: validation,
            proto: z
              .object({
                player: z
                  .object({
                    class: z.number().int().positive(),
                    level: z.literal(60),
                    foreverTier1Bonuses: z.literal(false),
                    equipment: z
                      .object({
                        items: z
                          .array(
                            z
                              .object({
                                id: z.number().int().nonnegative(),
                                enchant: z.number().int().nonnegative(),
                              })
                              .passthrough(),
                          )
                          .length(17),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
                settings: z
                  .object({
                    iterations: z.literal(5000),
                    fixedRngSeed: z.literal("81491001"),
                    ruleset: z.literal(1),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .strict(),
      )
      .min(4)
      .max(8),
  })
  .strict();
const browserReviewSchema = z
  .object({
    schema: z.literal("kfc-optimized-tank-browser-review.v1"),
    status: z.literal("passed"),
    profile: tankSimulatorProfileSchema,
    release,
    proofSha256: digest,
    engine: digest,
    wasmSha256: digest,
    checked: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("preset"),
              build: z.string(),
              width: z.union([z.literal(1440), z.literal(390)]),
              metrics: z
                .object({
                  dps: z.number().finite().positive(),
                  threat: z.number().finite().positive(),
                  dtps: z.number().finite().positive(),
                })
                .strict(),
              requestSha256: digest,
              iterations: z.literal(100),
              consentExplicit: z.boolean(),
            })
            .strict(),
          z
            .object({
              kind: z.literal("preservation"),
              width: z.union([z.literal(1440), z.literal(390)]),
              defaultReady: z.literal(true),
              customGearSurvivesReload: z.literal(true),
              explicitImportWins: z.literal(true),
              noLegacyPresetCopy: z.literal(true),
            })
            .strict(),
        ]),
      )
      .min(10)
      .max(18),
    gates: z
      .object({
        freshDefault: z.literal(true),
        everyPreset: z.literal(true),
        exactCombatRequest: z.literal(true),
        browserNativeParity: z.literal(true),
        customCharacterPreserved: z.literal(true),
        explicitImportPreserved: z.literal(true),
        provisionalConsentOff: z.literal(true),
        desktopMobile: z.literal(true),
        noLegacyPresetCopy: z.literal(true),
      })
      .strict(),
    sourceSha256: digest,
    verifiedAt: z.iso.datetime(),
    pointerWrites: z.literal(0),
  })
  .strict();

export type OptimizedTankBuild = z.infer<typeof buildSchema>;
export interface TankSimulatorModelUpdate {
  readonly manifest: SimulatorManifest;
  readonly sourceRelease: string;
  readonly selectionSha256: string;
  readonly proofSha256: string;
  readonly proof: z.infer<typeof proofSchema>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: boolean, message: string): asserts value {
  if (!value) throw new Error(message);
}
async function document(
  directory: string,
  path: string,
  limit: number,
): Promise<{ value: unknown; sha256: string }> {
  const root = await realpath(directory),
    target = await realpath(resolve(root, path)),
    offset = relative(root, target);
  requireMatch(
    Boolean(offset) && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Tank model evidence escaped simulator storage",
  );
  const info = await stat(target);
  requireMatch(info.isFile() && info.size <= limit, "Invalid tank model evidence size");
  const bytes = await readFile(target);
  requireMatch(bytes.length <= limit, "Tank model evidence exceeded read budget");
  return {
    value: JSON.parse(bytes.toString("utf8")) as unknown,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readTankSimulatorModelUpdate(
  profile: string,
  directory: string = simulatorDirectory(),
): Promise<TankSimulatorModelUpdate | null> {
  return readVerifiedTankModelUpdate(profile, directory);
}

// Presentation, preset safety and rankings share verification within one render.
const readVerifiedTankModelUpdate = cache(async function readVerifiedTankModelUpdate(
  profile: string,
  directory: string,
): Promise<TankSimulatorModelUpdate | null> {
  const parsedProfile = tankSimulatorProfileSchema.safeParse(profile);
  if (!parsedProfile.success) return null;
  let raw: Awaited<ReturnType<typeof document>>;
  try {
    raw = await document(directory, "tank-model-updates.json", 32000);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const pointer = selection.parse(raw.value),
    selected = pointer.profiles[parsedProfile.data];
  const manifest = await readSimulatorManifest(directory, selected.release),
    source = await readSimulatorManifest(directory, pointer.sourceRelease);
  requireMatch(
    manifest !== null && source !== null,
    "Missing optimized tank model or numerical source",
  );
  const proofDocument = await document(
      directory,
      `${selected.release}/kfc-optimized-tank-profile.json`,
      4_000_000,
    ),
    proof = proofSchema.parse(proofDocument.value);
  const rawProof = z.record(z.string(), z.unknown()).parse(proofDocument.value);
  requireMatch(
    proofDocument.sha256 === selected.proofSha256 &&
      manifest.files["kfc-optimized-tank-profile.json"]?.sha256 === selected.proofSha256,
    "Tank model proof checksum changed",
  );
  requireMatch(
    proof.profile === profile &&
      proof.release === selected.release &&
      proof.sourceRelease === source.release &&
      proof.engine === pointer.engine &&
      proof.inputs.engine === proof.engine &&
      proof.inputs.profile === profile &&
      hash(rawProof.inputs).slice(0, 24) === proof.release,
    "Tank model identity or scope changed",
  );
  requireMatch(
    hash(proof.cases) === hash(proof.inputs.cases) &&
      new Set(proof.cases.map((entry): string => entry.fingerprint)).size === 4,
    "Tank model omitted or duplicated a search case",
  );
  const researchDocument = await document(
      directory,
      `${proof.researchRelease}/manifest.json`,
      8_000_000,
    ),
    research = await readSimulatorManifest(directory, proof.researchRelease);
  requireMatch(
    research !== null &&
      hash(researchDocument.value) === proof.sourceManifestSha256 &&
      proof.inputs.parent === proof.sourceManifestSha256,
    "Tank research parent changed",
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
  ] as const)
    requireMatch(
      JSON.stringify(source[key]) === JSON.stringify(manifest[key]),
      "Tank update changed unreviewed catalog metadata",
    );
  for (const name of [
    "assets/database/db.json",
    "assets/database/db.bin",
    "assets/database/leftover_db.json",
    "assets/database/leftover_db.bin",
    "sim_worker.js",
  ])
    requireMatch(
      hash(source.files[name]) === hash(manifest.files[name]) &&
        hash(research.files[name]) === hash(manifest.files[name]),
      "Tank update changed unreviewed combat data",
    );
  requireMatch(
    manifest.files["lib.wasm"]?.sha256 === proof.wasmSha256 &&
      research.files["lib.wasm"]?.sha256 === proof.wasmSha256 &&
      manifest.files["assets/database/db.json"]?.sha256 === proof.databaseSha256 &&
      manifest.files["kfc-tank-native-library.js"]?.sha256 === proof.inputs.compiled &&
      manifest.files["kfc-tank-workspace.css"]?.sha256 === proof.inputs.styles,
    "Tank numerical or preset assets changed",
  );
  const payloadDocument = await document(
    directory,
    `${selected.release}/kfc-tank-native-builds.json`,
    2_000_000,
  );
  requireMatch(
    payloadDocument.sha256 === manifest.files["kfc-tank-native-builds.json"]?.sha256 &&
      hash(payloadDocument.value) === proof.inputs.payload,
    "Tank native build library changed",
  );
  const payload = payloadSchema.parse(payloadDocument.value);
  requireMatch(
    payload.profile === profile &&
      payload.defaultBuildId === proof.defaultBuildId &&
      hash(payload.builds.map((build): string => build.id)) ===
        hash(proof.builds.map((build): string => build.id)),
    "Native tank library and public builds disagree",
  );
  const measurements = new Map<string, z.infer<typeof measurementSchema>>();
  for (const entry of proof.cases) {
    const name = `tank-measurements/${entry.fingerprint}.json`,
      sourceDocument = await document(directory, `${manifest.release}/${name}`, 4_000_000),
      measured = measurementSchema.parse(sourceDocument.value);
    requireMatch(
      sourceDocument.sha256 === manifest.files[name]?.sha256 &&
        hash(sourceDocument.value) === entry.measurements &&
        measured.fingerprint === entry.fingerprint &&
        measured.engine === proof.engine &&
        measured.release === proof.researchRelease &&
        measured.nativeBinarySha256 === proof.nativeBinarySha256 &&
        measured.wasmSha256 === proof.wasmSha256 &&
        measured.databaseSha256 === proof.databaseSha256,
      "Tank source measurements changed",
    );
    measurements.set(entry.fingerprint, measured);
  }
  requireMatch(
    new Set(proof.builds.map((build): string => build.id)).size === proof.builds.length,
    "Duplicate optimized tank build",
  );
  for (const scenario of ["raid", "solo"] as const)
    for (const objective of ["threat", "mitigation"] as const)
      requireMatch(
        proof.builds.filter(
          (build): boolean =>
            build.scenario === scenario &&
            build.objective === objective &&
            !build.requiresProvisionalEnchantOptIn,
        ).length === 1,
        "Missing conservative optimized tank setup",
      );
  const initial = proof.builds.find((build): boolean => build.id === proof.defaultBuildId);
  requireMatch(
    initial !== undefined &&
      initial.scenario === "raid" &&
      initial.objective === "mitigation" &&
      !initial.requiresProvisionalEnchantOptIn,
    "Tank default requires consent or is not the qualified mitigation setup",
  );
  for (const build of proof.builds) {
    const url = new URL(build.href, "https://helper.invalid");
    requireMatch(
      build.profile === profile &&
        url.origin === "https://helper.invalid" &&
        url.pathname === `/forever-sim/${manifest.release}/${profile}/` &&
        url.search === "?i=gtrcmxeu" &&
        /^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash) &&
        build.href === url.pathname + url.search + url.hash,
      "Invalid optimized tank import",
    );
    requireMatch(
      hash(build.settings) === build.settingsSha256 &&
        hash(build.reference) === hash(build.validation),
      "Tank build settings or metrics changed",
    );
    requireMatch(
      proof.cases.some(
        (entry): boolean =>
          entry.fingerprint === build.sourceFingerprint &&
          entry.measurements === build.sourceMeasurementsSha256,
      ),
      "Tank build has no qualified source measurement",
    );
    const nativeBuild = payload.builds.find((entry): boolean => entry.id === build.id),
      measuredBuild = measurements
        .get(build.sourceFingerprint)
        ?.builds.find((entry): boolean => entry.id === build.id);
    requireMatch(
      nativeBuild !== undefined &&
        measuredBuild !== undefined &&
        measuredBuild.profile === profile &&
        measuredBuild.scenario === build.scenario &&
        measuredBuild.objective === build.objective &&
        measuredBuild.requiresProvisionalEnchantOptIn === build.requiresProvisionalEnchantOptIn,
      "Tank build source or native preset scope changed",
    );
    requireMatch(
      nativeBuild.label === build.label &&
        nativeBuild.scenario === build.scenario &&
        nativeBuild.objective === build.objective &&
        nativeBuild.requiresProvisionalEnchantOptIn === build.requiresProvisionalEnchantOptIn &&
        hash(nativeBuild.reference) === hash(build.reference) &&
        hash(nativeBuild.warnings) === hash(build.warnings),
      "Tank native preset disagrees with its public reference",
    );
    requireMatch(
      nativeBuild.proto.player.class ===
        { tank_warrior: 9, feral_tank_druid: 1, protection_paladin: 4 }[proof.profile] &&
        nativeBuild.proto.player.equipment.items.every(
          (item, slot): boolean =>
            item.id === (build.settings.player.equipment.items[slot]?.id ?? 0) &&
            item.enchant === (build.settings.player.equipment.items[slot]?.enchant ?? 0),
        ),
      "Tank native preset has different equipment",
    );
    const measuredSettings = structuredClone(measuredBuild.settings);
    measuredSettings.settings = {
      ...z.record(z.string(), z.unknown()).parse(measuredSettings.settings),
      iterations: 5000,
      fixedRngSeed: "81491001",
    };
    requireMatch(
      hash(measuredSettings) === hash(build.settings) &&
        hash(measuredBuild.validation) === hash(build.reference) &&
        hash(measuredBuild.gear) === hash(build.gear) &&
        hash(measuredBuild.threatBreakdown) === hash(build.threatBreakdown),
      "Tank publication differs from the measured build",
    );
    requireMatch(
      build.settings.encounter.duration === (build.scenario === "raid" ? 300 : 60) &&
        build.settings.encounter.targets.length === (build.scenario === "raid" ? 1 : 3),
      "Tank build has the wrong encounter",
    );
    requireMatch(
      build.gear.every(
        (item, slot): boolean =>
          item.slot === slot && item.id === (build.settings.player.equipment.items[slot]?.id ?? 0),
      ),
      "Tank gear details differ from the exact import",
    );
    for (const [field, name] of [
      ["damagePerSecond", "dps"],
      ["threatPerSecond", "threat"],
    ] as const)
      requireMatch(
        Math.abs(
          build.threatBreakdown.reduce((sum, row): number => sum + row[field], 0) -
            build.reference.metrics[name].avg,
        ) < 0.000001,
        "Optimized tank action counters do not reconcile",
      );
  }
  requireMatch(
    selected.browserReview.path === `tank-browser-reviews/${selected.release}.json`,
    "Invalid tank browser review path",
  );
  const browserDocument = await document(directory, selected.browserReview.path, 2_000_000),
    browser = browserReviewSchema.parse(browserDocument.value);
  requireMatch(
    hash(browserDocument.value) === selected.browserReview.sha256 &&
      browser.profile === profile &&
      browser.release === manifest.release &&
      browser.proofSha256 === selected.proofSha256 &&
      browser.engine === proof.engine &&
      browser.wasmSha256 === proof.wasmSha256,
    "Tank browser approval changed",
  );
  requireMatch(
    browser.checked.length === 2 * (proof.builds.length + 1),
    "Incomplete tank browser review",
  );
  for (const width of [1440, 390]) {
    for (const build of proof.builds)
      requireMatch(
        browser.checked.filter(
          (row): boolean =>
            row.kind === "preset" &&
            row.width === width &&
            row.build === build.id &&
            row.consentExplicit === build.requiresProvisionalEnchantOptIn,
        ).length === 1,
        "Missing or duplicated tank preset browser check",
      );
    requireMatch(
      browser.checked.filter((row): boolean => row.kind === "preservation" && row.width === width)
        .length === 1,
      "Missing tank saved-character browser check",
    );
  }
  return {
    manifest,
    sourceRelease: proof.sourceRelease,
    selectionSha256: hash(raw.value),
    proofSha256: selected.proofSha256,
    proof,
  };
});
