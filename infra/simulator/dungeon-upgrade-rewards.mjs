import assert from "node:assert/strict";
import { URL } from "node:url";

const classes = Object.freeze([
  [511, "Warrior", 1, ["Alliance", "Horde"]],
  [512, "Rogue", 8, ["Alliance", "Horde"]],
  [513, "Druid", 1024, ["Alliance", "Horde"]],
  [514, "Priest", 16, ["Alliance", "Horde"]],
  [515, "Hunter", 4, ["Alliance", "Horde"]],
  [516, "Paladin", 2, ["Alliance"]],
  [517, "Mage", 128, ["Alliance", "Horde"]],
  [518, "Warlock", 256, ["Alliance", "Horde"]],
  [519, "Shaman", 64, ["Horde"]],
]);
const one = (rows, predicate, label) => {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, "Missing or ambiguous " + label);
  return found[0];
};

/** Cross-check item-side reward associations without inferring reward quantities or choice semantics.
 * @param {object} evidence @returns {object}
 */
export function reviewDungeonUpgradeRewardAssociations(evidence) {
  assert.equal(evidence.schema, "kfc-dungeon-upgrade-baked-reward-source.v1");
  assert.deepEqual(
    [evidence.source.flavor, evidence.source.mode, evidence.source.contract],
    ["Forever", "baked", "2"],
  );
  assert.equal(evidence.source.version, "1.0.4");
  assert.equal(evidence.source.revision, "365537a340473291f5af3b7a53a5eca94e2a5f1a");
  assert.equal(evidence.snapshot.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.snapshot.clientVersion, "1.60.1.70532");
  assert.equal(evidence.items.length, 72);
  assert.equal(evidence.quests.length, 64);
  assert.equal(new Set(evidence.items.map((row) => row.id)).size, 72);
  assert.equal(new Set(evidence.quests.map((row) => row.questId)).size, 64);
  const relations = [],
    items = [],
    used = new Set();
  for (const [setId, className, classMask, factions] of classes) {
    const set = one(evidence.snapshot.sets, (row) => row.id === setId, "base set " + setId),
      ids = set.ItemID.filter(Boolean).sort((a, b) => a - b);
    assert.equal(ids.length, 8);
    assert.equal(new Set(ids).size, 8);
    const quests = evidence.quests.filter((row) => row.className === className);
    assert.equal(quests.length, factions.length * 4);
    for (const quest of quests) {
      assert.equal(quest.requiredClasses, classMask);
      assert([1, 2, 3, 4].includes(quest.phase));
      const faction =
        quest.requiredRaces === 77 ? "Alliance" : quest.requiredRaces === 178 ? "Horde" : null;
      assert(factions.includes(faction), "Unreviewed class/faction reward association");
      assert.equal(
        quests.filter(
          (row) => row.phase === quest.phase && row.requiredRaces === quest.requiredRaces,
        ).length,
        1,
      );
      relations.push({
        questId: quest.questId,
        setId,
        className,
        requiredClassMask: classMask,
        phase: quest.phase,
        faction,
        requiredItemIds: [...quest.requiredItemIds],
        rewardItemIds: [],
        rewardQuantitiesVerified: false,
        simultaneousDeliveryVerified: false,
      });
    }
    for (const id of ids) {
      assert(!used.has(id), "An item belongs to multiple base sets");
      used.add(id);
      const current = one(evidence.snapshot.items, (row) => row.itemId === id, "client item " + id),
        item = one(evidence.items, (row) => row.id === id, "baked reward item " + id);
      assert.equal(current.setId, setId);
      assert.deepEqual(current.issues, []);
      assert.equal(item.name, current.name);
      assert.equal(item.questRewards.length, factions.length);
      assert.equal(new Set(item.questRewards).size, item.questRewards.length);
      const matchedFactions = [];
      for (const questId of item.questRewards) {
        assert(Number.isSafeInteger(questId) && questId > 0);
        const relation = one(
          relations,
          (row) => row.questId === questId && row.setId === setId,
          "reward quest " + questId,
        );
        relation.rewardItemIds.push(id);
        matchedFactions.push(relation.faction);
      }
      assert.deepEqual(matchedFactions.sort(), [...factions].sort());
      items.push({
        id,
        name: current.name,
        setId,
        className,
        requiredClassMask: classMask,
        questIds: [...item.questRewards].sort((a, b) => a - b),
        classRestrictionEvidence: "item reward links plus same-TOC quest class masks",
        currentServerAcquisitionVerified: false,
      });
    }
  }
  assert.equal(used.size, 72);
  for (const relation of relations) {
    relation.rewardItemIds.sort((a, b) => a - b);
    assert.equal(relation.rewardItemIds.length, [1, 2, 3, 2][relation.phase - 1]);
    assert.equal(new Set(relation.rewardItemIds).size, relation.rewardItemIds.length);
  }
  const reviewed = [];
  assert.equal(evidence.reviewedRelations.length, 20);
  assert.equal(new Set(evidence.reviewedRelations.map((row) => row.questId)).size, 20);
  for (const page of evidence.reviewedRelations) {
    const relation = one(
        relations,
        (row) => row.questId === page.questId,
        "reviewed reward relation",
      ),
      url = new URL(page.url);
    assert.equal(url.origin, "https://www.wowhead.com");
    assert(new RegExp("^/forever/(?:it/)?quest=" + page.questId + "/").test(url.pathname));
    assert.deepEqual(
      [...page.rewardIds].sort((a, b) => a - b),
      relation.rewardItemIds,
    );
    assert.equal(page.rewardDelivery, "all-listed-items");
    relation.simultaneousDeliveryVerified = true;
    reviewed.push(page.questId);
  }
  return {
    schema: "kfc-dungeon-upgrade-reward-association-review.v1",
    baseSets: 9,
    baseItems: 72,
    questCount: 64,
    rewardLinks: relations.reduce((n, row) => n + row.rewardItemIds.length, 0),
    items: items.sort((a, b) => a.id - b.id),
    relations: relations.sort((a, b) => a.questId - b.questId),
    itemRewardMappingComplete: true,
    reviewedDeliveryQuestIds: reviewed.sort((a, b) => a - b),
    pendingDeliveryQuestIds: relations
      .filter((row) => !row.simultaneousDeliveryVerified)
      .map((row) => row.questId)
      .sort((a, b) => a - b),
    currentServerAcquisitionVerified: false,
    catalogAdmissionAllowed: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
    scope:
      "Same-TOC Forever baked item-side questRewards associations cross-checked against all nine current base sets and 64 milestone class/faction records. Associations do not prove quantities, choice-versus-simultaneous delivery, live server availability or source-data redistribution rights. Twenty separately reviewed page relations corroborate their exact base reward IDs and simultaneous delivery; other delivery semantics remain unresolved.",
  };
}
