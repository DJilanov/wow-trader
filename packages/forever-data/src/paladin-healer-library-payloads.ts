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

const assetReference = z
  .object({
    file: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_.-]*\.json$/)
      .refine((name) => !name.includes("..")),
    byteSha256: checksum,
    bytes: id.max(8_000_000),
  })
  .strict();
const sharedPayload = {
  profile: z.literal("healing-paladin"),
  modelIdentity: checksum,
  candidateSha256: checksum,
  websiteAdmissionComplete: z.literal(false),
  fullClassQualified: z.literal(false),
  publicationAllowed: z.literal(false),
};
const metadata = z
  .object({
    schema: z.literal("kfc-paladin-healer-library-candidate.v1"),
    profile: sharedPayload.profile,
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
    websiteAdmissionComplete: z.literal(false),
    fullClassQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict();

const indexStructure = z
  .object({
    schema: z.literal("kfc-paladin-healer-library-index-candidate.v1"),
    ...sharedPayload,
    archive: z.object({ byteSha256: checksum, bytes: id.max(128 * 1024 ** 2) }).strict(),
    header: metadata,
    propertyOrder: z.array(z.string().min(1).max(100)).length(13),
    configurationOrder: z.array(checksum).length(504),
    workloadOrder: z.array(checksum).min(1).max(504),
    catalog: assetReference,
    groups: z.array(z.object({ group, asset: assetReference }).strict()).length(18),
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    const expectedKeys = [
      ...Object.keys(value.header),
      "groups",
      "configurations",
      "workloads",
      "catalog",
    ];
    const allConfigurations = value.groups.flatMap((entry) => entry.group.configurationIds);
    const files = [
      value.catalog.file,
      ...value.groups.map((entry) => entry.asset.file),
      "library-index.json",
    ];
    if (
      value.archive.byteSha256 !== value.candidateSha256 ||
      value.header.model.identity !== value.modelIdentity ||
      value.catalog.file !== "catalog.json"
    )
      issue("Paladin index model or archive identity mismatch");
    if (
      new Set(value.propertyOrder).size !== expectedKeys.length ||
      expectedKeys.some((key) => !value.propertyOrder.includes(key))
    )
      issue("Incomplete archive property order");
    if (
      new Set(value.groups.map((entry) => entry.group.id)).size !== 18 ||
      !value.groups.some((entry) => entry.group.id === value.header.defaultGroupId) ||
      new Set(files).size !== 20
    )
      issue("Duplicate or missing Paladin group assets");
    if (
      new Set(allConfigurations).size !== 504 ||
      new Set(value.configurationOrder).size !== 504 ||
      allConfigurations.some((id) => !value.configurationOrder.includes(id)) ||
      new Set(value.workloadOrder).size !== value.workloadOrder.length
    )
      issue("Invalid Paladin configuration or workload order");
    for (const entry of value.groups) {
      const g = entry.group;
      if (
        g.id !== [g.archetype, g.assignment, g.profileId].join("|") ||
        g.profileId !== `${g.context.faction}:${g.context.professions.join(",")}` ||
        new Set(g.configurationIds).size !== 28 ||
        !g.configurationIds.includes(g.defaultConfigurationId) ||
        !/^group-[a-f0-9]{64}\.json$/.test(entry.asset.file)
      )
        issue("Invalid Paladin group descriptor");
    }
  });

const catalogStructure = z
  .object({
    schema: z.literal("kfc-paladin-healer-catalog-shard.v1"),
    ...sharedPayload,
    catalog: z.array(catalogEntry).min(1).max(5000),
  })
  .strict()
  .superRefine((value, context): void => {
    if (
      new Set(value.catalog.map((entry) => entry.item.id)).size !== value.catalog.length ||
      value.catalog.some((entry) => entry.source.id !== entry.item.id)
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate or mismatched Paladin catalog items",
      });
  });

const groupStructure = z
  .object({
    schema: z.literal("kfc-paladin-healer-group-shard.v1"),
    ...sharedPayload,
    group,
    configurations: z.array(configuration).length(28),
    workloads: z
      .array(z.object({ id: checksum, frame: paladinHealingWorkloadSchema }).strict())
      .min(1)
      .max(28),
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    const g = value.group,
      configurations = new Map(value.configurations.map((entry) => [entry.id, entry]));
    const workloads = new Map(value.workloads.map((entry) => [entry.id, entry.frame]));
    const usedWorkloads = new Set<string>();
    if (
      g.id !== [g.archetype, g.assignment, g.profileId].join("|") ||
      g.profileId !== `${g.context.faction}:${g.context.professions.join(",")}` ||
      new Set(g.configurationIds).size !== 28 ||
      configurations.size !== 28 ||
      g.configurationIds.some((id) => !configurations.has(id)) ||
      configurations.get(g.defaultConfigurationId)?.scenarioId !== "reference" ||
      new Set(value.configurations.map((entry) => entry.scenarioId)).size !== 28 ||
      workloads.size !== value.workloads.length
    )
      issue("Invalid Paladin group configuration references");
    for (const entry of value.configurations) {
      const frame = workloads.get(entry.workloadId),
        evidence = entry.sourceEvidence;
      if (!frame || entry.groupId !== g.id) {
        issue("Missing or mismatched Paladin workload");
        continue;
      }
      usedWorkloads.add(entry.workloadId);
      if (
        frame.assignmentScoring !== "external-demand-v1" ||
        frame.requireFullTalentBuild !== true ||
        !frame.name.includes("-180s-")
      )
        issue("Wrong Paladin assignment scope");
      if (
        evidence.caseKey !== entry.sourceCaseKey ||
        evidence.optionId !== entry.optionId ||
        evidence.scenarioId !== entry.scenarioId ||
        evidence.spec !== g.archetype ||
        evidence.kind !== g.assignment ||
        evidence.profileId !== g.profileId ||
        Object.values(entry.option.state.fields).reduce((sum, points) => sum + points, 0) !== 51
      )
        issue("Paladin build differs from source evidence");
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
        issue("Paladin reference differs from source batches");
      let tuple: unknown;
      try {
        tuple = JSON.parse(entry.sourceCaseKey) as unknown;
      } catch {
        issue("Invalid source case identity");
        continue;
      }
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 9 ||
        tuple[0] !== g.archetype ||
        tuple[1] !== g.assignment ||
        tuple[2] !== g.profileId ||
        tuple[3] !== g.context.faction ||
        JSON.stringify(tuple[4]) !== JSON.stringify(g.context.professions) ||
        tuple[5] !== g.context.raceId ||
        tuple[6] !== evidence.pressure ||
        tuple[7] !== 180 ||
        tuple[8] !== entry.scenarioId
      )
        issue("Paladin source belongs to another scenario or acquisition profile");
    }
    if (usedWorkloads.size !== workloads.size) issue("Unreferenced Paladin workload");
  });

