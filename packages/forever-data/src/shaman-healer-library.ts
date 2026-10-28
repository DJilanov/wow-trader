import { z } from "zod";
import { healingEquipmentSchema } from "./healing-simulator.js";
import {
  shamanHealingDisplayMetrics,
  shamanHealingJobSchema,
  shamanHealingResultSchema,
} from "./shaman-healing-simulator.js";

const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]*$/)
  .max(200);
const archetype = z.enum(["riptide-support", "riptide-mobility", "mental-quickness-wave"]);
const assignment = z.enum(["tank", "group", "burst"]);
const race = z.union([z.literal(1), z.literal(5), z.literal(6), z.literal(7), z.literal(10)]);
const reference = z.object({ path: z.string().min(1).max(1000), byteSha256: checksum }).strict();
const asset = z
  .object({
    file: z
      .string()
      .regex(/^[a-z0-9][a-z0-9_.-]*\.json$/)
      .refine((name) => !name.includes("..")),
    byteSha256: checksum,
    bytes: id.max(8_000_000),
  })
  .strict();

export const shamanHealerConsumesSchema = z
  .object({
    flask: count.max(4).optional(),
    food: count
      .max(11)
      .refine((value) => value !== 5, "Unsupported food reference")
      .optional(),
    mainHandImbue: z.union([z.literal(0), z.literal(16), z.literal(20)]).optional(),
    defaultPotion: z.union([z.literal(0), z.literal(5)]).optional(),
    defaultConjured: z.union([z.literal(0), z.literal(2)]).optional(),
    manaRegenElixir: z.union([z.literal(0), z.literal(2)]).optional(),
    healthElixir: count.max(4).optional(),
    zanzaBuff: z
      .union([z.literal(0), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)])
      .optional(),
    alcohol: count.max(5).optional(),
    spellPowerBuff: count.max(3).optional(),
    firePowerBuff: count.max(1).optional(),
    shadowPowerBuff: count.max(1).optional(),
    frostPowerBuff: count.max(1).optional(),
    miscConsumes: z
      .object({
        raptorPunch: z.boolean().optional(),
        jujuEmber: z.boolean().optional(),
        jujuChill: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const shamanHealerGroupSchema = z
  .object({
    id: z.string().min(1).max(250),
    title: z.string().min(1).max(100),
    archetype,
    assignment,
    race,
    profileId: z.string().min(1).max(160),
    defaultConfigurationId: checksum,
    configurationIds: z.array(checksum).min(1).max(64),
  })
  .strict()
  .refine(
    (group) =>
      group.id === [group.archetype, group.assignment, group.race, group.profileId].join("|") &&
      new Set(group.configurationIds).size === group.configurationIds.length &&
      group.configurationIds.includes(group.defaultConfigurationId),
    "Invalid Shaman build group",
  );

export const shamanHealerLibraryConfigurationSchema = z
  .object({
    id: checksum,
    groupId: z.string().min(1).max(250),
    scenarioId: key,
    race,
    profileId: z.string().min(1).max(160),
    talentsString: z.string().regex(/^[0-5]*-[0-5]*-[0-5]*$/),
    fields: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), count.max(5)),
    gear: healingEquipmentSchema,
    consumes: shamanHealerConsumesSchema,
    job: shamanHealingJobSchema,
    evidence: z
      .object({
        review: reference,
        setupIdentity: checksum,
        requestKeys: z.array(checksum).length(4),
        rounds: z.array(z.object({ iterations: id.max(10_000), seed: id }).strict()).length(4),
        observedPractical2Percent: z.literal(true),
        observedStrict1Percent: z.boolean(),
        largestComparison95Upper: z.number().finite().max(0.02),
        feasibleRetainedAlternatives: id,
        results: z.array(shamanHealingResultSchema).length(4),
      })
      .strict(),
  })
  .strict()
  .superRefine((configuration, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    const { job, evidence } = configuration;
    const rankId = job.workload.workload.rankScaling?.id;
    if (
      job.detail ||
      !rankId ||
      configuration.scenarioId !== rankId + "." + job.workload.mp5Model ||
      job.workload.profileId !== configuration.profileId ||
      Object.values(configuration.fields).reduce((sum, value) => sum + value, 0) !== 51 ||
      [...configuration.talentsString].reduce(
        (sum, value) => sum + (value === "-" ? 0 : Number(value)),
        0,
      ) !== 51 ||
      new Set(evidence.requestKeys).size !== 4 ||
      new Set(evidence.rounds.map((round) => round.seed)).size !== 4 ||
      new Set(evidence.rounds.map((round) => round.iterations)).size !== 1 ||
      job.id !== "h-" + evidence.requestKeys[0]!.slice(0, 32)
    )
      issue("Shaman build does not match its source configuration");
    const expectedGear = JSON.stringify(configuration.gear);
    for (const [index, result] of evidence.results.entries()) {
      const equipped = result.equipped;
      const gear = equipped.loadout.equipment.items.map((item) => ({
        id: item.id ?? 0,
        ...(item.enchant ? { enchant: item.enchant } : {}),
      }));
      if (
        result.iterations !== evidence.rounds[index]!.iterations ||
        result.survivalRate !== 1 ||
        result.name !== job.workload.workload.name ||
        equipped.runtimeIdentity !== job.workload.runtimeIdentity ||
        equipped.loadout.domainIdentity !== job.workload.domainIdentity ||
        equipped.loadout.profileId !== configuration.profileId ||
        equipped.loadout.race !== configuration.race ||
        equipped.mp5Model !== job.workload.mp5Model ||
        JSON.stringify(gear) !== expectedGear ||
        JSON.stringify(equipped.effects) !== JSON.stringify(job.workload.effects) ||
        JSON.stringify(equipped.cooldowns) !== JSON.stringify(job.workload.cooldowns) ||
        JSON.stringify(equipped.recipientMana) !== JSON.stringify(job.workload.recipientMana) ||
        JSON.stringify(result.rankScaling) !== JSON.stringify(job.workload.workload.rankScaling) ||
        JSON.stringify(result.racials) !== JSON.stringify(job.workload.workload.racials) ||
        Math.abs(result.deliveredIncomingDamageMean - result.plannedIncomingPostMitigationDamage) >
          Math.max(1, result.plannedIncomingPostMitigationDamage) * 1e-7
      )
        issue("Shaman reference differs from its declared gear, workload or source batch");
      try {
        shamanHealingDisplayMetrics(result, 180);
      } catch {
        issue("Invalid Shaman reference support ledger");
      }
    }
    const duration = Number(job.workload.workload.name.match(/-(\d+)s-/)?.[1]);
    if (duration !== 180) issue("Choose the reviewed three-minute Shaman assignment");
    const planned = (job.workload.workload.damage ?? []).reduce(
      (sum, event) => sum + event.amount,
      0,
    );
    if (
      evidence.results.some(
        (result) =>
          Math.abs(result.plannedIncomingPostMitigationDamage - planned) >
          Math.max(1, planned) * 1e-7,
      )
    )
      issue("Shaman reference does not match the complete scheduled damage");
    if (evidence.observedStrict1Percent !== evidence.largestComparison95Upper <= 0.01)
      issue("Strict Shaman tolerance flag does not match its measured bound");
  });

const shared = {
  profile: z.literal("healing-shaman"),
  modelIdentity: checksum,
  runtimeIdentity: checksum,
  fullClassQualified: z.literal(false),
  publicationAllowed: z.literal(false),
};
export const shamanHealerLibraryIndexSchema = z
  .object({
    schema: z.literal("kfc-shaman-healer-library-index.v1"),
    ...shared,
    sourceBuild: id,
    defaultGroupId: z.string().min(1).max(250),
    scope: z
      .object({
        durationSeconds: z.literal(180),
        layout: z.literal("stacked"),
        incomingDamagePerSecond: z.literal(800),
        professions: z.tuple([z.literal(4), z.literal(11)]),
        practicalTolerance: z.literal(0.02),
        independentBatches: z.literal(4),
        otherAssignmentsRequireTheirOwnConfirmation: z.literal(true),
      })
      .strict(),
    sourceReviews: z.array(reference).min(1).max(20),
    catalog: asset,
    groups: z
      .array(z.object({ group: shamanHealerGroupSchema, asset }).strict())
      .min(1)
      .max(1000),
  })
  .strict()
  .superRefine((index, context): void => {
    const groups = new Set(index.groups.map((entry) => entry.group.id));
    const files = new Set(index.groups.map((entry) => entry.asset.file));
    const configurations = index.groups.flatMap((entry) => entry.group.configurationIds);
    if (
      groups.size !== index.groups.length ||
      files.size !== index.groups.length ||
      files.has(index.catalog.file) ||
      files.has("library-index.json") ||
      index.catalog.file !== "catalog.json" ||
      !groups.has(index.defaultGroupId) ||
      new Set(configurations).size !== configurations.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate or missing Shaman library identities",
      });
  });

