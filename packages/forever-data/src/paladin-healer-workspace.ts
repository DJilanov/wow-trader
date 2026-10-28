import { z } from "zod";
import {
  encodeHealerTalents,
  healerGearProblem,
  healerTalentProblem,
  healingEquipmentSchema,
} from "./healing-simulator.js";
import type { PaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import type { PaladinHealerFullPresentation } from "./paladin-healer-presentation.js";
import { paladinHealingWorkloadSchema } from "./paladin-healing-simulator.js";
import {
  paladinHealerLibraryIndexSchema,
  parsePaladinHealerGroupPayload,
  type PaladinHealerGroupPayload,
  type PaladinHealerLibraryIndex,
} from "./paladin-healer-library-payloads.js";
import {
  paladinHealerFrameDescriptorSchema,
  parsePaladinHealerFramePayload,
  type PaladinHealerFramePayload,
} from "./paladin-healer-frame.js";

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

const frameConfigurationStructure = configurationStructure
  .omit({ version: true, groupId: true, race: true })
  .extend({
    version: z.literal(4),
    frameId: z.string().min(1).max(250),
    context: paladinHealerFrameDescriptorSchema.shape.context,
  });

export type PaladinHealerFrameWorkspaceConfiguration = z.infer<typeof frameConfigurationStructure>;

export const paladinHealerFrameWorkspaceConfigurationSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const result = frameConfigurationStructure.safeParse(input);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform(
    (input): PaladinHealerFrameWorkspaceConfiguration =>
      input as PaladinHealerFrameWorkspaceConfiguration,
  );

/** Select a complete measured encounter without changing the source's encoded timings. */
export function configurationForPaladinHealerFrame(
  payloadInput: unknown,
  release: string,
  scenarioId = "reference",
): PaladinHealerFrameWorkspaceConfiguration {
  const payload = parsePaladinHealerFramePayload(payloadInput);
  const configuration = payload.configurations.find(
    (entry): boolean => entry.scenarioId === scenarioId,
  );
  if (!configuration) throw new Error("Unknown Paladin frame scenario");
  const workload = payload.workloads.find(
    (entry): boolean => entry.id === configuration.workloadId,
  );
  if (!workload) throw new Error("The selected Paladin frame workload is missing");
  const source = configuration.option;
  return paladinHealerFrameWorkspaceConfigurationSchema.parse({
    version: 4,
    profile: "healing-paladin",
    release,
    modelIdentity: payload.modelIdentity,
    frameId: payload.frame.id,
    scenarioId,
    sourceConfigurationId: configuration.id,
    sourceOptionId: configuration.optionId,
    sourceRequestBase64: configuration.job.requestBase64,
    context: structuredClone(payload.frame.context),
    gear: structuredClone(source.gear.items),
    fields: { ...source.state.fields },
    talentsString: source.state.talentsString,
    consumes: {
      ...source.consumes,
      manaRegenElixir: source.manaRegenElixir,
      alcohol: source.alcohol,
    },
    workload: structuredClone(workload.frame),
    iterations: 512,
  });
}

/** Bind saved frame configurations to their measured profile and fixed encounter assumptions. */
export function paladinHealerFrameConfigurationSourceProblem(
  payload: PaladinHealerFramePayload,
  config: PaladinHealerFrameWorkspaceConfiguration,
  release: string,
): string | null {
  if (!paladinHealerFrameWorkspaceConfigurationSchema.safeParse(config).success)
    return "The saved Paladin frame has invalid settings.";
  if (config.release !== release || config.modelIdentity !== payload.modelIdentity)
    return "This saved build belongs to another healing release.";
  if (config.frameId !== payload.frame.id)
    return "Choose the measured build for this healing assignment.";
  const context = payload.frame.context;
  if (
    config.context.playerClass !== context.playerClass ||
    config.context.faction !== context.faction ||
    config.context.raceId !== context.raceId ||
    config.context.professions.some(
      (profession, index): boolean => profession !== context.professions[index],
    )
  )
    return "Choose the measured build for this race and profession profile.";
  const source = payload.configurations.find(
    (entry): boolean => entry.id === config.sourceConfigurationId,
  );
  if (
    !source ||
    source.optionId !== config.sourceOptionId ||
    source.scenarioId !== config.scenarioId ||
    source.job.requestBase64 !== config.sourceRequestBase64
  )
    return "The saved build's source template does not match this library.";
  const workload = payload.workloads.find((entry): boolean => entry.id === source.workloadId);
  const fixedAssumptions = (
    value: PaladinHealerFrameWorkspaceConfiguration["workload"],
  ): unknown => {
    const {
      priorities: _priorities,
      cooldowns: _cooldowns,
      useDivineFavor: _useDivineFavor,
      divineFavorMinimumBaseCost: _divineFavorMinimumBaseCost,
      ...fixed
    } = value;
    return fixed;
  };
  if (
    !workload ||
    JSON.stringify(fixedAssumptions(config.workload)) !==
      JSON.stringify(fixedAssumptions(workload.frame))
  )
    return "Choose a reviewed encounter or mechanics scenario to change these assumptions.";
  return null;
}

export interface PaladinHealerFrameBrowserInput {
  readonly id: string;
  readonly seed: number;
  readonly iterations: number;
  readonly sourceRequestBase64: string;
  readonly sourceContext: PaladinHealerFramePayload["frame"]["context"];
  readonly frame: PaladinHealerFramePayload["frame"]["variant"];
  readonly gear: PaladinHealerFrameWorkspaceConfiguration["gear"];
  readonly fields: PaladinHealerFrameWorkspaceConfiguration["fields"];
  readonly talentsString: string;
  readonly race: number;
  readonly consumes: PaladinHealerConsumes;
  readonly workload: PaladinHealerFrameWorkspaceConfiguration["workload"];
}

/** Prepare the frame-aware browser adapter after validating saved-build source bindings. */
export function paladinHealerFrameBrowserInput(
  payload: PaladinHealerFramePayload,
  config: PaladinHealerFrameWorkspaceConfiguration,
  release: string,
  options: { readonly id: string; readonly seed: number },
): PaladinHealerFrameBrowserInput {
  const problem = paladinHealerFrameConfigurationSourceProblem(payload, config, release);
  if (problem) throw new Error(problem);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(options.id) ||
    !Number.isSafeInteger(options.seed) ||
    options.seed < 1
  )
    throw new Error("Choose a valid Paladin simulation ID and seed.");
  return {
    ...options,
    iterations: config.iterations,
    sourceRequestBase64: config.sourceRequestBase64,
    sourceContext: structuredClone(config.context),
    frame: structuredClone(payload.frame.variant),
    gear: structuredClone(config.gear),
    fields: { ...config.fields },
    talentsString: config.talentsString,
    race: config.context.raceId,
    consumes: { ...config.consumes },
    workload: structuredClone(config.workload),
  };
}

