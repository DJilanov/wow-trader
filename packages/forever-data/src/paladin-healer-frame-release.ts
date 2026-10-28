import { z } from "zod";
import { healerReleaseSchema } from "./healing-simulator.js";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const shared = healerReleaseSchema.shape;
const releaseScope = z.enum(["core-three-minute-matrix", "full-encounter-matrix"]);
const sourceReference = z
  .object({ path: z.string().min(1).max(1000), byteSha256: checksum })
  .strict();

export const paladinHealerFrameAdmissionSchema = z
  .object({
    schema: z.literal("kfc-paladin-healer-frame-admission.v1"),
    status: z.literal("passed"),
    completedAt: shared.preparedAt,
    scope: releaseScope,
    release: shared.release,
    modelIdentity: checksum,
    runtimeSha256: checksum,
    indexSha256: checksum,
    catalogSha256: checksum,
    preparedFrames: z.number().int().positive().max(900),
    preparedConfigurations: z.number().int().positive().max(25_200),
    corePresetCoverageComplete: z.literal(true),
    extendedPresetCoverageComplete: z.boolean(),
    professionTransfersComplete: z.literal(true),
    selectedBrowserControlsComplete: z.literal(true),
    hostUiReviewed: z.literal(true),
    finalFailureHistoryAuditComplete: z.literal(true),
    finalFailureAudit: z
      .object({
        checkedGameplayKeys: z.number().int().positive(),
        observedFailureKeys: z.number().int().nonnegative(),
        selectedKnownFailures: z.literal(0),
        databaseSha256: checksum,
      })
      .strict(),
    sourceReview: sourceReference,
    browserReview: sourceReference,
    hostReview: sourceReference,
    checkpoint: sourceReference,
    publicationAllowed: z.literal(true),
  })
  .strict()
  .superRefine((value, context): void => {
    if (
      value.preparedConfigurations !== value.preparedFrames * 28 ||
      value.preparedFrames < (value.scope === "full-encounter-matrix" ? 900 : 270) ||
      (value.scope === "full-encounter-matrix" && !value.extendedPresetCoverageComplete)
    )
      context.addIssue({
        code: "custom",
        message: "Paladin admission is incomplete for its declared scope",
      });
  });
const fixedFiles = [
  "library-index.json",
  "catalog.json",
  "presentation.json",
  "healing.wasm",
  "healing-worker.js",
  "request-codec.js",
  "wasm_exec.js",
] as const;

export const paladinHealerFrameReleaseSchema = z
  .object({
    schema: z.literal("kfc-paladin-healer-browser-release.v2"),
    status: z.enum(["candidate", "published"]),
    scope: releaseScope.default("full-encounter-matrix"),
    release: shared.release,
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    runtimeSha256: checksum,
    indexSha256: checksum,
    catalogSha256: checksum,
    preparedAt: shared.preparedAt,
    files: shared.files,
    encodings: shared.encodings,
    coverage: z
      .object({
        preparedFrames: z.number().int().positive().max(900),
        preparedConfigurations: z.number().int().positive().max(25_200),
        complete: z.boolean(),
      })
      .strict(),
    qualification: z
      .object({
        sourceReviewSha256: checksum.nullable(),
        finalFailureHistoryAuditComplete: z.boolean(),
        professionTransfersComplete: z.boolean(),
        selectedBrowserControlsComplete: z.boolean(),
        hostUiReviewed: z.boolean(),
      })
      .strict(),
    publicationAllowed: z.boolean(),
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    for (const name of fixedFiles) if (!value.files[name]) issue("Missing Paladin asset " + name);
    const frames = Object.keys(value.files).filter((name): boolean =>
      /^frame-(?:[a-f0-9]{32}|[a-f0-9]{64})\.json$/.test(name),
    );
    if (
      Object.keys(value.files).some(
        (name): boolean =>
          !fixedFiles.some((fixed): boolean => fixed === name) && !frames.includes(name),
      ) ||
      Object.keys(value.encodings ?? {}).some((name): boolean => !value.files[name]) ||
      Object.entries(value.files).some(
        ([name, identity]): boolean =>
          (name.endsWith(".json") && identity.bytes > 8_000_000) ||
          identity.bytes > 128 * 1024 ** 2,
      )
    )
      issue("Invalid or private Paladin release asset");
    if (
      value.files["library-index.json"]?.sha256 !== value.indexSha256 ||
      value.files["catalog.json"]?.sha256 !== value.catalogSha256 ||
      frames.length !== value.coverage.preparedFrames ||
      value.coverage.preparedConfigurations !== frames.length * 28 ||
      value.coverage.complete !== (frames.length === 900)
    )
      issue("Paladin release coverage or source identity mismatch");
    const qualified = value.qualification;
    if (
      value.status === "published" &&
      ((value.scope === "full-encounter-matrix"
        ? !value.coverage.complete
        : value.coverage.preparedFrames < 270) ||
        !qualified.sourceReviewSha256 ||
        !qualified.finalFailureHistoryAuditComplete ||
        !qualified.professionTransfersComplete ||
        !qualified.selectedBrowserControlsComplete ||
        !qualified.hostUiReviewed ||
        !value.publicationAllowed)
    )
      issue(
        "Paladin publication requires numerical, transfer and host admission for its declared scope",
      );
    if (value.status === "candidate" && value.publicationAllowed)
      issue("A Paladin review candidate cannot claim publication admission");
  });

export type PaladinHealerFrameRelease = z.infer<typeof paladinHealerFrameReleaseSchema>;
