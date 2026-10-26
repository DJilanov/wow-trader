import { z } from "zod";
import {
  fullRaidDruidBuildEntrySchema,
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidStatisticsModel,
} from "./forever-simulator-full-raid-druid-schema";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const profile = z.enum(["feral_druid", "balance_druid"]);
const reference = z.object({ path: z.string().min(1).max(350), sha256: digest }).strict();
const profiles = z.tuple([z.literal("feral_druid"), z.literal("balance_druid")]);
const noErrors = z.array(z.never()).length(0);
const recordedAt = z.iso
  .datetime()
  .refine(
    (value: string): boolean =>
      Date.parse(value) >= Date.parse("2026-10-24T23:25:34.014Z") &&
      Date.parse(value) < Date.parse("2026-10-25T23:25:34.014Z"),
    "Druid review is outside the original window",
  );

export const fullRaidDruidProfilePinsSchema = z
  .object({
    release,
    proofSha256: digest,
    buildPins: fullRaidDruidBuildPinsSchema,
    publications: z.object({ feral_druid: digest, balance_druid: digest }).strict(),
    browserReviewSha256: digest,
  })
  .strict();
export type FullRaidDruidProfilePins = z.infer<typeof fullRaidDruidProfilePinsSchema>;

const completedReference = z
  .object({ path: z.string().min(1).max(350), byteSha256: digest, sha256: digest.optional() })
  .strict();
export const fullRaidDruidProfileProofSchema = z
  .object({
    schema: z.literal("kfc-simulator-profile-model-update.druid-full-raid.v1"),
    profiles,
    sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
    release,
    identity: digest,
    sourceManifestSha256: digest,
    nativeBinarySha256: z.literal(fullRaidDruidStatisticsModel.nativeBinarySha256),
    databaseSha256: z.literal(fullRaidDruidStatisticsModel.databaseSha256),
    policySha256: digest,
    typecheckDiagnostics: z.literal(0),
    modelAssets: z.record(
      z.string(),
      z.object({ bytes: z.number().int().nonnegative(), sha256: digest }).strict(),
    ),
    builds: z.tuple([
      fullRaidDruidBuildEntrySchema.options[0].extend({ hrefSha256: digest }).strict(),
      fullRaidDruidBuildEntrySchema.options[1].extend({ hrefSha256: digest }).strict(),
    ]),
    correction: completedReference,
    confirmation: completedReference,
    supervisor: z.object({ runSha256: digest }).passthrough(),
    measurementBridge: z
      .object({
        compiledEmitter: z.literal(false),
        htmlAdapter: z.literal("events-v2"),
        sourceSha256: digest,
        virtualSha256: digest,
        currentHostBrowserReviewRequired: z.literal(true),
      })
      .strict(),
    bossDebuffOverflowQualified: z.literal(false),
  })
  .passthrough();
export type FullRaidDruidProfileProof = z.infer<typeof fullRaidDruidProfileProofSchema>;

export const fullRaidDruidBrowserReviewSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-profile-browser.v1"),
    status: z.literal("passed"),
    capturedAt: recordedAt,
    profiles,
    sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
    release,
    proofSha256: digest,
    uiControls: reference,
    hostReview: reference,
    savedCharacterReview: reference,
    checked: z
      .object({
        exactMeasuredBuilds: z.literal(true),
        completeUnitMetrics: z.literal(true),
        desktopMobile: z.literal(true),
        configAndGearSets: z.literal(true),
        sharesAndSavedCharacters: z.literal(true),
        currentHostCompletionBridge: z.literal(true),
        otherProfilesPreserved: z.literal(true),
        rotationGuide: z.literal(true),
        provisionalConsentOff: z.literal(true),
      })
      .strict(),
    bossDebuffOverflowQualified: z.literal(false),
    errors: noErrors,
  })
  .strict();

export const fullRaidDruidUiControlsSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-ui-control-summary.v1"),
    sourceReport: reference,
    release,
    sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
    records: z
      .array(
        z
          .object({
            id: z.enum(["feral-cat-static", "balance-static"]),
            profile,
            mode: z.enum(["desktop", "mobile"]),
            iterations: z.literal(10000),
            seed: z.literal(77191),
            nativeDps: z.number().finite().positive(),
            browserDps: z.number().finite().positive(),
            completeUnitMetricsVerified: z.literal(true),
            procConsentOff: z.literal(true),
          })
          .passthrough(),
      )
      .length(4),
    freshHoldouts: z.literal(0),
    referenceDpsChanged: z.literal(false),
    errors: noErrors,
  })
  .passthrough();

export const fullRaidDruidHostReviewSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-host-summary.v1"),
    sourceReport: reference,
    status: z.literal("passed"),
    release,
    records: z
      .array(
        z
          .object({
            profile,
            adapterVersion: z.literal("events-v2"),
            successfulNotifications: z.literal(1),
            successExactlyOnce: z.literal(true),
            engineValidationErrorPreserved: z.literal(true),
            cancellationAndLateResultSuppressed: z.literal(true),
            privacyChecks: z.tuple([z.literal("doNotTrack"), z.literal("globalPrivacyControl")]),
            numericalQualificationEvidence: z.literal(false),
          })
          .passthrough(),
      )
      .length(2),
    numericalQualificationEvidence: z.literal(false),
    errors: noErrors,
  })
  .passthrough();

export const fullRaidDruidSavedCharactersSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-saved-character.v1"),
    status: z.literal("passed"),
    release,
    records: z
      .array(
        z
          .object({
            profile,
            mode: z.enum(["desktop", "mobile"]),
            firstVisitDefaultVerified: z.literal(true),
            personalCharacterRestored: z.literal(true),
            personalWeaponEnchantPreserved: z.literal(true),
            personalEncounterPreserved: z.literal(true),
          })
          .passthrough(),
      )
      .length(4),
    nativeJobs: z.literal(0),
    browserCombatJobs: z.literal(0),
    ownerBrowserStorageTouched: z.literal(false),
    errors: noErrors,
  })
  .passthrough();
