import { classSlugs } from "@wow-trader/leveling";
import { z } from "zod";

export const levelingFields = {
  level: "13",
  currentXp: "0",
  preDungeonXp: "",
  afterDungeonXp: "0",
  outdoorMinutes: "",
  clear: "25",
  travel: "",
  pickups: "0",
  idleWait: "0",
  prerequisites: "0",
  turnins: "",
  omittedKillXp: "0",
  dungeonKillXp: "",
  prerequisiteXp: "0",
  alternativeXpPerHour: "",
} as const;
export type LevelingField = keyof typeof levelingFields;
export type LevelingFields = Record<LevelingField, string>;

export const plannerStateSchema = z.object({
  version: z.literal(1),
  faction: z.enum(["alliance", "horde"]),
  classSlug: z.enum(classSlugs),
  dungeonId: z.enum(["thanes", "deadmines"]),
  crowd: z.enum(["quiet", "busy", "severe"]),
  fields: z.object(
    Object.fromEntries(
      Object.keys(levelingFields).map((key) => [key, z.string().max(24)]),
    ) as Record<LevelingField, z.ZodString>,
  ),
  selectedQuestIds: z.array(z.number().int().positive()).max(40),
  omittedQuestIds: z.array(z.number().int().positive()).max(40),
  completedQuestIds: z.array(z.number().int().positive()).max(60),
  retainedQuestIds: z.array(z.number().int().positive()).max(40),
  readyQuestIds: z.array(z.number().int().positive()).max(60),
  rewards: z.record(z.string(), z.string().max(24)),
  applied: z.boolean(),
});

export type LevelingPlannerState = z.infer<typeof plannerStateSchema>;

export function createPlannerState(): LevelingPlannerState {
  return {
    version: 1,
    faction: "alliance",
    classSlug: "warrior",
    dungeonId: "thanes",
    crowd: "busy",
    fields: { ...levelingFields },
    selectedQuestIds: [96395, 96403],
    omittedQuestIds: [64, 151, 9, 22, 38, 102],
    completedQuestIds: [],
    retainedQuestIds: [],
    readyQuestIds: [],
    rewards: {},
    applied: false,
  };
}

export function readPlannerState(raw: string | null): LevelingPlannerState | null {
  if (!raw || raw.length > 12_000) return null;
  try {
    const result = plannerStateSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
