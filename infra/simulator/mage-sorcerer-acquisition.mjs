import assert from "node:assert/strict";
import { URL } from "node:url";
import { reviewMageSorcererSource } from "./mage-sorcerer-source.mjs";

/** Reconcile the reviewed quest sections with exact same-TOC item/class relations.
 * Name corroboration and exact page-item links remain distinct evidence tiers.
 * @param {{source:object,reference:object}} evidence @returns {object}
 */
export function reviewMageSorcererAcquisition({ source, reference }) {
  const rules = reviewMageSorcererSource(source);
  assert.equal(reference.schema, "kfc-mage-sorcerer-reference-supplement.v1");
  assert.equal(reference.catalogAdmissionAllowed, false);
  assert.equal(reference.runtimeQualified, false);
  assert.equal(reference.numericalQualification, false);
  assert.equal(reference.publicationAllowed, false);
  assert.equal(reference.originalCaptureUnchanged, true);
  assert.equal(reference.rows.length, 8);
  assert.equal(new Set(reference.rows.map((row) => row.questId)).size, 8);
  const relations = source.acquisition.relations.map((relation) => {
    const rows = reference.rows.filter((row) => row.questId === relation.questId);
    assert.equal(rows.length, 1, "Missing or ambiguous reviewed Mage reward section");
    const row = rows[0],
      url = new URL(row.url);
    assert.equal(url.origin, "https://www.wowhead.com");
    assert(new RegExp("^/forever/quest=" + row.questId + "/[a-z0-9-]+$").test(url.pathname));
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(row.sourceKind, "indexed-primary-forever-quest-reward-section");
    assert.equal(row.faction, relation.faction);
    assert.deepEqual(row.mappedBaseItemIds, relation.rewardItemIds);
    assert.deepEqual(
      row.rewardItemNames,
      relation.rewardItemIds.map((id) => {
        const item = source.normalized.items.find((item) => item.itemId === id);
        assert(item);
        return item.name;
      }),
    );
    assert.equal(typeof row.exactPageItemLinksReviewed, "boolean");
    assert.equal(
      row.idMappingEvidence,
      row.exactPageItemLinksReviewed
        ? "quest reward links resolved to exact base item URLs; same-TOC associations agree"
        : "reward names corroborate same-TOC item-ID associations; exact page item links unreviewed",
    );
    assert.equal(row.referenceDelivery, "all-listed-items");
    assert.equal(row.rewardQuantitiesVerified, false);
    assert.equal(row.currentServerAcquisitionVerified, false);
    return {
      ...globalThis.structuredClone(relation),
      url: row.url,
      sourceKind: row.sourceKind,
      rewardItemNames: [...row.rewardItemNames],
      exactPageItemLinksReviewed: row.exactPageItemLinksReviewed,
      idMappingEvidence: row.idMappingEvidence,
      referenceDelivery: row.referenceDelivery,
    };
  });
  const exactLinks = relations.filter((row) => row.exactPageItemLinksReviewed).length;
  assert.equal(exactLinks, 4);
  assert.deepEqual(
    relations
      .filter((row) => row.exactPageItemLinksReviewed)
      .map((row) => row.questId)
      .sort((a, b) => a - b),
    [8907, 8915, 8932, 8953],
    "Exact-link evidence must remain attached to the reviewed quest pages",
  );
  assert.equal(reference.exactPageItemLinkRelations, exactLinks);
  assert.equal(reference.referenceRewardSections, relations.length);
  assert.equal(reference.allBaseItemNamesCorroborated, true);
  assert.equal(reference.mappedBaseItems, rules.itemIds.length);
  assert.equal(
    reference.mappedFactionAssociations,
    relations.reduce((sum, row) => sum + row.rewardItemIds.length, 0),
  );
  return {
    schema: "kfc-mage-sorcerer-acquisition-review.v1",
    setId: 517,
    obtainableClass: 3,
    requiredClassMask: 128,
    relations,
    referenceRewardNameCoverageComplete: true,
    exactPageItemLinkRelations: exactLinks,
    currentServerAcquisitionVerified: false,
    catalogAdmissionAllowed: false,
    publicationAllowed: false,
  };
}
