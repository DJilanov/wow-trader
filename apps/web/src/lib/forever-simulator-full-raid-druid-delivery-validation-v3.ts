import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { z } from "zod";

const directory =
  "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v2";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z
  .object({ path: z.string().min(1).max(350), sha256: digest, byteSha256: digest })
  .strict();
const authorizationByteSha256 = "f7672afb961fe1282f503c8fe7ca7ede3c902814328f87afc04a517e8a5198af";
const authorizationSha256 = "7f992a99f867f4f2e0c388aad778adede7aafc474065d3113ac5750ae9d0db5b";
const originalDeadline = "2026-10-25T23:25:34.014Z";
const maximumDurationMs = 3_600_000;
const preparationReference = reference.omit({ byteSha256: true }).extend({
  path: z
    .string()
    .regex(
      /^artifacts\/forever-simulator\/optimization\/druid-statistics-correction-v1\/delivery-validation-v2\/preparations\/prepared-[a-f0-9]{16}\.json$/,
    ),
});
const authorizationReference = reference.extend({
  path: z.literal(directory + "/authorization.json"),
  sha256: z.literal(authorizationSha256),
  byteSha256: z.literal(authorizationByteSha256),
});

export const fullRaidDruidDeliveryValidationSchema = z
  .object({
    schema: z.literal("kfc-druid-separate-delivery-validation-record.v1"),
    authorization: authorizationReference,
    window: reference.extend({ path: z.literal(directory + "/window.json") }),
    preparation: preparationReference,
    originalStudyDeadlineAt: z.literal(originalDeadline),
    startedAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    maximumDurationMs: z.literal(maximumDurationMs),
  })
  .strict();

const authorizationSchema = z
  .object({
    schema: z.literal("kfc-druid-separate-delivery-validation-authorization.v1"),
    recordedAt: z.iso.datetime(),
    questionReference: z.literal("user-message:2026-10-26:finish-checks-and-lets-go"),
    question: z.string().min(1).max(2000),
    answer: z.literal("finish checks and lets go"),
    profiles: z.tuple([z.literal("feral_druid"), z.literal("balance_druid")]),
    maximumDurationMs: z.literal(maximumDurationMs),
    startsWithFirstActualCheck: z.literal(true),
    originalStudyStartedAt: z.literal("2026-10-24T23:25:34.014Z"),
    originalStudyDeadlineAt: z.literal(originalDeadline),
    sourceRelease: z.literal("57ac00a190de1da00d51b72d"),
    deliveryRelease: z.literal("ce2375bbbbc13f564a8717f3"),
    numericalInputsMustRemainUnchanged: z.literal(true),
    existingEvidenceMustRemainUnchanged: z.literal(true),
    originalFrozenSourcesMustRemainUnchanged: z.literal(true),
    originalStudyDeadlineMustRemainUnchanged: z.literal(true),
    optimizationSearchAuthorized: z.literal(false),
    deploymentAuthorized: z.literal(false),
    windowStarted: z.literal(false),
    previousAuthorization: reference.extend({
      path: z.literal(
        "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v1/authorization.json",
      ),
      sha256: z.literal("e88010512c024eb612b7c3068f690e22dfefa9002f679f5a799e98a572bc0bde"),
      byteSha256: z.literal("bab81b0b19bc512b0cdd2664bf2386bb537b4fd862b64eb4597d132259a0dd6d"),
    }),
    previousWindow: reference.extend({
      path: z.literal(
        "artifacts/forever-simulator/optimization/druid-statistics-correction-v1/delivery-validation-v1/window.json",
      ),
      sha256: z.literal("47cf0a37e2c11fb6f8d6ab7abdebe28b5e72b0b5f68e9772b1e998accd804ecf"),
      byteSha256: z.literal("c8122d5134e65a7f16cf54f004c0ba72b8e8a4340b8edd0dd3f45d54a6e3f252"),
    }),
  })
  .strict();

