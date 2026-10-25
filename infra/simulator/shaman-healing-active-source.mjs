import assert from "node:assert/strict";

/** Retain current active-heal, resource and totem data without asserting server routing.
 * @param {object} evidence @returns {object}
 */
export function extractShamanHealingActiveSource(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Shaman");
  assert.equal(evidence.classMask, 64);
  const { rawTables: tables, lookupTables: lookup } = evidence;
  function one(rows, test, label) {
    const matching = rows.filter(test);
    assert.equal(matching.length, 1, label);
    return matching[0];
  }
  const row = (table, id) => one(tables[table], (entry) => entry.SpellID === id, table + ":" + id),
    named = (table, id) => one(tables[table], (entry) => entry.id === id, table + ":" + id),
    effects = (id) =>
      tables.SpellEffect.filter((entry) => entry.SpellID === id).sort(
        (a, b) => a.EffectIndex - b.EffectIndex,
      );
  function duration(id) {
    const index = row("SpellMisc", id).DurationIndex,
      result = one(lookup.SpellDuration, (entry) => entry.id === index, "SpellDuration");
    assert.equal(result.Duration, result.MaxDuration);
    assert.equal(result.DurationPerResource, 0);
    return result.Duration;
  }
  function cast(id) {
    const misc = row("SpellMisc", id),
      cast = one(
        lookup.SpellCastTimes,
        (entry) => entry.id === misc.CastingTimeIndex,
        "SpellCastTimes",
      );
    assert.equal(cast.Base, 0);
    assert.equal(cast.Minimum, 0);
    return { school: misc.SchoolMask, attributes: [...misc.Attributes] };
  }
  function cost(id, expected) {
    const rows = tables.SpellPower.filter((entry) => entry.SpellID === id);
    if (expected === 0) {
      assert.equal(rows.length, 0, "Unreviewed active resource cost");
      return 0;
    }
    assert.equal(rows.length, 1);
    const result = rows[0];
    assert.equal(result.PowerType, 0);
    assert.equal(result.ManaCost, expected);
    for (const key of [
      "ManaCostPerLevel",
      "ManaPerSecond",
      "PowerCostPct",
      "PowerCostMaxPct",
      "OptionalCostPct",
      "PowerPctPerSecond",
      "RequiredAuraSpellID",
      "OptionalCost",
    ])
      assert.equal(result[key], 0, key);
    return result.ManaCost;
  }
  function cooldown(id, gcdMs, recoveryMs, categoryMs, categoryId) {
    const value = row("SpellCooldowns", id),
      category = row("SpellCategories", id);
    assert.deepEqual(
      [value.StartRecoveryTime, value.RecoveryTime, value.CategoryRecoveryTime, value.AuraSpellID],
      [gcdMs, recoveryMs, categoryMs, 0],
    );
    assert.equal(category.Category, categoryId);
    return {
      gcdMs,
      cooldownMs: recoveryMs,
      sharedCooldownMs: categoryMs,
      sharedCategory: categoryId,
    };
  }
  function rankedRoot(id, name, rank) {
    assert.equal(named("SpellName", id).Name_lang, name);
    assert.equal(named("Spell", id).NameSubtext_lang, "Rank " + rank);
    const ability = one(
      evidence.rootAbilityRows,
      (entry) => entry.Spell === id,
      "Owned class candidate",
    );
    assert.equal(ability.ClassMask, 64);
    assert.equal(ability.SkillLine, 374);
    assert.equal(ability.AcquireMethod, 0);
  }
  function fixedEffect(effect, index, kind, aura, coefficient, variance, periodMs, trigger = 0) {
    assert.deepEqual(
      [
        effect.EffectIndex,
        effect.Effect,
        effect.EffectAura,
        effect.EffectBonusCoefficient,
        effect.Variance,
        effect.EffectAuraPeriod,
      ],
      [index, kind, aura, coefficient, variance, periodMs],
    );
    for (const field of ["DifficultyID", "BonusCoefficientFromAP", "ScalingClass"])
      assert.equal(effect[field], 0, field);
    assert.equal(effect.EffectTriggerSpell, trigger);
    assert(Number.isFinite(effect.EffectBasePointsF));
    assert(
      Number.isFinite(effect.EffectRealPointsPerLevel) && effect.EffectRealPointsPerLevel >= 0,
    );
  }
  for (const id of [408521, 408510, 16188, 16190]) {
    const talent = one(
      evidence.classTalents,
      (entry) => entry.spellId === id,
      "Required Shaman healing talent",
    );
    assert.equal(talent.maxRanks, 1);
  }
  const riptide = [
    [408521, 40, 245, 480, 89, 3.7, 0],
    [1239242, 50, 300, 612, 115, 4.2, 0],
    [1239243, 60, 385, 841, 161, 4.9, 3.7],
  ].map(
    ([id, requiredLevel, mana, directBase, periodicBase, directGrowth, periodicGrowth], index) => {
      rankedRoot(id, "Riptide", index + 1);
      const levels = row("SpellLevels", id),
        misc = cast(id),
        spellClass = row("SpellClassOptions", id),
        parts = effects(id),
        range = one(
          lookup.SpellRange,
          (entry) => entry.id === row("SpellMisc", id).RangeIndex,
          "Riptide range",
        );
      assert.equal(parts.length, 3);
      assert.deepEqual(
        [levels.SpellLevel, levels.BaseLevel, levels.MaxLevel],
        [requiredLevel, requiredLevel, requiredLevel + 8],
      );
      assert.equal(misc.school, 8);
      assert.deepEqual(
        [range.RangeMin, range.RangeMax],
        [
          [0, 0],
          [40, 40],
        ],
      );
      assert.deepEqual([spellClass.SpellClassSet, spellClass.SpellClassMask], [11, [0, 0, 16, 0]]);
      assert.equal(duration(id), 15000);
      fixedEffect(parts[0], 0, 10, 0, 0.214, 0.1, 0);
      fixedEffect(parts[1], 1, 6, 8, 0.1, 0, 3000);
      fixedEffect(parts[2], 2, 6, 4, 0, 0, 0);
      assert.deepEqual(
        parts.map((entry) => [entry.EffectBasePointsF, entry.EffectRealPointsPerLevel]),
        [
          [directBase, directGrowth],
          [periodicBase, periodicGrowth],
          [25, 0],
        ],
      );
      for (const part of parts) assert.deepEqual(part.ImplicitTarget, [21, 0]);
      return {
        id,
        rank: index + 1,
        requiredTalentField: "riptide",
        requiredLevel,
        baseLevel: levels.BaseLevel,
        maxLevel: levels.MaxLevel,
        mana: cost(id, mana),
        range: 40,
        durationMs: 15000,
        tickMs: 3000,
        direct: {
          base: directBase,
          pointsPerLevel: directGrowth,
          coefficient: 0.214,
          variance: 0.1,
        },
        periodic: {
          base: periodicBase,
          pointsPerLevel: periodicGrowth,
          coefficient: 0.1,
          variance: 0,
        },
        chainHealBonusPercent: 25,
        ...cooldown(id, 1500, 0, 6000, 1228),
        attributes: misc.attributes,
        hotConsumptionByChainVerified: false,
        periodicCriticalRuleVerified: false,
        trainingVerified: false,
      };
    },
  );
  const shield = 408510,
    shieldProc = 408511,
    shieldEffects = effects(shield),
    procEffects = effects(shieldProc),
    shieldAura = row("SpellAuraOptions", shield);
  assert.equal(named("SpellName", shield).Name_lang, "Water Shield");
  assert(evidence.classTalents.some((entry) => entry.spellId === shield));
  assert.equal(shieldEffects.length, 2);
  fixedEffect(shieldEffects[0], 0, 6, 42, 0, 0, 0, shieldProc);
  fixedEffect(shieldEffects[1], 1, 6, 4, 0, 0, 0);
  assert.deepEqual(
    shieldEffects.map((entry) => [
      entry.EffectIndex,
      entry.Effect,
      entry.EffectAura,
      entry.EffectBasePointsF,
      entry.EffectTriggerSpell,
    ]),
    [
      [0, 6, 42, 100, shieldProc],
      [1, 6, 4, 1, 0],
    ],
  );
  assert.equal(procEffects.length, 1);
  fixedEffect(procEffects[0], 0, 137, 0, 0, 0, 0);
  assert.equal(procEffects[0].EffectBasePointsF, 2);
  assert.equal(procEffects[0].EffectRealPointsPerLevel, 0);
  assert.deepEqual(procEffects[0].EffectMiscValue, [0, 0]);
  assert.deepEqual(procEffects[0].ImplicitTarget, [1, 0]);
  assert.deepEqual(
    [
      shieldAura.ProcChance,
      shieldAura.ProcCharges,
      shieldAura.ProcCategoryRecovery,
      shieldAura.ProcTypeMask,
    ],
    [100, 3, 3500, [221864, 0]],
  );
  assert.equal(duration(shield), 600000);
  const waterShield = {
    id: shield,
    triggeredSpellId: shieldProc,
    requiredTalentField: "waterShield",
    mana: cost(shield, 0),
    ...cooldown(shield, 1500, 0, 0, 0),
    ...cast(shield),
    durationMs: 600000,
    charges: 3,
    procChance: 1,
    internalCooldownMs: 3500,
    maximumManaPercent: 2,
    procTypeMask: [...shieldAura.ProcTypeMask],
    serverProcEligibilityVerified: false,
  };
  const swiftnessId = 16188,
    swiftnessEffects = effects(swiftnessId),
    swiftnessAura = row("SpellAuraOptions", swiftnessId);
  assert.equal(swiftnessEffects.length, 1);
  fixedEffect(swiftnessEffects[0], 0, 6, 108, 0, 0, 0);
  assert.deepEqual(
    [
      swiftnessEffects[0].EffectBasePointsF,
      swiftnessEffects[0].EffectMiscValue,
      swiftnessEffects[0].EffectSpellClassMask,
    ],
    [-100, [10, 0], [2499, 0, 1048576, 65536]],
  );
  assert.equal(swiftnessAura.ProcCharges, 1);
  assert.equal(duration(swiftnessId), -1);
  const naturesSwiftness = {
    id: swiftnessId,
    requiredTalentField: "naturesSwiftness",
    mana: cost(swiftnessId, 0),
    ...cooldown(swiftnessId, 0, 180000, 0, 0),
    ...cast(swiftnessId),
    charges: 1,
    durationMs: -1,
    castTimeReductionPercent: 100,
    mask: [...swiftnessEffects[0].EffectSpellClassMask],
  };
  function totems(family, specs) {
    return specs.map(([id, pulseId, mana, amount], index) => {
      const tide = family === "mana-tide",
        name = tide ? "Mana Tide Totem" : "Healing Stream Totem",
        pulseName = tide ? "Mana Tide" : "Healing Stream",
        periodMs = tide ? 3000 : 2000;
      rankedRoot(id, name, index + 1);
      assert.equal(named("SpellName", pulseId).Name_lang, pulseName);
      assert.equal(named("Spell", pulseId).NameSubtext_lang, "Rank " + (index + 1));
      const description = named("Spell", id).Description_lang;
      for (const suffix of ["a1", "s1", "t1"])
        assert(
          description.includes("$" + pulseId + suffix),
          "Missing explicit totem description reference",
        );
      const summoned = effects(id),
        pulse = effects(pulseId),
        levels = row("SpellLevels", id);
      assert.equal(summoned.length, 1);
      assert.equal(pulse.length, 1);
      fixedEffect(summoned[0], 0, 28, 0, 0, 0, 0);
      assert.equal(summoned[0].EffectBasePointsF, 5);
      assert(summoned[0].EffectMiscValue[0] > 0);
      assert.equal(summoned[0].EffectMiscValue[1], 82);
      fixedEffect(pulse[0], 0, 35, tide ? 24 : 8, tide ? 0 : 0.022, 0, periodMs);
      assert.equal(pulse[0].EffectBasePointsF, amount);
      assert.equal(pulse[0].EffectRealPointsPerLevel, 0);
      assert.deepEqual(pulse[0].EffectRadiusIndex, [10, 10]);
      const radius = one(lookup.SpellRadius, (entry) => entry.id === 10, "Totem radius");
      assert.deepEqual([radius.Radius, radius.RadiusMax, radius.RadiusPerLevel], [30, 30, 0]);
      const durationMs = duration(id);
      assert.equal(durationMs, tide ? 13000 : 300000);
      assert.equal(cast(id).school, 16);
      assert.equal(cast(pulseId).school, 8);
      return {
        id,
        rank: index + 1,
        pulseId,
        pulseLink: "client-description-reference",
        requiredTalentField: tide ? "manaTideTotem" : null,
        requiredLevel: levels.SpellLevel,
        mana: cost(id, mana),
        ...cooldown(id, 1000, 0, tide ? 300000 : 0, tide ? 591 : 0),
        durationMs,
        periodMs,
        amount,
        coefficient: pulse[0].EffectBonusCoefficient,
        radius: 30,
        summonCreatureId: summoned[0].EffectMiscValue[0],
        summonPropertiesId: 82,
        sourceTargetEncoding: [...pulse[0].ImplicitTarget],
        serverNpcSpellBindingVerified: false,
        firstPulseTimingVerified: false,
        trainingVerified: false,
      };
    });
  }
  const healingStream = totems("healing-stream", [
      [5394, 5672, 40, 5],
      [6375, 6371, 50, 6],
      [6377, 6372, 60, 7],
      [10462, 10460, 70, 9],
      [10463, 10461, 80, 11],
    ]),
    manaTide = totems("mana-tide", [
      [16190, 16191, 10, 88],
      [17354, 17355, 20, 133],
      [17359, 17360, 30, 197],
      [1325256, 1325257, 60, 290],
    ]);
  return {
    schema: "kfc-shaman-active-healing-source.v1",
    sourceBuild: evidence.source.build.buildNumber,
    riptide,
    waterShield,
    naturesSwiftness,
    healingStream,
    manaTide,
    sourceOnly: true,
    modelAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
