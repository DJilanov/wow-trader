import { z } from "zod";

export const tierSourceBindingsSchema = z
  .array(
    z
      .object({
        path: z
          .string()
          .min(1)
          .max(240)
          .regex(/^[a-zA-Z0-9_./-]+$/),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  )
  .min(1)
  .max(160);
export type TierSourceBindings = z.infer<typeof tierSourceBindingsSchema>;
