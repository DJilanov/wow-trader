import assert from "node:assert/strict";

export const priestHealingPatchRules = Object.freeze({
  schema: "kfc-priest-healing-patch-rules.v1",
  source:
    "https://eu.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-15-october/631316",
  renewCanCrit: true,
  periodicCritsTriggerDivineAegis: false,
  innerFocusGrantsPeriodicCrit: false,
  weakerShieldCanReplaceStronger: false,
  assumptions: {
    renewCritChance: "application-snapshot",
    shieldComparison: "new-effective-capacity-versus-existing-remaining-capacity",
  },
  classMechanicsAdmission: false,
  numericalQualification: false,
  publicationAllowed: false,
});

/** Apply documented current rules to an immutable baseline spell component.
 * @param {string} baseline @returns {string}
 */
export function renderPriestHealingPatchRules(baseline) {
  function replace(before, after) {
    assert.equal(baseline.split(before).length, 2, "Priest patch-rule source anchor changed");
    baseline = baseline.replace(before, after);
  }
  replace(
    "dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()",
    "dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()\n\t\t\t\tdot.SnapshotCritChance = min(1, max(0, dot.Spell.HealingCritChance()))",
  );
  replace(
    "dot.CalcAndDealPeriodicSnapshotHealing(sim, target, dot.OutcomeTick)",
    "dot.CalcAndDealPeriodicSnapshotHealing(sim, target, kfcRenewCriticalTick(dot))",
  );
  replace(
    "return condition(sim, target) && !priest.WeakenedSouls.Get(target).IsActive()",
    "return condition(sim, target) && !priest.WeakenedSouls.Get(target).IsActive() && priest.kfcCanReplacePowerWordShield(sim, target, rank)",
  );
  replace(
    "for _, other := range priest.PowerWordShield {\n\t\t\t\t\tif other != nil {\n\t\t\t\t\t\tother.Shield(target).Deactivate(sim)\n\t\t\t\t\t}\n\t\t\t\t}",
    "for _, other := range target.KFCActiveShieldFamily(sim, kfcPowerWordShieldFamily) { other.Deactivate(sim) }",
  );
  return baseline;
}

/** Keep deterministic amount tests explicit about crit while preserving their assertions.
 * @param {{baseline: string, talents: string}} tests
 * @returns {{baseline: string, talents: string}}
 */
export function renderPriestPatchRuleTests(tests) {
  const baselineAnchor = "\tspell := priest.Renew[9]\n";
  const talentAnchor =
    "\tbefore := target.CurrentHealth()\n\tif !priest.Renew[9].Cast(sim, target) {";
  assert.equal(tests.baseline.split(baselineAnchor).length, 2);
  assert.equal(tests.talents.split(talentAnchor).length, 2);
  return {
    baseline: tests.baseline.replace(
      baselineAnchor,
      baselineAnchor + "\tspell.BonusCritRating = -10000\n",
    ),
    talents: tests.talents.replace(
      talentAnchor,
      "\tpriest.Renew[9].BonusCritRating = -10000\n" + talentAnchor,
    ),
  };
}
