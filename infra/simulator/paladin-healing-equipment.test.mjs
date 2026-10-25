import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { eligiblePrebis } from "./prebis-pool.mjs";
import {
  collectPaladinHealingEquipment,
  eligiblePaladinHealingItem,
  legalPaladinHealingGear,
  paladinHealingHandCandidates,
} from "./paladin-healing-equipment.mjs";

const bytes = readFileSync(
  new URL("./fixtures/paladin-healing-equipment-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "6a0ab3d83edcc952aeb1180fcbe0ed01423ec518303607beaf7604a9c7a7109c",
);
const fixture = JSON.parse(gunzipSync(bytes));
const items = new Map(fixture.items.map((row) => [row.id, row]));
const sources = new Map(fixture.sources.map((row) => [row.id, row]));
const context = {
  ...fixture.context,
  currentIds: new Set(),
  originalItems: fixture.seed.items.map((row) => items.get(row.id)),
};
const pool = collectPaladinHealingEquipment(items, sources, context);

test("Paladin equipment covers all 17 slots and librams without stat or quality pruning", () => {
  assert.equal(fixture.selectedRowsAreSourceSubsets, true);
  assert.equal(fixture.seedPurpose, "equipment-legality-control-only");
  assert.equal(pool.slots.length, 17);
  assert(pool.slots.every((row) => row.length > 0));
  assert(pool.slots[14].includes(2848));
  assert(pool.slots[12].includes(1490));
  assert(pool.slots[10].includes(19325));
  assert(pool.slots[16].includes(279248));
  assert.equal(pool.statPruning, false);
  assert.equal(pool.qualityPruning, false);
  assert.equal(pool.weaponStyleLocked, false);
  assert.equal(pool.publicationAllowed, false);
});

test("Paladin hands admit axes, maces, swords and polearms while rejecting staves and daggers", () => {
  for (const kind of [1, 4, 6, 9]) {
    const row = fixture.items.find(
      (item) => item.weaponType === kind && pool.slots[14].includes(item.id),
    );
    assert(row, String(kind));
    assert(eligiblePaladinHealingItem(row, sources.get(row.id), context, 14));
  }
  assert(eligiblePaladinHealingItem(items.get(1976), sources.get(1976), context, 14));
  for (const id of [1155, 13964, 6341, 1936])
    assert.equal(
      eligiblePaladinHealingItem(items.get(id), sources.get(id), context, 14),
      false,
      String(id),
    );
});

test("Paladin healing can compare shields and held off-hands without the DPS weapon-style lock", () => {
  const shield = fixture.items.find(
    (row) => row.weaponType === 7 && pool.slots[15].includes(row.id),
  );
  assert(shield);
  assert.equal(eligiblePrebis(shield, sources.get(shield.id), context, 15), false);
  assert(eligiblePaladinHealingItem(shield, sources.get(shield.id), context, 15));
  assert(eligiblePaladinHealingItem(items.get(6341), sources.get(6341), context, 15));
  assert.equal(eligiblePaladinHealingItem(items.get(2816), sources.get(2816), context, 15), false);
  const gear = structuredClone(fixture.seed);
  gear.items[15] = { id: shield.id };
  assert(legalPaladinHealingGear(gear, items, sources, context));
  gear.items[14] = { id: 1976 };
  assert.equal(legalPaladinHealingGear(gear, items, sources, context), false);
  gear.items[15] = { id: 0 };
  assert(legalPaladinHealingGear(gear, items, sources, context));
  gear.items[15].enchant = 1;
  assert.equal(legalPaladinHealingGear(gear, items, sources, context), false);
});

test("Paladin can choose cloth through plate but cannot equip another class relic", () => {
  const plate = fixture.items.find(
    (row) => row.type === 1 && row.armorType === 4 && pool.slots[0].includes(row.id),
  );
  assert(plate);
  assert(eligiblePaladinHealingItem(plate, sources.get(plate.id), context, 0));
  const cloth = items.get(2292);
  assert(cloth);
  assert.equal(cloth.armorType, 1);
  assert(eligiblePaladinHealingItem(cloth, sources.get(cloth.id), context, 4));
  const libram = items.get(279248);
  for (const rangedWeaponType of [4, 7, 8])
    assert.equal(
      eligiblePaladinHealingItem(
        { ...libram, rangedWeaponType },
        sources.get(libram.id),
        context,
        16,
      ),
      false,
    );
});

test("Paladin equipment retains raid material, acquisition, level and profession restrictions", () => {
  for (const [id, slot] of [
    [19682, 4],
    [19999, 0],
    [19687, 8],
  ]) {
    assert.equal(sources.get(id).craftAudit.status, "raid-dependent");
    assert.equal(eligiblePaladinHealingItem(items.get(id), sources.get(id), context, slot), false);
  }
  const item = items.get(2816),
    source = sources.get(item.id);
  for (const changed of [
    undefined,
    { ...source, requiredLevel: 61 },
    { ...source, requiredLevel: undefined },
    { ...source, sources: [{ kind: "dungeon", zoneId: 3429 }] },
    { ...source, requiredAbility: 1 },
  ])
    assert.equal(eligiblePaladinHealingItem(item, changed, context, 14), false);
  assert.equal(
    eligiblePaladinHealingItem({ ...item, requiredProfession: 1 }, source, context, 14),
    false,
  );
  assert(
    eligiblePaladinHealingItem(
      { ...item, requiredProfession: 1 },
      source,
      { ...context, professions: [1, 4] },
      14,
    ),
  );
});

test("Paladin hand override preserves class, faction, race and whole-loadout ownership", () => {
  const item = items.get(2816),
    source = sources.get(item.id);
  assert.equal(
    eligiblePaladinHealingItem({ ...item, classAllowlist: [5] }, source, context, 14),
    false,
  );
  assert.equal(
    eligiblePaladinHealingItem({ ...item, factionRestriction: 2 }, source, context, 14),
    false,
  );
  assert.equal(
    eligiblePaladinHealingItem(item, { ...source, raceMasks: [1, 0] }, context, 14),
    false,
  );
  assert(pool.slots[10].includes(271908));
  assert(!pool.slots[10].includes(272064));
  const gear = structuredClone(fixture.seed),
    changedItems = new Map(items),
    changedSources = new Map(sources);
  changedItems.set(942, { ...items.get(942), unique: true });
  assert.equal(legalPaladinHealingGear(gear, changedItems, sources, context), false);
  for (const id of [942, 19325]) {
    changedItems.set(id, { ...items.get(id), sources: [{ quest: { id: 9999 } }] });
    changedSources.set(id, {
      ...sources.get(id),
      questChoice: "test-mutated-exclusive-reward",
      sources: [{ kind: "dungeon-quest", questId: 9999 }],
    });
  }
  gear.items[11] = { id: 19325 };
  assert.equal(legalPaladinHealingGear(gear, changedItems, changedSources, context), false);
});

test("Paladin hand enumeration retains the full legal Cartesian alternatives", () => {
  const pairs = [...paladinHealingHandCandidates(pool, items)];
  const twoHand = pool.slots[14].filter((id) => items.get(id).handType === 4);
  const oneHand = pool.slots[14].filter((id) => items.get(id).handType !== 4);
  assert.equal(pairs.length, twoHand.length + oneHand.length * (pool.slots[15].length + 1));
  assert.equal(new Set(pairs.map((row) => `${row.mainHand}/${row.offHand}`)).size, pairs.length);
  for (const pair of pairs) {
    const gear = structuredClone(fixture.seed);
    gear.items[14] = { id: pair.mainHand };
    gear.items[15] = { id: pair.offHand };
    assert(legalPaladinHealingGear(gear, items, sources, context));
  }
});

test("incomplete gear and a wrong class cannot enter the Paladin domain", () => {
  assert.equal(legalPaladinHealingGear({ items: [] }, items, sources, context), false);
  const gear = structuredClone(fixture.seed);
  gear.items[16] = { id: 0 };
  assert.equal(legalPaladinHealingGear(gear, items, sources, context), false);
  assert.throws(
    () => collectPaladinHealingEquipment(items, sources, { ...context, playerClass: 3 }),
    /Paladin-only/,
  );
  assert.throws(() =>
    collectPaladinHealingEquipment(items, sources, { ...context, requireCraftAudit: false }),
  );
});
