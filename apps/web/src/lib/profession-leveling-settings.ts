import { z } from "zod";
import type { ProfessionLevelingOptions } from "./profession-leveling-types";

export const professionLevelingOptionsSchema = z
  .object({
    from: z.number().int().min(1).max(300),
    to: z.number().int().min(1).max(300),
    playerLevel: z.number().int().min(1).max(60),
    mode: z.enum(["orange", "expected"]),
    knownRecipeIds: z.array(z.number().int().positive()).max(2_000),
    recipeCosts: z.record(z.string().regex(/^\d+$/), z.string().regex(/^\d{1,16}$/)),
    recipeSkills: z.record(z.string().regex(/^\d+$/), z.number().int().min(1).max(300)).default({}),
  })
  .refine(
    (options) => options.to >= options.from,
    "Target skill must be at or above current skill.",
  );

export const DEFAULT_PROFESSION_LEVELING_OPTIONS: ProfessionLevelingOptions = {
  from: 1,
  to: 300,
  playerLevel: 60,
  mode: "expected",
  knownRecipeIds: [],
  recipeCosts: {},
};

export function goldToCopper(value: string): string | null {
  const match = /^(\d{1,10})(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) return null;
  return (BigInt(match[1]!) * 10_000n + BigInt((match[2] ?? "").padEnd(4, "0"))).toString();
}

export function copperToGold(value: string): string {
  if (!/^\d+$/.test(value)) return "";
  const copper = BigInt(value);
  const fraction = (copper % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${copper / 10_000n}${fraction ? `.${fraction}` : ""}`;
}
