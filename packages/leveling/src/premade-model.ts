import { z } from "zod";
import { classSlugs } from "./model.js";
import { LEVELING_RACES, raceIds } from "./profile.js";
import { campaignProgressSchema } from "./campaign-model.js";
import { dungeonFinishStateSchema, emptyDungeonFinish } from "./dungeon-finish-model.js";
import {
  dungeonBundleOverridesSchema,
  dungeonBundleSlotStatesSchema,
} from "./dungeon-bundle-model.js";

const questStatesSchema = z.record(
  z.string().regex(/^[1-9]\d{0,5}$/),
  z.enum(["not-started", "accepted", "objectives-complete", "rewarded"]),
);
const confirmationsSchema = z.record(z.string().regex(/^[a-z0-9-]{1,100}$/), z.boolean());

export const campaignXpAnchorSchema = z
  .object({
    release: z.string().regex(/^[a-z0-9-]{1,100}$/),
    actionId: z.string().regex(/^[a-z0-9-]{1,180}$/),
    level: z.number().int().min(1).max(60),
    currentXp: z.number().int().min(0).max(1_000_000),
    questStates: questStatesSchema,
    confirmations: confirmationsSchema,
    bundleSlotStates: dungeonBundleSlotStatesSchema,
  })
  .strict();
export type CampaignXpAnchor = z.infer<typeof campaignXpAnchorSchema>;

export const PREMADE_ROUTE_REVISION = "premade-five-20261013-v1";
export const premadeStopIds = [
  "thanes",
  "lordaeron",
  "deadmines",
  "stockade",
  "excavation",
  "blackfathom",
  "dalaran",
  "gnomeregan",
  "razorfen-kraul",
  "drowned-city",
  "scarlet-monastery",
  "kroldok",
  "razorfen-downs",
  "uldaman",
  "maraudon",
  "zul-farrak",
  "alcaz",
  "sunken-temple",
  "blackrock-depths",
  "lower-blackrock",
  "stratholme",
] as const;
export const premadeProgressSchema = z
  .object({
    revision: z.literal(PREMADE_ROUTE_REVISION),
    campaigns: z.record(z.string().regex(/^[a-z0-9-]{1,100}$/), campaignProgressSchema).default({}),
    selectedStopId: z.enum(premadeStopIds).default("thanes"),
    selectedStage: z.enum(["prepare", "clear", "hand-in", "checkpoint"]).default("prepare"),
    stages: z.record(z.string().regex(/^[a-z0-9-]{1,90}$/), z.boolean()).default({}),
    selectedExtras: z.record(z.string().regex(/^[1-9]\d{0,5}$/), z.boolean()).default({}),
    guaranteedBundles: dungeonBundleOverridesSchema.default({}),
    selectedBatches: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,100}$/),
        z.array(z.string().regex(/^quest-[1-9]\d{0,5}$/)).max(30),
      )
      .default({}),
    difficultyPolicy: z.enum(["at-level", "experienced-premade"]).default("at-level"),
    raidGoals: z.boolean().default(true),
    dungeonFinish: dungeonFinishStateSchema.default(emptyDungeonFinish),
    combatPlanning: z
      .object({ outdoorXpMultiplier: z.number().finite().min(0).max(100) })
      .strict()
      .optional(),
    parityScenarios: z
      .partialRecord(
        z.enum(premadeStopIds),
        z
          .object({
            extraQuests: z.number().int().min(0).max(10),
            baseXp: z.number().int().min(0).max(10_000).nullable(),
          })
          .strict(),
      )
      .default({}),
    timings: z
      .record(
        z.string().regex(/^[a-z0-9-]{1,60}$/),
        z
          .object({
            min: z.number().int().min(0).max(10_000),
            max: z.number().int().min(0).max(10_000),
          })
          .strict()
          .refine((time) => time.max >= time.min, "Maximum time must not be below minimum"),
      )
      .default({}),
    members: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(60).nullable().default(null),
            currentXp: z.number().int().min(0).max(1_000_000).nullable().default(null),
            classSlug: z.enum(classSlugs).nullable().default(null),
            raceId: z.enum(raceIds).nullable().optional(),
            xpNeedsUpdate: z.boolean().default(true),
            confirmations: confirmationsSchema.default({}),
            questStates: questStatesSchema.default({}),
            bundleSlotStates: dungeonBundleSlotStatesSchema.default({}),
            guideXpAnchor: campaignXpAnchorSchema.optional(),
          })
          .strict(),
      )
      .length(5),
  })
  .strict()
  .superRefine((progress, context) => {
    for (const [index, member] of progress.members.entries()) {
      const race = LEVELING_RACES.find((entry) => entry.id === member.raceId);
      if (race && member.classSlug && !race.classes.includes(member.classSlug))
        context.addIssue({
          code: "custom",
          path: ["members", index, "classSlug"],
          message: "Class is not available for this race.",
        });
    }
  });
export type PremadeProgress = z.infer<typeof premadeProgressSchema>;
export type PremadeMember = PremadeProgress["members"][number];
export type PremadeStageId = PremadeProgress["selectedStage"];

export function emptyPremadeProgress(): PremadeProgress {
  return premadeProgressSchema.parse({
    revision: PREMADE_ROUTE_REVISION,
    members: Array.from({ length: 5 }, () => ({})),
  });
}
