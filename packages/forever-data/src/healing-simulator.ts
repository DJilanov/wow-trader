import { z } from "zod";

const id = z.number().int().positive().safe();
const value = z.number().finite();
const nonnegative = value.nonnegative();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const policyKey = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
export const healingEquipmentSchema = z
  .array(z.object({ id: id.or(z.literal(0)), enchant: id.optional() }).strict())
  .length(17);
export const healingRankPolicySchema = z
  .object({
    schema: z.literal("kfc-priest-rank-sensitivity.v1"),
    id: policyKey,
    kind: z.enum(["unscaled-reference", "level-distance-sensitivity"]),
    fullScalingGap: nonnegative,
    coefficientLossPerLevel: nonnegative.max(1),
    classProcMode: z.enum(["unchanged", "coefficient-factor"]),
  })
  .strict();
export const healingPrioritySchema = z
  .object({
    spellId: id,
    raidIndex: z.number().int().min(-1).max(4),
    minimumMissingHealth: nonnegative,
    keepRenew: z.boolean(),
  })
  .strict();
export const healingCooldownSchema = z
  .object({
    itemId: id.optional(),
    spellId: id.optional(),
    minimumMissingMana: nonnegative.optional(),
    requireHealingDemand: z.boolean().optional(),
  })
  .strict()
  .refine((entry) => Boolean(entry.itemId) !== Boolean(entry.spellId), "Choose an item or a spell");
export const priestHealingItemPolicySchema = z
  .object({
    schema: z.literal("kfc-priest-item-effects-policy.v1"),
    id: policyKey,
    dormantHeartProcChance: nonnegative.max(1),
    dormantHeartHealingEvents: z.enum(["completed-casts", "direct-heals"]),
  })
  .strict();
export const healingWorkloadSchema = z
  .object({
    schema: z.literal("kfc-healing-workload.v1"),
    name: z.string().min(1).max(150),
    targets: z
      .array(
        z
          .object({
            raidIndex: z.number().int().min(0).max(4),
            maximumHealth: nonnegative,
            x: value,
            y: value,
          })
          .strict(),
      )
      .length(5),
    damage: z
      .array(
        z
          .object({
            atMs: z.number().int().nonnegative(),
            raidIndex: z.number().int().min(1).max(4),
            amount: value.positive(),
          })
          .strict(),
      )
      .max(20000),
    priorities: z.array(healingPrioritySchema).min(1).max(32),
    decisionIntervalMs: z.number().int().min(1).max(1000),
    useInnerFocus: z.boolean(),
    innerFocusMinimumCost: nonnegative,
    usePowerInfusion: z.boolean(),
    cooldowns: z.array(healingCooldownSchema).max(16),
    rankScaling: healingRankPolicySchema,
    itemEffectsPolicy: priestHealingItemPolicySchema.optional(),
  })
  .strict();
export const healingResultSchema = z
  .object({
    schema: z.literal("kfc-healing-workload-result.v1"),
    name: z.string().min(1),
    iterations: z.number().int().min(1).max(10000),
    survivalRate: nonnegative.max(1),
    manaRemainingMean: nonnegative,
    missingHealthSecondsMean: nonnegative,
    finalMissingHealthMean: nonnegative,
    manaBlockedSecondsMean: nonnegative,
    plannedIncomingPostMitigationDamage: nonnegative,
    deliveredIncomingDamageMean: nonnegative,
    hps: nonnegative,
    hpsStdev: nonnegative,
    rawHps: nonnegative,
    effectiveHealingHps: nonnegative,
    overhealingHps: nonnegative,
    absorbedHps: nonnegative,
    rankScaling: healingRankPolicySchema,
    itemEffectsPolicy: priestHealingItemPolicySchema.optional(),
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
    ) {
      context.addIssue({ code: "custom", message: "Healing accounting does not reconcile" });
    }
  });
export const healingJobSchema = z
  .object({
    schema: z.literal("kfc-healing-job.v1"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/),
    requestBase64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
    workload: healingWorkloadSchema,
    detail: z.literal(false),
  })
  .strict();
