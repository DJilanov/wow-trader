import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Resolve six owned defensive/regeneration thresholds from current client rows.
 * @param {object} source @returns {object}
 */
export function extractPaladinHealingSelfSets(source) {
  assert.equal(source.schema, "kfc-paladin-healing-set-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  assert.equal(source.serverMechanicsVerified, false);
  const { tables } = source;
  const thresholds = [
    { setId: 162, pieces: 4, spellId: 1291796 },
    { setId: 163, pieces: 6, spellId: 1293670 },
    { setId: 182, pieces: 4, spellId: 27778 },
    { setId: 184, pieces: 6, spellId: 21347 },
    { setId: 189, pieces: 6, spellId: 21347 },
    { setId: 1968, pieces: 4, spellId: 1302375 },
  ];
  for (const expected of thresholds) {
    const row = one(
      tables.ItemSetSpell,
      (row) => row.ItemSetID === expected.setId && row.Threshold === expected.pieces,
      "self-set threshold",
    );
    assert.equal(row.SpellID, expected.spellId);
    assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  }
  for (const [id, chance, cooldownMs, mask, child, amount] of [
    [1291796, 100, 300000, -2146784600, 1291797, 25],
    [1293670, 100, 240000, -2146784600, 1293733, 20],
    [27778, 2, 60000, 139944, 27779, 1],
  ]) {
    const proc = one(
      tables.SpellAuraOptions,
      (row) => row.SpellID === id,
      "self-set trigger options",
    );
    assert.deepEqual(
      [
        proc.ProcChance,
        proc.ProcCategoryRecovery,
        proc.ProcTypeMask,
        proc.SpellProcsPerMinuteID,
        proc.ProcCharges,
      ],
      [chance, cooldownMs, [mask, 0], 0, 0],
    );
    const effect = one(tables.SpellEffect, (row) => row.SpellID === id, "self-set trigger");
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectTriggerSpell,
        effect.EffectBasePointsF,
        effect.ImplicitTarget,
      ],
      [6, 42, child, amount, [1, 0]],
    );
  }
  for (const [id, amount, durationMs] of [
    [1293733, 480, 10000],
    [27779, 488, 30000],
  ]) {
    const effect = one(tables.SpellEffect, (row) => row.SpellID === id, "self-set shield");
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectBasePointsF,
        effect.EffectBonusCoefficient,
        effect.EffectMiscValue,
        effect.ImplicitTarget,
      ],
      [6, 69, amount, 0, [127, 0], [1, 0]],
    );
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "self-set duration link");
    assert.equal(
      one(tables.SpellDuration, (row) => row.id === misc.DurationIndex, "self-set duration")
        .Duration,
      durationMs,
    );
  }
  const viper = tables.SpellEffect.filter((row) => row.SpellID === 1291797).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  assert.equal(viper.length, 2);
  for (const [index, effect] of viper.entries())
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectBasePointsF,
        effect.EffectAuraPeriod,
        effect.EffectBonusCoefficient,
        effect.ImplicitTarget,
      ],
      [6, index === 0 ? 8 : 24, 20, 1000, 0, [1, 0]],
    );
  const viperMisc = one(tables.SpellMisc, (row) => row.SpellID === 1291797, "Viper duration link");
  assert.equal(
    one(tables.SpellDuration, (row) => row.id === viperMisc.DurationIndex, "Viper duration")
      .Duration,
    5000,
  );
  for (const [id, effectId, rate, radius] of [
    [21347, 6, 15, 0],
    [1302375, 35, 20, 10],
  ]) {
    const effect = one(tables.SpellEffect, (row) => row.SpellID === id, "set regeneration");
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectBasePointsF,
        effect.EffectAuraPeriod,
        effect.EffectBonusCoefficient,
        effect.ImplicitTarget,
      ],
      [effectId, 161, rate, 0, 0, [1, 0]],
    );
    assert.deepEqual(effect.EffectRadiusIndex, [radius, radius]);
  }
  assert.equal(one(tables.SpellRadius, (row) => row.id === 10, "Blessed party radius").Radius, 30);
  return {
    schema: "kfc-paladin-healing-self-set-rules.v1",
    thresholds,
    viper: { threshold: 0.25, tick: 20, ticks: 5, tickMs: 1000, cooldownMs: 300000 },
    scarlet: { threshold: 0.2, shield: 480, durationMs: 10000, cooldownMs: 240000 },
    devout: {
      chance: 0.02,
      shield: 488,
      durationMs: 30000,
      cooldownMs: 60000,
      periodicDamageEligible: false,
    },
    vitality: { healthPerFive: 15 },
    blessed: { healthPerFive: 20, radius: 30, partyOnly: true },
    defaultThresholdTiming: "after-hit",
    thresholdTimingReferences: ["after-hit", "before-hit"],
    defaultRegenerationTickMs: 2000,
    regenerationTickReferences: [2000, 5000],
    defaultSelfDamageTriggers: true,
    selfDamageReferences: [true, false],
    selfDamageEligibilityVerified: false,
    regenerationCadenceVerified: false,
    regenerationCountsAsSpellHealing: false,
    numericalAdmission: false,
    publicationAllowed: false,
  };
}

