import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  raidHunterModelEntrySchema,
  readRaidHunterSimulatorBuild,
  verifiedRaidHunterDeliveries,
  type RaidHunterEvidenceReference,
  type RaidHunterModelEntry,
} from "./forever-simulator-raid-hunter";

const record = z.record(z.string(), z.unknown());
const fixture = z
  .object({
    schema: z.literal("kfc-hunter-raid-reader-fixture.v1"),
    entries: z.array(raidHunterModelEntrySchema).length(3),
    options: z
      .object({ sourceRelease: z.string(), revision: z.string(), databaseSha256: z.string() })
      .strict(),
    documents: record,
  })
  .strict()
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(new URL("./fixtures/hunter-raid-delivery.json.gz", import.meta.url)),
        { maxOutputLength: 64_000_000 },
      ).toString("utf8"),
    ),
  );

function object(value: unknown): Record<string, unknown> {
  return record.parse(value);
}
async function read(
  entry: RaidHunterModelEntry,
  documents: Record<string, unknown> = fixture.documents,
  overrides: Partial<typeof fixture.options> = {},
): Promise<Awaited<ReturnType<typeof readRaidHunterSimulatorBuild>>> {
  return readRaidHunterSimulatorBuild(entry, {
    ...fixture.options,
    ...overrides,
    reference: async (ref: RaidHunterEvidenceReference): Promise<unknown> => {
      if (!Object.hasOwn(documents, ref.path))
        throw new Error("Missing genuine fixture source: " + ref.path);
      return documents[ref.path];
    },
  });
}
describe("current seven-buff Hunter delivery", (): void => {
  it.each(fixture.entries)(
    "authenticates $id against its actual full-gear/state/holdout/browser chain",
    async (entry): Promise<void> => {
      const build = await read(entry),
        player = object(build.settings.player),
        consumes = object(player.consumes);
      expect(build.id).toBe(
        verifiedRaidHunterDeliveries.find((row) => row.id === entry.id)?.internalId,
      );
      expect(build.referenceDps).toBe(entry.referenceDps);
      expect(build.validationIterations).toBe(40000);
      expect(build.scope.fullCurrentPoolSweep).toBe(true);
      expect(build.approval.selectionChanged).toBe(false);
      expect(build.scope.globalOptimalityProven).toBe(false);
      expect(consumes.manaRegenElixir).toBe("GreaterMagebloodElixir");
      expect(object(build.settings.partyBuffs).windfuryTotem).toBe(true);
      expect(build.rotationGuidance.priorityBindings).toHaveLength(
        build.rotationGuidance.priorities.length,
      );
    },
  );
  it("rejects missing, relabelled or other-model exports instead of mixing historical references", async (): Promise<void> => {
    const entry = fixture.entries[0]!;
    await expect(read({ ...entry, id: "hunter-survival-static" })).rejects.toThrow(/Unreviewed/);
    await expect(
      read(entry, fixture.documents, { sourceRelease: "81d964b453f4e6abb50a81e7" }),
    ).rejects.toThrow(/model\/settings/);
    await expect(
      read(entry, fixture.documents, { databaseSha256: "0".repeat(64) }),
    ).rejects.toThrow(/model\/settings/);
    await expect(read({ ...entry, referenceDps: entry.referenceDps + 1 })).rejects.toThrow(
      /model\/settings/,
    );
    const missing = { ...fixture.documents };
    delete missing[entry.build.path];
    await expect(read(entry, missing)).rejects.toThrow(/Missing genuine/);
  });
  it.each([
    "fullGearResult",
    "stateResult",
    "confirmationResult",
    "confirmationDeclaration",
    "confirmationSummary",
    "parity",
  ])("rejects tampered %s before accepting new DPS or provenance", async (field): Promise<void> => {
    const entry = fixture.entries[1]!,
      build = object(fixture.documents[entry.build.path]),
      ref = object(object(build.evidence)[field]),
      path = z.string().parse(ref.path),
      documents = {
        ...fixture.documents,
        [path]: { ...object(fixture.documents[path]), tampered: true },
      };
    await expect(read(entry, documents)).rejects.toThrow(/checksum changed/);
  });
  it("rejects altered gear, removed buffs, invented guide text or precision even when display metadata looks plausible", async (): Promise<void> => {
    const entry = fixture.entries[2]!;
    for (const change of [
      (build: Record<string, unknown>): void => {
        const settings = object(build.settings);
        build.settings = {
          ...settings,
          raidBuffs: { ...object(settings.raidBuffs), graceOfAirTotem: "TristateEffectMissing" },
        };
      },
      (build: Record<string, unknown>): void => {
        build.referenceDps = 9999;
      },
      (build: Record<string, unknown>): void => {
        build.rotationGuidance = {
          ...object(build.rotationGuidance),
          instruction: "Invented unmeasured rotation",
        };
      },
      (build: Record<string, unknown>): void => {
        build.validationIterations = 100000;
      },
    ]) {
      const build = structuredClone(object(fixture.documents[entry.build.path]));
      change(build);
      await expect(
        read(entry, { ...fixture.documents, [entry.build.path]: build }),
      ).rejects.toThrow(/checksum changed/);
    }
  });
});
