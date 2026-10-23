import { z } from "zod";
import { FOREVER_CLASS_APPEARANCES } from "./forever-classes";
import { relativeTier, type TierBand } from "./forever-tier-ranking";

export type TankTierScenario = "solo" | "raid";
export type TankTierMetric = "threat" | "dtps";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const metric = z
  .object({ avg: z.number().finite().positive(), stdev: z.number().finite().nonnegative() })
  .strict();
const entrySchema = z
  .object({
    id: z.enum(["tank-warrior", "feral-tank-druid"]),
    profile: z.enum(["tank_warrior", "feral_tank_druid"]),
    release,
    metrics: z.object({ threat: metric, dtps: metric, dps: metric }).strict(),
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

export const tankTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-tank-tier-list.v1"),
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
    entries: z.array(entrySchema).length(2),
    unranked: z
      .array(
        z
          .object({
            profile: z.literal("protection_paladin"),
            name: z.literal("Protection Paladin"),
            reason: z.string().min(1),
            source: z.literal(
              "https://worldofwarcraft.blizzard.com/en-gb/news/24302099/world-of-warcraft-forever-class-deep-dives-paladin",
            ),
          })
          .strict(),
      )
      .length(1),
  })
  .strict()
  .superRefine((snapshot, context): void => {
    if (new Set(snapshot.entries.map((entry): string => entry.profile)).size !== 2)
      context.addIssue({ code: "custom", message: "Duplicate tank profile" });
    for (const entry of snapshot.entries) {
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
export type TankTierSnapshot = z.infer<typeof tankTierSnapshotSchema>;
export type TankTierMeasurement = TankTierSnapshot["entries"][number];
export interface TankTierEntry extends TankTierMeasurement {
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
}

export function rankTankTierEntries(
  snapshot: TankTierSnapshot,
  selectedMetric: TankTierMetric = "threat",
): readonly TankTierEntry[] {
  const direction = selectedMetric === "dtps" ? 1 : -1;
  const sorted = [...snapshot.entries].sort(
    (left, right): number =>
      direction * (left.metrics[selectedMetric].avg - right.metrics[selectedMetric].avg) ||
      left.id.localeCompare(right.id),
  );
  const leader = sorted[0]?.metrics[selectedMetric].avg ?? 1;
  return sorted.map((entry, index): TankTierEntry => {
    const warrior = entry.profile === "tank_warrior";
    const appearance = FOREVER_CLASS_APPEARANCES.find(
      (row): boolean => row.slug === (warrior ? "warrior" : "druid"),
    );
    if (!appearance) throw new Error("Unknown tank class");
    const value = entry.metrics[selectedMetric];
    const next = sorted[index + 1]?.metrics[selectedMetric];
    const share = 100 * (selectedMetric === "dtps" ? leader / value.avg : value.avg / leader);
    return {
      ...entry,
      title: warrior ? "Protection" : "Feral Bear",
      className: appearance.name,
      classSlug: appearance.slug,
      color: appearance.color,
      specIcon: warrior
        ? "/wow-assets/tank-icons/protection-warrior.jpg"
        : "/wow-assets/tank-icons/feral-bear.jpg",
      classIcon: `/wow-assets/simulation-icons/class_${appearance.slug}.jpg`,
      simulatorHref: `/forever/simulator/${entry.id}`,
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
