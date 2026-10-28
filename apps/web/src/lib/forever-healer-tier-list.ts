import { z } from "zod";
import { FOREVER_CLASS_APPEARANCES } from "./forever-classes";
import { tierSourceBindingsSchema } from "./forever-tier-source-contract";
import { relativeTier, type TierBand } from "./forever-tier-ranking";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonnegative = z.number().finite().nonnegative();
export const healerTierAssignmentSchema = z.enum(["tank", "group", "burst"]);
export type HealerTierAssignment = z.infer<typeof healerTierAssignmentSchema>;
const entrySchema = z
  .object({
    id: z.string().regex(/^healing-(priest|druid|shaman|paladin)-[a-f0-9]{16}$/),
    profile: z.enum(["healing-priest", "healing-druid", "healing-shaman", "healing-paladin"]),
    buildId: z.string().min(1).max(240),
    title: z.string().min(1).max(240),
    archetype: z.string().min(1).max(100),
    assignment: healerTierAssignmentSchema,
    release: z.string().regex(/^[a-f0-9]{24}$/),
    modelIdentity: digest,
    wasmSha256: digest,
    sourceWorkloadSha256: digest,
    demandSha256: digest,
    simulatorHref: z.string().min(1).max(18000),
    metrics: z
      .object({
        iterations: z.literal(512),
        hps: nonnegative,
        hpsStdev: nonnegative,
        effectiveHealingHps: nonnegative,
        absorbedHps: nonnegative,
        overhealingHps: nonnegative,
        survivalRate: nonnegative.max(1),
        manaRemainingMean: nonnegative,
        missingHealthSecondsMean: nonnegative,
        finalMissingHealthMean: nonnegative,
        manaBlockedSecondsMean: nonnegative,
        plannedIncomingPostMitigationDamage: nonnegative.positive(),
        deliveredIncomingDamageMean: nonnegative,
      })
      .strict(),
    proofs: z
      .array(
        z
          .object({ requestSha256: digest, responseSha256: digest, capturedAt: z.iso.datetime() })
          .strict(),
      )
      .length(2),
  })
  .strict();
export const healerTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-healer-tier-list.v1"),
    sourceBindings: tierSourceBindingsSchema,
    policy: z
      .object({
        version: z.literal("shared-three-minute-healing-v2"),
        durationSeconds: z.literal(180),
        iterationsPerSeed: z.literal(256),
        seeds: z.tuple([z.literal(58723001), z.literal(58723003)]),
        layout: z.literal("stacked"),
        recipients: z.literal(4),
        recipientMaximumHealth: z.literal(18000),
        tankDamagePerSecond: z.literal(800),
        groupDamagePerRecipientPerSecond: z.literal(200),
        burstDamagePerRecipient: z.literal(2500),
        burstIntervalSeconds: z.literal(15),
        support: z.string(),
        ranking: z.string(),
        selfDamageResources: z.literal("excluded"),
      })
      .strict(),
    policySha256: digest,
    capturedAt: z.iso.datetime(),
    entries: z.array(entrySchema).min(12).max(60),
  })
  .strict()
  .superRefine((snapshot, context): void => {
    if (new Set(snapshot.entries.map((entry) => entry.id)).size !== snapshot.entries.length)
      context.addIssue({ code: "custom", message: "Duplicate healer measurement" });
    for (const assignment of healerTierAssignmentSchema.options) {
      const entries = snapshot.entries.filter((entry) => entry.assignment === assignment);
      if (
        new Set(entries.map((entry) => entry.profile)).size !== 4 ||
        new Set(entries.map((entry) => entry.demandSha256)).size !== 1
      )
        context.addIssue({
          code: "custom",
          message: "Healer assignment coverage or shared workload differs",
        });
    }
    for (const entry of snapshot.entries) {
      if (
        !entry.simulatorHref.startsWith(
          `/forever/simulator/${entry.profile}?release=${entry.release}&build=`,
        )
      )
        context.addIssue({ code: "custom", message: "Healer build link differs from its profile" });
      const metrics = entry.metrics;
      if (
        Math.abs(metrics.hps - metrics.effectiveHealingHps - metrics.absorbedHps) > 1e-6 ||
        metrics.deliveredIncomingDamageMean > metrics.plannedIncomingPostMitigationDamage + 1e-6
      )
        context.addIssue({
          code: "custom",
          message: "Healer accounting differs from its measurements",
        });
      if (
        metrics.survivalRate === 1 &&
        Math.abs(
          metrics.hps * snapshot.policy.durationSeconds -
            metrics.deliveredIncomingDamageMean +
            metrics.finalMissingHealthMean,
        ) > 1e-5
      )
        context.addIssue({
          code: "custom",
          message: "Healer score includes damage outside the shared assignment",
        });
    }
  });
export type HealerTierSnapshot = z.infer<typeof healerTierSnapshotSchema>;
export interface HealerTierEntry extends z.infer<typeof entrySchema> {
  readonly className: string;
  readonly classSlug: string;
  readonly color: string;
  readonly classIcon: string;
  readonly specIcon: string;
  readonly rank: number;
  readonly share: number;
  readonly tier: TierBand;
  readonly survivalPassed: boolean;
  readonly uncertainty95: number;
}
const healerTitles: Readonly<Record<string, string>> = {
  "direct-healing-support": "Direct Healing",
  "vigil-support": "Vigil Support",
  "vigil-mobility": "Vigil Mobility",
  "riptide-support": "Riptide Support",
  "riptide-mobility": "Riptide Mobility",
  "mental-quickness-wave": "Mental Quickness / Wave",
};
export function rankHealerTierEntries(
  snapshot: HealerTierSnapshot,
  assignment: HealerTierAssignment,
): readonly HealerTierEntry[] {
  const entries = snapshot.entries
    .filter((entry) => entry.assignment === assignment)
    .sort((a, b): number => {
      const aPassed = a.metrics.survivalRate >= 0.99,
        bPassed = b.metrics.survivalRate >= 0.99;
      return (
        Number(bPassed) - Number(aPassed) ||
        (!aPassed && !bPassed ? b.metrics.survivalRate - a.metrics.survivalRate : 0) ||
        b.metrics.hps - a.metrics.hps ||
        a.id.localeCompare(b.id)
      );
    });
  const top = Math.max(...entries.map((entry) => entry.metrics.hps), 1);
  return entries.map((entry, index): HealerTierEntry => {
    const slug = entry.profile.replace("healing-", "");
    const appearance = FOREVER_CLASS_APPEARANCES.find((row) => row.slug === slug);
    if (!appearance) throw new Error("Unknown healer class");
    const share = (entry.metrics.hps / top) * 100,
      survivalPassed = entry.metrics.survivalRate >= 0.99;
    return {
      ...entry,
      title: healerTitles[entry.archetype] ?? entry.title,
      className: appearance.name,
      classSlug: slug,
      color: appearance.color,
      classIcon: `/wow-assets/simulation-icons/class_${slug}.jpg`,
      specIcon: `/wow-assets/simulation-icons/class_${slug}.jpg`,
      rank: index + 1,
      share,
      tier: survivalPassed ? relativeTier(share) : "D",
      survivalPassed,
      uncertainty95: (1.96 * entry.metrics.hpsStdev) / Math.sqrt(entry.metrics.iterations),
    };
  });
}
