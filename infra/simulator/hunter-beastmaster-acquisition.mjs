import assert from "node:assert/strict";
import { URL } from "node:url";
import {
  hunterBeastmasterItemIds,
  reviewHunterBeastmasterSource,
} from "./hunter-beastmaster-source.mjs";
import { reviewDungeonUpgradeRewardAssociations } from "./dungeon-upgrade-rewards.mjs";

const pendingIds = Object.freeze([8906, 8914, 8931, 8938]);

/** Corroborate all base-set reward links while preserving the strength and limits of each source.
 * @param {{source: object, rewardSource: object, indexed: object}} evidence @returns {object}
 */
export function reviewHunterBeastmasterAcquisition({ source, rewardSource, indexed }) {
  const mechanics = reviewHunterBeastmasterSource(source),
    rewards = reviewDungeonUpgradeRewardAssociations(rewardSource),
    relations = rewards.relations.filter((row) => row.setId === 515);
  assert.deepEqual(mechanics.acquisition.pendingQuestIds, [...pendingIds]);
  assert.equal(source.normalized.clientVersion, rewardSource.snapshot.clientVersion);
  assert(/^[a-f0-9]{64}$/.test(source.normalized.hotfixSha256));
  assert.equal(source.normalized.hotfixSha256, rewardSource.snapshot.hotfixSha256);
  assert.equal(relations.length, 8);
  assert.equal(indexed.schema, "kfc-hunter-beastmaster-indexed-reward-review.v1");
  assert.equal(indexed.sourceKind, "indexed-primary-page-extract");
  assert.equal(indexed.sourceFlavor, "Forever");
  assert.equal(indexed.directDocumentFetchVerified, false);
  assert.equal(indexed.catalogAdmissionAllowed, false);
  assert.equal(indexed.numericalAdmissionAllowed, false);
  assert.equal(indexed.publicationAllowed, false);
  assert.deepEqual(
    indexed.quests.map((row) => row.questId).sort((a, b) => a - b),
    [...pendingIds],
  );
  const reviewed = [],
    usedItems = new Set();
  for (const relation of relations) {
    const original = source.acquisition.relations.find((row) => row.questId === relation.questId),
      quest = source.classQuestEvidence.find((row) => row.questId === relation.questId),
      supplemental = indexed.quests.find((row) => row.questId === relation.questId);
    assert(original && quest);
    assert.equal(relation.className, "Hunter");
    assert.equal(relation.requiredClassMask, 4);
    assert.equal(quest.requiredClasses, 4);
    assert.equal(quest.requiredRaces, relation.faction === "Alliance" ? 77 : 178);
    assert.equal(quest.phase, relation.phase);
    assert.equal(quest.requiredLevel, 58);
    assert.equal(quest.questLevel, 60);
    assert.deepEqual(quest.requiredItemIds, relation.requiredItemIds);
    assert.equal(original.faction, relation.faction);
    let sourceKind;
    if (supplemental) {
      const url = new URL(supplemental.url);
      assert.equal(url.origin, "https://www.wowhead.com");
      assert.equal(supplemental.url, original.url);
      assert(new RegExp("^/forever/quest=" + relation.questId + "/[a-z-]+$").test(url.pathname));
      assert.equal(url.search, "");
      assert.equal(url.hash, "");
      assert.equal(supplemental.faction, relation.faction);
      assert.equal(supplemental.rewardHeading, "You will receive:");
      assert.equal(supplemental.displayedAsChoice, false);
      assert.deepEqual(
        supplemental.rewardItems.map((item) => item.itemId).sort((a, b) => a - b),
        relation.rewardItemIds,
      );
      for (const item of supplemental.rewardItems) {
        assert.deepEqual(Object.keys(item).sort(), ["itemId", "name"]);
        assert.equal(
          source.normalized.items.find((row) => row.itemId === item.itemId)?.name,
          item.name,
        );
      }
      sourceKind = "indexed-primary-page-reward-section";
    } else {
      assert.equal(original.status, "reviewed-forever-reward-rows");
      assert.equal(original.rewardDelivery, "all-listed-items");
      assert.equal(relation.simultaneousDeliveryVerified, true);
      assert.deepEqual(
        [...original.rewardIds].sort((a, b) => a - b),
        relation.rewardItemIds,
      );
      sourceKind = "preserved-primary-page-reward-record";
    }
    for (const itemId of relation.rewardItemIds) {
      assert(hunterBeastmasterItemIds.includes(itemId));
      usedItems.add(itemId);
    }
    reviewed.push({
      questId: relation.questId,
      phase: relation.phase,
      faction: relation.faction,
      requiredClassMask: 4,
      requiredRaceMask: quest.requiredRaces,
      requiredItemIds: [...quest.requiredItemIds],
      rewardItemIds: [...relation.rewardItemIds],
      url: original.url,
      sourceKind,
      allListedDeliveryCorroborated: true,
      rewardQuantitiesVerified: false,
      liveServerDeliveryVerified: false,
    });
  }
  assert.deepEqual(
    [...usedItems].sort((a, b) => a - b),
    [...hunterBeastmasterItemIds],
  );
  assert.equal(
    reviewed.filter((row) => row.sourceKind === "indexed-primary-page-reward-section").length,
    4,
  );
  const items = hunterBeastmasterItemIds.map((itemId) => {
    const linked = reviewed.filter((row) => row.rewardItemIds.includes(itemId));
    assert.deepEqual(linked.map((row) => row.faction).sort(), ["Alliance", "Horde"]);
    return { itemId, questIds: linked.map((row) => row.questId).sort((a, b) => a - b) };
  });
  return {
    schema: "kfc-hunter-beastmaster-reference-acquisition-supplement.v1",
    setId: 515,
    excludedVariant: 1669,
    clientVersion: source.normalized.clientVersion,
    items,
    relations: reviewed.sort((a, b) => a.questId - b.questId),
    referenceRewardCoverageComplete: true,
    indexedRewardSections: 4,
    preservedRewardRecords: 4,
    originalSourceModified: false,
    originalPendingQuestIds: [...pendingIds],
    rewardQuantitiesVerified: false,
    currentServerAcquisitionVerified: false,
    catalogAdmissionAllowed: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
    scope:
      "All eight base Hunter pieces and sixteen class/faction reward associations are corroborated by current same-TOC baked records, four preserved primary-page records and four indexed Forever reward sections. Source strength stays explicit. Omitted quantities and live server delivery remain unverified. This supplement does not revise the frozen source, admit catalog items, qualify runtime behavior, start a class clock or authorize publication.",
  };
}
