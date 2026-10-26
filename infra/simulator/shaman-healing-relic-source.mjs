import assert from "node:assert/strict";

const coefficientSpells = new Set([461295, 1291076, 1291077, 1291078]);

const relics = [
  [
    22345,
    103193,
    27797,
    "riptide-cost-percent",
    [[108, -5, 14, [0, 0, 16, 0]]],
    "Reduces the Mana cost of Riptide by $s1%.",
  ],
  [
    22395,
    102980,
    27859,
    "offensive-shock-percent",
    [
      [108, 2, 0, [-1877999616, 0, 0, 0]],
      [108, 2, 22, [268435456, 0, 0, 0]],
    ],
    "Increases the damage of your Shock spells by $s1%.",
  ],
  [
    23200,
    104176,
    28856,
    "water-shield-charges",
    [[107, 1, 4, [0, 32, 0, 0]]],
    "Increases the maximum number of charges on your Water Shield by $s1.",
  ],
  [
    228176,
    189417,
    461295,
    "offensive-lightning-bolt-crit",
    [[107, 1, 7, [1, 0, 0, 0]]],
    "Increases the critical strike chance of Lightning Bolt by $s1%.",
  ],
  [
    249398,
    213829,
    1248756,
    "casting-spirit-regeneration-percent",
    [[134, 8, 0, [0, 0, 0, 0]]],
    "Allows $s1% of your Mana regeneration to continue while casting.",
  ],
  [
    249443,
    213839,
    1249011,
    "grounding-totem-cooldown",
    [[107, -1000, 11, [262144, 0, 0, 0]]],
    "Reduces the cooldown of Grounding Totem by ${$s1/-1000} sec.",
  ],
  [
    272431,
    232244,
    1291076,
    "healing-wave-cost-percent",
    [[108, -5, 14, [64, 0, 0, 0]]],
    "Reduces the Mana cost of your Healing Wave ability by $s1%.",
  ],
  [
    272432,
    232245,
    1291078,
    "offensive-lightning-bolt-maelstrom",
    [[4, 50, 0, [0, 0, 0, 0]]],
    "Your Lightning Bolt ability can now also trigger the Maelstrom Weapon talent, but with a $s1% reduced chance.",
  ],
  [
    272433,
    232246,
    1291077,
    "offensive-flame-shock-duration",
    [[107, 3000, 1, [268435456, 0, 0, 0]]],
    "Increases the duration of your Flame Shock ability by ${$m1/1000} sec.",
  ],
  [
    279249,
    235973,
    1306448,
    "lesser-healing-wave-crit-percent",
    [[107, 4, 7, [128, 0, 0, 0]]],
    "Increases the critical strike chance of your Lesser Healing Wave spell by $s1%.",
  ],
];

function one(rows, predicate, label) {
  const selected = rows.filter(predicate);
  assert.equal(selected.length, 1, "Missing or ambiguous " + label);
  return selected[0];
}

/** Resolve actual client item links and all 32 owned cast-family masks.
 * This is source review; runtime stacking and server behavior require separate admission.
 * @param {object} evidence @returns {object}
 */
