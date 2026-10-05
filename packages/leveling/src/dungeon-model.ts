import { z } from "zod";
import { classSlugs } from "./model.js";

export const dungeonQuestStates = [
  "unknown",
  "not-started",
  "accepted",
  "objectives-complete",
  "rewarded",
  "abandoned",
] as const;
export type DungeonQuestState = (typeof dungeonQuestStates)[number];
export type GateResult = "ready" | "blocked" | "unknown";
export type DungeonGate =
  | {
      readonly kind: "quest";
      readonly questId: number;
      readonly state: "accepted" | "objectives-complete" | "rewarded";
    }
  | { readonly kind: "all" | "any"; readonly gates: readonly DungeonGate[] }
  | { readonly kind: "item"; readonly itemId: number }
  | { readonly kind: "confirmation"; readonly id: string; readonly label: string };
export interface DungeonEvidence {
  readonly source: string;
  readonly build: number | null;
  readonly effectiveDate: string;
  readonly status: "reference" | "reviewed" | "player-observed";
}
export interface DungeonQuest {
  readonly id: number;
  readonly title: string;
  readonly faction: "alliance" | "horde" | "both";
  readonly classSlug: (typeof classSlugs)[number] | null;
  readonly raceIds: readonly string[];
  readonly restrictionsKnown: boolean;
  readonly minimumLevel: number | null;
  readonly questLevel: number | null;
  readonly pickup: string | null;
  readonly turnin: string | null;
  readonly objective: string | null;
  readonly position: { readonly mapId: number; readonly x: number; readonly y: number } | null;
  readonly pickupStage: "before" | "inside" | "after" | "unknown";
  readonly objectiveStage: "before" | "inside" | "multiple-visits" | "unknown";
  readonly gate: DungeonGate;
  readonly referenceXp: number | null;
  readonly shareable: boolean | null;
  readonly rewards: {
    readonly fixed: readonly DungeonRewardItem[];
    readonly choices: readonly DungeonRewardItem[];
  };
  readonly requiredItems: readonly DungeonRewardItem[];
  readonly notes: readonly string[];
  readonly evidence: DungeonEvidence;
  readonly minimumLevelClaims: readonly { readonly value: number; readonly source: string }[];
}
export interface DungeonRewardItem {
  readonly id: number;
  readonly title: string;
}
export interface DungeonVisit {
  readonly id: string;
  readonly name: string;
  readonly sourceTag: string | null;
  readonly faction: "alliance" | "horde" | "both";
  readonly levels: {
    readonly hard: number;
    readonly medium: number;
    readonly atLevel: number;
    readonly easy: number;
  } | null;
  readonly availability: "beta" | "reference-only";
  readonly groupSize: number | null;
  readonly questIds: readonly number[];
  readonly notes: readonly string[];
}

const rewardItemSchema = z
  .object({ id: z.number().int().positive(), title: z.string().min(1).max(200) })
  .strict();
export const dungeonFactsSchema = z
  .object({
    schemaVersion: z.literal(1),
    targetBuild: z.number().int().positive(),
    source: z.string(),
    sources: z.array(
      z.object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    ),
    associations: z.array(
      z.object({ dungeon: z.string(), questId: z.number().int().positive() }).strict(),
    ),
    quests: z.array(
      z
        .object({
          id: z.number().int().positive().max(500_000),
          title: z.string(),
          faction: z.enum(["alliance", "horde", "both"]),
          classSlug: z.enum(classSlugs).nullable(),
          minimumLevel: z.number().int().min(1).max(60).nullable(),
          questLevel: z.number().int().min(1).max(60).nullable(),
          pickup: z.string().nullable(),
          turnin: z.string().nullable(),
          objective: z.string().nullable(),
          position: z
            .object({
              mapId: z.number().int().positive(),
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
            })
            .strict()
            .nullable(),
          referenceXp: z.number().nonnegative().nullable(),
          shareable: z.boolean().nullable(),
          rewards: z
            .object({ fixed: z.array(rewardItemSchema), choices: z.array(rewardItemSchema) })
            .strict(),
          requiredItems: z.array(rewardItemSchema),
          chain: z.array(z.number().int().positive().max(500_000)),
        })
        .strict(),
    ),
  })
  .strict();

