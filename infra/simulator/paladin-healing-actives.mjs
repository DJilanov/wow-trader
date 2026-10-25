import assert from "node:assert/strict";

function only(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, `Missing or duplicate Paladin ${label}`);
  return matches[0];
}

/** Capture complete active-heal inputs while keeping unknown server interactions explicit.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingActives(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-healing-actives-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.classMask, 2);
  const { tables, lookupTables } = evidence;
  function one(table, id) {
    return only(
      tables[table],
      (row) => (["Spell", "SpellName"].includes(table) ? row.id : row.SpellID) === id,
      `${table}:${id}`,
    );
  }
  function effect(id, index = 0) {
    return only(
      tables.SpellEffect,
      (row) => row.SpellID === id && row.EffectIndex === index,
      `effect:${id}:${index}`,
    );
  }
  function lookup(table, id) {
    return only(lookupTables[table], (row) => row.id === id, `${table}:${id}`);
  }
  function duration(id) {
    const row = lookup("SpellDuration", one("SpellMisc", id).DurationIndex);
    assert.equal(row.Duration, row.MaxDuration);
    assert.equal(row.DurationPerResource, 0);
    return row.Duration;
  }
  function flatPower(id) {
    const row = one("SpellPower", id);
    assert.equal(row.PowerType, 0);
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
      assert.equal(row[key], 0, `Conditional Paladin cost:${id}:${key}`);
    assert(Number.isFinite(row.ManaCost) && row.ManaCost > 0);
    return row.ManaCost;
  }
  function direct(id, target, coefficient) {
    const row = effect(id),
      levels = one("SpellLevels", id),
      misc = one("SpellMisc", id);
    assert.equal(tables.SpellEffect.filter((row) => row.SpellID === id).length, 1);
    assert.equal(row.Effect, 10);
    assert.equal(row.EffectAura, 0);
    assert.equal(row.EffectAuraPeriod, 0);
    assert.equal(row.EffectTriggerSpell, 0);
    assert.deepEqual(row.ImplicitTarget, target);
    assert.equal(row.EffectBonusCoefficient, coefficient);
    assert.equal(misc.SchoolMask, 2);
    assert.equal(lookup("SpellCastTimes", misc.CastingTimeIndex).Base, 0);
    const result = {
      id,
      base: row.EffectBasePointsF,
      variance: row.Variance,
      pointsPerLevel: row.EffectRealPointsPerLevel,
      coefficient: row.EffectBonusCoefficient,
      requiredLevel: levels.SpellLevel,
      baseLevel: levels.BaseLevel,
      maxLevel: levels.MaxLevel,
    };
    for (const [key, value] of Object.entries(result))
      assert(Number.isFinite(value) && value >= 0, `Invalid Paladin heal:${id}:${key}`);
    assert(result.base > 0 && result.variance <= 2);
    return result;
  }
  function caster(id, rank, category, cooldownMs, castMs) {
    const spell = one("Spell", id),
      misc = one("SpellMisc", id),
      cooldown = one("SpellCooldowns", id),
      cast = lookup("SpellCastTimes", misc.CastingTimeIndex),
      options = one("SpellClassOptions", id),
      range = lookup("SpellRange", misc.RangeIndex),
      action = effect(id);
    assert.equal(spell.NameSubtext_lang, `Rank ${rank}`);
    assert.equal(options.SpellClassSet, 10);
    assert.deepEqual(
      options.SpellClassMask,
      category === 892 ? [2097152, 0, 0, 0] : [0, 0, 0, 67108864],
    );
    assert.equal(misc.SchoolMask, 2);
    assert.equal(misc.DurationIndex, 0);
    assert.equal(cast.Base, castMs);
    assert.equal(cast.Minimum, castMs);
    assert.deepEqual(range.RangeMin, [0, 0]);
    assert.deepEqual(range.RangeMax, [20, 40]);
    assert.equal(one("SpellCategories", id).Category, category);
    assert.equal(cooldown.RecoveryTime, 0);
    assert.equal(cooldown.CategoryRecoveryTime, cooldownMs);
    assert.equal(cooldown.StartRecoveryTime, 1500);
    assert.equal(action.Effect, 3);
    assert.equal(action.EffectTriggerSpell, 0);
    assert.deepEqual(action.ImplicitTarget, [25, 0]);
    return {
      id,
      rank,
      mana: flatPower(id),
      castMs,
      gcdMs: 1500,
      cooldownMs,
      category,
      friendlyRange: 40,
    };
  }
  assert.deepEqual(evidence.shock, [
    { cast: 1311606, heal: 1311605, damage: 1311604 },
    { cast: 20473, heal: 25914, damage: 25912 },
    { cast: 20929, heal: 25913, damage: 25911 },
    { cast: 20930, heal: 25903, damage: 25902 },
  ]);
  const shock = evidence.shock.map((link, index) => {
    const spell = caster(link.cast, index + 1, 892, 10000, 0),
      description = one("Spell", link.cast).Description_lang;
    assert(description.includes(`$${link.heal}s1 healing to an ally`));
    assert(description.includes(`$${link.damage}s1 Holy damage`));
    if (index > 0) {
      const supplement = only(
        evidence.supplements,
        (row) => row.spellId === link.cast,
        "Shock supplement",
      );
      assert(
        supplement.abilityRows.some(
          (row) => row.ClassMask === 0 && row.SkillLine === 594 && row.Spell === link.cast,
        ),
      );
      assert(
        tables.SkillLineAbility.some(
          (row) =>
            row.Spell === link.cast && row.SkillLine === 594 && [0, 2].includes(row.AcquireMethod),
        ),
      );
    }
    return { ...spell, heal: direct(link.heal, [21, 0], 0.429) };
  });
  assert.deepEqual(
    shock.map((row) => row.heal.requiredLevel),
    [30, 40, 48, 56],
  );
  assert.deepEqual(evidence.vigil, [
    { cast: 1310911, heal: 1310912, mark: 1310909 },
    { cast: 1311590, heal: 1311591, mark: 1311593 },
    { cast: 1311595, heal: 1311596, mark: 1311597 },
  ]);
  const vigil = evidence.vigil.map((link, index) => {
    const spell = caster(link.cast, index + 1, 2576, 6000, 1500),
      heal = direct(link.heal, [132, 31], 0.143),
      description = one("Spell", link.cast).Description_lang,
      mark = effect(link.mark),
      radius = lookup("SpellRadius", effect(link.heal).EffectRadiusIndex[1]);
    assert(description.includes(`$${link.mark}d`));
    assert(description.includes(`heal their party for $${link.heal}s1`));
    assert(description.includes("one Light's Vigil active per party"));
    assert.equal(mark.Effect, 6);
    assert.equal(mark.EffectAura, 4);
    assert.deepEqual(mark.ImplicitTarget, [21, 0]);
    assert.equal(duration(link.mark), 30000);
    assert.equal(radius.Radius, 40);
    assert.equal(radius.RadiusMax, 40);
    assert.equal(radius.RadiusPerLevel, 0);
    return {
      ...spell,
      heal,
      markId: link.mark,
      durationMs: 30000,
      partyRadius: 40,
      friendlyManaRefund: 0,
    };
  });
  const favorPower = one("SpellPower", 20216),
    favorCooldown = one("SpellCooldowns", 20216),
    favorEffect = effect(20216);
  assert.equal(favorPower.PowerType, 0);
  assert.equal(favorPower.ManaCost, 0);
  assert.equal(favorPower.PowerCostPct, 4);
  for (const key of [
    "ManaCostPerLevel",
    "ManaPerSecond",
    "PowerCostMaxPct",
    "OptionalCostPct",
    "PowerPctPerSecond",
    "RequiredAuraSpellID",
    "OptionalCost",
  ])
    assert.equal(favorPower[key], 0, `Conditional Divine Favor cost:${key}`);
  assert.equal(favorCooldown.RecoveryTime, 120000);
  assert.equal(favorCooldown.CategoryRecoveryTime, 0);
  assert.equal(favorCooldown.StartRecoveryTime, 0);
  assert.equal(favorEffect.Effect, 6);
  assert.equal(favorEffect.EffectAura, 107);
  assert.equal(favorEffect.EffectBasePointsF, 100);
  assert.equal(one("SpellAuraOptions", 20216).ProcCharges, 1);
  assert.equal(duration(20216), -1);
  const infusion = only(evidence.classTalents, (row) => row.spellId === 426065, "Infusion talent"),
    point = only(
      lookupTables.TraitDefinitionEffectPoints,
      (row) => row.TraitDefinitionID === infusion.definitionId && row.EffectIndex === 0,
      "Infusion curve",
    ),
    curve = lookup("Curve", point.CurveID),
    points = lookupTables.CurvePoint.filter((row) => row.CurveID === curve.id).sort(
      (a, b) => a.OrderIndex - b.OrderIndex,
    );
  assert.equal(infusion.maxRanks, 2);
  assert.equal(point.OperationType, 0);
  assert.equal(curve.Type, 0);
  assert.deepEqual(
    points.map((row) => row.Pos),
    [
      [1, -500],
      [2, -1000],
    ],
  );
  assert.equal(duration(437063), 15000);
  assert.equal(effect(437063).EffectAura, 107);
  assert.deepEqual(effect(437063).EffectSpellClassMask, [-2147483648, 0, 0, 0]);
  return {
    schema: "kfc-paladin-healing-actives.v1",
    sourceBuild: evidence.source.build.buildNumber,
    shock,
    vigil,
    divineFavor: {
      id: 20216,
      baseManaFraction: 0.04,
      cooldownMs: 120000,
      gcdMs: 0,
      criticalChanceBonus: 1,
    },
    infusion: {
      talentId: 426065,
      auraId: 437063,
      durationMs: 15000,
      castReductionMs: [0, 500, 1000],
    },
    unresolvedInteractions: [
      "Illumination multiplicity for critical Vigil party recipients requires separate explicit cases.",
    ],
    trainingVerified: false,
    acquisitionVerified: false,
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    classMechanicsAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** Render exact captured active-heal values for an isolated model derivation.
 * @param {{implementation:string,actives:object}} input @returns {string}
 */
