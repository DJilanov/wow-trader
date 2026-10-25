import { createHash } from "node:crypto";
import { z } from "zod";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  record = z.record(z.string(), z.unknown());
const buildIds = ["rogue-combat-static", "rogue-mutilate-static", "rogue-subtlety-static"] as const;

export const verifiedFullRaidRogueDelivery = Object.freeze({
  sourceRelease: "db33442499b7f5caaaaabf0c",
  databaseSha256: "9da36b4c8b5f15b255ee9b0be8d5132cb023b729c1c1bb486e0659951d3c0105",
  nativeBinarySha256: "f4a3a747be1c0813655d0de9eb457ae25d9f6417f2abec2d05c5e19160a5b44f",
  wasmSha256: "3ac092a8144f3abf9246f1da4ab3311545f775f00a206cbc5b3ec3e080b5e343",
  sourceAuditSha256: "9401b0609179b1145b11850829ba5565f3281cfd72623defa3361a8d0aa48fb4",
  builds: Object.freeze({
    "rogue-combat-static": Object.freeze({
      variant: "combat",
      sha256: "d9df4566ded6328877556170db15ea4ec1323a1070e13e3f981aca3f7590eb74",
    }),
    "rogue-mutilate-static": Object.freeze({
      variant: "mutilate",
      sha256: "b53f24b270b4308d01f695af4449f75e0ac20bea56d99eeeaf4dcc22ecb53b19",
    }),
    "rogue-subtlety-static": Object.freeze({
      variant: "subtlety",
      sha256: "9f6fb1f67c0d1c136a8f90f8225b3d653b2c348cf7e10cd169ec47f2ff361d2b",
    }),
  }),
});

export const fullRaidRogueEvidenceReferenceSchema = z
  .object({
    path: z
      .string()
      .max(300)
      .refine((path: string): boolean =>
        /^artifacts\/forever-simulator\/optimization\/rogue-full-raid-v2\/[a-z0-9-]+\.json$/.test(
          path,
        ),
      ),
    sha256: digest,
    byteSha256: digest.optional(),
  })
  .strict();
export type FullRaidRogueEvidenceReference = z.infer<typeof fullRaidRogueEvidenceReferenceSchema>;

export const fullRaidRogueBuildEntrySchema = z
  .object({
    id: z.enum(buildIds),
    profile: z.literal("rogue"),
    build: fullRaidRogueEvidenceReferenceSchema,
    settingsSha256: digest,
    referenceDps: z.number().finite().positive(),
    validationIterations: z.literal(40000),
  })
  .strict();
export type FullRaidRogueBuildEntry = z.infer<typeof fullRaidRogueBuildEntrySchema>;

const binding = z
    .object({
      index: z.number().int().nonnegative(),
      actionSha256: digest,
      text: z.string().min(1),
    })
    .strict(),
  settingsSchema = z
    .object({
      player: z
        .object({
          class: z.literal("ClassRogue"),
          race: z.string().min(1),
          talentsString: z.string().min(1),
          equipment: z
            .object({
              items: z
                .array(
                  z
                    .object({
                      id: z.number().int().positive(),
                      enchant: z.number().int().positive().optional(),
                    })
                    .passthrough(),
                )
                .length(17),
            })
            .passthrough(),
          consumes: record,
          profession1: z.literal("Engineering"),
          profession2: z.literal("Leatherworking"),
          rogue: z
            .object({
              options: z
                .object({ mainHandPoison: z.string(), offHandPoison: z.string() })
                .passthrough(),
            })
            .passthrough(),
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
          targets: z.array(z.object({ level: z.literal(63) }).passthrough()).length(1),
        })
        .passthrough(),
      settings: z
        .object({ faction: z.literal("Alliance"), ruleset: z.literal("RulesetForever") })
        .passthrough(),
      raidBuffs: record,
      partyBuffs: record,
      debuffs: record,
    })
    .passthrough(),
  buildSchema = z
    .object({
      schema: z.literal("kfc-rogue-full-raid-simulator-build.v1"),
      status: z.literal("reviewed-source-awaiting-browser-delivery"),
      id: z.enum(buildIds),
      profile: z.literal("rogue"),
      variant: z.enum(["combat", "mutilate", "subtlety"]),
      style: z.string().min(1),
      name: z.string().min(1),
      sourceRelease: z.literal(verifiedFullRaidRogueDelivery.sourceRelease),
      revision: z.string().min(1),
      dbSha256: z.literal(verifiedFullRaidRogueDelivery.databaseSha256),
      nativeBinarySha256: z.literal(verifiedFullRaidRogueDelivery.nativeBinarySha256),
      wasmSha256: z.literal(verifiedFullRaidRogueDelivery.wasmSha256),
      referenceDps: z.number().finite().positive(),
      validationIterations: z.literal(40000),
      largestConservativeRetainedGapFraction: z.number().finite().nonnegative().max(0.01),
      approvedTwoPercentAccepted: z.literal(true),
      originalOnePercentAccepted: z.literal(true),
      settingsSha256: digest,
      settings: settingsSchema,
      requiresProvisionalEnchantOptIn: z.literal(false),
      enchantPolicy: z.object({ provisionalEffectIds: z.array(z.never()).length(0) }).passthrough(),
      rotationGuidance: z
        .object({
          schema: z.literal("kfc-rogue-full-raid-rotation-guidance.v1"),
          caseId: z.enum(buildIds),
          rotationSha256: digest,
          talents: z.array(z.number().int().nonnegative().max(51)).length(3),
          poisons: z.object({ mainHandPoison: z.string(), offHandPoison: z.string() }).strict(),
          scenario: z.string().min(1),
          instruction: z.string().min(1),
          priorities: z.array(z.string().min(1)).min(1),
          priorityBindings: z.array(binding).min(1),
          prepull: z.array(z.string().min(1)),
          prepullBindings: z
            .array(binding.extend({ secondsBeforePull: z.number().finite().positive() }))
            .max(1),
          caveats: z.array(z.string().min(1)).min(1),
        })
        .strict(),
      evidence: z
        .object({
          sourceAudit: fullRaidRogueEvidenceReferenceSchema.extend({
            sha256: z.literal(verifiedFullRaidRogueDelivery.sourceAuditSha256),
          }),
          rawBrowserWire: z
            .object({
              resultSha256: digest,
              completeUnitWireVerified: z.literal(true),
              admissionWireVerified: z.literal(true),
            })
            .strict(),
        })
        .passthrough(),
      scope: z
        .object({
          name: z.literal("bounded-full-raid-fixed-primary-rogue.v1"),
          primaryFrozenBeforeConfirmation: z.literal(true),
          allSixBuildersCompared: z.literal(true),
          completeIndependentSourceReview: z.literal(true),
          allCurrentModelRawEvidenceAuthenticated: z.literal(true),
          nativeWasmControlVerified: z.literal(true),
          globalOptimalityProven: z.literal(false),
          simultaneousConfidenceClaimed: z.literal(false),
          liveServerProcRatesQualified: z.literal(false),
          bossDebuffOverflowQualified: z.literal(false),
        })
        .strict(),
      warnings: z.array(z.string().min(1)).min(1),
      browserHandoffRequired: z.literal(true),
      publicationAllowed: z.literal(false),
    })
    .passthrough();

