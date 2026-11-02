import type { ImportedDirective } from "./guide-archive.js";

/** RestedXP's following .disablecheckbox makes its parent a text-only reminder. */
export function displayOnlyQuestPhases(
  directives: readonly ImportedDirective[],
): ReadonlySet<ImportedDirective> {
  const phases = new Set<ImportedDirective>();
  for (let index = 1; index < directives.length; index++) {
    const parent = directives[index - 1]!;
    if (
      directives[index]!.tag === ".disablecheckbox" &&
      [".accept", ".complete", ".turnin"].includes(parent.tag)
    )
      phases.add(parent);
  }
  return phases;
}
