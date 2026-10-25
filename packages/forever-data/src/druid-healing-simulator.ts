import { z } from "zod";
import {
  encodeHealerTalents,
  healerBuildSchema,
  healerEnchantSchema,
  healerGearProblem,
  healerItemSchema,
  healerLibrarySchema,
  healerReleaseSchema,
  healerSpellSchema,
  healerTalentProblem,
  healerTalentTreeSchema,
  healingCooldownSchema,
  healingEquipmentSchema,
  healingResultSchema,
  healingWorkloadSchema,
} from "./healing-simulator.js";

const id = z.number().int().positive().safe();
const nonnegative = z.number().finite().nonnegative();
const key = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const policyKey = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const druidHealingResearchSchema = z
  .object({
    schema: z.literal("kfc-druid-healing-research.v1"),
    id: policyKey,
    fullScalingGap: z.union([z.literal(0), z.literal(12), z.literal(17), z.literal(22)]),
    coefficientLossPerLevel: z.union([z.literal(0), z.literal(0.05)]),
    classProcMode: z.enum(["unchanged", "coefficient-factor"]),
    omenProcChance: z.union([
      z.literal(0),
      z.literal(0.1),
      z.literal(0.2),
      z.literal(0.3),
      z.literal(1),
    ]),
    omenEvents: z.enum(["direct-heals", "healing-casts"]),
    regrowthPeriodicCrits: z.boolean(),
  })
  .strict();
export const druidHealingEquipmentPolicySchema = z
  .object({
    schema: z.literal("kfc-druid-healing-equipment-policy.v1"),
    id: policyKey,
    wildheartManaProcChance: z.union([
      z.literal(0),
      z.literal(0.02),
      z.literal(0.05),
      z.literal(0.1),
      z.literal(1),
    ]),
    wildheartHealingEvents: z.enum(["completed-casts", "direct-heals"]),
  })
  .strict();
export const druidHealingItemPolicySchema = z
  .object({
    schema: z.literal("kfc-druid-item-effects-policy.v1"),
    id: policyKey,
    dormantHeartProcChance: z.union([
      z.literal(0),
      z.literal(0.02),
      z.literal(0.05),
      z.literal(0.1),
      z.literal(1),
    ]),
    dormantHeartHealingEvents: z.enum(["completed-casts", "direct-heals"]),
  })
  .strict();
export const druidHealingLegacyPolicySchema = z
  .object({
    schema: z.literal("kfc-druid-legacy-item-policy.v1"),
    id: policyKey,
    royalSealHealingPower: z.union([z.literal(0), z.literal(44)]),
    briarwoodSpellPower: z.union([z.literal(15), z.literal(29), z.literal(30)]),
    royalSealForestSpirit: z.boolean(),
  })
  .strict();
export const druidHealingHotPolicySchema = z
  .object({
    WildGrowthDecay: z.union([z.literal(0.05), z.literal(0.1), z.literal(0.2)]),
    SwiftmendSelection: z.enum(["shortest", "largest"]),
  })
  .strict();
export const druidHealingSelfPolicySchema = z
  .object({
    schema: z.literal("kfc-druid-self-effects-policy.v1"),
    id: policyKey,
    viperThresholdTiming: z.enum(["after-hit", "before-hit"]),
    vitalityTickMs: z.union([z.literal(2000), z.literal(5000)]),
    dreadmistCrits: z.boolean(),
  })
  .strict();
export const druidHealingItemUseSchema = z
  .object({
    schema: z.literal("kfc-druid-utility-probe.v1"),
    id: policyKey,
    mode: z.literal("recombobulator-timed-use"),
    headmasterIntellect: z.literal(0),
    baronRegeneration: z.literal(false),
    circle: z.literal(false),
    gauntlets: z.literal(false),
    recombobulator: z.literal(true),
    recombobulatorCanCrit: z.boolean().default(false),
    recombobulatorTarget: z.enum(["self", "most-injured"]),
    recombobulatorHealingCoefficient: z.literal(0).default(0),
    recombobulatorManaCoefficient: z.literal(0).default(0),
    minimumMissingHealth: nonnegative.max(1_000_000),
    minimumMissingMana: nonnegative.max(1_000_000),
  })
  .strict();
export const druidHealingScenarioSchema = z
  .object({
    id: policyKey,
    label: z.string().min(1),
    description: z.string().min(1),
    research: druidHealingResearchSchema,
    equipmentPolicy: druidHealingEquipmentPolicySchema,
    itemEffectsPolicy: druidHealingItemPolicySchema,
    legacyItemsPolicy: druidHealingLegacyPolicySchema,
    healingPolicy: druidHealingHotPolicySchema.optional(),
    itemCriticalHealing: z.boolean().optional(),
  })
  .strict();
