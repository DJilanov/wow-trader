import { deflateSync, inflateSync } from "fflate";
import {
  encodeHealerTalents,
  healerGearProblem,
  healerTalentProblem,
  type HealerTalentTree,
} from "@wow-trader/forever-data/healing-simulator";
import {
  configurationForPaladinHealerBuild,
  paladinHealerConfigurationSchema,
  paladinHealerConfigurationSourceProblem,
  type PaladinHealerConfiguration,
  type PaladinHealerConsumes,
} from "@wow-trader/forever-data/paladin-healer-workspace";
import type { PaladinHealerPresentation } from "@wow-trader/forever-data/paladin-healer-release";
import type {
  PaladinHealerGroupPayload,
  PaladinHealerLibraryIndex,
} from "@wow-trader/forever-data/paladin-healer-library-payloads";

export interface PaladinConsumeMenu {
  readonly key: keyof PaladinHealerConsumes;
  readonly label: string;
  readonly choices: readonly { readonly id: number; readonly name: string }[];
}

export const paladinConsumeMenus: readonly PaladinConsumeMenu[] = [
  {
    key: "flask",
    label: "Flask",
    choices: [
      { id: 2, name: "Distilled Wisdom · +2,000 mana" },
      { id: 1, name: "Flask of the Titans · +1,200 health" },
    ],
  },
  {
    key: "food",
    label: "Food",
    choices: [
      { id: 4, name: "Runn Tum Tuber Surprise" },
      { id: 1, name: "Grilled Squid" },
      { id: 3, name: "Nightfin Soup" },
      { id: 11, name: "Sagefish Delight" },
      { id: 9, name: "Tender Wolf Steak" },
    ],
  },
  {
    key: "mainHandImbue",
    label: "Weapon oil",
    choices: [
      { id: 16, name: "Lesser Mana Oil · +20 healing, +10 MP5" },
      { id: 20, name: "Wizard Oil · +24 healing and damage" },
    ],
  },
  {
    key: "defaultPotion",
    label: "Potion",
    choices: [
      { id: 0, name: "None" },
      { id: 5, name: "Major Mana Potion" },
    ],
  },
  {
    key: "defaultConjured",
    label: "Conjured item",
    choices: [
      { id: 0, name: "None" },
      { id: 2, name: "Demonic Rune · mana with self-damage" },
    ],
  },
  {
    key: "manaRegenElixir",
    label: "Mana regeneration elixir",
    choices: [
      { id: 0, name: "None" },
      { id: 2, name: "Greater Mageblood Elixir" },
    ],
  },
  {
    key: "alcohol",
    label: "Alcohol · legacy model reference",
    choices: [
      { id: 0, name: "None" },
      { id: 1, name: "Rumsey Rum Black Label" },
      { id: 2, name: "Gordok Green Grog" },
      { id: 3, name: "Rumsey Rum Dark" },
      { id: 4, name: "Rumsey Rum Light" },
      { id: 5, name: "Kreeg’s Stout Beatdown" },
    ],
  },
];

export function paladinTalentsString(
  trees: readonly HealerTalentTree[],
  fields: Readonly<Record<string, number>>,
): string {
  const parts = encodeHealerTalents(trees, fields).split("-");
  while (parts.length < 3) parts.push("");
  return parts.join("-");
}

