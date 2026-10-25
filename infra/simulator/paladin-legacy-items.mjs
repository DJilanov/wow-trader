import assert from "node:assert/strict";
import { extractDruidLegacyItemRules } from "./druid-legacy-items.mjs";
import { extractPaladinRegenerationItems } from "./paladin-regeneration-items.mjs";
export { assertPaladinLegacyItemPolicy } from "./paladin-legacy-policy.mjs";

/** Keep observed equip effects separate from provisional historical base stats.
 * @param {{briarwood:object,regeneration:object,compiled:object[]}} evidence
 * @returns {object}
 */
export function extractPaladinLegacyItemRules(evidence) {
  const briarwood = extractDruidLegacyItemRules(evidence.briarwood);
  extractPaladinRegenerationItems(evidence.regeneration);
  assert.equal(evidence.compiled.length, 2);
  const reed = evidence.compiled.find((item) => item.id === 12930),
    seal = evidence.compiled.find((item) => item.id === 18472);
  assert(reed && seal);
  assert.equal(reed.stats[5], 29);
  assert.equal(seal.stats[41], 22);
  return {
    schema: "kfc-paladin-legacy-item-rules.v1",
    briarwoodNeutralEquipSpellPower: briarwood.briarwoodNeutralEquipSpellPower,
    briarwoodMarshEquipSpellPower: briarwood.briarwoodMarshEquipSpellPower,
    compiledBriarwoodSpellPower: 29,
    compiledRoyalSealHealingPower: 22,
    royalSealHauntedMp5: 9,
    royalSealAreaHandlerUnchanged: true,
    currentBaseStatsVerified: false,
    zeroRoyalHealingIsSensitivityOnly: true,
    globalHandlersChanged: false,
    publicationAllowed: false,
  };
}

/** Integrate an optional class-local hypothesis without changing existing requests.
 * @param {{baseline:string,workload:string}} source @returns {{baseline:string,workload:string}}
 */
export function renderPaladinLegacyItems(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  assert(!source.baseline.includes("kfcPaladinLegacyItems"));
  const baseline = once(
    once(
      source.baseline,
      "selfSets *kfcPaladinSelfSets",
      "selfSets *kfcPaladinSelfSets; legacyItems *kfcPaladinLegacyItems",
    ),
    "holy.registerKFCPaladinSelfSets()",
    "holy.registerKFCPaladinSelfSets()\n holy.registerKFCPaladinLegacyItems()",
  );
  const field =
    '\tItemEffectsPolicy *KFCPaladinHealingItemEffectsPolicy `json:"itemEffectsPolicy,omitempty"`';
  assert.equal(source.workload.split(field).length, 3);
  let workload = source.workload.replaceAll(
    field,
    field + '\n LegacyItemsPolicy *KFCPaladinLegacyItemPolicy `json:"legacyItemsPolicy,omitempty"`',
  );
  workload = once(
    workload,
    "\tif frame.ItemEffectsPolicy != nil {",
    "\tif frame.LegacyItemsPolicy != nil { if err = healer.ConfigureKFCPaladinLegacyItems(sim, *frame.LegacyItemsPolicy); err != nil { return nil,err } }\n\tif frame.ItemEffectsPolicy != nil {",
  );
  workload = once(
    workload,
    "\tif frame.RankScaling != nil { policy := *frame.RankScaling; output.RankScaling = &policy }",
    "\toutput.LegacyItemsPolicy = healer.kfcPaladinLegacyItemPolicyEcho()\n\tif frame.RankScaling != nil { policy := *frame.RankScaling; output.RankScaling = &policy }",
  );
  return { baseline, workload };
}
