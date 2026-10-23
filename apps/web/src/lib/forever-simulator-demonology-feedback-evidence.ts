import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  release = z.string().regex(/^[a-f0-9]{24}$/),
  studyPrefix = "artifacts/forever-simulator/optimization/bounded-native-studies/",
  referenceSchema = z
    .object({
      path: z
        .string()
        .max(240)
        .regex(
          /^artifacts\/forever-simulator\/optimization\/bounded-native-studies\/[a-f0-9]{64}\/(?:completed|result-[a-f0-9]{16})\.json$/,
        ),
      sha256: digest,
    })
    .strict(),
  backendSchema = z
    .object({
      kind: z.literal("admitted-native.v1"),
      binarySha256: digest,
      compiledDatabaseSha256: digest,
      runnerSourceSha256: digest,
      codecSha256: digest,
    })
    .strict(),
  evidenceSchema = z
    .object({
      schema: z.literal("kfc-full-raid-demonology-closed-feedback-summary.v1"),
      sourceCompletion: referenceSchema,
      sourceResult: referenceSchema,
      sourceRelease: release,
      backend: backendSchema,
      closed: z.literal(true),
      gearApplicabilityRequired: z.literal(false),
      settingsSha256: digest,
      stateSha256: digest,
      gearSha256: digest,
      cycles: z.number().int().min(1).max(3),
      finalCycle: z
        .object({
          consumesStoppedForSmallGain: z.literal(true),
          gearStoppedForSmallGain: z.literal(true),
          stateChanged: z.literal(false),
          stateMaterialChange: z.literal(false),
          finalConsumesStoppedForSmallGain: z.literal(true),
          finalConsumesChanged: z.literal(false),
          recheckSettingsSha256: digest,
          finalConsumeSettingsSha256: digest,
        })
        .strict(),
      previousModelNumericalReuse: z.literal(false),
      independentFinalValidation: z.literal(false),
      numericalQualification: z.literal(false),
      scope: z.string().min(1).max(4000),
    })
    .strict();

export interface DemonologyFeedbackEvidenceReference {
  readonly path: string;
  readonly sha256: string;
}

export interface DemonologyFeedbackEvidenceBackend {
  readonly kind: string;
  readonly binarySha256: string;
  readonly compiledDatabaseSha256: string;
  readonly runnerSourceSha256: string;
  readonly codecSha256: string;
}

export interface DemonologyFeedbackEvidenceOptions {
  readonly summaryReference: DemonologyFeedbackEvidenceReference;
  readonly sourceCompletion: DemonologyFeedbackEvidenceReference;
  readonly sourceResult: DemonologyFeedbackEvidenceReference;
  readonly sourceRelease: string;
  readonly backend: DemonologyFeedbackEvidenceBackend;
  readonly settingsSha256: string;
  readonly stateSha256: string;
  readonly gearSha256: string;
}

export type ClosedDemonologyFeedbackEvidence = z.infer<typeof evidenceSchema>;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

/** Checks compact closure against references from a separately reviewed build; it never grants numerical or browser qualification. */
export function readDemonologyClosedFeedbackEvidence(
  raw: unknown,
  options: DemonologyFeedbackEvidenceOptions,
): ClosedDemonologyFeedbackEvidence {
  const evidence = evidenceSchema.parse(raw),
    summaryHash = digest.parse(options.summaryReference.sha256);
  requireMatch(hash(raw) === summaryHash, "Demonology closure checksum changed");
  requireMatch(
    options.summaryReference.path ===
      `artifacts/forever-simulator/optimization/warlock-demonology-full-raid-v1/feedback-evidence-${summaryHash.slice(0, 16)}.json`,
    "Unexpected Demonology closure reference",
  );
  requireMatch(
    isDeepStrictEqual(evidence.sourceCompletion, referenceSchema.parse(options.sourceCompletion)) &&
      isDeepStrictEqual(evidence.sourceResult, referenceSchema.parse(options.sourceResult)),
    "Demonology closure source changed",
  );
  const identity = evidence.sourceCompletion.path.match(
    new RegExp(`^${studyPrefix}([a-f0-9]{64})/completed\\.json$`),
  )?.[1];
  requireMatch(identity, "Demonology closure needs a completed source");
  requireMatch(
    evidence.sourceResult.path ===
      `${studyPrefix}${identity}/result-${evidence.sourceResult.sha256.slice(0, 16)}.json` &&
      hash({
        schema: "kfc-bounded-native-study-completion.v1",
        identity,
        result: evidence.sourceResult,
        publicationAllowed: false,
      }) === evidence.sourceCompletion.sha256,
    "Demonology completion and result references differ",
  );
  requireMatch(
    evidence.sourceRelease === release.parse(options.sourceRelease) &&
      isDeepStrictEqual(evidence.backend, backendSchema.parse(options.backend)),
    "Demonology closure model changed",
  );
  for (const [field, expected] of [
    ["settingsSha256", options.settingsSha256],
    ["stateSha256", options.stateSha256],
    ["gearSha256", options.gearSha256],
  ] as const)
    requireMatch(evidence[field] === digest.parse(expected), "Demonology closure inputs changed");
  requireMatch(
    evidence.finalCycle.recheckSettingsSha256 === evidence.settingsSha256 &&
      evidence.finalCycle.finalConsumeSettingsSha256 === evidence.settingsSha256,
    "Demonology closure used stale final gear or consumes",
  );
  return evidence;
}
