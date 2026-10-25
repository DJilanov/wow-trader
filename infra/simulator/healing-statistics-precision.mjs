import assert from "node:assert/strict";

/** Bound negative population variance only within accumulated floating-point rounding error.
 * @param {string} source @returns {string}
 */
export function boundHealingStatisticsPrecision(source) {
  const before = "stdDev := math.Sqrt(x.sumSq/float64(x.n) - mean*mean)";
  assert.equal(source.split(before).length, 2, "Healing statistics source anchor changed");
  return source.replace(
    before,
    `secondMoment := x.sumSq/float64(x.n)
  variance := secondMoment-mean*mean
  // Sum and sum-of-squares accumulation each introduce rounding error.
  roundingBound := 8*float64(max(1,x.n))*2.220446049250313e-16*max(1,math.Abs(secondMoment),mean*mean)
  if variance < 0 && variance >= -roundingBound { variance = 0 }
  stdDev := math.Sqrt(variance)`,
  );
}