export const personalDungeonPlanSchema = z
  .object({
    visits: z.record(
      z.string().regex(/^[a-z0-9-]{1,80}$/),
      z.enum(["planned", "deferred", "finished"]),
    ),
    selectedQuests: z.record(
      z.string().regex(/^[a-z0-9-]{1,80}$/),
      z.array(z.number().int().positive().max(500_000)).max(80),
    ),
    questStates: z.record(z.string().regex(/^[1-9]\d{0,5}$/), z.enum(dungeonQuestStates)),
    confirmations: z.record(z.string().regex(/^[a-z0-9-]{1,100}$/), z.boolean()),
    rewardChoices: z.record(z.string().regex(/^[1-9]\d{0,5}$/), z.number().int().positive()),
    retainedQuestIds: z.array(z.number().int().positive().max(500_000)).max(300),
    replacements: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,180}$/),
        z
          .object({
            version: z.literal("thanes-darkshore-v1-70205-crest"),
            active: z.boolean(),
            stepId: z
              .string()
              .regex(/^[a-z0-9-]{1,80}$/)
              .nullable(),
            progress: z.record(z.string().regex(/^[a-z0-9-]{1,80}$/), z.enum(["done", "skipped"])),
            currentXp: z.number().int().min(0).max(1_000_000).nullable(),
            killXp: z.number().int().min(0).max(1_000_000).nullable(),
            tripMinutes: z.number().min(0).max(10_000).nullable(),
            outdoorMinutes: z.number().min(0).max(10_000).nullable(),
            returnLevel: z.number().int().min(1).max(60).nullable(),
            carryover: z.record(
              z.string().regex(/^[1-9]\d{0,5}$/),
              z.enum(["ready", "needed", "not-needed"]),
            ),
            preparationConfirmed: z.boolean(),
            xpForecast: z
              .object({
                level: z.number().int().min(1).max(60),
                questXp: z.number().int().min(0).max(1_000_000).nullable(),
                neededXp: z.number().int().min(0).max(1_000_000).nullable(),
              })
              .strict()
              .nullable()
              .default(null),
            xpNeedsUpdate: z.boolean().default(false),
          })
          .strict(),
      )
      .default({}),
    scenarios: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,80}$/),
        z
          .object({
            mode: z.enum(["whole-trip", "extra-chain"]),
            referenceOnly: z.boolean(),
            fields: z.partialRecord(
              z.enum([
                "min",
                "max",
                "rate",
                "outdoorTime",
                "outdoorXp",
                "kills",
                "currentXp",
                "outdoorMin",
                "outdoorMax",
              ]),
              z.string().max(24),
            ),
          })
          .strict(),
      )
      .default({}),
    activeTripId: z
      .string()
      .regex(/^[a-z0-9-]{1,180}$/)
      .nullable()
      .default(null),
    trips: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,180}$/),
        z
          .object({
            version: z.literal("dungeon-trip-v2-70205"),
            visitId: z.string().regex(/^[a-z0-9-]{1,80}$/),
            chapterId: z.string().regex(/^[a-z0-9-]{1,180}$/),
            sourceVersion: z.string().regex(/^[a-z0-9-]{1,180}$/),
            sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
            returnStepId: z.string().regex(/^source-step-\d{4}$/),
            questIds: z.array(z.number().int().positive().max(500_000)).min(1).max(80),
            stepId: z.enum(["prepare", "travel", "clear", "hand-ins", "bridge", "rejoin"]),
            progress: z.partialRecord(
              z.enum(["prepare", "travel", "clear", "hand-ins", "bridge", "rejoin"]),
              z.enum(["done", "skipped"]),
            ),
            targetLevel: z.number().int().min(1).max(60),
            checkpointFields: z
              .partialRecord(
                z.enum(["min", "max", "outdoorMin", "outdoorMax", "rate"]),
                z.string().max(24),
              )
              .default({}),
            currentXp: z.number().int().min(0).max(1_000_000).nullable(),
            killXp: z.number().int().min(0).max(1_000_000).nullable(),
            returnLevel: z.number().int().min(1).max(60).nullable(),
            returnXp: z.number().int().min(0).max(1_000_000).nullable(),
            xpNeedsUpdate: z.boolean(),
            preparationConfirmed: z.boolean(),
            sourceRetained: z.boolean(),
            itinerary: z.boolean().optional(),
            alternative: z
              .object({
                definitionId: z.literal("redridge-20-v1-70205"),
                chapterId: z.literal("chapter-130-20-21-darkshore-ashenvale"),
                sourceVersion: z.string().regex(/^[a-z0-9-]{1,180}$/),
                sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
                stepId: z.string().regex(/^source-step-\d{4}$/),
                carryover: z.partialRecord(z.enum(["124", "3765", "cooking-50"]), z.boolean()),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .default({}),
  })
  .strict();
export type PersonalDungeonPlan = z.infer<typeof personalDungeonPlanSchema>;
export function emptyDungeonPlan(): PersonalDungeonPlan {
  return {
    visits: {},
    selectedQuests: {},
    questStates: {},
    confirmations: {},
    rewardChoices: {},
    retainedQuestIds: [],
    replacements: {},
    scenarios: {},
    activeTripId: null,
    trips: {},
  };
}

export function evaluateDungeonGate(gate: DungeonGate, plan: PersonalDungeonPlan): GateResult {
  if (gate.kind === "item" || gate.kind === "confirmation") {
    const value = plan.confirmations[gate.kind === "item" ? `item-${gate.itemId}` : gate.id];
    return value === undefined ? "unknown" : value ? "ready" : "blocked";
  }
  if (gate.kind === "quest") {
    const state = plan.questStates[String(gate.questId)] ?? "unknown";
    if (state === "unknown") return "unknown";
    const ranks: Readonly<Record<DungeonQuestState, number>> = {
      unknown: -1,
      "not-started": 0,
      abandoned: 0,
      accepted: 1,
      "objectives-complete": 2,
      rewarded: 3,
    };
    return ranks[state] >= ranks[gate.state] ? "ready" : "blocked";
  }
  const results = gate.gates.map((child) => evaluateDungeonGate(child, plan));
  if (gate.kind === "all")
    return results.includes("blocked")
      ? "blocked"
      : results.includes("unknown")
        ? "unknown"
        : "ready";
  return results.includes("ready") ? "ready" : results.includes("unknown") ? "unknown" : "blocked";
}

export function gateQuestIds(gate: DungeonGate): readonly number[] {
  if (gate.kind === "quest") return [gate.questId];
  return gate.kind === "all" || gate.kind === "any" ? gate.gates.flatMap(gateQuestIds) : [];
}
export function validateDungeonGraph(quests: readonly DungeonQuest[]): void {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  if (byId.size !== quests.length) throw new Error("Duplicate dungeon quest identity");
  const visiting = new Set<number>(),
    visited = new Set<number>();
  function visit(id: number): void {
    if (visiting.has(id)) throw new Error(`Dungeon prerequisite cycle at ${id}`);
    if (visited.has(id)) return;
    const quest = byId.get(id);
    if (!quest) throw new Error(`Missing dungeon prerequisite ${id}`);
    visiting.add(id);
    for (const parent of gateQuestIds(quest.gate)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const quest of quests) visit(quest.id);
}
