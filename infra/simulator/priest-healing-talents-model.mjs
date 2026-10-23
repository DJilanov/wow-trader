import assert from "node:assert/strict";

const selected = [
  ["ImprovedRenew", 14908, [0]],
  ["SpiritualHealing", 14898, [0, 1]],
  ["DivineFury", 18530, [0]],
  ["ImprovedHealing", 14912, [0]],
  ["ImprovedPowerWordShield", 14748, [0]],
  ["SoulWarding", 402000, [0, 1]],
  ["RenewedHope", 425280, [0, 1]],
  ["DivineAegis", 431622, [0, 1]],
  ["Inspiration", 14892, [0]],
  ["LitanyOfLight", 1317006, [0]],
  ["TwinDisciplines", 1225132, [0, 1]],
  ["HolySpecialization", 14889, [0]],
  ["MentalAgility", 14520, [0]],
];
const healingNames = new Map([
  ["Lesser Heal", "lesser-heal"],
  ["Heal", "heal"],
  ["Greater Heal", "greater-heal"],
  ["Flash Heal", "flash-heal"],
  ["Renew", "renew"],
  ["Power Word: Shield", "shield"],
  ["Penance", "penance"],
  ["Binding Heal", "binding-heal"],
  ["Prayer of Healing", "prayer-of-healing"],
  ["Prayer of Mending", "prayer-of-mending"],
  ["Holy Nova", "holy-nova"],
]);
const modifierKinds = {
  ImprovedRenew: [[108, 22]],
  SpiritualHealing: [
    [108, 0],
    [108, 22],
  ],
  DivineFury: [[107, 10]],
  ImprovedHealing: [[108, 14]],
  ImprovedPowerWordShield: [[108, 3]],
  SoulWarding: [
    [107, 11],
    [108, 14],
  ],
  RenewedHope: [
    [4, 0],
    [4, 0],
  ],
  DivineAegis: [
    [4, 0],
    [4, 0],
  ],
  Inspiration: [[4, 0]],
  LitanyOfLight: [[42, 0]],
  TwinDisciplines: [
    [108, 0],
    [108, 22],
  ],
  HolySpecialization: [[107, 7]],
  MentalAgility: [[108, 14]],
};

/** Read exact rank curves and spell masks; no rank is inferred by multiplying rank one.
 * @param {object} evidence
 * @returns {object}
 */
