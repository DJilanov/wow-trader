import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
const ids = ["feral-cat-static", "balance-static"] as const;
const base = "artifacts/forever-simulator/optimization/druid-statistics-correction-v1";
const samples = z.number().int().safe().min(40000).multipleOf(40000);

export const fullRaidDruidStatisticsModel = Object.freeze({
  sourceRelease: "57ac00a190de1da00d51b72d",
  databaseSha256: "7ddf2dde51a7d0d1e904f69255c444c5855a79a69951032d283c626aa2a22a3f",
  nativeBinarySha256: "4452a711273b19bba75b42fdf3745ef593cc3946d91d42f2aa9620cfe09a9336",
  wasmSha256: "6150a36982f5190c27006be196bb5b9a6c7aaf9fb9b6980042755df7db0fab16",
});
export type FullRaidDruidBuildId = (typeof ids)[number];
export type FullRaidDruidProfile = "feral_druid" | "balance_druid";

export const fullRaidDruidBuildReferenceSchema = z
  .object({
    path: z
      .string()
      .max(350)
      .regex(
        /^artifacts\/forever-simulator\/optimization\/druid-statistics-correction-v1\/exports\/build-(?:feral|balance)-[a-f0-9]{16}\.json$/,
      ),
    sha256: digest,
    byteSha256: digest.optional(),
  })
  .strict();
export type FullRaidDruidBuildReference = z.infer<typeof fullRaidDruidBuildReferenceSchema>;

export const fullRaidDruidBuildEntrySchema = z.discriminatedUnion("id", [
  z
    .object({
      id: z.literal("feral-cat-static"),
      profile: z.literal("feral_druid"),
      build: fullRaidDruidBuildReferenceSchema,
      settingsSha256: digest,
      referenceDps: z.number().finite().positive(),
      validationIterations: samples,
    })
    .strict(),
  z
    .object({
      id: z.literal("balance-static"),
      profile: z.literal("balance_druid"),
      build: fullRaidDruidBuildReferenceSchema,
      settingsSha256: digest,
      referenceDps: z.number().finite().positive(),
      validationIterations: samples,
    })
    .strict(),
]);
export type FullRaidDruidBuildEntry = z.infer<typeof fullRaidDruidBuildEntrySchema>;

export const fullRaidDruidBuildPinsSchema = z
  .object({
    correctionByteSha256: digest,
    confirmationByteSha256: digest,
    supervisorRunSha256: digest,
    builds: z.object({ "feral-cat-static": digest, "balance-static": digest }).strict(),
  })
  .strict();
export type FullRaidDruidBuildPins = z.infer<typeof fullRaidDruidBuildPinsSchema>;

const binding = z
  .object({
    index: z.number().int().nonnegative(),
    actionSha256: digest,
    text: z.string().min(1),
  })
  .strict();
const equipment = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.number().int().safe().nonnegative().optional(),
            enchant: z.number().int().safe().nonnegative().optional(),
          })
          .passthrough(),
      )
      .length(17)
      .refine(
        (items): boolean =>
          items.every(
            (item, index): boolean => Boolean(item.id) || (index === 15 && !item.enchant),
          ),
        "Only the off-hand equipment slot may be empty",
      ),
  })
  .passthrough();
const settings = z
  .object({
    player: z
      .object({
        class: z.literal("ClassDruid"),
        race: z.literal("RaceNightElf"),
        level: z.literal(60),
        equipment,
        talentsString: z
          .string()
          .min(1)
          .regex(/^[0-5]*(?:-[0-5]*){0,2}$/),
        consumes: record,
        profession1: z.literal("Engineering"),
        profession2: z.union([z.literal("Leatherworking"), z.literal("Tailoring")]),
        distanceFromTarget: z.union([z.literal(5), z.literal(30)]),
        inFrontOfTarget: z.literal(false).optional(),
        foreverTier1Bonuses: z.literal(false).optional(),
        enableItemSwap: z.literal(false).optional(),
        feralDruid: record.optional(),
        balanceDruid: record.optional(),
        rotation: z
          .object({
            type: z.literal("TypeAPL"),
            priorityList: z.array(record).min(1),
            prepullActions: z.array(record).optional(),
          })
          .strict(),
      })
      .passthrough(),
    encounter: z
      .object({
        duration: z.literal(300),
        targets: z
          .array(
            z
              .object({ level: z.literal(63), mobType: z.literal("MobTypeDragonkin") })
              .passthrough(),
          )
          .length(1),
      })
      .passthrough(),
    settings: z
      .object({ faction: z.literal("Alliance"), ruleset: z.literal("RulesetForever") })
      .passthrough(),
    raidBuffs: record,
    partyBuffs: record,
    debuffs: record,
  })
  .passthrough();
const coverage = z
  .object({
    retainedStateFinalists: z.number().int().nonnegative(),
    retainedGearFinalists: z.number().int().positive(),
    retainedConsumeFinalists: z.number().int().nonnegative(),
    sourceOrigins: z.number().int().positive(),
    effectiveArms: z.number().int().positive(),
    aliases: z.number().int().nonnegative(),
    everyRetainedFinalistIncluded: z.literal(true),
    inventedCrossContextCombinations: z.literal(false),
    pendingInspectionAlignments: z.literal(0),
  })
  .strict();
