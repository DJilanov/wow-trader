import { z } from "zod";

export const campaignProgressSchema = z
  .object({
    selectedActionId: z
      .string()
      .regex(/^[a-z0-9-]{1,180}$/)
      .nullable()
      .default(null),
    completion: z
      .record(z.string().regex(/^[a-z0-9-]{1,180}$/), z.enum(["done", "skipped"]))
      .default({}),
  })
  .strict();
export type CampaignProgress = z.infer<typeof campaignProgressSchema>;

export function emptyCampaignProgress(): CampaignProgress {
  return campaignProgressSchema.parse({});
}
