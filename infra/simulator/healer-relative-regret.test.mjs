import assert from "node:assert/strict";
import { test } from "node:test";
import { rankHealingPolicyRegret } from "./healer-relative-regret.mjs";

const policies = ["current", "mana-stress"];
function candidate(id, current, stress, feasible = [true, true]) {
  return {
    id,
    cases: [current, stress].map((meanMissingHealth, index) => ({
      policyId: policies[index],
      feasible: feasible[index],
      meanMissingHealth,
    })),
  };
}

test("finds policy-specific regret hidden by raw minimax ranking", () => {
  const rows = [candidate("raw-minimax", 100, 10), candidate("balanced", 101, 8)];
  assert(
    Math.max(...rows[0].cases.map((row) => row.meanMissingHealth)) <
      Math.max(...rows[1].cases.map((row) => row.meanMissingHealth)),
  );
  const result = rankHealingPolicyRegret(rows, policies);
  assert.equal(result[0].id, "balanced");
  assert.equal(result[0].withinTolerance, true);
  assert.equal(result[0].worstRelativeRegret, 0.01);
  assert.equal(result[1].withinTolerance, false);
  assert.equal(result[1].worstRelativeRegret, 0.25);
});

test("rejects infeasible choices while retaining feasible per-policy counterexamples", () => {
  const result = rankHealingPolicyRegret(
    [candidate("safe", 100, 10), candidate("conditional", 80, 1, [true, false])],
    policies,
  );
  assert.equal(result[0].id, "safe");
  assert.equal(result[0].withinTolerance, false);
  assert.equal(result[0].worstRelativeRegret, 0.25);
  assert.equal(result[1].feasible, false);
  assert.equal(result[1].worstRelativeRegret, null);
  const incompatible = rankHealingPolicyRegret(
    [candidate("current-only", 1, 1, [true, false]), candidate("stress-only", 1, 1, [false, true])],
    policies,
  );
  assert(incompatible.every((row) => !row.feasible && !row.withinTolerance));
  assert.throws(
    () => rankHealingPolicyRegret([candidate("dead", 1, 1, [false, false])], policies),
    /No feasible candidate/,
  );
});

test("handles perfect healing, exact tolerance and deterministic ties without mutation", () => {
  const rows = [candidate("b", 0, 10.2), candidate("a", 0, 10), candidate("c", 0, 10)];
  const before = JSON.stringify(rows),
    result = rankHealingPolicyRegret(rows, policies, 0.02);
  assert.deepEqual(
    result.map((row) => row.id),
    ["a", "c", "b"],
  );
  assert(result.every((row) => row.withinTolerance));
  assert.equal(JSON.stringify(rows), before);
});

test("rejects incomplete, reordered, duplicated and nonfinite evidence", () => {
  assert.throws(() => rankHealingPolicyRegret([], policies));
  assert.throws(
    () => rankHealingPolicyRegret([candidate("a", 1, 1), candidate("a", 2, 2)], policies),
    /Duplicate candidate/,
  );
  assert.throws(
    () => rankHealingPolicyRegret([candidate("a", 1, 1)], ["current", "current"]),
    /Duplicate healing policy/,
  );
  const missing = candidate("a", 1, 1);
  missing.cases.pop();
  assert.throws(() => rankHealingPolicyRegret([missing], policies), /Incomplete/);
  const reordered = candidate("a", 1, 1);
  reordered.cases.reverse();
  assert.throws(() => rankHealingPolicyRegret([reordered], policies), /Reordered/);
  assert.throws(() => rankHealingPolicyRegret([candidate("a", Number.NaN, 1)], policies));
  assert.throws(() => rankHealingPolicyRegret([candidate("a", -1, 1)], policies));
  assert.throws(() => rankHealingPolicyRegret([candidate("a", 1, 1)], policies, Number.NaN));
});