export function renderPaladinHealingActives({ implementation, actives }) {
  assert.equal(actives.schema, "kfc-paladin-healing-actives.v1");
  assert.equal(implementation.split("// KFC_PALADIN_ACTIVE_VALUES").length, 2);
  function entries(ranks) {
    return ranks
      .map((rank) => {
        const heal = rank.heal;
        return `{Data:kfcPaladinHealingRank{ID:${rank.id},Rank:${rank.rank},RequiredLevel:${heal.requiredLevel},BaseLevel:${heal.baseLevel},MaxLevel:${heal.maxLevel},Mana:${rank.mana},CastMs:${rank.castMs},GCDMs:${rank.gcdMs},Base:${heal.base},Variance:${heal.variance},PointsPerLevel:${heal.pointsPerLevel},Coefficient:${heal.coefficient}},HealID:${heal.id},MarkID:${rank.markId ?? 0},Range:${rank.friendlyRange},Radius:${rank.partyRadius ?? 0},CooldownMs:${rank.cooldownMs},DurationMs:${rank.durationMs ?? 0}}`;
      })
      .join(",\n");
  }
  return implementation.replace(
    "// KFC_PALADIN_ACTIVE_VALUES",
    `var kfcPaladinShockRanks = []kfcPaladinActiveRank{\n${entries(actives.shock)},\n}\nvar kfcPaladinVigilRanks = []kfcPaladinActiveRank{\n${entries(actives.vigil)},\n}\nvar kfcPaladinInfusionReductionMs = []int{${actives.infusion.castReductionMs.join(",")}}\nconst kfcPaladinInfusionDurationMs = ${actives.infusion.durationMs}\nconst kfcPaladinFavorCostFraction = ${actives.divineFavor.baseManaFraction}\nconst kfcPaladinFavorCooldownMs = ${actives.divineFavor.cooldownMs}`,
  );
}
