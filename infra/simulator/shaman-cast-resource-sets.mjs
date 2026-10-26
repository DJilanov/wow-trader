import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Bind four current five-piece cast procs without inferring server scripting.
 * @param {object} evidence @param {object} extension @returns {object}
 */
export function extractShamanCastResourceSets(evidence, extension) {
  reviewShamanSharedEquipmentSource(evidence);
  assert.equal(extension.schema, "kfc-shaman-shared-equipment-text-extension.v1");
  assert.equal(extension.parentCapturedRowsPreserved, true);
  const definitions = [
    [181, 450527, 450554, 200, 42, 5, 81920],
    [182, 450576, 450554, 200, 42, 5, 81920],
    [183, 450585, 450583, 300, 42, 5, 81920],
    [185, 450608, 0, 5, 4, 100, 81964],
  ];
  for (const [setId, spellId, child, amount, aura, chance, mask] of definitions) {
    one(
      evidence.tables.ItemSetSpell,
      (row) => row.ItemSetID === setId && row.Threshold === 5 && row.SpellID === spellId,
      "Five-piece cast proc",
    );
    const rows = extension.tables.SpellEffect.filter((row) => row.SpellID === spellId);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectIndex,
        row.EffectBasePointsF,
        row.EffectTriggerSpell,
        row.EffectBonusCoefficient,
      ],
      [6, aura, 0, amount, child, 1],
    );
    const conditions = one(
      extension.tables.SpellAuraOptions,
      (row) => row.SpellID === spellId,
      "Cast proc conditions",
    );
    assert.deepEqual(
      [
        conditions.ProcChance,
        conditions.ProcCategoryRecovery,
        conditions.ProcCharges,
        conditions.CumulativeAura,
        conditions.SpellProcsPerMinuteID,
        conditions.ProcTypeMask,
      ],
      [chance, 0, 0, 0, 0, [mask, 0]],
    );
    assert.deepEqual(
      extension.tables.SpellClassOptions.filter((row) => row.SpellID === spellId),
      [],
    );
  }
  for (const [id, effect, amount, coefficient, variance] of [
    [450554, 30, 200, 0, 0],
    [27782, 30, 200, 1, 0],
    [450583, 10, 300, 0, 0.2],
  ]) {
    const row = one(extension.tables.SpellEffect, (row) => row.SpellID === id, "Cast proc reward");
    assert.deepEqual(
      [
        row.Effect,
        row.EffectAura,
        row.EffectIndex,
        row.EffectBasePointsF,
        row.EffectBonusCoefficient,
        row.Variance,
        row.EffectTriggerSpell,
      ],
      [effect, 0, 0, amount, coefficient, variance, 0],
    );
  }
  for (const id of [450527, 450576, 450585, 450608, 450554, 27782, 450583]) {
    for (const row of extension.tables.SpellEffect.filter((row) => row.SpellID === id)) {
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
        "BonusCoefficientFromAP",
        "Coefficient",
        "ResourceCoefficient",
        "ScalingClass",
        "Node__Field_12_0_0_63534_001",
      ])
        assert.equal(row[key], 0, "Unreviewed cast-resource payload " + key);
      for (const key of ["EffectChainAmplitude", "PvpMultiplier", "GroupSizeBasePointsCoefficient"])
        assert.equal(row[key], 1);
      assert.deepEqual(row.ImplicitTarget, [1, 0]);
      assert.deepEqual(row.EffectMiscValue, [0, 0]);
      assert.deepEqual(row.EffectRadiusIndex, [0, 0]);
      assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    }
    const misc = one(
      extension.tables.SpellMisc,
      (row) => row.SpellID === id,
      "Cast reward metadata",
    );
    assert.equal(misc.DurationIndex, 0);
    assert.equal(misc.PvPDurationIndex, 0);
    assert.equal(
      misc.SchoolMask,
      id === 450583 || id === 450608 ? 2 : [450554, 27782].includes(id) ? 64 : 1,
    );
  }
  return {
    schema: "kfc-shaman-cast-resource-set-source.v1",
    sourceBuild: 70532,
    sets: definitions.map(([setId, procId]) => ({
      setId,
      procId,
      pieces: 5,
      name: evidence.tables.ItemSet.find((row) => row.id === setId).Name_lang,
      itemIds: evidence.items
        .filter((row) => row.setId === setId)
        .map((row) => row.id)
        .sort((a, b) => a - b),
    })),
    mana: 200,
    manaAmountReference: "captured-flat-resource-reference",
    dreadmist: {
      spellId: 450583,
      low: 270,
      high: 330,
      criticalReferences: ["noncritical-reference", "critical-reference"],
    },
    fixedProcChance: 0.05,
    wildheartChanceReferences: ["two-percent-reference", "five-percent-reference"],
    rawRootConditions: structuredClone(
      extension.tables.SpellAuraOptions.filter((row) =>
        definitions.some((def) => def[1] === row.SpellID),
      ),
    ),
    nonzeroCoefficientMetadataPreserved: true,
    serverScriptVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Cast-resource integration anchor: " + before);
  return source.replace(before, after);
}

/** Add owned handlers while preserving inherited handlers for other actors.
 * @param {{implementation:string,actor:string,commonSets:string,evidence:object,extension:object}} input
 * @returns {{implementation:string,actor:string,commonSets:string,rules:object}}
 */
export function renderShamanCastResourceSets(input) {
  assert(!input.actor.includes("kfcCastResourceSets"));
  assert(!input.commonSets.includes("KFCControlsShamanCastResourceSets"));
  const rules = extractShamanCastResourceSets(input.evidence, input.extension),
    values = `const kfcShamanCastSetMana = ${rules.mana}
const kfcShamanCastSetHealLow = ${rules.dreadmist.low}
const kfcShamanCastSetHealHigh = ${rules.dreadmist.high}
const kfcShamanCastSetChance = ${rules.fixedProcChance}
var kfcShamanCastSetRoots = map[int32]int32{${rules.sets.map((row) => row.setId + ":" + row.procId).join(",")}}
var kfcShamanCastSetOwnedIDs = map[int32]bool{${input.evidence.ownedActions.map((row) => row.id + ":true").join(",")}}
`;
  const implementation = once(
    input.implementation,
    "// KFC_SHAMAN_CAST_RESOURCE_SET_VALUES",
    values,
  );
  let actor = once(
    input.actor,
    "type RestorationShaman struct {",
    "type RestorationShaman struct {\n\tkfcCastResourceSets *kfcShamanCastResourceSets",
  );
  actor = once(
    actor,
    "\tresto.prepareKFCShamanHealingRelics()",
    "\tresto.registerKFCShamanCastResourceSets()\n\tresto.prepareKFCShamanHealingRelics()",
  );
  const commonSets = once(
    input.commonSets,
    "func suddenInsight(agent core.Agent, actionID core.ActionID) {",
    "func suddenInsight(agent core.Agent, actionID core.ActionID) {\n\tif provider,owned:=agent.(interface{KFCControlsShamanCastResourceSets() bool});owned && provider.KFCControlsShamanCastResourceSets(){return}",
  );
  return { implementation, actor, commonSets, rules };
}
