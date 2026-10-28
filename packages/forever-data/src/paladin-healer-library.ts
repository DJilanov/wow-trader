import { z } from "zod";
import { healingEquipmentSchema } from "./healing-simulator.js";
import {
  paladinHealingJobSchema,
  paladinHealingWorkloadSchema,
} from "./paladin-healing-simulator.js";

const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(150);
const talentField = z.string().regex(/^[a-z][a-zA-Z0-9]*$/);
const archetype = z.enum(["direct-healing-support", "vigil-mobility", "vigil-support"]);
const assignment = z.enum(["tank", "group", "burst"]);
const profileId = z.enum(["1:4,11", "2:4,11"]);
const sourceReference = z
  .object({ path: z.string().min(1).max(1000), byteSha256: checksum })
  .strict();
const round = z.object({ iterations: id.max(10_000), seed: id }).strict();

export const paladinHealerLibraryContextSchema = z
  .object({
    playerClass: z.literal(4),
    faction: z.union([z.literal(1), z.literal(2)]),
    professions: z.tuple([z.literal(4), z.literal(11)]),
    raceId: id,
  })
  .strict();

const option = z
  .object({
    state: z
      .object({
        id: key,
        talentsString: z.string().regex(/^[0-5]*-[0-5]*-[0-5]*$/),
        fields: z.record(talentField, count),
      })
      .strict(),
    policy: z
      .object({
        directSpellId: id,
        directMinimumMissingHealth: nonnegative,
        holyShock: z.boolean(),
        lightsVigil: z.boolean(),
        maintainVigil: z.boolean(),
        ranks: z.record(key, id),
      })
      .strict(),
    gear: z.object({ items: healingEquipmentSchema }).strict(),
    consumes: z
      .object({
        flask: count,
        food: count,
        mainHandImbue: count,
        defaultPotion: count,
        defaultConjured: count,
      })
      .strict(),
    manaRegenElixir: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    alcohol: count.max(5),
    useUtilities: z.boolean(),
    requireVigil: z.boolean(),
    favorMinimumBaseCost: nonnegative,
    minimumPartyTargets: count.max(5),
    minimumPartyMissingHealth: nonnegative,
    resourceOrder: z.enum(["as-declared", "rune-last"]),
    survivalPolicyId: key.optional(),
    reservePolicyId: key.optional(),
    tankReservePolicyId: key.optional(),
  })
  .strict();

