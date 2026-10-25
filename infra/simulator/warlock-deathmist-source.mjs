import assert from "node:assert/strict";

export const warlockDeathmistItemIds = Object.freeze(
  Array.from({ length: 8 }, (_, index) => 22070 + index),
);

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

function effects(tables, id, signatures) {
  const rows = tables.SpellEffect.filter((row) => row.SpellID === id).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  const defaults = {
    DifficultyID: 0,
    EffectAmplitude: 0,
    EffectAttributes: 0,
    EffectAuraPeriod: 0,
    EffectChainAmplitude: 1,
    EffectChainTargets: 0,
    EffectItemType: 0,
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
  assert.equal(rows.length, signatures.length, "Changed effect count " + id);
  for (const [index, signature] of signatures.entries()) {
    const [effect, aura, amount, misc, target, trigger, coefficient, mechanic, variance = 0] =
      signature;
    assert.deepEqual(
      rows[index],
      {
        id: rows[index].id,
        SpellID: id,
        EffectIndex: index,
        ...defaults,
        Variance: variance,
        Effect: effect,
        EffectAura: aura,
        EffectBasePointsF: amount,
        EffectMiscValue: [misc, 0],
        ImplicitTarget: [target, 0],
        EffectTriggerSpell: trigger,
        EffectBonusCoefficient: coefficient,
        EffectMechanic: mechanic,
      },
      "Unreviewed Deathmist spell payload " + id,
    );
  }
}

function proc(tables, id, chance, mask, cooldown) {
  const row = one(tables.SpellAuraOptions, (row) => row.SpellID === id, "proc " + id);
  assert.deepEqual(
    row,
    {
      id: row.id,
      SpellID: id,
      DifficultyID: 0,
      CumulativeAura: 0,
      ProcCategoryRecovery: cooldown,
      ProcChance: chance,
      ProcCharges: 0,
      SpellProcsPerMinuteID: 0,
      ProcTypeMask: [mask, 0],
    },
    "Unreviewed Deathmist proc " + id,
  );
}

function acquisition(evidence) {
  const value = evidence.acquisition;
  assert.equal(value.schema, "kfc-warlock-deathmist-baked-acquisition.v1");
  assert.deepEqual(
    [
      value.source.flavor,
      value.source.mode,
      value.source.contract,
      value.source.version,
      value.source.revision,
      value.source.runtimeLuaExecuted,
    ],
    ["Forever", "baked", "2", "1.0.4", "365537a340473291f5af3b7a53a5eca94e2a5f1a", false],
  );
  assert.equal(value.currentServerAcquisitionVerified, false);
  assert.deepEqual(value.reviewedDeliveryQuestIds, [], "New delivery evidence requires review");
  assert.equal(value.relations.length, 8);
  assert.equal(evidence.classQuestEvidence.length, 8);
  assert.equal(new Set(value.relations.map((row) => row.questId)).size, 8);
  for (const faction of ["Alliance", "Horde"]) {
    const rows = value.relations.filter((row) => row.faction === faction);
    assert.deepEqual(rows.map((row) => row.phase).sort(), [1, 2, 3, 4]);
    assert.deepEqual(
      rows.flatMap((row) => row.rewardItemIds).sort((a, b) => a - b),
      [...warlockDeathmistItemIds],
    );
    for (const row of rows) {
      const quest = one(
        evidence.classQuestEvidence,
        (quest) => quest.questId === row.questId,
        "Warlock quest " + row.questId,
      );
      assert.deepEqual([row.setId, row.className, row.requiredClassMask], [518, "Warlock", 256]);
      assert.deepEqual(
        [quest.className, quest.requiredClasses, quest.requiredRaces, quest.phase],
        ["Warlock", 256, faction === "Alliance" ? 77 : 178, row.phase],
      );
      assert.deepEqual(row.requiredItemIds, quest.requiredItemIds);
      assert.equal(row.rewardItemIds.length, [1, 2, 3, 2][row.phase - 1]);
      assert.equal(row.rewardQuantitiesVerified, false);
      assert.equal(row.simultaneousDeliveryVerified, false);
    }
  }
  assert.equal(value.items.length, 8);
  for (const id of warlockDeathmistItemIds) {
    const item = one(value.items, (row) => row.id === id, "Warlock reward item " + id);
    assert.deepEqual([item.setId, item.className, item.requiredClassMask], [518, "Warlock", 256]);
    assert.deepEqual(
      item.questIds,
      value.relations
        .filter((row) => row.rewardItemIds.includes(id))
        .map((row) => row.questId)
        .sort((a, b) => a - b),
    );
    assert.equal(item.currentServerAcquisitionVerified, false);
  }
}

/** Review the exact current base set separately from the same-name alternate.
 * Baked quest associations do not establish reward delivery or live acquisition.
 * @param {object} evidence @returns {object}
 */
export function reviewWarlockDeathmistSource(evidence) {
  assert.equal(evidence.schema, "kfc-warlock-deathmist-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  assert.equal(evidence.currentServerAcquisitionVerified, false);
  assert.equal(evidence.numericalQualification, false);
  assert.equal(evidence.publicationAllowed, false);
  assert.equal(evidence.normalized.sets.length, 2);
  assert.equal(evidence.tables.ItemSparse.length, 8);
  assert.equal(evidence.tables.SpellEffect.length, 10);
  assert.equal(new Set(evidence.tables.SpellEffect.map((row) => row.id)).size, 10);
  const base = one(evidence.normalized.sets, (row) => row.id === 518, "base Deathmist Raiment"),
    alternate = one(
      evidence.normalized.sets,
      (row) => row.id === 1681,
      "alternate Deathmist Raiment",
    );
  assert.equal(base.Name_lang, "Deathmist Raiment");
  assert.equal(alternate.Name_lang, base.Name_lang);
  assert.deepEqual(
    base.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...warlockDeathmistItemIds],
  );
  assert.deepEqual(
    alternate.ItemID.filter(Boolean).sort((a, b) => a - b),
    Array.from({ length: 8 }, (_, index) => 226921 + index),
  );
  assert.deepEqual([base.RequiredSkill, base.RequiredSkillRank, base.SetFlags], [0, 0, 0]);
  assert.deepEqual(evidence.normalized.setEffects, evidence.tables.ItemSetSpell);
  for (const [id, expected] of [
    [
      518,
      [
        [2, 18679],
        [4, 27780],
        [6, 14047],
        [8, 14803],
      ],
    ],
    [
      1681,
      [
        [2, 18679],
        [3, 18378],
        [4, 450585],
        [5, 27780],
        [6, 14047],
      ],
    ],
  ]) {
    const rows = evidence.tables.ItemSetSpell.filter((row) => row.ItemSetID === id);
    assert.deepEqual(
      rows.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
      expected,
    );
    for (const row of rows) assert.deepEqual([row.ChrSpecID, row.TraitSubTreeID], [0, 0]);
  }
  for (const [id, signatures] of [
    [18679, [[6, 22, 8, 126, 1, 0, 0, 0]]],
    [14803, [[6, 674, 200, 1, 1, 0, 0, 0]]],
    [
      14047,
      [
        [6, 13, 23, 126, 1, 0, 0, 0],
        [6, 135, 23, 126, 1, 0, 1, 0],
      ],
    ],
    [27780, [[6, 42, 1, 0, 1, 21330, 0, 0]]],
    [
      21330,
      [
        [6, 33, -25, 0, 6, 0, 1, 0],
        [6, 7, 0, 0, 6, 0, 1, 0],
      ],
    ],
    [18378, [[6, 85, 8, 0, 1, 0, 0, 0]]],
    [450585, [[6, 42, 300, 0, 1, 450583, 1, 0]]],
    [450583, [[10, 0, 300, 0, 1, 0, 0, 0, 0.2]]],
  ])
    effects(evidence.tables, id, signatures);
  proc(evidence.tables, 27780, 2, 139944, 60000);
  proc(evidence.tables, 450585, 5, 81920, 0);
  const fear = one(evidence.tables.SpellMisc, (row) => row.SpellID === 21330, "fear child"),
    duration = one(
      evidence.tables.SpellDuration,
      (row) => row.id === fear.DurationIndex,
      "fear duration",
    ),
    range = one(evidence.tables.SpellRange, (row) => row.id === fear.RangeIndex, "fear range"),
    category = one(
      evidence.tables.SpellCategories,
      (row) => row.SpellID === 21330,
      "fear category",
    );
  assert.deepEqual([fear.DurationIndex, fear.RangeIndex, fear.SchoolMask], [39, 1, 32]);
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [2000, 2000, 0],
  );
  assert.deepEqual([range.Flags, range.RangeMin, range.RangeMax], [0, [0, 0], [0, 0]]);
  assert.deepEqual(category, {
    id: category.id,
    SpellID: 21330,
    DifficultyID: 0,
    Category: 0,
    DefenseType: 1,
    DiminishType: 0,
    DispelType: 2,
    Mechanic: 5,
    PreventionType: 0,
    StartRecoveryCategory: 0,
    ChargeCategory: 0,
  });
  assert.equal(evidence.tables.ItemXItemEffect.length, 0);
  assert.equal(evidence.normalized.items.length, 8);
  assert.deepEqual(
    evidence.normalized.items.map((row) => row.itemId).sort((a, b) => a - b),
    [...warlockDeathmistItemIds],
  );
  for (const item of evidence.normalized.items) {
    assert.equal(item.setId, 518);
    assert.deepEqual(item.effectIds, []);
    assert.deepEqual(item.issues, []);
    assert.deepEqual([item.classId, item.subclassId], [4, 1]);
    const sparse = one(
      evidence.tables.ItemSparse,
      (row) => row.id === item.itemId,
      "Warlock ItemSparse",
    );
    assert.equal(sparse.ItemSet, 518);
    assert.equal(sparse.Display_lang, item.name);
    assert.equal(sparse.Bonding, 1);
  }
  acquisition(evidence);
  return {
    schema: "kfc-warlock-deathmist-source-review.v1",
    setId: 518,
    excludedVariantSetId: 1681,
    itemIds: [...warlockDeathmistItemIds],
    thresholdSpells: [
      [2, 18679],
      [4, 27780],
      [6, 14047],
      [8, 14803],
    ],
    bonuses: {
      resistances: { pieces: 2, amount: 8 },
      spellPowerAndHealing: { pieces: 6, amount: 23 },
      bonusArmor: { pieces: 8, amount: 200 },
    },
    fear: {
      pieces: 4,
      parentSpellId: 27780,
      childSpellId: 21330,
      procChancePercent: 2,
      procMask: [139944, 0],
      internalCooldownMs: 60000,
      durationMs: 2000,
      movementSpeedPercent: -25,
      categoryMechanic: 5,
      diminishType: 0,
      dispelType: 2,
      childRangeIndex: 1,
      childImplicitTarget: 6,
      incomingHitTriggered: true,
      attackerTargetingAndRangeVerified: false,
      immunityBehaviorVerified: false,
      damageBreakBehaviorVerified: false,
      diminishingReturnsVerified: false,
    },
    alternateOnlyBonuses: {
      mp5: { pieces: 3, amount: 8 },
      healingProc: { pieces: 4, basePoints: 300, variance: 0.2, procChancePercent: 5 },
    },
    obtainableClass: 8,
    gameClassMask: 256,
    questRelations: 8,
    itemRewardAssociations: 16,
    rewardDeliveryPagesVerified: 0,
    currentServerAcquisitionVerified: false,
    runtimeQualified: false,
    catalogAdmissionAllowed: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
