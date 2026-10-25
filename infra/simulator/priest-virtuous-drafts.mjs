import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";
import { reviewPriestVirtuousSource } from "./priest-virtuous-source.mjs";

/** Prepare exact current stats and separately disclosed class-quest access.
 * @param {object} evidence
 * @returns {object}
 */
export function preparePriestVirtuousDrafts(evidence) {
  const review = reviewPriestVirtuousSource(evidence),
    ratings = currentLevel60Ratings(evidence.ratings),
    sets = new Map(evidence.normalized.sets.map((set) => [set.id, set]));
  const drafts = review.itemIds.map((id) => {
    const current = evidence.normalized.items.find((item) => item.itemId === id),
      sparse = evidence.tables.ItemSparse.find((item) => item.id === id),
      historical = evidence.historical.filter((item) => item.id === id);
    assert.equal(historical.length, 1, "Historical icon identity " + id);
    const statDraft = normalizeCurrentPrebisItem(current, sparse, historical[0], ratings, sets);
    return {
      itemId: id,
      statDraft,
      rawWearClassMask: sparse.AllowableClass,
      acquisitionClassAllowlist: [review.obtainableClass],
      rewardRelations: review.acquisitionRelations.filter((row) => row.rewardItemIds.includes(id)),
      status: "stats-prepared-runtime-family-and-reward-delivery-not-admitted",
      catalogAdmissionAllowed: false,
    };
  });
  return {
    schema: "kfc-priest-virtuous-drafts.v1",
    review,
    drafts,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Stage the complete base-set catalog without replacing existing definitions.
 * Class-quest access is a separately disclosed reference policy.
 * @param {object} parent
 * @param {object} evidence
 * @returns {object}
 */
export function preparePriestVirtuousCatalog(parent, evidence) {
  const prepared = preparePriestVirtuousDrafts(evidence),
    catalog = globalThis.structuredClone(parent),
    existing = new Set(parent.items.map((item) => item.id));
  assert.equal(existing.size, parent.items.length, "Duplicate parent item identity");
  const additions = prepared.drafts.map((draft) => {
    assert(!existing.has(draft.itemId), "Refusing to replace Virtuous item " + draft.itemId);
    return {
      ...globalThis.structuredClone(draft.statDraft),
      classAllowlist: [...draft.acquisitionClassAllowlist],
    };
  });
  catalog.items.push(...additions);
  return {
    ...prepared,
    catalog,
    additions,
    classRestrictionScope:
      "baked-class-quest-reference-not-physical-wear-or-live-server-verification",
    requiresAllSetEffectsAdmission: true,
    requiresShieldFamilyInteractionAdmission: true,
    requiresRewardDeliveryReview: true,
    modelAdmissionAllowed: false,
  };
}
