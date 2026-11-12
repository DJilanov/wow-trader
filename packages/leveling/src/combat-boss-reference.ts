import { z } from "zod";
import type { CombatNpc } from "./combat-model.js";

const bossReferenceBaseSchema = z
  .object({
    npcId: z.number().int().positive().max(10_000_000),
    name: z.string().trim().min(1).max(300),
    targetBuild: z.number().int().positive(),
    instanceMapId: z.number().int().positive(),
    dungeonVisitIds: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/))
      .min(1)
      .max(50),
    source: z
      .object({
        build: z.number().int().positive(),
        manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
        encountersSha256: z.string().regex(/^[a-f0-9]{64}$/),
        bossesSha256: z.string().regex(/^[a-f0-9]{64}$/),
        mapsSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  })
  .strict();

/** Client boss identity permits a dungeon-boss exception, never a payout claim. */
export const combatBossReferenceSchema = z.discriminatedUnion("identityEvidence", [
  bossReferenceBaseSchema.extend({
    encounterIds: z.array(z.number().int().positive()).min(1).max(100),
    identityEvidence: z.enum(["client-creature-id", "unique-exact-name"]),
  }),
  bossReferenceBaseSchema.extend({
    encounterIds: z.array(z.number().int().positive()).length(0),
    identityEvidence: z.literal("client-instance-kill-statistic"),
    killStatistic: z.object({
      criteriaIds: z.array(z.number().int().positive()).min(1).max(100),
      completionAchievementIds: z.array(z.number().int().positive()).min(1).max(100),
      evidenceLabel: z.string().trim().min(1).max(500),
      mapName: z.string().trim().min(1).max(300),
      bossLocationsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict(),
  }),
])
  .refine(
    (reference) =>
      reference.targetBuild === reference.source.build &&
      new Set(reference.dungeonVisitIds).size === reference.dungeonVisitIds.length &&
      new Set(reference.encounterIds).size === reference.encounterIds.length &&
      (reference.identityEvidence !== "client-instance-kill-statistic" ||
        (new Set(reference.killStatistic.criteriaIds).size === reference.killStatistic.criteriaIds.length &&
          new Set(reference.killStatistic.completionAchievementIds).size === reference.killStatistic.completionAchievementIds.length &&
          reference.killStatistic.evidenceLabel.normalize("NFKC").trim().toLowerCase() ===
          `${reference.name} kills (${reference.killStatistic.mapName})`.normalize("NFKC").trim().toLowerCase())),
    "Boss references require the target client build and unique encounter contexts",
  );

export type CombatBossReference = z.infer<typeof combatBossReferenceSchema>;

export function matchesCombatBossIdentity(
  npc: Pick<CombatNpc, "id" | "name"> | undefined,
  reference: CombatBossReference | undefined,
  targetBuild: number,
): reference is CombatBossReference {
  return Boolean(
    npc &&
    reference &&
    reference.npcId === npc.id &&
    reference.targetBuild === targetBuild &&
    reference.source.build === targetBuild &&
    reference.name.normalize("NFKC").trim().toLowerCase() ===
      npc.name.normalize("NFKC").trim().toLowerCase(),
  );
}
