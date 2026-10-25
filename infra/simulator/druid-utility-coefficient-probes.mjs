import assert from "node:assert/strict";

/** Historical reports motivate a sensitivity case, not a current-server coefficient claim.
 * @param {string} source @returns {string}
 */
export function renderDruidUtilityCoefficientProbes(source) {
  function once(before,after){assert.equal(source.split(before).length,2,before);source=source.replace(before,after);}
  once('MinimumMissingHealth float64  `json:"minimumMissingHealth"`',
    'RecombobulatorHealingCoefficient float64 `json:"recombobulatorHealingCoefficient,omitempty"`\n RecombobulatorManaCoefficient float64 `json:"recombobulatorManaCoefficient,omitempty"`\n MinimumMissingHealth float64  `json:"minimumMissingHealth"`');
  once('if p.Mode == "disabled" &&',
    'if (p.RecombobulatorHealingCoefficient != 0 && p.RecombobulatorHealingCoefficient != 1) || (p.RecombobulatorManaCoefficient != 0 && p.RecombobulatorManaCoefficient != 1) || (!p.Recombobulator && (p.RecombobulatorHealingCoefficient != 0 || p.RecombobulatorManaCoefficient != 0)) { return fmt.Errorf("invalid legacy Recombobulator coefficient sensitivity") }\n if p.Mode == "disabled" &&');
  once('resto.AddMana(sim, 380, state.recombobMana)',
    'resto.AddMana(sim, 380 + p.RecombobulatorManaCoefficient * state.recombob.HealingPower(&resto.Unit), state.recombobMana)');
  once('spell.CalcAndDealHealing(sim, target, base,',
    'if spell == state.recombob { base += p.RecombobulatorHealingCoefficient * spell.HealingPower(target) }\n spell.CalcAndDealHealing(sim, target, base,');
  return source;
}
