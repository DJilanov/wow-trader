import { z } from "zod";
import { fullRaidDruidBrowserReviewSchema as historicalBrowserSchema } from "./forever-simulator-full-raid-druid-profile-schema-v3";
import { fullRaidDruidDeliveryValidationSchema } from "./forever-simulator-full-raid-druid-delivery-validation-v2";

export {
  fullRaidDruidPresetReviewSchema,
  fullRaidDruidHostReviewSchema,
  fullRaidDruidProfilePinsV3Schema,
  fullRaidDruidProfileProofV3Schema,
  fullRaidDruidSavedCharactersSchema,
  fullRaidDruidUiControlsSchema,
  type FullRaidDruidProfilePinsV3,
  type FullRaidDruidProfileProofV3,
} from "./forever-simulator-full-raid-druid-profile-schema-v3";

export const fullRaidDruidBrowserReviewSchema = historicalBrowserSchema
  .extend({
    release: z.literal("ce2375bbbbc13f564a8717f3"),
    capturedAt: z.iso.datetime(),
    deliveryValidation: fullRaidDruidDeliveryValidationSchema,
  })
  .superRefine((value, context): void => {
    const start = Date.parse(value.deliveryValidation.startedAt),
      end = Date.parse(value.deliveryValidation.deadlineAt),
      capture = Date.parse(value.capturedAt);
    if (end - start !== 7_200_000 || capture < start || capture >= end)
      context.addIssue({
        code: "custom",
        message: "Druid review is outside the authorized delivery window",
      });
  });
