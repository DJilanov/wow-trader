import assert from "node:assert/strict";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
}

/** Qualify the captured librams against the declared healing-only spell domain.
 * @param {object} evidence @returns {object}
 */
export function extractPaladinHealingLibrams(evidence) {
  assert.equal(evidence.schema, "kfc-paladin-healing-librams-client-source.v1");
  assert.equal(evidence.source.build.clientVersion, "1.60.1.70532");
  const expected = [
    [22400, 27850, 108, -10, [14, 0], [0, 2, 0, 0], 0, "cleanse-purify"],
    [22401, 27848, 107, 4000, [1, 0], [167772672, 0, 0, 0], 0, "seals"],
    [23201, 28853, 42, 0, [0, 0], [0, 0, 0, 0], 1302540, "judgement-heal"],
    [228175, 449980, 42, 2, [0, 0], [0, 0, 0, 0], 449982, "holy-alacrity"],
    [249397, 1302545, 168, 1, [32, 0], [0, 0, 0, 0], 0, "undead-damage"],
    [249442, 1249005, 108, -5, [14, 0], [167772672, 536873984, 0, 0], 0, "seals"],
    [272434, 1291083, 107, -10000, [11, 0], [0, 0, 0, 134217728], 0, "swift-judgement"],
    [272435, 1291086, 108, 4, [0, 0], [1024, 8, 64, 0], 0, "judgement-damage"],
    [272436, 1291089, 108, -5, [14, 0], [-2147483648, 0, 0, 0], 0, "economy"],
    [279247, 1306433, 4, 15, [0, 0], [0, 0, 0, 0], 0, "holy-shield"],
    [279248, 1306429, 107, 6, [7, 0], [2097152, 65536, 0, 0], 0, "infusion-existing"],
  ];
  assert.deepEqual(
    evidence.libramIds,
    expected.map((row) => row[0]),
  );
  const { tables } = evidence;
  assert.equal(tables.ItemXItemEffect.length, expected.length);
  assert.equal(tables.ItemEffect.length, expected.length);
  const items = expected.map(([id, spellId, aura, amount, misc, mask, trigger, scope]) => {
    const link = one(tables.ItemXItemEffect, (row) => row.ItemID === id, "libram link");
    const itemEffect = one(
      tables.ItemEffect,
      (row) => row.id === link.ItemEffectID,
      "libram effect",
    );
    assert.deepEqual(
      [
        itemEffect.SpellID,
        itemEffect.TriggerType,
        itemEffect.Charges,
        itemEffect.ChrSpecializationID,
        itemEffect.PlayerConditionID,
      ],
      [spellId, 1, 0, 0, 0],
    );
    const effect = one(tables.SpellEffect, (row) => row.SpellID === spellId, "libram spell effect");
    assert.deepEqual(
      [
        effect.Effect,
        effect.EffectAura,
        effect.EffectBasePointsF,
        effect.EffectMiscValue,
        effect.EffectSpellClassMask,
        effect.EffectTriggerSpell,
      ],
      [6, aura, amount, misc, mask, trigger],
    );
    assert.deepEqual(effect.ImplicitTarget, [1, 0]);
    for (const key of [
      "DifficultyID",
      "ScalingClass",
      "Variance",
      "Coefficient",
      "EffectRealPointsPerLevel",
      "EffectAuraPeriod",
    ])
      assert.equal(effect[key], 0);
    if ([228175, 272436, 279248].includes(id))
      assert.equal(
        one(tables.SpellClassOptions, (row) => row.SpellID === spellId, "libram family")
          .SpellClassSet,
        10,
      );
    return { id, spellId, scope, activeInHealingController: [228175, 272436, 279248].includes(id) };
  });
  const reduction = one(tables.SpellEffect, (row) => row.SpellID === 449982, "Alacrity payload");
  assert.deepEqual(
    [
      reduction.Effect,
      reduction.EffectAura,
      reduction.EffectBasePointsF,
      reduction.EffectMiscValue,
      reduction.EffectSpellClassMask,
      reduction.EffectTriggerSpell,
    ],
    [6, 107, -200, [10, 0], [-2147483648, 0, 0, 0], 0],
  );
  const alacrity = one(tables.Spell, (row) => row.id === 449980, "Alacrity tooltip");
  assert(
    alacrity.Description_lang.startsWith(
      "Causes Holy Shock to reduce the cast time of your next Holy Light",
    ),
  );
  for (const [id, charges] of [
    [449980, 0],
    [449982, 1],
  ]) {
    const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === id, "Alacrity proc options");
    assert.deepEqual(
      [
        proc.ProcChance,
        proc.ProcCharges,
        proc.CumulativeAura,
        proc.ProcCategoryRecovery,
        proc.SpellProcsPerMinuteID,
        proc.ProcTypeMask,
      ],
      [100, charges, 0, 0, 0, [0, 4]],
    );
  }
  const misc = one(tables.SpellMisc, (row) => row.SpellID === 449982, "Alacrity duration link");
  const duration = one(
    tables.SpellDuration,
    (row) => row.id === misc.DurationIndex,
    "Alacrity duration",
  );
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [10000, 10000, 0],
  );
  assert.equal(evidence.ranks.length, 23);
  assert.equal(new Set(evidence.ranks.map((row) => row.spellId)).size, 23);
  const lightIds = evidence.ranks
    .filter((row) => {
      assert.equal(row.classSet, 10);
      assert.equal(row.mask.length, 4);
      assert(
        row.mask.every(
          (value) => Number.isInteger(value) && value >= -2147483648 && value <= 4294967295,
        ),
      );
      return row.mask.some((value, index) => (value & reduction.EffectSpellClassMask[index]) !== 0);
    })
    .map((row) => row.spellId)
    .sort((a, b) => a - b);
  assert.deepEqual(lightIds, [635, 639, 647, 1026, 1042, 3472, 10328, 10329, 25292]);
  return {
    schema: "kfc-paladin-healing-librams-rules.v1",
    items,
    holyLightIds: lightIds,
    economy: { itemId: 272436, manaReductionPercent: 5, refundBasis: "original-spell-base-cost" },
    alacrity: {
      itemId: 228175,
      triggerId: 449982,
      reductionMs: 200,
      durationMs: 10000,
      charges: 1,
      refreshesWithoutStacking: true,
    },
    infusion: {
      itemId: 279248,
      holyShockCritPercent: 6,
      registration: "existing-generic-paladin-item-effect",
    },
    assumptions: [
      "client-captured Alacrity triggers on completed friendly Holy Shock, regardless of crit",
      "flat cast-time modifiers add to Infusion; both consume on the same completed Holy Light",
      "healing-only controller does not cast Cleanse, Purify, seals, Judgement, Swift Judgement or Holy Shield",
    ],
    serverMechanicsVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {{implementation:string,rules:object}} input @returns {string} */
export function renderPaladinHealingLibrams({ implementation, rules }) {
  assert.equal(rules.schema, "kfc-paladin-healing-librams-rules.v1");
  assert.equal(implementation.split("// KFC_PALADIN_LIBRAM_VALUES").length, 2);
  return implementation.replace(
    "// KFC_PALADIN_LIBRAM_VALUES",
    [
      `var kfcPaladinLibramLightIDs = map[int32]bool{${rules.holyLightIds.map((id) => `${id}:true`).join(",")}}`,
      `const kfcPaladinEconomyID = ${rules.economy.itemId}`,
      `const kfcPaladinEconomyReduction = ${rules.economy.manaReductionPercent}`,
      `const kfcPaladinAlacrityID = ${rules.alacrity.itemId}`,
      `const kfcPaladinAlacrityAuraID = ${rules.alacrity.triggerId}`,
      `const kfcPaladinAlacrityReductionMs = ${rules.alacrity.reductionMs}`,
      `const kfcPaladinAlacrityDurationMs = ${rules.alacrity.durationMs}`,
    ].join("\n"),
  );
}
