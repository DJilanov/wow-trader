import { z } from "zod";
import { FOREVER_XP_CURVE } from "./westfall.js";

export const dungeonFinishIds = [
  "blackrock-depths",
  "lower-blackrock",
  "dire-maul-east",
  "dire-maul-west",
  "dire-maul-north",
  "scholomance",
  "stratholme-live",
  "stratholme-undead",
  "blackmaw-hold",
  "shapers-terrace",
] as const;
export type DungeonFinishId = (typeof dungeonFinishIds)[number];

export const dungeonFinishSelectionSchema = z
  .object({
    strategy: z.enum(["dungeons", "mixed"]).default("dungeons"),
  })
  .strict();

export const dungeonFinishBarSchema = z
  .object({
    level: z.number().int().min(1).max(60),
    currentXp: z.number().int().min(0).max(1_000_000),
  })
  .strict()
  .superRefine((bar, context) => {
    if (bar.level === 60 ? bar.currentXp !== 0 : bar.currentXp >= FOREVER_XP_CURVE[bar.level]!)
      context.addIssue({
        code: "custom",
        path: ["currentXp"],
        message: "XP must be below the next-level requirement, or zero at level 60.",
      });
  });

export const dungeonFinishRunSchema = z
  .object({
    id: z.uuid(),
    dungeonId: z.enum(dungeonFinishIds),
    scope: z.enum(["full-clear", "boss-loop", "quest-run"]),
    recordedAt: z.iso.datetime(),
    build: z.number().int().positive(),
    partyKey: z.string().min(1).max(1000),
    minutes: z.number().finite().min(1).max(600),
    before: z.array(dungeonFinishBarSchema).length(5),
    after: z.array(dungeonFinishBarSchema).length(5),
    questXp: z.array(z.number().int().min(0).max(1_000_000).nullable()).length(5),
  })
  .strict()
  .superRefine((run, context) => {
    if (run.before.length !== 5 || run.after.length !== 5 || run.questXp.length !== 5) return;
    const total = (bar: { level: number; currentXp: number }): number => {
      let xp = bar.currentXp;
      for (let level = 1; level < bar.level; level++) xp += FOREVER_XP_CURVE[level]!;
      return xp;
    };
    for (let index = 0; index < 5; index++) {
      const gain = total(run.after[index]!) - total(run.before[index]!);
      if (gain < 0 || (run.questXp[index] !== null && run.questXp[index]! > gain))
        context.addIssue({
          code: "custom",
          path: ["after", index],
          message: "XP cannot go backwards and quest XP cannot exceed the gain.",
        });
    }
  });
export type DungeonFinishRun = z.infer<typeof dungeonFinishRunSchema>;

export const dungeonFinishTargetSchema = z
  .object({
    id: z.uuid(),
    dungeonId: z.enum(dungeonFinishIds),
    player: z.number().int().min(1).max(5),
    itemId: z.number().int().positive().max(10_000_000),
    name: z.string().min(1).max(200),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    obtained: z.boolean().default(false),
  })
  .strict();
export type DungeonFinishTarget = z.infer<typeof dungeonFinishTargetSchema>;

export const dungeonFinishStateSchema = dungeonFinishSelectionSchema
  .extend({
    selectedDungeonId: z.enum(dungeonFinishIds).default("blackrock-depths"),
    selectedScope: z.enum(["full-clear", "boss-loop", "quest-run"]).default("full-clear"),
    runs: z.array(dungeonFinishRunSchema).max(200).default([]),
    targets: z.array(dungeonFinishTargetSchema).max(50).default([]),
  })
  .strict()
  .superRefine((state, context) => {
    if (new Set(state.runs.map((run) => run.id)).size !== state.runs.length)
      context.addIssue({ code: "custom", path: ["runs"], message: "Duplicate dungeon clear." });
    if (new Set(state.targets.map((target) => target.id)).size !== state.targets.length)
      context.addIssue({ code: "custom", path: ["targets"], message: "Duplicate gear target." });
    if (
      new Set(
        state.targets.map((target) => `${target.player}:${target.dungeonId}:${target.itemId}`),
      ).size !== state.targets.length
    )
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "This player already has that item target in this dungeon.",
      });
  });
export type DungeonFinishState = z.infer<typeof dungeonFinishStateSchema>;

export function emptyDungeonFinish(): DungeonFinishState {
  return dungeonFinishStateSchema.parse({});
}
