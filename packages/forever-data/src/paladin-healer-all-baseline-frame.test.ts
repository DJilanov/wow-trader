import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { parsePaladinHealerFramePayload } from "./paladin-healer-frame.js";
import { parsePaladinHealerFullPresentation } from "./paladin-healer-presentation.js";
import {
  configurationForPaladinHealerFrame,
  paladinHealerFrameBrowserInput,
  paladinHealerFullConfigurationProblem,
} from "./paladin-healer-workspace.js";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const body = readFileSync(
  new URL("./fixtures/paladin-healer-all-baseline-frames.v2.json.gz", import.meta.url),
);
expect(hash(body)).toBe("ca0c24bb33cbda1e539de35a83f9d7cfc40a09adc19bbf000489191691511574");
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healer-all-baseline-frame-fixture.v2"),
    source: z.object({ path: z.string(), byteSha256: z.string() }).strict(),
    assets: z
      .array(
        z
          .object({
            ref: z.object({ file: z.string(), byteSha256: z.string(), bytes: z.number() }).strict(),
            payload: z.unknown(),
          })
          .strict(),
      )
      .length(108),
    numericalJobs: z.literal(0),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .parse(JSON.parse(gunzipSync(body).toString("utf8")));
const frames = fixture.assets.map((asset) => parsePaladinHealerFramePayload(asset.payload));
const configurations = new Map(
  frames.flatMap((frame) =>
    frame.configurations.map((configuration) => [configuration.id, configuration] as const),
  ),
);
function readFixture(name: string): Buffer {
  return gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)));
}
const catalogBody = readFixture("paladin-healer-catalog.v2.json.gz");
const catalog = parsePaladinHealerFullCatalog(JSON.parse(catalogBody.toString("utf8")));
const presentation = parsePaladinHealerFullPresentation(
  catalog,
  JSON.parse(readFixture("paladin-healer-presentation.v2.json.gz").toString("utf8")),
  hash(catalogBody),
);

describe("all original Paladin baseline profiles", () => {
  it("retains all 3024 cases across the 108 genuine groups and their original sample sizes", () => {
    expect(fixture.source.byteSha256).toBe(
      "2e5e73bc16d846706527c00004ae897939a89fe60208631567dcc6c4a4952acb",
    );
    expect(configurations.size).toBe(3024);
    expect(new Set(frames.map((frame) => frame.frame.id)).size).toBe(108);
    const profiles = new Map<string, number>();
    const sampling = new Map<number, number>();
    for (const [index, frame] of frames.entries()) {
      const ref = fixture.assets[index]!.ref;
      const bytes = JSON.stringify(frame) + "\n";
      expect(hash(bytes)).toBe(ref.byteSha256);
      expect(Buffer.byteLength(bytes)).toBe(ref.bytes);
      profiles.set(frame.frame.profileId, (profiles.get(frame.frame.profileId) ?? 0) + 1);
      expect(frame.admission.finalFailureHistoryAuditComplete).toBe(false);
      expect(frame.admission.professionTransfersComplete).toBe(false);
      expect(frame.fullClassQualified).toBe(false);
      expect(frame.publicationAllowed).toBe(false);
      for (const source of frame.configurations) {
        const baseline = source.sourceEvidence.baselineEvidence!;
        expect(source.reference.rounds).toEqual(baseline.rounds);
        expect(source.sourceEvidence.numericalRequestKeys).toEqual(baseline.requestKeys);
        expect(source.sourceEvidence.numericalProfessions).toEqual(frame.frame.context.professions);
        sampling.set(
          source.reference.iterations,
          (sampling.get(source.reference.iterations) ?? 0) + 1,
        );
      }
    }
    expect(profiles.size).toBe(12);
    expect([...profiles.values()].every((count): boolean => count === 9)).toBe(true);
    expect(Object.fromEntries(sampling)).toEqual({ 256: 2640, 1024: 192, 2048: 192 });
  }, 60_000);

  it("admits each profile, archetype and assignment reference through the full gear and browser-input boundary", () => {
    const release = catalog.modelIdentity.slice(0, 24);
    for (const payload of frames) {
      const source = payload.configurations.find(
        (configuration): boolean => configuration.scenarioId === "reference",
      )!;
      const config = configurationForPaladinHealerFrame(payload, release, source.scenarioId);
      expect(
        paladinHealerFullConfigurationProblem(catalog, presentation, payload, config, release),
      ).toBeNull();
      config.iterations = source.reference.rounds[0]!.iterations;
      const input = paladinHealerFrameBrowserInput(payload, config, release, {
        id: source.job.id,
        seed: source.reference.rounds[0]!.seed,
      });
      expect(input.sourceRequestBase64).toBe(source.job.requestBase64);
      expect(input.sourceContext).toEqual(payload.frame.context);
      expect(input.gear).toEqual(source.option.gear.items);
      expect(input.fields).toEqual(source.option.state.fields);
      expect(hash(JSON.stringify(input.workload))).toBe(source.workloadId);
    }
  }, 120_000);

  it("preserves every previously delivered default-profile build while adding the other profession profiles", () => {
    const previous = z
      .object({ assets: z.array(z.object({ payload: z.unknown() })) })
      .parse(JSON.parse(readFixture("paladin-healer-baseline-frames.v2.json.gz").toString("utf8")));
    let compared = 0;
    for (const asset of previous.assets) {
      const old = parsePaladinHealerFramePayload(asset.payload);
      for (const source of old.configurations) {
        const current = configurations.get(source.id)!;
        expect(current).toBeDefined();
        expect(current.option).toEqual(source.option);
        expect(current.optionId).toBe(source.optionId);
        expect(current.job).toEqual(source.job);
        expect(current.reference).toEqual(source.reference);
        expect(current.workloadId).toBe(source.workloadId);
        expect(current.sourceEvidence.baselineEvidence).toEqual(
          source.sourceEvidence.baselineEvidence,
        );
        compared++;
      }
    }
    expect(compared).toBe(504);
  }, 60_000);
});
