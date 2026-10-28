import { z } from "zod";
import { type HealerItem } from "./healing-simulator.js";
import { type PaladinHealerFullCatalog } from "./paladin-healer-catalog.js";
import { paladinHealerPresentationSchema } from "./paladin-healer-release.js";

const id = z.number().int().positive().safe();
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const profession = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(8),
  z.literal(11),
]);
const legacy = paladinHealerPresentationSchema.shape;
const statLabels = [
  "Strength",
  "Agility",
  "Stamina",
  "Intellect",
  "Spirit",
  "Spell power",
  "Arcane damage",
  "Fire damage",
  "Frost damage",
  "Holy damage",
  "Nature damage",
  "Shadow damage",
  "Mana per 5 sec",
  "Spell hit (%)",
  "Spell crit (%)",
  "Spell haste (%)",
  "Spell penetration",
  "Attack power",
  "Melee hit (%)",
  "Melee crit (%)",
  "Melee haste (%)",
  "Armor penetration",
  "Expertise",
  "Mana",
  "Energy",
  "Rage",
  "Armor",
  "Ranged attack power",
  "Defense",
  "Block (%)",
  "Block value",
  "Dodge (%)",
  "Parry (%)",
  "Resilience",
  "Health",
  "Arcane resistance",
  "Fire resistance",
  "Frost resistance",
  "Nature resistance",
  "Shadow resistance",
  "Bonus armor",
  "Healing power",
  "Spell damage",
  "Feral attack power",
] as const;

/** Render all nonzero engine stat channels in their source order. */
export function paladinHealerDisplayStats(values: readonly number[]): HealerItem["stats"] {
  if (
    values.length !== statLabels.length ||
    values.some((value): boolean => !Number.isFinite(value))
  )
    throw new Error("Invalid Paladin stat vector");
  return values.flatMap((value, index): HealerItem["stats"] =>
    value === 0 ? [] : [{ label: statLabels[index]!, value }],
  );
}

const structure = z
  .object({
    schema: z.literal("kfc-paladin-healer-presentation.v2"),
    profile: legacy.profile,
    modelIdentity: checksum,
    sourceCatalogSha256: checksum,
    sourceBuild: legacy.sourceBuild,
    professions: z
      .array(z.object({ id: profession, name: z.string().min(1).max(100) }).strict())
      .length(6),
    races: z
      .array(
        z.object({ id, name: z.string().min(1), faction: z.enum(["Alliance", "Horde"]) }).strict(),
      )
      .length(2),
    profiles: z
      .array(
        z
          .object({
            id: z.string().regex(/^[12]:[1-9][0-9]?,[1-9][0-9]?$/),
            faction: z.union([z.literal(1), z.literal(2)]),
            professions: z.tuple([profession, profession]),
          })
          .strict(),
      )
      .length(30),
    scenarios: legacy.scenarios,
    items: z
      .array(legacy.items.element.extend({ requiredProfession: profession.nullable() }))
      .min(1)
      .max(5000),
    enchants: legacy.enchants,
    spells: legacy.spells,
    talents: legacy.talents,
    assumptions: legacy.assumptions,
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string): void => context.addIssue({ code: "custom", message });
    for (const [name, ids] of [
      ["items", value.items.map((entry) => entry.id)],
      ["enchants", value.enchants.map((entry) => entry.id)],
      ["spells", value.spells.map((entry) => entry.id)],
      ["races", value.races.map((entry) => entry.id)],
      ["professions", value.professions.map((entry) => entry.id)],
      ["profiles", value.profiles.map((entry) => entry.id)],
    ] as const)
      if (new Set<string | number>(ids).size !== ids.length)
        issue("Duplicate Paladin presentation " + name);
    if (new Set(value.races.map((race) => race.faction)).size !== 2)
      issue("Missing measured Paladin faction race");
    const enchants = new Set(value.enchants.map((entry) => entry.id));
    if (
      value.items.some(
        (item): boolean =>
          new Set(item.slots).size !== item.slots.length ||
          new Set(item.enchantIds).size !== item.enchantIds.length ||
          item.enchantIds.some((enchant): boolean => enchant !== 0 && !enchants.has(enchant)),
      ) ||
      new Set(value.scenarios.map((scenario) => scenario.id)).size !== 28 ||
      !value.scenarios.some((scenario) => scenario.id === "reference")
    )
      issue("Incomplete Paladin presentation references");
    for (const profile of value.profiles)
      if (
        profile.professions[0] >= profile.professions[1] ||
        profile.id !== `${profile.faction}:${profile.professions.join(",")}`
      )
        issue("Invalid Paladin presentation profile");
    const talents = value.talents.flatMap((tree) => tree.talents);
    if (new Set(talents.map((talent) => talent.field)).size !== talents.length)
      issue("Duplicate Paladin talent field");
    for (const tree of value.talents) {
      const nodes = new Map(tree.talents.map((talent) => [talent.field, talent]));
      if (
        new Set(tree.talents.map((talent) => `${talent.row}:${talent.column}`)).size !== nodes.size
      )
        issue("Duplicate Paladin talent position");
      for (const talent of tree.talents) {
        const visited = new Set<string>([talent.field]);
        let prerequisite = talent.prerequisite;
        while (prerequisite) {
          if (!nodes.has(prerequisite) || visited.has(prerequisite)) {
            issue("Invalid Paladin talent prerequisite graph");
            break;
          }
          visited.add(prerequisite);
          prerequisite = nodes.get(prerequisite)!.prerequisite;
        }
      }
    }
    const fields = new Set(talents.map((talent) => talent.field));
    if (
      value.spells.some(
        (spell): boolean =>
          spell.requiredTalentField !== null && !fields.has(spell.requiredTalentField),
      )
    )
      issue("Paladin spell requires an unknown talent");
  });

