import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { fullRaidDruidStatisticsModel } from "./forever-simulator-full-raid-druid-schema";
import {
  createDruidProfileV2Contract as fixture,
  disposeDruidProfileV2Contracts,
} from "./fixtures/druid-profile-v2-contract";
import { createReviewedFullRaidDruidProfileAdaptersV2 } from "./forever-simulator-full-raid-druid-profile-v2";
import { createReviewedFullRaidDruidProfileAdapters } from "./forever-simulator-full-raid-druid-profile";
const record = z.record(z.string(), z.unknown());
const profiles = ["feral_druid", "balance_druid"] as const;
const release = "a".repeat(24);
const sourceRelease = fullRaidDruidStatisticsModel.sourceRelease;
const directories: string[] = [];
function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
function rows(value: unknown): Record<string, unknown>[] {
  return z.array(record).parse(value);
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function json(directory: string, path: string, value: unknown): Promise<void> {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), JSON.stringify(value, null, 2) + "\n");
}
afterEach(async (): Promise<void> => {
  await disposeDruidProfileV2Contracts();
  await Promise.all(
    directories.splice(0).map((path): Promise<void> => rm(path, { recursive: true, force: true })),
  );
});

describe("two-profile Druid V2 delivery contract; mocked final evidence only", (): void => {
  it.each(profiles)(
    "reads %s from the same UI with its separate publication",
    async (profile): Promise<void> => {
      const value = await fixture(),
        api = value.adapters(),
        selected = await api.readProfile(profile, value.directory);
      expect(value.numericalEvidence).toBe(false);
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
      path = Object.keys(value.documents).find((path): boolean =>
        /\/exports\/build-feral-/.test(path),
      );
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

describe("two-profile independently reviewed retry owner", (): void => {
  it("rejects the optimization-normalization tuple as a replacement for saved browser-control RNG", async (): Promise<void> => {
    const value = await fixture();
    value.controls.records = rows(value.controls.records).map((row) => ({
      ...row,
      iterations: 10000,
      seed: 77191,
    }));
    value.resealBrowser();
    await value.flush();
    await expect(value.adapters().readProfile("balance_druid", value.directory)).rejects.toThrow();
  });

  it("uses the V2 reader for both profiles while the frozen single-attempt adapter rejects them", async (): Promise<void> => {
    const value = await fixture(),
      { supervisorRunId: _supervisorRunId, ...oldBuildPins } = value.pins.buildPins;
    const old = createReviewedFullRaidDruidProfileAdapters({
      ...value.pins,
      buildPins: oldBuildPins,
    });
    for (const profile of profiles) {
      await expect(old.readProfile(profile, value.directory)).rejects.toThrow();
      await expect(value.adapters().readProfile(profile, value.directory)).resolves.toMatchObject({
        manifest: { release },
      });
    }
  });
  it.each(["runId", "runSha256", "commandSha256", "startedAt", "deadlineAt"])(
    "rejects a rehashed changed proof %s",
    async (field): Promise<void> => {
      const value = await fixture(),
        supervisor = object(value.proof.supervisor);
      supervisor[field] =
        field === "runId"
          ? "85842bef-7870-456a-ae8f-11e61bc27803"
          : field === "startedAt"
            ? "2026-10-25T00:00:00.000Z"
            : field === "deadlineAt"
              ? "2026-10-26T23:25:34.014Z"
              : "0".repeat(64);
      value.proof.supervisor = supervisor;
      value.resealProof();
      await value.flush();
      await expect(value.adapters().readProfile("feral_druid", value.directory)).rejects.toThrow();
    },
  );
  it("captures the exact reviewed owner ID before caller mutation", async (): Promise<void> => {
    const value = await fixture(),
      api = createReviewedFullRaidDruidProfileAdaptersV2(value.pins);
    value.pins.buildPins.supervisorRunId = "85842bef-7870-456a-ae8f-11e61bc27803";
    await expect(api.readProfile("balance_druid", value.directory)).resolves.toMatchObject({
      manifest: { release },
    });
    await expect(value.adapters().readProfile("balance_druid", value.directory)).rejects.toThrow();
  });
});
