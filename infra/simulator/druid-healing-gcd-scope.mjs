import assert from "node:assert/strict";
import { extractDruidHealingBaseline } from "./druid-healing-model.mjs";
import { extractDruidAdvancedHealing } from "./druid-healing-advanced.mjs";

/** Separate Nature's Grace's spell-family GCD modifier from its general casting haste.
 * @param {object} evidence @returns {object}
 */
export function extractDruidHealingGCDScope(evidence) {
  const effects = evidence.rawTables.SpellEffect.filter(
    (row) => row.SpellID === 16886 && row.EffectAura === 108 && row.EffectMiscValue[0] === 21,
  );
  assert.equal(effects.length, 1);
  const effect = effects[0];
  assert.equal(effect.EffectBasePointsF, -10);
  const ranks = [
      ...extractDruidHealingBaseline(evidence).ranks,
      ...extractDruidAdvancedHealing(evidence).ranks,
    ],
    included = [],
    excluded = [];
  for (const rank of ranks) {
    const matches = evidence.rawTables.SpellClassOptions.filter((row) => row.SpellID === rank.id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].SpellClassSet, 7);
    const overlaps = matches[0].SpellClassMask.some(
      (mask, index) => (mask & effect.EffectSpellClassMask[index]) !== 0,
    );
    (overlaps ? included : excluded).push(rank.id);
  }
  return {
    schema: "kfc-druid-healing-gcd-scope.v1",
    sourceBuild: evidence.source.build.buildNumber,
    spellId: 16886,
    reductionPercent: -effect.EffectBasePointsF,
    sourceMask: effect.EffectSpellClassMask,
    included: included.sort((a, b) => a - b),
    excluded: excluded.sort((a, b) => a - b),
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {string} source @param {object} scope @returns {string} */
export function renderDruidHealingGCDScope(source, scope) {
  assert.equal(scope.schema, "kfc-druid-healing-gcd-scope.v1");
  const before = "if spell.DefaultCast.GCD > 0 {";
  assert.equal(source.split(before).length, 2);
  const mask = `var kfcDruidGraceGCDSpells=map[int32]bool{${scope.included.map((id) => id + ":true").join(",")}}\n`;
  const importEnd = source.indexOf("\n)\n");
  assert(importEnd > 0);
  return (
    source.slice(0, importEnd + 3) +
    "\n" +
    mask +
    source
      .slice(importEnd + 3)
      .replace(
        before,
        "if spell.DefaultCast.GCD > 0 && kfcDruidGraceGCDSpells[spell.ActionID.SpellID] {",
      )
  );
}
