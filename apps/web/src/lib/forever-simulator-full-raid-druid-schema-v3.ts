import { z } from "zod";
import {
  fullRaidDruidBuildPinsV2Schema,
  fullRaidDruidBuildV2Schema,
} from "./forever-simulator-full-raid-druid-schema-v2";

const base = "artifacts/forever-simulator/optimization/druid-statistics-correction-v1";
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const fullRaidDruidSourceCompatibility = Object.freeze({
  authorization: Object.freeze({
    path: base + "/source-compatible-resume-v1/authorization.json",
    byteSha256: "34824d8202b1e3119cdb019e2aa57c570fba69a23c4475318a39dec955dc12a5",
  }),
  preparation: Object.freeze({
    path: base + "/source-compatible-resume-v1/execution-prepared-v1.json",
    byteSha256: "e0ae49f50886c708283ef85641bddff2922c61666aac33d580a98c059a4af8a8",
  }),
  commandSha256: "f87d54cedab38370ce5b2d7aa8e23e18df566ddcb2cea69d9530aa1cc39a53bf",
  originalCommandSha256: "5cce987dd7b4806391768b2f62b6c64160a12d6eaeb1acf4328e6d95b6e9f99f",
  originalNumericalAuthoritySha256:
    "bfaa220aa6fe5d974475133d8242e2e66aecc6c6ec0fb16dd6226fe4c6a3f4a4",
} as const);

const authorization = z
  .object({
    path: z.literal(fullRaidDruidSourceCompatibility.authorization.path),
    byteSha256: z.literal(fullRaidDruidSourceCompatibility.authorization.byteSha256),
  })
  .strict();
const preparation = z
  .object({
    path: z.literal(fullRaidDruidSourceCompatibility.preparation.path),
    byteSha256: z.literal(fullRaidDruidSourceCompatibility.preparation.byteSha256),
  })
  .strict();
const originalNumericalAuthority = z
  .object({
    classSlug: z.literal("druid"),
    authorizationReference: z.literal("call_8183aa9693344b5d83183075f2db2d03/0"),
    startedAt: z.literal("2026-10-24T23:25:34.014Z"),
    deadlineAt: z.literal("2026-10-25T23:25:34.014Z"),
    originalLedger: z
      .object({
        path: z.literal(
          "artifacts/forever-simulator/optimization/first-pass-class-budgets/druid.json",
        ),
        byteSha256: z.literal("5cf032ae37e105349a6f95b66cb7b348eff695709f5f72814b9827faebc153d9"),
      })
      .strict(),
    phase: z.literal("correction"),
    command: z
      .object({
        classSlug: z.literal("druid"),
        spec: z.literal("both-dps-styles"),
        phase: z.literal("correction"),
        script: z.literal(
          "artifacts/forever-simulator/optimization/review-tools/run-druid-statistics-correction-v1.mjs",
        ),
        args: z.tuple([z.literal("--run")]),
      })
      .strict(),
    commandSha256: z.literal(fullRaidDruidSourceCompatibility.originalCommandSha256),
    commandSource: z
      .object({
        path: z.literal(
          "artifacts/forever-simulator/optimization/review-tools/run-druid-statistics-correction-v1.mjs",
        ),
        byteSha256: z.literal("8e8ef8381b240377fa0cee1c7fd746abd1c24dfac655a86ad57795ef23612f21"),
      })
      .strict(),
    sourceRelease: z.literal("57ac00a190de1da00d51b72d"),
  })
  .strict();
const supervisor = fullRaidDruidBuildV2Schema.shape.evidence.shape.supervisor
  .extend({
    commandSha256: z.literal(fullRaidDruidSourceCompatibility.commandSha256),
    authorization,
    preparation,
    predecessorOriginalCommandSha256: z.literal(
      fullRaidDruidSourceCompatibility.originalCommandSha256,
    ),
  })
  .strict();

export const fullRaidDruidBuildPinsV3Schema = fullRaidDruidBuildPinsV2Schema;
export type FullRaidDruidBuildPinsV3 = z.infer<typeof fullRaidDruidBuildPinsV3Schema>;

// Only execution provenance changes. Every numerical, model, guidance and scope
// constraint comes from the frozen V2 build schema without rewriting its data.
export const fullRaidDruidBuildV3Schema = fullRaidDruidBuildV2Schema.extend({
  evidence: fullRaidDruidBuildV2Schema.shape.evidence.extend({
    correction: z
      .object({
        path: z
          .string()
          .regex(
            /^artifacts\/forever-simulator\/optimization\/druid-statistics-correction-v1\/source-compatible-resume-v1\/completed-[a-f0-9-]{36}\.json$/,
          ),
        byteSha256: digest,
        sha256: digest.optional(),
      })
      .strict(),
    supervisor,
    compatibleExecution: z
      .object({
        authorization,
        preparation,
        supervisor,
        originalNumericalAuthority,
      })
      .strict(),
  }),
});
export type ReviewedFullRaidDruidBuildV3 = z.infer<typeof fullRaidDruidBuildV3Schema>;
