import assert from "node:assert/strict";

/** Keep dismissed pets and dead targets out of Druid spell resolution.
 * @param {{baseline:string,advanced:string}} sources @returns {{baseline:string,advanced:string}}
 */
export function renderDruidHealingTargets({ baseline, advanced }) {
  const live = "target != nil && !resto.IsOpponent(target) && target.HasHealthBar()";
  const completion =
    "config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {";
  assert.equal(advanced.split(live).length, 2);
  assert.equal(baseline.split(completion).length, 2);
  return {
    advanced: advanced.replace(live, live + " && target.IsEnabled()"),
    baseline: baseline.replace(
      completion,
      completion + "\n\t\t\tif !resto.kfcLiveFriendly(target) { return }",
    ),
  };
}
