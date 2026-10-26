import { z } from "zod";
import { healingEquipmentSchema } from "./healing-simulator.js";
import { paladinHealingWorkloadSchema } from "./paladin-healing-simulator.js";
import {
  paladinHealerLibraryIndexSchema,
  parsePaladinHealerGroupPayload,
  type PaladinHealerGroupPayload,
  type PaladinHealerLibraryIndex,
} from "./paladin-healer-library-payloads.js";

const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const paladinHealerConsumesSchema = z
  .object({
    flask: count,
    food: count,
    mainHandImbue: count,
    defaultPotion: count,
    defaultConjured: count,
    manaRegenElixir: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    alcohol: count.max(5),
  })
  .strict();

const configurationStructure = z
  .object({
    version: z.literal(3),
    profile: z.literal("healing-paladin"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    modelIdentity: checksum,
    groupId: z.string().min(1).max(250),
    scenarioId: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
    sourceConfigurationId: checksum,
    sourceOptionId: checksum,
    sourceRequestBase64: z
      .string()
      .min(1)
      .max(128_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    gear: healingEquipmentSchema,
    talentsString: z.string().regex(/^[0-5]*-[0-5]*-[0-5]*$/),
    fields: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), count),
    race: id,
    consumes: paladinHealerConsumesSchema,
    workload: paladinHealingWorkloadSchema,
    iterations: id.max(10_000),
  })
  .strict();

export type PaladinHealerConfiguration = z.infer<typeof configurationStructure>;
export type PaladinHealerConsumes = z.infer<typeof paladinHealerConsumesSchema>;

export const paladinHealerConfigurationSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const result = configurationStructure.safeParse(input);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerConfiguration => input as PaladinHealerConfiguration);

/** Select a complete measured scenario, preserving the request's encoded resource timings. */
export function configurationForPaladinHealerBuild(
  indexInput: unknown,
  groupInput: unknown,
  release: string,
  scenarioId = "reference",
): PaladinHealerConfiguration {
  const index = paladinHealerLibraryIndexSchema.parse(indexInput);
  const payload = parsePaladinHealerGroupPayload(index, groupInput);
  const configuration = payload.configurations.find((entry) => entry.scenarioId === scenarioId);
  if (!configuration) throw new Error("Unknown Paladin mechanics scenario");
  const workload = payload.workloads.find((entry) => entry.id === configuration.workloadId);
  if (!workload) throw new Error("The selected Paladin workload is missing");
  const source = configuration.option;
  return paladinHealerConfigurationSchema.parse({
    version: 3,
    profile: "healing-paladin",
    release,
    modelIdentity: index.modelIdentity,
    groupId: payload.group.id,
    scenarioId,
    sourceConfigurationId: configuration.id,
    sourceOptionId: configuration.optionId,
    sourceRequestBase64: configuration.job.requestBase64,
    gear: structuredClone(source.gear.items),
    fields: { ...source.state.fields },
    talentsString: source.state.talentsString,
    race: payload.group.context.raceId,
    consumes: {
      ...source.consumes,
      manaRegenElixir: source.manaRegenElixir,
      alcohol: source.alcohol,
    },
    workload: structuredClone(workload.frame),
    iterations: 512,
  });
}

/** Check source bindings before a saved or shared configuration enters this workspace. */
export function paladinHealerConfigurationSourceProblem(
  index: PaladinHealerLibraryIndex,
  payload: PaladinHealerGroupPayload,
  config: PaladinHealerConfiguration,
  release: string,
): string | null {
  if (config.release !== release || config.modelIdentity !== index.modelIdentity)
    return "This saved build belongs to another healing release.";
  if (
    payload.modelIdentity !== index.modelIdentity ||
    payload.candidateSha256 !== index.candidateSha256 ||
    config.groupId !== payload.group.id
  )
    return "This saved build belongs to another Paladin build group.";
  const source = payload.configurations.find((entry) => entry.id === config.sourceConfigurationId);
  if (
    !source ||
    source.optionId !== config.sourceOptionId ||
    source.scenarioId !== config.scenarioId ||
    source.job.requestBase64 !== config.sourceRequestBase64
  )
    return "The saved build's source template does not match this library.";
  if (config.race !== payload.group.context.raceId)
    return "Choose the measured build for this race before changing equipment.";
  if (
    config.workload.assignmentScoring !== "external-demand-v1" ||
    config.workload.requireFullTalentBuild !== true ||
    !config.workload.name.includes("-180s-")
  )
    return "Choose the reviewed three-minute healing assignment.";
  const original = payload.workloads.find((entry) => entry.id === source.workloadId);
  if (
    !original ||
    config.workload.name !== original.frame.name ||
    JSON.stringify(config.workload.targets) !== JSON.stringify(original.frame.targets) ||
    JSON.stringify(config.workload.damage) !== JSON.stringify(original.frame.damage)
  )
    return "The saved build changes the reviewed healing assignment.";
  return null;
}
