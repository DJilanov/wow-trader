import assert from "node:assert/strict";
import { test } from "node:test";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";
import {
  decodeTalents,
  encodeTalents,
  talentProblem,
  talentsFromFields,
  talentNeighbors,
  mergeTalentSimulation,
  talentFinalists,
  selectedTalentEvidence,
} from "../infra/simulator/talent-search.mjs";

test("fresh high-iteration evidence cannot be overwritten by screening metadata", () => {
  const candidate = {
    talents: "503-2",
    rotation: 1,
    dps: 100,
    iterations: 200,
    metrics: { old: true },
  };
  const measured = { dps: 105, stdev: 4, iterations: 20000, metrics: { fresh: true } };
  assert.deepEqual(mergeTalentSimulation(measured, candidate), {
    ...measured,
    talents: candidate.talents,
    rotation: candidate.rotation,
  });
});

test("feedback retains a measured incumbent without inventing an improvement", () => {
  const rotation = { value: { type: "TypeAPL", priorityList: [] } };
  const baseline = {
    profile: "warrior",
    variant: "fury",
    revision: "pinned",
    settings: { player: { talentsString: "original", rotation: rotation.value } },
  };
  const validationSeedContext = "a".repeat(64);
  const validation = independentValidationSeeds(validationSeedContext, "talents").map((seed) => ({
    seed,
    baseline: { dps: 500, stdev: 20, iterations: 20000 },
    candidate: { dps: 500.1, stdev: 20, iterations: 20000 },
  }));
  const review = {
    profile: "warrior/fury",
    revision: "pinned",
    validated: false,
    validation,
    validationSeedContext,
    validationSeedPolicy,
    selection: { talents: "original", rotation, reason: "kept-incumbent-no-proven-gain" },
  };
  assert.equal(selectedTalentEvidence(review, baseline), review.selection);
  assert.throws(
    () =>
      selectedTalentEvidence(
        { ...review, selection: { ...review.selection, talents: "changed" } },
        baseline,
      ),
    /Unvalidated/,
  );
  assert.throws(
    () =>
      selectedTalentEvidence({ ...review, validated: true, winner: review.selection }, baseline),
    /Unsupported/,
  );
  const invalid = globalThis.structuredClone(review);
  delete invalid.validation[0].candidate.iterations;
  assert.throws(() => selectedTalentEvidence(invalid, baseline), /Unreviewed/);
  const improvement = {
    ...review,
    validated: true,
    winner: { talents: "improved", rotation },
    selection: undefined,
    validation: validation.map((entry) => ({
      ...entry,
      candidate: { ...entry.candidate, dps: 510 },
    })),
  };
  assert.equal(selectedTalentEvidence(improvement, baseline).talents, "improved");
  assert.throws(
    () =>
      selectedTalentEvidence(
        {
          ...improvement,
          validated: false,
          selection: review.selection,
        },
        baseline,
      ),
    /Unsupported no-gain/,
  );
});

const trees = [
  {
    name: "First",
    talents: [
      { fieldName: "foundation", maxPoints: 5, location: { rowIdx: 0, colIdx: 0 } },
      { fieldName: "filler", maxPoints: 5, location: { rowIdx: 0, colIdx: 1 } },
      {
        fieldName: "damage",
        maxPoints: 3,
        location: { rowIdx: 1, colIdx: 0 },
        prereqLocation: { rowIdx: 0, colIdx: 0 },
      },
    ],
  },
  {
    name: "Second",
    talents: [{ fieldName: "other", maxPoints: 5, location: { rowIdx: 0, colIdx: 0 } }],
  },
];

test("screening cannot discard the independently measured incumbent", () => {
  const incumbent = { talents: "503-2", rotation: 0, dps: 500 };
  const screened = [
    { talents: "505", rotation: 0, dps: 510 },
    { talents: "505", rotation: 1, dps: 509 },
  ];
  const selected = talentFinalists(trees, screened, [incumbent], 2);
  assert(selected.includes(incumbent));
  assert.equal(selected.length, 2);
});

test("talent encoding round-trips exact positions and rejects ambiguous input", () => {
  assert.equal(encodeTalents(decodeTalents(trees, "503-2")), "503-2");
  assert.deepEqual(decodeTalents(trees, "5"), [[5, 0, 0], [0]]);
  for (const value of ["5a", "0000", "---"]) assert.throws(() => decodeTalents(trees, value));
});
test("talent legality checks budget, rank, lower-tier spending and max-rank prerequisites", () => {
  assert.equal(talentProblem(trees, [[5, 0, 3], [2]], 10), "");
  assert.match(talentProblem(trees, [[6, 0, 2], [2]], 10), /rank/);
  assert.match(talentProblem(trees, [[4, 0, 3], [3]], 10), /tier/);
  assert.match(talentProblem(trees, [[4, 1, 3], [2]], 10), /prerequisite/);
  assert.match(talentProblem(trees, [[5, 0, 3], [1]], 10), /got 9/);
  assert.throws(() => talentsFromFields(trees, { unknown: 10 }, 10), /Unknown/);
});
test("talent neighbors preserve the exact budget and mandatory spec-defining talents", () => {
  const neighbors = talentNeighbors(trees, "503-2", { damage: 3 }, 10);
  assert(neighbors.length > 0);
  assert(!neighbors.includes("503-2"));
  assert.equal(new Set(neighbors).size, neighbors.length);
  for (const value of neighbors) {
    const points = decodeTalents(trees, value);
    assert.equal(talentProblem(trees, points, 10), "");
    assert.equal(points[0][2], 3);
    assert.equal(points[0][0], 5);
  }
});
