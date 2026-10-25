import assert from "node:assert/strict";

/** Validate current self-heal, low-health resource and combat-regeneration payloads.
 * @param {object} source @returns {object}
 */
export function extractDruidSelfEffects(source) {
  assert.equal(source.schema, "kfc-druid-healing-set-effects-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  const tables = source.tables;
  function one(table, predicate, label) {
    const rows = tables[table].filter(predicate);
    assert.equal(rows.length, 1, label);
    return rows[0];
  }
  for (const [setId, pieces, spell] of [
    [183, 5, 450585],
    [162, 4, 1291796],
    [184, 6, 21347],
  ]) {
    one("ItemSet", (row) => row.id === setId, "set identity");
    one(
      "ItemSetSpell",
      (row) => row.ItemSetID === setId && row.Threshold === pieces && row.SpellID === spell,
      "set threshold",
    );
  }
  for (const [id, effect, aura, amount, trigger, variance, period] of [
    [450585, 6, 42, 300, 450583, 0, 0],
    [450583, 10, 0, 300, 0, 0.2, 0],
    [1291796, 6, 42, 25, 1291797, 0, 0],
    [21347, 6, 161, 15, 0, 0, 0],
  ]) {
    const row = one("SpellEffect", (row) => row.SpellID === id, "self effect " + id);
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectTriggerSpell,
        row.Variance,
        row.EffectAuraPeriod,
      ],
      [effect, aura, amount, trigger, variance, period],
    );
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.deepEqual(row.EffectMiscValue, [0, 0]);
    assert.equal(row.EffectBonusCoefficient, id === 450585 ? 1 : 0);
    for (const field of [
      "EffectRealPointsPerLevel",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
      "ScalingClass",
    ])
      assert.equal(row[field], 0);
  }
  const periodic = tables.SpellEffect.filter((row) => row.SpellID === 1291797).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  assert.deepEqual(
    periodic.map((row) => [
      row.Effect,
      row.EffectAura,
      row.EffectBasePointsF,
      row.EffectAuraPeriod,
      row.EffectBonusCoefficient,
      row.ImplicitTarget,
    ]),
    [
      [6, 8, 20, 1000, 0, [1, 0]],
      [6, 24, 20, 1000, 0, [1, 0]],
    ],
  );
  const durationId = one(
    "SpellMisc",
    (row) => row.SpellID === 1291797,
    "low-health duration",
  ).DurationIndex;
  assert.equal(
    one("SpellDuration", (row) => row.id === durationId, "duration value").Duration,
    5000,
  );
  for (const [id, chance, recovery, mask] of [
    [450585, 5, 0, 81920],
    [1291796, 100, 300000, -2146784600],
  ]) {
    const row = one("SpellAuraOptions", (row) => row.SpellID === id, "self proc");
    assert.deepEqual(
      [row.ProcChance, row.ProcCategoryRecovery, row.ProcTypeMask, row.ProcCharges],
      [chance, recovery, [mask, 0], 0],
    );
  }
  return {
    schema: "kfc-druid-self-effects-rules.v1",
    dreadmist: {
      setId: 183,
      pieces: 5,
      chance: 0.05,
      minimum: 270,
      maximum: 330,
      healingCoefficient: 0,
    },
    viper: {
      setId: 162,
      pieces: 4,
      healthThreshold: 0.25,
      cooldownMs: 300000,
      ticks: 5,
      tickMs: 1000,
      healingPerTick: 20,
      manaPerTick: 20,
    },
    vitality: { setId: 184, pieces: 6, healthPerFive: 15, combatAura: 161, cadenceVerified: false },
    combatAuraReference:
      "https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Spells/Auras/SpellAuraDefines.h",
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Bounded timing/crit alternatives are declared assumptions, not observed server rules.
 * @returns {ReadonlyArray<Readonly<object>>}
 */
export function druidSelfEffectsPolicies() {
  const reference = {
    schema: "kfc-druid-self-effects-policy.v1",
    id: "self-effects-reference",
    viperThresholdTiming: "after-hit",
    vitalityTickMs: 2000,
    dreadmistCrits: false,
  };
  return Object.freeze(
    [
      reference,
      { ...reference, id: "viper-before-hit", viperThresholdTiming: "before-hit" },
      { ...reference, id: "vitality-five-second-ticks", vitalityTickMs: 5000 },
      { ...reference, id: "dreadmist-crits", dreadmistCrits: true },
    ].map((row) => Object.freeze(row)),
  );
}

/** Derive Resto-only effects and opt-in caster damage while preserving frozen sources.
 * @param {{baseline:string,policies:string,workload:string}} input
 * @returns {{baseline:string,policies:string,workload:string}}
 */
export function renderDruidSelfEffects(input) {
  function once(source, before, after) {
    assert.equal(source.split(before).length, 2, before);
    return source.replace(before, after);
  }
  let baseline = once(
    input.baseline,
    "familySpells map[string][]*core.Spell",
    "familySpells map[string][]*core.Spell\n\tselfEffects *kfcDruidSelfEffects",
  );
  baseline = once(
    baseline,
    "\tresto.registerKFCAdvancedHealing()",
    "\tresto.registerKFCAdvancedHealing()\n\tresto.registerKFCSelfEffects()",
  );
  let policies = once(
    input.policies,
    "\t\t\tunit.RemoveHealth(sim, result.Damage)",
    "\t\t\tbefore := unit.CurrentHealth()\n\t\t\tunit.RemoveHealth(sim, result.Damage)",
  );
  policies = once(
    policies,
    "\t\t\t\tunit.InterruptCast(sim)\n\t\t\t}",
    "\t\t\t\tunit.InterruptCast(sim)\n\t\t\t}\n\t\t\tif unit == &healer.Unit { healer.kfcSelfEffectsAfterDamage(sim, before, result) }",
  );
  let workload = once(
    input.workload,
    "type KFCDruidHealingWorkload struct {",
    'type KFCDruidHealingWorkload struct {\n\tAllowCasterDamage bool `json:"allowCasterDamage,omitempty"`\n\tSelfEffectsPolicy *KFCDruidSelfEffectsPolicy `json:"selfEffectsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "type KFCDruidHealingWorkloadResult struct {",
    'type KFCDruidHealingWorkloadResult struct {\n\tCasterDamageEnabled bool `json:"casterDamageEnabled,omitempty"`\n\tSelfEffectsPolicy *KFCDruidSelfEffectsPolicy `json:"selfEffectsPolicy,omitempty"`\n\tSelfRegenerationMean float64 `json:"selfRegenerationMean,omitempty"`',
  );
  workload = once(
    workload,
    "\tpositions := map[int32]KFCDruidFriendlyPosition{}",
    '\tif frame.SelfEffectsPolicy != nil { if err = healer.ConfigureKFCDruidSelfEffects(*frame.SelfEffectsPolicy); err != nil { return nil,err } }\n\tif frame.AllowCasterDamage && healer.GetAura("Healing workload health receiver") == nil { return nil,fmt.Errorf("caster damage requires the workload health receiver") }\n\tpositions := map[int32]KFCDruidFriendlyPosition{}',
  );
  workload = once(
    workload,
    "|| units[event.RaidIndex] == &healer.Unit ||",
    "|| (units[event.RaidIndex] == &healer.Unit && !frame.AllowCasterDamage) ||",
  );
  workload = once(
    workload,
    "invalid post-mitigation damage event; caster-damage workloads need separate admission",
    "invalid post-mitigation damage event or caster damage without opt-in",
  );
  workload = once(
    workload,
    "\tfor iteration := int32(0);",
    "\toutput.CasterDamageEnabled = frame.AllowCasterDamage\n\tif frame.SelfEffectsPolicy != nil || healer.selfEffects.hasAny { policy := healer.kfcResolvedSelfEffectsPolicy(); output.SelfEffectsPolicy = &policy }\n\tfor iteration := int32(0);",
  );
  workload = once(
    workload,
    "\t\toutput.ManaRemainingMean += healer.CurrentMana()",
    "\t\toutput.SelfRegenerationMean += healer.kfcSelfRegenerationForIteration()\n\t\toutput.ManaRemainingMean += healer.CurrentMana()",
  );
  workload = once(
    workload,
    "\toutput.SurvivalRate /= countFloat",
    "\toutput.SelfRegenerationMean /= countFloat\n\toutput.SurvivalRate /= countFloat",
  );
  return { baseline, policies, workload };
}
