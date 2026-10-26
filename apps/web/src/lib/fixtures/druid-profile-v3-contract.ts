import { createHash } from "node:crypto";
import { setDruidCompatibleContractEvidence } from "./druid-source-compatible-contract";
import { fullRaidDruidSourceCompatibility } from "../forever-simulator-full-raid-druid-schema-v3";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { SIMULATOR_SPECS, type SimulatorManifest } from "@wow-trader/forever-data/simulator";
import {
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidBuildReferenceSchema,
  fullRaidDruidStatisticsModel,
  type FullRaidDruidProfile,
} from "../forever-simulator-full-raid-druid-schema";
import {
  createReviewedFullRaidDruidProfileAdaptersV3,
  type FullRaidDruidProfileAdapters,
} from "../forever-simulator-full-raid-druid-profile-v3";
import type { FullRaidDruidProfilePinsV3 } from "../forever-simulator-full-raid-druid-profile-schema-v3";
import { fullRaidDruidBuildPinsV3Schema } from "../forever-simulator-full-raid-druid-schema-v3";

const record = z.record(z.string(), z.unknown());
const contract = z
  .object({
    unitContractOnly: z.literal(true),
    numericalEvidence: z.literal(false),
    completedAdmissionMocked: z.literal(true),
    model: z.object({ revision: z.string() }),
    pins: fullRaidDruidBuildPinsSchema,
    builds: z
      .array(z.object({ build: record, reference: fullRaidDruidBuildReferenceSchema }))
      .length(2),
  })
  .passthrough()
  .parse(
    JSON.parse(
      gunzipSync(readFileSync(new URL("./druid-full-raid-contract.v1.json.gz", import.meta.url)), {
        maxOutputLength: 1_000_000,
      }).toString("utf8"),
    ),
  );
const profiles = ["feral_druid", "balance_druid"] as const;
const release = "a".repeat(24);
const sourceRelease = fullRaidDruidStatisticsModel.sourceRelease;
const directories: string[] = [];
export interface DruidProfileV3Contract {
  readonly unitContractOnly: true;
  readonly numericalEvidence: false;
  readonly completedAdmissionMocked: true;
  readonly directory: string;
  readonly documents: Record<string, unknown>;
  readonly pins: FullRaidDruidProfilePinsV3;
  readonly pointer: Record<string, unknown>;
  readonly selections: Record<FullRaidDruidProfile, Record<string, unknown>>;
  readonly manifest: SimulatorManifest;
  readonly sourceManifest: SimulatorManifest;
  readonly proof: Record<string, unknown>;
  readonly browser: Record<string, unknown>;
  readonly controls: Record<string, unknown>;
  readonly host: Record<string, unknown>;
  readonly saved: Record<string, unknown>;
  readonly presets: Record<string, unknown>;
  readonly publications: Record<FullRaidDruidProfile, Record<string, unknown>>;
  readonly resealProof: () => void;
  readonly resealBrowser: () => void;
  readonly flush: () => Promise<void>;
  readonly adapters: () => FullRaidDruidProfileAdapters;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function text(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}
function descriptor(value: unknown): { bytes: number; sha256: string } {
  const body = text(value);
  return {
    bytes: Buffer.byteLength(body),
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}
async function json(directory: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), text(value));
}

const testSupervisor = Object.freeze({
  runId: "e1e6572a-1693-49a0-9f63-8879bd906361",
  runSha256: hash("unit-contract-only-resumed-owner-not-a-production-success"),
  commandSha256: fullRaidDruidSourceCompatibility.commandSha256,
  authorization: fullRaidDruidSourceCompatibility.authorization,
  preparation: fullRaidDruidSourceCompatibility.preparation,
  predecessorOriginalCommandSha256: fullRaidDruidSourceCompatibility.originalCommandSha256,
  startedAt: "2026-10-24T23:25:34.014Z",
  deadlineAt: "2026-10-25T23:25:34.014Z",
});
function resumedBuilds(): typeof contract.builds {
  const builds = structuredClone(contract.builds);
  for (const row of builds) {
    setDruidCompatibleContractEvidence(row.build, testSupervisor.runId, testSupervisor.runSha256);
    const sha256 = hash(row.build),
      variant = z.enum(["feral", "balance"]).parse(row.build.variant);
    row.reference = {
      path: `artifacts/forever-simulator/optimization/druid-statistics-correction-v1/exports/build-${variant}-${sha256.slice(0, 16)}.json`,
      sha256,
      byteSha256: descriptor(row.build).sha256,
    };
  }
  return builds;
}

