import assert from "node:assert/strict";

/** @param {object} evidence @returns {object} */
export function extractDruidHealingInnervate(evidence) {
  assert.equal(evidence.schema, "kfc-druid-innervate-source.v1");
  assert.equal(evidence.source.build.buildNumber, 70532);
  const one = (name) => {
    assert.equal(evidence.tables[name].length, 1, name);
    return evidence.tables[name][0];
  };
  assert.equal(one("SpellName").Name_lang, "Innervate");
  const misc = one("SpellMisc"),
    power = one("SpellPower"),
    cooldown = one("SpellCooldowns"),
    level = one("SpellLevels"),
    duration = one("SpellDuration"),
    cast = one("SpellCastTimes"),
    family = one("SpellClassOptions");
  for (const row of [misc, power, cooldown, level, family]) assert.equal(row.SpellID, 29166);
  assert.equal(family.SpellClassSet, 7);
  assert.equal(misc.DurationIndex, duration.id);
  assert.equal(misc.CastingTimeIndex, cast.id);
  assert.equal(cast.Base, 0);
  assert.equal(misc.SchoolMask, 8);
  assert.equal(power.PowerType, 0);
  assert.equal(power.ManaCost, 0);
  assert.equal(power.PowerCostPct, 5);
  assert.equal(duration.Duration, 20000);
  assert.equal(cooldown.RecoveryTime, 360000);
  assert.equal(cooldown.StartRecoveryTime, 1500);
  assert.equal(level.SpellLevel, 40);
  const effects = evidence.tables.SpellEffect;
  assert.equal(effects.length, 2);
  for (const [index, aura, amount] of [
    [0, 134, 100],
    [1, 110, 400],
  ]) {
    const rows = effects.filter((row) => row.EffectIndex === index);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].SpellID, 29166);
    assert.equal(rows[0].Effect, 6);
    assert.equal(rows[0].EffectAura, aura);
    assert.equal(rows[0].EffectBasePointsF, amount);
    assert.deepEqual(rows[0].ImplicitTarget, [21, 0]);
  }
  return {
    schema: "kfc-druid-healing-innervate.v1",
    source: evidence.source,
    spellId: 29166,
    requiredLevel: level.SpellLevel,
    baseManaFraction: power.PowerCostPct / 100,
    gcdMs: cooldown.StartRecoveryTime,
    cooldownMs: cooldown.RecoveryTime,
    durationMs: duration.Duration,
    spiritRegenerationBonus: 4,
    fullSpiritRegenerationWhileCasting: true,
    supportedPolicy: "explicit-owned-self-cast",
    externalCastsGranted: 0,
    trainingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Add an owned self-cast without a major-cooldown manager or external charge.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderDruidHealingInnervate(source, rules) {
  assert.equal(rules.schema, "kfc-druid-healing-innervate.v1");
  const marker = "\tresto.Druid.Initialize()";
  assert.equal(source.split(marker).length, 2);
  return (
    source.replace(marker, marker + "\n\tresto.registerKFCOwnedInnervate()") +
    `
func (resto *RestorationDruid) registerKFCOwnedInnervate() {
  if resto.Level < ${rules.requiredLevel} { return }
  if core.InnervateDuration != ${rules.durationMs}*time.Millisecond || core.InnervateCD != ${rules.cooldownMs}*time.Millisecond {
    panic("Innervate core durations disagree with captured client data")
  }
  aura := core.InnervateAura(resto.GetCharacter(), resto.Index)
  resto.RegisterSpell(druid.Humanoid, core.SpellConfig{
    ActionID: core.ActionID{SpellID: ${rules.spellId}}, SpellSchool: core.SpellSchoolNature,
    Flags: core.SpellFlagHelpful | core.SpellFlagAPL, RequiredLevel: ${rules.requiredLevel},
    ManaCost: core.ManaCostOptions{BaseCost: ${rules.baseManaFraction}},
    Cast: core.CastConfig{DefaultCast: core.Cast{GCD: ${rules.gcdMs}*time.Millisecond},
      CD: core.Cooldown{Timer: resto.NewTimer(), Duration: ${rules.cooldownMs}*time.Millisecond}},
    ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
      return target == &resto.Unit && target.HasHealthBar() && target.CurrentHealth() > 0 &&
        !target.HasActiveAuraWithTag(core.InnervateAuraTag)
    },
    ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { aura.Activate(sim) },
  })
}
`
  );
}
