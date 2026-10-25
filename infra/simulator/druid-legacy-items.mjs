import assert from "node:assert/strict";

/** Keep current effect evidence separate from unknown current base stats.
 * @param {object} source @returns {object}
 */
export function extractDruidLegacyItemRules(source) {
  assert.equal(source.schema, "kfc-druid-legacy-items-source.v1");
  assert.equal(source.source.clientVersion, "1.60.1.70532");
  assert.equal(source.currentBaseStatsVerified, false);
  assert.deepEqual(source.compiledReference, [
    { id: 12930, spellPower: 29 },
    { id: 18470, healingPower: 44, spirit: 0 },
  ]);
  const { tables } = source;
  assert.equal(tables.ItemXItemEffect.length, 4);
  assert.equal(tables.ItemEffect.length, 4);
  for (const [id, spellIds] of [
    [12930, [1301707, 1318326, 1318327]],
    [18470, [1318478]],
  ]) {
    const effects = tables.ItemXItemEffect.filter((row) => row.ItemID === id).map((row) => {
      const matches = tables.ItemEffect.filter((effect) => effect.id === row.ItemEffectID);
      assert.equal(matches.length, 1);
      assert.deepEqual(
        [matches[0].TriggerType, matches[0].PlayerConditionID, matches[0].ChrSpecializationID],
        [1, 0, 0],
      );
      return matches[0].SpellID;
    });
    assert.deepEqual(
      effects.sort((a, b) => a - b),
      spellIds,
    );
  }
  for (const spell of [1318326, 1318327]) {
    const effects = tables.SpellEffect.filter((row) => row.SpellID === spell).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.equal(effects.length, 2);
    for (const [index, row] of effects.entries())
      assert.deepEqual(
        [row.Effect, row.EffectAura, row.EffectBasePointsF, row.EffectMiscValue],
        [6, index ? 135 : 13, 15, [126, 0]],
      );
  }
  const royal = tables.SpellEffect.filter((row) => row.SpellID === 1318478);
  assert.equal(royal.length, 1);
  assert.deepEqual(
    [royal[0].Effect, royal[0].EffectAura, royal[0].EffectBasePointsF, royal[0].EffectMiscValue],
    [6, 29, 16, [4, 0]],
  );
  assert(
    tables.Spell.find((row) => row.id === 1318478).Description_lang.includes(
      "Forest and Grassland",
    ),
  );
  assert(
    tables.Spell.find((row) => row.id === 1318326).Description_lang.includes("Marsh and Swamp"),
  );
  return {
    schema: "kfc-druid-legacy-item-rules.v1",
    briarwoodNeutralEquipSpellPower: 15,
    briarwoodMarshEquipSpellPower: 30,
    royalForestSpirit: 16,
    compiledBriarwoodSpellPower: 29,
    compiledRoyalHealingPower: 44,
    currentBaseStatsVerified: false,
    zeroRoyalHealingIsSensitivityOnly: true,
    publicationAllowed: false,
  };
}

/** Declared alternatives, not observed server stats or an automatic zone detector.
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function druidLegacyItemPolicies() {
  return Object.freeze(
    [
      ["historical-neutral", 44, 29, false],
      ["current-equip-historical-healing", 44, 15, false],
      ["healing-not-retained-neutral", 0, 15, false],
      ["historical-forest", 44, 29, true],
      ["healing-not-retained-forest", 0, 15, true],
      ["current-marsh-historical-healing", 44, 30, false],
    ].map(([id, royalSealHealingPower, briarwoodSpellPower, royalSealForestSpirit]) =>
      Object.freeze({
        schema: "kfc-druid-legacy-item-policy.v1",
        id,
        royalSealHealingPower,
        briarwoodSpellPower,
        royalSealForestSpirit,
      }),
    ),
  );
}

/** @param {{baseline:string,workload:string}} source @returns {{baseline:string,workload:string}} */
export function renderDruidLegacyItems(source) {
  assert(!source.baseline.includes("registerKFCLegacyItems"));
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const baseline = once(
    once(
      source.baseline,
      "\titemEffects *kfcDruidItemEffects",
      "\titemEffects *kfcDruidItemEffects\n\tlegacyItems *kfcDruidLegacyItems",
    ),
    "\tresto.registerKFCDragonMark()",
    "\tresto.registerKFCDragonMark()\n\tresto.registerKFCLegacyItems()",
  );
  const field =
    '\tItemEffectsPolicy *KFCDruidItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`';
  assert.equal(source.workload.split(field).length, 3);
  let workload = source.workload.replaceAll(
    field,
    field + '\n\tLegacyItemsPolicy *KFCDruidLegacyItemPolicy `json:"legacyItemsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.ItemEffectsPolicy != nil { if err = healer.ConfigureKFCDruidItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil,err } }",
    "\tif frame.LegacyItemsPolicy != nil { if err = healer.ConfigureKFCDruidLegacyItems(sim, *frame.LegacyItemsPolicy); err != nil { return nil,err } }\n\tif frame.ItemEffectsPolicy != nil { if err = healer.ConfigureKFCDruidItemEffects(*frame.ItemEffectsPolicy); err != nil { return nil,err } }",
  );
  workload = once(
    workload,
    "\tif frame.Research != nil { policy := *frame.Research; output.Research = &policy }",
    "\tif frame.LegacyItemsPolicy != nil { policy := healer.kfcResolvedLegacyItemPolicy(); output.LegacyItemsPolicy = &policy }\n\tif frame.Research != nil { policy := *frame.Research; output.Research = &policy }",
  );
  return { baseline, workload };
}
