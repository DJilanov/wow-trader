import assert from "node:assert/strict";
import { prepareWarlockDeathmistDrafts } from "./warlock-deathmist-drafts.mjs";

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, "Missing or ambiguous Deathmist integration point");
  return source.replace(before, after);
}

/** Prepare an explicit raid-boss reference without claiming unobserved fear or reward behavior.
 * @param {object} evidence
 * @param {string} targetPolicy
 * @returns {object}
 */
export function warlockDeathmistModelReference(evidence, targetPolicy) {
  assert.equal(targetPolicy, "raid-boss-fear-immune-reference", "Explicit target policy required");
  const prepared = prepareWarlockDeathmistDrafts(evidence);
  return {
    schema: "kfc-warlock-deathmist-model-reference.v1",
    baseSetId: prepared.review.setId,
    excludedVariantSetId: prepared.review.excludedVariantSetId,
    itemIds: [...prepared.review.itemIds],
    thresholdSpells: structuredClone(prepared.review.thresholdSpells),
    incoming: "landed-direct-enemy-native-proc-mask-reference",
    targetPolicy,
    targetScope: "enemy-at-player-level-plus-three",
    procTarget: "eligible-incoming-attacker-reference",
    fear: structuredClone(prepared.review.fear),
    fearableTargetsSupported: false,
    immuneOutcome: "cast-recorded-without-damage-hit-miss-or-target-aura",
    acquisition: "warlock-all-four-baked-quest-phases-reference",
    acquisitionQuestIds: [
      ...new Set(
        prepared.drafts.flatMap((row) => row.rewardRelations.map((quest) => quest.questId)),
      ),
    ].sort((a, b) => a - b),
    serverMechanicsVerified: false,
    serverAcquisitionVerified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Derive exact base-ID dispatch and constants, leaving every successful parent untouched.
 * @param {{itemSets:string,implementation:string,evidence:object,targetPolicy:string}} options
 * @returns {{itemSets:string,implementation:string,reference:object,items:object[]}}
 */
export function renderWarlockDeathmistModel({ itemSets, implementation, evidence, targetPolicy }) {
  const reference = warlockDeathmistModelReference(evidence, targetPolicy);
  const prepared = prepareWarlockDeathmistDrafts(evidence);
  const append =
    "activeBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)";
  let derived = replaceOnce(
    itemSets,
    append,
    append +
      "\n\t\tactiveBonuses = append(activeBonuses, character.kfcForeverDeathmistBonuses()...)",
  );
  derived = replaceOnce(
    derived,
    "if forever && overridesForeverEquipmentSet(item.SetID) {",
    "if forever && (overridesForeverEquipmentSet(item.SetID) || item.SetID == kfcDeathmistSetID) {",
  );
  const fear = reference.fear;
  const constants = `const (
    kfcDeathmistSetID = ${reference.baseSetId}
    kfcDeathmistProcID = ${fear.parentSpellId}
    kfcDeathmistFearID = ${fear.childSpellId}
    kfcDeathmistProcChance = ${fear.procChancePercent / 100}
    kfcDeathmistICDMs = ${fear.internalCooldownMs}
  )`;
  return {
    itemSets: derived,
    implementation: replaceOnce(implementation, "// KFC_DEATHMIST_CLIENT_CONSTANTS", constants),
    reference,
    items: prepared.drafts.map((row) => ({
      ...structuredClone(row.statDraft),
      classAllowlist: [...row.acquisitionClassAllowlist],
    })),
  };
}