// Every final receipt, browser result, manifest and 1-DPS value here is a unit
// contract sentinel. No fixture supplies production delivery hashes or evidence.
export async function createDruidProfileV3Contract(): Promise<DruidProfileV3Contract> {
  const directory = await mkdtemp(join(tmpdir(), "kfc-druid-profile-contract-"));
  directories.push(directory);
  const policy = {
      schema: "kfc-item-weapon-skills.v1" as const,
      mode: "ignore-item-bonuses" as const,
      basis: "owner-directed-model-assumption" as const,
      notice: "Unit contract only; no numerical or publication evidence",
      changes: [],
    },
    modelAssets = {
      "lib.wasm": { bytes: 1, sha256: fullRaidDruidStatisticsModel.wasmSha256 },
      "assets/database/db.json": {
        bytes: 1,
        sha256: fullRaidDruidStatisticsModel.databaseSha256,
      },
      "sim_worker.js": { bytes: 1, sha256: hash("unit-only-worker") },
    },
    sourceManifest: SimulatorManifest = {
      schema: "kfc-forever-simulator.v1",
      release: sourceRelease,
      upstream: "https://github.com/gunba/wow-forever-sim",
      revision: "9a27c3d6af91d1ca0dbcf94a124b8869ad522108",
      preparedAt: "2026-10-25T06:00:00.000Z",
      itemCount: 2703,
      currentItemCount: 2703,
      provisionalItemCount: 0,
      excludedModeledItems: 0,
      pages: SIMULATOR_SPECS.map((spec): string => spec.page),
      files: { ...modelAssets, "kfc-item-weapon-skills.json": descriptor(policy) },
      dataProvenance: "pinned-forever-with-labelled-classic-pre-raid-references",
      mechanicsStatus: "beta_model",
      itemWeaponSkillPolicy: policy,
    },
    manifest = structuredClone(sourceManifest),
    builds = resumedBuilds(),
    documents: Record<string, unknown> = {},
    pins: FullRaidDruidProfilePinsV3 = {
      release,
      proofSha256: "0".repeat(64),
      buildPins: fullRaidDruidBuildPinsV3Schema.parse({
        ...structuredClone(contract.pins),
        supervisorRunId: testSupervisor.runId,
        supervisorRunSha256: testSupervisor.runSha256,
        builds: Object.fromEntries(builds.map(({ build }) => [String(build.id), hash(build)])),
      }),
      publications: { feral_druid: "0".repeat(64), balance_druid: "0".repeat(64) },
      browserReviewSha256: "0".repeat(64),
    },
    proof: Record<string, unknown> = {
      schema: "kfc-simulator-profile-model-update.druid-full-raid.v1",
      profiles: [...profiles],
      sourceRelease,
      release,
      identity: "a".repeat(64),
      sourceManifestSha256: hash(sourceManifest),
      nativeBinarySha256: fullRaidDruidStatisticsModel.nativeBinarySha256,
      databaseSha256: fullRaidDruidStatisticsModel.databaseSha256,
      policySha256: descriptor(policy).sha256,
      typecheckDiagnostics: 0,
      modelAssets,
      builds: builds.map(({ build, reference }) => ({
        id: build.id,
        profile: build.profile,
        build: reference,
        settingsSha256: build.settingsSha256,
        referenceDps: build.referenceDps,
        validationIterations: build.validationIterations,
        hrefSha256: createHash("sha256")
          .update(`/forever-sim/${release}/${String(build.profile)}/#UNIT-ONLY`)
          .digest("hex"),
      })),
      correction: {
        path:
          "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/source-compatible-resume-v1/completed-" +
          testSupervisor.runId +
          ".json",
        byteSha256: pins.buildPins.correctionByteSha256,
      },
      confirmation: {
        path: "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/confirmation-completed.json",
        byteSha256: pins.buildPins.confirmationByteSha256,
      },
      supervisor: structuredClone(testSupervisor),
      measurementBridge: {
        compiledEmitter: false,
        htmlAdapter: "events-v2",
        sourceSha256: hash("unit-source"),
        virtualSha256: hash("unit-virtual"),
        currentHostBrowserReviewRequired: true,
      },
      bossDebuffOverflowQualified: false,
    },
    controls: Record<string, unknown> = {
      schema: "kfc-druid-statistics-ui-control-summary.v1",
      sourceReport: { path: "unit-only-control-report.json", sha256: hash("unit-only-controls") },
      release,
      sourceRelease,
      records: builds.flatMap(({ build }) =>
        ["desktop", "mobile"].map((mode) => ({
          id: build.id,
          profile: build.profile,
          mode,
          iterations: 25,
          seed: 190870001,
          nativeDps: 1,
          browserDps: 1,
          completeUnitMetricsVerified: true,
          procConsentOff: true,
        })),
      ),
      freshHoldouts: 0,
      referenceDpsChanged: false,
      errors: [],
    },
    host: Record<string, unknown> = {
      schema: "kfc-druid-statistics-host-summary.v1",
      sourceReport: { path: "unit-only-host-report.json", sha256: hash("unit-only-host") },
      status: "passed",
      release,
      records: profiles.map((profile) => ({
        profile,
        adapterVersion: "events-v2",
        successfulNotifications: 1,
        successExactlyOnce: true,
        engineValidationErrorPreserved: true,
        cancellationAndLateResultSuppressed: true,
        privacyChecks: ["doNotTrack", "globalPrivacyControl"],
        numericalQualificationEvidence: false,
      })),
      numericalQualificationEvidence: false,
      errors: [],
    },
    saved: Record<string, unknown> = {
      schema: "kfc-druid-statistics-saved-character.v1",
      status: "passed",
      release,
      records: profiles.flatMap((profile) =>
        ["desktop", "mobile"].map((mode) => ({
          profile,
          mode,
          firstVisitDefaultVerified: true,
          personalCharacterRestored: true,
          personalWeaponEnchantPreserved: true,
          personalEncounterPreserved: true,
        })),
      ),
      nativeJobs: 0,
      browserCombatJobs: 0,
      ownerBrowserStorageTouched: false,
      errors: [],
    },
    presets: Record<string, unknown> = {
      schema: "kfc-druid-statistics-preset-interactions.v1",
      status: "passed",
      release,
      sourceRelease,
      supervisor: structuredClone(testSupervisor),
      records: profiles.flatMap((profile) =>
        ["desktop", "mobile"].map((mode) => ({
          id: profile === "feral_druid" ? "feral-cat-static" : "balance-static",
          profile,
          mode,
          viewport:
            mode === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
          firstVisitDefaultVerified: true,
          configurationRestoresOwnedSettings: true,
          configurationPreservesPersonalEncounterAndBonusStats: true,
          gearSetRestoresEquipmentProfessionsAndWeaponConsumes: true,
          gearSetPreservesPersonalTalentsRotationEncounterAndManaConsumes: true,
          gearSetClearsBonusStatsAsDesigned: true,
          uiExportImportAndHashlessReloadVerified: true,
          provisionalConsentOff: true,
          noHorizontalOverflow: true,
          configuredCharacterSha256: hash("unit-character-" + profile + mode),
          evidence: {
            path: "unit-only/" + profile + mode + ".json",
            sha256: hash("unit-raw-" + profile + mode),
            byteSha256: hash("unit-bytes-" + profile + mode),
          },
          blockedWorkerRequests: 0,
          nativeJobs: 0,
          browserCombatJobs: 0,
          ownerBrowserStorageTouched: false,
          publicationAllowed: false,
        })),
      ),
      nativeJobs: 0,
      browserCombatJobs: 0,
      ownerBrowserStorageTouched: false,
      errors: [],
      publicationAllowed: false,
    },
    browser: Record<string, unknown> = {
      schema: "kfc-druid-statistics-profile-browser.v1",
      status: "passed",
      capturedAt: "2026-10-25T12:00:00.000Z",
      profiles: [...profiles],
      sourceRelease,
      release,
      proofSha256: pins.proofSha256,
      checked: {
        exactMeasuredBuilds: true,
        completeUnitMetrics: true,
        desktopMobile: true,
        configAndGearSets: true,
        sharesAndSavedCharacters: true,
        currentHostCompletionBridge: true,
        otherProfilesPreserved: true,
        rotationGuide: true,
        provisionalConsentOff: true,
      },
      bossDebuffOverflowQualified: false,
      errors: [],
    },
    publications = z
      .object({ feral_druid: record, balance_druid: record })
      .strict()
      .parse(
        Object.fromEntries(
          builds.map(({ build }) => [
            String(build.profile),
            {
              schema: "kfc-published-simulator-profile.v1",
              profile: build.profile,
              sourceRelease,
              presentationRelease: release,
              presentationProofSha256: pins.proofSha256,
              builds: [
                {
                  id: build.id,
                  spec: `${String(build.profile)}/${String(build.variant)}`,
                  faction: "Alliance",
                  scenario: "static",
                  stage: "Unit contract only",
                  status: "reviewed",
                  href: `/forever-sim/${release}/${String(build.profile)}/#UNIT-ONLY`,
                  referenceDps: build.referenceDps,
                  validationIterations: build.validationIterations,
                  requiresProvisionalEnchantOptIn: false,
                  warnings: ["Mocked parser fixture; no publication admission"],
                  rotationGuidance: build.rotationGuidance,
                },
              ],
            },
          ]),
        ),
      ),
    selections: Record<FullRaidDruidProfile, Record<string, unknown>> = {
      feral_druid: { sourceRelease, release, proofSha256: pins.proofSha256 },
      balance_druid: { sourceRelease, release, proofSha256: pins.proofSha256 },
    },
    pointer: Record<string, unknown> = {
      schema: "kfc-simulator-profile-model-selection.v1",
      profiles: selections,
    };
  manifest.release = release;
  manifest.preparedAt = "2026-10-25T11:00:00.000Z";
  documents[sourceRelease + "/manifest.json"] = sourceManifest;
  documents[release + "/manifest.json"] = manifest;
  documents[sourceRelease + "/kfc-item-weapon-skills.json"] = policy;
  documents["profile-model-updates.json"] = pointer;
  for (const { build, reference } of builds)
    documents[reference.path.replace(/^artifacts\/forever-simulator\//, "")] = build;
  function resealBrowser(): void {
    for (const [key, value] of [
      ["uiControls", controls],
      ["hostReview", host],
      ["savedCharacterReview", saved],
      ["presetReview", presets],
    ] as const) {
      const path = `optimization/reviews/unit-${key}-${hash(value).slice(0, 16)}.json`;
      documents[path] = value;
      browser[key] = { path, sha256: hash(value) };
    }
    pins.browserReviewSha256 = hash(browser);
    const path = `optimization/reviews/druid-statistics-browser-${pins.browserReviewSha256.slice(0, 16)}.json`;
    documents[path] = browser;
    for (const profile of profiles)
      selections[profile].browserReview = { path, sha256: pins.browserReviewSha256 };
  }
  function resealProof(): void {
    pins.proofSha256 = descriptor(proof).sha256;
    manifest.files["kfc-reviewed-presets.json"] = descriptor(proof);
    documents[release + "/kfc-reviewed-presets.json"] = proof;
    browser.proofSha256 = pins.proofSha256;
    for (const profile of profiles) {
      selections[profile].proofSha256 = pins.proofSha256;
      publications[profile].presentationProofSha256 = pins.proofSha256;
      pins.publications[profile] = hash(publications[profile]);
      documents[`published-reviews/${profile}-${pins.publications[profile].slice(0, 16)}.json`] =
        publications[profile];
    }
    resealBrowser();
  }
  resealProof();
  const value: DruidProfileV3Contract = {
    unitContractOnly: true,
    numericalEvidence: false,
    completedAdmissionMocked: true,
    directory,
    documents,
    pins,
    pointer,
    selections,
    manifest,
    sourceManifest,
    proof,
    browser,
    controls,
    host,
    saved,
    presets,
    publications,
    resealProof,
    resealBrowser,
    flush: async (): Promise<void> => {
      for (const [path, document] of Object.entries(documents))
        await json(directory, path, document);
    },
    adapters: (): FullRaidDruidProfileAdapters =>
      createReviewedFullRaidDruidProfileAdaptersV3(pins),
  };
  await value.flush();
  return value;
}

export async function disposeDruidProfileV3Contracts(): Promise<void> {
  await Promise.all(
    directories.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
}
