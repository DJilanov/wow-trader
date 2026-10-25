import assert from "node:assert/strict";
import { URL } from "node:url";

export const hunterBeastmasterItemIds = Object.freeze([
  22010, 22011, 22013, 22015, 22016, 22017, 22060, 22061,
]);

const petEffects = [
  {
    itemId: 22013,
    itemEffectId: 102933,
    parent: 27038,
    child: 27039,
    aura: 133,
    amount: 3,
    misc: 0,
    coefficient: 0,
    parentDuration: 0,
    kind: "pet-health-percent",
  },
  {
    itemId: 22015,
    itemEffectId: 102937,
    parent: 27043,
    child: 27042,
    aura: 52,
    amount: 2,
    misc: 0,
    coefficient: 0,
    parentDuration: 21,
    kind: "pet-weapon-crit-percent",
  },
  {
    itemId: 22060,
    itemEffectId: 103314,
    parent: 27225,
    child: 27208,
    aura: 142,
    amount: 10,
    misc: 1,
    coefficient: 0,
    parentDuration: 21,
    kind: "pet-base-armor-percent",
  },
  {
    itemId: 22061,
    itemEffectId: 103316,
    parent: 27206,
    child: 27205,
    aura: 79,
    amount: 3,
    misc: 127,
    coefficient: 1,
    parentDuration: 0,
    kind: "pet-all-school-damage-percent",
  },
];

const one = (rows, predicate, label) => {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
};

function checkEffects(tables, spellId, expected) {
  const rows = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
    (a, b) => a.EffectIndex - b.EffectIndex,
  );
  assert.deepEqual(
    rows.map((row) => [
      row.Effect,
      row.EffectAura,
      row.EffectBasePointsF,
      row.EffectMiscValue,
      row.ImplicitTarget,
      row.EffectTriggerSpell,
      row.EffectAuraPeriod,
      row.EffectBonusCoefficient,
    ]),
    expected,
    "Unreviewed spell payload " + spellId,
  );
  const variableFields = new Set([
    "id",
    "SpellID",
    "EffectIndex",
    "Effect",
    "EffectAura",
    "EffectBasePointsF",
    "EffectMiscValue",
    "ImplicitTarget",
    "EffectTriggerSpell",
    "EffectAuraPeriod",
    "EffectBonusCoefficient",
  ]);
  const defaults = {
    DifficultyID: 0,
    EffectAmplitude: 0,
    EffectAttributes: 0,
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
  for (const [index, row] of rows.entries()) {
    assert.equal(row.EffectIndex, index);
    assert.deepEqual(Object.keys(row).sort(), [...variableFields, ...Object.keys(defaults)].sort());
    for (const [field, value] of Object.entries(defaults))
      assert.deepEqual(row[field], value, "Unreviewed effect field " + field);
  }
}

function checkProc(tables, spellId, chance, mask) {
  const row = one(tables.SpellAuraOptions, (row) => row.SpellID === spellId, "proc " + spellId);
  assert.deepEqual(
    [
      row.DifficultyID,
      row.ProcChance,
      row.ProcTypeMask,
      row.ProcCharges,
      row.ProcCategoryRecovery,
      row.SpellProcsPerMinuteID,
      row.CumulativeAura,
    ],
    [0, chance, mask, 0, 0, 0, 0],
  );
}

function checkSpellMisc(tables, spellId, duration, range, attributes, school = 1) {
  const row = one(tables.SpellMisc, (row) => row.SpellID === spellId, "misc " + spellId);
  assert.deepEqual(
    [
      row.DifficultyID,
      row.DurationIndex,
      row.RangeIndex,
      row.SchoolMask,
      row.CastingTimeIndex,
      row.Speed,
      row.LaunchDelay,
      row.MinDuration,
      row.PvPDurationIndex,
    ],
    [0, duration, range, school, 1, 0, 0, 0, 0],
  );
  const expected = Array(17).fill(0);
  for (const [index, value] of Object.entries(attributes)) expected[Number(index)] = value;
  assert.deepEqual(row.Attributes, expected);
}

