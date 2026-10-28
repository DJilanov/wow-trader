import { z } from "zod";
import {
  encodeHealerTalents,
  healerGearProblem,
  healerTalentProblem,
  healingEquipmentSchema,
} from "./healing-simulator.js";
import {
  shamanHealerConsumesSchema,
  type ShamanHealerGroupPayload,
  type ShamanHealerLibraryConfiguration,
  type ShamanHealerLibraryIndex,
} from "./shaman-healer-library.js";
import type { ShamanHealerPresentation } from "./shaman-healer-release.js";
import {
  shamanHealingCooldownSchema,
  shamanHealingPrioritySchema,
} from "./shaman-healing-simulator.js";

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const shamanHealerActiveItemIds: readonly number[] = [
  13444, 12662, 8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437, 18371, 11819, 13143,
  4262, 8346, 4381, 18637, 11808, 13937, 272438, 272439, 13968,
];
export const shamanHealerConfigurationSchema = z
  .object({
    version: z.literal(1),
    profile: z.literal("healing-shaman"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    modelIdentity: checksum,
    groupId: z.string().min(1).max(250),
    sourceConfigurationId: checksum,
    gear: healingEquipmentSchema,
    fields: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), z.number().int().min(0).max(5)),
    consumes: shamanHealerConsumesSchema,
    priorities: z.array(shamanHealingPrioritySchema).min(1).max(32),
    cooldowns: z.array(shamanHealingCooldownSchema).max(24),
    useNaturesSwiftness: z.boolean(),
    naturesSwiftnessMinimumMissingHealth: z.number().finite().min(0).max(1_000_000),
    iterations: z.number().int().min(1).max(10000),
  })
  .strict();
export type ShamanHealerConfiguration = z.infer<typeof shamanHealerConfigurationSchema>;

export function configurationForShamanHealerBuild(
  index: ShamanHealerLibraryIndex,
  payload: ShamanHealerGroupPayload,
  release: string,
  configurationId = payload.group.defaultConfigurationId,
): ShamanHealerConfiguration {
  const source = payload.configurations.find((entry) => entry.id === configurationId);
  if (
    !source ||
    index.modelIdentity !== payload.modelIdentity ||
    index.runtimeIdentity !== payload.runtimeIdentity
  )
    throw new Error("Choose a build from the selected Shaman library");
  return shamanHealerConfigurationSchema.parse({
    version: 1,
    profile: "healing-shaman",
    release,
    modelIdentity: index.modelIdentity,
    groupId: payload.group.id,
    sourceConfigurationId: source.id,
    gear: structuredClone(source.gear),
    fields: { ...source.fields },
    consumes: structuredClone(source.consumes),
    priorities: structuredClone(source.job.workload.workload.priorities),
    cooldowns: structuredClone(source.job.workload.cooldowns ?? []),
    useNaturesSwiftness: source.job.workload.workload.useNaturesSwiftness,
    naturesSwiftnessMinimumMissingHealth:
      source.job.workload.workload.naturesSwiftnessMinimumMissingHealth,
    iterations: 512,
  });
}

export function shamanHealerSourceConfiguration(
  index: ShamanHealerLibraryIndex,
  payload: ShamanHealerGroupPayload,
  config: ShamanHealerConfiguration,
  release: string,
): ShamanHealerLibraryConfiguration {
  const source = payload.configurations.find((entry) => entry.id === config.sourceConfigurationId);
  if (
    !source ||
    config.release !== release ||
    config.modelIdentity !== index.modelIdentity ||
    payload.modelIdentity !== index.modelIdentity ||
    payload.runtimeIdentity !== index.runtimeIdentity ||
    payload.group.id !== config.groupId ||
    !index.groups.some((entry) => entry.group.id === payload.group.id)
  )
    throw new Error("This saved Shaman build belongs to another release or build group");
  return source;
}

export function shamanHealerTalentsString(
  presentation: ShamanHealerPresentation,
  fields: Readonly<Record<string, number>>,
): string {
  const parts = encodeHealerTalents(presentation.talents, fields).split("-");
  while (parts.length < 3) parts.push("");
  return parts.join("-");
}

