import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function one(rows, predicate, label) {
  const selected = rows.filter(predicate);
  assert.equal(selected.length, 1, label);
  return selected[0];
}

/** Bind the remaining utility and legacy effects to their captured current-client payloads.
 * @param {object} evidence @returns {object}
 */
export function extractShamanUtilityItemRules(evidence) {
  reviewShamanSharedEquipmentSource(evidence);
  const { tables, lookups } = evidence;
  for (const [id, school] of [
    [9163, 2],
    [10577, 2],
    [17447, 4],
    [18264, 64],
    [18805, 64],
    [17252, 1],
    [23064, 64],
    [1292142, 2],
    [1300890, 2],
    [1300891, 2],
    [1318326, 1],
    [1318327, 1],
    [1301707, 1],
    [1318476, 1],
    [1318956, 1],
    [1287840, 32],
    [1318846, 1],
  ]) {
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "Utility spell");
    assert.equal(misc.SchoolMask, school);
    const cast = one(
      lookups.SpellCastTimes,
      (row) => row.id === misc.CastingTimeIndex,
      "Utility cast time",
    );
    assert.deepEqual([cast.Base, cast.Minimum], [0, 0]);
    assert.equal(tables.SpellPower.filter((row) => row.SpellID === id).length, 0);
  }
  const linked = (id, expected) => {
    const actual = tables.ItemXItemEffect.filter((row) => row.ItemID === id).map((link) => {
      const row = one(tables.ItemEffect, (entry) => entry.id === link.ItemEffectID, "Utility link");
      assert.deepEqual([row.ChrSpecializationID, row.PlayerConditionID], [0, 0]);
      return [
        row.SpellID,
        row.TriggerType,
        row.Charges,
        row.CoolDownMSec,
        row.CategoryCoolDownMSec,
        row.SpellCategoryID,
      ];
    });
    assert.deepEqual(
      actual.sort((a, b) => a[0] - b[0]),
      expected.sort((a, b) => a[0] - b[0]),
      "Utility item " + id,
    );
  };
  const effects = (id, expected) => {
    const rows = tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.deepEqual(
      rows.map((row) => [
        row.EffectIndex,
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.Variance,
        row.EffectAuraPeriod,
        row.EffectTriggerSpell,
        row.EffectMiscValue,
        row.ImplicitTarget,
      ]),
      expected,
      "Utility payload " + id,
    );
    for (const row of rows) {
      for (const field of [
        "EffectBonusCoefficient",
        "EffectRealPointsPerLevel",
        "EffectPointsPerResource",
        "Coefficient",
        "BonusCoefficientFromAP",
        "ResourceCoefficient",
        "ScalingClass",
      ])
        assert.equal(row[field], 0, "Unreviewed scaling " + id + "/" + field);
    }
    return rows;
  };
  const duration = (id, expected) => {
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "Utility duration link");
    const row = one(
      lookups.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Utility duration",
    );
    assert.deepEqual(
      [row.Duration, row.MaxDuration, row.DurationPerResource],
      [expected, expected, 0],
    );
  };
  const range = (id, expected) => {
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "Utility range link");
    const row = one(lookups.SpellRange, (row) => row.id === misc.RangeIndex, "Utility range");
    assert.deepEqual(
      [row.RangeMin, row.RangeMax],
      [
        [0, 0],
        [expected, expected],
      ],
    );
  };
  const radius = (id, expected) => {
    const row = one(lookups.SpellRadius, (row) => row.id === id, "Utility radius");
    assert.deepEqual([row.Radius, row.RadiusMax, row.RadiusPerLevel], [expected, expected, 0]);
  };
  const amount = (mean, variance) => ({
    mean,
    variance,
    minimum: mean * (1 - variance / 2),
    maximum: mean * (1 + variance / 2),
    rollInterpretation: "centered-uniform-reference",
  });
  const directHeals = [];
  for (const [id, spellId, mean, cooldownMs, target] of [
    [4262, 9163, 300, 300000, 1],
    [8346, 10577, 400, 1800000, 21],
  ]) {
    linked(id, [[spellId, 0, 0, cooldownMs, 0, 0]]);
    effects(spellId, [[0, 10, 0, mean, 0.5, 0, 0, [0, 0], [target, 0]]]);
    range(spellId, 40);
    const cooldown = one(tables.SpellCooldowns, (row) => row.SpellID === spellId, "Utility GCD");
    assert.deepEqual(
      [cooldown.RecoveryTime, cooldown.CategoryRecoveryTime, cooldown.StartRecoveryTime],
      [0, 0, 1500],
    );
    directHeals.push({
      itemId: id,
      spellId,
      amount: amount(mean, 0.5),
      cooldownMs,
      gcdMs: 1500,
      target: target === 1 ? "self" : "friendly",
      range: 40,
      healingPowerCoefficient: 0,
      criticalBehaviorVerified: false,
    });
  }
  const recombobulators = [];
  for (const [id, spellId, rank, healing, mana] of [
    [4381, 18805, 140, 270, 128],
    [18637, 23064, 275, 666, 304],
  ]) {
    linked(id, [[spellId, 0, -10, 300000, 120000, 1153]]);
    const sparse = one(tables.ItemSparse, (row) => row.id === id, "Engineering requirement");
    assert.deepEqual(
      [sparse.RequiredSkill, sparse.RequiredSkillRank, sparse.RequiredAbility],
      [202, rank, 0],
    );
    effects(spellId, [
      [0, 108, 0, 1, 0, 0, 0, [17, 0], [21, 0]],
      [1, 10, 0, healing, 0.5, 0, 0, [0, 0], [21, 0]],
      [2, 30, 0, mana, 0.5, 0, 0, [0, 0], [21, 0]],
    ]);
    range(spellId, 30);
    recombobulators.push({
      itemId: id,
      spellId,
      engineeringSkill: rank,
      charges: 10,
      healing: amount(healing, 0.5),
      mana: amount(mana, 0.5),
      cooldownMs: 300000,
      sharedCategory: 1153,
      sharedCooldownMs: 120000,
      range: 30,
      recipient: "same-friendly-for-health-and-mana",
      healingPowerCoefficient: 0,
      criticalBehaviorVerified: false,
      healthManaRollCorrelationVerified: false,
    });
  }
  linked(11808, [[17447, 0, 0, 300000, 0, 0]]);
  effects(17447, [
    [0, 6, 24, 79, 0.5, 1000, 0, [0, 0], [1, 0]],
    [1, 6, 3, 79, 0.5, 1000, 0, [0, 0], [1, 0]],
  ]);
  duration(17447, 10000);
  linked(13937, [[18264, 0, 0, 600000, 0, 0]]);
  const headmaster = effects(18264, [[0, 35, 29, 20, 0, 0, 0, [3, 0], [1, 0]]]);
  assert.deepEqual(headmaster[0].EffectRadiusIndex, [10, 10]);
  radius(10, 30);
  duration(18264, 900000);
  linked(13143, [[17252, 0, 0, 1800000, 0, 0]]);
  effects(17252, [
    [0, 6, 69, 500, 0, 0, 0, [127, 0], [1, 0]],
    [1, 6, 24, 22, 0, 5000, 0, [0, 0], [1, 0]],
  ]);
  duration(17252, 1800000);
  linked(6323, [[1292142, 1, 0, -1, -1, 0]]);
  const baron = effects(1292142, [[0, 35, 161, 4, 0, 0, 0, [0, 0], [1, 0]]]);
  assert.deepEqual(baron[0].EffectRadiusIndex, [10, 10]);
  const text = one(tables.Spell, (row) => row.id === 1292142, "Party regeneration units");
  assert(
    text.Description_lang.includes("party members") &&
      text.Description_lang.includes("every 5 sec"),
  );
  linked(11923, [[1300890, 1, 0, -1, -1, 0]]);
  effects(1300890, [[0, 6, 42, 100, 0, 0, 1300891, [0, 0], [1, 0]]]);
  const deathProc = one(tables.SpellAuraOptions, (row) => row.SpellID === 1300890, "Death trigger");
  assert.deepEqual(
    [deathProc.ProcChance, deathProc.ProcTypeMask, deathProc.ProcCategoryRecovery],
    [100, [16777216, 0], 0],
  );
  const grace = effects(1300891, [[0, 10, 0, 1176, 0.16, 0, 0, [0, 0], [22, 20]]]);
  assert.deepEqual(grace[0].EffectRadiusIndex, [0, 23]);
  radius(23, 40);

  linked(12930, [
    [1318326, 1, 0, -1, -1, 0],
    [1318327, 1, 0, -1, -1, 0],
    [1301707, 1, 0, -1, -1, 0],
  ]);
  for (const id of [1318326, 1318327])
    effects(id, [
      [0, 6, 13, 15, 0, 0, 0, [126, 0], [1, 0]],
      [1, 6, 135, 15, 0, 0, 0, [126, 0], [1, 0]],
    ]);
  effects(1301707, [[0, 6, 120, 0, 0, 0, 0, [0, 0], [1, 0]]]);
  linked(18471, [[1318476, 1, 0, -1, -1, 0]]);
  effects(1318476, [
    [0, 6, 13, 18, 0, 0, 0, [126, 0], [1, 0]],
    [1, 6, 135, 18, 0, 0, 0, [126, 0], [1, 0]],
    [2, 6, 180, 18, 0, 0, 0, [4, 0], [1, 0]],
  ]);
  linked(13968, [
    [1318956, 1, 0, -1, -1, 0],
    [1287840, 0, 0, 300000, 20000, 1141],
    [1318846, 1, 0, -1, -1, 0],
  ]);
  effects(1318956, [[0, 6, 57, 1, 0, 0, 0, [0, 0], [1, 0]]]);
  effects(1287840, [[0, 6, 55, 7, 0, 0, 0, [0, 0], [1, 0]]]);
  duration(1287840, 20000);
  effects(1318846, [[0, 6, 4, 0, 0, 0, 0, [0, 0], [1, 0]]]);
  const legacy = [12930, 18471, 13968].map((id) => {
    assert(evidence.currentMissingIds.includes(id));
    const item = one(evidence.items, (row) => row.id === id, "Compiled legacy item");
    return { itemId: id, compiledStats: [...item.stats], currentBaseStatsVerified: false };
  });
  assert.deepEqual(
    legacy.map((row) => [row.compiledStats[5], row.compiledStats[14]]),
    [
      [29, 0],
      [23, 0],
      [0, 1],
    ],
  );
  return {
    schema: "kfc-shaman-utility-item-rules.v1",
    sourceBuild: 70532,
    directHeals,
    recombobulators,
    circle: {
      itemId: 11808,
      spellId: 17447,
      health: amount(79, 0.5),
      mana: amount(79, 0.5),
      durationMs: 10000,
      periodMs: 1000,
      ticks: 10,
      cooldownMs: 300000,
      resourceBeforeDamageReference: true,
      channelHasteBehaviorVerified: false,
      healthManaRollCorrelationVerified: false,
    },
    headmaster: {
      itemId: 13937,
      spellId: 18264,
      intellect: 20,
      durationMs: 900000,
      cooldownMs: 600000,
      radius: 30,
      scope: "party-members",
      stackingWithRaidIntellectVerified: false,
    },
    mark: {
      itemId: 13143,
      spellId: 17252,
      shield: 500,
      mana: 22,
      periodMs: 5000,
      durationMs: 1800000,
      cooldownMs: 1800000,
      manaRequiresShield: true,
    },
    baron: {
      itemId: 6323,
      spellId: 1292142,
      healthPerFive: 4,
      radius: 30,
      scope: "party-members",
      regenerationNotHealing: true,
      tickCadenceVerified: false,
    },
    grace: {
      itemId: 11923,
      triggerSpellId: 1300890,
      spellId: 1300891,
      healing: amount(1176, 0.16),
      radius: 40,
      scope: "living-party-members-on-owner-death",
      healingPowerCoefficient: 0,
    },
    legacy,
    briarwood: {
      itemId: 12930,
      neutralEquipPower: 15,
      marshAdditionalEquipPower: 15,
      compiledSpellPower: 29,
      currentBaseStatsVerified: false,
    },
    royalSeal: {
      itemId: 18471,
      equipMagicalDamageAndHealing: 18,
      additionalDamageAgainstDemons: 18,
      additionalHealingAgainstDemons: 0,
      compiledSpellPower: 23,
      currentBaseStatsVerified: false,
    },
    eye: {
      itemId: 13968,
      spellCriticalPercentagePoints: 1,
      activeSpellHitPercentagePoints: 7,
      activeDurationMs: 20000,
      cooldownMs: 300000,
      sharedCategory: 1141,
      sharedCooldownMs: 20000,
      scriptedSpellId: 1318846,
      scriptedBehaviorVerified: false,
    },
    runtimeComponentAdmission: false,
    workloadIntegrationRequired: true,
    serverMechanicsVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
