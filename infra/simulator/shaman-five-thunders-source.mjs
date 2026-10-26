import assert from "node:assert/strict";

export const shamanFiveThundersItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 22095 + index),
);

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

function spellEffects(tables, id, signatures) {
  const rows = tables.SpellEffect.filter((row) => row.SpellID === id).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    ),
    defaults = {
      DifficultyID: 0,
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
    };
  assert.equal(rows.length, signatures.length, "Unexpected Five Thunders effect count");
  for (const [index, [aura, amount, misc, target, trigger, coefficient]] of signatures.entries())
    assert.deepEqual(
      rows[index],
      {
        id: rows[index].id,
        SpellID: id,
        EffectIndex: index,
        ...defaults,
        Effect: 6,
        EffectAura: aura,
        EffectBasePointsF: amount,
        EffectMiscValue: [misc, 0],
        ImplicitTarget: [target, 0],
        EffectTriggerSpell: trigger,
        EffectBonusCoefficient: coefficient,
      },
      "Changed Five Thunders payload " + id,
    );
}

function proc(tables, id, chance, mask, cooldown) {
  const row = one(tables.SpellAuraOptions, (row) => row.SpellID === id, "proc " + id);
  assert.deepEqual(row, {
    id: row.id,
    SpellID: id,
    DifficultyID: 0,
    CumulativeAura: 0,
    ProcCategoryRecovery: cooldown,
    ProcChance: chance,
    ProcCharges: 0,
    SpellProcsPerMinuteID: 0,
    ProcTypeMask: [mask, 0],
  });
}

/** Review base519 independently of alternate1679; source data is not runtime or acquisition admission.
 * @param {object} evidence @returns {object}
 */
