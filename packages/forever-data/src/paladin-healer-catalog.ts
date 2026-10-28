import { z } from "zod";

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
const sourceReference = z
  .object({ path: z.string().min(1).max(1000), byteSha256: checksum })
  .strict();
const profile = z
  .object({
    id: z.string().regex(/^[12]:[1-9][0-9]?,[1-9][0-9]?$/),
    faction: z.union([z.literal(1), z.literal(2)]),
    professions: z.tuple([profession, profession]),
    slots: z.array(z.array(id).min(1).max(5000)).length(17),
  })
  .strict()
  .superRefine((value, context): void => {
    if (
      value.professions[0] >= value.professions[1] ||
      value.id !== `${value.faction}:${value.professions.join(",")}` ||
      value.slots.some((items): boolean => new Set(items).size !== items.length)
    )
      context.addIssue({ code: "custom", message: "Invalid Paladin acquisition profile" });
  });
const entry = z
  .object({
    item: z
      .object({
        id,
        name: z.string().min(1),
        icon: z.string().min(1),
        type: z.number().int().nonnegative(),
        stats: z.array(z.number().finite()).length(44),
        requiredProfession: profession.optional(),
        classAllowlist: z.array(id).optional(),
      })
      .passthrough(),
    source: z.object({ id, requiredLevel: z.number().int().min(0).max(60) }).passthrough(),
  })
  .strict();
const structure = z
  .object({
    schema: z.literal("kfc-paladin-healer-catalog-candidate.v2"),
    profile: z.literal("healing-paladin"),
    modelIdentity: checksum,
    source: z
      .object({
        model: sourceReference,
        database: sourceReference,
        items: sourceReference,
        equipmentDomain: sourceReference,
      })
      .strict(),
    profiles: z.array(profile).length(30),
    catalog: z.array(entry).min(1).max(5000),
    wholeLoadoutValidationRequired: z.literal(true),
    websiteAdmissionComplete: z.literal(false),
    fullClassQualified: z.literal(false),
    publicationAllowed: z.literal(false),
  })
  .strict()
  .superRefine((value, context): void => {
    const issue = (message: string, path: (string | number)[] = []): void =>
      context.addIssue({ code: "custom", message, path });
    const profiles = new Set(value.profiles.map((entry): string => entry.id));
    const professions = [1, 2, 3, 4, 8, 11];
    for (const faction of [1, 2])
      for (const [index, first] of professions.entries())
        for (const second of professions.slice(index + 1))
          if (!profiles.has(`${faction}:${first},${second}`))
            issue("Missing Paladin faction/profession acquisition profile");
    const items = new Map(value.catalog.map((entry) => [entry.item.id, entry]));
    if (items.size !== value.catalog.length) issue("Duplicate Paladin catalog item");
    for (const [index, entry] of value.catalog.entries()) {
      if (entry.source.id !== entry.item.id)
        issue("Paladin item/source identity mismatch", ["catalog", index]);
      if (entry.item.classAllowlist?.length && !entry.item.classAllowlist.includes(4))
        issue("Paladin catalog includes another class's restricted item", ["catalog", index]);
    }
    const used = new Set<number>();
    for (const [index, profile] of value.profiles.entries())
      for (const [slot, ids] of profile.slots.entries())
        for (const id of ids) {
          const item = items.get(id)?.item;
          if (!item) issue("Missing Paladin slot candidate", ["profiles", index, "slots", slot]);
          else if (
            item.requiredProfession !== undefined &&
            !profile.professions.includes(item.requiredProfession)
          )
            issue("Paladin slot candidate requires another profession", [
              "profiles",
              index,
              "slots",
              slot,
            ]);
          used.add(id);
        }
    if (used.size !== items.size || [...items.keys()].some((id): boolean => !used.has(id)))
      issue("Paladin catalog contains items outside the declared slot pools");
  });

export type PaladinHealerFullCatalog = z.infer<typeof structure>;
export type PaladinHealerCatalogEntry = PaladinHealerFullCatalog["catalog"][number];
export type PaladinHealerAcquisitionProfile = PaladinHealerFullCatalog["profiles"][number];

// Retain all original source fields and member order for source-identity verification.
export const paladinHealerFullCatalogSchema = z
  .unknown()
  .superRefine((input, context): void => {
    const result = structure.safeParse(input);
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  })
  .transform((input): PaladinHealerFullCatalog => input as PaladinHealerFullCatalog);

export function parsePaladinHealerFullCatalog(input: unknown): PaladinHealerFullCatalog {
  return paladinHealerFullCatalogSchema.parse(input);
}

/** Return source-declared slot candidates; full loadout ownership rules still apply. */
export function paladinHealerCatalogSlotItems(
  catalog: PaladinHealerFullCatalog,
  profileId: string,
  slot: number,
): readonly PaladinHealerCatalogEntry[] {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 17)
    throw new Error("Unknown Paladin equipment slot");
  const profile = catalog.profiles.find((entry): boolean => entry.id === profileId);
  if (!profile) throw new Error("Unknown Paladin acquisition profile");
  const entries = new Map(catalog.catalog.map((entry) => [entry.item.id, entry]));
  return profile.slots[slot]!.map((id): PaladinHealerCatalogEntry => {
    const entry = entries.get(id);
    if (!entry) throw new Error("The Paladin slot candidate is missing from the catalog");
    return entry;
  });
}
