import assert from "node:assert/strict";

/** Install the common guarded health receiver during initialization, before the first fight.
 * @param {string} source @returns {string}
 */
export function renderPaladinHealingDamageTracking(source) {
  const marker = "\tfor _, rank := range kfcPaladinHealingRanks {";
  assert.equal(
    source.split(marker).length,
    2,
    "Missing or ambiguous Paladin damage-receiver anchor",
  );
  return source.replace(marker, "\tholy.registerKFCPaladinDamageTracking()\n" + marker);
}
