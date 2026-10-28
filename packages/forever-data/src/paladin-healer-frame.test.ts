import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  paladinHealerFrameDescriptorSchema,
  paladinHealerFramePayloadSchema,
  paladinHealerJobForFrameConfiguration,
  paladinHealerFrameWorkloadProblem,
  parsePaladinHealerFramePayload,
  type PaladinHealerFramePayload,
} from "./paladin-healer-frame.js";
import { paladinHealerGroupPayloadSchema } from "./paladin-healer-library-payloads.js";

const checksum = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");
const hash = (value: unknown): string => checksum(JSON.stringify(value));
const bytes = readFileSync(new URL("./fixtures/paladin-healer-frames.v2.json.gz", import.meta.url));
expect(checksum(bytes)).toBe("dd2136408c0c62d2e8513527f8942cea2becacff9254e72862e6033941c3b7d8");
const fixture = z
  .object({
    schema: z.literal("kfc-paladin-healer-frame-fixture.v2"),
    source: z.object({ path: z.string(), byteSha256: z.string() }),
    nativeOriginReview: z.object({ path: z.string(), byteSha256: z.string() }),
    assets: z
      .array(
        z.object({
          ref: z.object({ file: z.string(), byteSha256: z.string(), bytes: z.number() }),
          payload: z.unknown(),
        }),
      )
      .length(2),
    numericalJobs: z.literal(0),
    publicationAllowed: z.literal(false),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const frames = fixture.assets.map((entry): PaladinHealerFramePayload =>
  parsePaladinHealerFramePayload(entry.payload),
);
function cloneFrame(position = 0): PaladinHealerFramePayload {
  const frame = frames[position];
  if (!frame) throw new Error("Missing authentic Paladin frame");
  return structuredClone(frame);
}
function rejectMutation(mutate: (frame: PaladinHealerFramePayload) => void, position = 0): void {
  const frame = cloneFrame(position);
  mutate(frame);
  expect(paladinHealerFramePayloadSchema.safeParse(frame).success).toBe(false);
}

describe("current Paladin healing frame payloads", () => {
  it("admits the two authentic frames without changing their payload bytes", () => {
    expect(fixture.source.byteSha256).toBe(
      "7da6e9b494d6fd3c749e0f4933d6ef29d38da788088968709ccb8307f871c437",
    );
    expect(fixture.nativeOriginReview.byteSha256).toBe(
      "02abe5df7e3686c81be99f77eb1e92f7516a9105f04e029a4b1859f7222dc356",
    );
    expect(frames.map((entry): number => entry.frame.variant.durationSeconds)).toEqual([180, 300]);
    for (const [position, frame] of frames.entries()) {
      const asset = fixture.assets[position];
      if (!asset) throw new Error("Missing authentic asset");
      expect(frame).toBe(asset.payload);
      const encoded = JSON.stringify(frame) + "\n";
      expect(checksum(encoded)).toBe(asset.ref.byteSha256);
      expect(Buffer.byteLength(encoded)).toBe(asset.ref.bytes);
      expect(frame.source.bank.byteSha256).toBe(
        "c491ef44aa50bb341196ca1c3c4b1e87f35054a917c1d261e5b9c00d4406ea3d",
      );
      expect(frame.source.nativeOriginReview).toEqual(fixture.nativeOriginReview);
      expect(frame.fullClassQualified).toBe(false);
      expect(frame.publicationAllowed).toBe(false);
    }
  });

  it("resolves all 56 original requests with their measured workloads and profession aliases", () => {
    let configurations = 0;
    let aliases = 0;
    for (const frame of frames) {
      for (const workload of frame.workloads) expect(hash(workload.frame)).toBe(workload.id);
      for (const config of frame.configurations) {
        const job = paladinHealerJobForFrameConfiguration(frame, config.scenarioId);
        const workload = frame.workloads.find((entry): boolean => entry.id === config.workloadId);
        expect(job.workload).toBe(workload?.frame);
        expect(job.requestBase64).toBe(config.job.requestBase64);
        expect(
          hash({
            runtimeSha256: frame.runtimeSha256,
            requestBase64: job.requestBase64,
            workloadSha256: hash(job.workload),
            detail: false,
          }),
        ).toBe(config.sourceEvidence.requestedFirstRequestKey);
        if (
          config.sourceEvidence.requestedFirstRequestKey !==
          config.sourceEvidence.numericalRequestKeys[0]
        )
          aliases++;
        configurations++;
      }
      const reference = frame.configurations.find(
        (entry): boolean => entry.scenarioId === "reference",
      );
      expect(paladinHealerJobForFrameConfiguration(frame).requestBase64).toBe(
        reference?.job.requestBase64,
      );
    }
    expect(configurations).toBe(56);
    expect(aliases).toBeGreaterThan(0);
  });

  it("preserves all 25 adaptive policies and complete build identities without invented state IDs", () => {
    const configurations = frames.flatMap((frame) => frame.configurations);
    expect(configurations.filter((entry): boolean => Boolean(entry.adaptivePolicy))).toHaveLength(
      25,
    );
    for (const entry of configurations) {
      expect(entry.option.state.id).toBeUndefined();
      expect(entry.option.gear.items).toHaveLength(17);
      expect(
        Object.values(entry.option.state.fields).reduce((sum, value): number => sum + value, 0),
      ).toBe(51);
      expect(
        hash({
          schema: "kfc-paladin-coupled-feedback-build.v1",
          option: { ...entry.option, state: { talentsString: entry.option.state.talentsString } },
          adaptivePolicy: entry.adaptivePolicy,
        }),
      ).toBe(entry.optionId);
    }
  });

  it("rejects incomplete scenarios and duplicate cases", () => {
    rejectMutation((frame): void => {
      frame.configurations.pop();
    });
    rejectMutation((frame): void => {
      frame.configurations[1] = frame.configurations[0]!;
    });
    rejectMutation((frame): void => {
      frame.defaultConfigurationId = frame.configurations[0]!.id;
    });
  });

  it("rejects changed encounter duration even when the frame ID is changed consistently", () => {
    rejectMutation((frame): void => {
      frame.frame.variant.durationSeconds = 300;
      frame.frame.id = frame.frame.id.replace(/180$/, "300");
    });
  });

  it("recognizes genuine original stacked workloads without adding a fictitious suffix", () => {
    const original = z
      .object({
        assets: z.array(z.object({ ref: z.object({ file: z.string() }), payload: z.unknown() })),
      })
      .parse(
        JSON.parse(
          gunzipSync(
            readFileSync(
              new URL("./fixtures/paladin-healer-library-payloads.v1.json.gz", import.meta.url),
            ),
          ).toString("utf8"),
        ),
      );
    const groups = original.assets.filter((entry): boolean => entry.ref.file.startsWith("group-"));
    expect(groups).toHaveLength(18);
    for (const asset of groups) {
      const group = paladinHealerGroupPayloadSchema.parse(asset.payload);
      const descriptor = paladinHealerFrameDescriptorSchema.parse({
        archetype: group.group.archetype,
        assignment: group.group.assignment,
        profileId: group.group.profileId,
        context: group.group.context,
        id: group.group.id + "|stacked|180",
        variant: { kind: group.group.assignment, durationSeconds: 180, layout: "stacked" },
      });
      for (const workload of group.workloads)
        expect(paladinHealerFrameWorkloadProblem(descriptor, workload.frame)).toBeNull();
    }
  });

  it("rejects a position change even when the workload keeps the original spread name", () => {
    rejectMutation((frame): void => {
      frame.workloads[0]!.frame.targets[1]!.x = 2;
    });
  });

  it("rejects invalid frame dimensions and profession order", () => {
    const descriptor = cloneFrame().frame;
    expect(paladinHealerFrameDescriptorSchema.safeParse(descriptor).success).toBe(true);
    expect(
      paladinHealerFrameDescriptorSchema.safeParse({ ...descriptor, assignment: "tank" }).success,
    ).toBe(false);
    rejectMutation((frame): void => {
      frame.frame.context.professions.reverse();
    });
    rejectMutation((frame): void => {
      frame.frame.profileId = "2:4,11";
    });
    rejectMutation((frame): void => {
      frame.frame.variant.kind = "tank";
    });
  });

  it("rejects missing coupled provenance, duplicate native requests and false alias identities", () => {
    rejectMutation((frame): void => {
      delete frame.configurations[0]!.sourceEvidence.frozenPlan;
    });
    rejectMutation((frame): void => {
      const evidence = frame.configurations[0]!.sourceEvidence;
      evidence.numericalRequestKeys[1] = evidence.numericalRequestKeys[0]!;
    });
    rejectMutation((frame): void => {
      const evidence = frame.configurations[0]!.sourceEvidence;
      const same = evidence.requestedFirstRequestKey === evidence.numericalRequestKeys[0];
      evidence.numericalProfessions = same ? [1, 2] : [4, 11];
    });
  });

  it("rejects changed reference scores or reused holdout seeds", () => {
    rejectMutation((frame): void => {
      frame.configurations[0]!.reference.hps += 1;
    });
    rejectMutation((frame): void => {
      frame.configurations[0]!.reference.meanMissingHealth += 1;
    });
    rejectMutation((frame): void => {
      const rounds = frame.configurations[0]!.reference.rounds;
      rounds[1]!.seed = rounds[0]!.seed + 1;
    });
  });

  it("rejects missing workload data and unknown scenarios", () => {
    rejectMutation((frame): void => {
      frame.workloads.pop();
    });
    expect(() => paladinHealerJobForFrameConfiguration(cloneFrame(), "missing-scenario")).toThrow(
      "Unknown Paladin frame scenario",
    );
  });

  it("rejects adaptive metadata that differs from the actual priority thresholds", () => {
    rejectMutation((frame): void => {
      const policy = frame.configurations.find((entry): boolean =>
        Boolean(entry.adaptivePolicy),
      )?.adaptivePolicy;
      if (!policy) throw new Error("Missing authentic adaptive policy");
      policy.recoveryHealthFraction = policy.recoveryHealthFraction === 0.3 ? 0.6 : 0.3;
    }, 1);
  });

  it("rejects partial talent builds and premature publication claims", () => {
    rejectMutation((frame): void => {
      frame.configurations[0]!.option.state.fields = {};
    });
    const frame = cloneFrame();
    expect(
      paladinHealerFramePayloadSchema.safeParse({ ...frame, publicationAllowed: true }).success,
    ).toBe(false);
    expect(
      paladinHealerFramePayloadSchema.safeParse({ ...frame, fullClassQualified: true }).success,
    ).toBe(false);
  });
});
