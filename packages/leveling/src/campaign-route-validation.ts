import { z } from "zod";
import { premadeProgressSchema } from "./premade-model.js";
import { FOREVER_XP_CURVE } from "./westfall.js";
import { campaignCombatProjectionSchema } from "./campaign-combat-projection.js";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const position = z.object({ level: z.number().int().min(1).max(60), currentXp: z.number().int().nonnegative() }).strict();
function total(value: z.infer<typeof position>): number {
  let result = value.currentXp;
  for (let level = 1; level < value.level; level++) result += FOREVER_XP_CURVE[level]!;
  return result;
}

export const campaignRouteValidationSchema = z.object({
  schema: z.literal("campaign-route-validation.v1"),
  kind: z.literal("projected-reference-xp"),
  engineSha256: sha256,
  referenceSha256: sha256,
  targetLevel: z.number().int().min(10).max(60).refine((value) => value % 10 === 0),
  boundaryActionId: z.string().min(1),
  routeSha256: sha256,
  forecastCases: z.array(z.object({
    difficultyPolicy: z.enum(["at-level", "experienced-premade"]),
    strategy: z.enum(["dungeons", "mixed"]),
    optionalStops: z.boolean(),
    lootScenario: z.enum(["fast", "expected", "slow"]),
    mode: z.enum(["fresh", "restored"]),
    peakQuestLog: z.number().int().min(0).max(40),
    checks: z.object({
      noBlocker: z.literal(true), xpConserved: z.literal(true),
      noDuplicateRewards: z.literal(true), enemyLevels: z.literal(true),
      noGrinding: z.literal(true), saveEquivalent: z.literal(true),
    }).strict(),
    handoff: z.object({
      kind: z.literal("projected-reference-xp"),
      afterActionId: z.string().min(1),
      progress: premadeProgressSchema,
      xpBounds: z.array(z.object({ minimum: position, maximum: position }).strict()).length(5),
      combatProjection: campaignCombatProjectionSchema.optional(),
    }).strict(),
  }).strict()).length(48),
  nativeCases: z.array(z.object({ id: z.string().min(1), luaSha256: sha256, verified: z.literal(true) }).strict()).min(20),
}).strict().superRefine((report, context) => {
  const scenarios = new Set(report.forecastCases.map((entry) =>
    `${entry.difficultyPolicy}/${entry.strategy}/${entry.optionalStops}/${entry.lootScenario}/${entry.mode}`));
  if (scenarios.size !== 48 || new Set(report.nativeCases.map((entry) => entry.id)).size !== report.nativeCases.length)
    context.addIssue({ code: "custom", message: "Route validation must cover distinct scenarios and native exports." });
  for (const entry of report.forecastCases) {
    if (entry.handoff.afterActionId !== report.boundaryActionId ||
      (entry.handoff.combatProjection && (entry.handoff.combatProjection.afterActionId !== report.boundaryActionId ||
        entry.handoff.combatProjection.members.some((member, index) =>
          member.position.level !== entry.handoff.xpBounds[index]!.minimum.level ||
          member.position.currentXp !== entry.handoff.xpBounds[index]!.minimum.currentXp ||
          member.maximumPosition.level !== entry.handoff.xpBounds[index]!.maximum.level ||
          member.maximumPosition.currentXp !== entry.handoff.xpBounds[index]!.maximum.currentXp))) ||
      entry.handoff.progress.members.some((member, index) =>
        member.xpNeedsUpdate || member.level === null || member.level < report.targetLevel ||
        member.currentXp === null || entry.handoff.xpBounds[index]!.minimum.level !== member.level ||
        entry.handoff.xpBounds[index]!.minimum.currentXp !== member.currentXp ||
        total(entry.handoff.xpBounds[index]!.maximum) < total(entry.handoff.xpBounds[index]!.minimum)))
      context.addIssue({ code: "custom", message: "Every player must reach the validated handoff with known projected XP." });
  }
});

export type CampaignRouteValidation = z.infer<typeof campaignRouteValidationSchema>;
