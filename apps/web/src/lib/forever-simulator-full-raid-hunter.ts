import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.record(z.string(), z.unknown());
const ids = [
  "hunter-beast-mastery-static",
  "hunter-marksmanship-static",
  "hunter-survival-static",
] as const;
const petType = z.enum(["PetNone", "Cat", "Raptor", "WindSerpent", "CarrionBird", "Scorpid"]);
const samples = z.number().int().safe().min(40000).multipleOf(40000);

export const verifiedFullRaidHunterDelivery = Object.freeze({
  sourceRelease: "50df0df3d3d0124bb3b14791",
  databaseSha256: "0c952cdc3f6b279893da2074eda8981b5a2338f7af7fa06266e4d0b476541c7a",
  nativeBinarySha256: "22c5d84a4045d5fd590d5021517d00d7ba30a7cf3d81c9eb538720e1e45e91bf",
  wasmSha256: "918d135678846921ddc3fed1265e9d26ae932f5fd96cac33094ebba1cbb63c23",
  confirmationSha256: "768880fa13b3dc2615a9b47cd82562d80d2cecb78062632a3108ccd71c969c76",
  builds: Object.freeze({
    "hunter-beast-mastery-static": Object.freeze({
      variant: "beast_mastery",
      sha256: "b39a723ef0ce8aa2b5d28721aa1d4545ae732ddb67ba01e4e793478c0efc2c51",
    }),
    "hunter-marksmanship-static": Object.freeze({
      variant: "marksmanship",
      sha256: "8627d7c40c6134f397df79344e13d97a531850b381b8a776bd9103adc9791445",
    }),
    "hunter-survival-static": Object.freeze({
      variant: "survival",
      sha256: "62073a3f89cdf00e90b0f53b3fa1769e4d22b8f366ba342f1d466637eedf9e53",
    }),
  }),
});

export const fullRaidHunterEvidenceReferenceSchema = z
  .object({
    path: z
      .string()
      .max(350)
      .regex(
        /^artifacts\/forever-simulator\/optimization\/hunter-full-raid-v2\/[a-z0-9_-]+\.json$/,
      ),
    sha256: digest,
    byteSha256: digest.optional(),
  })
  .strict();
export type FullRaidHunterEvidenceReference = z.infer<typeof fullRaidHunterEvidenceReferenceSchema>;

export const fullRaidHunterBuildEntrySchema = z
  .object({
    id: z.enum(ids),
    profile: z.literal("hunter"),
    build: fullRaidHunterEvidenceReferenceSchema,
    settingsSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: samples,
  })
  .strict();
export type FullRaidHunterBuildEntry = z.infer<typeof fullRaidHunterBuildEntrySchema>;

