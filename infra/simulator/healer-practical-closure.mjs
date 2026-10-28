import assert from "node:assert/strict";

/** @typedef {{feasible:boolean,worstMissingHealth:number}} HealingPassScore */

/** Inspect improvement after a complete coupled pass; independent confirmation remains required.
 * @param {{before:HealingPassScore,after:HealingPassScore,margin?:number}} input
 * @returns {{practicalClosed:boolean,relativeImprovement:number,margin:number}}
 */
export function inspectHealingPracticalClosure({ before, after, margin = 0.02 }) {
  assert(Number.isFinite(margin) && margin > 0 && margin <= 0.02);
  for (const score of [before, after]) {
    assert(score && typeof score.feasible === "boolean");
    assert(Number.isFinite(score.worstMissingHealth) && score.worstMissingHealth >= 0);
  }
  const relativeImprovement =
    (before.worstMissingHealth - after.worstMissingHealth) / Math.max(1, after.worstMissingHealth);
  if (before.feasible && after.feasible)
    assert(
      after.worstMissingHealth <= before.worstMissingHealth + 1e-7,
      "A coupled pass cannot worsen the selected healing objective",
    );
  return {
    practicalClosed: before.feasible && after.feasible && relativeImprovement <= margin,
    relativeImprovement,
    margin,
  };
}
