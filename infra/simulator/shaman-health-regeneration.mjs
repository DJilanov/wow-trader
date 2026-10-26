import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

function once(source, before, after) {
  assert.equal(source.split(before).length, 2, `Missing or duplicate integration: ${before}`);
  return source.replace(before, after);
}

/** Preserve the exact Shadowcraft six-piece source without inventing a tick period.
 * @param {object} evidence @returns {object}
 */
export function extractShamanHealthRegeneration(evidence) {
  reviewShamanSharedEquipmentSource(evidence);
  const set = evidence.tables.ItemSet.filter((row) => row.id === 184);
  assert.equal(set.length, 1);
  assert.equal(set[0].Name_lang, "Shadowcraft Armor");
  assert.deepEqual(
    set[0].ItemID.filter(Boolean).sort((a, b) => a - b),
    [16707, 16708, 16709, 16710, 16711, 16712, 16713, 16721],
  );
  assert.deepEqual([set[0].RequiredSkill, set[0].RequiredSkillRank, set[0].SetFlags], [0, 0, 0]);
  const threshold = evidence.tables.ItemSetSpell.filter(
    (row) => row.ItemSetID === 184 && row.Threshold === 6,
  );
  assert.equal(threshold.length, 1);
  assert.deepEqual(
    [threshold[0].SpellID, threshold[0].ChrSpecID, threshold[0].TraitSubTreeID],
    [21347, 0, 0],
  );
  const effects = evidence.tables.SpellEffect.filter((row) => row.SpellID === 21347);
  assert.equal(effects.length, 1);
  const effect = effects[0];
  for (const key of [
    "DifficultyID",
    "EffectIndex",
    "EffectAmplitude",
    "EffectAttributes",
    "EffectAuraPeriod",
    "EffectBonusCoefficient",
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
    assert.equal(effect[key], 0, "New regeneration payload: " + key);
  for (const key of ["EffectChainAmplitude", "PvpMultiplier", "GroupSizeBasePointsCoefficient"])
    assert.equal(effect[key], 1);
  assert.deepEqual(
    [
      effect.Effect,
      effect.EffectAura,
      effect.EffectBasePointsF,
      effect.EffectMiscValue,
      effect.EffectSpellClassMask,
      effect.ImplicitTarget,
      effect.EffectRadiusIndex,
    ],
    [6, 161, 15, [0, 0], [0, 0, 0, 0], [1, 0], [0, 0]],
  );
  return {
    schema: "kfc-shaman-health-regeneration-source.v1",
    setId: 184,
    pieces: 6,
    spellId: 21347,
    healthPerFive: 15,
    rawEffectPeriodMs: 0,
    amountScalesWithHealingPower: false,
    tickReferences: ["two-second-ticks-reference", "five-second-ticks-reference"],
    firstTick: "after-period-reference",
    resourceOnly: true,
    sourceTickTimingVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** Compose owned health regeneration with the existing Elements bonus provider.
 * @param {object} input @returns {object}
 */
export function renderShamanHealthRegeneration(input) {
  const rules = extractShamanHealthRegeneration(input.evidence);
  const values = `const kfcShamanHealthRegenerationSetID int32 = ${rules.setId}
const kfcShamanHealthRegenerationThreshold = ${rules.pieces}
const kfcShamanHealthRegenerationSpellID int32 = ${rules.spellId}
const kfcShamanHealthRegenerationPerFive = ${rules.healthPerFive}
var kfcShamanHealthRegenerationOwnedIDs = map[int32]bool{${input.evidence.ownedActions.map((row) => row.id + ":true").join(",")}}
`;
  return {
    rules,
    implementation: once(input.implementation, "// KFC_SHAMAN_HEALTH_REGENERATION_VALUES", values),
    actor: once(
      input.actor,
      "type RestorationShaman struct {",
      "type RestorationShaman struct {\n\tkfcHealthRegeneration *kfcShamanHealthRegeneration",
    ),
    elements: once(
      input.elements,
      "func (resto *RestorationShaman) KFCShamanAdditionalHealingSetBonuses() []core.ActiveSetBonus {",
      "func (resto *RestorationShaman) kfcShamanElementsSetBonuses() []core.ActiveSetBonus {",
    ),
  };
}
