import assert from "node:assert/strict";

/** Resolve Benediction against exact cast times and family masks, without broadening zero-mask spells.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingInstantCosts(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-healing-instant-costs-source.v1");
  assert.equal(evidence.className, "Paladin");
  assert.equal(evidence.classMask, 2);
  const { talent } = evidence;
  assert.equal(talent.spellId, 20101);
  assert.equal(talent.name, "Benediction");
  assert.equal(talent.maxRanks, 5);
  assert.equal(evidence.effects.length, 1);
  const effect = evidence.effects[0];
  assert.equal(effect.SpellID, 20101);
  assert.equal(effect.Effect, 6);
  assert.equal(effect.EffectAura, 108);
  assert.deepEqual(effect.EffectMiscValue, [14, 0]);
  assert.equal(effect.EffectBasePointsF, -10);
  assert.deepEqual(effect.EffectSpellClassMask, [467738559, 637633090, 539042048, 34816]);
  assert.equal(evidence.effectPoints.length, 1);
  const point = evidence.effectPoints[0];
  assert.equal(point.TraitDefinitionID, talent.definitionId);
  assert.equal(point.EffectIndex, 0);
  assert.equal(point.OperationType, 0);
  assert.equal(evidence.curves.length, 1);
  assert.equal(evidence.curves[0].id, point.CurveID);
  assert.equal(evidence.curves[0].Type, 0);
  const points = evidence.curvePoints.slice().sort((a, b) => a.OrderIndex - b.OrderIndex);
  assert.equal(points.length, 5);
  points.forEach((row, index) => {
    assert.equal(row.CurveID, point.CurveID);
    assert.equal(row.OrderIndex, index);
    assert.deepEqual(row.Pos, [index + 1, -2 * (index + 1)]);
  });
  assert.equal(talent.ranks.length, 5);
  talent.ranks.forEach((row, index) => {
    assert.equal(row.rank, index + 1);
    assert(row.resolved && row.text.includes(`by ${2 * (index + 1)}%`));
  });
  assert.equal(evidence.ranks.length, 23);
  assert.equal(new Set(evidence.ranks.map((row) => row.spellId)).size, 23);
  const ranks = evidence.ranks.map((row) => {
    assert(Number.isSafeInteger(row.spellId) && row.spellId > 0);
    assert.equal(row.classSet, 10);
    assert(Number.isFinite(row.castMs) && row.castMs >= 0);
    assert(Array.isArray(row.mask) && row.mask.length === 4);
    assert(
      row.mask.every(
        (value) => Number.isInteger(value) && value >= -2147483648 && value <= 4294967295,
      ),
    );
    const matches = row.mask.some(
      (value, index) => (value & effect.EffectSpellClassMask[index]) !== 0,
    );
    return {
      spellId: row.spellId,
      castMs: row.castMs,
      maskMatches: matches,
      applies: row.castMs === 0 && matches,
    };
  });
  const affectedSpellIds = ranks
    .filter((row) => row.applies)
    .map((row) => row.spellId)
    .sort((a, b) => a - b);
  assert.deepEqual(affectedSpellIds, [20473, 20929, 20930, 1311606]);
  assert(ranks.some((row) => row.spellId === 20216 && row.castMs === 0 && !row.maskMatches));
  return {
    schema: "kfc-paladin-healing-instant-costs.v1",
    sourceBuild: evidence.source.build.buildNumber,
    talentId: 20101,
    reductionsPercent: [0, ...points.map((row) => -row.Pos[1])],
    affectedSpellIds,
    ranks,
    applicabilityRule: "instant-cast-and-captured-family-mask",
    zeroMaskFavorScope: "no-Benediction-reduction-in-captured-mask-model",
    serverMechanicsVerified: false,
    classMechanicsAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** @param {{implementation:string,costs:object}} input @returns {string} */
export function renderPaladinHealingInstantCosts({ implementation, costs }) {
  assert.equal(costs.schema, "kfc-paladin-healing-instant-costs.v1");
  assert.equal(implementation.split("// KFC_PALADIN_INSTANT_COST_VALUES").length, 2);
  return implementation.replace(
    "// KFC_PALADIN_INSTANT_COST_VALUES",
    `var kfcPaladinInstantCostReduction = []int32{${costs.reductionsPercent.join(",")}}\nvar kfcPaladinInstantCostIDs = map[int32]bool{${costs.affectedSpellIds.map((id) => `${id}:true`).join(",")}}`,
  );
}