export function reviewShamanFiveThundersSource(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-five-thunders-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  for (const key of [
    "currentServerAcquisitionVerified",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(evidence[key], false);
  const { tables, normalized, acquisition } = evidence;
  assert.equal(normalized.sets.length, 2);
  for (const [id, members] of [
    [519, shamanFiveThundersItemIds],
    [1679, Array.from({ length: 8 }, (_, index) => 227033 + index)],
  ]) {
    const set = one(normalized.sets, (row) => row.id === id, "set " + id);
    assert.equal(set.Name_lang, "The Five Thunders");
    assert.deepEqual(
      set.ItemID.filter(Boolean).sort((a, b) => a - b),
      [...members],
    );
    assert.deepEqual([set.SetFlags, set.RequiredSkill, set.RequiredSkillRank], [0, 0, 0]);
  }
  assert.deepEqual(normalized.setEffects, tables.ItemSetSpell);
  for (const [id, expected] of [
    [
      519,
      [
        [2, 18679],
        [4, 27774],
        [6, 14047],
        [8, 14803],
      ],
    ],
    [
      1679,
      [
        [2, 18679],
        [3, 18378],
        [4, 450626],
        [5, 1302718],
        [6, 14047],
      ],
    ],
  ]) {
    const rows = tables.ItemSetSpell.filter((row) => row.ItemSetID === id).sort(
      (a, b) => a.Threshold - b.Threshold,
    );
    assert.deepEqual(
      rows.map((row) => [row.Threshold, row.SpellID]),
      expected,
    );
    assert(rows.every((row) => row.ChrSpecID === 0 && row.TraitSubTreeID === 0));
  }
  assert.equal(tables.ItemSetSpell.length, 9);
  assert.equal(tables.SpellEffect.length, 11);
  for (const [id, signatures] of [
    [14803, [[674, 200, 1, 1, 0, 0]]],
    [
      14047,
      [
        [13, 23, 126, 1, 0, 0],
        [135, 23, 126, 1, 0, 1],
      ],
    ],
    [18378, [[85, 8, 0, 1, 0, 0]]],
    [18679, [[22, 8, 126, 1, 0, 0]]],
    [27774, [[42, 1, 0, 1, 27775, 0]]],
    [
      27775,
      [
        [13, 65, 126, 1, 0, 0],
        [135, 65, 126, 1, 0, 1],
      ],
    ],
    [450626, [[42, 0, 0, 1, 27775, 0]]],
    [1302717, [[67, 0, 0, 6, 0, 0]]],
    [1302718, [[42, 1, 0, 1, 1302717, 1]]],
  ])
    spellEffects(tables, id, signatures);
  proc(tables, 27774, 4, 81920, 0);
  proc(tables, 450626, 100, 81924, 0);
  proc(tables, 1302718, 5, 40, 60000);
  for (const [id, expected] of [
    [27775, 10000],
    [1302717, 4000],
  ]) {
    const misc = one(tables.SpellMisc, (row) => row.SpellID === id, "misc " + id),
      duration = one(
        tables.SpellDuration,
        (row) => row.id === misc.DurationIndex,
        "duration " + id,
      );
    assert.deepEqual(
      [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
      [expected, expected, 0],
    );
  }
  assert.equal(normalized.items.length, 8);
  assert.equal(tables.ItemSparse.length, 8);
  assert.deepEqual(tables.ItemXItemEffect, []);
  for (const id of shamanFiveThundersItemIds) {
    const item = one(normalized.items, (row) => row.itemId === id, "normalized item " + id),
      sparse = one(tables.ItemSparse, (row) => row.id === id, "sparse item " + id);
    assert.equal(item.setId, 519);
    assert.equal(sparse.ItemSet, 519);
    assert.equal(sparse.AllowableClass, -1);
    assert.deepEqual(item.effectIds, []);
    assert.deepEqual(item.issues, []);
  }
  assert.equal(acquisition.schema, "kfc-shaman-five-thunders-baked-acquisition.v1");
  assert.equal(acquisition.source.flavor, "Forever");
  assert.equal(acquisition.source.mode, "baked");
  assert.equal(acquisition.source.runtimeLuaExecuted, false);
  assert.deepEqual(
    [acquisition.source.contract, acquisition.source.version, acquisition.source.revision],
    ["2", "1.0.4", "365537a340473291f5af3b7a53a5eca94e2a5f1a"],
  );
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.deepEqual(acquisition.reviewedDeliveryQuestIds, []);
  assert.equal(acquisition.items.length, 8);
  assert.equal(acquisition.relations.length, 4);
  assert.equal(evidence.classQuestEvidence.length, 4);
  assert.deepEqual(
    acquisition.relations.map((row) => row.questId).sort((a, b) => a - b),
    [8918, 8942, 8957, 9011],
  );
  assert.deepEqual(
    acquisition.relations.map((row) => [row.questId, row.phase]).sort((a, b) => a[0] - b[0]),
    [
      [8918, 1],
      [8942, 2],
      [8957, 3],
      [9011, 4],
    ],
  );
  for (const relation of acquisition.relations) {
    const quest = one(
      evidence.classQuestEvidence,
      (row) => row.questId === relation.questId,
      "quest " + relation.questId,
    );
    assert.deepEqual(
      [relation.setId, relation.className, relation.requiredClassMask, relation.faction],
      [519, "Shaman", 64, "Horde"],
    );
    assert.deepEqual(
      [quest.className, quest.requiredClasses, quest.requiredRaces, quest.phase],
      ["Shaman", 64, 178, relation.phase],
    );
    assert.deepEqual(relation.requiredItemIds, quest.requiredItemIds);
    assert.equal(relation.rewardItemIds.length, [1, 2, 3, 2][relation.phase - 1]);
    assert.equal(relation.rewardQuantitiesVerified, false);
    assert.equal(relation.simultaneousDeliveryVerified, false);
  }
  assert.deepEqual(
    acquisition.relations.flatMap((row) => row.rewardItemIds).sort((a, b) => a - b),
    [...shamanFiveThundersItemIds],
  );
  for (const id of shamanFiveThundersItemIds) {
    const item = one(acquisition.items, (row) => row.id === id, "reward " + id);
    assert.deepEqual([item.setId, item.className, item.requiredClassMask], [519, "Shaman", 64]);
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
    schema: "kfc-shaman-five-thunders-source-review.v1",
    source: structuredClone(evidence.source),
    baseSetId: 519,
    excludedVariantSetId: 1679,
    itemIds: [...shamanFiveThundersItemIds],
    baseThresholds: [
      [2, 18679],
      [4, 27774],
      [6, 14047],
      [8, 14803],
    ],
    baseProc: {
      parentSpellId: 27774,
      childSpellId: 27775,
      chancePercent: 4,
      rawProcMask: [81920, 0],
      cooldownMs: 0,
      durationMs: 10000,
      damageAndHealing: 65,
      serverTriggerRoutingVerified: false,
    },
    alternateProc: {
      parentSpellId: 450626,
      chancePercent: 100,
      rawProcMask: [81924, 0],
      serverChanceVerified: false,
    },
    alternateElectrocute: {
      parentSpellId: 1302718,
      childSpellId: 1302717,
      chancePercent: 5,
      cooldownMs: 60000,
      durationMs: 4000,
      belongsToBase: false,
    },
    rawWearClassMask: -1,
    referenceAcquisitionClassMask: 64,
    referenceAcquisitionFaction: "Horde",
    rewardQuestIds: [8918, 8942, 8957, 9011],
    rewardDeliveryVerified: false,
    currentServerAcquisitionVerified: false,
    runtimeAdmission: false,
    catalogAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
