import { SIMULATOR_SPECS } from "@wow-trader/forever-data/simulator";
import { z } from "zod";
import { FOREVER_CLASS_APPEARANCES } from "./forever-classes";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const release = z.string().regex(/^[a-f0-9]{24}$/);
const entrySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    profile: z.string(),
    spec: z.string(),
    name: z.string(),
    faction: z.string(),
    dps: z.number().finite().positive(),
    stdev: z.number().finite().nonnegative(),
    iterations: z.literal(5000),
    talents: z.string(),
    race: z.string(),
    release,
    revision: z.string(),
    databaseSha256: digest,
    wasmSha256: digest,
    publicationSha256: digest,
    originalHrefSha256: digest,
    requestSha256: digest,
    responseSha256: digest,
    benchmarkHref: z.string().regex(/^\/forever-sim\/[a-f0-9]{24}\/[a-z_]+\/(?:\?i=gtrcmxeu)?#/),
    capturedAt: z.string().datetime(),
    scenario: z.enum(["solo", "raid"]).optional(),
    policySha256: digest.optional(),
  })
  .strict();
export const dpsTierSnapshotSchema = z
  .object({
    schema: z.literal("kfc-forever-dps-tier-list.v1"),
    policySha256: digest,
    policy: z
      .object({
        version: z.enum([
          "pre-raid-full-support-no-external-debuffs-v1",
          "pre-raid-solo-support-v1",
          "pre-raid-raid-support-v1",
        ]),
        scenario: z.enum(["solo", "raid"]).optional(),
        iterations: z.literal(5000),
        seed: z.literal(58723001),
        durationSeconds: z.literal(300),
        support: z
          .object({
            version: z.enum(["full-v2", "solo-v1"]),
            raid: z.record(z.string(), z.unknown()),
            party: z.record(z.string(), z.unknown()),
            individual: z.record(z.string(), z.unknown()),
          })
          .strict(),
        encounter: z.record(z.string(), z.unknown()),
        externalDebuffs: z.string(),
        playerEquipmentTalentsRaceConsumes: z.string(),
        selfSupport: z.record(z.string(), z.unknown()).optional(),
        debuffs: z.record(z.string(), z.unknown()).optional(),
        maintenance: z.string().optional(),
      })
      .strict(),
    entries: z.array(entrySchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context): void => {
    const scenario = value.policy.scenario;
    const expectedVersion =
      scenario === "solo"
        ? "pre-raid-solo-support-v1"
        : scenario === "raid"
          ? "pre-raid-raid-support-v1"
          : "pre-raid-full-support-no-external-debuffs-v1";
    if (
      value.policy.version !== expectedVersion ||
      value.policy.support.version !== (scenario === "solo" ? "solo-v1" : "full-v2")
    )
      context.addIssue({ code: "custom", message: "Scenario and numerical policy disagree" });
    if (new Set(value.entries.map((entry): string => entry.id)).size !== value.entries.length)
      context.addIssue({ code: "custom", message: "Duplicate ranked build" });
    for (const entry of value.entries) {
      if (entry.scenario !== scenario || (scenario && entry.policySha256 !== value.policySha256))
        context.addIssue({
          code: "custom",
          message: "Build measurement belongs to another scenario",
        });
      const spec = SIMULATOR_SPECS.find((spec): boolean => spec.page === entry.profile);
      if (
        !spec ||
        spec.role !== "damage" ||
        !entry.spec.startsWith(entry.profile + "/") ||
        !entry.benchmarkHref.startsWith(
          `/forever-sim/${entry.release}/${entry.profile}/${scenario ? "?i=gtrcmxeu" : ""}#`,
        )
      )
        context.addIssue({ code: "custom", message: "Invalid ranked simulator profile" });
    }
  });
export type DpsTierSnapshot = z.infer<typeof dpsTierSnapshotSchema>;
export type DpsTierScenario = "solo" | "raid";
export type DpsTier = "S" | "A" | "B" | "C" | "D";
export interface DpsTierEntry extends z.infer<typeof entrySchema> {
  readonly title: string;
  readonly className: string;
  readonly classSlug: string;
  readonly color: string;
  readonly icon: string;
  readonly simulatorHref: string;
  readonly rank: number;
  readonly share: number;
  readonly tier: DpsTier;
  readonly uncertainty95: number;
  readonly closeToNext: boolean;
}
const names: Readonly<Record<string, string>> = {
  "fury-horde": "Fury",
  "arms-alliance": "Arms",
  "two-hand-fury-static": "Two-handed Fury",
  "rogue-combat-static": "Combat",
  "rogue-mutilate-static": "Mutilate",
  "rogue-subtlety-static": "Subtlety",
  "hunter-beast-mastery-static": "Beast Mastery",
  "hunter-marksmanship-static": "Marksmanship",
  "hunter-survival-static": "Survival",
  "balance-static": "Balance",
  "feral-cat-static": "Feral Cat",
  "mage-frost-static": "Frost",
  "mage-fire-static": "Fire",
  "mage-arcane-static": "Arcane",
  "warlock-demonology-static": "Demonology",
  "warlock-affliction-static": "Affliction",
  "priest-shadow-static": "Shadow",
  "priest-smite-static": "Smite",
  "shaman-elemental-static": "Elemental",
  "shaman-stormcaller-static": "Stormcaller",
  "shaman-enhancement-static": "Enhancement",
};
export function dpsTier(share: number): DpsTier {
  if (share >= 95) return "S";
  if (share >= 85) return "A";
  if (share >= 70) return "B";
  if (share >= 55) return "C";
  return "D";
}
export function rankDpsTierEntries(snapshot: DpsTierSnapshot): readonly DpsTierEntry[] {
  const entries = [...snapshot.entries].sort(
    (left, right): number => right.dps - left.dps || left.id.localeCompare(right.id),
  );
  const top = entries[0]?.dps ?? 1;
  return entries.map((entry, index): DpsTierEntry => {
    const spec = SIMULATOR_SPECS.find((spec): boolean => spec.page === entry.profile);
    const appearance = FOREVER_CLASS_APPEARANCES.find(
      (appearance): boolean => appearance.name === spec?.className,
    );
    if (!spec || !appearance) throw new Error("Unknown DPS class");
    const share = (entry.dps / top) * 100,
      next = entries[index + 1];
    return {
      ...entry,
      title: names[entry.id] ?? entry.name,
      className: appearance.name,
      classSlug: appearance.slug,
      color: appearance.color,
      icon: appearance.icon,
      simulatorHref: `/forever/simulator/${spec.slug}?build=${entry.id}`,
      rank: index + 1,
      share,
      tier: dpsTier(share),
      uncertainty95: (1.96 * entry.stdev) / Math.sqrt(entry.iterations),
      closeToNext: Boolean(
        next &&
        entry.dps - next.dps <=
          1.96 * Math.sqrt(entry.stdev ** 2 / entry.iterations + next.stdev ** 2 / next.iterations),
      ),
    };
  });
}
export function filterDpsTierEntries(
  entries: readonly DpsTierEntry[],
  query: string,
  classSlug: string,
): readonly DpsTierEntry[] {
  const needle = query.trim().slice(0, 100).toLocaleLowerCase("en-US");
  return entries.filter(
    (entry): boolean =>
      (!classSlug || entry.classSlug === classSlug) &&
      `${entry.title} ${entry.className}`.toLocaleLowerCase("en-US").includes(needle),
  );
}