export function paladinConfigurationProblem(
  index: PaladinHealerLibraryIndex,
  group: PaladinHealerGroupPayload,
  presentation: PaladinHealerPresentation,
  config: PaladinHealerConfiguration,
  release: string,
  complete = true,
): string | null {
  const parsed = paladinHealerConfigurationSchema.safeParse(config);
  if (!parsed.success) return "The saved Paladin build has invalid settings.";
  const sourceProblem = paladinHealerConfigurationSourceProblem(index, group, config, release);
  if (sourceProblem) return sourceProblem;
  if (
    presentation.modelIdentity !== index.modelIdentity ||
    presentation.sourceArchiveSha256 !== index.candidateSha256
  )
    return "The item and talent data belong to another healing release.";
  const race = presentation.races.find((entry) => entry.id === config.race);
  if (!race || race.profileId !== group.group.profileId) return "Choose a supported race.";
  for (const menu of paladinConsumeMenus)
    if (!menu.choices.some((choice) => choice.id === config.consumes[menu.key]))
      return "Choose a supported pre-raid consumable.";
  const gearProblem = healerGearProblem(config.gear, presentation.items, race.faction);
  if (gearProblem) return gearProblem;
  const talentProblem = healerTalentProblem(presentation.talents, config.fields, complete);
  if (talentProblem) return talentProblem;
  if (paladinTalentsString(presentation.talents, config.fields) !== config.talentsString)
    return "The talent ranks do not match the saved talent string.";
  const original = configurationForPaladinHealerBuild(index, group, release, config.scenarioId);
  const policy = (entry: PaladinHealerConfiguration): unknown => {
    const {
      priorities: _priorities,
      cooldowns: _cooldowns,
      useDivineFavor: _favor,
      divineFavorMinimumBaseCost: _cost,
      ...fixed
    } = entry.workload;
    return fixed;
  };
  if (JSON.stringify(policy(config)) !== JSON.stringify(policy(original)))
    return "Choose a mechanics scenario to change the model's scaling assumptions.";
  if (config.workload.useDivineFavor && !config.fields.divineFavor)
    return "Learn Divine Favor or disable it in the casting plan.";
  for (const priority of config.workload.priorities) {
    const spell = presentation.spells.find((entry) => entry.id === priority.spellId);
    if (!spell || (spell.requiredTalentField && !config.fields[spell.requiredTalentField]))
      return "The casting plan uses a spell this talent build has not learned.";
    if ((priority.maintainVigil || priority.requireVigil) && !config.fields.lightsVigil)
      return "Learn Light's Vigil before using a Vigil condition.";
    if (priority.maintainVigil && spell.family !== "lights-vigil")
      return "Only Light's Vigil can maintain the Vigil effect.";
  }
  const allowedItemUses = new Set([13444, 12662, 4381, 18637, 4262, 8346, 272439]);
  const allowedSpellUses = new Set([15604, 1302205, 17252]);
  if (
    config.workload.cooldowns.some((entry) =>
      entry.itemId ? !allowedItemUses.has(entry.itemId) : !allowedSpellUses.has(entry.spellId ?? 0),
    )
  )
    return "Choose a supported resource item.";
  return null;
}

export function isOriginalPaladinConfiguration(
  index: PaladinHealerLibraryIndex,
  group: PaladinHealerGroupPayload,
  config: PaladinHealerConfiguration,
): boolean {
  const original = configurationForPaladinHealerBuild(
    index,
    group,
    config.release,
    config.scenarioId,
  );
  return ["gear", "fields", "talentsString", "race", "consumes", "workload"].every(
    (key) =>
      JSON.stringify(original[key as keyof PaladinHealerConfiguration]) ===
      JSON.stringify(config[key as keyof PaladinHealerConfiguration]),
  );
}

const maxDecodedBytes = 65_536;
export function encodePaladinConfiguration(config: PaladinHealerConfiguration): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(paladinHealerConfigurationSchema.parse(config)),
  );
  if (bytes.length > maxDecodedBytes) throw new Error("This build is too large to share.");
  const compressed = deflateSync(bytes);
  const value = btoa(String.fromCharCode(...compressed))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  if (value.length > 12_000) throw new Error("This build is too large to share.");
  return value;
}

export function decodePaladinConfiguration(value: string): PaladinHealerConfiguration {
  if (value.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("The shared build is malformed or too large.");
  const bytes = Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.charCodeAt(0),
  );
  // A fixed output buffer bounds untrusted compressed links before JSON parsing.
  const decoded = inflateSync(bytes, { out: new Uint8Array(maxDecodedBytes + 1) });
  if (decoded.length > maxDecodedBytes) throw new Error("The shared build is too large.");
  return paladinHealerConfigurationSchema.parse(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
  );
}

export function paladinConfigurationStorageKey(release: string): string {
  return "kfc-healer-build:healing-paladin:v3:" + release;
}
