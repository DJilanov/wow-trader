import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { reviewDungeonUpgradeRewardAssociations } from "./dungeon-upgrade-rewards.mjs";

const evidence = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/dungeon-upgrade-reward-source.v1.json.gz", import.meta.url)),
  ),
);

test("all 72 current base items map to 64 same-flavor milestones and 128 reward associations", () => {
  const review = reviewDungeonUpgradeRewardAssociations(evidence);
  assert.deepEqual(
    [review.baseSets, review.baseItems, review.questCount, review.rewardLinks],
    [9, 72, 64, 128],
  );
  assert.equal(review.itemRewardMappingComplete, true);
  assert.equal(review.reviewedDeliveryQuestIds.length, 20);
  assert.equal(review.pendingDeliveryQuestIds.length, 44);
  assert.equal(review.currentServerAcquisitionVerified, false);
  assert.equal(review.catalogAdmissionAllowed, false);
  assert.equal(review.numericalOptimizationAllowed, false);
  assert.equal(review.publicationAllowed, false);
  for (const relation of review.relations) assert.equal(relation.rewardQuantitiesVerified, false);
});

test("Hunter bindings, belt and gloves have real item-side quest associations without fabricated delivery semantics", () => {
  const review = reviewDungeonUpgradeRewardAssociations(evidence),
    bindings = review.items.find((row) => row.id === 22011),
    belt = review.items.find((row) => row.id === 22010),
    gloves = review.items.find((row) => row.id === 22015);
  assert.deepEqual(bindings.questIds, [8906, 8914]);
  assert.deepEqual(belt.questIds, [8931, 8938]);
  assert.deepEqual(gloves.questIds, belt.questIds);
  for (const row of [bindings, belt, gloves]) assert.equal(row.requiredClassMask, 4);
  for (const id of [8931, 8938]) {
    const relation = review.relations.find((row) => row.questId === id);
    assert.deepEqual(relation.rewardItemIds, [22010, 22015]);
    assert.equal(relation.simultaneousDeliveryVerified, false);
  }
  const reviewed = review.relations.find((row) => row.questId === 8952);
  assert.deepEqual(reviewed.rewardItemIds, [22016, 22017, 22061]);
  assert.equal(reviewed.simultaneousDeliveryVerified, true);
});

test("Paladin and Shaman retain their source faction limits while other classes have both factions", () => {
  const review = reviewDungeonUpgradeRewardAssociations(evidence);
  for (const [setId, className, factions] of [
    [516, "Paladin", ["Alliance"]],
    [519, "Shaman", ["Horde"]],
    [515, "Hunter", ["Alliance", "Horde"]],
  ]) {
    const relations = review.relations.filter((row) => row.setId === setId);
    assert(relations.every((row) => row.className === className));
    assert.equal(relations.length, factions.length * 4);
    assert.deepEqual([...new Set(relations.map((row) => row.faction))].sort(), factions);
    assert(
      review.items
        .filter((row) => row.setId === setId)
        .every((row) => row.questIds.length === factions.length),
    );
  }
});

test("wrong flavor, class masks, alternate sets, missing links and inconsistent phases fail closed", () => {
  const mutations = [
    (x) => {
      x.source.flavor = "Era";
    },
    (x) => {
      x.source.contract = "1";
    },
    (x) => {
      x.source.revision = "another-source";
    },
    (x) => {
      x.snapshot.sets.find((row) => row.id === 515).ItemID[0] = 226903;
    },
    (x) => {
      x.snapshot.items.find((row) => row.itemId === 22010).setId = 1669;
    },
    (x) => {
      x.items.find((row) => row.id === 22010).name = "Alternate item";
    },
    (x) => {
      x.items.find((row) => row.id === 22010).questRewards = [];
    },
    (x) => {
      x.items.find((row) => row.id === 22010).questRewards = [8931, 8931];
    },
    (x) => {
      x.items.find((row) => row.id === 22010).questRewards = [8912, 8938];
    },
    (x) => {
      x.quests.find((row) => row.questId === 8931).requiredClasses = 1;
    },
    (x) => {
      x.quests.find((row) => row.questId === 8931).requiredRaces = 0;
    },
    (x) => {
      x.quests.find((row) => row.questId === 8931).phase = 5;
    },
    (x) => {
      x.items.pop();
    },
    (x) => {
      x.quests.pop();
    },
    (x) => {
      x.items[1] = globalThis.structuredClone(x.items[0]);
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewDungeonUpgradeRewardAssociations(changed));
  }
});

test("page corroboration rejects foreign flavors, changed rewards, duplicate pages and unreviewed choice semantics", () => {
  const mutations = [
    (x) => {
      x.reviewedRelations[0].url = x.reviewedRelations[0].url.replace("/forever/", "/classic/");
    },
    (x) => {
      x.reviewedRelations[0].rewardIds.push(22010);
    },
    (x) => {
      x.reviewedRelations[0].rewardDelivery = "choose-one";
    },
    (x) => {
      x.reviewedRelations[1] = globalThis.structuredClone(x.reviewedRelations[0]);
    },
    (x) => {
      x.reviewedRelations.pop();
    },
  ];
  for (const mutate of mutations) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => reviewDungeonUpgradeRewardAssociations(changed));
  }
});

test("input order does not change results and returned metadata never aliases the source", () => {
  const before = globalThis.structuredClone(evidence),
    review = reviewDungeonUpgradeRewardAssociations(evidence),
    reordered = globalThis.structuredClone(evidence);
  reordered.items.reverse();
  reordered.quests.reverse();
  reordered.reviewedRelations.reverse();
  assert.deepEqual(reviewDungeonUpgradeRewardAssociations(reordered), review);
  review.items[0].questIds.length = 0;
  review.relations[0].requiredItemIds.length = 0;
  review.relations[0].rewardItemIds.length = 0;
  assert.deepEqual(evidence, before);
});
