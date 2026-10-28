import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectHealingPracticalClosure } from "./healer-practical-closure.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("./fixtures/priest-healing-practical-closure.v1.json.gz", import.meta.url),
    ),
  ),
);

test("actual complete Priest passes can close within 2% while the selected state still improves", () => {
  assert.equal(fixture.schema, "kfc-priest-practical-closure-source.v1");
  assert.equal(fixture.cases.length, 4);
  for (const row of fixture.cases) {
    assert.equal(row.completeSteps, 36);
    assert.equal(row.stateChanged, true);
    const result = inspectHealingPracticalClosure(row);
    assert.equal(result.practicalClosed, row.pass !== 0);
    assert.equal(result.margin, 0.02);
  }
});

test("a newly feasible or still infeasible pass cannot close the healing search", () => {
  const before = { feasible: false, worstMissingHealth: 100 };
  const after = { feasible: true, worstMissingHealth: 99 };
  assert.equal(inspectHealingPracticalClosure({ before, after }).practicalClosed, false);
  assert.equal(
    inspectHealingPracticalClosure({ before: after, after: before }).practicalClosed,
    false,
  );
});

test("exactly stable feasible scores close without inventing a statistical guarantee", () => {
  const score = { feasible: true, worstMissingHealth: 0 };
  assert.deepEqual(inspectHealingPracticalClosure({ before: score, after: score }), {
    practicalClosed: true,
    relativeImprovement: 0,
    margin: 0.02,
  });
});

test("worse feasible objectives, nonfinite scores and relaxed margins are rejected", () => {
  const before = { feasible: true, worstMissingHealth: 100 };
  assert.throws(() =>
    inspectHealingPracticalClosure({ before, after: { ...before, worstMissingHealth: 101 } }),
  );
  for (const value of [NaN, Infinity, -1])
    assert.throws(() =>
      inspectHealingPracticalClosure({ before, after: { ...before, worstMissingHealth: value } }),
    );
  for (const margin of [0, -1, 0.021, NaN, Infinity])
    assert.throws(() => inspectHealingPracticalClosure({ before, after: before, margin }));
});
