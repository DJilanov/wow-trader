import assert from "node:assert/strict";

const fields = [
  ["divineIntellect", 20257, 5, 0, 137, [0, 8], [2, 4, 6, 8, 10]],
  ["healingLight", 20237, 3, 0, 108, [0, 0], [4, 8, 12]],
  ["reverence", 1310899, 3, 0, 134, [0, 0], [10, 20, 30]],
  ["holyPower", 5923, 5, 0, 108, [7, 0], [1, 2, 3, 4, 5]],
  ["holyPowerSpecial", 5923, 5, 1, 108, [7, 0], [3, 6, 9, 12, 15]],
  ["illumination", 20210, 5, 0, 42, [0, 0], [20, 40, 60, 80, 100]],
];

function one(rows, predicate, label) {
  const selected = rows.filter(predicate);
  assert.equal(selected.length, 1, `Missing or duplicate Paladin ${label}`);
  return selected[0];
}

/** Extract the current ranked passive curves without granting full class admission.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingPassives(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-healing-passives-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.classMask, 2);
  const { rawTables, lookupTables } = evidence;
  const talents = Object.fromEntries(
    fields.map(([field, spellId, maxRanks, effectIndex, aura, misc, expected]) => {
      const talent = one(evidence.classTalents, (row) => row.spellId === spellId, field);
      assert.equal(talent.maxRanks, maxRanks);
      assert(talent.layoutResolved);
      const effect = one(
        rawTables.SpellEffect,
        (row) => row.SpellID === spellId && row.EffectIndex === effectIndex,
        field + " effect",
      );
      assert.equal(effect.Effect, 6);
      assert.equal(effect.EffectAura, aura);
      assert.deepEqual(effect.EffectMiscValue, misc);
      const point = one(
        lookupTables.TraitDefinitionEffectPoints,
        (row) => row.TraitDefinitionID === talent.definitionId && row.EffectIndex === effectIndex,
        field + " curve link",
      );
      assert.equal(point.OperationType, 0);
      const curve = one(lookupTables.Curve, (row) => row.id === point.CurveID, field + " curve");
      assert.equal(curve.Type, 0);
      const points = lookupTables.CurvePoint.filter((row) => row.CurveID === curve.id).sort(
        (a, b) => a.OrderIndex - b.OrderIndex,
      );
      assert.equal(points.length, maxRanks);
      const values = points.map((row, index) => {
        assert.equal(row.OrderIndex, index);
        assert.deepEqual(row.Pos, [index + 1, expected[index]]);
        return row.Pos[1];
      });
      assert.equal(talent.ranks.length, maxRanks);
      talent.ranks.forEach((rank, index) => {
        assert.equal(rank.rank, index + 1);
        assert(rank.resolved, field + " description");
      });
      return [field, { spellId, maxRanks, effectIndex, values: [0, ...values] }];
    }),
  );
  const refund = one(
    rawTables.SpellEffect,
    (row) => row.SpellID === 20210 && row.EffectIndex === 2,
    "Illumination refund",
  );
  assert.equal(refund.Effect, 6);
  assert.equal(refund.EffectAura, 4);
  assert.equal(refund.EffectBasePointsF, 50);
  const illumination = one(evidence.classTalents, (row) => row.spellId === 20210, "Illumination");
  illumination.ranks.forEach((rank, index) => {
    assert(rank.text.includes(`a ${20 * (index + 1)}% chance`));
    assert(rank.text.includes("50% of the base cost"));
  });
  return {
    schema: "kfc-paladin-healing-passives.v1",
    sourceBuild: evidence.source.build.buildNumber,
    talents,
    illuminationRefundFraction: refund.EffectBasePointsF / 100,
    illuminationCostRule: "base-cost-before-modifiers",
    serverMechanicsVerified: false,
    talentMechanicsComplete: false,
    classMechanicsAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** Render only the missing healing modifiers; existing stat passives remain in the parent.
 * @param {{implementation:string,passives:object}} input @returns {string}
 */
export function renderPaladinHealingPassives({ implementation, passives }) {
  assert.equal(passives.schema, "kfc-paladin-healing-passives.v1");
  assert.equal(implementation.split("// KFC_PALADIN_PASSIVE_VALUES").length, 2);
  const healing = passives.talents.healingLight.values.map((value) => 1 + value / 100),
    chance = passives.talents.illumination.values.map((value) => value / 100);
  return implementation.replace(
    "// KFC_PALADIN_PASSIVE_VALUES",
    `var kfcPaladinHealingLight = []float64{${healing.join(",")}}\nvar kfcPaladinIlluminationChance = []float64{${chance.join(",")}}\nconst kfcPaladinIlluminationRefund = ${passives.illuminationRefundFraction}`,
  );
}
