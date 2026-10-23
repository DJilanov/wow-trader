import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import fullRaidDefaults from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import {
  readFreshShockadinSimulatorBuild,
  shockadinModelEntrySchema,
  shockadinModelEvidenceReferenceSchema,
  verifiedShockadinDelivery,
  type ShockadinModelEntry,
  type ShockadinModelEvidenceReference,
} from "./forever-simulator-fresh-shockadin";

const record = z.record(z.string(), z.unknown()),
  genuine = z
    .object({
      schema: z.literal("kfc-shockadin-delivery-fixture.v1"),
      stage: z.literal("qualified-source-before-presentation"),
      notice: z.string().min(1),
      sourceRelease: z.string(),
      revision: z.string(),
      databaseSha256: z.string(),
      reviewedBuildSha256: z.string(),
      entry: shockadinModelEntrySchema,
      documents: record,
    })
    .strict()
    .parse(
      JSON.parse(
        gunzipSync(
          readFileSync(new URL("./fixtures/model-first-pass-shockadin.json.gz", import.meta.url)),
          { maxOutputLength: 64_000_000 },
        ).toString("utf8"),
      ),
    );

interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: ShockadinModelEntry;
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
function read(value: Fixture): ReturnType<typeof readFreshShockadinSimulatorBuild> {
  return readFreshShockadinSimulatorBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reviewedBuildSha256: verifiedShockadinDelivery.buildSha256,
    reference: async (ref: ShockadinModelEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine Shockadin source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}

describe("qualified Shockadin delivery", () => {
  it("reads the actual corrected model, closed all-slot feedback, independent 40k and raw native/WASM parity", async (): Promise<void> => {
    const value = fixture(),
      before = hash(value),
      build = await read(value),
      player = record.parse(build.settings.player),
      items = z.array(record).parse(record.parse(player.equipment).items);
    expect(genuine.reviewedBuildSha256).toBe(verifiedShockadinDelivery.buildSha256);
    expect(build.name).toBe("Shockadin · pre-raid tested");
    expect(build.referenceDps).toBe(762.3068917171573);
    expect(build.validationIterations).toBe(40000);
    expect(player.talentsString).toBe("550030132001112--152250310013301");
    expect(items).toHaveLength(17);
    expect(items[14]?.id).toBe(272682);
    expect(items[16]?.id).toBe(272435);
    expect(build.rotationGuidance.talents).toBe("24/0/27");
    expect(build.rotationGuidance.priorities).toHaveLength(8);
    expect(build.rotationGuidance.prepull).toHaveLength(1);
    expect(build.scope).toMatchObject({
      feedbackCycles: 1,
      currentModelGearSweeps: 3,
      fixedPointWithinDeclaredPolicy: true,
      gearApplicabilityRequired: false,
      originalStrictAssessmentAccepted: true,
      globalOptimalityProven: false,
      livePvpAccessVerified: false,
    });
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.008797609077401259);
    for (const [actual, required] of [
      [build.settings.raidBuffs, fullRaidDefaults.raid],
      [build.settings.partyBuffs, fullRaidDefaults.party],
      [player.buffs, fullRaidDefaults.individual],
    ] as const)
      expect(actual).toMatchObject(required);
    expect(hash(value)).toBe(before);
  }, 15_000);

  it("keeps real same-backend parents and recovered origin totals instead of the last invocation's zero jobs", async (): Promise<void> => {
    const value = fixture(),
      build = await read(value),
      feedback = record.parse(value.documents[build.evidence.feedbackResult.path]),
      invocation = record.parse(feedback.invocation),
      origins = record.parse(feedback.origins);
    expect(invocation.nativeJobs).toBe(0);
    expect(origins.uniqueRecords).toBe(94014);
    expect(build.scope.numericalJobs).toBe(94047);
    expect(build.scope.numericalIterations).toBe(10817540);
    expect(build.scope.numericalCounterScope).toContain("recovered pre-reboot");
    expect(record.parse(value.documents[build.evidence.priorStructuralAnchor.path]).identity).toBe(
      verifiedShockadinDelivery.blueSha256,
    );
    expect(record.parse(value.documents[build.evidence.priorStructuralGear.path]).identity).toBe(
      verifiedShockadinDelivery.gearSha256,
    );
    for (const [ref, count] of [
      [build.evidence.blueControls, 10],
      [build.evidence.gearControls, 14],
      [build.evidence.gearedControls, 23],
    ] as const) {
      const parity = record.parse(record.parse(value.documents[ref.path]).parity);
      expect(parity.expectedClass).toBe(4);
      expect(z.array(record).parse(parity.records)).toHaveLength(count);
    }
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
    await expect(read(missing)).rejects.toThrow(/Missing genuine Shockadin source/);
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
        if (!first) throw new Error("Missing actual Shockadin wire template");
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
      readFreshShockadinSimulatorBuild(
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
        shockadinModelEvidenceReferenceSchema.safeParse({ path, sha256: "a".repeat(64) }).success,
      ).toBe(false);
  });
});
