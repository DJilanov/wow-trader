import assert from "node:assert/strict";

const families = new Map([
  [
    "Holy Light",
    { id: "holy-light", ranks: 9, coefficient: 0.714, mask: [-2147467264, 0, 1024, 0] },
  ],
  [
    "Flash of Light",
    { id: "flash-of-light", ranks: 6, coefficient: 0.429, mask: [1073750016, 0, 0, 0] },
  ],
]);

/** Extract only source-backed basic direct heals; acquisition and talents are separate.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingBaseline(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-baseline-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.classMask, 2);
  const { tables, lookupTables } = evidence;
  const names = new Map(tables.SpellName.map((row) => [row.id, row.Name_lang]));
  const casts = new Map(lookupTables.SpellCastTimes.map((row) => [row.id, row]));
  const ranges = new Map(lookupTables.SpellRange.map((row) => [row.id, row]));
  function one(table, spellId) {
    const rows = tables[table].filter(
      (row) => (["Spell", "SpellName"].includes(table) ? row.id : row.SpellID) === spellId,
    );
    assert.equal(rows.length, 1, `${table}: ${spellId}`);
    return rows[0];
  }
  assert.equal(new Set(evidence.rootSpellIds).size, evidence.rootSpellIds.length);
  const ranks = evidence.rootSpellIds
    .map((id) => {
      const family = families.get(names.get(id));
      assert(family, `Unsupported basic Paladin heal: ${id}`);
      const rank = Number(/^Rank ([1-9][0-9]*)$/.exec(one("Spell", id).NameSubtext_lang)?.[1]);
      assert(Number.isSafeInteger(rank) && rank > 0, `Missing rank: ${id}`);
      const misc = one("SpellMisc", id),
        power = one("SpellPower", id);
      const levels = one("SpellLevels", id),
        cooldown = one("SpellCooldowns", id);
      const options = one("SpellClassOptions", id),
        effect = one("SpellEffect", id);
      const cast = casts.get(misc.CastingTimeIndex),
        range = ranges.get(misc.RangeIndex);
      assert(cast && cast.Base > 0 && cast.Base === cast.Minimum, `Variable cast: ${id}`);
      assert(
        range &&
          range.RangeMin.every((value) => value === 0) &&
          range.RangeMax.every((value) => value === 40),
        `Unsupported range: ${id}`,
      );
      assert.equal(misc.SchoolMask, 2);
      assert.equal(misc.DurationIndex, 0);
      assert.equal(options.SpellClassSet, 10);
      assert.deepEqual(options.SpellClassMask, family.mask);
      assert.equal(options.ModalNextSpell, 0);
      assert.equal(power.PowerType, 0);
      for (const field of [
        "ManaCostPerLevel",
        "ManaPerSecond",
        "PowerCostPct",
        "PowerCostMaxPct",
        "OptionalCostPct",
        "PowerPctPerSecond",
        "RequiredAuraSpellID",
        "OptionalCost",
      ])
        assert.equal(power[field], 0, `${field}: ${id}`);
      for (const field of ["RecoveryTime", "CategoryRecoveryTime", "AuraSpellID"])
        assert.equal(cooldown[field], 0, `${field}: ${id}`);
      assert.equal(cooldown.StartRecoveryTime, 1500);
      assert.equal(effect.EffectIndex, 0);
      assert.equal(effect.Effect, 10);
      assert.equal(effect.EffectAura, 0);
      assert.equal(effect.EffectAuraPeriod, 0);
      assert.equal(effect.EffectTriggerSpell, 0);
      assert.deepEqual(effect.ImplicitTarget, [21, 0]);
      assert.equal(effect.EffectBonusCoefficient, family.coefficient);
      const ability = tables.SkillLineAbility.filter(
        (row) => row.Spell === id && [0, 2].includes(row.AcquireMethod),
      );
      assert(ability.length > 0, `Missing candidate ability: ${id}`);
      if (ability.every((row) => (row.ClassMask & 2) === 0)) {
        assert.equal(id, 1042, "Unreviewed zero-class-mask candidate");
        assert(ability.some((row) => row.ClassMask === 0 && row.SkillLine === 594));
        assert(evidence.supplements.some((row) => row.spellId === id));
      }
      const result = {
        id,
        family: family.id,
        rank,
        requiredLevel: levels.SpellLevel,
        baseLevel: levels.BaseLevel,
        maxLevel: levels.MaxLevel,
        mana: power.ManaCost,
        castMs: cast.Base,
        gcdMs: cooldown.StartRecoveryTime,
        range: range.RangeMax[1],
        base: effect.EffectBasePointsF,
        variance: effect.Variance,
        pointsPerLevel: effect.EffectRealPointsPerLevel,
        coefficient: effect.EffectBonusCoefficient,
      };
      for (const [key, value] of Object.entries(result))
        if (typeof value === "number") assert(Number.isFinite(value) && value >= 0, `${id}.${key}`);
      assert(result.mana > 0 && result.base > 0 && result.variance <= 2);
      return result;
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  for (const family of families.values()) {
    const selected = ranks.filter((row) => row.family === family.id);
    assert.equal(selected.length, family.ranks, `Missing ${family.id} ranks`);
    selected.forEach((row, index) => assert.equal(row.rank, index + 1, `Rank gap: ${family.id}`));
  }
  return {
    schema: "kfc-paladin-baseline-healing.v1",
    sourceBuild: evidence.source.build.buildNumber,
    ranks,
    amountRule: "base-plus-clamped-level-growth-plus-symmetric-base-variance",
    coefficientRule: "client-coefficient-without-inferred-downranking",
    trainingVerified: false,
    acquisitionVerified: false,
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    workloadAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render source-backed direct heals without admitting talents or acquisition.
 * @param {{implementation:string,baseline:object}} input @returns {string}
 */
export function renderPaladinHealingBaseline({ implementation, baseline }) {
  assert.equal(baseline.schema, "kfc-paladin-baseline-healing.v1");
  assert.equal(implementation.split("// KFC_PALADIN_CLIENT_RANKS").length, 2);
  assert.equal(baseline.ranks.length, 15);
  const entries = baseline.ranks.map(
    (rank) =>
      `{ID:${rank.id},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Mana:${rank.mana},CastMs:${rank.castMs},GCDMs:${rank.gcdMs},Base:${rank.base},Variance:${rank.variance},PointsPerLevel:${rank.pointsPerLevel},Coefficient:${rank.coefficient}}`,
  );
  return implementation.replace(
    "// KFC_PALADIN_CLIENT_RANKS",
    `var kfcPaladinHealingRanks = []kfcPaladinHealingRank{\n${entries.join(",\n")},\n}`,
  );
}
