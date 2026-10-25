import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";
import { reviewMageSorcererSource } from "./mage-sorcerer-source.mjs";

/** Normalize all eight base pieces without importing alternate bonuses or granting catalog admission.
 * @param {object} evidence @returns {object}
 */
export function prepareMageSorcererDrafts(evidence) {
  const review = reviewMageSorcererSource(evidence),
    coefficients = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  assert.equal(evidence.historical.length, 8);
  assert.equal(new Set(evidence.historical.map((row) => row.id)).size, 8);
  const drafts = evidence.normalized.items.map((item) => {
    const sparse = evidence.tables.ItemSparse.find((row) => row.id === item.itemId),
      historical = evidence.historical.find((row) => row.id === item.itemId);
    assert(historical, "Missing historical icon identity " + item.itemId);
    const statDraft = normalizeCurrentPrebisItem(item, sparse, historical, coefficients, sets);
    return {
      itemId: item.itemId,
      statDraft,
      rawWearClassMask: sparse.AllowableClass,
      acquisitionClassAllowlist: [review.obtainableClass],
      rewardRelations: globalThis.structuredClone(
        evidence.acquisition.relations.filter((row) => row.rewardItemIds.includes(item.itemId)),
      ),
      status: "stats-prepared-runtime-and-reward-delivery-not-admitted",
      catalogAdmissionAllowed: false,
    };
  });
  return {
    schema: "kfc-mage-sorcerer-drafts.v1",
    review,
    drafts,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
