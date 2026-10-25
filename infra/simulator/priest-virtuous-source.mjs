import assert from "node:assert/strict";

export const priestVirtuousItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 22078 + index),
);

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

function effects(tables, spellId, signatures) {
  const rows = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
    (left, right) => left.EffectIndex - right.EffectIndex,
  );
  assert.equal(rows.length, signatures.length, "Changed effect count " + spellId);
  for (const [index, signature] of signatures.entries()) {
    const [effect, aura, amount, misc, coefficient, trigger] = signature;
    assert.deepEqual(
      rows[index],
      {
        id: rows[index].id,
        SpellID: spellId,
        EffectIndex: index,
        DifficultyID: 0,
        Effect: effect,
        EffectAura: aura,
        EffectBasePointsF: amount,
        EffectMiscValue: [misc, 0],
        ImplicitTarget: [1, 0],
        EffectBonusCoefficient: coefficient,
        EffectTriggerSpell: trigger,
        EffectAmplitude: 0,
        EffectAttributes: 0,
        EffectAuraPeriod: 0,
        EffectChainAmplitude: 1,
        EffectChainTargets: 0,
        EffectItemType: 0,
        EffectMechanic: 0,
        EffectPointsPerResource: 0,
        EffectPos_facing: 0,
        EffectRealPointsPerLevel: 0,
        BonusCoefficientFromAP: 0,
        PvpMultiplier: 1,
        Coefficient: 0,
        Variance: 0,
        ResourceCoefficient: 0,
        GroupSizeBasePointsCoefficient: 1,
        ScalingClass: 0,
        Node__Field_12_0_0_63534_001: 0,
        EffectRadiusIndex: [0, 0],
        EffectSpellClassMask: [0, 0, 0, 0],
      },
      "Unreviewed Virtuous spell payload " + spellId,
    );
  }
}

/** Review exact current base-set data without granting a runtime or acquisition admission.
 * @param {object} evidence
 * @returns {object}
 */
