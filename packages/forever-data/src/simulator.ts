import { z } from "zod";

export const SIMULATOR_REVISION = "9a27c3d6af91d1ca0dbcf94a124b8869ad522108";
export const SIMULATOR_UPSTREAM = "https://github.com/gunba/wow-forever-sim";
export const SIMULATOR_SPECS = [
  {
    slug: "balance-druid",
    page: "balance_druid",
    className: "Druid",
    name: "Balance",
    role: "damage",
  },
  { slug: "feral-druid", page: "feral_druid", className: "Druid", name: "Feral", role: "damage" },
  {
    slug: "feral-tank-druid",
    page: "feral_tank_druid",
    className: "Druid",
    name: "Feral tank",
    role: "tank",
  },
  { slug: "hunter", page: "hunter", className: "Hunter", name: "Hunter", role: "damage" },
  { slug: "mage", page: "mage", className: "Mage", name: "Mage", role: "damage" },
  {
    slug: "protection-paladin",
    page: "protection_paladin",
    className: "Paladin",
    name: "Protection",
    role: "tank",
  },
  {
    slug: "retribution-paladin",
    page: "retribution_paladin",
    className: "Paladin",
    name: "Retribution",
    role: "damage",
  },
  {
    slug: "shadow-priest",
    page: "shadow_priest",
    className: "Priest",
    name: "Shadow",
    role: "damage",
  },
  {
    slug: "smite-priest",
    page: "smite_priest",
    className: "Priest",
    name: "Smite",
    role: "damage",
  },
  { slug: "rogue", page: "rogue", className: "Rogue", name: "Rogue", role: "damage" },
  {
    slug: "elemental-shaman",
    page: "elemental_shaman",
    className: "Shaman",
    name: "Elemental",
    role: "damage",
  },
  {
    slug: "enhancement-shaman",
    page: "enhancement_shaman",
    className: "Shaman",
    name: "Enhancement",
    role: "damage",
  },
  { slug: "warlock", page: "warlock", className: "Warlock", name: "Warlock", role: "damage" },
  { slug: "warrior", page: "warrior", className: "Warrior", name: "Warrior DPS", role: "damage" },
  {
    slug: "tank-warrior",
    page: "tank_warrior",
    className: "Warrior",
    name: "Protection warrior",
    role: "tank",
  },
  { slug: "raid", page: "raid", className: null, name: "Raid simulator", role: "raid" },
] as const;
export type SimulatorSpec = (typeof SIMULATOR_SPECS)[number];

export const simulatorManifestSchema = z
  .object({
    schema: z.literal("kfc-forever-simulator.v1"),
    release: z.string().regex(/^[a-f0-9]{24}$/),
    upstream: z.literal(SIMULATOR_UPSTREAM),
    revision: z.literal(SIMULATOR_REVISION),
    preparedAt: z.iso.datetime(),
    itemCount: z.number().int().positive(),
    excludedModeledItems: z.number().int().nonnegative(),
    pages: z.array(z.string().regex(/^[a-z_]+$/)).min(SIMULATOR_SPECS.length),
    files: z.record(
      z.string(),
      z
        .object({
          bytes: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    dataProvenance: z.literal("pinned-upstream-forever-data"),
    mechanicsStatus: z.literal("beta_model"),
  })
  .strict();
export type SimulatorManifest = z.infer<typeof simulatorManifestSchema>;

export function getSimulatorSpec(slug: string): SimulatorSpec | null {
  return SIMULATOR_SPECS.find((spec) => spec.slug === slug) ?? null;
}