export type ReviewedFullRaidRogueBuild = z.infer<typeof buildSchema>;
export interface FullRaidRogueBuildOptions {
  readonly sourceRelease: string;
  readonly revision: string;
  readonly databaseSha256: string;
  readonly reference: (reference: FullRaidRogueEvidenceReference) => Promise<unknown>;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function assertReviewedBuild(value: unknown): asserts value is ReviewedFullRaidRogueBuild {
  // Keep the reviewed representation: schema parsing can reorder keys used by source hashes.
  buildSchema.parse(value);
}

/** Read only the three code-pinned, independently reviewed exports. This does not grant UI publication approval. */
export async function readReviewedFullRaidRogueBuild(
  rawEntry: unknown,
  options: FullRaidRogueBuildOptions,
): Promise<ReviewedFullRaidRogueBuild> {
  const entry = fullRaidRogueBuildEntrySchema.parse(rawEntry),
    trusted = verifiedFullRaidRogueDelivery.builds[entry.id];
  requireMatch(
    entry.build.sha256 === trusted.sha256 &&
      entry.build.path ===
        `artifacts/forever-simulator/optimization/rogue-full-raid-v2/build-${trusted.variant}-${trusted.sha256.slice(0, 16)}.json`,
    "Rogue build is not one of the independently reviewed primaries",
  );
  const rawBuild = await options.reference(entry.build);
  requireMatch(hash(rawBuild) === trusted.sha256, "Reviewed Rogue build checksum changed");
  assertReviewedBuild(rawBuild);
  const build = rawBuild;
  requireMatch(
    build.id === entry.id &&
      build.variant === trusted.variant &&
      build.sourceRelease === options.sourceRelease &&
      build.revision === options.revision &&
      build.dbSha256 === options.databaseSha256 &&
      hash(build.settings) === entry.settingsSha256 &&
      build.settingsSha256 === entry.settingsSha256 &&
      build.referenceDps === entry.referenceDps,
    "Rogue entry lost its exact reviewed setup or model",
  );
  const guide = build.rotationGuidance,
    rotation = build.settings.player.rotation;
  requireMatch(
    guide.caseId === build.id &&
      guide.rotationSha256 === hash(rotation) &&
      guide.talents.reduce((total: number, points: number): number => total + points, 0) === 51 &&
      hash(guide.poisons) === hash(build.settings.player.rogue.options),
    "Rogue guide lost its reviewed policy",
  );
  const expectedPrepull = build.variant === "combat" ? 1 : 0;
  requireMatch(
    guide.prepull.length === expectedPrepull && guide.prepullBindings.length === expectedPrepull,
    "Rogue pre-pull instructions changed",
  );
  for (const [bindings, entries, texts] of [
    [guide.priorityBindings, rotation.priorityList, guide.priorities],
    [guide.prepullBindings, rotation.prepullActions ?? [], guide.prepull],
  ] as const) {
    requireMatch(
      bindings.length === entries.length && texts.length === entries.length,
      "Rogue guide dropped an action",
    );
    bindings.forEach((item, index): void =>
      requireMatch(
        item.index === index &&
          item.actionSha256 === hash(entries[index]) &&
          item.text === texts[index],
        "Rogue guide action binding changed",
      ),
    );
  }
  return build;
}
