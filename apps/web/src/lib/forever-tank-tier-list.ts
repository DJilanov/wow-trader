import { z } from "zod";
import { FOREVER_CLASS_APPEARANCES } from "./forever-classes";
import { relativeTier, type TierBand } from "./forever-tier-ranking";
import { tierSourceBindingsSchema } from "./forever-tier-source-contract";

export type TankTierScenario = "solo" | "raid";
export type TankTierMetric = "threat" | "dtps";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const entrySchema = z
  .object({
    id: z.enum(["tank-warrior", "feral-tank-druid", "protection-paladin"]),
    profile: z.enum(["tank_warrior", "feral_tank_druid", "protection_paladin"]),
    release,
    metrics: z.object({ threat: metric, dtps: metric, dps: metric }).strict(),
    threatBreakdown: z
      .array(
        z
          .object({
            key: z.string().regex(/^(spell|item|other):[A-Za-z0-9]+$/),
            name: z.string().min(1).max(300),
            damagePerSecond: z.number().finite().nonnegative(),
            threatPerSecond: z.number().finite(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    iterations: z.literal(5000),
    talents: z.string().regex(/^[0-5]*-[0-5]*-[0-5]*$/),
    race: z.string().regex(/^Race[A-Za-z]+$/),
    manifestSha256: digest,
    wasmSha256: digest,
    databaseSha256: digest,
    starterSha256: digest,
    requestSha256: digest,
    responseSha256: digest,
    benchmarkHref: z.string().max(20000),
    capturedAt: z.iso.datetime(),
  })
  .strict();

const legacyTankTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-tank-tier-list.v2"),
    policySha256: digest,
    supportSha256: digest,
    approvedSelection: z
      .object({ activeManifestSha256: digest, modelSelectionSha256: digest })
      .strict(),
    policy: z
      .object({
        version: z.literal("blue-pvp-tank-comparison-v1"),
        scenario: z.enum(["solo", "raid"]),
        iterations: z.literal(5000),
        seed: z.literal(61723001),
        durationSeconds: z.union([z.literal(60), z.literal(300)]),
        targetCount: z.union([z.literal(1), z.literal(3)]),
        targetLevel: z.union([z.literal(62), z.literal(63)]),
        minBaseDamage: z.union([z.literal(1200), z.literal(3000)]),
        swingSpeed: z.literal(2),
        damageSpread: z.literal(0.3333),
        armor: z.literal(3731),
        healing: z
          .object({ hps: z.literal(2000), cadenceSeconds: z.literal(2), burstWindow: z.literal(6) })
          .strict(),
        equipment: z.string(),
        incomingDamage: z.string(),
        support: z.string(),
      })
      .strict(),
    entries: z.array(entrySchema).length(3),
  })
  .strict()
  .superRefine((snapshot, context): void => {
    if (new Set(snapshot.entries.map((entry): string => entry.profile)).size !== 3)
      context.addIssue({ code: "custom", message: "Duplicate tank profile" });
    for (const entry of snapshot.entries) {
      if (
        new Set(entry.threatBreakdown.map((row): string => row.key)).size !==
        entry.threatBreakdown.length
      )
        context.addIssue({ code: "custom", message: "Duplicate threat action" });
      for (const [field, metricName] of [
        ["damagePerSecond", "dps"],
        ["threatPerSecond", "threat"],
      ] as const) {
        if (
          Math.abs(
            entry.threatBreakdown.reduce((sum, row): number => sum + row[field], 0) -
              entry.metrics[metricName].avg,
          ) > 0.000001
        )
          context.addIssue({
            code: "custom",
            message: "Threat actions do not reconcile with measured totals",
          });
      }
      if (
        entry.id !== entry.profile.replaceAll("_", "-") ||
        !entry.benchmarkHref.startsWith(
          `/forever-sim/${entry.release}/${entry.profile}/?i=gtrcmxeu#`,
        ) ||
        !/^#[A-Za-z0-9+/]+=*$/.test(entry.benchmarkHref.slice(entry.benchmarkHref.indexOf("#")))
      )
        context.addIssue({ code: "custom", message: "Invalid tank simulator import" });
    }
    const raid = snapshot.policy.scenario === "raid";
    if (
      snapshot.policy.durationSeconds !== (raid ? 300 : 60) ||
      snapshot.policy.targetCount !== (raid ? 1 : 3) ||
      snapshot.policy.targetLevel !== (raid ? 63 : 62) ||
      snapshot.policy.minBaseDamage !== (raid ? 3000 : 1200)
    )
      context.addIssue({ code: "custom", message: "Tank scenario and encounter disagree" });
  });
const optimizedEntrySchema = entrySchema
  .omit({ starterSha256: true, requestSha256: true, responseSha256: true })
  .extend({
    iterations: z.literal(40000),
    benchmarkHref: z.string().max(200000),
    objective: z.enum(["threat", "mitigation"]),
    health: z.number().finite().positive(),
    armor: z.number().finite().positive(),
    proofSha256: digest,
    sourceFingerprint: digest,
    sourceMeasurementsSha256: digest,
    settingsSha256: digest,
    gear: z
      .array(
        z
          .object({
            slot: z.number().int().min(0).max(16),
            id: z.number().int().nonnegative(),
            name: z.string().min(1).max(300),
            enchant: z.string().min(1).max(300).nullable(),
            provisionalSource: z.boolean(),
          })
          .strict(),
      )
      .length(17),
    warnings: z.array(z.string().min(1).max(4000)).max(20),
  })
  .strict();
const optimizedTankTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-tank-tier-list.v3"),
    policySha256: digest,
    supportSha256: digest,
    approvedSelection: z.object({ selectionSha256: digest, engine: digest }).strict(),
    policy: legacyTankTierSnapshotSchema.shape.policy
      .omit({ seed: true })
      .extend({
        version: z.literal("optimized-pre-raid-tank-comparison-v1"),
        iterations: z.literal(40000),
        seeds: z.tuple([z.literal(81491001), z.literal(82491001)]),
      })
      .strict(),
    entries: z.array(optimizedEntrySchema).length(6),
  })
  .strict()
  .superRefine((snapshot, context): void => {
    if (
      new Set(snapshot.entries.map((entry): string => `${entry.profile}:${entry.objective}`))
        .size !== 6
    )
      context.addIssue({ code: "custom", message: "Duplicate optimized tank objective" });
    for (const entry of snapshot.entries) {
      if (new Set(entry.gear.map((item): number => item.slot)).size !== 17)
        context.addIssue({ code: "custom", message: "Duplicate optimized gear slot" });
      if (
        entry.id !== entry.profile.replaceAll("_", "-") ||
        !entry.benchmarkHref.startsWith(
          `/forever-sim/${entry.release}/${entry.profile}/?i=gtrcmxeu#`,
        ) ||
        !/^#[A-Za-z0-9+/]+=*$/.test(entry.benchmarkHref.slice(entry.benchmarkHref.indexOf("#")))
      )
        context.addIssue({ code: "custom", message: "Invalid optimized tank simulator import" });
      if (
        new Set(entry.threatBreakdown.map((row): string => row.key)).size !==
        entry.threatBreakdown.length
      )
        context.addIssue({ code: "custom", message: "Duplicate optimized threat action" });
      for (const [field, metricName] of [
        ["damagePerSecond", "dps"],
        ["threatPerSecond", "threat"],
      ] as const)
        if (
          Math.abs(
            entry.threatBreakdown.reduce((sum, row): number => sum + row[field], 0) -
              entry.metrics[metricName].avg,
          ) > 0.000001
        )
          context.addIssue({
            code: "custom",
            message: "Optimized actions do not reconcile with measured totals",
          });
    }
    const raid = snapshot.policy.scenario === "raid";
    if (
      snapshot.policy.durationSeconds !== (raid ? 300 : 60) ||
      snapshot.policy.targetCount !== (raid ? 1 : 3) ||
      snapshot.policy.targetLevel !== (raid ? 63 : 62) ||
      snapshot.policy.minBaseDamage !== (raid ? 3000 : 1200)
    )
      context.addIssue({ code: "custom", message: "Optimized scenario and encounter disagree" });
  });
const currentTankTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-tank-tier-list.v4"),
    sourceBindings: tierSourceBindingsSchema,
    policySha256: digest,
    supportSha256: digest,
    policy: legacyTankTierSnapshotSchema.shape.policy
      .omit({ seed: true })
      .extend({
        version: z.literal("current-pre-raid-tank-comparison-v1"),
        seeds: z.tuple([z.literal(61723001)]),
      })
      .strict(),
    entries: z
      .array(
        optimizedEntrySchema
          .omit({ sourceFingerprint: true, sourceMeasurementsSha256: true })
          .extend({ iterations: z.literal(5000) }),
      )
      .length(6),
  })
  .strict()
  .superRefine((snapshot, context): void => {
    if (new Set(snapshot.entries.map((entry) => `${entry.profile}:${entry.objective}`)).size !== 6)
      context.addIssue({ code: "custom", message: "Duplicate current tank objective" });
    for (const entry of snapshot.entries) {
      if (
        entry.id !== entry.profile.replaceAll("_", "-") ||
        !entry.benchmarkHref.startsWith(
          `/forever-sim/${entry.release}/${entry.profile}/?i=gtrcmxeu#`,
        ) ||
        !/^#[A-Za-z0-9+/]+=*$/.test(entry.benchmarkHref.slice(entry.benchmarkHref.indexOf("#")))
      )
        context.addIssue({ code: "custom", message: "Invalid current tank import" });
      if (new Set(entry.gear.map((item) => item.slot)).size !== 17)
        context.addIssue({ code: "custom", message: "Duplicate current tank gear slot" });
      for (const [field, metricName] of [
        ["damagePerSecond", "dps"],
        ["threatPerSecond", "threat"],
      ] as const)
        if (
          Math.abs(
            entry.threatBreakdown.reduce((sum, row) => sum + row[field], 0) -
              entry.metrics[metricName].avg,
          ) > 1e-6
        )
          context.addIssue({ code: "custom", message: "Current tank actions do not reconcile" });
    }
  });
