import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fullRaidDemonologyModelEntrySchema,
  readFreshFullRaidDemonologySimulatorBuild,
} from "./forever-simulator-fresh-full-raid-demonology";

const document = z.record(z.string(), z.unknown()),
  fixture = z
    .object({
      schema: z.literal("kfc-full-raid-demonology-reader-fixture.v1"),
      entry: fullRaidDemonologyModelEntrySchema,
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
              new URL("./fixtures/model-first-pass-full-raid-demonology.json.gz", import.meta.url),
            ),
          ),
        ).toString("utf8"),
      ),
    );

async function read(
  entry = fixture.entry,
  documents = fixture.documents,
  options = fixture.options,
): ReturnType<typeof readFreshFullRaidDemonologySimulatorBuild> {
  return readFreshFullRaidDemonologySimulatorBuild(entry, {
    ...options,
    reference: async (ref): Promise<unknown> => {
      const value = documents[ref.path];
      if (!value) throw new Error("Missing actual Demonology evidence");
      return value;
    },
  });
}

describe("genuine current-engine Demonology numerical delivery", (): void => {
  it("recomputes real two20k range math and binds the exact caster setup, APL, active demon, native/WASM and separate 1% disclosure", async (): Promise<void> => {
    const build = await read();
    expect(build.referenceDps).toBe(855.2753026692233);
    expect(build.validationIterations).toBe(40000);
    expect(build.scope.originalStrictAssessmentAccepted).toBe(true);
    expect(build.scope.noStatisticallyBetterRetainedChallenger).toBe(false);
    expect(build.rotationGuidance.talents).toBe("2/31/18");
    expect(build.rotationGuidance.activeDemon).toBe("Succubus");
    expect(build.rotationGuidance.sacrificedDemon).toBe("Imp");
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
    if (!build) throw new Error("Missing actual qualified Demonology export");
    build.unreviewedMutation = true;
    const sha256 = createHash("sha256").update(JSON.stringify(build)).digest("hex"),
      path = `artifacts/forever-simulator/optimization/warlock-demonology-full-raid-v1/build-${sha256.slice(0, 16)}.json`;
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
    if (!first) throw new Error("Missing actual Demonology selected frame");
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

  it("verifies compact closure and source completions without reading either large research trace", async (): Promise<void> => {
    const build = document.parse(fixture.documents[fixture.entry.build.path]),
      evidence = document.parse(build.evidence),
      pathSchema = z.object({ path: z.string() }),
      offline = new Set([
        pathSchema.parse(evidence.feedbackResult).path,
        pathSchema.parse(evidence.finalGearInspectionResult).path,
      ]),
      seen: string[] = [];
    for (const path of offline) expect(fixture.documents).not.toHaveProperty(path);
    await readFreshFullRaidDemonologySimulatorBuild(fixture.entry, {
      ...fixture.options,
      reference: async (ref): Promise<unknown> => {
        expect(offline.has(ref.path)).toBe(false);
        seen.push(ref.path);
        const value = fixture.documents[ref.path];
        if (!value) throw new Error("Missing actual compact reader evidence");
        return value;
      },
    });
    expect(seen).toContain(pathSchema.parse(evidence.feedbackSummary).path);
    expect(new Set(seen).size).toBe(11);
  });

  it("retains the actual raw-selected target bound without converting it into a player buff cap or global enforcement claim", async (): Promise<void> => {
    const build = await read(),
      evidence = document.parse(build.evidence),
      parity = document.parse(
        fixture.documents[z.object({ path: z.string() }).parse(evidence.parity).path],
      ),
      budget = document.parse(document.parse(parity.parity).targetAuraBudget);
    expect(budget.playerBuffLimit).toBeNull();
    expect(budget.playerAuraRows).toBe(33);
    expect(budget.observedConservativeBoundPassed).toBe(true);
    expect(budget.globalSixteenSlotEnforcementProven).toBe(false);
    expect(build.scope.selectedObservedTargetAuraBoundPassed).toBe(true);
    expect(build.scope.targetAuraObservationIterations).toBe(10000);
    expect(build.rotationGuidance.prepull).toHaveLength(1);
  });

  it.each(Object.keys(fixture.documents))(
    "requires the genuine immutable source %s",
    async (path): Promise<void> => {
      const documents = structuredClone(fixture.documents),
        value = documents[path];
      if (!value) throw new Error("Missing actual Demonology fixture source");
      documents[path] = { ...value, unexpectedMutation: true };
      await expect(read(fixture.entry, documents)).rejects.toThrow(/checksum/);
    },
  );
});
