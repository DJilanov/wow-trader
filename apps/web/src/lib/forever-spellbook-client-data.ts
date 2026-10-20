import type { Spellbook, SpellDescription, TalentClass } from "@wow-trader/forever-data";

export interface ForeverSpellbookClientData {
  readonly classIcon: string;
  readonly treeIcons: Readonly<Record<string, string>>;
  readonly descriptions: Readonly<Record<string, SpellDescription>>;
  readonly icons: Readonly<Record<string, string>>;
}

export function selectForeverSpellbookClientData(
  className: string,
  classData: TalentClass,
  spellbook: Spellbook,
  descriptions: Readonly<Record<string, SpellDescription>>,
  icons: Readonly<Record<string, string>>,
): ForeverSpellbookClientData {
  const entries = [...spellbook.general, ...spellbook.tabs.flatMap((tab) => tab.spells)];
  const spellNames = new Set(entries.map(([name]) => name));
  const descriptionKeys = new Set(entries.map(([name, rank]) => `${className}|${name}|${rank}`));

  return {
    classIcon: classData.icon,
    treeIcons: Object.fromEntries(classData.trees.map((tree) => [tree.name, tree.icon])),
    descriptions: Object.fromEntries(
      Object.entries(descriptions).filter(([key]) => descriptionKeys.has(key)),
    ),
    icons: Object.fromEntries(Object.entries(icons).filter(([name]) => spellNames.has(name))),
  };
}
