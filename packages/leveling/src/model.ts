import { z } from "zod";

export const classSlugs = [
  "warrior",
  "paladin",
  "hunter",
  "rogue",
  "priest",
  "shaman",
  "mage",
  "warlock",
  "druid",
] as const;
export type ClassSlug = (typeof classSlugs)[number];
export type Faction = "alliance" | "horde";

const questSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  faction: z.enum(["alliance", "horde", "both"]),
  minimumLevel: z.number().int().positive(),
  prerequisiteIds: z.array(z.number().int().positive()),
  pickup: z.string().min(1),
  objective: z.string().min(1),
  objectiveIndexes: z.array(z.number().int().positive()).min(1),
  turnin: z.string().min(1),
  sharedWork: z.string(),
  evidence: z.enum(["reference", "runtime"]),
  xp: z.number().int().nonnegative().nullable(),
});

const stepSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/),
  title: z.string().min(1),
  text: z.string().min(1),
  action: z.enum(["travel", "accept", "complete", "turnin", "checkpoint", "instruction"]),
  questId: z.number().int().positive().nullable(),
  level: z.number().int().positive().nullable(),
  optional: z.boolean(),
  position: z
    .object({ zone: z.string(), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
    .nullable(),
});

export const routeSchema = z.object({
  id: z.string(),
  version: z.string(),
  path: z.string(),
  title: z.string(),
  faction: z.enum(["alliance", "horde"]),
  classes: z.array(z.enum(classSlugs)).min(1),
  minimumLevel: z.number().int().positive(),
  maximumLevel: z.number().int().positive(),
  clientBuild: z.number().int().positive(),
  interfaceVersion: z.number().int().positive(),
  reviewedAt: z.iso.datetime(),
  state: z.enum(["preview", "playtested"]),
  quests: z.array(questSchema),
  steps: z.array(stepSchema).min(1),
  omittedCandidates: z.array(z.number().int().positive()),
  rejoin: z.string(),
});

export type LevelingRoute = z.infer<typeof routeSchema>;
export type LevelingQuest = z.infer<typeof questSchema>;
export type RouteStep = z.infer<typeof stepSchema>;

export interface DungeonLevelProfile {
  readonly id: string;
  readonly name: string;
  readonly hard: number;
  readonly medium: number;
  readonly atLevel: number;
  readonly easy: number;
  readonly availableInBeta: boolean;
  readonly questIds: readonly number[];
}

export function validateRoute(input: unknown): LevelingRoute {
  const route = routeSchema.parse(input);
  const questIds = new Set(route.quests.map((quest) => quest.id));
  if (questIds.size !== route.quests.length) throw new Error("Duplicate quest ID");
  if (new Set(route.steps.map((step) => step.id)).size !== route.steps.length)
    throw new Error("Duplicate step ID");
  if (route.minimumLevel > route.maximumLevel) throw new Error("Invalid level coverage");
  const quests = new Map(route.quests.map((quest) => [quest.id, quest]));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function visit(id: number): void {
    if (visiting.has(id)) throw new Error("Quest dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisiteId of quests.get(id)?.prerequisiteIds ?? []) {
      if (!questIds.has(prerequisiteId)) throw new Error(`Unknown prerequisite ${prerequisiteId}`);
      visit(prerequisiteId);
    }
    visiting.delete(id);
    visited.add(id);
  }
  route.quests.forEach((quest) => visit(quest.id));
  for (const step of route.steps) {
    if (step.questId !== null && !questIds.has(step.questId))
      throw new Error(`Unknown step quest ${step.questId}`);
    if (["accept", "complete", "turnin"].includes(step.action) && step.questId === null)
      throw new Error("Quest action requires an ID");
    if (step.action === "checkpoint" && step.level === null)
      throw new Error("Checkpoint requires a level");
  }
  if (route.omittedCandidates.some((id) => !questIds.has(id)))
    throw new Error("Unknown omitted candidate");
  return route;
}
