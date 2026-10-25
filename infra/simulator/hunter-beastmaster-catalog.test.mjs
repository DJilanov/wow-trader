import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  prepareHunterBeastmasterCatalog,
  prepareHunterBeastmasterInspection,
} from "./hunter-beastmaster-catalog.mjs";

const root = resolve(import.meta.dirname, "../.."),
  gzip = async (path) => JSON.parse(gunzipSync(await readFile(resolve(root, path)))),
  source = await gzip("infra/simulator/fixtures/hunter-beastmaster-source.v1.json.gz"),
  rewardSource = await gzip("infra/simulator/fixtures/dungeon-upgrade-reward-source.v1.json.gz"),
  indexed = JSON.parse(
    await readFile(
      resolve(root, "infra/simulator/fixtures/hunter-beastmaster-indexed-reward-source.v1.json"),
    ),
  ),
  evidence = { source, rewardSource, indexed },
  parent = {
    items: [{ id: 1, name: "unit-test parent sentinel" }],
    enchants: [],
    otherMetadata: { unchanged: true },
  };

test("eight current items preserve parent data and narrow acquisition to Hunter", () => {
  const before = JSON.stringify([parent, evidence]),
    result = prepareHunterBeastmasterCatalog(parent, evidence);
  assert.equal(result.additions.length, 8);
  assert.equal(result.db.items.length, 9);
  assert.deepEqual(result.db.items[0], parent.items[0]);
  assert.deepEqual(result.db.otherMetadata, parent.otherMetadata);
  assert.deepEqual(result.db.enchants, parent.enchants);
  assert.equal(result.modelCompiled, false);
  assert.equal(result.runtimeQualified, false);
  assert.equal(result.numericalOptimizationAllowed, false);
  assert.equal(result.publicationAllowed, false);
  for (const item of result.additions) {
    assert.deepEqual(item.classAllowlist, [2]);
    assert.equal(item.setId, 515);
    assert.equal(item.stats.length, 44);
    assert(item.stats.every(Number.isFinite));
    const origin = result.sources.find((row) => row.id === item.id);
    assert.equal(origin.acquisition.obtainableClass, 2);
    assert.equal(origin.acquisition.requiredClassMask, 4);
    assert.equal(origin.sources[0].quests.length, 2);
  }
  assert.equal(JSON.stringify([parent, evidence]), before);
});

test("pet effects stay attached to the correct IDs and never become owner crit", () => {
  const result = prepareHunterBeastmasterCatalog(parent, evidence),
    pairs = result.sources.flatMap((row) =>
      row.individualEffects.map((effect) => [row.id, effect.parentSpellId, effect.childSpellId]),
    );
  assert.deepEqual(pairs, [
    [22013, 27038, 27039],
    [22015, 27043, 27042],
    [22060, 27225, 27208],
    [22061, 27206, 27205],
  ]);
  const gloves = result.additions.find((item) => item.id === 22015);
  assert.equal(gloves.stats[19], 0);
  assert.equal(gloves.stats[14], 0);
  assert.equal(result.rules.proc.chance, 0.04);
  assert.equal(result.rules.proc.manaSpellId, 27786);
});

test("inspection keeps all thresholds and simultaneous rewards without overwriting existing metadata", () => {
  const original = { sets: { 1: { name: "unit-test set sentinel" } }, items: {}, enchants: {} },
    result = prepareHunterBeastmasterInspection(original, evidence);
  assert.deepEqual(
    result.sets[515].effects.map((row) => [row.threshold, row.spellId]),
    [
      [2, 18679],
      [4, 27785],
      [6, 14049],
      [8, 14803],
    ],
  );
  assert.deepEqual(result.sets[1], original.sets[1]);
  assert.equal(Object.keys(result.items).length, 8);
  assert.equal(Object.values(result.items).flatMap((item) => item.effects).length, 4);
  for (const item of Object.values(result.items)) {
    assert.equal(item.questRewardOnce, true);
    assert.deepEqual(item.questChoices, []);
  }
  assert.deepEqual(original.items, {});
});

test("duplicate parent IDs, existing inspection and unreviewed effect changes fail closed", () => {
  assert.throws(
    () => prepareHunterBeastmasterCatalog({ items: [{ id: 22010 }] }, evidence),
    /Refusing to replace/,
  );
  assert.throws(() => prepareHunterBeastmasterCatalog({ items: [{ id: 1 }, { id: 1 }] }, evidence));
  assert.throws(
    () => prepareHunterBeastmasterInspection({ sets: { 515: {} }, items: {} }, evidence),
    /Refusing to replace/,
  );
  assert.throws(
    () => prepareHunterBeastmasterInspection({ sets: {}, items: { 22013: {} } }, evidence),
    /Refusing to replace/,
  );
  const changed = globalThis.structuredClone(evidence);
  changed.source.tables.SpellEffect.find((row) => row.SpellID === 27042).EffectBasePointsF++;
  assert.throws(() => prepareHunterBeastmasterCatalog(parent, changed));
});