const correctionReference = z
  .object({
    path: z.literal(base + "/completed.json"),
    byteSha256: digest,
    sha256: digest.optional(),
  })
  .strict();
const confirmationReference = z
  .object({
    path: z.literal(base + "/confirmation-completed.json"),
    byteSha256: digest,
    sha256: digest.optional(),
  })
  .strict();

export const fullRaidDruidBuildSchema = z
  .object({
    schema: z.literal("kfc-druid-statistics-full-raid-simulator-build.v1"),
    status: z.literal("reviewed-source-awaiting-browser-delivery"),
    id: z.enum(ids),
    profile: z.enum(["feral_druid", "balance_druid"]),
    variant: z.enum(["feral", "balance"]),
    name: z.string().min(1),
    sourceRelease: z.literal(fullRaidDruidStatisticsModel.sourceRelease),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    dbSha256: z.literal(fullRaidDruidStatisticsModel.databaseSha256),
    nativeBinarySha256: z.literal(fullRaidDruidStatisticsModel.nativeBinarySha256),
    wasmSha256: z.literal(fullRaidDruidStatisticsModel.wasmSha256),
    faction: z.literal("Alliance"),
    referenceDps: z.number().finite().positive(),
    validationIterations: samples,
    largestConservativeRetainedGapFraction: z.number().finite().nonnegative().max(0.02),
    approvedTwoPercentAccepted: z.literal(true),
    originalOnePercentAccepted: z.boolean(),
    settingsSha256: digest,
    settings,
    state: z
      .object({
        talentsString: z.string().min(1),
        rotationPolicy: record,
        conjured: z.enum(["tea", "rune"]),
      })
      .strict(),
    enchantPolicy: z.object({ provisionalEffectIds: z.array(z.never()).length(0) }).passthrough(),
    requiresProvisionalEnchantOptIn: z.literal(false),
    raidBuffPolicy: z
      .object({
        schema: z.literal("kfc-owner-requested-full-raid-buffs.v2"),
        version: z.literal("full-v2"),
        publicationAllowed: z.literal(false),
      })
      .passthrough(),
    rotationGuidance: z
      .object({
        schema: z.literal("kfc-druid-full-raid-rotation-guidance.v1"),
        caseId: z.enum(ids),
        variant: z.enum(["feral", "balance"]),
        sourceRequestKey: digest,
        sourceSettingsSha256: digest,
        stateSha256: digest,
        rotationSha256: digest,
        consumesSha256: digest,
        talents: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{1,2}$/),
        conjured: z.enum(["tea", "rune"]),
        selectedConsumes: record,
        consumeSummary: z
          .object({
            conjured: z.string().min(1),
            manaRegeneration: z.string().min(1),
            weaponEnhancement: z.string().min(1),
            potion: z.string().min(1),
          })
          .strict(),
        scenario: z.string().min(1),
        instruction: z.string().min(1),
        prepull: z.array(z.string().min(1)),
        prepullBindings: z.array(binding),
        priorities: z.array(z.string().min(1)).min(1),
        priorityBindings: z.array(binding).min(1),
        caveats: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    evidence: z
      .object({
        correction: correctionReference,
        confirmation: confirmationReference,
        independentReplay: z
          .object({
            completeSemanticReplayVerified: z.literal(true),
            nativeJobs: z.literal(0),
            browserJobs: z.literal(0),
          })
          .passthrough(),
        supervisor: z
          .object({
            runId: z.literal("3f73fc83-cd96-40fd-aef0-8aca6e36fecf"),
            runSha256: digest,
            commandSha256: z.literal(
              "5cce987dd7b4806391768b2f62b6c64160a12d6eaeb1acf4328e6d95b6e9f99f",
            ),
            startedAt: z.literal("2026-10-24T23:25:34.014Z"),
            deadlineAt: z.literal("2026-10-25T23:25:34.014Z"),
          })
          .strict(),
        selectedEffectiveInputKey: digest,
        rawBrowserWire: z
          .object({
            resultSha256: digest,
            completeUnitWireVerified: z.literal(true),
            admissionWireVerified: z.literal(true),
          })
          .passthrough(),
      })
      .passthrough(),
    scope: z
      .object({
        name: z.literal("bounded-full-raid-fixed-primary-druid-statistics.v1"),
        primaryFrozenBeforeConfirmation: z.literal(true),
        completeIndependentSourceReview: z.literal(true),
        nativeWasmControlVerified: z.literal(true),
        freshConfirmationCoverage: coverage,
        globalOptimalityProven: z.literal(false),
        simultaneousConfidenceClaimed: z.literal(false),
        liveServerProcRatesQualified: z.literal(false),
        bossDebuffOverflowQualified: z.literal(false),
        selectionChanged: z.literal(false),
      })
      .strict(),
    warnings: z.array(z.string().min(1)).min(1),
    browserHandoffRequired: z.literal(true),
    publicationAllowed: z.literal(false),
  })
  .passthrough();
export type ReviewedFullRaidDruidBuild = z.infer<typeof fullRaidDruidBuildSchema>;