/** Check a personal frame build against the complete item, profession and casting data. */
export function paladinHealerFullConfigurationProblem(
  catalog: PaladinHealerFullCatalog,
  presentation: PaladinHealerFullPresentation,
  payload: PaladinHealerFramePayload,
  config: PaladinHealerFrameWorkspaceConfiguration,
  release: string,
  complete = true,
): string | null {
  const sourceProblem = paladinHealerFrameConfigurationSourceProblem(payload, config, release);
  if (sourceProblem) return sourceProblem;
  if (
    catalog.modelIdentity !== payload.modelIdentity ||
    presentation.modelIdentity !== payload.modelIdentity
  )
    return "The item and talent data belong to another healing model.";
  const profile = catalog.profiles.find((entry): boolean => entry.id === payload.frame.profileId);
  const displayProfile = presentation.profiles.find(
    (entry): boolean => entry.id === payload.frame.profileId,
  );
  if (
    !profile ||
    !displayProfile ||
    profile.faction !== displayProfile.faction ||
    profile.professions.some(
      (profession, index): boolean => profession !== displayProfile.professions[index],
    )
  )
    return "Choose a supported profession profile.";
  const race = presentation.races.find((entry): boolean => entry.id === config.context.raceId);
  if (!race || race.faction !== (config.context.faction === 1 ? "Alliance" : "Horde"))
    return "Choose a supported race for this profession profile.";
  if (
    config.gear.some(
      (item, slot): boolean => item.id !== 0 && !profile.slots[slot]?.includes(item.id),
    )
  )
    return "An equipped item is unavailable for the selected profession profile.";
  const gearProblem = healerGearProblem(config.gear, presentation.items, race.faction);
  if (gearProblem) return gearProblem;
  const talentProblem = healerTalentProblem(presentation.talents, config.fields, complete);
  if (talentProblem) return talentProblem;
  const talents = encodeHealerTalents(presentation.talents, config.fields).split("-");
  while (talents.length < 3) talents.push("");
  if (talents.join("-") !== config.talentsString)
    return "The talent ranks do not match the saved talent string.";
  const consumes: Readonly<Record<keyof PaladinHealerConsumes, readonly number[]>> = {
    flask: [1, 2],
    food: [1, 3, 4, 9, 11],
    mainHandImbue: [16, 20],
    defaultPotion: [0, 5],
    defaultConjured: [0, 2],
    manaRegenElixir: [0, 2],
    alcohol: [0, 1, 2, 3, 4, 5],
  };
  for (const key of Object.keys(consumes) as (keyof PaladinHealerConsumes)[])
    if (!consumes[key].includes(config.consumes[key]))
      return "Choose a supported pre-raid consumable.";
  if (config.workload.useDivineFavor && !config.fields.divineFavor)
    return "Learn Divine Favor or disable it in the casting plan.";
  for (const priority of config.workload.priorities) {
    const spell = presentation.spells.find((entry): boolean => entry.id === priority.spellId);
    if (!spell || (spell.requiredTalentField && !config.fields[spell.requiredTalentField]))
      return "The casting plan uses a spell this talent build has not learned.";
    if ((priority.maintainVigil || priority.requireVigil) && !config.fields.lightsVigil)
      return "Learn Light's Vigil before using a Vigil condition.";
    if (priority.maintainVigil && spell.family !== "lights-vigil")
      return "Only Light's Vigil can maintain the Vigil effect.";
  }
  const items = new Set([13444, 12662, 4381, 18637, 4262, 8346, 272439, 272438, 20512, 11808]);
  const spells = new Set([15604, 1302205, 17252]);
  if (
    config.workload.cooldowns.some((entry): boolean =>
      entry.itemId ? !items.has(entry.itemId) : !spells.has(entry.spellId ?? 0),
    )
  )
    return "Choose a supported resource item.";
  return null;
}