const sourceEvidence = z
  .object({
    caseKey: z.string().min(1).max(2000),
    spec: archetype,
    kind: assignment,
    profileId,
    scenarioId: key,
    pressure: nonnegative,
    origin: sourceReference,
    sourceIdentity: checksum,
    optionId: checksum,
    gearId: checksum,
    requestKeys: z.array(checksum).length(4),
    rounds: z.array(round).length(4),
    observedPractical2Percent: z.literal(true),
    observedStrict1Percent: z.boolean().optional(),
    selectedSurvive: z.literal(true),
    feasibleRetainedAlternatives: count.optional(),
    largestPerComparison95Upper: finite.optional(),
    observedFailedFights: z.literal(0),
    setupIdentity: checksum,
    hasIndexedHistoricalFailure: z.literal(false),
    priorFailedFightObservations: z.literal(0),
    observations: z.array(z.unknown()).max(100),
    supersededRecommendation: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const summary = z
  .object({
    survivalRate: z.literal(1),
    hps: nonnegative,
    hpsStdev: nonnegative,
    absorbedHps: nonnegative,
    effectiveHealingHps: nonnegative,
    missingHealthSecondsMean: nonnegative,
    finalMissingHealthMean: nonnegative,
    manaRemainingMean: nonnegative,
    manaBlockedSecondsMean: nonnegative,
    deliveredIncomingDamageMean: nonnegative,
    feasible: z.literal(true),
    meanMissingHealth: nonnegative,
  })
  .strict();

const reference = z
  .object({
    summaries: z.array(summary).length(4),
    rounds: z.array(round).length(4),
    iterations: id,
    hps: nonnegative,
    meanMissingHealth: nonnegative,
    observedPractical2Percent: z.literal(true),
    healthDeficitObjective: z.literal(true),
    demandLimitedHps: z.literal(true),
    wholeClassQualified: z.literal(false),
  })
  .strict();

const savedJob = paladinHealingJobSchema.omit({ workload: true });
export const paladinHealerLibraryOptionSchema = option;
export const paladinHealerLibraryReferenceSchema = reference;
export const paladinHealerLibrarySourceEvidenceSchema = sourceEvidence;

const configuration = z
  .object({
    id: checksum,
    groupId: z.string().min(1).max(250),
    scenarioId: key,
    optionId: checksum,
    option,
    job: savedJob,
    workloadId: checksum,
    sourceCaseKey: z.string().min(1).max(2000),
    sourceEvidence,
    reference,
  })
  .strict();
const group = z
  .object({
    id: z.string().min(1).max(250),
    archetype,
    title: z.string().min(1).max(100),
    assignment,
    profileId,
    context: paladinHealerLibraryContextSchema,
    defaultConfigurationId: checksum,
    configurationIds: z.array(checksum).length(28),
  })
  .strict();

// Engine catalog records have versioned extra fields; retain them for the picker and source review.
const catalogEntry = z
  .object({
    item: z
      .object({
        id,
        name: z.string().min(1),
        icon: z.string().min(1),
        type: count,
        stats: z.array(finite).length(44),
        ilvl: count.optional(),
        quality: count.max(7).optional(),
        weaponType: count.optional(),
        handType: count.optional(),
      })
      .passthrough(),
    source: z
      .object({ id, requiredLevel: count.max(60), name: z.string().min(1).optional() })
      .passthrough(),
  })
  .strict();

const candidateStructure = z
  .object({
    schema: z.literal("kfc-paladin-healer-library-candidate.v1"),
    profile: z.literal("healing-paladin"),
    model: z
      .object({ path: z.string().min(1), identity: checksum, runtimeSha256: checksum })
      .strict(),
    source: z
      .object({
        input: sourceReference,
        review: sourceReference,
        sourcePackReviewComplete: z.literal(true),
      })
      .strict(),
    scope: z
      .object({
        durationSeconds: z.literal(180),
        layout: z.literal("stacked"),
        defaultProfiles: z.literal(2),
        archetypes: z.literal(3),
        assignments: z.literal(3),
        mechanicsScenarios: z.literal(28),
        scenarioChangesRequireTheirOwnGearTalentsConsumesAndWorkload: z.literal(true),
        fiveMinuteAndSpreadQualification: z.literal(false),
        sourceProvenanceReconstructed: z.literal(true),
        websiteAdmissionRequired: z.literal(true),
      })
      .strict(),
    defaultGroupId: z.string().min(1).max(250),
    groups: z.array(group).length(18),
    configurations: z.array(configuration).length(504),
    workloads: z
      .array(z.object({ id: checksum, frame: paladinHealingWorkloadSchema }).strict())
      .min(1)
      .max(504),
    catalog: z.array(catalogEntry).min(1).max(5000),
    websiteAdmissionComplete: z.literal(false),
    fullClassQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((library, context): void => {
    const groups = new Map(library.groups.map((entry) => [entry.id, entry]));
    const configurations = new Map(library.configurations.map((entry) => [entry.id, entry]));
    const workloads = new Map(library.workloads.map((entry) => [entry.id, entry.frame]));
    const items = new Set(library.catalog.map((entry) => entry.item.id));
    const issue = (message: string, path: (string | number)[] = []): void =>
      context.addIssue({ code: "custom", message, path });
    if (
      groups.size !== 18 ||
      configurations.size !== 504 ||
      workloads.size !== library.workloads.length ||
      items.size !== library.catalog.length ||
      !groups.has(library.defaultGroupId)
    )
      issue("Incomplete or duplicate Paladin library identities");
    for (const entry of library.catalog)
      if (entry.item.id !== entry.source.id) issue("Catalog source ID differs from its item ID");
    for (const entry of library.groups) {
      const entries = entry.configurationIds.map((id) => configurations.get(id));
      if (
        entry.id !== [entry.archetype, entry.assignment, entry.profileId].join("|") ||
        entry.profileId !== `${entry.context.faction}:${entry.context.professions.join(",")}` ||
        new Set(entry.configurationIds).size !== 28 ||
        entries.some((config) => !config || config.groupId !== entry.id) ||
        new Set(entries.map((config) => config?.scenarioId)).size !== 28 ||
        !entry.configurationIds.includes(entry.defaultConfigurationId) ||
        configurations.get(entry.defaultConfigurationId)?.scenarioId !== "reference"
      )
        issue("Invalid Paladin scenario group", ["groups", entry.id]);
    }
    const usedWorkloads = new Set<string>();
    for (const entry of library.configurations) {
      const selectedGroup = groups.get(entry.groupId),
        frame = workloads.get(entry.workloadId);
      if (!selectedGroup || !frame || !selectedGroup.configurationIds.includes(entry.id)) {
        issue("Unknown group or workload", ["configurations", entry.id]);
        continue;
      }
      usedWorkloads.add(entry.workloadId);
      const evidence = entry.sourceEvidence;
      if (
        evidence.caseKey !== entry.sourceCaseKey ||
        evidence.optionId !== entry.optionId ||
        evidence.scenarioId !== entry.scenarioId ||
        evidence.spec !== selectedGroup.archetype ||
        evidence.kind !== selectedGroup.assignment ||
        evidence.profileId !== selectedGroup.profileId ||
        entry.option.gear.items.some((item) => item.id && !items.has(item.id)) ||
        Object.values(entry.option.state.fields).reduce((sum, points) => sum + points, 0) !== 51
      )
        issue("Build does not match its source evidence", ["configurations", entry.id]);
      if (
        entry.job.detail !== false ||
        entry.job.id !== "h-" + evidence.requestKeys[0]?.slice(0, 32) ||
        new Set(evidence.requestKeys).size !== 4 ||
        new Set(entry.reference.rounds.map((round) => round.seed)).size !== 4 ||
        new Set(entry.reference.rounds.map((round) => round.iterations)).size !== 1 ||
        JSON.stringify(entry.reference.rounds) !== JSON.stringify(evidence.rounds) ||
        entry.reference.iterations !==
          entry.reference.rounds.reduce((sum, round) => sum + round.iterations, 0) ||
        entry.reference.hps !==
          entry.reference.summaries.reduce((sum, result) => sum + result.hps, 0) / 4 ||
        entry.reference.meanMissingHealth !==
          entry.reference.summaries.reduce((sum, result) => sum + result.meanMissingHealth, 0) / 4
      )
        issue("Reference result differs from its four source batches", [
          "configurations",
          entry.id,
        ]);
      let tuple: unknown;
      try {
        tuple = JSON.parse(entry.sourceCaseKey) as unknown;
      } catch {
        issue("Invalid source case identity", ["configurations", entry.id]);
        continue;
      }
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 9 ||
        tuple[0] !== selectedGroup.archetype ||
        tuple[1] !== selectedGroup.assignment ||
        tuple[2] !== selectedGroup.profileId ||
        tuple[3] !== selectedGroup.context.faction ||
        JSON.stringify(tuple[4]) !== JSON.stringify(selectedGroup.context.professions) ||
        tuple[5] !== selectedGroup.context.raceId ||
        tuple[6] !== evidence.pressure ||
        tuple[7] !== 180 ||
        tuple[8] !== entry.scenarioId
      )
        issue("Source case belongs to another profile or scenario", ["configurations", entry.id]);
    }
    if (usedWorkloads.size !== workloads.size) issue("Unused Paladin workload");
  });

export type PaladinHealerLibraryCandidate = z.infer<typeof candidateStructure>;
export type PaladinHealerLibraryConfiguration = z.infer<typeof configuration>;
export type PaladinHealerLibraryGroup = z.infer<typeof group>;

// Validation must preserve original member order: saved workload identity uses its exact JSON.
export const paladinHealerLibraryCandidateSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const result = candidateStructure.safeParse(input);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerLibraryCandidate => input as PaladinHealerLibraryCandidate);