export function reviewPriestVirtuousSource(evidence) {
  assert.equal(evidence.schema, "kfc-priest-virtuous-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.equal(evidence.currentServerAcquisitionVerified, false);
  assert.equal(evidence.numericalQualification, false);
  assert.equal(evidence.publicationAllowed, false);
  const tables = evidence.tables,
    base = one(evidence.normalized.sets, (set) => set.id === 514, "base Virtuous"),
    alternate = one(evidence.normalized.sets, (set) => set.id === 1675, "alternate Virtuous");
  assert.equal(evidence.normalized.sets.length, 2);
  assert.equal(base.Name_lang, "Vestments of the Virtuous");
  assert.equal(alternate.Name_lang, base.Name_lang);
  assert.deepEqual(
    base.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...priestVirtuousItemIds],
  );
  const alternateIds = alternate.ItemID.filter(Boolean);
  assert.equal(alternateIds.length, 8);
  assert.equal(new Set(alternateIds).size, 8);
  assert(alternateIds.every((id) => !priestVirtuousItemIds.includes(id)));
  assert.deepEqual([base.RequiredSkill, base.RequiredSkillRank, base.SetFlags], [0, 0, 0]);
  assert.deepEqual(evidence.normalized.setEffects, tables.ItemSetSpell);
  for (const [setId, expected] of [
    [
      514,
      [
        [2, 18679],
        [4, 27778],
        [6, 14047],
        [8, 14803],
      ],
    ],
    [
      1675,
      [
        [2, 18679],
        [3, 18378],
        [4, 450576],
        [5, 27778],
        [6, 14047],
      ],
    ],
  ]) {
    const rows = tables.ItemSetSpell.filter((row) => row.ItemSetID === setId);
    assert.deepEqual(
      rows.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
      expected,
    );
    for (const row of rows) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  }
  assert.equal(evidence.normalized.items.length, 8);
  assert.equal(tables.ItemSparse.length, 8);
  assert.equal(tables.ItemXItemEffect.length, 0);
  for (const id of priestVirtuousItemIds) {
    const item = one(evidence.normalized.items, (row) => row.itemId === id, "current item " + id),
      sparse = one(tables.ItemSparse, (row) => row.id === id, "sparse item " + id);
    assert.deepEqual([item.setId, item.classId, item.subclassId], [514, 4, 1]);
    assert.deepEqual(item.issues, []);
    assert.deepEqual(item.effectIds, []);
    assert.deepEqual([sparse.ItemSet, sparse.AllowableClass, sparse.Bonding], [514, -1, 1]);
  }
  for (const [id, signatures] of [
    [18679, [[6, 22, 8, 126, 0, 0]]],
    [
      14047,
      [
        [6, 13, 23, 126, 0, 0],
        [6, 135, 23, 126, 1, 0],
      ],
    ],
    [14803, [[6, 674, 200, 1, 0, 0]]],
    [27778, [[6, 42, 1, 0, 1, 27779]]],
    [27779, [[6, 69, 488, 127, 0, 0]]],
  ])
    effects(tables, id, signatures);
  const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === 27778, "shield proc"),
    shieldMisc = one(tables.SpellMisc, (row) => row.SpellID === 27779, "shield misc"),
    shieldClass = one(tables.SpellClassOptions, (row) => row.SpellID === 27779, "shield class"),
    duration = one(
      tables.SpellDuration,
      (row) => row.id === shieldMisc.DurationIndex,
      "shield duration",
    );
  assert.deepEqual(proc, {
    id: proc.id,
    SpellID: 27778,
    DifficultyID: 0,
    CumulativeAura: 0,
    ProcCategoryRecovery: 60000,
    ProcChance: 2,
    ProcCharges: 0,
    SpellProcsPerMinuteID: 0,
    ProcTypeMask: [139944, 0],
  });
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [30000, 30000, 0],
  );
  assert.deepEqual(
    [shieldClass.SpellClassSet, shieldClass.SpellClassMask, shieldClass.ModalNextSpell],
    [6, [1, 0, 0, 0], 0],
  );
  assert.deepEqual(
    shieldMisc.Attributes,
    [327680, 0, 2621440, 0, 0, 0, 0, 0, 4096, 0, 0, 0, 0, 0, 0, 8192, 0],
  );
  assert.deepEqual([shieldMisc.SchoolMask, shieldMisc.Speed, shieldMisc.LaunchDelay], [2, 0, 0]);
  const range = one(tables.SpellRange, (row) => row.id === shieldMisc.RangeIndex, "shield range");
  assert.deepEqual(
    [range.RangeMin, range.RangeMax],
    [
      [0, 0],
      [0, 0],
    ],
  );
  for (const name of [
    "SpellPower",
    "SpellCooldowns",
    "SpellAuraRestrictions",
    "SpellEquippedItems",
  ])
    assert.equal(
      tables[name].filter((row) => [27778, 27779].includes(row.SpellID)).length,
      0,
      name,
    );
  const acquisition = evidence.acquisition;
  assert.equal(acquisition.schema, "kfc-priest-virtuous-baked-acquisition.v1");
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.deepEqual(
    acquisition.reviewedDeliveryQuestIds,
    [],
    "New delivery evidence requires review",
  );
  assert.equal(acquisition.items.length, 8);
  assert.equal(acquisition.relations.length, 8);
  assert.equal(evidence.classQuestEvidence.length, 8);
  for (const faction of ["Alliance", "Horde"]) {
    const relations = acquisition.relations.filter((row) => row.faction === faction);
    assert.deepEqual(relations.map((row) => row.phase).sort(), [1, 2, 3, 4]);
    assert.deepEqual(
      relations.flatMap((row) => row.rewardItemIds).sort((a, b) => a - b),
      [...priestVirtuousItemIds],
    );
    for (const relation of relations) {
      const quest = one(
        evidence.classQuestEvidence,
        (row) => row.questId === relation.questId,
        "Priest quest",
      );
      assert.deepEqual(
        [relation.setId, relation.className, relation.requiredClassMask],
        [514, "Priest", 16],
      );
      assert.deepEqual(
        [quest.className, quest.requiredClasses, quest.requiredRaces, quest.phase],
        ["Priest", 16, faction === "Alliance" ? 77 : 178, relation.phase],
      );
      assert.deepEqual(relation.requiredItemIds, quest.requiredItemIds);
      assert.equal(relation.rewardItemIds.length, [1, 2, 3, 2][relation.phase - 1]);
      assert.equal(relation.rewardQuantitiesVerified, false);
      assert.equal(relation.simultaneousDeliveryVerified, false);
    }
  }
  for (const id of priestVirtuousItemIds) {
    const item = one(acquisition.items, (row) => row.id === id, "reward item " + id);
    assert.deepEqual([item.setId, item.className, item.requiredClassMask], [514, "Priest", 16]);
    assert.deepEqual(
      item.questIds,
      acquisition.relations
        .filter((row) => row.rewardItemIds.includes(id))
        .map((row) => row.questId)
        .sort((a, b) => a - b),
    );
    assert.equal(item.currentServerAcquisitionVerified, false);
  }
  return {
    schema: "kfc-priest-virtuous-source-review.v1",
    baseSetId: 514,
    excludedVariantSetId: 1675,
    itemIds: [...priestVirtuousItemIds],
    obtainableClass: 5,
    gameClassMask: 16,
    rawWearClassMask: -1,
    flatBonuses: { resistancesAtTwo: 8, spellPowerAtSix: 23, bonusArmorAtEight: 200 },
    shield: {
      procSpellId: 27778,
      spellId: 27779,
      amount: 488,
      coefficient: 0,
      durationMs: 30000,
      icdMs: 60000,
      chance: 0.02,
      procTypeMask: [...proc.ProcTypeMask],
      schoolMask: 127,
      clientClassSet: 6,
      clientClassMask: [...shieldClass.SpellClassMask],
      requiresPriestFamilyInteractionAdmission: true,
      requiresIncomingEventAdmission: true,
    },
    acquisitionRelations: globalThis.structuredClone(acquisition.relations),
    currentServerAcquisitionVerified: false,
    runtimeComponentAdmitted: false,
    modelAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
    startsNewClassClock: false,
  };
}
