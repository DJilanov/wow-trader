import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Bind low-health restoration and incoming-hit shields to the captured current source.
 * @param {object} evidence @param {object} extension @returns {object}
 */
export function extractShamanReactiveSets(evidence, extension) {
  reviewShamanSharedEquipmentSource(evidence);
  assert.equal(extension.schema, "kfc-shaman-shared-equipment-text-extension.v1");
  const definitions = [
    {
      setId: 162,
      pieces: 4,
      spellId: 1291796,
      child: 1291797,
      chance: 100,
      cooldownMs: 300000,
      mask: -2146784600,
      amount: 25,
    },
    {
      setId: 163,
      pieces: 6,
      spellId: 1293670,
      child: 1293733,
      chance: 100,
      cooldownMs: 240000,
      mask: -2146784600,
      amount: 20,
    },
    {
      setId: 182,
      pieces: 4,
      spellId: 27778,
      child: 27779,
      chance: 2,
      cooldownMs: 60000,
      mask: 139944,
      amount: 1,
    },
  ];
  for (const expected of definitions) {
    const threshold = one(
      evidence.tables.ItemSetSpell,
      (row) => row.ItemSetID === expected.setId && row.Threshold === expected.pieces,
      "Reactive set threshold",
    );
    assert.deepEqual(
      [threshold.SpellID, threshold.ChrSpecID, threshold.TraitSubTreeID],
      [expected.spellId, 0, 0],
    );
    const proc = one(
      evidence.tables.SpellAuraOptions,
      (row) => row.SpellID === expected.spellId,
      "Reactive set trigger",
    );
    assert.deepEqual(
      [
        proc.ProcChance,
        proc.ProcCategoryRecovery,
        proc.ProcTypeMask,
        proc.SpellProcsPerMinuteID,
        proc.ProcCharges,
      ],
      [expected.chance, expected.cooldownMs, [expected.mask, 0], 0, 0],
    );
    const effect = one(
      evidence.tables.SpellEffect,
      (row) => row.SpellID === expected.spellId,
      "Reactive set payload",
    );
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectTriggerSpell,
        effect.EffectBasePointsF,
        effect.ImplicitTarget,
      ],
      [6, 42, expected.child, expected.amount, [1, 0]],
    );
  }
  for (const id of definitions.flatMap((row) => [row.spellId, row.child])) {
    for (const table of ["Spell", "SpellName", "SpellMisc", "SpellEffect", "SpellAuraOptions"]) {
      const original = evidence.tables[table].filter((row) => (row.SpellID ?? row.id) === id);
      const extended = extension.tables[table].filter((row) => (row.SpellID ?? row.id) === id);
      assert.deepEqual(extended, original, "Reactive set source disagreement " + table + "/" + id);
    }
  }
  const duration = (spellId) => {
    const misc = one(
      evidence.tables.SpellMisc,
      (row) => row.SpellID === spellId,
      "Reactive duration link",
    );
    return one(
      evidence.lookups.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Reactive duration",
    ).Duration;
  };
  const viper = evidence.tables.SpellEffect.filter((row) => row.SpellID === 1291797).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  assert.equal(viper.length, 2);
  for (const [index, row] of viper.entries())
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectAuraPeriod,
        row.EffectBonusCoefficient,
        row.ImplicitTarget,
      ],
      [6, index === 0 ? 8 : 24, 20, 1000, 0, [1, 0]],
    );
  assert.equal(duration(1291797), 5000);
  for (const [id, amount, ms] of [
    [1293733, 480, 10000],
    [27779, 488, 30000],
  ]) {
    const row = one(evidence.tables.SpellEffect, (row) => row.SpellID === id, "Reactive shield");
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectBonusCoefficient,
        row.EffectMiscValue,
        row.ImplicitTarget,
      ],
      [6, 69, amount, 0, [127, 0], [1, 0]],
    );
    assert.equal(duration(id), ms);
  }
  return {
    schema: "kfc-shaman-reactive-set-rules.v1",
    sourceBuild: 70532,
    definitions,
    viper: { threshold: 0.25, amount: 20, ticks: 5, tickMs: 1000, cooldownMs: 300000 },
    scarlet: { threshold: 0.2, amount: 480, durationMs: 10000, cooldownMs: 240000 },
    devout: {
      chance: 0.02,
      amount: 488,
      durationMs: 30000,
      cooldownMs: 60000,
      periodicDamageEligible: false,
    },
    thresholdTimingReferences: ["after-hit", "before-hit"],
    selfDamageReferences: [false, true],
    serverTriggerTimingVerified: false,
    selfDamageEligibilityVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

function once(text, before, after) {
  assert.equal(text.split(before).length, 2, "Reactive set integration: " + before);
  return text.replace(before, after);
}

/** Add owned effects and call them after the existing single health deduction.
 * @param {object} input @returns {object}
 */
export function renderShamanReactiveSets(input) {
  const rules = extractShamanReactiveSets(input.evidence, input.extension);
  const values = Object.entries({
    ViperThreshold: rules.viper.threshold,
    ViperAmount: rules.viper.amount,
    ViperTicks: rules.viper.ticks,
    ViperTickMs: rules.viper.tickMs,
    ViperCooldownMs: rules.viper.cooldownMs,
    ScarletThreshold: rules.scarlet.threshold,
    ScarletAmount: rules.scarlet.amount,
    ScarletDurationMs: rules.scarlet.durationMs,
    ScarletCooldownMs: rules.scarlet.cooldownMs,
    DevoutAmount: rules.devout.amount,
    DevoutDurationMs: rules.devout.durationMs,
    DevoutCooldownMs: rules.devout.cooldownMs,
  })
    .map(([name, value]) => `const kfcShamanReactive${name} = ${value}`)
    .join("\n");
  const before = input.damage.slice(
    input.damage.indexOf("func (resto *RestorationShaman) registerKFCShamanWorkloadDamage() {"),
  );
  assert(before.startsWith("func (resto *RestorationShaman) registerKFCShamanWorkloadDamage() {"));
  const after = `func (resto *RestorationShaman) registerKFCShamanWorkloadDamage() {
 for _, unit := range resto.kfcHealingPlayers() {
  if unit.GetAura(core.ChanceOfDeathAuraLabel) != nil || unit.GetAura("Healing workload health receiver") != nil { continue }
  receive := func(sim *core.Simulation, incoming *core.Spell, result *core.SpellResult, periodic bool) {
   if result == nil || unit.CurrentHealth() <= 0 || !unit.IsEnabled() { return }
   before := unit.CurrentHealth()
   if result.Damage > 0 { unit.RemoveHealth(sim, result.Damage) }
   if unit.CurrentHealth() <= 0 { unit.Metrics.Died = true; unit.InterruptCast(sim) }
   if unit == &resto.Unit { resto.kfcShamanReactiveAfterDamage(sim, before, incoming, result, periodic) }
  }
  core.MakePermanent(unit.RegisterAura(core.Aura{Label: "Healing workload health receiver",
   OnSpellHitTaken: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) { receive(sim, spell, result, false) },
   OnPeriodicDamageTaken: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) { receive(sim, spell, result, true) },
  }))
 }
}
`;
  return {
    rules,
    implementation: once(input.implementation, "// KFC_SHAMAN_REACTIVE_SET_VALUES", values),
    actor: once(
      once(
        input.actor,
        "type RestorationShaman struct {",
        "type RestorationShaman struct {\n kfcReactiveSets *kfcShamanReactiveSets",
      ),
      "\tresto.registerKFCShamanHealingItems()",
      "\tresto.registerKFCShamanHealingItems()\n resto.registerKFCShamanReactiveSets()",
    ),
    damage: once(input.damage, before, after),
  };
}
