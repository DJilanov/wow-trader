import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { simulationHash as hash } from "./simulation-cache.mjs";
import { reviewDruidFeralheartDpsAcquisition } from "./druid-feralheart-dps-acquisition.mjs";
import {
  prepareDruidFeralheartDpsCatalog,
  prepareDruidFeralheartDpsInspection,
  appendDruidFeralheartDpsImports,
} from "./druid-feralheart-dps-catalog.mjs";

const root = resolve(import.meta.dirname, "../.."),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  model = JSON.parse(
    readFileSync(
      resolve(
        root,
        "artifacts/forever-simulator/optimization/mage-full-raid-model-v1/context.json",
      ),
    ),
  );
assert.equal(hash(model), "f51c94d2c23307628b4b89cf95c60bbbbb07a47de3a6df3ccb4d83a2d8849157");
const fixtureBytes = readFileSync(
    resolve(root, "infra/simulator/fixtures/druid-feralheart-source.v1.json.gz"),
  ),
  referenceBytes = readFileSync(
    resolve(
      root,
      "artifacts/forever-simulator/optimization/druid-dungeon-upgrade-v1/reference-supplement-d2206d39d8d99e90.json",
    ),
  );
assert.equal(sha(fixtureBytes), "81090143f13b7cc77caecdad0c790bf4a6152fec21c187a225d0b39c727feda1");
assert.equal(
  sha(referenceBytes),
  "d0ee24dd186220a1a0ab3fbe1a6d39cb5951ebe38f3a1b40830e77b53f3efa9d",
);
const evidence = {
    source: JSON.parse(gunzipSync(fixtureBytes)),
    reference: JSON.parse(referenceBytes),
  },
  parentBytes = readFileSync(resolve(root, model.databasePath)),
  parent = JSON.parse(parentBytes);
assert.equal(
  sha(parentBytes),
  model.generatedInputs.find((row) => row.path === model.databasePath).byteSha256,
);
function asset(name) {
  const bytes = readFileSync(
    resolve(root, "artifacts/forever-simulator/" + model.release + "/" + name),
  );
  assert.equal(sha(bytes), model.model.files[name].sha256);
  return JSON.parse(bytes);
}

test("current full catalog gains exactly eight Druid-restricted items while preserving all parent data", () => {
  const before = hash(parent),
    result = prepareDruidFeralheartDpsCatalog(parent, evidence);
  assert.equal(parent.items.length, 2695);
  assert.equal(result.db.items.length, 2703);
  assert.equal(hash(parent), before);
  assert.deepEqual(result.db.items.slice(0, parent.items.length), parent.items);
  for (const key of Object.keys(parent).filter((key) => key !== "items"))
    assert.deepEqual(result.db[key], parent[key]);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    [22106, 22107, 22108, 22109, 22110, 22111, 22112, 22113],
  );
  for (const item of result.additions) {
    assert.deepEqual(item.classAllowlist, [1]);
    assert.equal(item.setId, 513);
    assert.equal(item.stats.length, 44);
  }
  assert.equal(result.runtimeQualified, false);
  assert.equal(result.numericalOptimizationAllowed, false);
  assert.equal(result.publicationAllowed, false);
});

test("new Forever name evidence augments the historical relation without claiming exact item links or live delivery", () => {
  const before = hash(evidence),
    result = reviewDruidFeralheartDpsAcquisition(evidence),
    horde = result.relations.find((row) => row.questId === 8913);
  assert(horde.originalSourceUrl.includes("/classic/quest=8913/"));
  assert(horde.url.includes("/forever/quest=8913/"));
  assert.equal(horde.exactPageItemLinksReviewed, false);
  assert.equal(result.rewardNameCoverageComplete, true);
  assert.equal(result.currentServerAcquisitionVerified, false);
  assert.equal(hash(evidence), before);
  const catalog = prepareDruidFeralheartDpsCatalog(parent, evidence);
  assert.equal(catalog.rules.foreverRewardRelations, 7);
  assert.equal(catalog.rules.historicalRewardRelations, 1);
  assert.equal(catalog.acquisition.relations.length, 8);
});

