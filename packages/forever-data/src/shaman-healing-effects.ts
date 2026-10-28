import { z } from "zod";

const referenceId = z.string().min(1).max(100);
const chance = z.number().finite().min(0).max(1);
const procRouting = z.enum([
  "completed-class-healing-casts-reference",
  "completed-owned-spell-casts-reference",
  "direct-class-healing-events-reference",
  "all-class-healing-events-reference",
]);
const regeneration = z
  .object({ tickTiming: z.enum(["two-second-ticks-reference", "five-second-ticks-reference"]) })
  .strict();

const passiveDamage = z
  .object({
    schema: z.literal("kfc-shaman-passive-damage-policy.v1"),
    id: referenceId,
    timing: z.literal("captured-proc-recovery-ms-reference"),
    necropileTrigger: z.enum(["cast-only-reference", "adaptive-damage-reference"]).optional(),
    necropileChance: chance.optional(),
    drainOutcome: z.literal("noncritical-hit-reference").optional(),
    postmaster: z.literal("self-ineligible-after-hit-strict-below-reference").optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.necropileTrigger && !policy.postmaster)
      context.addIssue({ code: "custom", message: "Empty passive damage reference" });
    const adaptive = policy.necropileTrigger === "adaptive-damage-reference";
    if (
      (adaptive && (policy.necropileChance === undefined || !policy.drainOutcome)) ||
      (!adaptive && (policy.necropileChance !== undefined || policy.drainOutcome !== undefined))
    )
      context.addIssue({ code: "custom", message: "Incomplete Necropile reference" });
  });
const protective = z
  .object({
    schema: z.literal("kfc-shaman-protective-policy.v1"),
    id: referenceId,
    cooldowns: z.literal("item-override-inherits-negative-reference"),
    admiralStamina: z.enum(["disabled-reference", "additive-reference"]).optional(),
    admiralHealth: z.enum(["maximum-only-reference", "grant-on-gain-reference"]).optional(),
    admiralRecipientHealth: z.literal("ten-health-per-stamina-reference").optional(),
    harmBelt: z.enum(["disabled-use-reference", "no-overload-reference"]).optional(),
    selfReflection: z.literal("self-ineligible-reference").optional(),
    adaptiveEnemyInMelee: z.boolean().optional(),
    adaptiveOutcome: z.literal("noncritical-hit-reference").optional(),
  })
  .strict()
  .superRefine((policy, context) => {
    const additive = policy.admiralStamina === "additive-reference";
    if (
      (additive && (!policy.admiralHealth || !policy.admiralRecipientHealth)) ||
      (!additive &&
        (policy.admiralHealth !== undefined || policy.admiralRecipientHealth !== undefined))
    )
      context.addIssue({ code: "custom", message: "Incomplete Admiral health reference" });
    if ((policy.adaptiveEnemyInMelee !== undefined) !== (policy.adaptiveOutcome !== undefined))
      context.addIssue({ code: "custom", message: "Incomplete adaptive protection reference" });
  });

export const shamanHealingEffectsSchema = z
  .object({
    passiveDamage: passiveDamage.optional(),
    protective: protective.optional(),
    relic: z
      .object({ costStacking: z.enum(["additive-percent-reference", "multiplicative-reference"]) })
      .strict()
      .optional(),
    elements: z
      .object({
        procChance: z.enum(["client-proc-record-reference", "four-percent-sensitivity-reference"]),
        procRouting,
      })
      .strict()
      .optional(),
    fiveThunders: z
      .object({
        procRouting: z.enum([
          "completed-class-healing-casts-reference",
          "direct-class-healing-events-reference",
          "all-class-healing-events-reference",
        ]),
      })
      .strict()
      .optional(),
    castSets: z
      .object({
        procRouting,
        wildheartChance: z.enum(["", "two-percent-reference", "five-percent-reference"]),
        dreadmistCriticals: z.enum(["", "noncritical-reference", "critical-reference"]),
      })
      .strict()
      .optional(),
    healthRegen: regeneration.optional(),
    flatRegen: regeneration.optional(),
    heart: z
      .object({
        schema: z.literal("kfc-shaman-item-effects-policy.v1"),
        id: referenceId,
        dormantHeartProcChance: chance,
        dormantHeartHealingEvents: z.enum(["completed-casts", "direct-heals"]),
      })
      .strict()
      .optional(),
    reactive: z
      .object({
        schema: z.literal("kfc-shaman-reactive-set-policy.v1"),
        id: referenceId,
        thresholdTiming: z.enum(["after-hit", "before-hit"]),
        selfDamageTriggers: z.boolean(),
        devoutChance: chance,
      })
      .strict()
      .optional(),
    utility: z
      .object({
        schema: z.literal("kfc-shaman-utility-policy.v1"),
        id: referenceId,
        healingCanCrit: z.boolean(),
        recombobulatorCanCrit: z.boolean(),
        channelScalesWithHaste: z.boolean(),
        resourceRolls: z.enum(["independent-reference", "same-percentile-reference"]),
        headmasterIntellect: z.enum(["disabled-reference", "additive-reference"]),
        baronTickPeriodMs: z.union([z.literal(2000), z.literal(5000)]),
      })
      .strict()
      .optional(),
    legacy: z
      .object({
        schema: z.literal("kfc-shaman-legacy-item-policy.v1"),
        id: referenceId,
        briarwoodSpellPower: z.union([z.literal(15), z.literal(29), z.literal(30)]).optional(),
        royalSealSpellPower: z.union([z.literal(18), z.literal(23)]).optional(),
        eyeScriptReference: z.literal("captured-passive-unmodeled-script-reference").optional(),
      })
      .strict()
      .refine(
        (policy) =>
          policy.briarwoodSpellPower !== undefined ||
          policy.royalSealSpellPower !== undefined ||
          policy.eyeScriptReference !== undefined,
        "Empty legacy item reference",
      )
      .optional(),
  })
  .strict();

export type ShamanHealingEffects = z.infer<typeof shamanHealingEffectsSchema>;
