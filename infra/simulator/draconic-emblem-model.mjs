import assert from "node:assert/strict";

const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, `Missing or ambiguous ${label}`);
  return matches[0];
};

/** Decode the current passive Emblem; server trigger timing remains an explicit interpretation.
 * @param {object} evidence @returns {object}
 */
export function extractDraconicEmblemRules(evidence) {
  assert.equal(evidence.schema, "kfc-draconic-emblem-source.v1");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.manifestSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  const tables = evidence.tables,
    link = one(tables.ItemXItemEffect, (row) => row.ItemID === 22268, "Emblem link"),
    item = one(tables.ItemEffect, (row) => row.id === link.ItemEffectID, "Emblem item effect");
  assert.deepEqual(
    [
      item.id,
      item.TriggerType,
      item.SpellID,
      item.Charges,
      item.CoolDownMSec,
      item.CategoryCoolDownMSec,
      item.SpellCategoryID,
      item.PlayerConditionID,
      item.ChrSpecializationID,
    ],
    [237973, 1, 1318931, 0, -1, -1, 0, 0, 0],
  );
  const effects = tables.SpellEffect.filter((row) => [1318930, 1318931].includes(row.SpellID));
  assert.equal(effects.length, 4);
  const signatures = effects
    .map((row) => [
      row.SpellID,
      row.EffectIndex,
      row.Effect,
      row.EffectAura,
      row.EffectBasePointsF,
      row.EffectMiscValue,
      row.EffectTriggerSpell,
      row.EffectBonusCoefficient,
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(signatures, [
    [1318930, 0, 6, 13, 35, [126, 0], 0, 1],
    [1318930, 1, 6, 135, 35, [126, 0], 0, 1],
    [1318930, 2, 6, 180, 35, [2, 0], 0, 1],
    [1318931, 0, 6, 42, 1, [0, 0], 1318930, 0],
  ]);
  for (const row of effects) {
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    for (const key of [
      "DifficultyID",
      "Variance",
      "ScalingClass",
      "EffectRealPointsPerLevel",
      "EffectPointsPerResource",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
      "EffectAuraPeriod",
      "EffectChainTargets",
    ])
      assert.equal(row[key], 0, `Unreviewed Emblem ${key}`);
  }
  const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === 1318931, "Emblem trigger");
  assert.deepEqual(
    [
      proc.DifficultyID,
      proc.CumulativeAura,
      proc.ProcCategoryRecovery,
      proc.ProcChance,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [0, 0, 0, 100, 0, 0, [65536, 0]],
  );
  const misc = one(tables.SpellMisc, (row) => row.SpellID === 1318930, "Emblem duration link"),
    duration = one(tables.SpellDuration, (row) => row.id === misc.DurationIndex, "Emblem duration");
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [10000, 10000, 0],
  );
  assert.equal(evidence.definitions.aura180.name, "SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS");
  return {
    schema: "kfc-draconic-emblem-rules.v1",
    itemId: 22268,
    triggerSpellId: 1318931,
    buffSpellId: 1318930,
    spellPower: 35,
    dragonkinDamage: 35,
    durationMs: 10000,
    procChance: 1,
    onUse: false,
    assumptions: { completedHarmfulCasts: true, periodicTicks: false, serverVerified: false },
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Replace only the inherited on-use registration, preserving other item implementations.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderDraconicEmblemEffect(source, rules) {
  assert.equal(rules.schema, "kfc-draconic-emblem-rules.v1");
  assert.deepEqual(
    [
      rules.itemId,
      rules.triggerSpellId,
      rules.buffSpellId,
      rules.spellPower,
      rules.dragonkinDamage,
      rules.durationMs,
      rules.procChance,
      rules.onUse,
    ],
    [22268, 1318931, 1318930, 35, 35, 10000, 1, false],
  );
  const original =
    "\tcore.NewSimpleStatOffensiveTrinketEffect(DraconicInfusedEmblem, stats.Stats{stats.SpellDamage: 100, stats.HealingPower: 190}, time.Second*15, time.Second*90)";
  assert.equal(source.split(original).length, 2, "Legacy Emblem implementation changed");
  const replacement = `\tcore.NewItemEffect(DraconicInfusedEmblem, func(agent core.Agent) {
\t\tcharacter := agent.GetCharacter()
\t\tprocAura := character.NewTemporaryStatsAura("Draconic Infusion", core.ActionID{SpellID: 1318930}, stats.Stats{stats.SpellPower: 35}, time.Second*10)
\t\tmodifyDragonkin := func(amount float64) {
\t\t\tfor _, target := range character.Env.Encounter.TargetUnits {
\t\t\t\tif target.MobType != proto.MobType_MobTypeDragonkin { continue }
\t\t\t\tfor _, table := range character.AttackTables[target.UnitIndex] { table.BonusSpellDamageTaken += amount }
\t\t\t}
\t\t}
\t\tprocAura.ApplyOnGain(func(_ *core.Aura, _ *core.Simulation) { modifyDragonkin(35) })
\t\tprocAura.ApplyOnExpire(func(_ *core.Aura, _ *core.Simulation) { modifyDragonkin(-35) })
\t\tcore.MakeProcTriggerAura(&character.Unit, core.ProcTrigger{
\t\t\tName: "Draconic Infusion Trigger",
\t\t\tActionID: core.ActionID{SpellID: 1318931},
\t\t\tCallback: core.CallbackOnCastComplete,
\t\t\tProcMask: core.ProcMaskSpellDamage,
\t\t\tSpellFlagsExclude: core.SpellFlagPassiveSpell,
\t\t\tProcChance: 1,
\t\t\tHandler: func(sim *core.Simulation, _ *core.Spell, _ *core.SpellResult) { procAura.Activate(sim) },
\t\t})
\t})`;
  return source
    .replace(original, replacement)
    .replace(
      "\t// Use: Increases your spell damage by up to 100 and your healing by up to 190 for 15 sec. (1 Min, 30 Sec Cooldown)",
      "\t// Current client: harmful casts trigger a ten-second buff; only damage gains the Dragonkin bonus.",
    );
}