const oldReceiver = `func (healer *HolyPaladin) registerKFCPaladinDamageTracking() {
\tfor _, unit := range healer.Env.Raid.AllUnits {
\t\tif unit.GetAura(core.ChanceOfDeathAuraLabel) != nil || unit.GetAura("Healing workload health receiver") != nil {
\t\t\tcontinue
\t\t}
\t\treceive := func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
\t\t\tif result.Damage <= 0 || unit.CurrentHealth() <= 0 || !unit.IsEnabled() {
\t\t\t\treturn
\t\t\t}
\t\t\tunit.RemoveHealth(sim, result.Damage)
\t\t\tif unit.CurrentHealth() <= 0 {
\t\t\t\tunit.Metrics.Died = true
\t\t\t\tunit.InterruptCast(sim)
 if unit==&healer.Unit {healer.triggerKFCGraceDeathHeal(sim)}
\t\t\t}
\t\t}
\t\tcore.MakePermanent(unit.RegisterAura(core.Aura{Label: "Healing workload health receiver", OnSpellHitTaken: receive, OnPeriodicDamageTaken: receive}))
\t}
}`;

const receiver = `func (healer *HolyPaladin) registerKFCPaladinDamageTracking() {
 for _, unit := range healer.Env.Raid.AllUnits {
  if unit.GetAura(core.ChanceOfDeathAuraLabel)!=nil || unit.GetAura("Healing workload health receiver")!=nil {continue}
  receive:=func(sim *core.Simulation,incoming *core.Spell,result *core.SpellResult,periodic bool){
   if unit.CurrentHealth()<=0 || !unit.IsEnabled(){return}
   before:=unit.CurrentHealth()
   if result.Damage>0 {unit.RemoveHealth(sim,result.Damage)}
   if unit.CurrentHealth()<=0 {
    unit.Metrics.Died=true
    unit.InterruptCast(sim)
    if unit==&healer.Unit {healer.triggerKFCGraceDeathHeal(sim)}
   }
   if unit==&healer.Unit {healer.kfcSelfSetsAfterDamage(sim,before,incoming,result,periodic)}
  }
  core.MakePermanent(unit.RegisterAura(core.Aura{Label:"Healing workload health receiver",
   OnSpellHitTaken:func(_ *core.Aura,sim *core.Simulation,spell *core.Spell,result *core.SpellResult){receive(sim,spell,result,false)},
   OnPeriodicDamageTaken:func(_ *core.Aura,sim *core.Simulation,spell *core.Spell,result *core.SpellResult){receive(sim,spell,result,true)},
  }))
 }
}`;

/** Derive only owned runtime additions and the ordered health-receiver hook.
 * @param {object} source @param {{actor:string,workload:string,damage:string}} integrations
 * @param {string} implementation @returns {object}
 */
export function renderPaladinHealingSelfSets(source, integrations, implementation) {
  const rules = extractPaladinHealingSelfSets(source);
  function replace(text, anchor, value) {
    assert.equal(text.split(anchor).length, 2, "Missing or ambiguous self-set integration");
    return text.replace(anchor, value);
  }
  const actor = replace(
    replace(
      integrations.actor,
      "castSets *kfcPaladinCastSets }",
      "castSets *kfcPaladinCastSets; selfSets *kfcPaladinSelfSets }",
    ),
    " holy.registerKFCPaladinCastSets()",
    " holy.registerKFCPaladinCastSets()\n holy.registerKFCPaladinSelfSets()",
  );
  let workload = integrations.workload;
  assert.equal(
    workload.split('CastSetPolicy *KFCPaladinCastSetPolicy `json:"castSetPolicy,omitempty"`')
      .length,
    3,
  );
  workload = workload.replaceAll(
    'CastSetPolicy *KFCPaladinCastSetPolicy `json:"castSetPolicy,omitempty"`',
    'CastSetPolicy *KFCPaladinCastSetPolicy `json:"castSetPolicy,omitempty"`\n SelfSetPolicy *KFCPaladinSelfSetPolicy `json:"selfSetPolicy,omitempty"`',
  );
  workload = replace(
    workload,
    "if err=healer.ConfigureKFCPaladinCastSets(sim,frame.CastSetPolicy);err!=nil{return nil,err}",
    "if err=healer.ConfigureKFCPaladinCastSets(sim,frame.CastSetPolicy);err!=nil{return nil,err}\n if err=healer.ConfigureKFCPaladinSelfSets(sim,frame.SelfSetPolicy);err!=nil{return nil,err}",
  );
  workload = replace(
    workload,
    "&KFCPaladinHealingWorkloadResult{CastSetPolicy:",
    "&KFCPaladinHealingWorkloadResult{SelfSetPolicy:healer.selfSets.echo,CastSetPolicy:",
  );
  const values = {
    ViperThreshold: rules.viper.threshold,
    ViperTick: rules.viper.tick,
    ViperCooldownMs: rules.viper.cooldownMs,
    ScarletThreshold: rules.scarlet.threshold,
    ScarletShield: rules.scarlet.shield,
    ScarletDurationMs: rules.scarlet.durationMs,
    ScarletCooldownMs: rules.scarlet.cooldownMs,
    DevoutShield: rules.devout.shield,
    DevoutDurationMs: rules.devout.durationMs,
    DevoutCooldownMs: rules.devout.cooldownMs,
    VitalityRate: rules.vitality.healthPerFive,
    BlessedRate: rules.blessed.healthPerFive,
    BlessedRadius: rules.blessed.radius,
  };
  const declarations =
    Object.entries(values)
      .map(([name, value]) => `const kfcPaladin${name} = ${value}`)
      .join("\n") +
    "\nvar kfcPaladinSelfSetThresholds = []struct{setID int32;pieces int}{\n" +
    rules.thresholds.map((row) => `{${row.setId},${row.pieces}},`).join("\n") +
    "\n}";
  return {
    rules,
    actor,
    workload,
    damage: replace(integrations.damage, oldReceiver, receiver),
    implementation: replace(implementation, "// KFC_PALADIN_SELF_SET_VALUES", declarations),
  };
}
