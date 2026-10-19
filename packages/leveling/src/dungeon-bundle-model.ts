import { z } from "zod";

export const GUARANTEED_DUNGEON_IDS = ["drowned-city", "kroldok", "alcaz"] as const;
export type GuaranteedDungeonId = (typeof GUARANTEED_DUNGEON_IDS)[number];
export type DungeonBundleFaction = "alliance" | "horde";

export const dungeonBundleSchema = z
  .object({
    schema: z.literal("guaranteed-dungeon-bundle.v1"),
    dungeonId: z.enum(GUARANTEED_DUNGEON_IDS),
    faction: z.enum(["alliance", "horde"]),
    countProvenance: z.literal("owner-confirmed"),
    included: z.boolean().default(true),
    planningQuestLevel: z.number().int().min(1).max(60),
    slots: z
      .array(
        z
          .object({
            index: z.number().int().min(1).max(4),
            questId: z.number().int().positive().max(500_000).nullable(),
            selected: z.boolean(),
          })
          .strict(),
      )
      .length(4),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (new Set(bundle.slots.map((slot) => slot.index)).size !== 4)
      context.addIssue({ code: "custom", message: "Bundle slot indexes must be unique." });
    const mapped = bundle.slots.flatMap((slot) => (slot.questId === null ? [] : [slot.questId]));
    if (new Set(mapped).size !== mapped.length)
      context.addIssue({
        code: "custom",
        message: "A real quest can occupy only one bundle slot.",
      });
  });

export type DungeonBundle = z.infer<typeof dungeonBundleSchema>;
export type DungeonBundleSlot = DungeonBundle["slots"][number];

export function dungeonBundleKey(
  dungeonId: GuaranteedDungeonId,
  faction: DungeonBundleFaction,
): string {
  return `${dungeonId}:${faction}`;
}

export function dungeonBundleSlotKey(bundle: DungeonBundle, index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > 4)
    throw new Error("Unknown dungeon bundle slot.");
  return `${dungeonBundleKey(bundle.dungeonId, bundle.faction)}:quest-${index}`;
}

export const dungeonBundleOverridesSchema = z
  .record(
    z.string().regex(/^(?:drowned-city|kroldok|alcaz):(?:alliance|horde)$/),
    dungeonBundleSchema,
  )
  .superRefine((bundles, context) => {
    for (const [key, bundle] of Object.entries(bundles))
      if (key !== dungeonBundleKey(bundle.dungeonId, bundle.faction))
        context.addIssue({ code: "custom", path: [key], message: "Bundle identity mismatch." });
  });

export const dungeonBundleSlotStatesSchema = z.record(
  z.string().regex(/^(?:drowned-city|kroldok|alcaz):(?:alliance|horde):quest-[1-4]$/),
  z.enum(["skipped", "rewarded"]),
);
