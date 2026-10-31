import { z } from "zod";
export const goldPlanViewSchema = z.object({
  status: z.enum(["ready", "stale", "empty"]),
  message: z.string(),
  observedAt: z.string().datetime().nullable(),
  budget: z.string(),
  spent: z.string(),
  remaining: z.string(),
  expectedProfit: z.string(),
  ownedValue: z.string(),
  charactersUsed: z.number().int().nonnegative(),
  actions: z
    .array(
      z.object({
        name: z.string(),
        kind: z.string(),
        detail: z.string(),
        spent: z.string(),
        ownedValue: z.string(),
        profit: z.string(),
        purchases: z.array(
          z.object({
            itemId: z.number().int().positive(),
            name: z.string(),
            stackSize: z.number().int().positive(),
            stacks: z.number().int().positive(),
            price: z.string(),
          }),
        ),
        ownedInputs: z.array(z.object({ name: z.string(), quantity: z.number().int().positive() })),
      }),
    )
    .max(100),
});
