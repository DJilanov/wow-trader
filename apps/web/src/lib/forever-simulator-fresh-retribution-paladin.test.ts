import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  readFreshRetributionPaladinSimulatorBuild,
  retributionPaladinModelEntrySchema,
  retributionPaladinModelEvidenceReferenceSchema,
  verifiedRetributionPaladinDelivery,
  type RetributionPaladinModelEntry,
  type RetributionPaladinModelEvidenceReference,
} from "./forever-simulator-fresh-retribution-paladin";

const record = z.record(z.string(), z.unknown()),
  genuine = z
    .object({
      schema: z.literal("kfc-retribution-paladin-delivery-fixture.v1"),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      reviewedBuildSha256: z.string(),
      entry: retributionPaladinModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(
            new URL("./fixtures/model-first-pass-retribution-paladin.json.gz", import.meta.url),
          ),
          { maxOutputLength: 64_000_000 },
        ).toString("utf8"),
      ),
    );

interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: RetributionPaladinModelEntry;
  documents: Record<string, unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function fixture(): Fixture {
  return structuredClone({
    sourceRelease: genuine.sourceRelease,
    revision: genuine.revision,
    databaseSha256: genuine.databaseSha256,
    entry: genuine.entry,
    documents: genuine.documents,
  });
}
function read(value: Fixture): ReturnType<typeof readFreshRetributionPaladinSimulatorBuild> {
  return readFreshRetributionPaladinSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reviewedBuildSha256: verifiedRetributionPaladinDelivery.buildSha256,
    reference: async (ref: RetributionPaladinModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Ret source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("qualified Retribution delivery", () => {
  it("reads the actual corrected model, closed all-slot feedback, independent 40k and raw native/WASM parity", async (): Promise<void> => {
    const value = fixture(),
      before = hash(value),
      build = await read(value),
      player = record.parse(build.settings.player),
      items = z.array(record).parse(record.parse(player.equipment).items);
    expect(genuine.reviewedBuildSha256).toBe(verifiedRetributionPaladinDelivery.buildSha256);
    expect(build.name).toBe("Retribution · pre-raid tested");
    expect(build.referenceDps).toBe(975.0313336343517);
    expect(build.validationIterations).toBe(40000);
    expect(player.talentsString).toBe("53003-233-05225331001330301");
    expect(items).toHaveLength(17);
    expect(items[14]?.id).toBe(12790);
    expect(items[16]?.id).toBe(22401);
    expect(build.rotationGuidance.talents).toBe("11/8/32");
    expect(build.rotationGuidance.priorities).toHaveLength(10);
    expect(build.rotationGuidance.prepull).toHaveLength(1);
    expect(build.scope).toMatchObject({
      feedbackCycles: 2,
      currentModelGearSweeps: 3,
      fixedPointWithinDeclaredPolicy: true,
      gearApplicabilityRequired: false,
      completionTransportAuthenticated: true,
      originalStudiesUnchanged: true,
      originalStrictAssessmentAccepted: true,
      globalOptimalityProven: false,
      livePvpAccessVerified: false,
    });
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.005495129197292934);
    for (const [actual, required] of [
      [build.settings.raidBuffs, fullRaidDefaults.raid],
      [build.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const)
      expect(actual).toMatchObject(required);
    expect(hash(value)).toBe(before);
  }, 15_000);

  it("preserves the canonical completion and authenticates, rather than rewrites, the historical runtime envelope", async (): Promise<void> => {
    const value = fixture(),
      build = await read(value),
      transport = record.parse(value.documents[build.evidence.completionTransport.path]),
      canonical = record.parse(transport.storedCompletion),
      historical = record.parse(transport.legacyRuntimeReference),
      completion = record.parse(value.documents[z.string().parse(canonical.path)]),
      declaration = record.parse(value.documents[build.evidence.confirmationDeclaration.path]);
    expect(canonical.sha256).toBe(
      "7f92e29456b6e809b21336fc5cf7850a5a01494ca48e54398f3eb001e31859f5",
    );
    expect(historical.sha256).toBe(
      "2453f8a06d926a41e5be87fbe4f681b45910cc478135d25f1005678300bc2fe4",
    );
    expect(declaration.inspectionCompletion).toEqual(historical);
    expect(hash(completion)).toBe(canonical.sha256);
    expect(hash({ ...completion, ...record.parse(transport.runtimeOnlyFields) })).toBe(
      historical.sha256,
    );
    expect(transport.numericalPayloadChanged).toBe(false);
    expect(transport.selectionChanged).toBe(false);
  }, 15_000);

  it.each(Object.keys(genuine.documents))(
    "rejects changed genuine evidence: %s",
    async (path: string): Promise<void> => {
      const value = fixture();
      value.documents[path] = { ...record.parse(value.documents[path]), changed: true };
      await expect(read(value)).rejects.toThrow(/checksum/);
    },
    15_000,
  );

  it("rejects missing evidence and a correctly self-resealed replacement build", async (): Promise<void> => {
    const missing = fixture();
    delete missing.documents[missing.entry.build.path];
    await expect(read(missing)).rejects.toThrow(/Missing genuine Ret source/);
    const resealed = fixture(),
      build = record.parse(resealed.documents[resealed.entry.build.path]);
    build.settings = { player: { equipment: { items: [] } } };
    resealed.entry.build.sha256 = hash(build);
    await expect(read(resealed)).rejects.toThrow(/independent delivery review/);
  });

  it.each([
    "release",
    "revision",
    "database",
    "DPS",
    "settings",
    "missing-template",
    "duplicate-template",
    "changed-template",
  ])(
    "rejects changed %s",
    async (kind: string): Promise<void> => {
      const value = fixture();
      if (kind === "release") value.sourceRelease = "0".repeat(24);
      else if (kind === "revision") value.revision += "-changed";
      else if (kind === "database") value.databaseSha256 = "0".repeat(64);
      else if (kind === "DPS") value.entry.referenceDps += 1;
      else if (kind === "settings") value.entry.settingsSha256 = "0".repeat(64);
      else if (kind === "missing-template") value.entry.requestTemplates.pop();
      else {
        const first = value.entry.requestTemplates[0];
        if (!first) throw new Error("Missing actual Ret wire template");
        if (kind === "duplicate-template") value.entry.requestTemplates[1] = { ...first };
        else first.requestBase64 = "AAAA".repeat(100);
      }
      await expect(read(value)).rejects.toThrow();
    },
    15_000,
  );

  it("rejects another class before reading its evidence", async (): Promise<void> => {
    let reads = 0;
    await expect(
      readFreshRetributionPaladinSimulatorBuild(
        { ...genuine.entry, profile: "shadow_priest" },
        {
          sourceRelease: genuine.sourceRelease,
          revision: genuine.revision,
          databaseSha256: genuine.databaseSha256,
          reviewedBuildSha256: genuine.reviewedBuildSha256,
          reference: async (): Promise<never> => {
            reads++;
            throw new Error("Unexpected read");
          },
        },
      ),
    ).rejects.toThrow();
    expect(reads).toBe(0);
  });

  it("rejects traversal, absolute paths, null bytes and non-JSON evidence", (): void => {
    for (const path of [
      "/etc/passwd",
      "optimization/../private.json",
      "optimization\\private.json",
      "optimization/private\0.json",
      "optimization/raw.ndjson",
    ])
      expect(
        retributionPaladinModelEvidenceReferenceSchema.safeParse({ path, sha256: "a".repeat(64) })
          .success,
      ).toBe(false);
  });
});
