import assert from "node:assert/strict";
import {
  priestHealingPatchRules,
  renderPriestHealingPatchRules,
} from "./priest-healing-patch-rules.mjs";
export { renderPriestPatchRuleTests } from "./priest-healing-patch-rules.mjs";

export const priestCurrentHealingRules = Object.freeze({
  ...priestHealingPatchRules,
  schema: "kfc-priest-healing-patch-rules.v2",
  assumptions: {
    ...priestHealingPatchRules.assumptions,
    renewCritChance: "tick-time-current-healing-crit",
  },
});

/** Retain live crit changes while using healing outcomes instead of damage-only bonuses.
 * @param {string} baseline @returns {string}
 */
export function renderPriestCurrentHealingRules(baseline) {
  const derived = renderPriestHealingPatchRules(baseline);
  const snapshot = "dot.SnapshotCritChance = min(1, max(0, dot.Spell.HealingCritChance()))";
  assert.equal(derived.split(snapshot).length, 2);
  assert.equal(derived.split("kfcRenewCriticalTick(dot)").length, 2);
  return derived
    .replace(snapshot, "")
    .replace("kfcRenewCriticalTick(dot)", "kfcRenewHealingTick(dot)");
}

/** Keep the preserved v1 shield rules without linking its superseded Renew outcome.
 * @param {string} implementation @returns {string}
 */
export function renderPriestCurrentShieldImplementation(implementation) {
  const start = implementation.indexOf("func kfcRenewCriticalTick("),
    end = implementation.indexOf("func (priest *Priest) kfcCanReplacePowerWordShield(", start);
  assert(start >= 0 && end > start);
  return implementation.slice(0, start) + implementation.slice(end);
}
