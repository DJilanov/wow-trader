import assert from "node:assert/strict";
import { extractPriestHealingTalents } from "./priest-healing-talents-model.mjs";
import { reviewPriestVirtuousSource } from "./priest-virtuous-source.mjs";

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or ambiguous Virtuous integration point");
  return source.replace(before, after);
}

/** Bind a derived reference to the captured shield and the actual Priest modifier curves. */
export function priestVirtuousModelReference(evidence, healingEvidence) {
  const source = reviewPriestVirtuousSource(evidence);
  assert.deepEqual(
    healingEvidence.source.build,
    evidence.source.build,
    "Virtuous and talent builds differ",
  );
  assert.equal(
    healingEvidence.source.hotfixSha256,
    evidence.source.hotfixSha256,
    "Virtuous and talent hotfixes differ",
  );
  const healing = extractPriestHealingTalents(healingEvidence);
  const shield = evidence.tables.SpellClassOptions.find(
    (row) => row.SpellID === source.shield.spellId,
  );
  assert(shield && shield.SpellClassSet === 6);
  const mask = shield.SpellClassMask;
  const modifiers = Object.entries(healing.talents).flatMap(([talent, data]) =>
    data.effects
      .filter((effect) => effect.mask.some((word, index) => (word & mask[index]) !== 0))
      .map((effect) => ({
        talent,
        index: effect.index,
        aura: effect.aura,
        operation: effect.operation,
        values: effect.values,
      })),
  );
  assert.deepEqual(
    modifiers.map((row) => [row.talent, row.operation]),
    [
      ["ImprovedPowerWordShield", 3],
      ["SoulWarding", 11],
      ["SoulWarding", 14],
      ["MentalAgility", 14],
    ],
  );
  assert.deepEqual(modifiers[0].values, [0, 7, 14, 20]);
  assert.deepEqual(source.shield.procTypeMask, [139944, 0]);
  return {
    schema: "kfc-priest-virtuous-model-reference.v1",
    setId: source.baseSetId,
    shieldSpellId: source.shield.spellId,
    shieldClassSet: shield.SpellClassSet,
    shieldClassMask: [...mask],
    modifiers,
    incoming: "landed-direct-enemy-native-proc-mask-reference",
    overlappingShields: "separate-shields-native-application-order-reference",
    acquisition: "priest-all-four-baked-quest-phases-reference",
    acquisitionQuestIds: source.acquisitionRelations
      .map((row) => row.questId)
      .sort((a, b) => a - b),
    serverMechanicsVerified: false,
    serverAcquisitionVerified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Wire exact base-ID dispatch without changing successful parent sources in place. */
export function renderPriestVirtuousModel({
  itemSets,
  familyImplementation,
  evidence,
  healingEvidence,
}) {
  const reference = priestVirtuousModelReference(evidence, healingEvidence);
  const append =
    "activeBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)";
  let derived = replaceOnce(
    itemSets,
    append,
    append +
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverVirtuousBonuses()...)",
  );
  derived = replaceOnce(
    derived,
    "if forever && overridesForeverEquipmentSet(item.SetID) {",
    "if forever && (overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcVirtuousSetID) {",
  );
  const family = replaceOnce(
    familyImplementation,
    "// KFC_VIRTUOUS_FAMILY_METADATA",
    `if _, exists := kfcClientHealingSpells[${reference.shieldSpellId}]; exists { panic("Virtuous family metadata already registered") }
kfcClientHealingSpells[${reference.shieldSpellId}] = kfcHealingSpellMetadata{Family:"virtuous-shield",Mask:[4]uint32{${reference.shieldClassMask.join(",")}}}`,
  );
  return { itemSets: derived, familyImplementation: family, reference };
}
