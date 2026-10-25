import assert from "node:assert/strict";

/** Derive a separate timed-use experiment without modifying frozen probe sources.
 * @param {string} source @returns {string}
 */
export function renderDruidGauntletsUse(source) {
  function once(before, after) {
    assert.equal(source.split(before).length, 2, before);
    source = source.replace(before, after);
  }
  once(
    'MinimumMissingHealth float64  `json:"minimumMissingHealth"`',
    'GauntletsCanCrit bool `json:"gauntletsCanCrit,omitempty"`\n MinimumMissingHealth float64  `json:"minimumMissingHealth"`',
  );
  once(
    "gloves, recombob                                          *core.Spell",
    "gloves, recombob                                          *core.Spell\n gauntletUse *core.Spell",
  );
  once(
    '(p.Mode != "disabled" && p.Mode != "optimistic-contender")',
    '(p.Mode != "disabled" && p.Mode != "optimistic-contender" && p.Mode != "gauntlets-timed-use")',
  );
  once(
    'if p.Mode == "disabled" &&',
    'if (p.Mode == "gauntlets-timed-use" && (!p.Gauntlets || *p.HeadmasterIntellect != 0 || p.Circle || p.BaronRegeneration || p.Recombobulator || p.MinimumMissingMana != 0)) || (p.Mode != "gauntlets-timed-use" && p.GauntletsCanCrit) { return fmt.Errorf("invalid timed Gauntlets policy") }\n if p.Mode == "disabled" &&',
  );
  once(
    "state.gloves = registerHeal(10577)",
    "state.gloves = registerHeal(10577)\n resto.registerKFCGauntletsUse()",
  );
  once(
    'if p.Mode != "optimistic-contender" {',
    'if p.Mode == "gauntlets-timed-use" { resto.kfcTryGauntletsUse(sim); return }\n if p.Mode != "optimistic-contender" {',
  );
  return source;
}
