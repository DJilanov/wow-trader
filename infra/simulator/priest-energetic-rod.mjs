import assert from "node:assert/strict";
import { extractDruidItemResources } from "./druid-item-resources.mjs";

/** Preserve the shared payload while admitting Priest's actual hybrid healing casts.
 * @param {{actor:string,implementation:string,evidence:object}} input
 * @returns {{actor:string,implementation:string,rules:object}}
 */
export function renderPriestEnergeticRod(input) {
  const shared = extractDruidItemResources(input.evidence);
  assert.deepEqual(
    [shared.energeticRod.itemId, shared.energeticRod.triggerMask, shared.energeticRod.mana],
    [18321, 65536, 48],
  );
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const actor = once(
    input.actor,
    "hpriest.registerKFCPriestItemResources()",
    "hpriest.registerKFCPriestItemResources()\n\thpriest.registerKFCEnergeticRod()",
  );
  const implementation = once(
    input.implementation,
    "// KFC_PRIEST_ENERGETIC_ROD_VALUES",
    [
      "const kfcEnergeticRodItemID = 18321",
      "const kfcEnergeticRodTriggerID = 1302190",
      "const kfcEnergeticRodManaSpellID = 1302191",
      "const kfcEnergeticRodMana = 48",
    ].join("\n"),
  );
  return {
    actor,
    implementation,
    rules: {
      schema: "kfc-priest-energetic-rod-rules.v1",
      itemId: 18321,
      triggerSpellId: 1302190,
      manaSpellId: 1302191,
      mana: 48,
      clientProcChance: 1,
      eligible: "registered nonpassive harmful casts completed by a living Priest in combat",
      holyNovaHarmfulParentAdmitted: true,
      helpfulHealsAndPeriodicTicksExcluded: true,
      newOffensiveWorkloadPrioritiesAdmitted: false,
      historicalBaseStatsVerified: false,
      serverMechanicsVerified: false,
      publicationAllowed: false,
    },
  };
}
