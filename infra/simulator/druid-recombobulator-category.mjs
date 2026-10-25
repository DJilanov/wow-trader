import assert from "node:assert/strict";
import { extractDruidUtilityItemRules } from "./druid-utility-items.mjs";

/** Bind the reviewed item category to the actor's existing conjured timer.
 * @param {object} source @param {string} implementation @returns {{implementation:string,rules:object}}
 */
export function renderDruidRecombobulatorCategory(source, implementation) {
  const { recombobulator } = extractDruidUtilityItemRules(source);
  assert.deepEqual(
    [
      recombobulator.itemId,
      recombobulator.sharedCategory,
      recombobulator.sharedCooldownMs,
      recombobulator.cooldownMs,
    ],
    [18637, 1153, 120000, 300000],
  );
  const before = "SharedCD: core.Cooldown{Timer: resto.NewTimer(), Duration: 2 * time.Minute}";
  assert.equal(
    implementation.split(before).length,
    2,
    "Missing or ambiguous private category timer",
  );
  return {
    implementation: implementation.replace(
      before,
      "SharedCD: core.Cooldown{Timer: resto.GetConjuredCD(), Duration: 2 * time.Minute}",
    ),
    rules: {
      schema: "kfc-druid-recombobulator-category.v1",
      itemId: 18637,
      category: 1153,
      sharedCooldownMs: 120000,
      personalCooldownMs: 300000,
      timerScope: "same-actor-conjured-uses",
      existingItemAmountsAndPoliciesUnchanged: true,
      serverMechanicsVerified: false,
      publicationAllowed: false,
    },
  };
}
