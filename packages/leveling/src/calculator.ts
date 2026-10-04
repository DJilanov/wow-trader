import { z } from "zod";

export interface XpActivity {
  readonly id: string;
  readonly xp: number | null;
  readonly baselineXp?: number;
  readonly questId?: number;
}

export interface XpCheckpoint {
  readonly id: string;
  readonly level: number;
  readonly cumulativeEarnedXp: number | null;
}

export interface BranchComparisonInput {
  readonly level: number;
  readonly currentXp: number;
  readonly curve: Readonly<Record<number, number>> | null;
  readonly omitted: readonly XpActivity[];
  readonly added: readonly XpActivity[];
  readonly completedQuestIds: readonly number[];
  readonly outdoorMinutes: number;
  readonly time: {
    readonly clear: number;
    readonly travel: number;
    readonly pickups: number;
    readonly idleWait: number;
    readonly prerequisites: number;
    readonly turnins: number;
  };
  readonly alternativeXpPerHour: number;
  readonly checkpoints: readonly XpCheckpoint[];
}

export interface CheckpointResult {
  readonly id: string;
  readonly level: number;
  readonly requiredXp: number | null;
  readonly shortfallXp: number | null;
  readonly state: "reachable" | "incomplete" | "blocked";
}

export interface BranchComparison {
  readonly state: "complete" | "incomplete" | "blocked" | "invalid";
  readonly messages: readonly string[];
  readonly omittedXp: number | null;
  readonly addedXp: number | null;
  readonly shortfallXp: number | null;
  readonly detourMinutes: number | null;
  readonly catchupMinutes: number | null;
  readonly savedMinutes: number | null;
  readonly checkpoints: readonly CheckpointResult[];
}

const xpSchema = z.number().int().min(0).max(1_000_000_000);
const minutesSchema = z.number().min(0).max(100_000);
const activitySchema = z.object({
  id: z.string().min(1),
  xp: xpSchema.nullable(),
  baselineXp: xpSchema.optional(),
  questId: z.number().int().positive().optional(),
});
const comparisonSchema = z.object({
  level: z.number().int().min(1).max(60),
  currentXp: xpSchema,
  curve: z.record(z.string(), z.number().int().positive()).nullable(),
  omitted: z.array(activitySchema),
  added: z.array(activitySchema),
  completedQuestIds: z.array(z.number().int().positive()),
  outdoorMinutes: minutesSchema,
  time: z.object({
    clear: minutesSchema,
    travel: minutesSchema,
    pickups: minutesSchema,
    idleWait: minutesSchema,
    prerequisites: minutesSchema,
    turnins: minutesSchema,
  }),
  alternativeXpPerHour: z.number().min(0).max(1_000_000_000),
  checkpoints: z.array(
    z.object({
      id: z.string(),
      level: z.number().int().min(1).max(60),
      cumulativeEarnedXp: xpSchema.nullable(),
    }),
  ),
});

export function xpToCheckpoint(
  level: number,
  currentXp: number,
  targetLevel: number,
  curve: Readonly<Record<number, number>> | null,
): number | null {
  if (targetLevel <= level) return 0;
  if (!curve) return null;
  let required = -currentXp;
  for (let index = level; index < targetLevel; index++) {
    const amount = curve[index];
    if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0) return null;
    required += amount;
  }
  return Math.max(0, required);
}