export const shamanHealerGroupPayloadSchema = z
  .object({
    schema: z.literal("kfc-shaman-healer-group.v1"),
    ...shared,
    group: shamanHealerGroupSchema,
    configurations: z.array(shamanHealerLibraryConfigurationSchema).min(1).max(64),
  })
  .strict()
  .superRefine((payload, context): void => {
    const ids = new Set(payload.configurations.map((entry) => entry.id));
    if (
      ids.size !== payload.configurations.length ||
      ids.size !== payload.group.configurationIds.length ||
      payload.group.configurationIds.some((id) => !ids.has(id)) ||
      new Set(payload.configurations.map((entry) => entry.scenarioId)).size !==
        payload.configurations.length ||
      payload.configurations.some(
        (entry) =>
          entry.groupId !== payload.group.id ||
          entry.race !== payload.group.race ||
          entry.profileId !== payload.group.profileId ||
          entry.job.workload.runtimeIdentity !== payload.runtimeIdentity,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Shaman group contains mismatched configurations",
      });
  });

export const shamanHealerCatalogPayloadSchema = z
  .object({
    schema: z.literal("kfc-shaman-healer-catalog.v1"),
    ...shared,
    catalog: z
      .array(
        z
          .object({
            item: z
              .object({
                id,
                name: z.string().min(1),
                icon: z.string().optional(),
                type: count,
                setId: count,
                stats: z.array(z.number().finite()).length(44),
              })
              .passthrough(),
            source: z.object({ id, requiredLevel: count.max(60) }).passthrough(),
            availableProfileIds: z.array(z.string().min(1).max(160)).max(90),
          })
          .strict(),
      )
      .min(1)
      .max(5000),
  })
  .strict()
  .superRefine((payload, context): void => {
    if (
      new Set(payload.catalog.map((entry) => entry.item.id)).size !== payload.catalog.length ||
      payload.catalog.some(
        (entry) =>
          entry.item.id !== entry.source.id ||
          new Set(entry.availableProfileIds).size !== entry.availableProfileIds.length,
      )
    )
      context.addIssue({ code: "custom", message: "Duplicate or mismatched Shaman catalog items" });
  });