function reviewAcquisition(evidence) {
  const acquisition = evidence.acquisition,
    expected = new Map([
      [8906, ["Alliance", 1]],
      [8914, ["Horde", 1]],
      [8931, ["Alliance", 2]],
      [8938, ["Horde", 2]],
      [8952, ["Alliance", 3]],
      [9017, ["Horde", 3]],
      [9000, ["Alliance", 4]],
      [9008, ["Horde", 4]],
    ]),
    reviewedRewards = new Map([
      [8952, [22061, 22017, 22016]],
      [9017, [22061, 22017, 22016]],
      [9000, [22013, 22060]],
      [9008, [22013, 22060]],
    ]),
    pending = [],
    reviewed = [];
  assert.equal(acquisition.schema, "kfc-hunter-beastmaster-acquisition-review.v1");
  assert.equal(acquisition.setId, 515);
  assert.equal(acquisition.requiredClassMask, 4);
  assert.equal(acquisition.completeRewardReview, false);
  assert.equal(acquisition.currentServerAcquisitionVerified, false);
  assert.equal(acquisition.publicationAllowed, false);
  assert.equal(evidence.classQuestEvidence.length, 8);
  assert.equal(acquisition.relations.length, 8);
  assert.equal(new Set(acquisition.relations.map((row) => row.questId)).size, 8);
  for (const relation of acquisition.relations) {
    const [faction, phase] = expected.get(relation.questId) ?? [],
      quest = one(
        evidence.classQuestEvidence,
        (row) => row.questId === relation.questId,
        "Hunter quest",
      ),
      url = new URL(relation.url);
    assert(faction);
    assert.equal(relation.faction, faction);
    assert.deepEqual(
      [
        quest.className,
        quest.requiredClasses,
        quest.requiredRaces,
        quest.phase,
        quest.requiredLevel,
        quest.questLevel,
      ],
      ["Hunter", 4, faction === "Alliance" ? 77 : 178, phase, 58, 60],
    );
    assert.equal(url.origin, "https://www.wowhead.com");
    assert(new RegExp("^/forever/quest=" + relation.questId + "/[a-z-]+$").test(url.pathname));
    assert.equal(url.search, "");
    if (!reviewedRewards.has(relation.questId)) {
      assert.equal(relation.status, "pending-forever-reward-review");
      for (const field of ["rewardIds", "requiredBaseIds", "rewardDelivery"])
        assert.equal(relation[field], undefined, "Pending rewards must not be inferred");
      pending.push(relation.questId);
      continue;
    }
    assert.equal(relation.status, "reviewed-forever-reward-rows");
    assert.equal(relation.rewardDelivery, "all-listed-items");
    assert.deepEqual(relation.rewardIds, reviewedRewards.get(relation.questId));
    assert.deepEqual(
      relation.requiredBaseIds,
      phase === 3 ? [16675, 16678, 16679] : [16674, 16677],
    );
    assert(relation.requiredBaseIds.every((id) => quest.requiredItemIds.includes(id)));
    for (const id of relation.rewardIds) {
      const item = one(evidence.normalized.items, (row) => row.itemId === id, "reward " + id);
      assert.equal(item.name, acquisition.rewardNames[id]);
    }
    reviewed.push(relation.questId);
  }
  assert.deepEqual(
    Object.keys(acquisition.rewardNames)
      .map(Number)
      .sort((a, b) => a - b),
    [22013, 22016, 22017, 22060, 22061],
  );
  return {
    reviewedQuestIds: reviewed.sort((a, b) => a - b),
    pendingQuestIds: pending.sort((a, b) => a - b),
    completeRewardReview: false,
    currentServerVerified: false,
  };
}

/** Review current client mechanics without qualifying an engine or admitting catalog items.
 * @param {object} evidence @returns {object}
 */
