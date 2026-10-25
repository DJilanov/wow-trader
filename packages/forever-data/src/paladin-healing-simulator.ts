import { z } from "zod";
import { healingResultSchema, healingWorkloadSchema } from "./healing-simulator.js";

const id = z.number().int().positive().safe();
const nonnegative = z.number().finite().nonnegative();
const chance = nonnegative.max(1);
const policyKey = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const raidIndex = z.number().int().min(0).max(4);

export const paladinHealingRankPolicySchema = z
  .object({
    schema: z.literal("kfc-paladin-rank-sensitivity.v1"),
    id: policyKey,
    kind: z.enum(["unscaled-reference", "level-distance-sensitivity"]),
    fullScalingGap: z.number().int().min(0).max(60),
    coefficientLossPerLevel: chance,
    classProcMode: z.enum(["unchanged", "coefficient-factor"]),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      (policy.kind === "unscaled-reference" &&
        (policy.fullScalingGap !== 0 ||
          policy.coefficientLossPerLevel !== 0 ||
          policy.classProcMode !== "unchanged")) ||
      (policy.kind === "level-distance-sensitivity" && policy.coefficientLossPerLevel === 0)
    )
      context.addIssue({ code: "custom", message: "Inconsistent Paladin rank reference" });
  });
export const paladinBlessingOfLightSchema = z
  .object({
    schema: z.literal("kfc-paladin-blessing-of-light-policy.v1"),
    scaling: z.enum(["full-tooltip-reference", "coefficient-factor"]),
    multiplierOrder: z.enum(["before-healing-light", "after-healing-light"]),
    assignments: z
      .array(
        z
          .object({
            raidIndex,
            spellId: z.union([
              z.literal(19977),
              z.literal(19978),
              z.literal(19979),
              z.literal(25890),
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .refine(
    (policy) =>
      new Set(policy.assignments.map((entry) => entry.raidIndex)).size ===
      policy.assignments.length,
    "Duplicate Blessing of Light recipient",
  );
export const paladinHealingItemPolicySchema = z
  .object({
    schema: z.literal("kfc-paladin-item-effects-policy.v1"),
    id: policyKey,
    dormantHeartProcChance: chance,
    dormantHeartHealingEvents: z.enum(["completed-casts", "direct-heals"]),
  })
  .strict();
export const paladinHealingLegacyItemPolicySchema = z
  .object({
    schema: z.literal("kfc-paladin-legacy-item-policy.v1"),
    id: policyKey.max(100),
    briarwoodSpellPower: z.union([z.literal(15), z.literal(29), z.literal(30)]).optional(),
    royalSealHealingPower: z.union([z.literal(0), z.literal(22)]).optional(),
  })
  .strict()
  .refine(
    (policy) =>
      policy.briarwoodSpellPower !== undefined || policy.royalSealHealingPower !== undefined,
    "Empty legacy item reference",
  );
export const paladinHealingCastSetPolicySchema = z
  .object({
    wildheartManaChance: chance.optional(),
    spellPowerChance: chance.optional(),
    dreadmistCanCrit: z.boolean().optional(),
  })
  .strict()
  .refine(
    (policy) => Object.values(policy).some((value) => value !== undefined),
    "Empty cast-set policy",
  );
export const paladinHealingSelfSetPolicySchema = z
  .object({
    thresholdTiming: z.enum(["after-hit", "before-hit"]).optional(),
    regenerationTickMs: z.union([z.literal(2000), z.literal(5000)]).optional(),
    selfDamageTriggers: z.boolean().optional(),
    devoutProcChance: chance.optional(),
  })
  .strict()
  .refine(
    (policy) => Object.values(policy).some((value) => value !== undefined),
    "Empty self-set policy",
  );
export const paladinHealingPrioritySchema = z
  .object({
    spellId: id,
    raidIndex: z.number().int().min(-1).max(4),
    minimumMissingHealth: nonnegative.max(1_000_000_000),
    minimumPartyTargets: z.number().int().min(0).max(5).optional(),
    minimumPartyMissingHealth: nonnegative.max(5_000_000).optional(),
    maintainVigil: z.boolean().optional(),
    requireVigil: z.boolean().optional(),
  })
  .strict();
const friendlyItems = new Set([4381, 18637, 4262, 8346]);
export const paladinHealingCooldownSchema = z
  .object({
    itemId: id.optional(),
    spellId: id.optional(),
    minimumMissingMana: nonnegative.max(1_000_000).optional(),
    requireHealingDemand: z.boolean().optional(),
    targetRaidIndex: z.number().int().min(-1).max(4).optional(),
    minimumMissingHealth: nonnegative.max(1_000_000).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (Boolean(entry.itemId) === Boolean(entry.spellId))
      context.addIssue({ code: "custom", message: "Choose one item or spell cooldown" });
    if (
      (entry.targetRaidIndex !== undefined || entry.minimumMissingHealth !== undefined) &&
      (!entry.itemId || !friendlyItems.has(entry.itemId))
    )
      context.addIssue({ code: "custom", message: "Unsupported friendly item targeting" });
    if (
      entry.itemId === 4262 &&
      entry.targetRaidIndex !== undefined &&
      ![-1, 0].includes(entry.targetRaidIndex)
    )
      context.addIssue({ code: "custom", message: "The healing belt can only target its wearer" });
  });
const sharedWorkload = healingWorkloadSchema.shape;
const itemArea = z.enum(["neutral", "haunted", "wasteland"]);
const equipmentReferences = {
  itemEffectsPolicy: paladinHealingItemPolicySchema.optional(),
  legacyItemsPolicy: paladinHealingLegacyItemPolicySchema.optional(),
  castSetPolicy: paladinHealingCastSetPolicySchema.optional(),
  selfSetPolicy: paladinHealingSelfSetPolicySchema.optional(),
  itemHealthRegenTickMs: z.union([z.literal(2000), z.literal(5000)]).optional(),
  itemArea: itemArea.optional(),
  orbArea: itemArea.optional(),
  recombobulatorCanCrit: z.boolean().optional(),
  utilityHealingCanCrit: z.boolean().optional(),
  circleChannelScales: z.boolean().optional(),
};
export const paladinHealingWorkloadSchema = z
  .object({
    schema: z.literal("kfc-paladin-healing-workload.v1"),
    name: sharedWorkload.name,
    targets: sharedWorkload.targets,
    damage: sharedWorkload.damage,
    priorities: z.array(paladinHealingPrioritySchema).min(1).max(32),
    decisionIntervalMs: sharedWorkload.decisionIntervalMs,
    assignmentScoring: z.literal("external-demand-v1"),
    requireFullTalentBuild: z.literal(true),
    allowConditionalSpellCandidates: z.literal(true),
    rankScaling: paladinHealingRankPolicySchema,
    vigilRefundMode: z.enum(["none", "once-per-cast", "per-critical-recipient"]),
    useDivineFavor: z.boolean(),
    divineFavorMinimumBaseCost: nonnegative.max(1_000_000),
    blessingOfLight: paladinBlessingOfLightSchema,
    cooldowns: z.array(paladinHealingCooldownSchema).max(16),
    ...equipmentReferences,
  })
  .strict()
  .superRefine((frame, context) => {
    const targets = new Set(frame.targets.map((target) => target.raidIndex));
    if (
      targets.size !== 5 ||
      !frame.targets.some((target) => target.raidIndex === 0 && target.maximumHealth === 0)
    )
      context.addIssue({
        code: "custom",
        message:
          "Healing assignments require exactly five distinct player profiles and natural caster health",
      });
    if (
      frame.damage.some((event) => !targets.has(event.raidIndex)) ||
      frame.priorities.some(
        (priority) => priority.raidIndex >= 0 && !targets.has(priority.raidIndex),
      ) ||
      frame.blessingOfLight.assignments.some((entry) => !targets.has(entry.raidIndex)) ||
      frame.cooldowns.some(
        (entry) =>
          entry.targetRaidIndex !== undefined &&
          entry.targetRaidIndex >= 0 &&
          !targets.has(entry.targetRaidIndex),
      )
    )
      context.addIssue({ code: "custom", message: "Unknown friendly assignment target" });
    if (!frame.useDivineFavor && frame.divineFavorMinimumBaseCost !== 0)
      context.addIssue({
        code: "custom",
        message: "Inactive Divine Favor cannot retain a cooldown cost",
      });
    if (
      frame.itemArea !== undefined &&
      frame.orbArea !== undefined &&
      frame.itemArea !== frame.orbArea
    )
      context.addIssue({ code: "custom", message: "Conflicting item-area references" });
  });
export const paladinHealingAssignmentMetricsSchema = z
  .object({
    schema: z.literal("kfc-paladin-external-assignment.v1"),
    supportHpsMean: nonnegative,
    supportHpsStdev: nonnegative,
    healthRestoredHpsMean: nonnegative,
    absorbedHpsMean: nonnegative,
    damageDemandMean: nonnegative,
    overkillExcludedMean: nonnegative,
    externalMissingHealthSecondsMean: nonnegative,
    finalExternalMissingHealthMean: nonnegative,
  })
  .strict()
  .refine(
    (value) =>
      Math.abs(value.supportHpsMean - value.healthRestoredHpsMean - value.absorbedHpsMean) <=
      Math.max(1, value.supportHpsMean) * 1e-7,
    "External healing accounting does not reconcile",
  );
const metrics = healingResultSchema.shape;
export const paladinHealingResultSchema = z
  .object({
    schema: z.literal("kfc-paladin-healing-workload-result.v1"),
    name: metrics.name,
    iterations: metrics.iterations,
    survivalRate: metrics.survivalRate,
    manaRemainingMean: metrics.manaRemainingMean,
    missingHealthSecondsMean: metrics.missingHealthSecondsMean,
    finalMissingHealthMean: metrics.finalMissingHealthMean,
    manaBlockedSecondsMean: metrics.manaBlockedSecondsMean,
    plannedIncomingPostMitigationDamage: metrics.plannedIncomingPostMitigationDamage,
    deliveredIncomingDamageMean: metrics.deliveredIncomingDamageMean,
    hps: metrics.hps,
    hpsStdev: metrics.hpsStdev,
    rawHps: metrics.rawHps,
    effectiveHealingHps: metrics.effectiveHealingHps,
    overhealingHps: metrics.overhealingHps,
    absorbedHps: metrics.absorbedHps,
    assignment: paladinHealingAssignmentMetricsSchema,
    legalTalentBuild: z.literal(true),
    rankScaling: paladinHealingRankPolicySchema,
    vigilRefundMode: z.enum(["none", "once-per-cast", "per-critical-recipient"]),
    blessingOfLight: paladinBlessingOfLightSchema,
    ...equipmentReferences,
    classQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    const tolerance = Math.max(1, result.hps, result.rawHps) * 1e-7,
      demandTolerance = Math.max(1, result.plannedIncomingPostMitigationDamage) * 1e-7,
      duration = Number(result.name.match(/-(\d+)s-/)?.[1]);
    if (
      ![180, 300].includes(duration) ||
      Math.abs(
        result.assignment.supportHpsMean * duration -
          result.assignment.damageDemandMean +
          result.assignment.finalExternalMissingHealthMean,
      ) > demandTolerance
    )
      context.addIssue({
        code: "custom",
        message: "External healing does not match the declared damage and duration",
      });
    if (
      Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) > tolerance ||
      Math.abs(result.rawHps - result.effectiveHealingHps - result.overhealingHps) > tolerance ||
      result.deliveredIncomingDamageMean >
        result.plannedIncomingPostMitigationDamage + demandTolerance ||
      result.assignment.damageDemandMean >
        result.plannedIncomingPostMitigationDamage + demandTolerance ||
      result.assignment.finalExternalMissingHealthMean >
        result.assignment.damageDemandMean + demandTolerance
    )
      context.addIssue({
        code: "custom",
        message: "Paladin healing accounting does not reconcile",
      });
    if (
      result.itemArea !== undefined &&
      result.orbArea !== undefined &&
      result.itemArea !== result.orbArea
    )
      context.addIssue({ code: "custom", message: "Conflicting result item-area references" });
  });
export const paladinHealingJobSchema = z
  .object({
    schema: z.literal("kfc-paladin-healing-job.v1"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    requestBase64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(500000),
    workload: paladinHealingWorkloadSchema,
    detail: z.literal(false),
  })
  .strict();
export const paladinHealingReplySchema = z.discriminatedUnion("status", [
  z
    .object({
      schema: z.literal("kfc-paladin-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("complete"),
      result: paladinHealingResultSchema,
    })
    .strict(),
  z
    .object({
      schema: z.literal("kfc-paladin-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("error"),
      error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
    })
    .strict(),
]);

export type PaladinHealingWorkload = z.infer<typeof paladinHealingWorkloadSchema>;
export type PaladinHealingResult = z.infer<typeof paladinHealingResultSchema>;
export type PaladinHealingJob = z.infer<typeof paladinHealingJobSchema>;
export type PaladinHealingReply = z.infer<typeof paladinHealingReplySchema>;

export interface PaladinHealingDisplayMetrics {
  readonly effectiveHealingHps: number;
  readonly absorbedHps: number;
  readonly supportHps: number;
  readonly meanMissingHealth: number;
  readonly manaRemaining: number;
  readonly survivalRate: number;
}

/** Display the external-demand ledger while retaining the original raw engine result. */
export function paladinHealingDisplayMetrics(
  result: PaladinHealingResult,
): PaladinHealingDisplayMetrics {
  const match = result.name.match(/-(\d+)s-/),
    duration = Number(match?.[1]);
  if (!Number.isSafeInteger(duration) || duration <= 0)
    throw new Error("The healing result has no declared assignment duration");
  return {
    effectiveHealingHps: result.assignment.healthRestoredHpsMean,
    absorbedHps: result.assignment.absorbedHpsMean,
    supportHps: result.assignment.supportHpsMean,
    meanMissingHealth: result.assignment.externalMissingHealthSecondsMean / duration,
    manaRemaining: result.manaRemainingMean,
    survivalRate: result.survivalRate,
  };
}
