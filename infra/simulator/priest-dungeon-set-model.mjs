import assert from "node:assert/strict";

const one = (rows, predicate, label) => {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, `Missing or ambiguous ${label}`);
  return found[0];
};

/** Validate current healing-relevant flat/mana thresholds; defensive four-piece effects remain separate.
 * @param {object} evidence @returns {object}
 */
export function validatePriestDungeonSets(evidence) {
  assert.equal(evidence.schema, "kfc-priest-dungeon-set-source.v1");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.manifestSha256,
    "9196f29921c4ba0cb38b5f649cdcf19ff03f667f6d560e8493a69b69682d7fcc",
  );
  const tables = evidence.tables,
    models = [];
  for (const [id, name, procSpellId, utilitySpellId] of [
    [181, "Magister's Regalia", 450527, 27867],
    [182, "Vestments of the Devout", 450576, 27778],
  ]) {
    const set = one(tables.ItemSet, (row) => row.id === id, `set ${id}`);
    assert.deepEqual(
      [set.Name_lang, set.RequiredSkill, set.RequiredSkillRank, set.SetFlags],
      [name, 0, 0, 0],
    );
    assert.equal(set.ItemID.filter(Boolean).length, 8);
    const links = tables.ItemSetSpell.filter((row) => row.ItemSetID === id);
    assert.deepEqual(
      links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
      [
        [2, 18679],
        [3, 9346],
        [4, utilitySpellId],
        [5, procSpellId],
        [6, 18378],
      ],
    );
    for (const row of links) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
    const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === procSpellId, `proc ${id}`);
    assert.deepEqual(
      [
        proc.DifficultyID,
        proc.ProcChance,
        proc.ProcCharges,
        proc.ProcCategoryRecovery,
        proc.SpellProcsPerMinuteID,
        proc.CumulativeAura,
        proc.ProcTypeMask,
      ],
      [0, 5, 0, 0, 0, 0, [81920, 0]],
    );
    models.push({
      id,
      name,
      procSpellId,
      pieces: 5,
      manaPerProc: 200,
      procChance: 0.05,
      flatHealingAtThree: 18,
      manaPerFiveAtSix: 8,
    });
  }
  for (const [spellId, signatures] of [
    [18679, [[6, 22, 8, [126, 0], 0, 0]]],
    [
      9346,
      [
        [6, 13, 18, [126, 0], 0, 0],
        [6, 135, 18, [126, 0], 0, 1],
      ],
    ],
    [18378, [[6, 85, 8, [0, 0], 0, 0]]],
    [450527, [[6, 42, 200, [0, 0], 450554, 1]]],
    [450576, [[6, 42, 200, [0, 0], 450554, 1]]],
    [450554, [[30, 0, 200, [0, 0], 0, 0]]],
  ]) {
    const effects = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.deepEqual(
      effects.map((row) => [
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.EffectTriggerSpell,
        row.EffectBonusCoefficient,
      ]),
      signatures,
    );
    for (const row of effects) {
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
      assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
      for (const key of [
        "DifficultyID",
        "Variance",
        "ScalingClass",
        "EffectRealPointsPerLevel",
        "EffectAuraPeriod",
        "EffectPointsPerResource",
        "Coefficient",
        "BonusCoefficientFromAP",
        "ResourceCoefficient",
      ])
        assert.equal(row[key], 0, `Unreviewed dungeon-set ${spellId}/${key}`);
    }
  }
  return {
    schema: "kfc-priest-dungeon-set-rules.v1",
    models,
    procEvents:
      "one opportunity per eligible completed parent magic cast, not each recipient, bolt, bounce or periodic tick",
    defensiveFourPieceSupported: false,
    serverVerified: false,
    acquisitionReviewed: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}
