import { z } from "zod";
import {
  paladinHealingJobSchema,
  paladinHealingWorkloadSchema,
  type PaladinHealingJob,
  type PaladinHealingWorkload,
} from "./paladin-healing-simulator.js";
import {
  paladinHealerLibraryOptionSchema,
  paladinHealerLibraryReferenceSchema,
  paladinHealerLibrarySourceEvidenceSchema,
} from "./paladin-healer-library.js";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.number().int().positive().safe();
const scenarioId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(150);
const assignment = z.enum(["tank", "group", "burst"]);
const professions = z.tuple([id.max(11), id.max(11)]);
const sourceReference = z
  .object({ path: z.string().min(1).max(1000), byteSha256: checksum })
  .strict();
const baselineCaseIdentity = z.tuple([
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  professions,
  z.number(),
  z.number(),
  z.number(),
  z.string(),
]);
export const paladinHealerFrameDescriptorSchema = z
  .object({
    id: z.string().min(1).max(250),
    archetype: z.enum(["direct-healing-support", "vigil-mobility", "vigil-support"]),
    assignment,
    profileId: z.string().regex(/^[12]:[1-9][0-9]?,[1-9][0-9]?$/),
    context: z
      .object({
        playerClass: z.literal(4),
        faction: z.union([z.literal(1), z.literal(2)]),
        professions,
        raceId: id,
      })
      .strict(),
    variant: z
      .object({
        kind: assignment,
        layout: z.enum(["stacked", "spread"]),
        durationSeconds: z.union([z.literal(180), z.literal(300)]),
      })
      .strict(),
  })
  .strict()
  .superRefine((frame, context): void => {
    const variant = frame.variant;
    if (
      frame.context.professions[0] >= frame.context.professions[1] ||
      frame.profileId !== `${frame.context.faction}:${frame.context.professions.join(",")}` ||
      variant.kind !== frame.assignment ||
      frame.id !==
        [
          frame.archetype,
          frame.assignment,
          frame.profileId,
          variant.layout,
          variant.durationSeconds,
        ].join("|") ||
      (frame.assignment === "tank" && variant.layout !== "stacked")
    )
      context.addIssue({ code: "custom", message: "Inconsistent Paladin frame dimensions" });
  });

export type PaladinHealerFrameDescriptor = z.infer<typeof paladinHealerFrameDescriptorSchema>;

/** Check actual assignment identity; original stacked workloads have no layout suffix. */
export function paladinHealerFrameWorkloadProblem(
  frame: PaladinHealerFrameDescriptor,
  workload: PaladinHealingWorkload,
): string | null {
  const variant = frame.variant;
  const name = new RegExp(
    `^synthetic-${frame.assignment}-${variant.durationSeconds}s-[0-9]+(?:\\.[0-9]+)?dps${variant.layout === "spread" ? "-spread" : ""}$`,
  );
  const positions = variant.layout === "spread" ? [0, -30, -12, 12, 30] : [0, 2, 4, 6, 8];
  if (
    workload.assignmentScoring !== "external-demand-v1" ||
    workload.requireFullTalentBuild !== true ||
    !name.test(workload.name) ||
    workload.targets.length !== 5 ||
    new Set(workload.targets.map((target): number => target.raidIndex)).size !== 5 ||
    workload.targets.some(
      (target): boolean => target.x !== positions[target.raidIndex] || target.y !== 0,
    )
  )
    return "Workload does not match the Paladin encounter frame";
  return null;
}
const option = paladinHealerLibraryOptionSchema.extend({
  state: paladinHealerLibraryOptionSchema.shape.state.extend({
    id: paladinHealerLibraryOptionSchema.shape.state.shape.id.optional(),
  }),
});
const adaptivePolicy = z
  .object({
    schema: z.literal("kfc-paladin-adaptive-rank-policy.v1"),
    sustainSpellId: id,
    recoverySpellId: id,
    recoveryHealthFraction: z.union([z.literal(0.15), z.literal(0.3), z.literal(0.6)]),
    sustainMinimumMissingHealth: z.union([z.literal(0), z.literal(400)]),
    activeOrder: z.enum(["active-first", "recovery-first"]),
  })
  .strict();
const reference = paladinHealerLibraryReferenceSchema
  .omit({
    observedPractical2Percent: true,
    healthDeficitObjective: true,
    demandLimitedHps: true,
    wholeClassQualified: true,
  })
  .extend({
    intervalScope: z.string().min(1).max(1000),
    largestPerComparison95Upper: z.number().finite().nullable(),
  });
