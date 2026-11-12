import type { CombatNpc } from "./combat-model.js";

export function combatTargetName(value: string): string {
  return value
    .replace(/^\+/, "")
    .replace(/^(?:kill|slay|destroy)\s+/i, "")
    .replace(/\s+(?:slain|killed|defeated|destroyed)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function combatTargetNameForms(value: string): ReadonlySet<string> {
  const name = combatTargetName(value),
    forms = new Set([name, `${name}s`]);
  if (/[^aeiou]y$/.test(name)) forms.add(`${name.slice(0, -1)}ies`);
  if (/(?:s|x|z|ch|sh)$/.test(name)) forms.add(`${name}es`);
  if (/man$/.test(name)) forms.add(`${name.slice(0, -3)}men`);
  if (/(?:lf|rf)$/.test(name)) forms.add(`${name.slice(0, -1)}ves`);
  if (/thief$/.test(name)) forms.add(`${name.slice(0, -1)}ves`);
  return forms;
}

export function questCreatureKillCount(
  npc: Pick<CombatNpc, "name">,
  texts: readonly string[],
  relatedNames: readonly string[] = [],
): number | null {
  const name = combatTargetName(npc.name);
  const pattern = [...combatTargetNameForms(npc.name)]
    .sort((a, b) => b.length - a.length)
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const counts = new Set<number>();
  for (const text of texts)
    for (const match of text
      .toLowerCase()
      .matchAll(new RegExp(`\\b(\\d+)\\s+(?:${pattern})(?![a-z])`, "g"))) {
      const count = Number(match[1]);
      if (count > 0 && count <= 10000) counts.add(count);
    }
  for (const text of texts)
    for (const match of text
      .toLowerCase()
      .matchAll(
        new RegExp(
          `\\b(?:${pattern})\\s*(?:(?:slain|killed|defeated|destroyed)\\s*)?\\(x?(\\d+)\\)`,
          "g",
        ),
      )) {
      const count = Number(match[1]);
      if (count > 0 && count <= 10000) counts.add(count);
    }
  if (counts.size === 1) return [...counts][0]!;
  if (counts.size > 1 || !relatedNames.length) return null;
  // Quest text can omit a repeated family name: "8 Blackwood Pathfinders and 5 Windtalkers".
  const words = name.split(" ");
  for (let start = 1; start < words.length; start++) {
    const suffix = words.slice(start).join(" ");
    const matches = relatedNames.filter((related) => {
      const normalized = combatTargetName(related);
      return normalized === suffix || normalized.endsWith(` ${suffix}`);
    });
    if (matches.length !== 1) continue;
    const count = questCreatureKillCount({ name: suffix }, texts);
    if (count !== null) return count;
  }
  return null;
}
