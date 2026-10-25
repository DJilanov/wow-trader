import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Validate the current healing idols without substituting Classic descriptions.
 * @param {object} evidence @returns {object}
 */
export function extractDruidHealingIdols(evidence) {
  assert.equal(evidence.schema, "kfc-druid-healing-idol-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.equal(evidence.serverMechanicsVerified, false);
  const rows = [
    [22398, 27853, 4, 5, [0, 0], [0, 0, 0, 0], 0],
    [249396, 1248751, 137, 5, [0, 16], [0, 0, 0, 0], 0],
    [272429, 1291075, 4, 1000, [0, 0], [0, 0, 0, 0], 1],
    [279250, 1306488, 107, -3000, [11, 0], [0, 2, 0, 0], 0],
  ];
  assert.equal(evidence.items.length, 4);
  assert.equal(evidence.tables.ItemXItemEffect.length, 4);
  assert.equal(evidence.tables.ItemEffect.length, 4);
  assert.equal(evidence.tables.SpellEffect.length, 4);
  for (const [id, spellId, aura, amount, misc, mask, coefficient] of rows) {
    const item = one(evidence.items, (row) => row.id === id, "idol " + id);
    assert.deepEqual([item.type, item.rangedWeaponType], [14, 4]);
    assert(item.stats.every((value) => value === 0));
    const join = one(evidence.tables.ItemXItemEffect, (row) => row.ItemID === id, "effect join");
    const effect = one(
      evidence.tables.ItemEffect,
      (row) => row.id === join.ItemEffectID,
      "item effect",
    );
    assert.deepEqual(
      [
        effect.SpellID,
        effect.TriggerType,
        effect.Charges,
        effect.CoolDownMSec,
        effect.CategoryCoolDownMSec,
        effect.PlayerConditionID,
        effect.ChrSpecializationID,
      ],
      [spellId, 1, 0, -1, -1, 0, 0],
    );
    const spell = one(
      evidence.tables.SpellEffect,
      (row) => row.SpellID === spellId,
      "spell effect",
    );
    assert.deepEqual(
      [
        spell.Effect,
        spell.EffectAura,
        spell.EffectBasePointsF,
        spell.EffectMiscValue,
        spell.EffectSpellClassMask,
        spell.EffectBonusCoefficient,
      ],
      [6, aura, amount, misc, mask, coefficient],
    );
    assert.deepEqual(spell.ImplicitTarget, [1, 0]);
    for (const field of [
      "EffectTriggerSpell",
      "EffectRealPointsPerLevel",
      "ScalingClass",
      "Variance",
      "EffectAuraPeriod",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
    ])
      assert.equal(spell[field], 0);
    assert.equal(
      evidence.tables.SpellAuraOptions.filter((row) => row.SpellID === spellId).length,
      0,
    );
  }
  for (const [id, description] of [
    [
      27853,
      "Increases the initial healing of Regrowth by $s1% when cast on a target affected by your Rejuvenation.",
    ],
    [1248751, "Increases Spirit by $s1%."],
    [
      1291075,
      "Each of your heal over time effects on the target reduces the remaining cooldown on Swiftmend by ${$m1/1000} sec when you cast it.",
    ],
    [1306488, "Reduces the cooldown of your Swiftmend spell by ${$m1/-1000} sec."],
  ])
    assert.equal(
      one(evidence.tables.Spell, (row) => row.id === id, "idol description").Description_lang,
      description,
    );
  return {
    schema: "kfc-druid-healing-idol-rules.v1",
    regrowth: {
      itemId: 22398,
      multiplier: 1.05,
      component: "initial",
      condition: "own Rejuvenation active at heal completion",
      timingServerVerified: false,
    },
    spirit: {
      itemId: 249396,
      multiplier: 1.05,
      implementation: "existing Druid stat dependency; do not apply twice",
    },
    synthesis: {
      itemId: 272429,
      millisecondsPerOwnedHotFamily: 1000,
      countedFamilies: ["rejuvenation", "regrowth", "wild-growth"],
      excludesForeignHots: true,
      tranquilityChannelInteractionVerified: false,
    },
    swiftness: { itemId: 279250, cooldownReductionMs: 3000 },
    serverMechanicsVerified: false,
    publicationAllowed: false,
  };
}

/** Derive Resto-only hooks while keeping frozen source modules unchanged.
 * @param {{baseline:string,advanced:string}} source @returns {{baseline:string,advanced:string}}
 */
export function applyDruidHealingIdols(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  assert(!source.baseline.includes("kfcIdolDirectHealing"));
  const baseline = once(
    source.baseline,
    "spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)",
    "resto.kfcIdolDirectHealing(sim, target, spell, rank.Family, sim.Roll(low, high))",
  );
  let advanced = once(
    source.advanced,
    "config.Cast.CD = core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(rank.CooldownMs) * time.Millisecond}",
    "config.Cast.CD = core.Cooldown{Timer: resto.NewTimer(), Duration: resto.kfcIdolSwiftCooldown(rank.CooldownMs)}",
  );
  advanced = once(
    advanced,
    "spell.CalcAndDealHealing(sim, target, amount/spell.CasterHealingMultiplier(), spell.OutcomeHealingCrit)",
    "spell.CalcAndDealHealing(sim, target, amount/spell.CasterHealingMultiplier(), spell.OutcomeHealingCrit)\n\t\t\t\tresto.kfcIdolSwiftReduction(sim, target, spell)",
  );
  return { baseline, advanced };
}
