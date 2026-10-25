import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { reviewMageSorcererAcquisition } from "./mage-sorcerer-acquisition.mjs";
import {
  appendMageSorcererImports,
  prepareMageSorcererCatalog,
  prepareMageSorcererInspection,
} from "./mage-sorcerer-catalog.mjs";
import { eligiblePrebis, prebisSlotTypes } from "./prebis-pool.mjs";

const root = resolve(import.meta.dirname, "../.."),
  source = JSON.parse(
    gunzipSync(
      await readFile(resolve(root, "infra/simulator/fixtures/mage-sorcerer-source.v1.json.gz")),
    ),
  ),
  reference = JSON.parse(
    await readFile(
      resolve(
        root,
        "artifacts/forever-simulator/optimization/mage-dungeon-upgrade-v1/reference-supplement-c5e2deeca9427127.json",
      ),
    ),
  ),
  evidence = { source, reference },
  parent = { items: [{ id: 1, name: "test sentinel" }], enchants: [], extra: { preserved: true } };

test("all eight base pieces preserve parent data and current acquisition evidence tiers", () => {
  const before = JSON.stringify([parent, evidence]),
    result = prepareMageSorcererCatalog(parent, evidence);
  assert.equal(result.db.items.length, 9);
  assert.deepEqual(result.db.items[0], parent.items[0]);
  assert.deepEqual(result.db.enchants, parent.enchants);
  assert.deepEqual(result.db.extra, parent.extra);
  assert.deepEqual(
    result.additions.map((item) => item.id),
    [22062, 22063, 22064, 22065, 22066, 22067, 22068, 22069],
  );
  for (const item of result.additions) {
    assert.equal(item.setId, 517);
    assert.deepEqual(item.classAllowlist, [3]);
    assert.equal(item.stats.length, 44);
    assert(item.stats.every(Number.isFinite));
    const origin = result.sources.find((row) => row.id === item.id);
    assert.deepEqual(origin.sources[0].quests.map((quest) => quest.faction).sort(), [
      "Alliance",
      "Horde",
    ]);
    assert.equal(origin.acquisition.currentServerVerified, false);
    assert.equal(origin.acquisition.requiredClassMask, 128);
  }
  assert.deepEqual(
    result.sources.map((row) => row.acquisition.exactPageItemLinkRelations),
    [1, 2, 1, 0, 1, 1, 1, 0],
  );
  for (const key of [
    "modelCompiled",
    "runtimeQualified",
    "numericalOptimizationAllowed",
    "publicationAllowed",
  ])
    assert.equal(result[key], false);
  assert.equal(JSON.stringify([parent, evidence]), before);
});

test("review cannot swap exact-link evidence between pages or accept alternate IDs or changed restrictions", () => {
  const swapped = structuredClone(evidence);
  for (const id of [8932, 8939]) {
    const row = swapped.reference.rows.find((row) => row.questId === id);
    row.exactPageItemLinksReviewed = !row.exactPageItemLinksReviewed;
    row.idMappingEvidence = row.exactPageItemLinksReviewed
      ? "quest reward links resolved to exact base item URLs; same-TOC associations agree"
      : "reward names corroborate same-TOC item-ID associations; exact page item links unreviewed";
  }
  assert.throws(() => reviewMageSorcererAcquisition(swapped), /reviewed quest pages/);
  for (const change of [
    (copy) => {
      copy.reference.rows[0].mappedBaseItemIds[0] = 226938;
    },
    (copy) => {
      copy.reference.rows[0].faction = "Horde";
    },
    (copy) => {
      copy.reference.rows[0].url = "https://example.com/forever/quest=8907/reward";
    },
    (copy) => {
      copy.reference.rows[0].currentServerAcquisitionVerified = true;
    },
    (copy) => {
      copy.source.acquisition.relations[0].requiredClassMask = 0;
    },
  ]) {
    const copy = structuredClone(evidence);
    change(copy);
    assert.throws(() => prepareMageSorcererCatalog(parent, copy));
  }
});

test("inspection preserves 2/4/6/8 thresholds without making simultaneous quest rewards exclusive", () => {
  const original = { sets: { 1: { name: "sentinel" } }, items: {}, enchants: {} },
    result = prepareMageSorcererInspection(original, evidence);
  assert.deepEqual(
    result.sets[517].effects.map((row) => [row.threshold, row.spellId]),
    [
      [2, 18679],
      [4, 27867],
      [6, 14047],
      [8, 14803],
    ],
  );
  assert.deepEqual(result.sets[1], original.sets[1]);
  assert.equal(Object.keys(result.items).length, 8);
  for (const item of Object.values(result.items)) {
    assert.equal(item.questRewardOnce, true);
    assert.deepEqual(item.questChoices, []);
    assert.deepEqual(item.effects, []);
  }
  assert.deepEqual(original.items, {});
});

test("imports and the real eligibility predicate admit both factions for Mage only", () => {
  const prepared = prepareMageSorcererCatalog(parent, evidence),
    original = { items: [{ id: 1 }], currentItems: [{ id: 2 }], extra: "preserved" },
    before = JSON.stringify(original),
    imports = appendMageSorcererImports(original, prepared.sources);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(imports.currentItems.slice(0, 1), original.currentItems);
  assert.equal(imports.extra, original.extra);
  for (const item of prepared.additions) {
    const origin = imports.currentItems.find((row) => row.id === item.id),
      slot = prebisSlotTypes.indexOf(item.type);
    assert.equal(origin.acquisition.allowed, true);
    assert.equal(origin.acquisition.currentServerVerified, false);
    assert.equal(origin.statsProvenance, "current-client");
    assert.deepEqual(origin.effectReviews, []);
    for (const factionName of ["Alliance", "Horde"]) {
      const context = {
        playerClass: 3,
        factionName,
        faction: factionName === "Alliance" ? 1 : 2,
        professions: [7, 8],
        currentIds: new Set(),
        originalItems: [],
        requireCraftAudit: true,
      };
      assert.equal(eligiblePrebis(item, origin, context, slot), true);
      assert.equal(eligiblePrebis(item, origin, { ...context, playerClass: 2 }, slot), false);
    }
  }
});

test("duplicate IDs, existing metadata and changed set effects fail closed", () => {
  assert.throws(
    () => prepareMageSorcererCatalog({ items: [{ id: 22062 }] }, evidence),
    /Refusing to replace/,
  );
  assert.throws(() => prepareMageSorcererCatalog({ items: [{ id: 1 }, { id: 1 }] }, evidence));
  assert.throws(
    () => prepareMageSorcererInspection({ sets: { 517: {} }, items: {} }, evidence),
    /Refusing to replace/,
  );
  assert.throws(
    () => prepareMageSorcererInspection({ sets: {}, items: { 22063: {} } }, evidence),
    /Refusing to replace/,
  );
  const copy = structuredClone(evidence);
  copy.source.tables.SpellEffect.find((row) => row.SpellID === 14047).EffectBasePointsF++;
  assert.throws(() => prepareMageSorcererCatalog(parent, copy));
  const prepared = prepareMageSorcererCatalog(parent, evidence);
  assert.throws(() =>
    appendMageSorcererImports({ items: [{ id: 22062 }], currentItems: [] }, prepared.sources),
  );
});
