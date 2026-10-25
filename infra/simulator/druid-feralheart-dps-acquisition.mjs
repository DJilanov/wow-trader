import assert from "node:assert/strict";
import { extractDruidFeralheartRules } from "./druid-feralheart-model.mjs";

/** Combine the preserved source reviews with the new Forever name reference without upgrading ID evidence.
 * @param {{source:object,reference:object}} evidence @returns {object}
 */
export function reviewDruidFeralheartDpsAcquisition({ source, reference }) {
  extractDruidFeralheartRules(source);
  assert.equal(reference.schema, "kfc-druid-feralheart-dps-reference-supplement.v1");
  assert.deepEqual(reference.originalSource, {
    path: "infra/simulator/fixtures/druid-feralheart-source.v1.json.gz",
    byteSha256: "81090143f13b7cc77caecdad0c790bf4a6152fec21c187a225d0b39c727feda1",
  });
  assert.equal(reference.originalClientVersion, source.source.build.clientVersion);
  for (const flag of [
    "currentServerAcquisitionVerified",
    "rewardQuantitiesVerified",
    "runtimeQualified",
    "compiledModelAdmitted",
    "numericalReuseAllowed",
    "publicationAllowed",
  ])
    assert.equal(reference[flag], false, flag);
  assert.equal(reference.historicalSourcePreservedUnchanged, true);
  const prior = source.acquisition.relations.filter((row) => row.currentForeverRewardPageReviewed);
  assert.deepEqual(
    reference.priorForeverNameReviews,
    prior.map((row) => ({
      questId: row.questId,
      url: row.url,
      rewardItemIds: row.rewardIds,
      source: "unchanged-authenticated-original-fixture",
      independentlyReopenedThisReview: false,
    })),
  );
  assert.deepEqual(reference.newForeverNameReviews, [
    {
      questId: 8913,
      faction: "Horde",
      phase: 1,
      url: "https://www.wowhead.com/forever/quest=8913/an-earnest-proposition",
      sourceKind: "indexed-primary-forever-reward-section",
      observedRewardNames: ["Feralheart Bracers"],
      expectedItemIdsFromBakedAndHistoricalAssociation: [22108],
      directPageStatus: "unavailable-cache-miss",
      exactRewardItemLinksReviewed: false,
      observedServerDelivery: false,
    },
  ]);
  assert.deepEqual(reference.summary, {
    questNameCoverage: 8,
    priorFixtureForeverReviews: 7,
    newIndexedForeverReviews: 1,
    allQuestNamesReferenceCorroborated: true,
    exactItemIdTierUnchanged: true,
  });
  const relations = source.acquisition.relations.map((row) => ({
    ...globalThis.structuredClone(row),
    originalSourceUrl: row.url,
    originalRewardRelationBasis: row.rewardRelationBasis,
    url: row.questId === 8913 ? reference.newForeverNameReviews[0].url : row.url,
    referenceSourceKind:
      row.questId === 8913 ? "new-indexed-primary-name-section" : "preserved-primary-name-review",
    rewardNamesReferenceCorroborated: true,
    exactPageItemLinksReviewed: false,
    currentServerAcquisitionVerified: false,
  }));
  assert.equal(relations.length, 8);
  return {
    schema: "kfc-druid-feralheart-dps-acquisition.v1",
    relations,
    baseSetId: 513,
    excludedVariantSetId: 1667,
    obtainableClass: 1,
    gameClassMask: 1024,
    rewardNameCoverageComplete: true,
    exactItemIdTierUnchanged: true,
    currentServerAcquisitionVerified: false,
    rewardQuantitiesVerified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}
