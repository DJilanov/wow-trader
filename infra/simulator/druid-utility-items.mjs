import assert from "node:assert/strict";

/** Capture unresolved item utility without silently treating missing handlers as zero.
 * @param {object} source @returns {object}
 */
export function extractDruidUtilityItemRules(source) {
  assert.equal(source.schema, "kfc-druid-utility-item-source.v1");
  assert.equal(source.source.clientVersion, "1.60.1.70532");
  assert.equal(source.source.buildNumber, 70532);
  assert.equal(source.serverMechanicsVerified, false);
  assert.equal(source.currentBaseStatsVerified, false);
  assert.deepEqual(source.itemIds, [6323, 8346, 11808, 13937, 18637]);
  const { tables } = source;
  function one(table, predicate) {
    const rows = tables[table].filter(predicate);
    assert.equal(rows.length, 1, table);
    return rows[0];
  }
  function item(id, spellId, trigger) {
    const link = one("ItemXItemEffect", (row) => row.ItemID === id),
      effect = one("ItemEffect", (row) => row.id === link.ItemEffectID);
    assert.deepEqual(
      [effect.SpellID, effect.TriggerType, effect.ChrSpecializationID, effect.PlayerConditionID],
      [spellId, trigger, 0, 0],
    );
    one("SpellName", (row) => row.id === spellId);
    const text = one("Spell", (row) => row.id === spellId);
    assert.equal(typeof text.Description_lang, "string");
    return effect;
  }
  function effect(spellId, index, type, aura) {
    const row = one("SpellEffect", (row) => row.SpellID === spellId && row.EffectIndex === index);
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectBonusCoefficient,
        row.EffectRealPointsPerLevel,
        row.EffectTriggerSpell,
      ],
      [type, aura, 0, 0, 0],
    );
    for (const name of ["EffectBasePointsF", "Variance", "EffectAuraPeriod"])
      assert(Number.isFinite(row[name]) && row[name] >= 0);
    return row;
  }
  function duration(spellId) {
    const misc = one("SpellMisc", (row) => row.SpellID === spellId),
      value = one("SpellDuration", (row) => row.id === misc.DurationIndex);
    assert.equal(value.Duration, value.MaxDuration);
    assert.equal(value.DurationPerResource, 0);
    return value.Duration;
  }
  function radius(effect) {
    assert(effect.EffectRadiusIndex.every((id) => id === 10));
    const row = one("SpellRadius", (row) => row.id === 10);
    assert.deepEqual([row.Radius, row.RadiusMax, row.RadiusPerLevel], [30, 30, 0]);
    return row.Radius;
  }
  function amount(row) {
    assert(row.Variance <= 1);
    return {
      mean: row.EffectBasePointsF,
      minimum: row.EffectBasePointsF * (1 - row.Variance / 2),
      maximum: row.EffectBasePointsF * (1 + row.Variance / 2),
      healingPowerCoefficient: row.EffectBonusCoefficient,
    };
  }
  assert.equal(tables.ItemXItemEffect.length, 5);
  assert.equal(tables.ItemEffect.length, 5);
  assert.equal(tables.SpellEffect.length, 8);
  const circle = item(11808, 17447, 0),
    circleMana = effect(17447, 0, 6, 24),
    circleHealth = effect(17447, 1, 6, 3),
    gloves = item(8346, 10577, 0),
    gloveHeal = effect(10577, 0, 10, 0),
    recombob = item(18637, 23064, 0),
    dispel = effect(23064, 0, 108, 0),
    recombobHeal = effect(23064, 1, 10, 0),
    recombobMana = effect(23064, 2, 30, 0),
    baron = item(6323, 1292142, 1),
    regeneration = effect(1292142, 0, 35, 161),
    headmaster = item(13937, 18264, 0),
    intellect = effect(18264, 0, 35, 29);
  assert.deepEqual(
    [
      circle.CoolDownMSec,
      circleMana.EffectBasePointsF,
      circleMana.Variance,
      circleMana.EffectAuraPeriod,
      duration(17447),
    ],
    [300000, 79, 0.5, 1000, 10000],
  );
  assert.deepEqual(
    [circleHealth.EffectBasePointsF, circleHealth.Variance, circleHealth.EffectAuraPeriod],
    [79, 0.5, 1000],
  );
  assert.deepEqual(
    [gloves.CoolDownMSec, gloveHeal.EffectBasePointsF, gloveHeal.Variance],
    [1800000, 400, 0.5],
  );
  const gcd = one("SpellCooldowns", (row) => row.SpellID === 10577);
  assert.deepEqual(
    [gcd.StartRecoveryTime, gcd.RecoveryTime, gcd.CategoryRecoveryTime],
    [1500, 0, 0],
  );
  assert.deepEqual(
    [
      recombob.CoolDownMSec,
      recombob.CategoryCoolDownMSec,
      recombob.SpellCategoryID,
      recombob.Charges,
    ],
    [300000, 120000, 1153, -10],
  );
  assert.deepEqual(dispel.EffectMiscValue, [17, 0]);
  assert.deepEqual(
    [
      recombobHeal.EffectBasePointsF,
      recombobMana.EffectBasePointsF,
      recombobHeal.Variance,
      recombobMana.Variance,
    ],
    [666, 304, 0.5, 0.5],
  );
  assert.deepEqual(
    [
      baron.CoolDownMSec,
      regeneration.EffectBasePointsF,
      regeneration.Variance,
      regeneration.EffectAuraPeriod,
    ],
    [-1, 4, 0, 0],
  );
  assert(one("Spell", (row) => row.id === 1292142).Description_lang.includes("health every 5 sec"));
  assert.deepEqual(
    [headmaster.CoolDownMSec, intellect.EffectBasePointsF, intellect.Variance, duration(18264)],
    [600000, 20, 0, 900000],
  );
  assert.deepEqual(intellect.EffectMiscValue, [3, 0]);
  return {
    schema: "kfc-druid-utility-item-rules.v1",
    sourceBuild: 70532,
    circle: {
      itemId: 11808,
      spellId: 17447,
      cooldownMs: circle.CoolDownMSec,
      channelMs: duration(17447),
      tickMs: 1000,
      ticks: 10,
      manaPerTick: amount(circleMana),
      healthPerTick: amount(circleHealth),
      healthManaRollCorrelationVerified: false,
    },
    gauntlets: {
      itemId: 8346,
      spellId: 10577,
      cooldownMs: gloves.CoolDownMSec,
      globalCooldownMs: gcd.StartRecoveryTime,
      heal: amount(gloveHeal),
      critBehaviorVerified: false,
      target: "one-friendly",
    },
    recombobulator: {
      itemId: 18637,
      spellId: 23064,
      cooldownMs: recombob.CoolDownMSec,
      sharedCooldownMs: recombob.CategoryCoolDownMSec,
      sharedCategory: 1153,
      charges: 10,
      heal: amount(recombobHeal),
      mana: amount(recombobMana),
      dispelMechanic: 17,
      target: "same-friendly-for-health-and-mana",
      critBehaviorVerified: false,
    },
    baron: {
      itemId: 6323,
      spellId: 1292142,
      healthPerFiveSeconds: 4,
      radius: radius(regeneration),
      target: "party-members",
      periodSource: "client-description",
      classifiedAsRegeneration: true,
      healingPowerCoefficient: 0,
    },
    headmaster: {
      itemId: 13937,
      spellId: 18264,
      intellect: 20,
      durationMs: duration(18264),
      cooldownMs: headmaster.CoolDownMSec,
      radius: radius(intellect),
      target: "party-members",
      stacksWithArcaneIntellectVerified: false,
    },
    currentItemSparseRows: tables.ItemSparse.map((row) => row.id).sort((a, b) => a - b),
    currentBaseStatsVerified: false,
    serverMechanicsVerified: false,
    runtimeAdmission: false,
    publicationAllowed: false,
  };
}
