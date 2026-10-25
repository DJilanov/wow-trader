import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";
import { reviewHunterBeastmasterSource } from "./hunter-beastmaster-source.mjs";

/** Normalize item stats while preserving unresolved equip effects outside the catalog.
 * @param {object} evidence @returns {object}
 */
export function prepareHunterBeastmasterDrafts(evidence) {
  const review = reviewHunterBeastmasterSource(evidence),
    coefficients = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  const drafts = evidence.normalized.items.map((item) => {
    const sparse = evidence.tables.ItemSparse.find((row) => row.id === item.itemId),
      historical = evidence.historical.find((row) => row.id === item.itemId),
      effects = review.petEffects.filter((row) => row.itemId === item.itemId),
      statDraft = normalizeCurrentPrebisItem(
        { ...item, effectIds: [] },
        sparse,
        historical,
        coefficients,
        sets,
      );
    return {
      itemId: item.itemId,
      statDraft,
      individualEffects: effects,
      rewardRelations: globalThis.structuredClone(
        evidence.acquisition.relations.filter((row) => row.rewardIds?.includes(item.itemId)),
      ),
      rawWearClassMask: sparse.AllowableClass,
      status: "stats-prepared-runtime-and-acquisition-not-admitted",
      catalogAdmissionAllowed: false,
    };
  });
  return {
    schema: "kfc-hunter-beastmaster-drafts.v1",
    review,
    drafts,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