export const druidHealingPrioritySchema = z
  .object({
    spellId: id,
    raidIndex: z.number().int().min(-1).max(4),
    minimumMissingHealth: nonnegative,
    keepHot: z.boolean(),
  })
  .strict();
const workload = healingWorkloadSchema.shape;
export const druidHealingWorkloadSchema = z
  .object({
    schema: z.literal("kfc-druid-healing-workload.v1"),
    name: workload.name,
    targets: workload.targets,
    damage: workload.damage,
    priorities: z.array(druidHealingPrioritySchema).min(1).max(32),
    decisionIntervalMs: workload.decisionIntervalMs,
    healingPolicy: druidHealingHotPolicySchema,
    innervateMinimumMissingMana: nonnegative.max(1_000_000),
    innervateRequireHealingDemand: z.boolean(),
    useNaturesSwiftness: z.boolean(),
    naturesSwiftnessMinimumMissingHealth: nonnegative.max(1_000_000),
    research: druidHealingResearchSchema,
    equipmentPolicy: druidHealingEquipmentPolicySchema,
    itemEffectsPolicy: druidHealingItemPolicySchema,
    legacyItemsPolicy: druidHealingLegacyPolicySchema,
    selfEffectsPolicy: druidHealingSelfPolicySchema.optional(),
    utilityProbe: druidHealingItemUseSchema.optional(),
    allowCasterDamage: z.literal(false).optional(),
    cooldowns: z.array(healingCooldownSchema).max(16),
  })
  .strict();
const metrics = healingResultSchema.shape;
export const druidHealingResultSchema = z
  .object({
    schema: z.literal("kfc-druid-healing-workload-result.v1"),
    name: metrics.name,
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
    research: druidHealingResearchSchema.optional(),
    equipmentPolicy: druidHealingEquipmentPolicySchema.optional(),
    itemEffectsPolicy: druidHealingItemPolicySchema.optional(),
    legacyItemsPolicy: druidHealingLegacyPolicySchema.optional(),
    selfEffectsPolicy: druidHealingSelfPolicySchema.optional(),
    utilityProbe: druidHealingItemUseSchema.optional(),
    casterDamageEnabled: z.literal(false).optional(),
    classQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    const tolerance = Math.max(1, result.hps, result.rawHps) * 1e-7;
    if (
      Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) > tolerance ||
      Math.abs(result.rawHps - result.effectiveHealingHps - result.overhealingHps) > tolerance ||
      result.deliveredIncomingDamageMean > result.plannedIncomingPostMitigationDamage + tolerance
    )
      context.addIssue({ code: "custom", message: "Healing accounting does not reconcile" });
  });
