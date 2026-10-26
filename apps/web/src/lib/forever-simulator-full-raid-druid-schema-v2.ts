import { z } from "zod";
import {
  fullRaidDruidBuildPinsSchema,
  fullRaidDruidBuildSchema,
} from "./forever-simulator-full-raid-druid-schema";

export const fullRaidDruidBuildPinsV2Schema = fullRaidDruidBuildPinsSchema
  .extend({ supervisorRunId: z.uuid() })
  .strict();
export type FullRaidDruidBuildPinsV2 = z.infer<typeof fullRaidDruidBuildPinsV2Schema>;

// The numerical export format, command, model and window stay unchanged. Only
// the reviewed supervisor attempt is supplied by completed-source admission.
export const fullRaidDruidBuildV2Schema = fullRaidDruidBuildSchema.extend({
  evidence: fullRaidDruidBuildSchema.shape.evidence.extend({
    supervisor: fullRaidDruidBuildSchema.shape.evidence.shape.supervisor
      .extend({ runId: z.uuid() })
      .strict(),
  }),
});
export type ReviewedFullRaidDruidBuildV2 = z.infer<typeof fullRaidDruidBuildV2Schema>;
