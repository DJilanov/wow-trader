import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { SIMULATOR_SPECS, type SimulatorManifest } from "@wow-trader/forever-data/simulator";
import {
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidBuildReferenceSchema,
  fullRaidDruidStatisticsModel,
  type FullRaidDruidProfile,
} from "./forever-simulator-full-raid-druid-schema";
import {
  createReviewedFullRaidDruidProfileAdapters,
  type FullRaidDruidProfileAdapters,
} from "./forever-simulator-full-raid-druid-profile";
import type { FullRaidDruidProfilePins } from "./forever-simulator-full-raid-druid-profile-schema";

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
      gunzipSync(
        readFileSync(new URL("./fixtures/druid-full-raid-contract.v1.json.gz", import.meta.url)),
        { maxOutputLength: 1_000_000 },
      ).toString("utf8"),
    ),
  );
const profiles = ["feral_druid", "balance_druid"] as const;
const release = "a".repeat(24);
const sourceRelease = fullRaidDruidStatisticsModel.sourceRelease;
const directories: string[] = [];
interface Fixture {
  readonly directory: string;
  readonly documents: Record<string, unknown>;
  readonly pins: FullRaidDruidProfilePins;
  readonly pointer: Record<string, unknown>;
  readonly selections: Record<FullRaidDruidProfile, Record<string, unknown>>;
  readonly manifest: SimulatorManifest;
  readonly sourceManifest: SimulatorManifest;
  readonly proof: Record<string, unknown>;
  readonly browser: Record<string, unknown>;
  readonly controls: Record<string, unknown>;
  readonly host: Record<string, unknown>;
  readonly saved: Record<string, unknown>;
  readonly publications: Record<FullRaidDruidProfile, Record<string, unknown>>;
  readonly resealProof: () => void;
  readonly resealBrowser: () => void;
  readonly flush: () => Promise<void>;
  readonly adapters: () => FullRaidDruidProfileAdapters;
}
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function rows(value: unknown): Record<string, unknown>[] {
  return z.array(record).parse(value);
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

// Every final receipt, browser result, manifest and 1-DPS value here is a unit
// contract sentinel. No fixture supplies production delivery hashes or evidence.
async function fixture(): Promise<Fixture> {
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
    builds = structuredClone(contract.builds),
    documents: Record<string, unknown> = {},
    pins: FullRaidDruidProfilePins = {
      release,
      proofSha256: "0".repeat(64),
      buildPins: structuredClone(contract.pins),
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
        path: "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/completed.json",
        byteSha256: pins.buildPins.correctionByteSha256,
      },
      confirmation: {
        path: "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/confirmation-completed.json",
        byteSha256: pins.buildPins.confirmationByteSha256,
      },
      supervisor: { runSha256: pins.buildPins.supervisorRunSha256 },
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
          iterations: 10000,
          seed: 77191,
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
  const value: Fixture = {
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
    publications,
    resealProof,
    resealBrowser,
    flush: async (): Promise<void> => {
      for (const [path, document] of Object.entries(documents))
        await json(directory, path, document);
    },
    adapters: (): FullRaidDruidProfileAdapters => createReviewedFullRaidDruidProfileAdapters(pins),
  };
  await value.flush();
  return value;
}

afterEach(async (): Promise<void> => {
  await Promise.all(
    directories.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("two-profile Druid delivery contract; mocked final evidence only", (): void => {
  it.each(profiles)(
    "reads %s from the same UI with its separate publication",
    async (profile): Promise<void> => {
      const value = await fixture(),
        api = value.adapters(),
        selected = await api.readProfile(profile, value.directory);
      expect(contract.numericalEvidence).toBe(false);
      expect(selected?.manifest.release).toBe(release);
      expect(selected?.sourceRelease).toBe(sourceRelease);
      if (!selected) throw new Error("Missing unit-contract selection");
      await expect(
        api.validatePublication(
          profile,
          selected.manifest,
          rows(value.publications[profile].builds),
          value.directory,
        ),
      ).resolves.toBe(true);
      await expect(
        api.validatePublishedRows(
          profile,
          selected.manifest,
          rows(value.publications[profile].builds),
          value.directory,
        ),
      ).resolves.toBeUndefined();
      const combined = profiles.flatMap((key) => rows(value.publications[key].builds));
      await expect(
        api.validatePublication(profile, selected.manifest, combined, value.directory),
      ).rejects.toThrow();
      const other = profile === "feral_druid" ? "balance_druid" : "feral_druid";
      await expect(
        api.validatePublication(
          profile,
          selected.manifest,
          rows(value.publications[other].builds),
          value.directory,
        ),
      ).rejects.toThrow(/profile proof/);
    },
  );

  it("preserves missing, legacy and independently selected profile pointers", async (): Promise<void> => {
    const value = await fixture(),
      api = value.adapters();
    await rm(join(value.directory, "profile-model-updates.json"));
    await expect(api.readProfile("feral_druid", value.directory)).resolves.toBeNull();
    value.pointer.profiles = {
      hunter: { release: "unrelated-legacy-value" },
      feral_druid: { release: "b".repeat(24) },
    };
    await value.flush();
    await expect(api.readProfile("feral_druid", value.directory)).resolves.toBeNull();
    await expect(api.readProfile("balance_druid", value.directory)).resolves.toBeNull();
    value.pointer.profiles = {
      feral_druid: { broken: true },
      balance_druid: value.selections.balance_druid,
    };
    await value.flush();
    await expect(api.readProfile("balance_druid", value.directory)).resolves.toMatchObject({
      manifest: { release },
    });
    await expect(api.readProfile("feral_druid", value.directory)).rejects.toThrow();
  });

  it("copies code-owned pins before callers can mutate them", async (): Promise<void> => {
    const value = await fixture(),
      api = value.adapters();
    value.pins.release = "b".repeat(24);
    value.pins.buildPins.builds["balance-static"] = "0".repeat(64);
    value.pins.browserReviewSha256 = "0".repeat(64);
    value.pins.publications.balance_druid = "0".repeat(64);
    await expect(api.readProfile("balance_druid", value.directory)).resolves.toMatchObject({
      manifest: { release },
    });
    await expect(
      api.validatePublishedRows(
        "balance_druid",
        value.manifest,
        rows(value.publications.balance_druid.builds),
        value.directory,
      ),
    ).resolves.toBeUndefined();
  });

  it.each(["sourceRelease", "proofSha256", "browserReview"])(
    "rejects a changed selected %s",
    async (field): Promise<void> => {
      const value = await fixture();
      value.selections.feral_druid[field] =
        field === "sourceRelease"
          ? "b".repeat(24)
          : field === "proofSha256"
            ? "0".repeat(64)
            : { path: "../approval.json", sha256: "0".repeat(64) };
      await value.flush();
      await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow();
    },
  );

  it.each(["wasm", "worker", "database", "missing", "scope", "parent", "policy"])(
    "rejects changed %s model identity",
    async (field): Promise<void> => {
      const value = await fixture();
      const name =
        field === "wasm"
          ? "lib.wasm"
          : field === "worker"
            ? "sim_worker.js"
            : "assets/database/db.json";
      if (["wasm", "worker", "database"].includes(field))
        value.manifest.files[name] = { bytes: 1, sha256: "0".repeat(64) };
      if (field === "missing") delete value.manifest.files["sim_worker.js"];
      if (field === "scope") {
        value.manifest.itemCount = 2704;
        value.manifest.currentItemCount = 2704;
      }
      if (field === "parent") value.sourceManifest.preparedAt = "2026-10-25T07:00:00.000Z";
      if (field === "policy")
        value.documents[sourceRelease + "/kfc-item-weapon-skills.json"] = {
          ...object(value.documents[sourceRelease + "/kfc-item-weapon-skills.json"]),
          notice: "changed",
        };
      await value.flush();
      await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow(
        /Druid/,
      );
    },
  );

  it.each(["correction", "confirmation", "supervisor", "profiles", "builds", "bridge", "overflow"])(
    "rejects rehashed %s proof claims",
    async (field): Promise<void> => {
      const value = await fixture();
      if (field === "correction" || field === "confirmation")
        value.proof[field] = { ...object(value.proof[field]), byteSha256: "0".repeat(64) };
      if (field === "supervisor") value.proof.supervisor = { runSha256: "0".repeat(64) };
      if (field === "profiles") value.proof.profiles = [...profiles].reverse();
      if (field === "builds") value.proof.builds = rows(value.proof.builds).reverse();
      if (field === "bridge")
        value.proof.measurementBridge = {
          ...object(value.proof.measurementBridge),
          compiledEmitter: true,
        };
      if (field === "overflow") value.proof.bossDebuffOverflowQualified = true;
      value.resealProof();
      await value.flush();
      await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow();
    },
  );

  it("rejects changed build formatting and changed proof bytes", async (): Promise<void> => {
    const value = await fixture(),
      path = contract.builds[0]?.reference.path.replace(/^artifacts\/forever-simulator\//, "");
    if (!path) throw new Error("Missing fixture build");
    await writeFile(join(value.directory, path), JSON.stringify(value.documents[path]));
    await expect(value.adapters().readProfile("balance_druid", value.directory)).rejects.toThrow(
      /build bytes changed/,
    );
    await value.flush();
    await writeFile(
      join(value.directory, release + "/kfc-reviewed-presets.json"),
      JSON.stringify(value.proof),
    );
    await expect(value.adapters().readProfile("balance_druid", value.directory)).rejects.toThrow(
      /proof checksum/,
    );
  });

  it.each(["early", "late", "profile", "release", "proof", "overflow", "checked", "errors"])(
    "rejects rehashed %s browser approval",
    async (field): Promise<void> => {
      const value = await fixture();
      if (field === "early") value.browser.capturedAt = "2026-10-24T23:25:34.013Z";
      if (field === "late") value.browser.capturedAt = "2026-10-25T23:25:34.014Z";
      if (field === "profile") value.browser.profiles = ["feral_druid"];
      if (field === "release") value.browser.release = "b".repeat(24);
      if (field === "proof") value.browser.proofSha256 = "0".repeat(64);
      if (field === "overflow") value.browser.bossDebuffOverflowQualified = true;
      if (field === "checked")
        value.browser.checked = {
          ...object(value.browser.checked),
          sharesAndSavedCharacters: false,
        };
      if (field === "errors") value.browser.errors = ["failure"];
      value.resealBrowser();
      await value.flush();
      await expect(
        value.adapters().readProfile("balance_druid", value.directory),
      ).rejects.toThrow();
    },
  );

  it.each(["duplicate", "profile", "parity", "seed", "metrics", "consent"])(
    "rejects incomplete %s UI controls even with rehashed approval",
    async (field): Promise<void> => {
      const value = await fixture(),
        controls = rows(value.controls.records),
        first = controls[0];
      if (!first) throw new Error("Missing UI control");
      if (field === "duplicate") controls[1] = structuredClone(first);
      if (field === "profile") first.profile = "balance_druid";
      if (field === "parity") first.browserDps = 2;
      if (field === "seed") first.seed = 1;
      if (field === "metrics") first.completeUnitMetricsVerified = false;
      if (field === "consent") first.procConsentOff = false;
      value.controls.records = controls;
      value.resealBrowser();
      await value.flush();
      await expect(
        value.adapters().readProfile("balance_druid", value.directory),
      ).rejects.toThrow();
    },
  );

  it.each([
    "host-profile",
    "host-error",
    "host-cancel",
    "host-privacy",
    "saved-viewport",
    "saved-character",
    "saved-owner",
  ])("rejects incomplete %s evidence", async (field): Promise<void> => {
    const value = await fixture(),
      host = rows(value.host.records),
      saved = rows(value.saved.records),
      firstHost = host[0],
      firstSaved = saved[0];
    if (!firstHost || !firstSaved) throw new Error("Missing browser fixture records");
    if (field === "host-profile") host[1] = structuredClone(firstHost);
    if (field === "host-error") firstHost.engineValidationErrorPreserved = false;
    if (field === "host-cancel") firstHost.cancellationAndLateResultSuppressed = false;
    if (field === "host-privacy") firstHost.privacyChecks = [];
    if (field === "saved-viewport") saved[1] = structuredClone(firstSaved);
    if (field === "saved-character") firstSaved.personalCharacterRestored = false;
    if (field === "saved-owner") value.saved.ownerBrowserStorageTouched = true;
    value.host.records = host;
    value.saved.records = saved;
    value.resealBrowser();
    await value.flush();
    await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow();
  });

  it("rejects modified evidence and filesystem escapes", async (): Promise<void> => {
    const value = await fixture(),
      ref = object(value.browser.uiControls),
      path = z.string().parse(ref.path);
    await json(value.directory, path, { ...value.controls, errors: ["changed"] });
    await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow(
      /evidence changed/,
    );
    await value.flush();
    const external = await mkdtemp(join(tmpdir(), "kfc-druid-outside-contract-"));
    directories.push(external);
    await json(external, "evidence.json", value.controls);
    await rm(join(value.directory, path));
    await symlink(join(external, "evidence.json"), join(value.directory, path));
    await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow(
      /escaped storage/,
    );
    await rm(join(value.directory, path));
    value.browser.uiControls = { path: "optimization/../approval.json", sha256: ref.sha256 };
    value.pins.browserReviewSha256 = hash(value.browser);
    const browserPath = `optimization/reviews/druid-statistics-browser-${value.pins.browserReviewSha256.slice(0, 16)}.json`;
    await json(value.directory, browserPath, value.browser);
    value.selections.feral_druid.browserReview = {
      path: browserPath,
      sha256: value.pins.browserReviewSha256,
    };
    await json(value.directory, "profile-model-updates.json", value.pointer);
    await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow(
      /Invalid Druid evidence path/,
    );
  });

  it("compares full per-profile rows after the four-field metadata check", async (): Promise<void> => {
    const value = await fixture(),
      api = value.adapters(),
      published = rows(value.publications.feral_druid.builds),
      first = published[0];
    if (!first) throw new Error("Missing publication fixture");
    const metadata = [
      {
        id: first.id,
        href: first.href,
        referenceDps: first.referenceDps,
        validationIterations: first.validationIterations,
      },
    ];
    await expect(
      api.validatePublication("feral_druid", value.manifest, metadata, value.directory),
    ).resolves.toBe(true);
    await expect(
      api.validatePublishedRows("feral_druid", value.manifest, metadata, value.directory),
    ).rejects.toThrow(/guidance/);
    await expect(
      api.validatePublishedRows(
        "feral_druid",
        value.manifest,
        [{ ...first, rotationGuidance: {} }],
        value.directory,
      ),
    ).rejects.toThrow(/guidance/);
    await expect(
      api.validatePublishedRows(
        "feral_druid",
        value.manifest,
        [{ ...first, requiresProvisionalEnchantOptIn: true }],
        value.directory,
      ),
    ).rejects.toThrow(/guidance/);
    const snapshot = await readFile(join(value.directory, "profile-model-updates.json"), "utf8");
    await api.readProfile("feral_druid", value.directory);
    await api.readProfile("balance_druid", value.directory);
    expect(await readFile(join(value.directory, "profile-model-updates.json"), "utf8")).toBe(
      snapshot,
    );
  });

  it("leaves prior releases and their publications to existing readers", async (): Promise<void> => {
    const value = await fixture(),
      api = value.adapters();
    await expect(
      api.validatePublication("feral_druid", value.sourceManifest, [], value.directory),
    ).resolves.toBe(false);
    await expect(
      api.validatePublishedRows("balance_druid", value.sourceManifest, [], value.directory),
    ).resolves.toBeUndefined();
  });
});