export function extractShamanHealingRelicSource(evidence) {
  assert.equal(evidence.schema, "kfc-shaman-relic-family-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  assert.equal(evidence.selectedRowsAreSourceSubsets, true);
  for (const field of [
    "serverMechanicsVerified",
    "fullClassAdmission",
    "startsNewClassClock",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(evidence[field], false);
  assert.deepEqual(
    evidence.relicIds,
    relics.map((row) => row[0]).sort((a, b) => a - b),
  );
  const { tables } = evidence;
  assert.equal(tables.ItemXItemEffect.length, 10);
  assert.equal(tables.ItemEffect.length, 10);
  assert.equal(tables.SpellEffect.length, 11);
  assert.deepEqual(tables.SpellAuraOptions, []);
  assert.equal(evidence.ownedActions.length, 32);
  assert.equal(new Set(evidence.ownedActions.map((row) => row.id)).size, 32);
  const expectedFamilies = {
    "healing-wave": [9, [64, 0, 0, 0]],
    "lesser-healing-wave": [6, [128, 0, 0, 0]],
    "chain-heal": [3, [256, 0, 0, 0]],
    riptide: [3, [0, 0, 16, 0]],
    "healing-stream": [5, [524288, 0, 0, 0]],
    "mana-tide": [4, [536870912, 0, 0, 0]],
    "water-shield": [1, [0, 32, 0, 0]],
    "natures-swiftness": [1, [0, 0, 0, 0]],
  };
  const owned = evidence.ownedActions.map((action) => {
    assert(Object.hasOwn(expectedFamilies, action.family));
    const row = one(
      tables.SpellClassOptions,
      (row) => row.SpellID === action.id,
      "owned class mask",
    );
    assert.equal(row.SpellClassSet, 11);
    assert.equal(row.ModalNextSpell, 0);
    assert.deepEqual(row.SpellClassMask, expectedFamilies[action.family][1]);
    return { ...action, mask: [...row.SpellClassMask] };
  });
  assert(!owned.some((row) => row.id === 25357));
  for (const [family, [count]] of Object.entries(expectedFamilies))
    assert.equal(owned.filter((row) => row.family === family).length, count);
  const relevant = new Set([22345, 23200, 249398, 272431, 279249]);
  const provisionalBaseItems = new Set([22345, 22395, 23200]);
  const items = relics.map(([itemId, itemEffectId, spellId, kind, signatures, description]) => {
    const item = one(evidence.items, (row) => row.id === itemId, "relic item"),
      raw = tables.ItemSparse.filter((row) => row.id === itemId);
    assert.equal(item.type, 14);
    assert.equal(item.rangedWeaponType, 7);
    if (provisionalBaseItems.has(itemId)) assert.deepEqual(raw, []);
    else {
      assert.equal(raw.length, 1, "Missing current relic sparse record");
      assert.equal(raw[0].InventoryType, 28);
    }
    const link = one(tables.ItemXItemEffect, (row) => row.ItemID === itemId, "relic link");
    assert.equal(link.ItemEffectID, itemEffectId);
    const effect = one(tables.ItemEffect, (row) => row.id === itemEffectId, "relic effect");
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
      [spellId, 1, 0, -1, -1, 0, 0, 0],
    );
    assert.equal(
      one(tables.Spell, (row) => row.id === spellId, "relic description").Description_lang,
      description,
    );
    const family = tables.SpellClassOptions.filter((row) => row.SpellID === spellId);
    if (itemId === 249398) assert.deepEqual(family, []);
    else {
      assert.equal(family.length, 1);
      assert.deepEqual(
        [family[0].SpellClassSet, family[0].ModalNextSpell, family[0].SpellClassMask],
        [11, 0, [0, 0, 0, 0]],
      );
    }
    const rows = tables.SpellEffect.filter((row) => row.SpellID === spellId).sort(
      (a, b) => a.EffectIndex - b.EffectIndex,
    );
    assert.equal(rows.length, signatures.length);
    for (const [index, [aura, amount, misc, mask]] of signatures.entries()) {
      const row = rows[index];
      assert.deepEqual(
        [
          row.EffectIndex,
          row.Effect,
          row.EffectAura,
          row.EffectBasePointsF,
          row.EffectMiscValue,
          row.EffectSpellClassMask,
          row.ImplicitTarget,
        ],
        [index, 6, aura, amount, [misc, 0], mask, [1, 0]],
      );
      for (const key of [
        "DifficultyID",
        "EffectAmplitude",
        "EffectAttributes",
        "EffectAuraPeriod",
        "EffectChainTargets",
        "EffectItemType",
        "EffectMechanic",
        "EffectPointsPerResource",
        "EffectPos_facing",
        "EffectRealPointsPerLevel",
        "EffectTriggerSpell",
        "BonusCoefficientFromAP",
        "Coefficient",
        "Variance",
        "ResourceCoefficient",
        "ScalingClass",
        "Node__Field_12_0_0_63534_001",
      ])
        assert.equal(row[key], 0, "Unreviewed relic payload " + key);
      assert.equal(row.EffectBonusCoefficient, coefficientSpells.has(spellId) ? 1 : 0);
      for (const key of ["EffectChainAmplitude", "PvpMultiplier", "GroupSizeBasePointsCoefficient"])
        assert.equal(row[key], 1);
      assert.deepEqual(row.EffectRadiusIndex, [0, 0]);
    }
    const affectedActions = owned
      .filter((action) =>
        rows.some((row) =>
          row.EffectSpellClassMask.some((value, index) => (value & action.mask[index]) !== 0),
        ),
      )
      .map((row) => row.id)
      .sort((a, b) => a - b);
    if (!relevant.has(itemId))
      assert.deepEqual(affectedActions, [], "Offensive/control relic acquired a healing family");
    return {
      itemId,
      itemEffectId,
      spellId,
      name: item.name,
      currentBaseItemRecordPresent: !provisionalBaseItems.has(itemId),
      kind,
      effects: signatures.map(([aura, amount, operation, mask]) => ({
        aura,
        amount,
        operation,
        bonusCoefficient: coefficientSpells.has(spellId) ? 1 : 0,
        mask: [...mask],
      })),
      affectedActions,
      classification: relevant.has(itemId)
        ? "healing-runtime-review-required"
        : "inactive-in-declared-healing-assignment",
      reason: relevant.has(itemId)
        ? "Current captured payload affects an owned healing/resource family or casting spirit regeneration."
        : "Stationary post-mitigation healing has no hostile spell rotation,Maelstrom policy or hostile caster spells for Grounding Totem.",
      retainedInEquipmentDomain: true,
    };
  });
  for (const [itemId, family] of [
    [22345, "riptide"],
    [23200, "water-shield"],
    [272431, "healing-wave"],
    [279249, "lesser-healing-wave"],
  ])
    assert.deepEqual(
      items.find((row) => row.itemId === itemId).affectedActions,
      owned
        .filter((row) => row.family === family)
        .map((row) => row.id)
        .sort((a, b) => a - b),
    );
  return {
    schema: "kfc-shaman-healing-relic-source-review.v1",
    sourceBuild: 70532,
    ownedActions: owned,
    items,
    healingRelevantItemIds: [...relevant].sort((a, b) => a - b),
    inactiveItemIds: items.filter((row) => !relevant.has(row.itemId)).map((row) => row.itemId),
    provisionalBaseItemIds: [...provisionalBaseItems],
    unclassifiedItems: 0,
    allItemsRetained: true,
    serverMechanicsVerified: false,
    runtimeAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