export function extractPriestHealingTalents(evidence) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Priest");
  const { rawTables: tables, lookupTables: lookup } = evidence,
    talents = {};
  for (const [field, id, indices] of selected) {
    const candidates = evidence.classTalents.filter(
      (row) => row.spellId === id && row.layoutResolved,
    );
    assert.equal(candidates.length, 1, `Unresolved talent layout: ${id}`);
    const talent = candidates[0];
    assert.equal(talent.maxRanks, talent.ranks.length);
    const effects = [];
    for (const index of indices) {
      const rows = tables.SpellEffect.filter(
        (row) => row.SpellID === id && row.EffectIndex === index,
      );
      assert.equal(rows.length, 1, `Missing talent effect: ${id}:${index}`);
      const row = rows[0],
        links = lookup.TraitDefinitionEffectPoints.filter(
          (entry) => entry.TraitDefinitionID === talent.definitionId && entry.EffectIndex === index,
        );
      assert(links.length <= 1, `Ambiguous rank curve: ${id}:${index}`);
      let values;
      if (links.length) {
        assert.equal(links[0].OperationType, 0, `Unsupported curve operation: ${id}:${index}`);
        const points = lookup.CurvePoint.filter((point) => point.CurveID === links[0].CurveID).sort(
          (a, b) => a.Pos[0] - b.Pos[0],
        );
        assert.equal(points.length, talent.maxRanks, `Incomplete rank curve: ${id}:${index}`);
        points.forEach((point, rank) => assert.equal(point.Pos[0], rank + 1));
        values = points.map((point) => point.Pos[1]);
      } else {
        assert(
          talent.maxRanks === 1 || (id === 431622 && index === 1),
          `Missing rank curve: ${id}:${index}`,
        );
        values = Array(talent.maxRanks).fill(row.EffectBasePointsF);
      }
      assert(values.every(Number.isFinite));
      assert.equal(row.Effect, 6);
      assert.deepEqual(
        [row.EffectAura, row.EffectMiscValue[0]],
        modifierKinds[field][index],
        `Unsupported talent modifier: ${id}:${index}`,
      );
      effects.push({
        index,
        aura: row.EffectAura,
        operation: row.EffectMiscValue[0],
        mask: row.EffectSpellClassMask.map((value) => value >>> 0),
        values: [0, ...values],
      });
    }
    talents[field] = { id, definitionId: talent.definitionId, maxRanks: talent.maxRanks, effects };
  }
  const names = new Map(tables.SpellName.map((row) => [row.id, row.Name_lang]));
  const healingEffects = new Set(
    tables.SpellEffect.filter(
      (row) => row.Effect === 10 || (row.Effect === 6 && [8, 69].includes(row.EffectAura)),
    ).map((row) => row.SpellID),
  );
  const spells = tables.SpellClassOptions.filter(
    (row) =>
      row.SpellClassSet === 6 &&
      healingEffects.has(row.SpellID) &&
      healingNames.has(names.get(row.SpellID)),
  )
    .map((row) => ({
      id: row.SpellID,
      family: healingNames.get(names.get(row.SpellID)),
      mask: row.SpellClassMask.map((value) => value >>> 0),
    }))
    .sort((a, b) => a.id - b.id);
  assert.equal(new Set(spells.map((row) => row.id)).size, spells.length);
  function duration(id) {
    const rows = tables.SpellMisc.filter((row) => row.SpellID === id);
    assert.equal(rows.length, 1);
    const values = lookup.SpellDuration.filter((row) => row.id === rows[0].DurationIndex);
    assert.equal(values.length, 1);
    assert.equal(values[0].Duration, values[0].MaxDuration);
    assert.equal(values[0].DurationPerResource, 0);
    return values[0].Duration;
  }
  return {
    schema: "kfc-priest-healing-talents.v1",
    talents,
    spells,
    inspirationDurationMs: duration(14893),
    aegisDurationMs: duration(431624),
    assumptions: {
      spellPercentModifiers: "additive-within-the-same-operation",
      aegisHealBasis: "raw-critical-heal",
      aegisStacking: "refresh-and-accumulate-to-client-level-cap",
      litanyIdentity: "spell-family-not-rank",
      litanyFirstHealRefund: false,
      litanyShieldRefund: false,
    },
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    workloadAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Extend an immutable baseline component with the current client talent rules.
 * @param {{priest:string, talents:string, baselineImplementation:string, implementation:string, evidence:object}} input
 * @returns {{priest:string,talents:string,baselineImplementation:string,implementation:string}}
 */
export function renderPriestHealingTalentSources(input) {
  assert(
    !input.priest.includes("registerKFCHealingTalentEffects()"),
    "Priest talent source anchor changed: already expanded",
  );
  function replace(source, before, after) {
    assert.equal(source.split(before).length, 2, "Priest talent source anchor changed: " + before);
    return source.replace(before, after);
  }
  const data = extractPriestHealingTalents(input.evidence);
  let priest = replace(
    input.priest,
    "\tpriest.registerKFCBaselineHealing()",
    "\tpriest.registerKFCHealingTalentEffects()\n\tpriest.registerKFCBaselineHealing()",
  );
  priest = replace(
    priest,
    "\tProcPrayerOfMending core.ApplySpellResults",
    "\tProcPrayerOfMending core.ApplySpellResults\n\tKFCInspiration core.AuraArray\n\tKFCDivineAegis *core.Spell\n\tKFCLitanyMetrics *core.ResourceMetrics",
  );
  const start = input.talents.indexOf("func (priest *Priest) applyInspiration() {"),
    end = input.talents.indexOf("\n// Searing Light", start);
  assert(start >= 0 && end > start, "Missing Inspiration implementation");
  const talents =
    input.talents.slice(0, start) +
    "func (priest *Priest) applyInspiration() {\n\tpriest.registerKFCInspiration()\n}\n" +
    input.talents.slice(end);
  const baselineImplementation = replace(
    input.baselineImplementation,
    "spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)",
    "spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), priest.kfcHealingOutcome(spell))",
  );
  const fields = Object.entries(data.talents).flatMap(([field, talent]) =>
    talent.effects.map(
      (effect) =>
        `{Talent:${JSON.stringify(field)}, Index:${effect.index}, Aura:${effect.aura}, Operation:${effect.operation}, Mask:[4]uint32{${effect.mask.join(",")}}, Values:[]float64{${effect.values.join(",")}}}`,
    ),
  );
  const spellRows = data.spells.map(
    (row) =>
      `${row.id}:{Family:${JSON.stringify(row.family)},Mask:[4]uint32{${row.mask.join(",")}}}`,
  );
  const generated = `var kfcHealingTalentModifiers = []kfcHealingTalentModifier{\n${fields.join(",\n")},\n}\nvar kfcClientHealingSpells = map[int32]kfcHealingSpellMetadata{\n${spellRows.join(",\n")},\n}\nconst kfcInspirationDurationMs = ${data.inspirationDurationMs}\nconst kfcAegisDurationMs = ${data.aegisDurationMs}`;
  const implementation = replace(input.implementation, "// KFC_CLIENT_HEALING_TALENTS", generated);
  return { priest, talents, baselineImplementation, implementation };
}
