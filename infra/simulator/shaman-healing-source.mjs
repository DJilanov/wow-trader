import assert from "node:assert/strict";

const families = new Map([
  [
    "Healing Wave",
    {
      id: "healing-wave",
      ranks: 10,
      mask: 64,
      target: 45,
      chainTargets: 0,
      chainAmplitude: 0.2,
      coefficients: [0.429, 0.571, 0.714, ...Array(7).fill(0.857)],
    },
  ],
  [
    "Lesser Healing Wave",
    {
      id: "lesser-healing-wave",
      ranks: 6,
      mask: 128,
      target: 21,
      chainTargets: 0,
      chainAmplitude: 1,
      coefficients: Array(6).fill(0.429),
    },
  ],
  [
    "Chain Heal",
    {
      id: "chain-heal",
      ranks: 3,
      mask: 256,
      target: 45,
      chainTargets: 3,
      chainAmplitude: 0.5,
      coefficients: Array(3).fill(0.714),
    },
  ],
]);

/** Validate and retain captured client ranks; this does not admit a healing model.
 * @param {object} evidence
 * @returns {object}
 */
export function extractShamanHealingSource(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Shaman");
  assert.equal(evidence.classMask, 64);
  assert.equal(evidence.source.build.product, "wow_classic_beta");
  assert(/^1\.60\.1\.\d+$/.test(evidence.source.build.clientVersion));
  assert.equal(
    Number(evidence.source.build.clientVersion.split(".").at(-1)),
    evidence.source.build.buildNumber,
  );
  for (const digest of [evidence.source.manifest.byteSha256, evidence.source.hotfixSha256])
    assert(/^[a-f0-9]{64}$/.test(digest), "Missing client source identity");

  const tables = evidence.rawTables;
  function index(rows, label) {
    assert(Array.isArray(rows), `Missing ${label}`);
    const result = new Map(rows.map((row) => [row.id, row]));
    assert.equal(result.size, rows.length, `Duplicate ${label} ID`);
    return result;
  }
  const names = index(tables.SpellName, "SpellName"),
    spells = index(tables.Spell, "Spell"),
    casts = index(evidence.lookupTables.SpellCastTimes, "SpellCastTimes"),
    ranges = index(evidence.lookupTables.SpellRange, "SpellRange"),
    candidates = evidence.rootAbilityRows.filter((row) =>
      families.has(names.get(row.Spell)?.Name_lang),
    );
  assert.equal(new Set(candidates.map((row) => row.Spell)).size, candidates.length);
  function one(table, spellId) {
    const matches = tables[table].filter((row) => row.SpellID === spellId);
    assert.equal(matches.length, 1, `Expected one ${table} record for ${spellId}`);
    return matches[0];
  }
  const ranks = candidates
    .map((ability) => {
      const id = ability.Spell,
        family = families.get(names.get(id).Name_lang),
        rank = Number(/^Rank ([1-9][0-9]*)$/.exec(spells.get(id)?.NameSubtext_lang)?.[1]);
      assert(Number.isSafeInteger(rank) && rank > 0, `Missing Shaman rank: ${id}`);
      assert.equal(ability.ClassMask, 64);
      assert.equal(ability.SkillLine, 374);
      assert([0, 2].includes(ability.AcquireMethod), `Unsupported candidate acquisition: ${id}`);
      const levels = one("SpellLevels", id),
        misc = one("SpellMisc", id),
        power = one("SpellPower", id),
        cooldown = one("SpellCooldowns", id),
        options = one("SpellClassOptions", id),
        effect = one("SpellEffect", id),
        cast = casts.get(misc.CastingTimeIndex),
        range = ranges.get(misc.RangeIndex);
      assert(cast && cast.Base > 0 && cast.Base === cast.Minimum, `Variable cast time: ${id}`);
      assert(range, `Missing Shaman range: ${id}`);
      assert.deepEqual(range.RangeMin, [0, 0]);
      assert.deepEqual(range.RangeMax, [40, 40]);
      assert.equal(misc.SchoolMask, 8);
      assert.equal(misc.DurationIndex, 0);
      assert.equal(misc.Speed, 0);
      assert.equal(misc.LaunchDelay, 0);
      assert.equal(options.SpellClassSet, 11);
      assert.deepEqual(options.SpellClassMask, [family.mask, 0, 0, 0]);
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
        assert.equal(power[field], 0, `Unsupported ${field}: ${id}`);
      for (const field of ["RecoveryTime", "CategoryRecoveryTime", "AuraSpellID"])
        assert.equal(cooldown[field], 0, `Unsupported ${field}: ${id}`);
      assert.equal(cooldown.StartRecoveryTime, 1500);
      assert.equal(effect.Effect, 10);
      for (const field of [
        "EffectIndex",
        "EffectAura",
        "DifficultyID",
        "EffectAuraPeriod",
        "EffectTriggerSpell",
        "BonusCoefficientFromAP",
        "ScalingClass",
      ])
        assert.equal(effect[field], 0, `Unsupported ${field}: ${id}`);
      assert.deepEqual(effect.ImplicitTarget, [family.target, 0]);
      assert.equal(effect.EffectBonusCoefficient, family.coefficients[rank - 1]);
      assert.equal(effect.EffectChainTargets, family.chainTargets);
      assert.equal(effect.EffectChainAmplitude, family.chainAmplitude);
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
        targetEncoding: [...effect.ImplicitTarget],
        chainTargets: effect.EffectChainTargets,
        chainAmplitude: effect.EffectChainAmplitude,
        trainingVerified: false,
      };
      for (const [field, value] of Object.entries(result))
        if (typeof value === "number")
          assert(Number.isFinite(value) && value >= 0, `Invalid ${field}: ${id}`);
      for (const field of ["requiredLevel", "baseLevel", "maxLevel", "castMs", "gcdMs"])
        assert(Number.isSafeInteger(result[field]) && result[field] > 0, `${field}: ${id}`);
      assert(result.mana > 0 && result.base > 0 && result.variance <= 2);
      assert(result.baseLevel <= result.requiredLevel && result.requiredLevel <= result.maxLevel);
      return result;
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  for (const family of families.values()) {
    const selected = ranks.filter((row) => row.family === family.id);
    assert.equal(selected.length, family.ranks, `Missing ${family.id} ranks`);
    selected.forEach((row, position) =>
      assert.equal(row.rank, position + 1, `Rank gap: ${family.id}`),
    );
  }
  return {
    schema: "kfc-shaman-basic-healing-source.v1",
    sourceBuild: evidence.source.build.buildNumber,
    source: globalThis.structuredClone(evidence.source),
    ranks,
    scope: "three-basic-ranked-heal-families-only",
    trainingVerified: false,
    acquisitionVerified: false,
    serverMechanicsVerified: false,
    chainRoutingVerified: false,
    talentMechanicsComplete: false,
    workloadAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
    classClockStarted: false,
    nativeJobs: 0,
    browserJobs: 0,
  };
}