export function compareBranches(input: BranchComparisonInput): BranchComparison {
  const empty: BranchComparison = {
    state: "invalid",
    messages: [],
    omittedXp: null,
    addedXp: null,
    shortfallXp: null,
    detourMinutes: null,
    catchupMinutes: null,
    savedMinutes: null,
    checkpoints: [],
  };
  if (!comparisonSchema.safeParse(input).success)
    return {
      ...empty,
      messages: ["Enter finite, non-negative values; XP and levels must be whole numbers."],
    };
  const maxXp = input.curve?.[input.level];
  if (maxXp !== undefined && input.currentXp >= maxXp)
    return { ...empty, messages: ["Current XP must be below the XP required for the next level."] };
  const completed = new Set(input.completedQuestIds);
  let omittedXp: number | null;
  let addedXp: number | null;
  try {
    omittedXp = sumActivities(input.omitted, completed);
    addedXp = sumActivities(input.added, completed);
  } catch (error) {
    return {
      ...empty,
      messages: [error instanceof Error ? error.message : "Invalid XP activities"],
    };
  }
  const detourMinutes = Object.values(input.time).reduce((sum, minutes) => sum + minutes, 0);
  const shortfallXp =
    omittedXp === null || addedXp === null ? null : Math.max(0, omittedXp - addedXp);
  const catchupMinutes =
    shortfallXp === null || (shortfallXp > 0 && input.alternativeXpPerHour === 0)
      ? null
      : shortfallXp === 0
        ? 0
        : (60 * shortfallXp) / input.alternativeXpPerHour;
  const checkpoints = input.checkpoints.map((checkpoint): CheckpointResult => {
    const requiredXp = xpToCheckpoint(input.level, input.currentXp, checkpoint.level, input.curve);
    const shortfall =
      requiredXp === null || checkpoint.cumulativeEarnedXp === null
        ? null
        : Math.max(0, requiredXp - checkpoint.cumulativeEarnedXp);
    return {
      id: checkpoint.id,
      level: checkpoint.level,
      requiredXp,
      shortfallXp: shortfall,
      state: shortfall === null ? "incomplete" : shortfall > 0 ? "blocked" : "reachable",
    };
  });
  const messages: string[] = [];
  if (omittedXp === null || addedXp === null)
    messages.push("Enter the remaining reward XP for each included quest. Unknown XP is not zero.");
  if (shortfallXp !== null && shortfallXp > 0 && input.alternativeXpPerHour === 0)
    messages.push("An XP shortfall requires a positive catch-up rate.");
  if (checkpoints.some((checkpoint) => checkpoint.state === "incomplete"))
    messages.push("A checkpoint needs its XP curve and XP earned before it.");
  if (checkpoints.some((checkpoint) => checkpoint.state === "blocked"))
    messages.push(
      "Reach every checkpoint before taking the dungeon branch. Later rewards cannot unlock an earlier visit.",
    );
  const state = checkpoints.some((checkpoint) => checkpoint.state === "blocked")
    ? "blocked"
    : messages.length
      ? "incomplete"
      : "complete";
  return {
    state,
    messages,
    omittedXp,
    addedXp,
    shortfallXp,
    detourMinutes,
    catchupMinutes,
    savedMinutes:
      state === "complete" && catchupMinutes !== null
        ? input.outdoorMinutes - detourMinutes - catchupMinutes
        : null,
    checkpoints,
  };
}

function sumActivities(
  activities: readonly XpActivity[],
  completed: ReadonlySet<number>,
): number | null {
  const unique = new Map<string, XpActivity>();
  for (const activity of activities) {
    if (activity.questId !== undefined && completed.has(activity.questId)) continue;
    const key = activity.questId === undefined ? activity.id : `quest:${activity.questId}`;
    const previous = unique.get(key);
    if (previous && activity.questId !== undefined)
      throw new Error(`One-time quest ${activity.questId} appears more than once.`);
    if (previous && (previous.xp !== activity.xp || previous.baselineXp !== activity.baselineXp))
      throw new Error(`Conflicting shared activity ${activity.id}.`);
    unique.set(key, activity);
  }
  let total = 0;
  for (const activity of unique.values()) {
    if (activity.xp === null) return null;
    total += activity.xp - (activity.baselineXp ?? 0);
  }
  return total;
}

export function parseNumericInput(value: string, whole = false): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (!whole || Number.isSafeInteger(number))
    ? number
    : null;
}