export function reviewHunterBeastmasterSource(evidence) {
  assert.equal(evidence.schema, "kfc-hunter-beastmaster-client-source.v1");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  const set = one(evidence.normalized.sets, (row) => row.id === 515, "base Beastmaster set"),
    alternate = one(
      evidence.normalized.sets,
      (row) => row.id === 1669,
      "alternate Beastmaster set",
    ),
    tables = evidence.tables,
    links = evidence.normalized.setEffects.filter((row) => row.ItemSetID === 515);
  assert.equal(set.Name_lang, "Beastmaster Armor");
  assert.equal(alternate.Name_lang, set.Name_lang);
  assert.deepEqual(
    set.ItemID.filter(Boolean).sort((a, b) => a - b),
    [...hunterBeastmasterItemIds],
  );
  assert.deepEqual(
    alternate.ItemID.filter(Boolean).sort((a, b) => a - b),
    Array.from({ length: 8 }, (_, i) => 226897 + i),
  );
  assert.deepEqual([set.SetFlags, set.RequiredSkill, set.RequiredSkillRank], [0, 0, 0]);
  assert.deepEqual(
    links,
    tables.ItemSetSpell.filter((row) => row.ItemSetID === 515),
  );
  assert.deepEqual(
    links.map((row) => [row.Threshold, row.SpellID]).sort((a, b) => a[0] - b[0]),
    [
      [2, 18679],
      [4, 27785],
      [6, 14049],
      [8, 14803],
    ],
  );
  for (const link of links) assert.deepEqual([link.ChrSpecID, link.TraitSubTreeID], [0, 0]);
  assert.deepEqual(
    evidence.normalized.items.map((row) => row.itemId).sort((a, b) => a - b),
    [...hunterBeastmasterItemIds],
  );
  assert.equal(tables.ItemSparse.length, 8);
  for (const item of evidence.normalized.items) {
    const sparse = one(tables.ItemSparse, (row) => row.id === item.itemId, "sparse item"),
      individual = petEffects.find((row) => row.itemId === item.itemId);
    assert.deepEqual([item.setId, item.classId, item.subclassId], [515, 4, 3]);
    assert.deepEqual(item.issues, []);
    assert.deepEqual(item.effectIds, individual ? [individual.itemEffectId] : []);
    assert.deepEqual([sparse.Bonding, sparse.AllowableClass], [1, -1]);
  }
  checkEffects(tables, 18679, [[6, 22, 8, [126, 0], [1, 0], 0, 0, 0]]);
  checkEffects(tables, 14049, [
    [6, 99, 40, [0, 0], [1, 0], 0, 0, 0],
    [6, 124, 40, [0, 0], [1, 0], 0, 0, 0],
  ]);
  checkEffects(tables, 14803, [[6, 674, 200, [1, 0], [1, 0], 0, 0, 0]]);
  checkEffects(tables, 27785, [[6, 42, 1, [0, 0], [1, 0], 27786, 0, 0]]);
  checkEffects(tables, 27786, [[30, 0, 200, [0, 0], [1, 0], 0, 0, 1]]);
  checkProc(tables, 27785, 4, [64, 0]);
  checkProc(tables, 27786, 101, [0, 0]);
  checkSpellMisc(tables, 27785, 0, 1, { 0: 192, 15: 8192 });
  checkSpellMisc(tables, 27786, 0, 1, { 15: 8192 }, 2);
  assert.equal(tables.ItemEffect.length, 4);
  assert.equal(tables.ItemXItemEffect.length, 4);
  for (const spec of petEffects) {
    const link = one(tables.ItemXItemEffect, (row) => row.ItemID === spec.itemId, "pet item link"),
      effect = one(tables.ItemEffect, (row) => row.id === spec.itemEffectId, "pet item effect");
    assert.equal(link.ItemEffectID, spec.itemEffectId);
    assert.deepEqual(
      [
        effect.SpellID,
        effect.TriggerType,
        effect.Charges,
        effect.CoolDownMSec,
        effect.CategoryCoolDownMSec,
        effect.SpellCategoryID,
        effect.ChrSpecializationID,
        effect.PlayerConditionID,
      ],
      [spec.parent, 1, 0, -1, -1, 0, 0, 0],
    );
    checkEffects(tables, spec.parent, [
      [6, 23, 0, [0, 0], [1, 0], spec.child, 3000, spec.coefficient],
    ]);
    checkEffects(tables, spec.child, [
      [6, spec.aura, spec.amount, [spec.misc, 0], [5, 0], 0, 0, 1],
    ]);
    checkSpellMisc(tables, spec.parent, spec.parentDuration, 1, { 0: 64, 15: 8192 });
    checkSpellMisc(tables, spec.child, 35, 6, { 0: 384, 2: 4, 15: 8192 });
    for (const spellId of [spec.parent, spec.child]) {
      const options = tables.SpellAuraOptions.filter((row) => row.SpellID === spellId);
      if ([27038, 27042, 27206].includes(spellId)) assert.equal(options.length, 0);
      else checkProc(tables, spellId, 101, [0, 0]);
    }
  }
  assert.deepEqual(
    one(tables.SpellDuration, (row) => row.id === 35, "pet buff duration"),
    { id: 35, Duration: 4000, MaxDuration: 4000, DurationPerResource: 0 },
  );
  assert.deepEqual(
    one(tables.SpellDuration, (row) => row.id === 21, "permanent duration"),
    { id: 21, Duration: -1, MaxDuration: -1, DurationPerResource: 0 },
  );
  const range = one(tables.SpellRange, (row) => row.id === 6, "pet target range");
  assert.deepEqual([range.Flags, range.RangeMin, range.RangeMax], [0, [0, 0], [100, 100]]);
  const acquisition = reviewAcquisition(evidence);
  return {
    schema: "kfc-hunter-beastmaster-source-review.v1",
    setId: 515,
    excludedVariant: 1669,
    itemIds: [...hunterBeastmasterItemIds],
    setBonuses: {
      resistancesAtTwo: 8,
      manaAtFour: 200,
      attackPowerAtSix: 40,
      rangedAttackPowerAtSix: 40,
      bonusArmorAtEight: 200,
    },
    proc: {
      spellId: 27785,
      manaSpellId: 27786,
      chance: 0.04,
      rangedWhiteOnly: true,
      cooldownMs: 0,
      usesPpm: false,
      serverCadenceVerified: false,
    },
    petEffects: petEffects.map((row) => ({
      itemId: row.itemId,
      itemEffectId: row.itemEffectId,
      parentSpellId: row.parent,
      childSpellId: row.child,
      kind: row.kind,
      percent: row.amount,
      refreshMs: 3000,
      durationMs: 4000,
      targetRangeYards: 100,
      serverTimingVerified: false,
      runtimeQualified: false,
    })),
    acquisition,
    runtimeRequirements: [
      "Override base set 515 by ID; preserve same-name alternate set 1669 and Classic rules.",
      "Use ranged auto attacks at 4% for 200 mana, not the inherited 5% melee/ranged handler.",
      "Apply gloves to pet weapon crit, without adding spell crit or owner crit.",
      "Apply boots to pet damage across all schools, without changing owner damage.",
      "Retain health and base-armor effects; do not substitute total-armor scaling.",
      "Qualify periodic refresh, initial equipped-pet assumption, no-pet behavior and repeated resets.",
    ],
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
