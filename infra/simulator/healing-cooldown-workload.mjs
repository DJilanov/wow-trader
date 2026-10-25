import assert from "node:assert/strict";

export const healingCooldownPolicy = Object.freeze({
  schema: "kfc-healing-cooldown-policy.v1",
  manaItemIds: Object.freeze([3827, 6149, 4381, 12662, 13443, 13444]),
  manaSpellIds: Object.freeze([15604]),
  activation:
    "declared order at available cast boundaries, using the engine major-cooldown manager",
  implicitActivation: false,
  midCastTimingSearch: false,
  classMechanicsAdmission: false,
  publicationAllowed: false,
});

/** Add an explicit resource-cooldown policy without modifying frozen workload sources.
 * @param {string} source @returns {string}
 */
export function renderHealingCooldownWorkload(source) {
  const replacements = [
    [
      "type KFCHealingWorkload struct {\n",
      'type KFCHealingWorkload struct {\n\tCooldowns []KFCHealingCooldown `json:"cooldowns,omitempty"`\n',
    ],
    [
      "\tincoming := sim.Encounter.TargetUnits[0].RegisterSpell(",
      "\tif err = healer.validateKFCHealingCooldowns(frame.Cooldowns); err != nil {\n\t\treturn nil, err\n\t}\n\tincoming := sim.Encounter.TargetUnits[0].RegisterSpell(",
    ],
    [
      "\t\t\t\t\tif frame.UsePowerInfusion && pi.CanCast(sim, &healer.Unit) {",
      "\t\t\t\t\thealer.useKFCHealingCooldowns(sim, frame)\n\t\t\t\t\tif healer.CurrentHealth() > 0 && frame.UsePowerInfusion && pi.CanCast(sim, &healer.Unit) {",
    ],
    [
      "\t\t\t\t\tfor _, priority := range frame.Priorities {\n",
      "\t\t\t\t\tfor _, priority := range frame.Priorities {\n\t\t\t\t\t\tif healer.CurrentHealth() <= 0 {\n\t\t\t\t\t\t\tbreak\n\t\t\t\t\t\t}\n",
    ],
  ];
  let derived = source;
  for (const [before, after] of replacements) {
    assert.equal(
      derived.split(before).length,
      2,
      `Missing or ambiguous cooldown anchor: ${before}`,
    );
    derived = derived.replace(before, after);
  }
  return derived;
}
