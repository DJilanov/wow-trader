import { z } from "zod";
import {
  fullRaidDruidBuildPinsV3Schema,
  fullRaidDruidBuildV3Schema,
} from "./forever-simulator-full-raid-druid-schema-v3";
import {
  fullRaidDruidProfilePinsV2Schema,
  fullRaidDruidProfileProofV2Schema,
  fullRaidDruidBrowserReviewSchema as priorBrowserReviewSchema,
} from "./forever-simulator-full-raid-druid-profile-schema-v2";

export {
  fullRaidDruidHostReviewSchema,
  fullRaidDruidSavedCharactersSchema,
  fullRaidDruidUiControlsSchema,
} from "./forever-simulator-full-raid-druid-profile-schema-v2";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1).max(350), sha256: digest }).strict();

export const fullRaidDruidProfilePinsV3Schema = fullRaidDruidProfilePinsV2Schema.extend({
  buildPins: fullRaidDruidBuildPinsV3Schema,
});
export type FullRaidDruidProfilePinsV3 = z.infer<typeof fullRaidDruidProfilePinsV3Schema>;
export const fullRaidDruidProfileProofV3Schema = fullRaidDruidProfileProofV2Schema.extend({
  supervisor: fullRaidDruidBuildV3Schema.shape.evidence.shape.supervisor,
});
export type FullRaidDruidProfileProofV3 = z.infer<typeof fullRaidDruidProfileProofV3Schema>;

export const fullRaidDruidBrowserReviewSchema = priorBrowserReviewSchema.extend({
  presetReview: reference,
});

export const fullRaidDruidPresetReviewSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-preset-interactions.v1"),
    status: z.literal("passed"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    sourceRelease: z.literal("57ac00a190de1da00d51b72d"),
    supervisor: fullRaidDruidBuildV3Schema.shape.evidence.shape.supervisor,
    records: z
      .array(
        z
          .object({
            id: z.enum(["feral-cat-static", "balance-static"]),
            profile: z.enum(["feral_druid", "balance_druid"]),
            mode: z.enum(["desktop", "mobile"]),
            viewport: z
              .object({ width: z.number().int().positive(), height: z.number().int().positive() })
              .strict(),
            firstVisitDefaultVerified: z.literal(true),
            configurationRestoresOwnedSettings: z.literal(true),
            configurationPreservesPersonalEncounterAndBonusStats: z.literal(true),
            gearSetRestoresEquipmentProfessionsAndWeaponConsumes: z.literal(true),
            gearSetPreservesPersonalTalentsRotationEncounterAndManaConsumes: z.literal(true),
            gearSetClearsBonusStatsAsDesigned: z.literal(true),
            uiExportImportAndHashlessReloadVerified: z.literal(true),
            provisionalConsentOff: z.literal(true),
            noHorizontalOverflow: z.literal(true),
            configuredCharacterSha256: digest,
            evidence: reference.extend({ byteSha256: digest }).strict(),
            blockedWorkerRequests: z.literal(0),
            nativeJobs: z.literal(0),
            browserCombatJobs: z.literal(0),
            ownerBrowserStorageTouched: z.literal(false),
            publicationAllowed: z.literal(false),
          })
          .strict(),
      )
      .length(4),
    nativeJobs: z.literal(0),
    browserCombatJobs: z.literal(0),
    ownerBrowserStorageTouched: z.literal(false),
    errors: z.array(z.never()).length(0),
    publicationAllowed: z.literal(false),
  })
  .passthrough();
