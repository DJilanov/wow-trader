import { z } from "zod";
import { characterProfileSchema } from "@wow-trader/leveling";
import { readingPositionSchema } from "./leveling-experience";

export const feedbackCategories = [
  "wrong-location",
  "quest-unavailable",
  "confusing-instruction",
  "broken-transition",
  "other",
] as const;
export const feedbackCategoryLabels: Readonly<Record<(typeof feedbackCategories)[number], string>> =
  {
    "wrong-location": "Wrong location",
    "quest-unavailable": "Quest unavailable",
    "confusing-instruction": "Confusing instruction",
    "broken-transition": "Broken chapter transition",
    other: "Other issue",
  };
export const levelingFeedbackSchema = z
  .object({
    submissionId: z.string().uuid(),
    position: readingPositionSchema,
    profile: characterProfileSchema,
    category: z.enum(feedbackCategories),
    message: z
      .string()
      .trim()
      .min(10)
      .max(1500)
      .refine(
        (value) =>
          [...value].every((character) => {
            const code = character.charCodeAt(0);
            return code >= 32 || code === 9 || code === 10 || code === 13;
          }),
        "Unsupported control characters",
      ),
  })
  .strict();
export type LevelingFeedback = z.infer<typeof levelingFeedbackSchema>;

export function feedbackProfilesMatch(left: unknown, right: unknown): boolean {
  const first = characterProfileSchema.safeParse(left);
  const second = characterProfileSchema.safeParse(right);
  return (
    first.success && second.success && JSON.stringify(first.data) === JSON.stringify(second.data)
  );
}
