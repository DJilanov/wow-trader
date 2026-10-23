import assert from "node:assert/strict";

/** Keep floating-point health differences within the amount actually cast.
 * @param {string} source @returns {string}
 */
export function boundHealingAccountingPrecision(source) {
  const before = "effective = result.Target.CurrentHealth() - before";
  assert.equal(source.split(before).length, 2, "Healing precision source anchor changed");
  return source.replace(
    before,
    "effective = min(result.Damage, max(0, result.Target.CurrentHealth() - before))",
  );
}