test("inspection keeps both six-piece spells, all old entries and simultaneous upgrade rewards", () => {
  const old = asset("kfc-inspection.json"),
    before = hash(old),
    result = prepareDruidFeralheartDpsInspection(old, evidence);
  assert.equal(hash(old), before);
  for (const key of Object.keys(old.sets)) assert.deepEqual(result.sets[key], old.sets[key]);
  for (const key of Object.keys(old.items)) assert.deepEqual(result.items[key], old.items[key]);
  assert.deepEqual(
    result.sets[513].effects.map((row) => [row.threshold, row.spellId]),
    [
      [2, 18679],
      [4, 27781],
      [6, 9334],
      [6, 9344],
      [8, 14803],
    ],
  );
  assert.notEqual(result.sets[513].effects[2].name, result.sets[513].effects[3].name);
  for (let id = 22106; id <= 22113; id++) {
    assert.equal(result.items[id].setId, 513);
    assert.equal(result.items[id].questRewardOnce, true);
    assert.deepEqual(result.items[id].questChoices, []);
  }
  assert.throws(() => prepareDruidFeralheartDpsInspection(result, evidence));
});

test("current imports preserve prior entries and expose provisional class-restricted acquisition", () => {
  const old = asset("kfc-prebis-import.json"),
    before = hash(old),
    catalog = prepareDruidFeralheartDpsCatalog(parent, evidence),
    result = appendDruidFeralheartDpsImports(old, catalog.sources);
  assert.equal(hash(old), before);
  assert.deepEqual(result.items, old.items);
  assert.deepEqual(result.currentItems.slice(0, old.currentItems.length), old.currentItems);
  assert.equal(result.currentItems.length, old.currentItems.length + 8);
  for (const row of result.currentItems.slice(old.currentItems.length)) {
    assert.equal(row.acquisition.allowed, true);
    assert.equal(row.acquisition.obtainableClass, 1);
    assert.equal(row.acquisition.requiredClassMask, 1024);
    assert.equal(row.acquisition.currentServerVerified, false);
    assert.equal(row.acquisition.exactPageItemLinkRelations, 0);
  }
  assert.throws(() => appendDruidFeralheartDpsImports(result, catalog.sources));
  assert.throws(() => appendDruidFeralheartDpsImports(old, catalog.sources.slice(1)));
});

test("changed references, self-claimed qualification, wrong faction or invented item links cannot admit candidates", () => {
  for (const change of [
    (v) => {
      v.reference.newForeverNameReviews[0].observedRewardNames = ["Virtuous Bracers"];
    },
    (v) => {
      v.reference.newForeverNameReviews[0].exactRewardItemLinksReviewed = true;
    },
    (v) => {
      v.reference.newForeverNameReviews[0].faction = "Alliance";
    },
    (v) => {
      v.reference.originalSource.byteSha256 = "0".repeat(64);
    },
    (v) => {
      v.reference.priorForeverNameReviews.pop();
    },
    (v) => {
      v.reference.currentServerAcquisitionVerified = true;
    },
    (v) => {
      v.reference.publicationAllowed = true;
    },
    (v) => {
      v.source.classQuestEvidence[0].requiredClasses = 128;
    },
  ]) {
    const value = globalThis.structuredClone(evidence);
    change(value);
    assert.throws(() => prepareDruidFeralheartDpsCatalog(parent, value));
  }
});

test("source inputs stay unchanged and a repeated catalog extension is rejected", () => {
  const before = hash(evidence),
    catalog = prepareDruidFeralheartDpsCatalog(parent, evidence);
  prepareDruidFeralheartDpsInspection(asset("kfc-inspection.json"), evidence);
  appendDruidFeralheartDpsImports(asset("kfc-prebis-import.json"), catalog.sources);
  assert.equal(hash(evidence), before);
  assert.throws(() => prepareDruidFeralheartDpsCatalog(catalog.db, evidence));
});
