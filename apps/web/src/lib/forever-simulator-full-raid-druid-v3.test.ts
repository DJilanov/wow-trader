import { createHash } from "node:crypto";
import { setDruidCompatibleContractEvidence } from "./fixtures/druid-source-compatible-contract";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createReviewedFullRaidDruidBuildReader,
  type FullRaidDruidBuildOptions,
} from "./forever-simulator-full-raid-druid";
import {
  fullRaidDruidBuildEntrySchema,
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidBuildReferenceSchema,
  type FullRaidDruidBuildEntry,
} from "./forever-simulator-full-raid-druid-schema";
import {
  fullRaidDruidBuildPinsV3Schema,
  type FullRaidDruidBuildPinsV3,
  type ReviewedFullRaidDruidBuildV3,
} from "./forever-simulator-full-raid-druid-schema-v3";
import { createReviewedFullRaidDruidBuildReaderV3 } from "./forever-simulator-full-raid-druid-v3";

const record = z.record(z.string(), z.unknown());
const fixture = z
  .object({
    unitContractOnly: z.literal(true),
    numericalEvidence: z.literal(false),
    completedAdmissionMocked: z.literal(true),
    model: z.object({
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
    }),
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
const reviewedAttempt = "e1e6572a-1693-49a0-9f63-8879bd906361";
const otherAttempt = "85842bef-7870-456a-ae8f-11e61bc27803";
interface Context {
  readonly build: Record<string, unknown>;
  readonly pins: FullRaidDruidBuildPinsV3;
  readonly entry: FullRaidDruidBuildEntry;
  readonly options: FullRaidDruidBuildOptions;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected contract object");
  return value as Record<string, unknown>;
}
function reseal(value: Context): void {
  const sha256 = hash(value.build),
    variant = z.enum(["feral", "balance"]).parse(value.build.variant);
  value.entry.build = {
    path: `artifacts/forever-simulator/optimization/druid-statistics-correction-v1/exports/build-${variant}-${sha256.slice(0, 16)}.json`,
    sha256,
  };
  value.pins.builds[value.entry.id] = sha256;
}
function context(index = 0): Context {
  const row = fixture.builds[index];
  if (!row) throw new Error("Missing contract build");
  const build = structuredClone(row.build),
    supervisor = object(object(build.evidence).supervisor);
  // The attempt and final receipts are explicit unit sentinels, not a new
  // numerical source or a completed production supervisor.
  supervisor.runId = reviewedAttempt;
  supervisor.runSha256 = hash("unit-contract-only-reviewed-resumed-attempt");
  setDruidCompatibleContractEvidence(
    build,
    reviewedAttempt,
    z.string().parse(supervisor.runSha256),
  );
  const value: Context = {
    build,
    pins: {
      ...structuredClone(fixture.pins),
      supervisorRunId: reviewedAttempt,
      supervisorRunSha256: z.string().parse(supervisor.runSha256),
    },
    entry: fullRaidDruidBuildEntrySchema.parse({
      id: build.id,
      profile: build.profile,
      build: row.reference,
      settingsSha256: build.settingsSha256,
      referenceDps: build.referenceDps,
      validationIterations: build.validationIterations,
    }),
    options: {
      ...fixture.model,
      reference: async (reference): Promise<unknown> => {
        if (reference.path !== value.entry.build.path)
          throw new Error("Unexpected contract reference");
        return value.build;
      },
    },
  };
  reseal(value);
  return value;
}
function read(value: Context): Promise<ReviewedFullRaidDruidBuildV3> {
  return createReviewedFullRaidDruidBuildReaderV3(value.pins)(value.entry, value.options);
}

describe("approved compatible Druid build reader; mocked final receipts only", (): void => {
  it.each([0, 1])(
    "preserves the exact exported object for resumed spec %i",
    async (index): Promise<void> => {
      const value = context(index),
        result = await read(value);
      expect(fixture.numericalEvidence).toBe(false);
      expect(result).toBe(value.build);
      expect(hash(result)).toBe(value.pins.builds[value.entry.id]);
      expect(result.evidence.supervisor.runId).toBe(reviewedAttempt);
      expect(result.evidence.supervisor.commandSha256).toBe(
        "f87d54cedab38370ce5b2d7aa8e23e18df566ddcb2cea69d9530aa1cc39a53bf",
      );
      expect(result.referenceDps).toBe(1);
      expect(result.publicationAllowed).toBe(false);
      expect(result.scope.bossDebuffOverflowQualified).toBe(false);
    },
  );

  it("reproduces the frozen reader's rejection without modifying or bypassing it", async (): Promise<void> => {
    const value = context(),
      { supervisorRunId: _supervisorRunId, ...legacyPins } = value.pins;
    await expect(
      createReviewedFullRaidDruidBuildReader(legacyPins)(value.entry, value.options),
    ).rejects.toThrow();
    await expect(read(value)).resolves.toBe(value.build);
  });

  it.each(["runId", "runSha256", "commandSha256", "startedAt", "deadlineAt"])(
    "rejects changed %s despite rehashed test-only build pins",
    async (field): Promise<void> => {
      const value = context(),
        supervisor = object(object(value.build.evidence).supervisor);
      supervisor[field] =
        field === "runId"
          ? otherAttempt
          : field === "startedAt"
            ? "2026-10-25T00:00:00.000Z"
            : field === "deadlineAt"
              ? "2026-10-26T23:25:34.014Z"
              : "0".repeat(64);
      reseal(value);
      await expect(read(value)).rejects.toThrow();
    },
  );

  it.each(["owner-id", "owner-hash", "correction", "confirmation"])(
    "keeps independently supplied %s pins authoritative",
    async (field): Promise<void> => {
      const value = context();
      if (field === "owner-id") value.pins.supervisorRunId = otherAttempt;
      if (field === "owner-hash") value.pins.supervisorRunSha256 = "0".repeat(64);
      if (field === "correction") value.pins.correctionByteSha256 = "0".repeat(64);
      if (field === "confirmation") value.pins.confirmationByteSha256 = "0".repeat(64);
      await expect(read(value)).rejects.toThrow(/completed owner differs/);
    },
  );

  it.each([
    "model",
    "settings",
    "guide",
    "talents",
    "consumes",
    "coverage",
    "samples",
    "overflow",
    "publication",
  ])("preserves the original %s gate", async (field): Promise<void> => {
    const value = context(field === "consumes" ? 1 : 0),
      guide = object(value.build.rotationGuidance);
    if (field === "model") value.build.sourceRelease = "0".repeat(24);
    if (field === "settings") value.build.settingsSha256 = "0".repeat(64);
    if (field === "guide") {
      const bindings = z.array(record).parse(guide.priorityBindings);
      if (!bindings[0]) throw new Error("Missing fixture action binding");
      bindings[0].actionSha256 = "0".repeat(64);
      guide.priorityBindings = bindings;
    }
    if (field === "talents") guide.talents = "1/1/1";
    if (field === "consumes") guide.conjured = "tea";
    if (field === "coverage")
      object(object(value.build.scope).freshConfirmationCoverage).sourceOrigins = 99;
    if (field === "samples") value.build.validationIterations = 39999;
    if (field === "overflow") object(value.build.scope).bossDebuffOverflowQualified = true;
    if (field === "publication") value.build.publicationAllowed = true;
    reseal(value);
    await expect(read(value)).rejects.toThrow();
  });

  it("still rejects changed raw data against unchanged build hashes", async (): Promise<void> => {
    const value = context();
    value.build.referenceDps = 9999;
    await expect(read(value)).rejects.toThrow(/checksum changed/);
  });

  it("copies owner and build pins before later caller mutation", async (): Promise<void> => {
    const value = context(),
      reader = createReviewedFullRaidDruidBuildReaderV3(value.pins);
    value.pins.supervisorRunId = otherAttempt;
    value.pins.supervisorRunSha256 = "0".repeat(64);
    value.pins.builds["feral-cat-static"] = "0".repeat(64);
    await expect(reader(value.entry, value.options)).resolves.toBe(value.build);
  });

  it.each(["", "latest", "3f73fc83", "../owner.json"])(
    "rejects invalid code-owned attempt %s before reading an export",
    (runId): void => {
      const value = context();
      expect(() =>
        fullRaidDruidBuildPinsV3Schema.parse({ ...value.pins, supervisorRunId: runId }),
      ).toThrow();
      expect(() =>
        createReviewedFullRaidDruidBuildReaderV3({ ...value.pins, supervisorRunId: runId }),
      ).toThrow();
    },
  );

  it.each([
    "approval",
    "preparation",
    "missing-execution",
    "completion-owner",
    "legacy-completion",
    "nested-owner",
    "original-command",
    "original-source",
    "original-clock",
    "unexpected-execution-field",
  ])("rejects rehashed compatible-provenance substitution: %s", async (field): Promise<void> => {
    const value = context(),
      evidence = object(value.build.evidence),
      execution = object(evidence.compatibleExecution);
    if (field === "approval") object(execution.authorization).byteSha256 = "0".repeat(64);
    if (field === "preparation") object(execution.preparation).byteSha256 = "0".repeat(64);
    if (field === "missing-execution") delete evidence.compatibleExecution;
    if (field === "completion-owner")
      object(evidence.correction).path =
        "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/source-compatible-resume-v1/completed-" +
        otherAttempt +
        ".json";
    if (field === "legacy-completion")
      object(evidence.correction).path =
        "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/completed.json";
    if (field === "nested-owner") object(execution.supervisor).runId = otherAttempt;
    if (field === "original-command")
      object(execution.originalNumericalAuthority).commandSha256 =
        "f87d54cedab38370ce5b2d7aa8e23e18df566ddcb2cea69d9530aa1cc39a53bf";
    if (field === "original-source")
      object(object(execution.originalNumericalAuthority).commandSource).byteSha256 = "0".repeat(
        64,
      );
    if (field === "original-clock")
      object(execution.originalNumericalAuthority).deadlineAt = "2026-10-26T23:25:34.014Z";
    if (field === "unexpected-execution-field") execution.approvalBypass = true;
    reseal(value);
    await expect(read(value)).rejects.toThrow();
  });
});
