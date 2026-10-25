import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Preserve the spell-family restriction in the current conditional tooltip.
 * @param {object} source @returns {object}
 */
export function extractDormantHeartFamily(source) {
  assert.equal(source.schema, "kfc-dormant-heart-trigger-family-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  const { tables } = source;
  assert.equal(tables.ItemXItemEffect.length, 1);
  assert.equal(tables.ItemEffect.length, 1);
  const link = tables.ItemXItemEffect[0],
    item = tables.ItemEffect[0];
  assert.deepEqual(
    [link.ItemID, link.ItemEffectID, item.id, item.SpellID, item.TriggerType],
    [249473, item.id, link.ItemEffectID, 1249118, 1],
  );
  assert.deepEqual([item.ChrSpecializationID, item.PlayerConditionID, item.Charges], [0, 0, 0]);
  const text = one(tables.Spell, (row) => row.id === 1249118, "Dormant Heart tooltip");
  assert.equal(
    text.Description_lang,
    "Your casts of $?s2060[Greater Heal]?s5185[Healing Touch]?s331[Healing Wave]?s635[Holy Light][Greater Heal, Healing Touch, Healing Wave, or Holy Light] in combat grant up to $1249119s1 increased healing and up to $1249119s2 increased damage for $1249119d.",
  );
  const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === 1249118, "Dormant Heart proc");
  assert.deepEqual(
    [
      proc.ProcChance,
      proc.ProcTypeMask,
      proc.ProcCategoryRecovery,
      proc.ProcCharges,
      proc.CumulativeAura,
    ],
    [100, [16384, 0], 0, 0, 0],
  );
  assert.equal(tables.SpellEffect.length, 3);
  for (const [spellId, index, aura, amount, misc, trigger] of [
    [1249118, 0, 42, 0, 0, 1249119],
    [1249119, 0, 135, 40, 126, 0],
    [1249119, 1, 13, 13, 126, 0],
  ]) {
    const row = one(
      tables.SpellEffect,
      (row) => row.SpellID === spellId && row.EffectIndex === index,
      "Dormant Heart effect",
    );
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectTriggerSpell,
      ],
      [6, aura, amount, [misc, 0], trigger],
    );
    assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    assert.deepEqual(row.ImplicitTarget, [1, 0]);
    assert.equal(row.Variance, spellId === 1249118 ? 0.5 : 0);
  }
  const misc = one(
      tables.SpellMisc,
      (row) => row.SpellID === 1249119,
      "Eternal Power duration link",
    ),
    duration = one(
      tables.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Eternal Power duration",
    );
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [15000, 15000, 0],
  );
  return {
    schema: "kfc-dormant-heart-trigger-family.v1",
    itemId: 249473,
    triggerId: 1249118,
    healingPower: 40,
    spellDamage: 13,
    durationMs: 15000,
    families: {
      priest: "greater-heal",
      druid: "healing-touch",
      paladin: "holy-light",
      shaman: "healing-wave",
    },
    requiresCombat: true,
    literalChance: 1,
    chanceAndEventPoliciesUnchanged: true,
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Derive a narrow correction without editing the frozen actor or its existing controls.
 * @param {{implementation:string,controls:string,rules:object}} source
 * @returns {{implementation:string,controls:string}}
 */
export function renderDruidDormantHeartFamily(source) {
  assert.equal(source.rules.schema, "kfc-dormant-heart-trigger-family.v1");
  assert.equal(source.rules.families.druid, "healing-touch");
  const before =
    "\t\teligible := func(spell *core.Spell) bool {\n\t\t\treturn resto.kfcSelfEffectsAlive()";
  assert.equal(source.implementation.split(before).length, 2);
  let implementation = source.implementation.replace(
    before,
    `\t\teligible := func(sim *core.Simulation, spell *core.Spell) bool {
\t\t\tmatchingFamily := false
\t\t\tfor _, candidate := range resto.familySpells["healing-touch"] {
\t\t\t\tif candidate == spell { matchingFamily = true; break }
\t\t\t}
\t\t\treturn matchingFamily && sim.CurrentTime >= 0 && resto.kfcSelfEffectsAlive()`,
  );
  assert.equal(implementation.split("if eligible(spell)").length, 3);
  implementation = implementation.replaceAll("if eligible(spell)", "if eligible(sim, spell)");
  const obsoleteControl = "parent := healer.GetSpell(core.ActionID{SpellID: 774})";
  assert.equal(source.controls.split(obsoleteControl).length, 3);
  return {
    implementation,
    controls: source.controls.replaceAll(
      obsoleteControl,
      "parent := healer.GetSpell(core.ActionID{SpellID: 5185})",
    ),
  };
}
