import { statisticallyBetter } from "./prebis-pool.mjs";
import { assertValidationSeeds } from "./simulation-seeds.mjs";

export function selectedTalentEvidence(review, baseline) {
  if (
    review.profile !== `${baseline.profile}/${baseline.variant}` ||
    review.revision !== baseline.revision ||
    review.validation?.length !== 2 ||
    new Set(review.validation.map((entry) => entry.seed)).size !== 2 ||
    typeof review.validated !== "boolean" ||
    review.validation.some(
      (entry) =>
        !Number.isSafeInteger(entry.seed) ||
        [entry.baseline, entry.candidate].some(
          (metric) =>
            !metric ||
            !Number.isInteger(metric.iterations) ||
            metric.iterations < 20000 ||
            !Number.isFinite(metric.dps) ||
            metric.dps <= 0 ||
            !Number.isFinite(metric.stdev) ||
            metric.stdev < 0,
        ),
    )
  )
    throw new Error("Unreviewed talent evidence");
  assertValidationSeeds(review, "talents");
  if (review.validated) {
    if (!review.validation.every((entry) => statisticallyBetter(entry.candidate, entry.baseline)))
      throw new Error("Unsupported talent gain");
    if (
      review.selection &&
      (review.selection.talents !== review.winner.talents ||
        JSON.stringify(review.selection.rotation.value) !==
          JSON.stringify(review.winner.rotation.value))
    )
      throw new Error("Talent selection differs from validated winner");
    const selected = review.selection ?? review.winner;
    if (
      typeof selected?.talents !== "string" ||
      !Array.isArray(selected.rotation?.value?.priorityList)
    )
      throw new Error("Invalid validated talent/APL selection");
    return selected;
  }
  if (review.validation.every((entry) => statisticallyBetter(entry.candidate, entry.baseline)))
    throw new Error("Unsupported no-gain conclusion");
  const selected = review.selection;
  if (
    selected?.reason !== "kept-incumbent-no-proven-gain" ||
    selected.talents !== baseline.settings.player.talentsString ||
    JSON.stringify(selected.rotation.value) !== JSON.stringify(baseline.settings.player.rotation)
  )
    throw new Error("Unvalidated talent change");
  return selected;
}

export function decodeTalents(trees, value) {
  if (typeof value !== "string" || !/^[0-9-]*$/.test(value))
    throw new Error("Invalid talent encoding");
  const parts = value.split("-");
  if (parts.length > trees.length) throw new Error("Too many talent trees");
  return trees.map((tree, index) => {
    const ranks = [...(parts[index] || "")].map(Number);
    if (ranks.length > tree.talents.length) throw new Error("Too many talent positions");
    return tree.talents.map((_, index) => ranks[index] || 0);
  });
}

export function mergeTalentSimulation(result, candidate) {
  return { ...result, talents: candidate.talents, rotation: candidate.rotation };
}

export function talentFinalists(trees, ranked, incumbents = [], count = 8, ignoredFields = []) {
  const selected = new Map();
  const identity = (candidate) => `${candidate.talents}:${candidate.rotation}`;
  for (const candidate of incumbents) selected.set(identity(candidate), candidate);
  if (selected.size >= count) return [...selected.values()];
  const families = new Set();
  for (const candidate of ranked) {
    const points = decodeTalents(trees, candidate.talents);
    const family = JSON.stringify(
      trees.map((tree, ti) =>
        tree.talents.map((talent, index) =>
          ignoredFields.includes(talent.fieldName) ? 0 : points[ti][index],
        ),
      ),
    );
    if (families.has(family)) continue;
    families.add(family);
    selected.set(identity(candidate), candidate);
    if (selected.size >= count) break;
  }
  return [...selected.values()];
}

export function encodeTalents(points) {
  return points
    .map((tree) => tree.join("").replace(/0+$/, ""))
    .join("-")
    .replace(/-+$/, "");
}

export function talentProblem(trees, points, budget = 51) {
  if (
    points.length !== trees.length ||
    points.some((tree, index) => tree.length !== trees[index].talents.length)
  )
    return "Talent shape mismatch";
  let total = 0;
  for (const [treeIndex, tree] of trees.entries()) {
    const ranks = points[treeIndex];
    for (const [index, talent] of tree.talents.entries()) {
      const rank = ranks[index];
      if (!Number.isInteger(rank) || rank < 0 || rank > talent.maxPoints)
        return `Invalid rank for ${talent.fieldName}`;
      total += rank;
      if (!rank) continue;
      const below = tree.talents.reduce(
        (sum, other, i) => sum + (other.location.rowIdx < talent.location.rowIdx ? ranks[i] : 0),
        0,
      );
      if (below < talent.location.rowIdx * 5) return `Locked tier for ${talent.fieldName}`;
      if (talent.prereqLocation) {
        const prerequisite = tree.talents.findIndex(
          (other) =>
            other.location.rowIdx === talent.prereqLocation.rowIdx &&
            other.location.colIdx === talent.prereqLocation.colIdx,
        );
        if (prerequisite < 0 || ranks[prerequisite] !== tree.talents[prerequisite].maxPoints)
          return `Missing prerequisite for ${talent.fieldName}`;
      }
    }
  }
  return total === budget ? "" : `Expected ${budget} talent points; got ${total}`;
}

export function talentsFromFields(trees, fields, budget = 51) {
  const known = new Set(trees.flatMap((tree) => tree.talents.map((talent) => talent.fieldName)));
  for (const field of Object.keys(fields))
    if (!known.has(field)) throw new Error(`Unknown talent ${field}`);
  const points = trees.map((tree) => tree.talents.map((talent) => fields[talent.fieldName] || 0));
  const problem = talentProblem(trees, points, budget);
  if (problem) throw new Error(problem);
  return encodeTalents(points);
}

export function talentNeighbors(trees, value, requiredFields = {}, budget = 51) {
  const points = decodeTalents(trees, value),
    problem = talentProblem(trees, points, budget);
  if (problem) throw new Error(problem);
  const positions = trees.flatMap((tree, ti) =>
    tree.talents.map((talent, i) => ({ ti, i, talent })),
  );
  const results = new Set();
  for (const from of positions.filter(
    ({ ti, i, talent }) => points[ti][i] > (requiredFields[talent.fieldName] || 0),
  )) {
    for (const to of positions.filter(({ ti, i, talent }) => points[ti][i] < talent.maxPoints)) {
      if (from === to) continue;
      const next = points.map((tree) => [...tree]);
      next[from.ti][from.i]--;
      next[to.ti][to.i]++;
      if (!talentProblem(trees, next, budget)) results.add(encodeTalents(next));
    }
  }
  results.delete(encodeTalents(points));
  return [...results];
}

export function summarizeTalents(trees, value) {
  const points = decodeTalents(trees, value);
  return trees.map((tree, ti) => ({
    name: tree.name,
    points: points[ti].reduce((sum, rank) => sum + rank, 0),
    talents: tree.talents.flatMap((talent, index) =>
      points[ti][index]
        ? [
            {
              field: talent.fieldName,
              name: talent.name,
              rank: points[ti][index],
              maximum: talent.maxPoints,
            },
          ]
        : [],
    ),
  }));
}
