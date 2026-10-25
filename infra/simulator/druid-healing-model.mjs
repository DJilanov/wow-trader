import assert from "node:assert/strict";

const families = new Map([
  ["Healing Touch", { id: "healing-touch", mask: 32, effects: [[10, 0]] }],
  ["Rejuvenation", { id: "rejuvenation", mask: 16, effects: [[6, 8]] }],
  [
    "Regrowth",
    {
      id: "regrowth",
      mask: 64,
      effects: [
        [10, 0],
        [6, 8],
      ],
    },
  ],
]);

function one(rows, spellId, label) {
  const matches = rows.filter((row) => row.SpellID === spellId);
  assert.equal(matches.length, 1, `Expected one ${label} record for ${spellId}`);
  return matches[0];
}

/** Extract client-ranked direct/HoT spells; this does not admit acquisition or a complete healer.
 * @param {object} evidence @returns {object}
 */
export function extractDruidHealingBaseline(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Druid");
  assert.equal(evidence.classMask, 1024);
  const tables = evidence.rawTables,
    lookups = evidence.lookupTables,
    names = new Map(tables.SpellName.map((row) => [row.id, row.Name_lang])),
    spells = new Map(tables.Spell.map((row) => [row.id, row])),
    casts = new Map(lookups.SpellCastTimes.map((row) => [row.id, row])),
    durations = new Map(lookups.SpellDuration.map((row) => [row.id, row])),
    candidates = new Set(
      evidence.rootAbilityRows
        .filter((row) => [0, 2].includes(row.AcquireMethod) && families.has(names.get(row.Spell)))
        .map((row) => row.Spell),
    );
  const ranks = [...candidates]
    .map((spellId) => {
      const family = families.get(names.get(spellId)),
        rank = Number(/^Rank ([1-9][0-9]*)$/.exec(spells.get(spellId)?.NameSubtext_lang)?.[1]),
        levels = one(tables.SpellLevels, spellId, "level"),
        misc = one(tables.SpellMisc, spellId, "misc"),
        power = one(tables.SpellPower, spellId, "power"),
        cooldown = one(tables.SpellCooldowns, spellId, "cooldown"),
        classOptions = one(tables.SpellClassOptions, spellId, "class options"),
        cast = casts.get(misc.CastingTimeIndex),
        duration = misc.DurationIndex ? durations.get(misc.DurationIndex) : null,
        effects = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
          (a, b) => a.EffectIndex - b.EffectIndex,
        );
      assert(Number.isSafeInteger(rank) && rank > 0, `Missing Druid rank: ${spellId}`);
      assert(
        cast && cast.Base === cast.Minimum && cast.Base >= 0,
        `Variable Druid cast time: ${spellId}`,
      );
      assert.equal(misc.SchoolMask, 8);
      assert.equal(classOptions.SpellClassSet, 7);
      assert.deepEqual(classOptions.SpellClassMask, [family.mask, 0, 0, 0]);
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
        assert.equal(power[field], 0, `Unsupported ${field}: ${spellId}`);
      for (const field of ["RecoveryTime", "CategoryRecoveryTime", "AuraSpellID"])
        assert.equal(cooldown[field], 0, `Unsupported ${field}: ${spellId}`);
      assert.deepEqual(
        effects.map((row) => [row.Effect, row.EffectAura]),
        family.effects,
      );
      const parts = effects.map((effect, index) => {
        assert.equal(effect.EffectIndex, index);
        assert.deepEqual(effect.ImplicitTarget, [21, 0]);
        assert.equal(effect.EffectTriggerSpell, 0);
        const periodic = effect.EffectAura === 8;
        if (periodic) {
          assert(
            duration &&
              duration.Duration > 0 &&
              duration.Duration === duration.MaxDuration &&
              duration.DurationPerResource === 0,
          );
          assert(effect.EffectAuraPeriod > 0 && duration.Duration % effect.EffectAuraPeriod === 0);
          assert.equal(effect.Variance, 0);
        } else assert.equal(effect.EffectAuraPeriod, 0);
        return {
          kind: periodic ? "periodic" : "direct",
          index: effect.EffectIndex,
          base: effect.EffectBasePointsF,
          variance: effect.Variance,
          pointsPerLevel: effect.EffectRealPointsPerLevel,
          coefficient: effect.EffectBonusCoefficient,
          durationMs: periodic ? duration.Duration : 0,
          tickMs: periodic ? effect.EffectAuraPeriod : 0,
        };
      });
      const result = {
        id: spellId,
        family: family.id,
        rank,
        requiredLevel: levels.SpellLevel,
        baseLevel: levels.BaseLevel,
        maxLevel: levels.MaxLevel,
        mana: power.ManaCost,
        castMs: cast.Base,
        gcdMs: cooldown.StartRecoveryTime,
        parts,
        trainingVerified: false,
      };
      for (const record of [result, ...parts])
        for (const [key, value] of Object.entries(record))
          if (typeof value === "number")
            assert(Number.isFinite(value) && value >= 0, `${spellId}.${key}`);
      return result;
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  for (const family of families.values()) {
    const selected = ranks.filter((row) => row.family === family.id);
    assert(selected.length > 0, `Missing Druid family: ${family.id}`);
    selected.forEach((row, index) =>
      assert.equal(row.rank, index + 1, `Druid rank gap: ${family.id}`),
    );
  }
  return {
    schema: "kfc-druid-baseline-healing.v1",
    sourceBuild: evidence.source.build.buildNumber,
    ranks,
    amountRule: "base-plus-clamped-level-growth-plus-symmetric-base-variance",
    coefficientRule: "client-coefficient-without-additional-inferred-downranking",
    hotRule: "application-healing-snapshot-with-live-periodic-crit-rolls",
    periodicCritReference:
      "https://eu.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-15-october/631316/1",
    regrowthPeriodicCritServerVerified: false,
    trainingVerified: false,
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    workloadAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render the standalone Druid baseline with exact captured rank values.
 * @param {{implementation:string,baseline:object}} input @returns {string}
 */
export function renderDruidHealingBaseline({ implementation, baseline }) {
  assert.equal(baseline.schema, "kfc-druid-baseline-healing.v1");
  assert.equal(implementation.split("// KFC_DRUID_CLIENT_RANKS").length, 2);
  const entries = baseline.ranks.map((rank) => {
    const parts = rank.parts
      .map(
        (part) =>
          `{Periodic:${part.kind === "periodic"},Base:${part.base},Variance:${part.variance},PointsPerLevel:${part.pointsPerLevel},Coefficient:${part.coefficient},DurationMs:${part.durationMs},TickMs:${part.tickMs}}`,
      )
      .join(",");
    return `{ID:${rank.id},Family:${JSON.stringify(rank.family)},Rank:${rank.rank},RequiredLevel:${rank.requiredLevel},BaseLevel:${rank.baseLevel},MaxLevel:${rank.maxLevel},Mana:${rank.mana},CastMs:${rank.castMs},GCDMs:${rank.gcdMs},Parts:[]kfcDruidHealingPart{${parts}}}`;
  });
  return implementation.replace(
    "// KFC_DRUID_CLIENT_RANKS",
    `var kfcDruidHealingRanks = []kfcDruidHealingRank{\n${entries.join(",\n")},\n}`,
  );
}