const binding = z
  .object({ index: z.number().int().nonnegative(), actionSha256: digest, text: z.string().min(1) })
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
const settingsSchema = z
  .object({
    player: z
      .object({
        class: z.literal("ClassHunter"),
        race: z.literal("RaceDwarf"),
        talentsString: z
          .string()
          .min(1)
          .regex(/^[0-5]*(?:-[0-5]*){0,2}$/),
        equipment,
        consumes: record,
        profession1: z.literal("Engineering"),
        profession2: z.literal("Leatherworking"),
        hunter: z
          .object({
            options: z
              .object({
                petType,
                ammo: z.enum(["ThoriumShells", "ThoriumHeadedArrow"]),
                petUptime: z.literal(1),
                petAttackSpeed: z.literal("OneTwo"),
                quiverBonus: z.literal("Speed15"),
              })
              .passthrough(),
          })
          .passthrough(),
        distanceFromTarget: z.union([z.literal(5), z.literal(12)]),
        rotation: z
          .object({
            type: z.literal("TypeAPL"),
            priorityList: z.array(record).min(1),
            prepullActions: z.array(record).optional(),
          })
          .strict(),
        foreverTier1Bonuses: z.literal(false).optional(),
        enableItemSwap: z.literal(false).optional(),
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
const buildSchema = z
  .object({
    schema: z.literal("kfc-hunter-full-raid-simulator-build.v1"),
    status: z.literal("reviewed-source-awaiting-browser-delivery"),
    id: z.enum(ids),
    profile: z.literal("hunter"),
    variant: z.enum(["beast_mastery", "marksmanship", "survival"]),
    name: z.string().min(1),
    sourceRelease: z.literal(verifiedFullRaidHunterDelivery.sourceRelease),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    dbSha256: z.literal(verifiedFullRaidHunterDelivery.databaseSha256),
    nativeBinarySha256: z.literal(verifiedFullRaidHunterDelivery.nativeBinarySha256),
    wasmSha256: z.literal(verifiedFullRaidHunterDelivery.wasmSha256),
    faction: z.literal("Alliance"),
    referenceDps: z.number().finite().positive(),
    validationIterations: samples,
    largestConservativeRetainedGapFraction: z.number().finite().nonnegative().max(0.02),
    approvedTwoPercentAccepted: z.literal(true),
    originalOnePercentAccepted: z.boolean(),
    settingsSha256: digest,
    settings: settingsSchema,
    state: z.object({ talentsString: z.string().min(1), rotationPolicy: record, petType }).strict(),
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
        schema: z.literal("kfc-hunter-full-raid-rotation-guidance.v1"),
        caseId: z.enum(ids),
        variant: z.enum(["beast_mastery", "marksmanship", "survival"]),
        sourceRequestKey: digest,
        sourceSettingsSha256: digest,
        stateSha256: digest,
        rotationSha256: digest,
        consumesSha256: digest,
        talents: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{1,2}$/),
        petType,
        petInstruction: z.string().min(1),
        selectedAmmo: z.string().min(1),
        selectedConsumes: record,
        manaRegeneration: z.string().min(1),
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
        confirmation: fullRaidHunterEvidenceReferenceSchema.extend({
          sha256: z.literal(verifiedFullRaidHunterDelivery.confirmationSha256),
        }),
        independentReplay: z
          .object({
            completeSemanticReplayVerified: z.literal(true),
            nativeJobs: z.literal(0),
            browserJobs: z.literal(0),
          })
          .passthrough(),
        supervisor: z
          .object({
            runId: z.literal("e0a863cb-6c80-4f2e-ab25-6760e1e09a3c"),
            runSha256: digest,
            commandSha256: z.literal(
              "7cc7cd4c60d407e545eba87a7ed0b388f08f4e1579f7e49390c96d416bfdcb86",
            ),
            startedAt: z.literal("2026-10-24T05:03:16.065Z"),
            deadlineAt: z.literal("2026-10-25T05:03:16.065Z"),
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
        name: z.literal("bounded-full-raid-fixed-primary-hunter.v1"),
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

export type ReviewedFullRaidHunterBuild = z.infer<typeof buildSchema>;
export interface FullRaidHunterBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: FullRaidHunterEvidenceReference) => Promise<unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function assertReviewedBuild(value: unknown): asserts value is ReviewedFullRaidHunterBuild {
  // Schema parsing can reorder keys used by evidence hashes; retain the original representation.
  buildSchema.parse(value);
}

/** Read the three code-pinned, independently replayed Hunter exports without granting UI publication approval. */
export async function readReviewedFullRaidHunterBuild(
  rawEntry: unknown,
  options: FullRaidHunterBuildOptions,
): Promise<ReviewedFullRaidHunterBuild> {
  const entry = fullRaidHunterBuildEntrySchema.parse(rawEntry),
    trusted = verifiedFullRaidHunterDelivery.builds[entry.id];
  requireMatch(
    entry.build.sha256 === trusted.sha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/hunter-full-raid-v2/build-${trusted.variant}-${trusted.sha256.slice(0, 16)}.json`,
    "Hunter build is not an independently reviewed primary",
  );
  const raw = await options.reference(entry.build);
  requireMatch(hash(raw) === trusted.sha256, "Reviewed Hunter build checksum changed");
  assertReviewedBuild(raw);
  const build = raw,
    player = build.settings.player,
    guide = build.rotationGuidance;
  requireMatch(
    build.id === entry.id &&
      build.variant === trusted.variant &&
      build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.settingsSha256 === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps &&
      build.validationIterations === entry.validationIterations,
    "Hunter entry lost its reviewed setup, samples or model",
  );
  requireMatch(
    guide.caseId === build.id &&
      guide.variant === build.variant &&
      guide.sourceSettingsSha256 === build.settingsSha256 &&
      guide.stateSha256 === hash(build.state) &&
      guide.consumesSha256 === hash(player.consumes) &&
      guide.rotationSha256 === hash(player.rotation) &&
      guide.sourceRequestKey === build.evidence.selectedEffectiveInputKey,
    "Hunter guidance lost its exact source binding",
  );
  const allocation = player.talentsString
    .split("-")
    .map((tree: string): number =>
      [...tree].reduce((sum: number, point: string): number => sum + Number(point), 0),
    );
  while (allocation.length < 3) allocation.push(0);
  requireMatch(
    allocation.reduce((sum: number, points: number): number => sum + points, 0) === 51 &&
      allocation.join("/") === guide.talents &&
      build.state.talentsString === player.talentsString,
    "Hunter talent instructions changed",
  );
  requireMatch(
    guide.petType === build.state.petType &&
      guide.petType === player.hunter.options.petType &&
      guide.selectedAmmo === player.hunter.options.ammo &&
      isDeepStrictEqual(guide.selectedConsumes, player.consumes) &&
      player.distanceFromTarget === (build.variant === "survival" ? 5 : 12),
    "Hunter pet, ammunition, consumes or range changed",
  );
  for (const [bindings, actions, texts] of [
    [guide.priorityBindings, player.rotation.priorityList, guide.priorities],
    [guide.prepullBindings, player.rotation.prepullActions ?? [], guide.prepull],
  ] as const) {
    requireMatch(
      bindings.length === actions.length && texts.length === actions.length,
      "Hunter guidance dropped an action",
    );
    bindings.forEach((item, index): void =>
      requireMatch(
        item.index === index &&
          item.actionSha256 === hash(actions[index]) &&
          item.text === texts[index],
        "Hunter guidance action binding changed",
      ),
    );
  }
  const retained = build.scope.freshConfirmationCoverage;
  requireMatch(
    retained.sourceOrigins ===
      retained.retainedStateFinalists +
        retained.retainedGearFinalists +
        retained.retainedConsumeFinalists +
        1 && retained.effectiveArms + retained.aliases === retained.sourceOrigins,
    "Hunter retained confirmation coverage changed",
  );
  return build;
}