function preserveJson<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return z
    .unknown()
    .superRefine((input, context): void => {
      const result = schema.safeParse(input);
      if (!result.success)
        for (const issue of result.error.issues)
          context.addIssue({ code: "custom", message: issue.message, path: issue.path });
    })
    .transform((input): T => input as T);
}

export const paladinHealerLibraryIndexSchema = preserveJson(indexStructure);
export const paladinHealerCatalogPayloadSchema = preserveJson(catalogStructure);
export const paladinHealerGroupPayloadSchema = preserveJson(groupStructure);
export type PaladinHealerLibraryIndex = z.infer<typeof indexStructure>;
export type PaladinHealerCatalogPayload = z.infer<typeof catalogStructure>;
export type PaladinHealerGroupPayload = z.infer<typeof groupStructure>;

/** Bind an already byte-authenticated group payload to its source index. */
export function parsePaladinHealerGroupPayload(
  indexInput: unknown,
  input: unknown,
): PaladinHealerGroupPayload {
  const index = paladinHealerLibraryIndexSchema.parse(indexInput),
    payload = paladinHealerGroupPayloadSchema.parse(input);
  const descriptor = index.groups.find((entry) => entry.group.id === payload.group.id);
  if (
    !descriptor ||
    payload.modelIdentity !== index.modelIdentity ||
    payload.candidateSha256 !== index.candidateSha256 ||
    payload.workloads.some((workload) => !index.workloadOrder.includes(workload.id)) ||
    JSON.stringify(descriptor.group) !== JSON.stringify(payload.group)
  )
    throw new Error("Paladin group payload differs from its source index");
  return payload;
}

/** Bind an already byte-authenticated catalog payload to its source index. */
export function parsePaladinHealerCatalogPayload(
  indexInput: unknown,
  input: unknown,
): PaladinHealerCatalogPayload {
  const index = paladinHealerLibraryIndexSchema.parse(indexInput),
    payload = paladinHealerCatalogPayloadSchema.parse(input);
  if (
    payload.modelIdentity !== index.modelIdentity ||
    payload.candidateSha256 !== index.candidateSha256
  )
    throw new Error("Paladin catalog payload differs from its source index");
  return payload;
}
