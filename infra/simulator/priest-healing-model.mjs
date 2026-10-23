import assert from "node:assert/strict";

const families = new Map([
  ["Lesser Heal", "lesser-heal"],
  ["Heal", "heal"],
  ["Greater Heal", "greater-heal"],
  ["Flash Heal", "flash-heal"],
  ["Renew", "renew"],
  ["Power Word: Shield", "shield"],
]);

function single(rows, id, label) {
  const matches = rows.filter((row) => row.SpellID === id);
  assert.equal(matches.length, 1, `Expected one ${label} record for ${id}`);
  return matches[0];
}

/** Extract the six single-target baseline families from a captured Priest class graph.
 * Acquisition methods select client candidates only; they do not prove availability.
 * @param {object} evidence
 * @returns {object}
 */
export function extractPriestHealingBaseline(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Priest");
  assert.equal(evidence.classMask, 16);
  const { rawTables: tables, lookupTables: lookups } = evidence,
    names = new Map(tables.SpellName.map((row) => [row.id, row.Name_lang])),
    spellRows = new Map(tables.Spell.map((row) => [row.id, row])),
    durations = new Map(lookups.SpellDuration.map((row) => [row.id, row.Duration])),
    casts = new Map(lookups.SpellCastTimes.map((row) => [row.id, row])),
    candidates = new Set(
      evidence.rootAbilityRows
        .filter((row) => [0, 2].includes(row.AcquireMethod) && families.has(names.get(row.Spell)))
        .map((row) => row.Spell),
    ),
    ranks = [];
  for (const id of candidates) {
    const family = families.get(names.get(id)),
      rank = Number(/^Rank ([1-9][0-9]*)$/.exec(spellRows.get(id)?.NameSubtext_lang)?.[1]),
      effect = single(tables.SpellEffect, id, "effect"),
      power = single(tables.SpellPower, id, "power"),
      misc = single(tables.SpellMisc, id, "misc"),
      levels = single(tables.SpellLevels, id, "level"),
      cooldown = single(tables.SpellCooldowns, id, "cooldown"),
      cast = casts.get(misc.CastingTimeIndex);
    assert(Number.isSafeInteger(rank) && rank > 0, `Missing rank for ${id}`);
    assert(cast && cast.Minimum === cast.Base && cast.Base >= 0, `Variable cast time: ${id}`);
    assert.equal(power.PowerType, 0, `Nonmana healing spell: ${id}`);
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
    assert.equal(cooldown.RecoveryTime, 0, `Unexpected individual cooldown: ${id}`);
    assert.equal(cooldown.AuraSpellID, 0, `Conditional cooldown: ${id}`);
    assert.equal(effect.Effect, ["renew", "shield"].includes(family) ? 6 : 10);
    assert.equal(effect.EffectAura, family === "renew" ? 8 : family === "shield" ? 69 : 0);
    const durationMs = misc.DurationIndex === 0 ? 0 : durations.get(misc.DurationIndex),
      tickMs = effect.EffectAuraPeriod;
    assert(Number.isSafeInteger(durationMs) && durationMs >= 0, `Missing duration: ${id}`);
    assert(family !== "renew" || (tickMs > 0 && durationMs % tickMs === 0));
    const record = {
      id,
      family,
      rank,
      requiredLevel: levels.SpellLevel,
      baseLevel: levels.BaseLevel,
      maxLevel: levels.MaxLevel,
      base: effect.EffectBasePointsF,
      variance: effect.Variance,
      pointsPerLevel: effect.EffectRealPointsPerLevel,
      coefficient: effect.EffectBonusCoefficient,
      mana: power.ManaCost,
      castMs: cast.Base,
      gcdMs: cooldown.StartRecoveryTime,
      cooldownMs: cooldown.CategoryRecoveryTime,
      durationMs,
      tickMs,
      trainingVerified: false,
    };
    for (const [field, value] of Object.entries(record))
      if (typeof value === "number") assert(Number.isFinite(value) && value >= 0, `${id}.${field}`);
    ranks.push(record);
  }
  ranks.sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  for (const family of families.values()) {
    const selected = ranks.filter((row) => row.family === family);
    assert(selected.length > 0, `Missing healing family: ${family}`);
    selected.forEach((row, index) => assert.equal(row.rank, index + 1, `Rank gap: ${family}`));
  }
  const weakenedSoul = single(tables.SpellMisc, 6788, "Weakened Soul duration"),
    weakenedSoulMs = durations.get(weakenedSoul.DurationIndex);
  assert(Number.isSafeInteger(weakenedSoulMs) && weakenedSoulMs > 0);
  return {
    schema: "kfc-priest-baseline-healing.v1",
    ranks,
    weakenedSoulMs,
    amountRule: "base-plus-clamped-level-growth-plus-symmetric-base-variance",
    coefficientRule: "client-coefficient-without-additional-inferred-downranking",
    renewalRule: "application-snapshot-without-periodic-crits",
    trainingVerified: false,
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    workloadAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Render the experimental Priest overlay without writing upstream sources.
 * @param {{priest: string, healingAgent: string, implementation: string, baseline: object}} input
 * @returns {{priest: string, healingAgent: string, implementation: string}}
 */
export function renderPriestHealingSources(input) {
  function replace(source, before, after) {
    assert.equal(source.split(before).length, 2, `Priest source anchor changed: ${before}`);
    return source.replace(before, after);
  }
  assert.equal(input.baseline.schema, "kfc-priest-baseline-healing.v1");
  let priest = replace(
    input.priest,
    "\tFlashHeal       []*core.Spell",
    "\tFlashHeal       []*core.Spell\n\tLesserHeal []*core.Spell\n\tHeal []*core.Spell",
  );
  priest = replace(
    priest,
    "func (priest *Priest) RegisterHealingSpells() {\n\t// priest.registerFlashHealSpell()\n\t// priest.registerGreaterHealSpell()\n\t// priest.registerPowerWordShieldSpell()\n\t// priest.registerPrayerOfHealingSpell()\n\t// priest.registerRenewSpell()\n}",
    "func (priest *Priest) RegisterHealingSpells() {\n\tpriest.registerKFCBaselineHealing()\n}",
  );
  const healingAgent = replace(
    input.healingAgent,
    "func (hpriest *HealingPriest) Initialize() {",
    "func (hpriest *HealingPriest) Initialize() {\n\tfor _, unit := range hpriest.Env.Raid.AllUnits {\n\t\tif !unit.HasHealthBar() { unit.EnableHealthBar() }\n\t\tif dummy, ok := hpriest.Env.Raid.GetPlayerFromUnit(unit).(*core.TargetDummy); ok && dummy.MaxHealth() == 0 { dummy.AddStats(dummy.GetBaseStats()) }\n\t}",
  );
  const entries = input.baseline.ranks
    .map(
      (row) =>
        `{ID:${row.id}, Family:${JSON.stringify(row.family)}, Rank:${row.rank}, RequiredLevel:${row.requiredLevel}, BaseLevel:${row.baseLevel}, MaxLevel:${row.maxLevel}, Base:${row.base}, Variance:${row.variance}, PointsPerLevel:${row.pointsPerLevel}, Coefficient:${row.coefficient}, Mana:${row.mana}, CastMs:${row.castMs}, GCDMs:${row.gcdMs}, CooldownMs:${row.cooldownMs}, DurationMs:${row.durationMs}, TickMs:${row.tickMs}}`,
    )
    .join(",\n");
  const implementation = replace(
    input.implementation,
    "// KFC_CLIENT_HEALING_RANKS",
    `var kfcHealingRanks = []kfcHealingRank{\n${entries},\n}\nconst kfcWeakenedSoulMs = ${input.baseline.weakenedSoulMs}`,
  );
  return { priest, healingAgent, implementation };
}
