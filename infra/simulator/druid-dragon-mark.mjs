import assert from "node:assert/strict";

/** Extract the ring's linked shield and mana effect without replacing provisional item stats.
 * @param {object} source @returns {object}
 */
export function extractDruidDragonMark(source) {
  assert.equal(source.schema, "kfc-druid-dragon-mark-source.v1");
  assert.equal(source.source.build.clientVersion, "1.60.1.70532");
  const { tables } = source;
  function one(name) {
    assert.equal(tables[name].length, 1, name);
    return tables[name][0];
  }
  const link = one("ItemXItemEffect"),
    item = one("ItemEffect");
  assert.deepEqual([link.ItemID, link.ItemEffectID], [13143, item.id]);
  assert.deepEqual(
    [
      item.SpellID,
      item.TriggerType,
      item.CoolDownMSec,
      item.CategoryCoolDownMSec,
      item.SpellCategoryID,
      item.Charges,
      item.ChrSpecializationID,
      item.PlayerConditionID,
    ],
    [17252, 0, 1800000, 0, 0, 0, 0, 0],
  );
  const effects = tables.SpellEffect.slice().sort((a, b) => a.EffectIndex - b.EffectIndex);
  assert.equal(effects.length, 2);
  for (const [index, row] of effects.entries()) {
    assert.deepEqual(
      [
        row.SpellID,
        row.EffectIndex,
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectAuraPeriod,
        row.ImplicitTarget,
      ],
      [
        17252,
        index,
        6,
        index === 0 ? 69 : 24,
        index === 0 ? 500 : 22,
        [index === 0 ? 127 : 0, 0],
        index === 0 ? 0 : 5000,
        [1, 0],
      ],
    );
    for (const field of [
      "EffectBonusCoefficient",
      "EffectRealPointsPerLevel",
      "Coefficient",
      "Variance",
      "ScalingClass",
      "ResourceCoefficient",
      "BonusCoefficientFromAP",
      "EffectTriggerSpell",
    ])
      assert.equal(row[field], 0);
  }
  const misc = one("SpellMisc"),
    duration = one("SpellDuration"),
    text = one("Spell");
  assert.equal(misc.SpellID, 17252);
  assert.equal(misc.DurationIndex, duration.id);
  assert.deepEqual([duration.Duration, duration.MaxDuration], [1800000, 1800000]);
  assert.equal(text.id, 17252);
  assert(text.Description_lang.includes("While the shield holds"));
  assert.equal(tables.SpellPower.length, 0);
  assert.equal(tables.SpellAuraOptions.length, 0);
  return {
    schema: "kfc-druid-dragon-mark-rules.v1",
    itemId: 13143,
    spellId: 17252,
    shield: 500,
    manaPerTick: 22,
    tickMs: 5000,
    durationMs: 1800000,
    cooldownMs: 1800000,
    manaRequiresActiveShield: true,
    sharedItemCategory: 0,
    healingPowerCoefficient: 0,
    referenceExpiryBoundary:
      "credit the final due tick once at natural expiry; canceled pools receive no future ticks",
    baseStatsRemainProvisional: true,
    serverTimingVerified: false,
    scope: "restoration-druid-only",
    publicationAllowed: false,
  };
}

/** Add class-scoped registration and explicit cooldown admission to an authenticated parent.
 * @param {{baseline:string,cooldowns:string}} source
 * @returns {{baseline:string,cooldowns:string}}
 */
export function renderDruidDragonMark(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  assert(!source.baseline.includes("registerKFCDragonMark"));
  return {
    baseline: once(
      source.baseline,
      "\tresto.registerKFCItemResources()",
      "\tresto.registerKFCItemResources()\n\tresto.registerKFCDragonMark()",
    ),
    cooldowns: once(
      source.cooldowns,
      "policy.SpellID == 1302205 ||",
      "policy.SpellID == 1302205 || policy.SpellID == 17252 ||",
    ),
  };
}