export function shamanHealerConfigurationProblem(
  index: ShamanHealerLibraryIndex,
  payload: ShamanHealerGroupPayload,
  presentation: ShamanHealerPresentation,
  config: ShamanHealerConfiguration,
  release: string,
  complete = true,
): string | null {
  if (!shamanHealerConfigurationSchema.safeParse(config).success)
    return "This Shaman build has invalid settings.";
  try {
    shamanHealerSourceConfiguration(index, payload, config, release);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "The saved Shaman source is unavailable.";
  }
  if (
    presentation.modelIdentity !== index.modelIdentity ||
    presentation.runtimeIdentity !== index.runtimeIdentity
  )
    return "The item and talent data belong to another Shaman release.";
  const profile = presentation.profiles.find((entry) => entry.id === payload.group.profileId);
  const race = presentation.races.find((entry) => entry.id === payload.group.race);
  if (!profile || !race || race.profileId !== profile.id)
    return "Choose a supported Shaman race and profession profile.";
  if (config.gear.some((item, slot) => item.id && !profile.slots[slot]!.includes(item.id)))
    return "An equipped item is unavailable for this race or profession profile.";
  const overrides = new Map(profile.ownershipOverrides.map((entry) => [entry.id, entry]));
  const items = presentation.items.map((item) => {
    const override = overrides.get(item.id);
    return override
      ? {
          ...item,
          unique: override.singleCopy,
          limitCategory: override.limitCategory,
          questChoices: override.questChoices,
        }
      : item;
  });
  const gearProblem = healerGearProblem(config.gear, items, race.faction);
  if (gearProblem) return gearProblem;
  const talentProblem = healerTalentProblem(presentation.talents, config.fields, complete);
  if (talentProblem) return talentProblem;
  const talents = new Map(
    presentation.talents.flatMap((tree) =>
      tree.talents.map((talent) => [talent.field, talent] as const),
    ),
  );
  for (const [field, points] of Object.entries(config.fields)) {
    if (!talents.has(field)) return "The build contains an unknown talent.";
    if (points && !presentation.supportedTalentFields.includes(field))
      return talents.get(field)!.name + " is outside this healing assignment.";
  }
  if (config.useNaturesSwiftness && !config.fields.naturesSwiftness)
    return "Learn Nature's Swiftness or disable it in the casting plan.";
  if (!config.useNaturesSwiftness && config.naturesSwiftnessMinimumMissingHealth !== 0)
    return "An inactive Nature's Swiftness cannot keep a healing threshold.";
  const targets = new Set(
    payload.configurations[0]!.job.workload.workload.targets.map((target) => target.raidIndex),
  );
  for (const priority of config.priorities) {
    const spell = presentation.spells.find((entry) => entry.id === priority.spellId);
    if (
      !spell ||
      spell.family === "natures-swiftness" ||
      (spell.requiredTalentField && !config.fields[spell.requiredTalentField])
    )
      return "The casting plan uses a spell this build has not learned.";
    if (priority.raidIndex >= 0 && !targets.has(priority.raidIndex))
      return "Choose a target inside this healing assignment.";
    const utility = ["mana-tide", "water-shield", "healing-stream"].includes(spell.family);
    if (
      (utility && (priority.minimumMissingHealth !== 0 || ![-1, 0].includes(priority.raidIndex))) ||
      (!utility && priority.minimumMissingMana !== 0)
    )
      return "Totems and Water Shield target the caster; direct heals use health thresholds.";
    if (
      (priority.keepHot && spell.family !== "riptide") ||
      (priority.requireHot && (spell.family !== "chain-heal" || !config.fields.riptide)) ||
      ((priority.minimumInjuredTargets > 0 || priority.minimumGroupMissingHealth > 0) &&
        spell.family !== "chain-heal")
    )
      return "Choose a compatible Riptide or Chain Heal condition.";
  }
  if (new Set(config.cooldowns.map((entry) => entry.itemId)).size !== config.cooldowns.length)
    return "Each resource item can have one activation rule.";
  const owned = new Set(config.gear.map((entry) => entry.id));
  for (const entry of config.cooldowns) {
    if (
      !shamanHealerActiveItemIds.includes(entry.itemId) ||
      (entry.itemId === 13444
        ? config.consumes.defaultPotion !== 5
        : entry.itemId === 12662
          ? config.consumes.defaultConjured !== 2
          : !owned.has(entry.itemId)) ||
      (entry.raidIndex >= 0 && !targets.has(entry.raidIndex)) ||
      entry.earliestMs >= 180000
    )
      return "A resource activation uses an unequipped item, unavailable consume or invalid target/time.";
  }
  return null;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== 0 && entry !== false && entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  return value;
}
export function isOriginalShamanConfiguration(
  index: ShamanHealerLibraryIndex,
  payload: ShamanHealerGroupPayload,
  config: ShamanHealerConfiguration,
): boolean {
  const original = configurationForShamanHealerBuild(
    index,
    payload,
    config.release,
    config.sourceConfigurationId,
  );
  const mutable = (entry: ShamanHealerConfiguration): unknown => ({
    gear: entry.gear,
    fields: entry.fields,
    consumes: entry.consumes,
    priorities: entry.priorities,
    cooldowns: entry.cooldowns,
    useNaturesSwiftness: entry.useNaturesSwiftness,
    naturesSwiftnessMinimumMissingHealth: entry.naturesSwiftnessMinimumMissingHealth,
  });
  return (
    JSON.stringify(normalized(mutable(config))) === JSON.stringify(normalized(mutable(original)))
  );
}
