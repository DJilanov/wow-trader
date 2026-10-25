import assert from "node:assert/strict";

/** Validate two flat set bonuses independently of runtime capability metadata.
 * @param {object} source @returns {object}
 */
export function extractDruidSecondarySets(source) {
  assert.equal(source.schema, "kfc-druid-secondary-sets-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  const { tables } = source;
  const sets = [
    { setId: 81, name: "The Postmaster", pieces: 3, spellId: 14047, spellPower: 23 },
    { setId: 122, name: "Necropile Raiment", pieces: 5, spellId: 14047, spellPower: 23 },
  ];
  for (const set of sets) {
    const definitions = tables.ItemSet.filter((row) => row.id === set.setId);
    assert.equal(definitions.length, 1);
    assert.equal(definitions[0].Name_lang, set.name);
    assert.equal(definitions[0].RequiredSkill, 0);
    const bonuses = tables.ItemSetSpell.filter(
      (row) => row.ItemSetID === set.setId && row.Threshold === set.pieces,
    );
    assert.equal(bonuses.length, 1);
    assert.equal(bonuses[0].SpellID, set.spellId);
  }
  assert.equal(tables.SpellEffect.length, 2);
  for (const [index, row] of tables.SpellEffect.entries()) {
    assert.deepEqual(
      [row.SpellID, row.EffectIndex, row.Effect, row.EffectAura, row.EffectBasePointsF],
      [14047, index, 6, index === 0 ? 13 : 135, 23],
    );
    assert.deepEqual(row.EffectMiscValue, [126, 0]);
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.equal(row.EffectTriggerSpell, 0);
    assert.equal(row.EffectAuraPeriod, 0);
    assert.equal(row.EffectBonusCoefficient, index);
  }
  return {
    schema: "kfc-druid-secondary-sets-rules.v1",
    sets,
    scope: "restoration-druid-controls",
    otherSetEffectsAdmitted: false,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}
