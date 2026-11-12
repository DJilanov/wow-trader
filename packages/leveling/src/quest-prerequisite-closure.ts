import type { QuestCatalogEntry } from "./quest-catalog.js";

interface PrerequisiteQuest {
  readonly questId: number;
  readonly prerequisites: QuestCatalogEntry["prerequisites"];
}

/** An alternative contributes only ancestors required by every branch, never every alternative. */
export function guaranteedQuestPrerequisites(
  quest: PrerequisiteQuest,
  catalog: ReadonlyMap<number, PrerequisiteQuest>,
  sourceRequirements: Iterable<number> = [],
): ReadonlySet<number> | null {
  const memo = new Map<number, ReadonlySet<number>>();
  function ancestors(
    node: PrerequisiteQuest,
    visiting: ReadonlySet<number>,
  ): ReadonlySet<number> | null {
    if (visiting.has(node.questId) || visiting.size >= 100) return null;
    const cached = memo.get(node.questId);
    if (cached) return cached;
    const next = new Set(visiting).add(node.questId);
    const required = new Set<number>();
    const branch = (id: number): ReadonlySet<number> | null => {
      const parent = catalog.get(id);
      // The direct dependency is recorded, but an absent record proves no earlier ancestors.
      if (!parent) return new Set([id]);
      const earlier = ancestors(parent, next);
      return earlier ? new Set([id, ...earlier]) : null;
    };
    for (const id of node.prerequisites.allOf) {
      const earlier = branch(id);
      if (!earlier) return null;
      for (const parent of earlier) required.add(parent);
    }
    const alternatives = node.prerequisites.anyOf.map(branch);
    if (alternatives.some((entry) => entry === null)) return null;
    const first = alternatives[0];
    if (first)
      for (const id of first) {
        if (alternatives.every((entry) => entry!.has(id))) required.add(id);
      }
    memo.set(node.questId, required);
    return required;
  }
  const required = ancestors(quest, new Set());
  if (!required) return null;
  const result = new Set(required);
  for (const id of sourceRequirements) {
    const parent = catalog.get(id);
    if (!parent || id === quest.questId) return null;
    const earlier = ancestors(parent, new Set([quest.questId]));
    if (!earlier) return null;
    result.add(id);
    for (const ancestor of earlier) result.add(ancestor);
  }
  return result;
}
