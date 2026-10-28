import { z } from "zod";
import { healingResultSchema } from "./healing-simulator.js";
import { shamanHealingEffectsSchema } from "./shaman-healing-effects.js";

export { shamanHealingEffectsSchema } from "./shaman-healing-effects.js";
export type { ShamanHealingEffects } from "./shaman-healing-effects.js";
export { shamanHealingEquipmentEffects } from "./shaman-healing-equipment-effects.js";
export type {
  ShamanHealingEquipmentItem,
  ShamanHealingEquippedItem,
} from "./shaman-healing-equipment-effects.js";

const id = z.number().int().positive().max(2_147_483_647);
const nonnegative = z.number().finite().nonnegative();
const health = nonnegative.max(1_000_000);
const chance = nonnegative.max(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const referenceId = z.string().min(1).max(100);
const raidIndex = z.number().int().min(0).max(39);
const milliseconds = z.number().int().min(0).max(1_800_000);
const mp5Model = z.enum(["per-five-reference", "per-second-reference"]);
const race = z.union([z.literal(1), z.literal(5), z.literal(6), z.literal(7), z.literal(10)]);

export const shamanHealingRankPolicySchema = z
  .object({
    schema: z.literal("kfc-shaman-rank-sensitivity.v1"),
    id: referenceId,
    kind: z.enum(["unscaled-reference", "level-distance-sensitivity"]),
    fullScalingGap: z.number().int().min(0).max(60),
    coefficientLossPerLevel: chance,
    classProcMode: z.enum(["unchanged", "coefficient-factor"]),
  })
  .strict()
  .refine(
    (policy) =>
      policy.kind === "unscaled-reference"
        ? policy.fullScalingGap === 0 &&
          policy.coefficientLossPerLevel === 0 &&
          policy.classProcMode === "unchanged"
        : policy.coefficientLossPerLevel > 0,
    "Inconsistent Shaman rank reference",
  );
export const shamanHealingRacialPolicySchema = z
  .object({
    schema: z.literal("kfc-shaman-racial-policy.v1"),
    criticalHealing: z.enum(["client-aura50-reference", "disabled-reference"]),
    actions: z
      .array(
        z
          .object({
            spellId: z.union([z.literal(20554), z.literal(20572)]),
            earliestMs: milliseconds,
            maximumUses: z.number().int().min(1).max(20),
          })
          .strict(),
      )
      .max(1)
      .nullable(),
  })
  .strict();
export const shamanHealingPrioritySchema = z
  .object({
    spellId: id,
    raidIndex: z.number().int().min(-1).max(39),
    minimumMissingHealth: health,
    minimumMissingMana: health,
    keepHot: z.boolean(),
    requireHot: z.boolean(),
    minimumInjuredTargets: z.number().int().min(0).max(3),
    minimumGroupMissingHealth: nonnegative.max(3_000_000),
  })
  .strict();
export const shamanHealingWorkloadSchema = z
  .object({
    schema: z.literal("kfc-shaman-healing-workload.v1"),
    name: z.string().min(1).max(160),
    targets: z
      .array(
        z
          .object({
            raidIndex,
            maximumHealth: health,
            x: z.number().finite(),
            y: z.number().finite(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    damage: z
      .array(
        z
          .object({
            atMs: milliseconds,
            raidIndex,
            amount: health.positive(),
          })
          .strict(),
      )
      .max(20_000)
      .nullable(),
    priorities: z.array(shamanHealingPrioritySchema).min(1).max(32),
    decisionIntervalMs: z.number().int().min(1).max(1000),
    bounceRange: z.union([z.literal(10), z.literal(12.5), z.literal(15)]),
    chainRouting: z.enum(["nearest-injured-reference", "largest-deficit-reference"]),
    water: z
      .object({
        FirstPulse: z.enum(["after-period-reference", "immediate-reference"]),
        Recipients: z.enum(["party-reference", "raid-reference"]),
        HealingScaling: z.enum(["base-and-power-reference", "base-only-reference"]),
      })
      .strict(),
    resources: z
      .object({
        ShieldCooldown: z.enum(["current-client-reference", "legacy-fifteen-second-reference"]),
        ShieldTriggers: z.enum([
          "class-direct-critical-heals-reference",
          "all-direct-critical-heals-reference",
          "all-critical-heals-reference",
        ]),
        SwiftnessCooldownStart: z.enum(["activation-reference", "consumption-reference"]),
      })
      .strict(),
    riptide: z
      .object({
        HotPower: z.enum(["snapshot-reference", "dynamic-reference"]),
        HotCriticals: z.enum(["noncritical-reference", "critical-reference"]),
        HotCadence: z.enum(["source-fixed-reference", "cast-speed-five-tick-reference"]),
        ChainBonus: z.enum(["all-bounces-reference", "primary-only-reference"]),
        ConsumeHot: z.boolean(),
      })
      .strict(),
    useNaturesSwiftness: z.boolean(),
    naturesSwiftnessMinimumMissingHealth: health,
    rankScaling: shamanHealingRankPolicySchema.optional(),
    racials: shamanHealingRacialPolicySchema.optional(),
  })
  .strict()
  .superRefine((frame, context) => {
    const targets = new Set(frame.targets.map((target) => target.raidIndex));
    if (
      targets.size !== frame.targets.length ||
      !frame.targets.some((target) => target.raidIndex === 0 && target.maximumHealth === 0)
    )
      context.addIssue({
        code: "custom",
        message: "Distinct targets and natural caster health are required",
      });
    if (
      (frame.damage ?? []).some((event) => !targets.has(event.raidIndex)) ||
      frame.priorities.some(
        (priority) => priority.raidIndex >= 0 && !targets.has(priority.raidIndex),
      )
    )
      context.addIssue({ code: "custom", message: "Unknown friendly assignment target" });
    if (!frame.useNaturesSwiftness && frame.naturesSwiftnessMinimumMissingHealth !== 0)
      context.addIssue({ code: "custom", message: "Inactive Nature's Swiftness has a threshold" });
  });

export const shamanHealingRecipientManaSchema = z
  .object({
    schema: z.literal("kfc-shaman-recipient-mana.v1"),
    id: referenceId,
    regeneration: z.literal("none-reference"),
    payment: z.literal("all-or-nothing-no-retry-reference"),
    timing: z.enum(["spend-before-pulses-reference", "spend-after-pulses-reference"]),
    recipients: z
      .array(
        z
          .object({
            raidIndex: raidIndex.min(1),
            maximumMana: health.positive(),
            startingMana: health,
            costs: z
              .array(z.object({ atMs: milliseconds, amount: health.positive() }).strict())
              .max(20_000)
              .nullable(),
          })
          .strict()
          .refine(
            (recipient) => recipient.startingMana <= recipient.maximumMana,
            "Starting mana exceeds capacity",
          ),
      )
      .min(1)
      .max(39),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      new Set(policy.recipients.map((recipient) => recipient.raidIndex)).size !==
      policy.recipients.length
    )
      context.addIssue({ code: "custom", message: "Duplicate recipient mana pool" });
    if (
      policy.recipients.reduce((count, recipient) => count + (recipient.costs?.length ?? 0), 0) >
      20_000
    )
      context.addIssue({ code: "custom", message: "Too many recipient mana costs" });
  });
export const shamanHealingCooldownSchema = z
  .object({
    itemId: id,
    raidIndex: z.number().int().min(-1).max(39),
    earliestMs: milliseconds,
    minimumMissingMana: health,
    minimumMissingHealth: health,
    minimumOwnHealth: health,
    maximumUses: z.number().int().min(1).max(20),
  })
  .strict()
  .refine(
    (entry) => entry.raidIndex <= 0 || [8346, 4381, 18637].includes(entry.itemId),
    "This item can only target its wearer",
  );
const cooldowns = z
  .array(shamanHealingCooldownSchema)
  .max(24)
  .nullable()
  .refine(
    (entries) =>
      entries === null || new Set(entries.map((entry) => entry.itemId)).size === entries.length,
    "Duplicate equipped cooldown",
  );
export const shamanHealingEquippedWorkloadSchema = z
  .object({
    schema: z.literal("kfc-shaman-equipped-workload.v1"),
    runtimeIdentity: checksum,
    domainIdentity: checksum,
    profileId: z.string().min(1).max(160),
    raidSupport: z.literal("full-v2"),
    mp5Model,
    workload: shamanHealingWorkloadSchema,
    effects: shamanHealingEffectsSchema,
    cooldowns,
    recipientMana: shamanHealingRecipientManaSchema.optional(),
  })
  .strict()
  .superRefine((frame, context) => {
    const targets = new Set(frame.workload.targets.map((target) => target.raidIndex));
    if (
      (frame.cooldowns ?? []).some(
        (entry) => entry.raidIndex >= 0 && !targets.has(entry.raidIndex),
      ) ||
      frame.recipientMana?.recipients.some((entry) => !targets.has(entry.raidIndex))
    )
      context.addIssue({ code: "custom", message: "Unknown equipped workload recipient" });
  });

const accessPolicy = z
  .object({
    schema: z.literal("kfc-shaman-five-thunders-access-policy.v1"),
    id: referenceId,
    completedPhase: z.number().int().min(0).max(4),
    accessReference: z.enum(["none", "horde-shaman-quest-chain-completed-reference"]),
    liveServerAccessVerified: z.literal(false),
  })
  .strict()
  .refine(
    (policy) => (policy.completedPhase === 0) === (policy.accessReference === "none"),
    "Inconsistent Five Thunders access reference",
  );
const loadout = z
  .object({
    schema: z.literal("kfc-shaman-equipped-loadout-admission.v1"),
    domainIdentity: checksum,
    profileId: z.string().min(1).max(160),
    race,
    faction: z.union([z.literal(1), z.literal(2)]),
    professions: z.array(id).length(2),
    accessPolicy,
    conditionalItemIds: z.array(id),
    equipment: z
      .object({
        items: z.array(z.object({ id: id.optional(), enchant: id.optional() }).strict()).length(17),
      })
      .strict(),
    workloadAdmission: z.literal(false),
    numericalQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((entry, context) => {
    if ((entry.race === 1) !== (entry.faction === 1))
      context.addIssue({ code: "custom", message: "Shaman race and faction disagree" });
    if (entry.faction === 1 && entry.accessPolicy.completedPhase !== 0)
      context.addIssue({ code: "custom", message: "No Alliance Five Thunders unlock is admitted" });
    if (new Set(entry.professions).size !== entry.professions.length)
      context.addIssue({ code: "custom", message: "Duplicate loadout profession" });
  });
const equippedReceipt = z
  .object({
    schema: z.literal("kfc-shaman-equipped-receipt.v1"),
    runtimeIdentity: checksum,
    requestIdentity: checksum,
    raidSupport: z.literal("full-v2"),
    mp5Model,
    loadout,
    effects: shamanHealingEffectsSchema,
    cooldowns,
    cooldownUsesMean: z.array(nonnegative).max(24),
    recipientMana: shamanHealingRecipientManaSchema.optional(),
    fullClassAdmission: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .refine(
    (receipt) => receipt.cooldownUsesMean.length === (receipt.cooldowns?.length ?? 0),
    "Equipped cooldown receipt has inconsistent use counts",
  );
export const shamanHealingAssignmentMetricsSchema = z
  .object({
    schema: z.literal("kfc-shaman-external-assignment.v1"),
    supportHpsMean: nonnegative,
    supportHpsStdev: nonnegative,
    healthRestoredHpsMean: nonnegative,
    absorbedHpsMean: nonnegative,
    damageDemandMean: nonnegative,
    overkillExcludedMean: nonnegative,
    externalMissingHealthSecondsMean: nonnegative,
    finalExternalMissingHealthMean: nonnegative,
    usefulOwnManaTideManaMean: nonnegative,
    usefulOtherManaTideManaMean: nonnegative,
    recipientManaDemandMean: nonnegative.optional(),
    recipientManaSpentMean: nonnegative.optional(),
    recipientUnpaidManaMean: nonnegative.optional(),
    recipientManaCostsCompletedMean: nonnegative.optional(),
    recipientManaCostsMissedMean: nonnegative.optional(),
    finalLivingRecipientManaMean: nonnegative.optional(),
    externalNonHealingDeficitAdjustmentMean: z.number().finite().optional(),
  })
  .strict()
  .refine(
    (entry) =>
      Math.abs(entry.supportHpsMean - entry.healthRestoredHpsMean - entry.absorbedHpsMean) <=
      Math.max(1, entry.supportHpsMean) * 1e-7,
    "External healing accounting does not reconcile",
  )
  .refine(
    (entry) =>
      Math.abs(
        (entry.recipientManaSpentMean ?? 0) +
          (entry.recipientUnpaidManaMean ?? 0) -
          (entry.recipientManaDemandMean ?? 0),
      ) <=
      Math.max(1, entry.recipientManaDemandMean ?? 0) * 1e-7,
    "Recipient mana accounting does not reconcile",
  );
const metrics = healingResultSchema.shape;
export const shamanHealingResultSchema = z
  .object({
    schema: z.literal("kfc-shaman-healing-workload-result.v1"),
    name: z.string().min(1).max(160),
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
    assignment: shamanHealingAssignmentMetricsSchema,
    equipped: equippedReceipt,
    rankScaling: shamanHealingRankPolicySchema.optional(),
    racials: shamanHealingRacialPolicySchema.optional(),
    racialUsesMean: z.array(nonnegative).max(1).optional(),
    // Detailed protobuf metrics remain an opaque diagnostic; display uses the typed ledgers.
    metrics: z.record(z.string(), z.unknown()).optional(),
    classQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    const tolerance = Math.max(1, result.hps, result.rawHps) * 1e-7;
    const demandTolerance = Math.max(1, result.plannedIncomingPostMitigationDamage) * 1e-7;
    if (
      Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) > tolerance ||
      Math.abs(result.rawHps - result.effectiveHealingHps - result.overhealingHps) > tolerance ||
      result.deliveredIncomingDamageMean >
        result.plannedIncomingPostMitigationDamage + demandTolerance ||
      result.assignment.damageDemandMean > result.deliveredIncomingDamageMean + demandTolerance ||
      result.assignment.supportHpsMean > result.hps + tolerance
    )
      context.addIssue({ code: "custom", message: "Shaman healing accounting does not reconcile" });
    if ((result.racialUsesMean?.length ?? 0) !== (result.racials?.actions?.length ?? 0))
      context.addIssue({ code: "custom", message: "Racial receipt has inconsistent use counts" });
    for (const action of result.racials?.actions ?? []) {
      if (
        (action.spellId === 20554 && result.equipped.loadout.race !== 7) ||
        (action.spellId === 20572 && result.equipped.loadout.race !== 5)
      )
        context.addIssue({ code: "custom", message: "Unowned racial action in result" });
    }
  });
export const shamanHealingJobSchema = z
  .object({
    schema: z.literal("kfc-shaman-equipped-job.v1"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    requestBase64: z
      .string()
      .min(4)
      .max(4_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .refine((value) => value.length % 4 === 0, "Incomplete base64 request"),
    workload: shamanHealingEquippedWorkloadSchema,
    detail: z.boolean(),
  })
  .strict();
export const shamanHealingReplySchema = z.discriminatedUnion("status", [
  z
    .object({
      schema: z.literal("kfc-shaman-equipped-job-result.v1"),
      id: z.string(),
      status: z.literal("complete"),
      result: shamanHealingResultSchema,
    })
    .strict(),
  z
    .object({
      schema: z.literal("kfc-shaman-equipped-job-result.v1"),
      id: z.string(),
      status: z.literal("error"),
      error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
    })
    .strict(),
]);

export type ShamanHealingWorkload = z.infer<typeof shamanHealingWorkloadSchema>;
export type ShamanHealingEquippedWorkload = z.infer<typeof shamanHealingEquippedWorkloadSchema>;
export type ShamanHealingResult = z.infer<typeof shamanHealingResultSchema>;
export type ShamanHealingJob = z.infer<typeof shamanHealingJobSchema>;
export type ShamanHealingReply = z.infer<typeof shamanHealingReplySchema>;

export interface ShamanHealingDisplayMetrics {
  readonly effectiveHealingHps: number;
  readonly absorbedHps: number;
  readonly supportHps: number;
  readonly meanMissingHealth: number;
  readonly manaRemaining: number;
  readonly survivalRate: number;
  readonly usefulOwnManaTideMana: number;
  readonly usefulOtherManaTideMana: number;
}

/** Validate external support against the actual encoded encounter duration, not a preset label. */
export function shamanHealingDisplayMetrics(
  result: ShamanHealingResult,
  durationSeconds: number,
): ShamanHealingDisplayMetrics {
  const parsed = shamanHealingResultSchema.parse(result);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 1800)
    throw new Error("Invalid Shaman assignment duration");
  const ledger = parsed.assignment;
  const expected = ledger.damageDemandMean + (ledger.externalNonHealingDeficitAdjustmentMean ?? 0);
  const discrepancy =
    ledger.supportHpsMean * durationSeconds + ledger.finalExternalMissingHealthMean - expected;
  // The native ledger caps useful healing at damage taken, excluding newly granted health capacity.
  const capacityCanChange =
    parsed.equipped.effects.protective?.admiralStamina === "additive-reference";
  if (
    (capacityCanChange ? discrepancy : Math.abs(discrepancy)) >
    Math.max(1, Math.abs(expected)) * 1e-7
  )
    throw new Error("External Shaman healing does not match damage and encounter duration");
  return {
    effectiveHealingHps: ledger.healthRestoredHpsMean,
    absorbedHps: ledger.absorbedHpsMean,
    supportHps: ledger.supportHpsMean,
    meanMissingHealth: ledger.externalMissingHealthSecondsMean / durationSeconds,
    manaRemaining: parsed.manaRemainingMean,
    survivalRate: parsed.survivalRate,
    usefulOwnManaTideMana: ledger.usefulOwnManaTideManaMean,
    usefulOtherManaTideMana: ledger.usefulOtherManaTideManaMean,
  };
}

/** Reject stale worker replies before displaying or saving results for a different build. */
export function validateShamanHealingReply(
  job: ShamanHealingJob,
  reply: unknown,
  durationSeconds: number,
): ShamanHealingReply {
  const parsedJob = shamanHealingJobSchema.parse(job);
  const parsedReply = shamanHealingReplySchema.parse(reply);
  if (parsedReply.id !== parsedJob.id)
    throw new Error("The Shaman reply belongs to a different job");
  if (parsedReply.status === "error") return parsedReply;
  const result = parsedReply.result;
  const receipt = result.equipped;
  const frame = parsedJob.workload;
  if (
    result.name !== frame.workload.name ||
    receipt.runtimeIdentity !== frame.runtimeIdentity ||
    receipt.loadout.domainIdentity !== frame.domainIdentity ||
    receipt.loadout.profileId !== frame.profileId ||
    receipt.mp5Model !== frame.mp5Model ||
    JSON.stringify(receipt.effects) !== JSON.stringify(frame.effects) ||
    JSON.stringify(receipt.cooldowns) !== JSON.stringify(frame.cooldowns) ||
    JSON.stringify(receipt.recipientMana) !== JSON.stringify(frame.recipientMana) ||
    JSON.stringify(result.rankScaling) !== JSON.stringify(frame.workload.rankScaling) ||
    JSON.stringify(result.racials) !== JSON.stringify(frame.workload.racials) ||
    parsedJob.detail !== (result.metrics !== undefined)
  )
    throw new Error("The Shaman reply does not match the requested build and policies");
  const damage = (frame.workload.damage ?? []).reduce((total, event) => total + event.amount, 0);
  if (Math.abs(result.plannedIncomingPostMitigationDamage - damage) > Math.max(1, damage) * 1e-7)
    throw new Error("The Shaman reply does not match the scheduled damage");
  if (
    (frame.workload.damage ?? []).some((event) => event.atMs >= durationSeconds * 1000) ||
    (frame.cooldowns ?? []).some(
      (entry, index) =>
        entry.earliestMs >= durationSeconds * 1000 ||
        receipt.cooldownUsesMean[index]! > entry.maximumUses,
    ) ||
    (frame.workload.racials?.actions ?? []).some(
      (entry, index) =>
        entry.earliestMs >= durationSeconds * 1000 ||
        result.racialUsesMean![index]! > entry.maximumUses,
    ) ||
    frame.recipientMana?.recipients.some((recipient) =>
      recipient.costs?.some((cost) => cost.atMs >= durationSeconds * 1000),
    )
  )
    throw new Error("The Shaman reply has inconsistent timing or use counts");
  shamanHealingDisplayMetrics(result, durationSeconds);
  return parsedReply;
}
