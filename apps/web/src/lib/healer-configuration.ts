import {
  healerGearProblem,
  healerTalentProblem,
  healingWorkloadSchema,
} from "@wow-trader/forever-data/healing-simulator";
import {
  druidHealingItemUseSchema,
  druidHealingWorkloadSchema,
  type DruidHealingItemUse,
} from "@wow-trader/forever-data/druid-healing-simulator";
import {
  normalizeHealerConfiguration,
  workspaceConfigurationSchema,
  type HealerConsumeKind,
  type HealerWorkspaceBuild,
  type HealerWorkspaceConfiguration,
  type HealerWorkspaceLibrary,
  type WorkspaceHealingWorkload,
} from "@wow-trader/forever-data/healer-workspace";

interface ConsumeChoice {
  readonly id: number;
  readonly name: string;
}
export interface HealerConsumeMenu {
  readonly key: HealerConsumeKind;
  readonly label: string;
  readonly choices: readonly ConsumeChoice[];
}
const flasks: HealerConsumeMenu = {
  key: "flask",
  label: "Flask",
  choices: [
    { id: 2, name: "Distilled Wisdom · +2,000 mana" },
    { id: 1, name: "Flask of the Titans · +1,200 health" },
  ],
};
const oil: HealerConsumeMenu = {
  key: "mainHandImbue",
  label: "Weapon oil",
  choices: [
    { id: 16, name: "Lesser Mana Oil · +20 healing, +10 MP5" },
    { id: 20, name: "Wizard Oil · +24 healing and damage" },
  ],
};
const rune: HealerConsumeMenu = {
  key: "defaultConjured",
  label: "Conjured item",
  choices: [
    { id: 0, name: "No Demonic Rune" },
    { id: 2, name: "Demonic Rune · mana with self-damage" },
  ],
};
export function healerConsumeMenus(library: HealerWorkspaceLibrary): readonly HealerConsumeMenu[] {
  const food: HealerConsumeMenu = {
    key: "food",
    label: "Food",
    choices:
      library.profile === "healing-priest"
        ? [
            { id: 4, name: "Runn Tum Tuber Surprise" },
            { id: 1, name: "Grilled Squid" },
            { id: 3, name: "Nightfin Soup" },
            { id: 11, name: "Sagefish Delight" },
            { id: 9, name: "Tender Wolf Steak" },
          ]
        : [
            { id: 4, name: "Runn Tum Tuber Surprise" },
            { id: 1, name: "Grilled Squid" },
            { id: 6, name: "Blessed Sunfruit Juice" },
            { id: 8, name: "Hot Wolf Ribs" },
            { id: 10, name: "Smoked Sagefish" },
          ],
  };
  return [
    flasks,
    food,
    oil,
    rune,
    ...(library.profile === "healing-druid"
      ? [
          {
            key: "alcohol" as const,
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
        ]
      : []),
  ];
}
export function healerSpellSupportsHot(family: string): boolean {
  return ["renew", "rejuvenation", "regrowth", "wild-growth"].includes(family);
}
export function configurationForHealerBuild(
  library: HealerWorkspaceLibrary,
  build: HealerWorkspaceBuild,
): HealerWorkspaceConfiguration {
  return workspaceConfigurationSchema.parse({
    version: 2,
    profile: library.profile,
    modelIdentity: library.modelIdentity,
    buildId: build.id,
    gear: globalThis.structuredClone(build.gear),
    fields: { ...build.fields },
    race: library.defaultRaceId,
    consumes: { ...build.consumes },
    priorities: build.workload.priorities.map((priority) => ({
      spellId: priority.spellId,
      raidIndex: priority.raidIndex,
      minimumMissingHealth: priority.minimumMissingHealth,
      keepHot: "keepHot" in priority ? priority.keepHot : priority.keepRenew,
    })),
    policyId: build.defaultPolicyId,
    iterations: 512,
  });
}
export function healerConfigurationProblem(
  library: HealerWorkspaceLibrary,
  config: HealerWorkspaceConfiguration,
  complete = true,
): string | null {
  const build = library.builds.find((build) => build.id === config.buildId),
    race = library.races.find((race) => race.id === config.race);
  if (config.profile !== library.profile)
    return "This saved build belongs to another healing class.";
  if (config.modelIdentity !== library.modelIdentity)
    return "This saved build belongs to another engine model.";
  if (!build || !race || !library.rankPolicies.some((policy) => policy.id === config.policyId))
    return "Choose a supported build, race and scaling scenario.";
  for (const menu of healerConsumeMenus(library))
    if (!menu.choices.some((choice) => choice.id === config.consumes[menu.key]))
      return "Choose a reviewed consumable.";
  if (library.profile === "healing-priest" && config.consumes.alcohol !== 0)
    return "Alcohol is outside this Priest model’s reviewed consumables.";
  const gear = healerGearProblem(config.gear, library.items, race.faction);
  if (gear) return gear;
  const talents = healerTalentProblem(library.talents, config.fields, complete);
  if (talents) return talents;
  if (config.priorities.length === 0) return "Choose at least one healing spell.";
  for (const priority of config.priorities) {
    const spell = library.spells.find((spell) => spell.id === priority.spellId);
    if (!spell || (spell.requiredTalentField && !config.fields[spell.requiredTalentField]))
      return "The casting plan uses a spell this talent build has not learned.";
    if (priority.keepHot && !healerSpellSupportsHot(spell.family))
      return "Only a supported heal over time can use the keep-HoT option.";
  }
  return null;
}
export function healerWorkloadForConfiguration(
  library: HealerWorkspaceLibrary,
  config: HealerWorkspaceConfiguration,
): WorkspaceHealingWorkload {
  const build = library.builds.find((build) => build.id === config.buildId),
    policy = library.rankPolicies.find((policy) => policy.id === config.policyId);
  if (!build || !policy || library.profile !== config.profile)
    throw new Error("Unknown healing build or scenario");
  const result = globalThis.structuredClone(build.workload);
  result.cooldowns = [{ itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true }];
  const owns = (itemId: number): boolean => config.gear.some((item) => item.id === itemId);
  if (owns(11819))
    result.cooldowns.push({ spellId: 15604, minimumMissingMana: 630, requireHealingDemand: true });
  if (result.schema === "kfc-healing-workload.v1" && policy.kind === "priest") {
    result.priorities = config.priorities.map(({ keepHot, ...priority }) => ({
      ...priority,
      keepRenew: keepHot,
    }));
    result.rankScaling = globalThis.structuredClone(policy.policy);
    if (library.itemEffectsVersion !== undefined) {
      const heartDisabled = policy.id.endsWith("-heart-zero");
      result.itemEffectsPolicy = {
        schema: "kfc-priest-item-effects-policy.v1",
        id: heartDisabled ? "heart-rate-0" : "heart-client-literal",
        dormantHeartProcChance: heartDisabled ? 0 : 1,
        dormantHeartHealingEvents: "completed-casts",
      };
      if (owns(18371))
        result.cooldowns.push({
          spellId: 1302205,
          minimumMissingMana: 1500,
          requireHealingDemand: true,
        });
      if (owns(272439)) result.cooldowns.push({ itemId: 272439, requireHealingDemand: true });
    }
    result.useInnerFocus = Boolean(config.fields.innerFocus);
    result.usePowerInfusion = Boolean(config.fields.powerInfusion);
    if (library.races.find((race) => race.id === config.race)?.name === "Troll")
      result.cooldowns.unshift({ spellId: 20554, requireHealingDemand: true });
    if (config.consumes.defaultConjured === 2)
      result.cooldowns.push({
        itemId: 12662,
        minimumMissingMana: 1500,
        requireHealingDemand: true,
      });
    if (library.itemEffectsVersion === 2 && owns(13143))
      result.cooldowns.push({
        spellId: 17252,
        minimumMissingMana: 22,
        requireHealingDemand: true,
      });
    return healingWorkloadSchema.parse(result);
  }
  if (result.schema !== "kfc-druid-healing-workload.v1" || policy.kind !== "druid")
    throw new Error("The healing scenario belongs to another class");
  result.priorities = globalThis.structuredClone(config.priorities);
  result.research = globalThis.structuredClone(policy.policy.research);
  result.equipmentPolicy = globalThis.structuredClone(policy.policy.equipmentPolicy);
  result.itemEffectsPolicy = globalThis.structuredClone(policy.policy.itemEffectsPolicy);
  result.legacyItemsPolicy = globalThis.structuredClone(policy.policy.legacyItemsPolicy);
  if (policy.policy.healingPolicy)
    result.healingPolicy = globalThis.structuredClone(policy.policy.healingPolicy);
  result.useNaturesSwiftness = Boolean(config.fields.naturesSwiftness);
  if (owns(18371))
    result.cooldowns.push({
      spellId: 1302205,
      minimumMissingMana: 1250,
      requireHealingDemand: true,
    });
  if (owns(272439)) result.cooldowns.push({ itemId: 272439, requireHealingDemand: true });
  if (owns(13143))
    result.cooldowns.push({ spellId: 17252, minimumMissingMana: 22, requireHealingDemand: true });
  if (config.consumes.defaultConjured === 2)
    result.cooldowns.push({ itemId: 12662, minimumMissingMana: 1500, requireHealingDemand: true });
  const itemUse = healerEquippedItemUse(library, config);
  if (itemUse) result.utilityProbe = itemUse;
  else delete result.utilityProbe;
  return druidHealingWorkloadSchema.parse(result);
}
export function healerEquippedItemUse(
  library: HealerWorkspaceLibrary,
  config: HealerWorkspaceConfiguration,
): DruidHealingItemUse | undefined {
  if (
    library.profile !== "healing-druid" ||
    config.profile !== "healing-druid" ||
    !library.supportedItemUses?.includes("major-recombobulator") ||
    !config.gear.some((item) => item.id === 18637)
  )
    return undefined;
  const build = library.builds.find((entry) => entry.id === config.buildId);
  const policy = library.rankPolicies.find((entry) => entry.id === config.policyId);
  if (build?.workload.schema !== "kfc-druid-healing-workload.v1" || policy?.kind !== "druid")
    return undefined;
  const template = build.workload.utilityProbe ?? {
    schema: "kfc-druid-utility-probe.v1" as const,
    id: "equipped-recombobulator",
    mode: "recombobulator-timed-use" as const,
    headmasterIntellect: 0 as const,
    baronRegeneration: false as const,
    circle: false as const,
    gauntlets: false as const,
    recombobulator: true as const,
    recombobulatorCanCrit: false,
    recombobulatorTarget: "most-injured" as const,
    recombobulatorHealingCoefficient: 0 as const,
    recombobulatorManaCoefficient: 0 as const,
    minimumMissingHealth: 800,
    minimumMissingMana: 800,
  };
  const critical = policy.policy.itemCriticalHealing ?? false;
  return druidHealingItemUseSchema.parse({
    ...template,
    id: template.id.replace(/-(?:true|false)$/, "") + "-" + critical,
    recombobulatorCanCrit: critical,
  });
}
export function isOriginalHealerConfiguration(
  library: HealerWorkspaceLibrary,
  config: HealerWorkspaceConfiguration,
): boolean {
  const build = library.builds.find((build) => build.id === config.buildId);
  if (
    !build ||
    config.profile !== library.profile ||
    config.modelIdentity !== library.modelIdentity
  )
    return false;
  const original = configurationForHealerBuild(library, build);
  return (
    original.race === config.race &&
    JSON.stringify(original.gear) === JSON.stringify(config.gear) &&
    JSON.stringify(original.fields) === JSON.stringify(config.fields) &&
    JSON.stringify(original.consumes) === JSON.stringify(config.consumes) &&
    JSON.stringify(original.priorities) === JSON.stringify(config.priorities)
  );
}
export function encodeHealerConfiguration(config: HealerWorkspaceConfiguration): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify(workspaceConfigurationSchema.parse(config)),
  );
  if (bytes.length > 18_000) throw new Error("The shared build is too large.");
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeHealerConfiguration(value: string): HealerWorkspaceConfiguration {
  if (value.length > 24_000 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("The shared build is malformed or too large.");
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    text = new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  return normalizeHealerConfiguration(JSON.parse(text));
}
