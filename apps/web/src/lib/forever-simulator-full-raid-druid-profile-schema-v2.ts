import { z } from "zod";
import {
  fullRaidDruidBuildPinsV2Schema,
  fullRaidDruidBuildV2Schema,
} from "./forever-simulator-full-raid-druid-schema-v2";
import {
  fullRaidDruidProfilePinsSchema,
  fullRaidDruidProfileProofSchema,
  fullRaidDruidUiControlsSchema as originalUiControlsSchema,
} from "./forever-simulator-full-raid-druid-profile-schema";

export {
  fullRaidDruidBrowserReviewSchema,
  fullRaidDruidHostReviewSchema,
  fullRaidDruidSavedCharactersSchema,
} from "./forever-simulator-full-raid-druid-profile-schema";

export const fullRaidDruidProfilePinsV2Schema = fullRaidDruidProfilePinsSchema.extend({
  buildPins: fullRaidDruidBuildPinsV2Schema,
});
export type FullRaidDruidProfilePinsV2 = z.infer<typeof fullRaidDruidProfilePinsV2Schema>;

export const fullRaidDruidProfileProofV2Schema = fullRaidDruidProfileProofSchema.extend({
  supervisor: fullRaidDruidBuildV2Schema.shape.evidence.shape.supervisor,
});
export type FullRaidDruidProfileProofV2 = z.infer<typeof fullRaidDruidProfileProofV2Schema>;

// Replay the saved selected-control protocol. The 10000/77191 comparison
// context normalizes effective settings; it is not the browser control's RNG.
export const fullRaidDruidSelectedControlProtocolV2Schema = z
  .object({ iterations: z.literal(25), seed: z.literal(190870001) })
  .strict();

export const fullRaidDruidUiControlsSchema = originalUiControlsSchema.extend({
  records: z
    .array(
      originalUiControlsSchema.shape.records.element.extend(
        fullRaidDruidSelectedControlProtocolV2Schema.shape,
      ),
    )
    .length(4),
});