const configuration = z
  .object({
    id: checksum,
    scenarioId,
    optionId: checksum,
    option,
    adaptivePolicy: adaptivePolicy.optional(),
    job: paladinHealingJobSchema.omit({ workload: true }),
    workloadId: checksum,
    sourceEvidence: z
      .object({
        caseId: checksum,
        sourceKind: z.enum(["baseline", "coupled", "profession-transfer"]),
        requestedGameplayKey: checksum,
        numericalGameplayKey: checksum,
        requestedFirstRequestKey: checksum,
        numericalRequestKeys: z.array(checksum).length(4),
        numericalProfessions: professions,
        originalResult: sourceReference,
        frozenPlan: sourceReference.optional(),
        professionTransferReview: sourceReference.optional(),
        baselineReview: sourceReference.optional(),
        baselineEvidence: paladinHealerLibrarySourceEvidenceSchema
          .extend({
            profileId: z.string().regex(/^[12]:[1-9][0-9]?,[1-9][0-9]?$/),
          })
          .optional(),
        selectedBeforeHoldouts: z.literal(true),
        reselectionPerformed: z.literal(false),
        observedPractical2Percent: z.literal(true),
      })
      .strict(),
    reference,
  })
  .strict();
const structure = z
  .object({
    schema: z.literal("kfc-paladin-healer-frame-payload.v2"),
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    runtimeSha256: checksum,
    source: z.object({ bank: sourceReference, nativeOriginReview: sourceReference }).strict(),
    frame: paladinHealerFrameDescriptorSchema,
    defaultConfigurationId: checksum,
    configurations: z.array(configuration).length(28),
    workloads: z
      .array(z.object({ id: checksum, frame: paladinHealingWorkloadSchema }).strict())
      .min(1)
      .max(28),
    admission: z
      .object({
        nativeOriginsVerified: z.literal(true),
        finalFailureHistoryAuditComplete: z.boolean(),
        professionTransfersComplete: z.boolean(),
        selectedBrowserControlsComplete: z.boolean(),
      })
      .strict(),
    fullClassQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((payload, context): void => {
    const issue = (message: string, path: (string | number)[] = []): void =>
      context.addIssue({ code: "custom", message, path });
    const frame = payload.frame;
    if (
      new Set(payload.configurations.map((entry): string => entry.id)).size !== 28 ||
      new Set(payload.configurations.map((entry): string => entry.scenarioId)).size !== 28 ||
      payload.configurations.find((entry): boolean => entry.id === payload.defaultConfigurationId)
        ?.scenarioId !== "reference"
    )
      issue("Incomplete or duplicate Paladin frame scenarios");
    const workloads = new Map(payload.workloads.map((entry) => [entry.id, entry.frame]));
    if (workloads.size !== payload.workloads.length) issue("Duplicate Paladin frame workload");
    const used = new Set<string>();
    for (const [position, entry] of payload.configurations.entries()) {
      const path = ["configurations", position],
        evidence = entry.sourceEvidence,
        result = entry.reference,
        workload = workloads.get(entry.workloadId);
      if (!workload) {
        issue("Missing Paladin frame workload", path);
        continue;
      }
      used.add(entry.workloadId);
      if (!paladinHealingJobSchema.safeParse({ ...entry.job, workload }).success)
        issue("Invalid complete Paladin healing job", path);
      if (
        evidence.caseId !== entry.id ||
        new Set(evidence.numericalRequestKeys).size !== 4 ||
        evidence.numericalProfessions[0] >= evidence.numericalProfessions[1] ||
        entry.job.id !== "h-" + evidence.numericalRequestKeys[0]?.slice(0, 32) ||
        entry.job.detail !== false ||
        (evidence.sourceKind === "coupled" && !evidence.frozenPlan) ||
        (evidence.sourceKind === "profession-transfer" && !evidence.professionTransferReview)
      )
        issue("Invalid Paladin frame provenance", path);
      const sameProfessions =
        JSON.stringify(evidence.numericalProfessions) === JSON.stringify(frame.context.professions);
      if (
        sameProfessions !==
        (evidence.requestedFirstRequestKey === evidence.numericalRequestKeys[0])
      )
        issue("Profession alias does not match its request identities", path);
      const points = Object.values(entry.option.state.fields);
      if (
        points.reduce((sum, value): number => sum + value, 0) !== 51 ||
        points.some((value): boolean => value > 5) ||
        [...entry.option.state.talentsString.replaceAll("-", "")].reduce(
          (sum, value): number => sum + Number(value),
          0,
        ) !== 51
      )
        issue("Paladin frame requires the complete measured talents", path);
      const baseline = evidence.baselineEvidence;
      if (evidence.sourceKind === "baseline" && !baseline)
        issue("Missing original Paladin baseline admission", path);
      if (baseline) {
        let tuple: unknown;
        try {
          tuple = JSON.parse(baseline.caseKey);
        } catch {
          tuple = null;
        }
        const originalContext = baselineCaseIdentity.safeParse(tuple);
        if (
          evidence.sourceKind === "coupled" ||
          !evidence.baselineReview ||
          entry.adaptivePolicy ||
          frame.variant.layout !== "stacked" ||
          frame.variant.durationSeconds !== 180 ||
          baseline.spec !== frame.archetype ||
          baseline.kind !== frame.assignment ||
          baseline.scenarioId !== entry.scenarioId ||
          baseline.optionId !== entry.optionId ||
          (evidence.sourceKind === "baseline" && baseline.profileId !== frame.profileId) ||
          evidence.originalResult.path !== baseline.origin.path ||
          evidence.originalResult.byteSha256 !== baseline.origin.byteSha256 ||
          baseline.requestKeys.some(
            (key, index): boolean => key !== evidence.numericalRequestKeys[index],
          ) ||
          baseline.rounds.some(
            (round, index): boolean =>
              round.seed !== result.rounds[index]?.seed ||
              round.iterations !== result.rounds[index]?.iterations,
          ) ||
          result.largestPerComparison95Upper !== (baseline.largestPerComparison95Upper ?? null)
        )
          issue("Paladin baseline differs from its original admission", path);
        if (!originalContext.success)
          issue("Invalid original Paladin baseline case identity", path);
        else {
          const tuple = originalContext.data;
          if (
            tuple[0] !== baseline.spec ||
            tuple[1] !== baseline.kind ||
            tuple[2] !== baseline.profileId ||
            tuple[3] !== frame.context.faction ||
            tuple[5] !== frame.context.raceId ||
            tuple[6] !== baseline.pressure ||
            tuple[7] !== 180 ||
            tuple[8] !== entry.scenarioId ||
            tuple[2] !== `${tuple[3]}:${tuple[4].join(",")}` ||
            tuple[4].some(
              (profession, index): boolean => profession !== evidence.numericalProfessions[index],
            )
          )
            issue("Paladin baseline source profile or assignment changed", path);
        }
      }
      const batchIterations = result.rounds[0]?.iterations;
      if (
        result.iterations !==
          result.rounds.reduce((sum, round): number => sum + round.iterations, 0) ||
        result.rounds.some((round): boolean => round.iterations !== batchIterations) ||
        (!baseline && (result.iterations !== 512 || batchIterations !== 128)) ||
        result.rounds.some((round, index): boolean =>
          result.rounds
            .slice(0, index)
            .some((old): boolean => Math.abs(old.seed - round.seed) < 10000),
        ) ||
        result.hps !==
          result.summaries.reduce((sum, summary): number => sum + summary.hps, 0) / 4 ||
        result.meanMissingHealth !==
          result.summaries.reduce((sum, summary): number => sum + summary.meanMissingHealth, 0) / 4
      )
        issue("Paladin reference differs from its four independent batches", path);
      const workloadProblem = paladinHealerFrameWorkloadProblem(frame, workload);
      if (workloadProblem) issue(workloadProblem, path);
      const policy = entry.adaptivePolicy;
      if (policy) {
        const priorities = workload.priorities,
          sustain = priorities.at(-1),
          recovery = policy.activeOrder === "active-first" ? priorities.at(-2) : priorities[0];
        const damaged = new Set(workload.damage.map((event): number => event.raidIndex)),
          recipients = workload.targets.filter((target): boolean => damaged.has(target.raidIndex));
        const health = recipients[0]?.maximumHealth;
        if (
          health === undefined ||
          recipients.some((target): boolean => target.maximumHealth !== health) ||
          policy.sustainSpellId === policy.recoverySpellId ||
          sustain?.spellId !== policy.sustainSpellId ||
          sustain.minimumMissingHealth !== policy.sustainMinimumMissingHealth ||
          recovery?.spellId !== policy.recoverySpellId ||
          recovery.minimumMissingHealth !== health * policy.recoveryHealthFraction ||
          sustain.raidIndex !== recovery.raidIndex ||
          (recovery.minimumMissingHealth ?? 0) <= (sustain.minimumMissingHealth ?? 0) ||
          (policy.activeOrder === "recovery-first" && priorities.length <= 2)
        )
          issue("Adaptive rank metadata differs from the measured priority list", path);
      }
    }
    if (used.size !== workloads.size) issue("Unused Paladin frame workload");
  });

export type PaladinHealerFramePayload = z.infer<typeof structure>;
export type PaladinHealerFrameConfiguration = PaladinHealerFramePayload["configurations"][number];

// Preserve the exact workload member order used by the numerical request identity.
export const paladinHealerFramePayloadSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const parsed = structure.safeParse(input);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerFramePayload => input as PaladinHealerFramePayload);

export function parsePaladinHealerFramePayload(input: unknown): PaladinHealerFramePayload {
  return paladinHealerFramePayloadSchema.parse(input);
}

/** Resolve the complete selected job while preserving the measured adaptive policy and workload. */
export function paladinHealerJobForFrameConfiguration(
  input: unknown,
  scenario = "reference",
): PaladinHealingJob {
  const payload = parsePaladinHealerFramePayload(input);
  const selected = payload.configurations.find((entry): boolean => entry.scenarioId === scenario);
  if (!selected) throw new Error("Unknown Paladin frame scenario");
  const workload = payload.workloads.find((entry): boolean => entry.id === selected.workloadId);
  if (!workload) throw new Error("Missing measured Paladin frame workload");
  return { ...selected.job, workload: workload.frame };
}
