export type BisRole = "damage" | "healing" | "tank";

export interface BisListDefinition {
  readonly slug: string;
  readonly classId: number;
  readonly className: string;
  readonly specializationName: string;
  readonly role: BisRole;
}

export interface BisClassDefinition {
  readonly classId: number;
  readonly className: string;
  readonly color: string;
  readonly lists: readonly BisListDefinition[];
}

interface BisSpecializationDefinition {
  readonly slug: string;
  readonly name: string;
  readonly role: BisRole;
}

export const TBC_BIS_CLASSES: readonly BisClassDefinition[] = [
  bisClass(1, "Warrior", "#c79c6e", [
    { slug: "arms", name: "Arms", role: "damage" },
    { slug: "fury", name: "Fury", role: "damage" },
    { slug: "protection", name: "Protection", role: "tank" },
  ]),
  bisClass(2, "Paladin", "#f58cba", [
    { slug: "holy", name: "Holy", role: "healing" },
    { slug: "protection", name: "Protection", role: "tank" },
    { slug: "retribution", name: "Retribution", role: "damage" },
  ]),
  bisClass(3, "Hunter", "#abd473", [
    { slug: "beast-mastery", name: "Beast Mastery", role: "damage" },
    { slug: "marksmanship", name: "Marksmanship", role: "damage" },
    { slug: "survival", name: "Survival", role: "damage" },
  ]),
  bisClass(4, "Rogue", "#fff569", [
    { slug: "assassination", name: "Assassination", role: "damage" },
    { slug: "combat", name: "Combat", role: "damage" },
    { slug: "subtlety", name: "Subtlety", role: "damage" },
  ]),
  bisClass(5, "Priest", "#ffffff", [
    { slug: "discipline", name: "Discipline", role: "healing" },
    { slug: "holy", name: "Holy", role: "healing" },
    { slug: "shadow", name: "Shadow", role: "damage" },
  ]),
  bisClass(7, "Shaman", "#0070de", [
    { slug: "elemental", name: "Elemental", role: "damage" },
    { slug: "enhancement", name: "Enhancement", role: "damage" },
    { slug: "restoration", name: "Restoration", role: "healing" },
  ]),
  bisClass(8, "Mage", "#69ccf0", [
    { slug: "arcane", name: "Arcane", role: "damage" },
    { slug: "fire", name: "Fire", role: "damage" },
    { slug: "frost", name: "Frost", role: "damage" },
  ]),
  bisClass(9, "Warlock", "#9482c9", [
    { slug: "affliction", name: "Affliction", role: "damage" },
    { slug: "demonology", name: "Demonology", role: "damage" },
    { slug: "destruction", name: "Destruction", role: "damage" },
  ]),
  bisClass(11, "Druid", "#ff7d0a", [
    { slug: "balance", name: "Balance", role: "damage" },
    { slug: "feral-damage", name: "Feral DPS", role: "damage" },
    { slug: "feral-tank", name: "Feral Tank", role: "tank" },
    { slug: "restoration", name: "Restoration", role: "healing" },
  ]),
];

const listsBySlug = new Map(
  TBC_BIS_CLASSES.flatMap(({ lists }) => lists).map((list) => [list.slug, list]),
);

export function getTbcBisList(slug: string): BisListDefinition | null {
  return listsBySlug.get(slug) ?? null;
}

function bisClass(
  classId: number,
  className: string,
  color: string,
  specializations: readonly BisSpecializationDefinition[],
): BisClassDefinition {
  const classSlug = className.toLowerCase();
  return {
    classId,
    className,
    color,
    lists: specializations.map((specialization) => ({
      slug: `${classSlug}-${specialization.slug}`,
      classId,
      className,
      specializationName: specialization.name,
      role: specialization.role,
    })),
  };
}