export const tankTierSnapshotSchema = z.discriminatedUnion("schema", [
  legacyTankTierSnapshotSchema,
  optimizedTankTierSnapshotSchema,
  currentTankTierSnapshotSchema,
]);
export type TankTierSnapshot = z.infer<typeof tankTierSnapshotSchema>;
export type OptimizedTankTierSnapshot = z.infer<typeof optimizedTankTierSnapshotSchema>;
export type TankTierMeasurement = TankTierSnapshot["entries"][number];
export type TankTierEntry = TankTierMeasurement & {
  readonly title: string;
  readonly className: string;
  readonly classSlug: string;
  readonly color: string;
  readonly specIcon: string;
  readonly classIcon: string;
  readonly simulatorHref: string;
  readonly rank: number;
  readonly tier: TierBand;
  readonly share: number;
  readonly uncertainty95: number;
  readonly closeToNext: boolean;
};

export function rankTankTierEntries(
  snapshot: TankTierSnapshot,
  selectedMetric: TankTierMetric = "threat",
): readonly TankTierEntry[] {
  const direction = selectedMetric === "dtps" ? 1 : -1;
  const objective = selectedMetric === "threat" ? "threat" : "mitigation";
  const sorted = snapshot.entries
    .filter((entry): boolean => !("objective" in entry) || entry.objective === objective)
    .sort(
      (left, right): number =>
        direction * (left.metrics[selectedMetric].avg - right.metrics[selectedMetric].avg) ||
        left.id.localeCompare(right.id),
    );
  const leader = sorted[0]?.metrics[selectedMetric].avg ?? 1;
  return sorted.map((entry, index): TankTierEntry => {
    const identity = {
      tank_warrior: { classSlug: "warrior", title: "Protection", icon: "protection-warrior" },
      feral_tank_druid: { classSlug: "druid", title: "Feral Bear", icon: "feral-bear" },
      protection_paladin: { classSlug: "paladin", title: "Protection", icon: "protection-paladin" },
    }[entry.profile];
    const appearance = FOREVER_CLASS_APPEARANCES.find(
      (row): boolean => row.slug === identity.classSlug,
    );
    if (!appearance) throw new Error("Unknown tank class");
    const value = entry.metrics[selectedMetric];
    const next = sorted[index + 1]?.metrics[selectedMetric];
    const share = 100 * (selectedMetric === "dtps" ? leader / value.avg : value.avg / leader);
    return {
      ...entry,
      title: identity.title,
      className: appearance.name,
      classSlug: appearance.slug,
      color: appearance.color,
      specIcon: `/wow-assets/tank-icons/${identity.icon}.jpg`,
      classIcon: `/wow-assets/simulation-icons/class_${appearance.slug}.jpg`,
      simulatorHref: `/forever/simulator/${entry.id}${"objective" in entry ? `?build=${entry.id}-${snapshot.policy.scenario}-${entry.objective}` : ""}`,
      rank: index + 1,
      tier: relativeTier(share),
      share,
      uncertainty95: (1.96 * value.stdev) / Math.sqrt(entry.iterations),
      closeToNext: Boolean(
        next &&
        Math.abs(value.avg - next.avg) <=
          1.96 *
            Math.sqrt(value.stdev ** 2 / entry.iterations + next.stdev ** 2 / entry.iterations),
      ),
    };
  });
}
