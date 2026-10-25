import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Extract owned cast effects while retaining uncertain server rates explicitly.
 * @param {object} source @returns {object}
 */
export function extractPaladinHealingCastSets(source) {
  assert.equal(source.schema, "kfc-paladin-healing-set-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  const { tables } = source;
  for (const [setId, spellId, chance, mask, child] of [
    [183, 450585, 5, 81920, 450583],
    [185, 450608, 100, 81964, 0],
    [187, 450626, 100, 81924, 27775],
    [188, 450625, 100, 81924, 27499],
  ]) {
    const bonus = one(
      tables.ItemSetSpell,
      (row) => row.ItemSetID === setId && row.Threshold === 5,
      "cast-set threshold",
    );
    assert.equal(bonus.SpellID, spellId);
    const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === spellId, "cast-set proc");
    assert.deepEqual(
      [
        proc.ProcChance,
        proc.ProcTypeMask,
        proc.ProcCategoryRecovery,
        proc.SpellProcsPerMinuteID,
        proc.ProcCharges,
      ],
      [chance, [mask, 0], 0, 0, 0],
    );
    const effect = one(tables.SpellEffect, (row) => row.SpellID === spellId, "cast-set trigger");
    assert.deepEqual(
      [effect.Effect, effect.EffectAura, effect.EffectTriggerSpell, effect.ImplicitTarget],
      [6, setId === 185 ? 4 : 42, child, [1, 0]],
    );
  }
  const mana = one(tables.SpellEffect, (row) => row.SpellID === 27782, "Wildheart mana payload");
  assert.deepEqual(
    [
      mana.Effect,
      mana.EffectBasePointsF,
      mana.EffectMiscValue,
      mana.Variance,
      mana.ScalingClass,
      mana.EffectRealPointsPerLevel,
    ],
    [30, 200, [0, 0], 0, 0, 0],
  );
  const heal = one(tables.SpellEffect, (row) => row.SpellID === 450583, "Dreadmist heal payload");
  assert.deepEqual(
    [
      heal.Effect,
      heal.EffectBasePointsF,
      heal.Variance,
      heal.EffectBonusCoefficient,
      heal.ScalingClass,
      heal.EffectRealPointsPerLevel,
    ],
    [10, 300, 0.2, 0, 0, 0],
  );
  for (const id of [27499, 27775]) {
    const effects = tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.equal(effects.length, 2);
    for (const [index, row] of effects.entries())
      assert.deepEqual(
        [
          row.Effect,
          row.EffectAura,
          row.EffectBasePointsF,
          row.EffectMiscValue,
          row.ImplicitTarget,
          row.EffectTriggerSpell,
        ],
        [6, index === 0 ? 13 : 135, 65, [126, 0], [1, 0], 0],
      );
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "cast-power duration link");
    assert.equal(
      one(tables.SpellDuration, (row) => row.id === misc.DurationIndex, "cast-power duration")
        .Duration,
      10000,
    );
  }
  return {
    schema: "kfc-paladin-healing-cast-set-rules.v1",
    setIds: [183, 185, 187, 188],
    pieces: 5,
    mana: 200,
    spellPower: 65,
    spellPowerDurationMs: 10000,
    dreadmist: { chance: 0.05, low: 270, high: 330, coefficient: 0, referenceCanCrit: false },
    wildheartReferenceManaChance: 0.02,
    wildheartDummyProcChance: 1,
    castPowerReferenceChance: 1,
    sensitivityRates: { wildheart: [0.02, 0.05, 1], spellPower: [0.05, 1] },
    scope:
      "completed owned class healing casts; excludes triggered, periodic, item, utility and hostile casts",
    serverRatesVerified: false,
    numericalAdmission: false,
    publicationAllowed: false,
  };
}

/** Derive a reviewed actor/workload copy, leaving the parent bytes untouched.
 * @param {object} source @param {string} implementation @returns {object}
 */
export function renderPaladinHealingCastSets(source, implementation) {
  const rules = extractPaladinHealingCastSets(source);
  function replace(text, anchor, value) {
    assert.equal(text.split(anchor).length, 2, "Missing or ambiguous cast-set integration");
    return text.replace(anchor, value);
  }
  const actor = replace(
    replace(
      source.integration.actor,
      "itemHealthRegen *kfcPaladinItemHealthRegen }",
      "itemHealthRegen *kfcPaladinItemHealthRegen; castSets *kfcPaladinCastSets }",
    ),
    " holy.registerKFCPaladinItemHealthRegen()",
    " holy.registerKFCPaladinItemHealthRegen()\n holy.registerKFCPaladinCastSets()",
  );
  let workload = source.integration.workload;
  assert.equal(
    workload.split('ItemHealthRegenTickMs *int64 `json:"itemHealthRegenTickMs,omitempty"`').length,
    3,
  );
  workload = workload.replaceAll(
    'ItemHealthRegenTickMs *int64 `json:"itemHealthRegenTickMs,omitempty"`',
    'ItemHealthRegenTickMs *int64 `json:"itemHealthRegenTickMs,omitempty"`\n CastSetPolicy *KFCPaladinCastSetPolicy `json:"castSetPolicy,omitempty"`',
  );
  workload = replace(
    workload,
    "if err=healer.ConfigureKFCPaladinItemHealthRegen(sim,frame.ItemHealthRegenTickMs);err!=nil{return nil,err}",
    "if err=healer.ConfigureKFCPaladinItemHealthRegen(sim,frame.ItemHealthRegenTickMs);err!=nil{return nil,err}\n if err=healer.ConfigureKFCPaladinCastSets(sim,frame.CastSetPolicy);err!=nil{return nil,err}",
  );
  workload = replace(
    workload,
    "&KFCPaladinHealingWorkloadResult{ItemHealthRegenTickMs:",
    "&KFCPaladinHealingWorkloadResult{CastSetPolicy:healer.castSets.echo,ItemHealthRegenTickMs:",
  );
  const declarations = `const kfcPaladinCastSetMana = ${rules.mana}\nconst kfcPaladinCastSetPower = ${rules.spellPower}\nconst kfcPaladinCastSetPowerMs = ${rules.spellPowerDurationMs}\nconst kfcPaladinCastSetDreadmistChance = ${rules.dreadmist.chance}\nconst kfcPaladinCastSetDreadmistLow = ${rules.dreadmist.low}\nconst kfcPaladinCastSetDreadmistHigh = ${rules.dreadmist.high}`;
  return {
    rules,
    actor,
    workload,
    implementation: replace(implementation, "// KFC_PALADIN_CAST_SET_VALUES", declarations),
  };
}