export type ShamanHealerConsumes = z.infer<typeof shamanHealerConsumesSchema>;
export type ShamanHealerGroup = z.infer<typeof shamanHealerGroupSchema>;
export type ShamanHealerLibraryConfiguration = z.infer<
  typeof shamanHealerLibraryConfigurationSchema
>;
export type ShamanHealerLibraryIndex = z.infer<typeof shamanHealerLibraryIndexSchema>;
export type ShamanHealerGroupPayload = z.infer<typeof shamanHealerGroupPayloadSchema>;
export type ShamanHealerCatalogPayload = z.infer<typeof shamanHealerCatalogPayloadSchema>;

/** Keep lazy-loaded groups bound to the immutable index selected by the page. */
export function parseShamanHealerGroupPayload(
  index: ShamanHealerLibraryIndex,
  input: unknown,
): ShamanHealerGroupPayload {
  const payload = shamanHealerGroupPayloadSchema.parse(input);
  const expected = index.groups.find((entry) => entry.group.id === payload.group.id);
  if (
    !expected ||
    payload.modelIdentity !== index.modelIdentity ||
    payload.runtimeIdentity !== index.runtimeIdentity ||
    JSON.stringify(payload.group) !== JSON.stringify(expected.group)
  )
    throw new Error("Shaman group does not match this library index");
  return payload;
}

export function parseShamanHealerCatalogPayload(
  index: ShamanHealerLibraryIndex,
  input: unknown,
): ShamanHealerCatalogPayload {
  const payload = shamanHealerCatalogPayloadSchema.parse(input);
  if (
    payload.modelIdentity !== index.modelIdentity ||
    payload.runtimeIdentity !== index.runtimeIdentity
  )
    throw new Error("Shaman catalog does not match this library index");
  return payload;
}
