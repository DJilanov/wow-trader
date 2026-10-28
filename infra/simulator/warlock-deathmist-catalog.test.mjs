import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extendWarlockDeathmistCatalog,
  extendWarlockDeathmistInspection,
} from "./warlock-deathmist-catalog.mjs";
import {
  eligiblePrebis,
  legalPrebisGear,
  prebisSetSubsets,
  prebisSlotTypes,
} from "./prebis-pool.mjs";

const evidence = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/warlock-deathmist-source.v1.json.gz", import.meta.url)),
  ),
);
const parent = {
  items: [{ id: evidence.acquisition.relations[0].requiredItemIds[0] }],
  encounters: [],
};

test("preserves current parent records and keeps faction quests as alternative access references", () => {
  const before = structuredClone({ parent, evidence });
  const result = extendWarlockDeathmistCatalog(parent, evidence);
  assert.deepEqual(result.db.items.slice(0, parent.items.length), parent.items);
  assert.deepEqual(result.db.encounters, parent.encounters);
  assert.deepEqual(
    result.additions.map((row) => row.id),
    Array.from({ length: 8 }, (_, index) => 22070 + index),
  );
  for (const source of result.sources) {
    assert.equal(source.sources.length, 1);
    assert.equal(source.sources[0].faction, undefined);
    assert.deepEqual(source.sources[0].quests.map((row) => row.faction).sort(), [
      "Alliance",
      "Horde",
    ]);
    assert.equal(source.acquisition.currentServerVerified, false);
    assert.equal(source.acquisition.rewardQuantitiesVerified, false);
    assert.equal(source.acquisition.simultaneousDeliveryVerified, false);
    assert.equal(source.maxCount, 1);
  }
  assert.equal(result.numericalReuseAllowed, false);
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual({ parent, evidence }, before);
});

test("the real prebis filters admit every base reward for either Warlock faction and reject other classes", () => {
  const result = extendWarlockDeathmistCatalog({ items: [] }, evidence);
  for (const factionName of ["Alliance", "Horde"]) {
    const context = {
      playerClass: 8,
      factionName,
      faction: factionName === "Alliance" ? 1 : 2,
      professions: [],
      currentIds: new Set(),
      originalItems: Array(17).fill(null),
      requireCraftAudit: true,
    };
    for (const item of result.additions) {
      const slot = prebisSlotTypes.indexOf(item.type),
        source = result.sources.find((row) => row.id === item.id);
      assert(eligiblePrebis(item, source, context, slot));
      assert.equal(eligiblePrebis(item, source, { ...context, playerClass: 3 }, slot), false);
      assert.equal(eligiblePrebis(item, source, context, (slot + 1) % 17), false);
    }
    const items = new Map(result.additions.map((row) => [row.id, row])),
      sources = new Map(result.sources.map((row) => [row.id, row]));
    const gear = { items: Array.from({ length: 17 }, () => ({ id: 0 })) };
    for (const item of result.additions)
      gear.items[prebisSlotTypes.indexOf(item.type)] = { id: item.id };
    assert(
      legalPrebisGear(gear, items, sources, context),
      "Shared phase rewards were incorrectly made mutually exclusive",
    );
    const subsets = [
      ...prebisSetSubsets(
        result.additions.map((item) => ({ item, slot: prebisSlotTypes.indexOf(item.type) })),
      ),
    ];
    assert.equal(subsets.length, 247);
    assert.equal(subsets.filter((rows) => rows.length === 8).length, 1);
  }
});

test("inspection records exact thresholds and one-copy ownership without invented exclusive choices", () => {
  const inspection = { sets: {}, items: {} },
    before = structuredClone(inspection);
  const result = extendWarlockDeathmistInspection(inspection, evidence);
  assert.deepEqual(
    result.sets[518].effects.map((row) => [row.threshold, row.spellId]),
    [
      [2, 18679],
      [4, 27780],
      [6, 14047],
      [8, 14803],
    ],
  );
  for (const item of Object.values(result.items)) {
    assert.equal(item.setId, 518);
    assert.equal(item.questRewardOnce, true);
    assert.deepEqual(item.questChoices, []);
    assert.deepEqual(item.effects, []);
  }
  assert.deepEqual(inspection, before);
});

test("refuses catalog or inspection collisions and invalid current source", () => {
  const existing = extendWarlockDeathmistCatalog({ items: [] }, evidence);
  assert.throws(() => extendWarlockDeathmistCatalog(existing.db, evidence), /Refusing to replace/);
  assert.throws(
    () => extendWarlockDeathmistCatalog({ items: [parent.items[0], parent.items[0]] }, evidence),
    /Duplicate parent/,
  );
  const inspection = extendWarlockDeathmistInspection({ sets: {}, items: {} }, evidence);
  assert.throws(
    () => extendWarlockDeathmistInspection(inspection, evidence),
    /Refusing to replace/,
  );
  const changed = structuredClone(evidence);
  changed.acquisition.relations[0].requiredClassMask = 1;
  assert.throws(() => extendWarlockDeathmistCatalog({ items: [] }, changed));
});
