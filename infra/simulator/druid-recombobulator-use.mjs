import assert from "node:assert/strict";

/** Add a coupled, charged use experiment to the separately frozen coefficient probe.
 * @param {string} source @returns {string}
 */
export function renderDruidRecombobulatorUse(source) {
  function once(before, after) {
    assert.equal(source.split(before).length, 2, before);
    source = source.replace(before, after);
  }
  once(
    'MinimumMissingHealth float64  `json:"minimumMissingHealth"`',
    'RecombobulatorCanCrit bool `json:"recombobulatorCanCrit,omitempty"`\n RecombobulatorTarget string `json:"recombobulatorTarget,omitempty"`\n MinimumMissingHealth float64  `json:"minimumMissingHealth"`',
  );
  once(
    "gloves, recombob                                          *core.Spell",
    "gloves, recombob                                          *core.Spell\n recombobUse *core.Spell\n recombobCharges int\n recombobTargetMana map[int32]*core.ResourceMetrics",
  );
  once(
    '(p.Mode != "disabled" && p.Mode != "optimistic-contender")',
    '(p.Mode != "disabled" && p.Mode != "optimistic-contender" && p.Mode != "recombobulator-timed-use")',
  );
  once(
    'if p.Mode == "disabled" &&',
    'if (p.Mode == "recombobulator-timed-use" && (!p.Recombobulator || *p.HeadmasterIntellect != 0 || p.Circle || p.BaronRegeneration || p.Gauntlets || (p.RecombobulatorTarget != "self" && p.RecombobulatorTarget != "most-injured"))) || (p.Mode != "recombobulator-timed-use" && (p.RecombobulatorCanCrit || p.RecombobulatorTarget != "")) { return fmt.Errorf("invalid coupled Recombobulator policy") }\n if p.Mode == "disabled" &&',
  );
  once(
    "intellect := *p.HeadmasterIntellect",
    'if p.Mode == "recombobulator-timed-use" && !resto.kfcRecombobulatorProfession() { return fmt.Errorf("Major Recombobulator requires Engineering") }\n intellect := *p.HeadmasterIntellect',
  );
  once(
    "state.recombobMana = resto.NewManaMetrics(core.ActionID{SpellID: 23064, Tag: 1})",
    "state.recombobMana = resto.NewManaMetrics(core.ActionID{SpellID: 23064, Tag: 1})\n resto.registerKFCRecombobulatorUse()",
  );
  once(
    "state.recombobManaUsed = false",
    "state.recombobManaUsed = false\n state.recombobCharges = 10",
  );
  once(
    'if p.Mode != "optimistic-contender" {',
    'if p.Mode == "recombobulator-timed-use" { resto.kfcTryRecombobulatorUse(sim); return }\n if p.Mode != "optimistic-contender" {',
  );
  return source;
}
