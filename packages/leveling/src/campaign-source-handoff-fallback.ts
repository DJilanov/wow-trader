import type { CombatQuestReference } from "./combat-model.js";
import type { ImportedDirective } from "./guide-archive.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";

const handoffTags = new Set([
  "text", "marker", ".goto", ".target", ".accept", ".turnin", "#label", "#xprate", "#optional", "#softcore", "#softcoreserver",
  ...CAMPAIGN_QUEST_GUARDS,
]);

function npcInteraction(directives: readonly ImportedDirective[]): string | null {
  if (directives.some((row) => !handoffTags.has(row.tag))) return null;
  const targets = directives.filter((row) => row.tag === ".target");
  const positions = directives.filter((row) => row.position !== null);
  if (targets.length !== 1 || positions.length !== 1 || positions[0]!.tag !== ".goto") return null;
  const name = targets[0]!.arguments.normalize("NFKC").trim().toLowerCase();
  if (!name || directives.some((row) => row.tag === "text" &&
    row.text.normalize("NFKC").trim().toLowerCase() !== `talk to ${name}`)) return null;
  const position = positions[0]!.position!;
  return JSON.stringify([name, position.zone, position.floor, position.space, position.x, position.y]);
}

/** Move a whole repeated exchange only when other phases at the old NPC visit stay independent. */
export function isRepeatedNpcHandoff(
  earlier: readonly ImportedDirective[],
  later: readonly ImportedDirective[],
  moved: ImportedDirective,
  references: ReadonlyMap<number, CombatQuestReference>,
): boolean {
  const interaction = npcInteraction(earlier);
  if (!interaction || interaction !== npcInteraction(later) ||
    later.some((row) => CAMPAIGN_QUEST_GUARDS.has(row.tag))) return false;
  const phases = (rows: readonly ImportedDirective[]): readonly ImportedDirective[] =>
    rows.filter((row) => [".accept", ".turnin"].includes(row.tag));
  const pair = phases(later), original = phases(earlier);
  if (pair.length !== 2 || pair[0]!.tag !== ".turnin" || pair[1]!.tag !== ".accept") return false;
  const returnedId = pair[0]!.questId, acceptedId = pair[1]!.questId;
  if (returnedId === null || acceptedId === null || returnedId === acceptedId) return false;
  const parent = references.get(returnedId), child = references.get(acceptedId);
  if (parent?.requiredClasses !== 0 || child?.requiredClasses !== 0 || !child.prerequisites ||
    ![...child.prerequisites.allOf, ...child.prerequisites.anyOf].includes(returnedId)) return false;
  const identity = (row: ImportedDirective): string => `${row.tag}:${row.arguments.trim()}`;
  if (!pair.some((row) => identity(row) === identity(moved)) || pair.some((row, index) =>
    row.arguments.trim() !== String(row.questId) ||
    !original[index] || identity(row) !== identity(original[index]!))) return false;
  const movedIds = new Set([returnedId, acceptedId]);
  if (earlier.some((row) => CAMPAIGN_QUEST_GUARDS.has(row.tag) &&
    row.arguments.split(",").some((value) => movedIds.has(Number(value))))) return false;
  const independent = (questId: number, visiting: ReadonlySet<number>): boolean => {
    if (movedIds.has(questId) || visiting.has(questId) || visiting.size >= 100) return false;
    const reference = references.get(questId), parents = reference?.prerequisites;
    if (!parents || reference?.requiredClasses !== 0) return false;
    const next = new Set([...visiting, questId]);
    return [...parents.allOf, ...parents.anyOf].every((parent) => independent(parent, next));
  };
  return original.slice(2).every((row) => row.questId !== null &&
    row.arguments.trim() === String(row.questId) && independent(row.questId, new Set()));
}
