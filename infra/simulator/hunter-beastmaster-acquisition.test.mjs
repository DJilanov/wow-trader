import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewHunterBeastmasterAcquisition } from "./hunter-beastmaster-acquisition.mjs";

const root = resolve(import.meta.dirname, "../.."),
  gzip = async (path) => JSON.parse(gunzipSync(await readFile(resolve(root, path)))),
  source = await gzip("infra/simulator/fixtures/hunter-beastmaster-source.v1.json.gz"),
  rewardSource = await gzip("infra/simulator/fixtures/dungeon-upgrade-reward-source.v1.json.gz"),
  indexed = JSON.parse(
    await readFile(
      resolve(root, "infra/simulator/fixtures/hunter-beastmaster-indexed-reward-source.v1.json"),
    ),
  ),
  fixture = () => globalThis.structuredClone({ source, rewardSource, indexed });

test("all eight exact base items and both factions retain their distinct acquisition evidence", () => {
  const value = fixture(),
    before = JSON.stringify(value),
    reviewed = reviewHunterBeastmasterAcquisition(value);
  assert.equal(reviewed.items.length, 8);
  assert.equal(reviewed.relations.length, 8);
  assert.equal(reviewed.referenceRewardCoverageComplete, true);
  assert.equal(reviewed.indexedRewardSections, 4);
  assert.equal(reviewed.preservedRewardRecords, 4);
  assert.equal(reviewed.catalogAdmissionAllowed, false);
  assert.equal(reviewed.numericalOptimizationAllowed, false);
  assert.equal(reviewed.publicationAllowed, false);
  assert.equal(reviewed.rewardQuantitiesVerified, false);
  assert.equal(reviewed.currentServerAcquisitionVerified, false);
  assert.equal(JSON.stringify(value), before);
  assert.equal(value.source.acquisition.completeRewardReview, false);
});

test("cross-flavor URLs, choices and partial or duplicate supplemental quests fail closed", () => {
  for (const mutate of [
    (value) => {
      value.indexed.sourceFlavor = "Classic";
    },
    (value) => {
      value.indexed.quests[0].url = value.indexed.quests[0].url.replace("/forever/", "/classic/");
    },
    (value) => {
      value.indexed.quests[0].rewardHeading = "You will be able to choose one:";
    },
    (value) => {
      value.indexed.quests[0].displayedAsChoice = true;
    },
    (value) => {
      value.indexed.quests.pop();
    },
    (value) => {
      value.indexed.quests[0] = value.indexed.quests[1];
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => reviewHunterBeastmasterAcquisition(value));
  }
});

test("alternate IDs, mismatched names, missing paired rewards and invented quantities fail closed", () => {
  for (const mutate of [
    (value) => {
      value.indexed.quests[0].rewardItems[0].itemId = 226898;
    },
    (value) => {
      value.indexed.quests[0].rewardItems[0].name = "Beaststalker's Bindings";
    },
    (value) => {
      value.indexed.quests[2].rewardItems.pop();
    },
    (value) => {
      value.indexed.quests[0].rewardItems[0].quantity = 1;
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => reviewHunterBeastmasterAcquisition(value));
  }
});

test("class/faction changes, source snapshot drift and fabricated admission flags fail closed", () => {
  for (const mutate of [
    (value) => {
      value.indexed.quests[0].faction = "Horde";
    },
    (value) => {
      value.source.classQuestEvidence[0].requiredClasses = 8;
    },
    (value) => {
      value.rewardSource.snapshot.hotfixSha256 = "f".repeat(64);
    },
    (value) => {
      value.indexed.directDocumentFetchVerified = true;
    },
    (value) => {
      value.indexed.catalogAdmissionAllowed = true;
    },
    (value) => {
      value.indexed.numericalAdmissionAllowed = true;
    },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => reviewHunterBeastmasterAcquisition(value));
  }
});