export const healingReplySchema = z.discriminatedUnion("status", [
  z
    .object({
      schema: z.literal("kfc-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("complete"),
      result: healingResultSchema,
    })
    .strict(),
  z
    .object({
      schema: z.literal("kfc-healing-job-result.v1"),
      id: z.string(),
      status: z.literal("error"),
      error: z.object({ code: z.string(), message: z.string() }).strict(),
    })
    .strict(),
]);
export const healerItemSchema = z
  .object({
    id,
    name: z.string().min(1),
    icon: z.string().regex(/^[a-z0-9_-]+$/i),
    slots: z.array(z.number().int().min(0).max(16)).min(1),
    quality: z.number().int().min(0).max(7),
    itemLevel: nonnegative,
    requiredLevel: nonnegative,
    stats: z.array(z.object({ label: z.string().min(1), value }).strict()),
    twoHanded: z.boolean(),
    unique: z.boolean(),
    limitCategory: z.number().int().nonnegative(),
    questChoices: z.array(z.string()),
    faction: z.enum(["Alliance", "Horde"]).nullable(),
    enchantIds: z.array(z.number().int().nonnegative()),
    historicalSource: z.boolean(),
    sourceLabel: z.string().min(1),
    effectLines: z.array(z.string()),
  })
  .strict();
export const healerEnchantSchema = z
  .object({
    id,
    name: z.string().min(1),
    stats: z.array(z.object({ label: z.string().min(1), value }).strict()),
  })
  .strict();
export const healerSpellSchema = z
  .object({
    id,
    name: z.string().min(1),
    family: z.string().min(1),
    rank: id,
    requiredLevel: z.number().int().min(1).max(60),
    requiredTalentField: z.string().nullable(),
  })
  .strict();
export const healerTalentTreeSchema = z
  .object({
    name: z.string().min(1),
    background: z.number().int().nonnegative(),
    talents: z
      .array(
        z
          .object({
            field: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
            name: z.string().min(1),
            max: z.number().int().min(1).max(9),
            row: z.number().int().min(0).max(10),
            column: z.number().int().min(0).max(3),
            prerequisite: z.string().nullable(),
            icon: z.string().regex(/^[a-z0-9_]+$/i),
            descriptions: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export const healerBuildSchema = z
  .object({
    id: key,
    archetype: z.enum(["holy", "discipline", "penance-holy", "aegis-guidance"]),
    title: z.string().min(1),
    assignment: z.enum(["tank", "group", "burst"]),
    layout: z.enum(["stacked", "spread"]),
    durationSeconds: z.union([z.literal(180), z.literal(300)]),
    gear: healingEquipmentSchema,
    talentsString: z.string().regex(/^[0-9-]+$/),
    fields: z.record(z.string(), z.number().int().nonnegative()),
    consumes: z
      .object({
        flask: id,
        food: id,
        mainHandImbue: id,
        defaultConjured: z.number().int().nonnegative(),
      })
      .strict(),
    requestBase64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(500000),
    workload: healingWorkloadSchema,
    references: z
      .array(
        z
          .object({
            policyId: policyKey,
            iterations: z.number().int().positive(),
            survivalRate: z.literal(1),
            effectiveHealingHps: nonnegative,
            absorbedHps: nonnegative,
            overhealingHps: nonnegative,
            meanMissingHealth: nonnegative,
            manaRemaining: nonnegative,
          })
          .strict(),
      )
      .min(7)
      .max(14),
    evidence: z.enum(["all-slot-benchmark", "scenario-adaptation"]),
    guidance: z.array(z.string().min(1)).min(1),
  })
  .strict();
export const healerLibrarySchema = z
  .object({
    schema: z.literal("kfc-healer-library.v1"),
    profile: z.literal("healing-priest"),
    modelIdentity: checksum,
    sourceBuild: z.number().int().positive(),
    preparedAt: z.iso.datetime(),
    defaultBuildId: key,
    builds: z.array(healerBuildSchema).min(1).max(100),
    items: z.array(healerItemSchema).min(1).max(5000),
    enchants: z.array(healerEnchantSchema).max(500),
    spells: z.array(healerSpellSchema).min(1).max(200),
    talents: z.array(healerTalentTreeSchema).length(3),
    rankPolicies: z.array(healingRankPolicySchema).min(7).max(14),
    itemEffectsVersion: z.union([z.literal(1), z.literal(2)]).optional(),
    races: z
      .array(
        z.object({ id, name: z.string().min(1), faction: z.enum(["Alliance", "Horde"]) }).strict(),
      )
      .min(1),
    assumptions: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((library, context) => {
    const items = new Map(library.items.map((item) => [item.id, item]));
    const enchants = new Set(library.enchants.map((enchant) => enchant.id));
    const spells = new Set(library.spells.map((spell) => spell.id));
    const baselinePolicies = library.rankPolicies.filter(
      (policy) => !policy.id.endsWith("-heart-zero"),
    );
    const zeroPolicies = library.rankPolicies.filter((policy) => policy.id.endsWith("-heart-zero"));
    if (
      baselinePolicies.length !== 7 ||
      new Set(library.rankPolicies.map((policy) => policy.id)).size !==
        library.rankPolicies.length ||
      (zeroPolicies.length > 0 &&
        (library.itemEffectsVersion === undefined || zeroPolicies.length !== 7)) ||
      zeroPolicies.some((policy) => {
        const base = baselinePolicies.find((candidate) => candidate.id === policy.id.slice(0, -11));
        return (
          !base ||
          base.kind !== policy.kind ||
          base.fullScalingGap !== policy.fullScalingGap ||
          base.coefficientLossPerLevel !== policy.coefficientLossPerLevel ||
          base.classProcMode !== policy.classProcMode
        );
      })
    ) {
      context.addIssue({ code: "custom", message: "Invalid or unpaired Priest item scenarios" });
    }
    if (
      items.size !== library.items.length ||
      new Set(library.builds.map((build) => build.id)).size !== library.builds.length ||
      !library.builds.some((build) => build.id === library.defaultBuildId) ||
      new Set(library.talents.flatMap((tree) => tree.talents.map((talent) => talent.field)))
        .size !== library.talents.reduce((sum, tree) => sum + tree.talents.length, 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Incomplete or duplicate healer library identity",
      });
    }
    for (const build of library.builds) {
      const problem = healerGearProblem(build.gear, library.items, "Horde");
      if (
        problem ||
        build.references.length !== library.rankPolicies.length ||
        new Set(build.references.map((reference) => reference.policyId)).size !==
          library.rankPolicies.length ||
        (library.itemEffectsVersion === undefined &&
          build.workload.itemEffectsPolicy !== undefined) ||
        (library.itemEffectsVersion !== undefined &&
          (build.workload.itemEffectsPolicy?.dormantHeartProcChance !==
            (build.workload.rankScaling.id.endsWith("-heart-zero") ? 0 : 1) ||
            build.workload.itemEffectsPolicy?.dormantHeartHealingEvents !== "completed-casts")) ||
        (library.itemEffectsVersion === 2 &&
          build.gear.some((item) => item.id === 13143) !==
            build.workload.cooldowns.some((use) => use.spellId === 17252)) ||
        healerTalentProblem(library.talents, build.fields, true) ||
        encodeHealerTalents(library.talents, build.fields) !== build.talentsString ||
        build.gear.some((spec) => spec.enchant && !enchants.has(spec.enchant)) ||
        build.workload.priorities.some((priority) => !spells.has(priority.spellId)) ||
        build.references.some(
          (reference) => !library.rankPolicies.some((policy) => policy.id === reference.policyId),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: problem || "Unknown build item, enchant, spell or rank policy",
          path: ["builds", build.id],
        });
      }
    }
  });
export const healerReleaseSchema = z
  .object({
    schema: z.literal("kfc-healer-browser-release.v1"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    modelIdentity: checksum,
    profile: z.literal("healing-priest"),
    preparedAt: z.iso.datetime(),
    files: z.record(
      z.string(),
      z.object({ bytes: z.number().int().positive(), sha256: checksum }).strict(),
    ),
    encodings: z
      .record(
        z.string(),
        z
          .object({
            br: z.object({ bytes: z.number().int().positive(), sha256: checksum }).strict(),
            gzip: z.object({ bytes: z.number().int().positive(), sha256: checksum }).strict(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .superRefine((release, context) => {
    for (const name of [
      "library.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ]) {
      if (!release.files[name])
        context.addIssue({ code: "custom", message: "Missing healer engine asset " + name });
    }
    if (
      Object.keys(release.files).some((path) => !/^[a-z0-9][a-z0-9_.-]*$/i.test(path)) ||
      Object.keys(release.encodings ?? {}).some((path) => !release.files[path])
    )
      context.addIssue({ code: "custom", message: "Invalid healer asset path" });
  });

export type HealingWorkload = z.infer<typeof healingWorkloadSchema>;
export type HealingResult = z.infer<typeof healingResultSchema>;
export type HealingRankPolicy = z.infer<typeof healingRankPolicySchema>;
export type HealingEquipment = z.infer<typeof healingEquipmentSchema>;
export type HealerItem = z.infer<typeof healerItemSchema>;
export type HealerLibrary = z.infer<typeof healerLibrarySchema>;
export type HealerBuild = z.infer<typeof healerBuildSchema>;
export type HealerRelease = z.infer<typeof healerReleaseSchema>;
export type HealerTalentTree = z.infer<typeof healerTalentTreeSchema>;
export const healerConfigurationSchema = z
  .object({
    version: z.literal(1),
    modelIdentity: checksum,
    buildId: key,
    gear: healingEquipmentSchema,
    fields: z.record(z.string(), z.number().int().nonnegative()),
    race: id,
    consumes: z
      .object({
        flask: id,
        food: id,
        mainHandImbue: id,
        defaultConjured: z.number().int().nonnegative(),
      })
      .strict(),
    priorities: z.array(healingPrioritySchema).min(1).max(32),
    policyId: policyKey,
    iterations: z.number().int().min(1).max(10000),
  })
  .strict();
export type HealerConfiguration = z.infer<typeof healerConfigurationSchema>;

export function healerTalentProblem(
  trees: readonly HealerTalentTree[],
  fields: Readonly<Record<string, number>>,
  complete: boolean,
): string | null {
  const known = new Set(trees.flatMap((tree) => tree.talents.map((talent) => talent.field)));
  if (Object.keys(fields).some((field) => !known.has(field)))
    return "This build contains a talent from another model.";
  let total = 0;
  for (const tree of trees)
    for (const talent of tree.talents) {
      const rank = fields[talent.field] ?? 0;
      if (!Number.isInteger(rank) || rank < 0 || rank > talent.max)
        return "Choose a valid rank for " + talent.name + ".";
      total += rank;
      if (!rank) continue;
      const below = tree.talents.reduce(
        (sum, candidate) => sum + (candidate.row < talent.row ? (fields[candidate.field] ?? 0) : 0),
        0,
      );
      if (below < talent.row * 5)
        return "Spend more points in earlier tiers before choosing " + talent.name + ".";
      const prerequisite = tree.talents.find(
        (candidate) => candidate.field === talent.prerequisite,
      );
      if (talent.prerequisite && (!prerequisite || fields[prerequisite.field] !== prerequisite.max))
        return "Complete the prerequisite for " + talent.name + ".";
    }
  return total > 51
    ? "A level 60 build has 51 talent points."
    : complete && total !== 51
      ? "Spend all 51 talent points before simulating."
      : null;
}

export function encodeHealerTalents(
  trees: readonly HealerTalentTree[],
  fields: Readonly<Record<string, number>>,
): string {
  return trees
    .map((tree) =>
      tree.talents
        .map((talent) => fields[talent.field] ?? 0)
        .join("")
        .replace(/0+$/, ""),
    )
    .join("-")
    .replace(/-+$/, "");
}

export function healerGearProblem(
  gear: HealingEquipment,
  items: readonly HealerItem[],
  faction: "Alliance" | "Horde",
): string | null {
  if (gear.length !== 17) return "Choose equipment for every slot.";
  const catalog = new Map(items.map((item) => [item.id, item]));
  const unique = new Set<number>(),
    categories = new Set<number>(),
    quests = new Set<string>();
  for (const [slot, spec] of gear.entries()) {
    if (slot === 15 && spec.id === 0 && !spec.enchant) continue;
    const item = catalog.get(spec.id);
    if (!item || !item.slots.includes(slot)) return "Choose a usable item for each slot.";
    if (item.faction && item.faction !== faction)
      return item.name + " is unavailable for the selected race.";
    if (spec.enchant && !item.enchantIds.includes(spec.enchant))
      return "Choose a compatible enchant for " + item.name + ".";
    if (
      (item.unique && unique.has(item.id)) ||
      (item.limitCategory && categories.has(item.limitCategory)) ||
      item.questChoices.some((quest) => quests.has(quest))
    )
      return "This equipment combines unique items or mutually exclusive quest rewards.";
    unique.add(item.id);
    if (item.limitCategory) categories.add(item.limitCategory);
    for (const quest of item.questChoices) quests.add(quest);
  }
  if (catalog.get(gear[14]!.id)?.twoHanded && gear[15]!.id !== 0)
    return "A two-handed weapon requires an empty off hand.";
  return null;
}
