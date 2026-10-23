import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  destructionModelEntrySchema,
  readFreshDestructionSimulatorBuild,
} from "./forever-simulator-fresh-destruction";

const document = z.record(z.string(), z.unknown()),
  fixture = z
    .object({
      schema: z.literal("kfc-destruction-reader-fixture.v1"),
      entry: destructionModelEntrySchema,
      options: z.object({
        sourceRelease: z.string(),
        revision: z.string(),
        databaseSha256: z.string(),
        reviewedBuildSha256: z.string(),
      }),
      documents: z.record(z.string(), document),
      browserHandoffApproved: z.literal(false),
    })
    .parse(
      JSON.parse(
        gunzipSync(
          await readFile(
            fileURLToPath(
              new URL("./fixtures/model-first-pass-destruction.json.gz", import.meta.url),
            ),
          ),
        ).toString("utf8"),
      ),
    );

async function read(
  entry = fixture.entry,
  documents = fixture.documents,
  options = fixture.options,
): ReturnType<typeof readFreshDestructionSimulatorBuild> {
  return readFreshDestructionSimulatorBuild(entry, {
    ...options,
    reference: async (ref): Promise<unknown> => {
      const value = documents[ref.path];
      if (!value) throw new Error("Missing actual Destruction evidence");
      return value;
    },
  });
}

describe("genuine current-engine Destruction numerical delivery", (): void => {
  it("recomputes real two20k range math and binds the exact caster setup, APL, active demon, native/WASM and separate 1% disclosure", async (): Promise<void> => {
    const build = await read();
    expect(build.referenceDps).toBe(732.4696469421692);
    expect(build.validationIterations).toBe(40000);
    expect(build.scope.originalStrictAssessmentAccepted).toBe(true);
    expect(build.scope.noStatisticallyBetterRetainedChallenger).toBe(false);
    expect(build.rotationGuidance.talents).toBe("0/23/28");
    expect(build.rotationGuidance.activeDemon).toBe("Succubus");
    expect(build.rotationGuidance.sacrificedDemon).toBe("NoSummon");
    expect(build.browserHandoffRequired).toBe(true);
    const player = document.parse(build.settings.player),
      equipment = document.parse(player.equipment),
      items = z.array(document).length(17).parse(equipment.items);
    expect(items[14]?.id).toBe(272683);
    expect(items[15]?.id).toBe(22329);
  });

  it("a caller cannot approve a modified export by passing its own replacement checksum", async (): Promise<void> => {
    const documents = structuredClone(fixture.documents),
      build = documents[fixture.entry.build.path];
    if (!build) throw new Error("Missing actual qualified Destruction export");
    build.unreviewedMutation = true;
    const sha256 = createHash("sha256").update(JSON.stringify(build)).digest("hex"),
      path = `artifacts/forever-simulator/optimization/warlock-destruction-full-raid-v1/build-${sha256.slice(0, 16)}.json`;
    documents[path] = build;
    await expect(
      read({ ...fixture.entry, build: { path, sha256 } }, documents, {
        ...fixture.options,
        reviewedBuildSha256: sha256,
      }),
    ).rejects.toThrow(/Unreviewed/);
  });

  it.each(["sourceRelease", "databaseSha256", "revision", "reviewedBuildSha256"] as const)(
    "refuses a different %s",
    async (field): Promise<void> => {
      await expect(
        read(fixture.entry, fixture.documents, { ...fixture.options, [field]: "unreviewed" }),
      ).rejects.toThrow();
    },
  );

  it("rejects different public DPS, missing/duplicate/changed native frames", async (): Promise<void> => {
    await expect(read({ ...fixture.entry, referenceDps: 9999 })).rejects.toThrow();
    await expect(
      read({ ...fixture.entry, requestTemplates: fixture.entry.requestTemplates.slice(1) }),
    ).rejects.toThrow();
    const first = fixture.entry.requestTemplates[0];
    if (!first) throw new Error("Missing actual Destruction selected frame");
    await expect(
      read({
        ...fixture.entry,
        requestTemplates: [first, first, ...fixture.entry.requestTemplates.slice(2)],
      }),
    ).rejects.toThrow();
    await expect(
      read({
        ...fixture.entry,
        requestTemplates: [
          { ...first, requestBase64: "unreviewed" },
          ...fixture.entry.requestTemplates.slice(1),
        ],
      }),
    ).rejects.toThrow();
  });

  it.each(Object.keys(fixture.documents))(
    "requires the genuine immutable source %s",
    async (path): Promise<void> => {
      const documents = structuredClone(fixture.documents),
        value = documents[path];
      if (!value) throw new Error("Missing actual Destruction fixture source");
      documents[path] = { ...value, unexpectedMutation: true };
      await expect(read(fixture.entry, documents)).rejects.toThrow(/checksum/);
    },
  );
});