export type PaladinHealerFullPresentation = z.infer<typeof structure>;

export const paladinHealerFullPresentationSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const parsed = structure.safeParse(input);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerFullPresentation => input as PaladinHealerFullPresentation);

/** Bind presentation records to the exact admitted catalog and all profession slot pools. */
export function parsePaladinHealerFullPresentation(
  catalog: PaladinHealerFullCatalog,
  input: unknown,
  catalogSha256: string,
): PaladinHealerFullPresentation {
  checksum.parse(catalogSha256);
  const value = paladinHealerFullPresentationSchema.parse(input);
  if (value.modelIdentity !== catalog.modelIdentity || value.sourceCatalogSha256 !== catalogSha256)
    throw new Error("Paladin presentation belongs to another catalog or model");
  const profiles = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
  if (
    value.profiles.some((profile): boolean => {
      const original = profiles.get(profile.id);
      return (
        !original ||
        original.faction !== profile.faction ||
        original.professions.some(
          (profession, index): boolean => profession !== profile.professions[index],
        )
      );
    })
  )
    throw new Error("Paladin presentation profiles differ from their catalog");
  const items = new Map(catalog.catalog.map((entry) => [entry.item.id, entry]));
  const slots = new Map<number, Set<number>>();
  for (const profile of catalog.profiles)
    for (const [slot, ids] of profile.slots.entries())
      for (const id of ids) {
        if (!slots.has(id)) slots.set(id, new Set());
        slots.get(id)!.add(slot);
      }
  if (value.items.length !== items.size)
    throw new Error("Paladin presentation catalog is incomplete");
  for (const item of value.items) {
    const original = items.get(item.id);
    if (
      !original ||
      item.name !== original.item.name ||
      item.icon !== original.item.icon ||
      item.requiredLevel !== original.source.requiredLevel ||
      item.requiredProfession !== (original.item.requiredProfession ?? null) ||
      JSON.stringify(item.stats) !==
        JSON.stringify(paladinHealerDisplayStats(original.item.stats)) ||
      JSON.stringify(item.slots) !== JSON.stringify([...slots.get(item.id)!].sort((a, b) => a - b))
    )
      throw new Error("Paladin item presentation differs from its source catalog");
  }
  return value;
}
