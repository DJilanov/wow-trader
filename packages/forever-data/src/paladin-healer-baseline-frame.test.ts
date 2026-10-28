import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealerFramePayloadSchema,
  paladinHealerJobForFrameConfiguration,
  parsePaladinHealerFramePayload,
  type PaladinHealerFramePayload,
} from "./paladin-healer-frame.js";

const hash = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");
const bytes = readFileSync(
  new URL("./fixtures/paladin-healer-baseline-frames.v2.json.gz", import.meta.url),
);
expect(hash(bytes)).toBe("03cc7909817a8e9bdcad9143f30c3e6315c5078069f469e653c0359bdb1ad1be");
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healer-baseline-frame-fixture.v2"),
    source: z.object({ path: z.string(), byteSha256: z.string() }),
    assets: z
      .array(
        z.object({
          ref: z.object({ file: z.string(), byteSha256: z.string(), bytes: z.number() }),
          payload: z.unknown(),
        }),
      )
      .length(18),
    numericalJobs: z.literal(0),
    publicationAllowed: z.literal(false),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const frames = fixture.assets.map((entry) => parsePaladinHealerFramePayload(entry.payload));
function rejectMutation(mutate: (frame: PaladinHealerFramePayload) => void): void {
  const frame = structuredClone(frames[0]!);
  mutate(frame);
  expect(paladinHealerFramePayloadSchema.safeParse(frame).success).toBe(false);
}

describe("preserved Paladin baseline frames", () => {
  it("retains all 504 genuine baselines, their complete original evidence and actual sample counts", () => {
    expect(fixture.source.byteSha256).toBe(
      "519f82487285cec586acf8454e8a4b482f32952c9ca6ca4d83cd44088b29c709",
    );
    const sampling = new Map<number, number>();
    for (const [position, frame] of frames.entries()) {
      const asset = fixture.assets[position]!;
      expect(frame).toBe(asset.payload);
      const body = JSON.stringify(frame) + "\n";
      expect(hash(body)).toBe(asset.ref.byteSha256);
      expect(Buffer.byteLength(body)).toBe(asset.ref.bytes);
      expect(frame.frame.variant).toEqual({
        kind: frame.frame.assignment,
        layout: "stacked",
        durationSeconds: 180,
      });
      for (const config of frame.configurations) {
        const baseline = config.sourceEvidence.baselineEvidence!;
        expect(config.sourceEvidence.sourceKind).toBe("baseline");
        expect(config.reference.rounds).toEqual(baseline.rounds);
        expect(config.sourceEvidence.numericalRequestKeys).toEqual(baseline.requestKeys);
        expect(config.sourceEvidence.originalResult).toEqual(baseline.origin);
        expect(config.reference.iterations).toBe(
          baseline.rounds.reduce((sum, round): number => sum + round.iterations, 0),
        );
        expect(config.optionId).toBe(baseline.optionId);
        sampling.set(
          config.reference.iterations,
          (sampling.get(config.reference.iterations) ?? 0) + 1,
        );
      }
    }
    expect(Object.fromEntries(sampling)).toEqual({ 256: 376, 1024: 64, 2048: 64 });
  });

  it("resolves the original encoded job and workload for every preserved source reference", () => {
    let count = 0;
    for (const frame of frames)
      for (const config of frame.configurations) {
        const job = paladinHealerJobForFrameConfiguration(frame, config.scenarioId);
        expect(job.requestBase64).toBe(config.job.requestBase64);
        const workloadSha256 = hash(JSON.stringify(job.workload));
        expect(workloadSha256).toBe(config.workloadId);
        expect(
          hash(
            JSON.stringify({
              runtimeSha256: frame.runtimeSha256,
              requestBase64: job.requestBase64,
              workloadSha256,
              detail: false,
            }),
          ),
        ).toBe(config.sourceEvidence.numericalRequestKeys[0]);
        count++;
      }
    expect(count).toBe(504);
  }, 60_000);

  it("rejects a baseline without its actual source evidence or native-origin review", () => {
    rejectMutation((frame): void => {
      delete frame.configurations[0]!.sourceEvidence.baselineEvidence;
    });
    rejectMutation((frame): void => {
      delete frame.configurations[0]!.sourceEvidence.baselineReview;
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.originalResult.byteSha256 = "0".repeat(64);
    });
  });

  it("rejects relabelled sample counts and changed native source keys", () => {
    rejectMutation((frame): void => {
      const reference = frame.configurations[0]!.reference;
      for (const round of reference.rounds) round.iterations = 128;
      reference.iterations = 512;
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.baselineEvidence!.requestKeys[1] = "0".repeat(64);
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.reference.largestPerComparison95Upper = 0.1;
    });
  });

  it("rejects baseline evidence attached to another option, source profile or mechanics scenario", () => {
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.baselineEvidence!.optionId = "0".repeat(64);
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.baselineEvidence!.profileId = "1:2,11";
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.baselineEvidence!.scenarioId = "reference";
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.baselineEvidence!.caseKey = "not-json";
    });
  });

  it("cannot reclassify a baseline as a coupled search or transfer without its required proof", () => {
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.sourceKind = "coupled";
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.sourceEvidence.sourceKind = "profession-transfer";
    });
    const frame = frames[0]!;
    const config = frame.configurations[0]!;
    expect(
      paladinHealerFramePayloadSchema.safeParse({
        ...frame,
        configurations: [
          {
            ...config,
            sourceEvidence: {
              ...config.sourceEvidence,
              baselineEvidence: {
                ...config.sourceEvidence.baselineEvidence,
                hasIndexedHistoricalFailure: true,
              },
            },
          },
          ...frame.configurations.slice(1),
        ],
      }).success,
    ).toBe(false);
  });

  it("retains the four-by-128 requirement for the independently confirmed coupled frames", () => {
    const coupled = z
      .object({ assets: z.array(z.object({ payload: z.unknown() })) })
      .parse(
        JSON.parse(
          gunzipSync(
            readFileSync(new URL("./fixtures/paladin-healer-frames.v2.json.gz", import.meta.url)),
          ).toString("utf8"),
        ),
      );
    const frame = structuredClone(parsePaladinHealerFramePayload(coupled.assets[0]!.payload));
    const config = frame.configurations[0]!;
    for (const round of config.reference.rounds) round.iterations = 64;
    config.reference.iterations = 256;
    expect(paladinHealerFramePayloadSchema.safeParse(frame).success).toBe(false);
    config.sourceEvidence.sourceKind = "baseline";
    expect(paladinHealerFramePayloadSchema.safeParse(frame).success).toBe(false);
  });
});
