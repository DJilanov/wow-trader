import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";
import { reviewShamanFiveThundersSource } from "./shaman-five-thunders-source.mjs";

/** Prepare current stat rows while leaving reward delivery and complete runtime admission explicit.
 * @param {object} evidence @returns {object}
 */
export function prepareShamanFiveThundersDrafts(evidence) {
  const review = reviewShamanFiveThundersSource(evidence),
    coefficients = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  assert.equal(evidence.historical.length, 8);
  assert.equal(new Set(evidence.historical.map((row) => row.id)).size, 8);
  const drafts = evidence.normalized.items.map((item) => {
    const sparse = evidence.tables.ItemSparse.find((row) => row.id === item.itemId),
      historical = evidence.historical.find((row) => row.id === item.itemId);
    assert(historical, "Missing historical icon identity " + item.itemId);
    return {
      itemId: item.itemId,
      statDraft: normalizeCurrentPrebisItem(item, sparse, historical, coefficients, sets),
      rawWearClassMask: sparse.AllowableClass,
      referenceAcquisitionClassMask: review.referenceAcquisitionClassMask,
      referenceAcquisitionFaction: review.referenceAcquisitionFaction,
      rewardRelations: structuredClone(
        evidence.acquisition.relations.filter((row) => row.rewardItemIds.includes(item.itemId)),
      ),
      status: "stats-prepared-runtime-and-reward-delivery-not-admitted",
      catalogAdmissionAllowed: false,
    };
  });
  return {
    schema: "kfc-shaman-five-thunders-drafts.v1",
    review,
    drafts,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
