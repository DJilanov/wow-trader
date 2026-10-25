import { druidHealingTalentNeighbors } from "./druid-healing-feedback.mjs";

// Editorial preferences for filler only; actual healing talents and tree gates stay fixed.
const preferences = new Map([
  ["subtlety", 100],
  ["naturalShapeshifter", 20],
  ["improvedEntanglingRoots", 10],
  ["furor", 5],
  ["naturesReach", 4],
  ["moonglow", 3],
  ["improvedWrath", 2],
  ["improvedMoonfire", 1],
  ["ferocity", 0],
  ["improvedStarfire", 0],
  ["vengeance", 0],
  ["moonfury", 0],
  ["insectSwarm", 0],
]);

/** Prefer useful healing utility over unrelated filler without moving modeled healing points.
 * The proposal still needs numerical confirmation; this is not a healing-throughput score.
 * @param {object[]} trees @param {{spec:string,talentsString:string,fields:Record<string,number>}} input
 * @returns {{state:object,moves:object[],changed:boolean}}
 */
export function deriveDruidHealingUtilityTalents(trees, input) {
  const fields = trees.flatMap((tree) => tree.talents.map((talent) => talent.fieldName)),
    score = (state) =>
      [...preferences].reduce((sum, [key, weight]) => sum + (state.fields[key] ?? 0) * weight, 0),
    fixed = fields.filter((field) => !preferences.has(field)),
    moves = [];
  let state = structuredClone(input);
  for (let move = 0; move < 12; move++) {
    const candidates = druidHealingTalentNeighbors(trees, state)
      .filter(
        (candidate) =>
          fixed.every((field) => (candidate.fields[field] ?? 0) === (input.fields[field] ?? 0)) &&
          score(candidate) > score(state),
      )
      .sort(
        (left, right) =>
          score(right) - score(left) || left.talentsString.localeCompare(right.talentsString),
      );
    if (!candidates.length) break;
    const next = candidates[0];
    moves.push({
      before: state.talentsString,
      after: next.talentsString,
      changes: fields
        .filter((field) => (state.fields[field] ?? 0) !== (next.fields[field] ?? 0))
        .map((field) => ({
          field,
          before: state.fields[field] ?? 0,
          after: next.fields[field] ?? 0,
        })),
    });
    state = next;
  }
  return { state, moves, changed: state.talentsString !== input.talentsString };
}