export const druidHealingJobSchema = z
  .object({
    schema: z.literal("kfc-druid-healing-job.v1"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    requestBase64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(500000),
    workload: druidHealingWorkloadSchema,
    detail: z.literal(false),
  })
  .strict();
export const druidHealingReplySchema = z.discriminatedUnion("status", [
  z
    .object({
      schema: z.literal("kfc-druid-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("complete"),
      result: druidHealingResultSchema,
    })
    .strict(),
  z
    .object({
      schema: z.literal("kfc-druid-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("error"),
      error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict(),
    })
    .strict(),
]);
export const druidHealingConsumesSchema = z
  .object({
    flask: z.union([z.literal(1), z.literal(2)]),
    food: z.union([z.literal(1), z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
    mainHandImbue: z.union([z.literal(16), z.literal(20)]),
    defaultConjured: z.union([z.literal(0), z.literal(2)]),
    alcohol: z.number().int().min(0).max(5),
  })
  .strict();
const build = healerBuildSchema.shape;
export const druidHealerBuildSchema = z
  .object({
    id: key,
    archetype: z.enum(["wild-growth", "splendor-wild-growth", "natures-grace"]),
    title: build.title,
    assignment: build.assignment,
    layout: build.layout,
    durationSeconds: build.durationSeconds,
    gear: healingEquipmentSchema,
    talentsString: build.talentsString,
    fields: build.fields,
    consumes: druidHealingConsumesSchema,
    defaultPolicyId: policyKey,
    requestBase64: build.requestBase64,
    workload: druidHealingWorkloadSchema,
    references: z.array(build.references.element).min(1).max(100),
    evidence: z.enum(["all-slot-benchmark", "scenario-adaptation"]),
    guidance: build.guidance,
  })
  .strict();
const library = healerLibrarySchema.shape;
export const druidHealerLibrarySchema = z
  .object({
    schema: z.literal("kfc-druid-healer-library.v1"),
    profile: z.literal("healing-druid"),
    modelIdentity: checksum,
    sourceBuild: library.sourceBuild,
    preparedAt: library.preparedAt,
    defaultBuildId: key,
    defaultRaceId: id,
    professions: z.array(z.string().min(1)).length(2),
    supportedItemUses: z.array(z.literal("major-recombobulator")).max(1).optional(),
    builds: z.array(druidHealerBuildSchema).min(1).max(100),
    items: z.array(healerItemSchema).min(1).max(5000),
    enchants: z.array(healerEnchantSchema).max(500),
    spells: z.array(healerSpellSchema).min(1).max(200),
    talents: z.array(healerTalentTreeSchema).length(3),
    scenarios: z.array(druidHealingScenarioSchema).min(1).max(100),
    races: library.races,
    assumptions: library.assumptions,
  })
  .strict()
  .superRefine((value, context) => {
    const items = new Set(value.items.map((item) => item.id)),
      enchants = new Set(value.enchants.map((enchant) => enchant.id)),
      spells = new Map(value.spells.map((spell) => [spell.id, spell])),
      scenarios = new Set(value.scenarios.map((scenario) => scenario.id)),
      race = value.races.find((race) => race.id === value.defaultRaceId);
    if (
      items.size !== value.items.length ||
      enchants.size !== value.enchants.length ||
      spells.size !== value.spells.length ||
      scenarios.size !== value.scenarios.length ||
      !race ||
      new Set(value.builds.map((build) => build.id)).size !== value.builds.length ||
      !value.builds.some((build) => build.id === value.defaultBuildId) ||
      new Set(value.talents.flatMap((tree) => tree.talents.map((talent) => talent.field))).size !==
        value.talents.reduce((sum, tree) => sum + tree.talents.length, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Incomplete or duplicate Druid library identity",
      });
    }
    for (const entry of value.builds) {
      const problem = race
        ? healerGearProblem(entry.gear, value.items, race.faction)
        : "Choose a default race";
      if (
        problem ||
        healerTalentProblem(value.talents, entry.fields, true) ||
        encodeHealerTalents(value.talents, entry.fields) !== entry.talentsString ||
        entry.gear.some((spec) => spec.enchant && !enchants.has(spec.enchant)) ||
        !scenarios.has(entry.defaultPolicyId) ||
        entry.references.length !== scenarios.size ||
        new Set(entry.references.map((reference) => reference.policyId)).size !== scenarios.size ||
        entry.references.some((reference) => !scenarios.has(reference.policyId)) ||
        entry.workload.priorities.some((priority) => {
          const spell = spells.get(priority.spellId);
          return (
            !spell || Boolean(spell.requiredTalentField && !entry.fields[spell.requiredTalentField])
          );
        })
      )
        context.addIssue({
          code: "custom",
          message: problem || "Invalid Druid build, spell or scenario reference",
          path: ["builds", entry.id],
        });
    }
    if (
      (value.builds.some((entry) => entry.workload.utilityProbe) &&
        !value.supportedItemUses?.includes("major-recombobulator")) ||
      (value.supportedItemUses?.includes("major-recombobulator") &&
        !value.professions.includes("Engineering"))
    )
      context.addIssue({
        code: "custom",
        message: "Item use requires its supported Engineering model",
      });
    for (const entry of value.builds)
      if (entry.workload.utilityProbe && !entry.gear.some((item) => item.id === 18637))
        context.addIssue({
          code: "custom",
          message: "Major Recombobulator use requires the equipped item",
          path: ["builds", entry.id],
        });
  });
const release = healerReleaseSchema.shape;
export const druidHealerReleaseSchema = z
  .object({
    schema: release.schema,
    release: release.release,
    modelIdentity: release.modelIdentity,
    profile: z.literal("healing-druid"),
    preparedAt: release.preparedAt,
    files: release.files,
    encodings: release.encodings,
  })
  .strict()
  .superRefine((value, context) => {
    for (const name of [
      "library.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ])
      if (!value.files[name])
        context.addIssue({ code: "custom", message: "Missing healer engine asset " + name });
    if (
      Object.keys(value.files).some((path) => !/^[a-z0-9][a-z0-9_.-]*$/i.test(path)) ||
      Object.keys(value.encodings ?? {}).some((path) => !value.files[path])
    )
      context.addIssue({ code: "custom", message: "Invalid healer asset path" });
  });

export type DruidHealingWorkload = z.infer<typeof druidHealingWorkloadSchema>;
export type DruidHealingItemUse = z.infer<typeof druidHealingItemUseSchema>;
export type DruidHealingResult = z.infer<typeof druidHealingResultSchema>;
export type DruidHealingScenario = z.infer<typeof druidHealingScenarioSchema>;
export type DruidHealingConsumes = z.infer<typeof druidHealingConsumesSchema>;
export type DruidHealerBuild = z.infer<typeof druidHealerBuildSchema>;
export type DruidHealerLibrary = z.infer<typeof druidHealerLibrarySchema>;
export type DruidHealerRelease = z.infer<typeof druidHealerReleaseSchema>;
