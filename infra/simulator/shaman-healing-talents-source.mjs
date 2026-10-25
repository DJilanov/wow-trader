import assert from "node:assert/strict";

const healingFields = new Set([
  "improvedHealingWave",
  "tidalFocus",
  "mindfulness",
  "totemicFocus",
  "waterShield",
  "tidalMastery",
  "restorativeTotems",
  "manaTideTotem",
  "healingWay",
  "naturesSwiftness",
  "purification",
  "riptide",
  "thunderingStrikes",
  "ancestralKnowledge",
  "mentalQuickness",
]);

/** Match every current client talent to the captured engine field and tier gates.
 * @param {{evidence:object,adapter:object}} input @returns {object}
 */
export function extractShamanHealingTalentSource({ evidence, adapter }) {
  assert.equal(evidence.schema, "kfc-class-spell-evidence.v1");
  assert.equal(evidence.className, "Shaman");
  assert.equal(evidence.classMask, 64);
  assert.equal(adapter.schema, "kfc-shaman-healing-talent-source.v1");
  assert.deepEqual(adapter.source, evidence.source);
  assert.equal(adapter.trees.length, 3);
  assert.equal(evidence.classTalents.length, 50);
  const seen = new Set(),
    fields = adapter.trees.flatMap((tree, treeIndex) =>
      tree.talents.map((talent, index) => {
        const matching = evidence.classTalents.filter(
          (entry) =>
            entry.layoutResolved &&
            entry.treeIndex === treeIndex &&
            entry.row === talent.location.rowIdx &&
            entry.column === talent.location.colIdx,
        );
        assert.equal(matching.length, 1, "Unresolved Shaman talent " + talent.fieldName);
        const row = matching[0];
        assert(!seen.has(row.nodeId), "Duplicate Shaman talent node");
        seen.add(row.nodeId);
        assert.equal(row.name, talent.name);
        assert.equal(row.maxRanks, talent.maxPoints);
        const prerequisites = row.prerequisiteNodeIds.map((nodeId) => {
          const parent = evidence.classTalents.find((entry) => entry.nodeId === nodeId);
          assert(parent && parent.treeIndex === treeIndex && parent.layoutResolved);
          return { rowIdx: parent.row, colIdx: parent.column };
        });
        assert.deepEqual(prerequisites, talent.prereqLocation ? [talent.prereqLocation] : []);
        const protoField = talent.fieldName.replace(
            /[A-Z]/g,
            (letter) => "_" + letter.toLowerCase(),
          ),
          type = talent.maxPoints === 1 ? "bool" : "int32";
        assert(new RegExp(`\\b${type} ${protoField} = \\d+;`).test(adapter.proto));
        return {
          field: talent.fieldName,
          protoField,
          treeIndex,
          index,
          nodeId: row.nodeId,
          definitionId: row.definitionId,
          spellId: row.spellId,
          maximum: row.maxRanks,
          row: row.row,
          column: row.column,
          prerequisiteNodeIds: [...row.prerequisiteNodeIds],
          affectsHealingStudy: healingFields.has(talent.fieldName),
          engineEffectAdmitted: false,
        };
      }),
    );
  assert.equal(fields.length, 50);
  assert.equal(seen.size, 50);
  assert.equal(fields.filter((field) => field.affectsHealingStudy).length, 15);
  return {
    schema: "kfc-shaman-healing-talent-domain-source.v1",
    sourceBuild: evidence.source.build.buildNumber,
    fields,
    trees: structuredClone(adapter.trees),
    unlistedFieldsAdmitted: false,
    modelAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

const passiveModifiers = [
  [
    "improvedHealingWave",
    16182,
    [[0, 107, [10, 0], [64, 0, 0, 0], -100, [-100, -200, -300, -400, -500]]],
  ],
  [
    "tidalFocus",
    16179,
    [
      [0, 108, [14, 0], [448, 0, 16, 0], -5, [-1, -2, -3, -4, -5]],
      [1, 54, [0, 0], [0, 0, 0, 0], 5, [1, 2, 3, 4, 5]],
      [2, 55, [0, 0], [0, 0, 0, 0], 5, [1, 2, 3, 4, 5]],
    ],
  ],
  ["mindfulness", 1223033, [[0, 134, [0, 0], [0, 0, 0, 0], 5, [17, 33, 50]]]],
  [
    "totemicFocus",
    16173,
    [[0, 108, [14, 0], [537399320, 0, 0, 2176], -5, [-5, -10, -15, -20, -25]]],
  ],
  [
    "restorativeTotems",
    16187,
    [
      [0, 108, [8, 0], [16384, 0, 0, 0], 5, [5, 10, 15, 20, 25]],
      [1, 108, [22, 0], [8192, 0, 0, 0], 5, [10, 20, 30, 40, 50]],
    ],
  ],
  ["tidalMastery", 16194, [[0, 107, [7, 0], [1472, 0, 16, 0], 1, [1, 2, 3, 4, 5]]]],
  ["healingWay", 29206, [[0, 108, [0, 0], [64, 0, 0, 0], 33, [8, 17, 25]]]],
  [
    "purification",
    16178,
    [
      [0, 108, [0, 0], [448, 0, 16, 0], 10, [2, 4, 6, 8, 10]],
      [1, 108, [22, 0], [0, 0, 16, 0], 10, [2, 4, 6, 8, 10]],
    ],
  ],
  ["ancestralKnowledge", 17485, [[0, 137, [0, 8], [0, 0, 0, 0], 10, [2, 4, 6, 8, 10]]]],
  ["thunderingStrikes", 16255, [[0, 290, [0, 0], [0, 0, 0, 0], 1, [1, 2, 3, 4, 5]]]],
  [
    "mentalQuickness",
    30812,
    [
      [0, 175, [3, 0], [0, 0, 0, 0], 30, [15, 30]],
      [1, 174, [126, 3], [0, 0, 0, 0], 30, [15, 30]],
    ],
  ],
];

/** Read absolute trait curves; raw base points alone are not learned-rank values.
 * @param {{evidence:object,domain:object}} input @returns {object}
 */
export function extractShamanHealingPassiveSource({ evidence, domain }) {
  assert.equal(domain.schema, "kfc-shaman-healing-talent-domain-source.v1");
  assert.equal(domain.sourceBuild, evidence.source.build.buildNumber);
  const { rawTables: tables, lookupTables: lookup } = evidence;
  function curveFor(talent, index, expected) {
    const points = lookup.TraitDefinitionEffectPoints.filter(
      (entry) => entry.TraitDefinitionID === talent.definitionId && entry.EffectIndex === index,
    );
    assert.equal(points.length, 1, "Missing or duplicate Shaman rank curve");
    const point = points[0],
      curves = lookup.Curve.filter((entry) => entry.id === point.CurveID);
    assert.equal(point.OperationType, 0, "Unsupported Shaman trait operation");
    assert.equal(curves.length, 1);
    assert.equal(curves[0].Type, 0);
    const values = lookup.CurvePoint.filter((entry) => entry.CurveID === point.CurveID).sort(
      (a, b) => a.OrderIndex - b.OrderIndex,
    );
    assert.equal(values.length, talent.maximum);
    assert.equal(expected.length, talent.maximum);
    for (const [offset, value] of values.entries()) {
      assert.equal(value.OrderIndex, offset);
      assert.deepEqual(value.Pos, [offset + 1, expected[offset]]);
    }
    return { curveId: point.CurveID, operation: point.OperationType, byRank: [0, ...expected] };
  }
  const talents = passiveModifiers.map(([field, spellId, selected]) => {
    const talent = domain.fields.find((entry) => entry.field === field);
    assert(talent && talent.spellId === spellId && talent.affectsHealingStudy);
    const rows = tables.SpellEffect.filter((entry) => entry.SpellID === spellId);
    assert.equal(rows.length, selected.length, "Unreviewed Shaman passive effect");
    const effects = selected.map(([index, aura, misc, mask, rawBasePoints, expected]) => {
      const matches = rows.filter((entry) => entry.EffectIndex === index);
      assert.equal(matches.length, 1);
      const effect = matches[0];
      assert.deepEqual(
        [
          effect.Effect,
          effect.EffectAura,
          effect.EffectMiscValue,
          effect.EffectSpellClassMask,
          effect.EffectBasePointsF,
          effect.ImplicitTarget,
        ],
        [6, aura, misc, mask, rawBasePoints, [1, 0]],
      );
      assert.equal(effect.EffectTriggerSpell, 0);
      assert.equal(effect.EffectAuraPeriod, 0);
      return {
        index,
        aura,
        misc: [...misc],
        mask: [...mask],
        rawBasePoints,
        ...curveFor(talent, index, expected),
      };
    });
    const extra = lookup.TraitDefinitionEffectPoints.filter(
      (entry) =>
        entry.TraitDefinitionID === talent.definitionId &&
        !rows.some((effect) => effect.EffectIndex === entry.EffectIndex),
    );
    if (field === "mentalQuickness") {
      assert.equal(extra.length, 1);
      assert.equal(extra[0].EffectIndex, 2);
    } else assert.equal(extra.length, 0, "Unclassified orphan Shaman modifier curve");
    return {
      field,
      spellId,
      maximum: talent.maximum,
      effects,
      unusedCurves: extra.map((entry) => ({
        index: entry.EffectIndex,
        ...curveFor(talent, entry.EffectIndex, [15, 30]),
        absentFromSpellEffects: true,
        modeledBonus: false,
      })),
    };
  });
  return {
    schema: "kfc-shaman-healing-passive-source.v1",
    sourceBuild: domain.sourceBuild,
    talents,
    effects: talents.reduce((sum, talent) => sum + talent.effects.length, 0),
    orphanCurvesPreserved: 1,
    rawBasePointsUsedAsRankValues: false,
    sourceOnly: true,
    modelAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