const windowSchema = z
  .object({
    schema: z.literal("kfc-druid-separate-delivery-validation-window.v1"),
    authorization: authorizationReference,
    startedAt: z.iso.datetime(),
    deadlineAt: z.iso.datetime(),
    maximumDurationMs: z.literal(maximumDurationMs),
    originalStudyDeadlineAt: z.literal(originalDeadline),
    sourceRelease: z.literal("57ac00a190de1da00d51b72d"),
    deliveryRelease: z.literal("ce2375bbbbc13f564a8717f3"),
    firstPreparation: preparationReference,
    optimizationSearchAuthorized: z.literal(false),
    deploymentAuthorized: z.literal(false),
  })
  .strict();

export interface DruidDeliveryAuthorityDocument {
  readonly value: unknown;
  readonly sha256: string;
}

function requireMatch(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Validate immutable approval-time authority; a completed approval survives clock expiry. */
export function verifyFullRaidDruidDeliveryAuthorityV3(
  input: z.infer<typeof fullRaidDruidDeliveryValidationSchema>,
  capturedAt: string,
  authorizationDocument: DruidDeliveryAuthorityDocument,
  windowDocument: DruidDeliveryAuthorityDocument,
  preparationDocument: DruidDeliveryAuthorityDocument,
): void {
  const metadata = fullRaidDruidDeliveryValidationSchema.parse(input),
    authorization = authorizationSchema.parse(authorizationDocument.value),
    window = windowSchema.parse(windowDocument.value),
    preparation = z
      .object({
        schema: z.literal("kfc-druid-delivery-validation-preparation.v1"),
        status: z.literal("prepared-not-started"),
        authorization: authorizationReference,
        checksPassed: z.literal(true),
        nativeJobs: z.literal(0),
        optimizationSearchAuthorized: z.literal(false),
        deploymentAuthorized: z.literal(false),
      })
      .passthrough()
      .parse(preparationDocument.value),
    timestamp = Date.parse(capturedAt),
    startedAt = Date.parse(window.startedAt),
    deadlineAt = Date.parse(window.deadlineAt);
  requireMatch(
    authorizationDocument.sha256 === authorizationByteSha256,
    "Druid delivery authorization bytes changed",
  );
  requireMatch(
    createHash("sha256").update(JSON.stringify(authorizationDocument.value)).digest("hex") ===
      metadata.authorization.sha256,
    "Druid delivery authorization value changed",
  );
  requireMatch(
    windowDocument.sha256 === metadata.window.byteSha256,
    "Druid delivery window bytes changed",
  );
  requireMatch(
    createHash("sha256").update(JSON.stringify(windowDocument.value)).digest("hex") ===
      metadata.window.sha256,
    "Druid delivery window value changed",
  );
  requireMatch(
    isDeepStrictEqual(window.authorization, metadata.authorization),
    "Druid delivery authorization reference changed",
  );
  requireMatch(
    window.startedAt === metadata.startedAt && window.deadlineAt === metadata.deadlineAt,
    "Druid approval identifies another delivery window",
  );
  requireMatch(
    startedAt >= Date.parse(authorization.recordedAt),
    "Druid validation precedes authorization",
  );
  requireMatch(
    deadlineAt - startedAt === maximumDurationMs,
    "Druid delivery window exceeds its authorized duration",
  );
  requireMatch(
    Number.isFinite(timestamp) && timestamp >= startedAt && timestamp < deadlineAt,
    "Druid approval is outside the separate validation window",
  );
  requireMatch(timestamp <= Date.now(), "Druid approval capture cannot be in the future");
  // The supervisor transports a content-addressed reference, without a byte digest.
  requireMatch(
    createHash("sha256").update(JSON.stringify(preparationDocument.value)).digest("hex") ===
      metadata.preparation.sha256,
    "Druid delivery preparation value changed",
  );
  requireMatch(
    metadata.preparation.path.endsWith(
      "/prepared-" + metadata.preparation.sha256.slice(0, 16) + ".json",
    ),
    "Druid preparation path does not identify its content",
  );
  requireMatch(
    isDeepStrictEqual(preparation.authorization, metadata.authorization),
    "Druid preparation identifies another authorization",
  );
}
