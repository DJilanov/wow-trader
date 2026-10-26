import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  collectShamanHealingEquipment,
  eligibleShamanHealingItem,
  legalShamanHealingGear,
  shamanHealingHandCandidates,
} from "./shaman-healing-equipment.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(new URL("fixtures/shaman-healing-equipment-source.v1.json.gz", import.meta.url)),
  ),
);
assert.equal(fixture.schema, "kfc-shaman-equipment-source.v1");
const items = new Map(fixture.items.map((item) => [item.id, item])),
  sources = new Map(fixture.sources.map((item) => [item.id, item]));
const context = {
  ...fixture.context,
  currentIds: new Set(),
  originalItems: fixture.seed.items.map((spec) => items.get(spec.id)),
};
const pool = collectShamanHealingEquipment(items, sources, context);

test("all seventeen Shaman slots and both hand styles remain in the unpruned domain", () => {
  assert.equal(fixture.selectedRowsAreSourceSubsets, true);
  assert.equal(fixture.seedPurpose, "equipment-legality-control-only");
  assert.equal(pool.slots.length, 17);
  assert(pool.slots.every((slot) => slot.length > 0));
  assert.equal(pool.statPruning, false);
  assert.equal(pool.qualityPruning, false);
  assert.equal(pool.weaponStyleLocked, false);
  assert(legalShamanHealingGear(fixture.seed, items, sources, context));
  assert.equal(pool.publicationAllowed, false);
});

test("Shaman mains allow axes maces daggers fists and staves, while offhands require shields or held items", () => {
  for (const kind of [1, 2, 3, 4, 8])
    assert(
      pool.slots[14].some((id) => items.get(id).weaponType === kind),
      "Missing weapon type " + kind,
    );
  for (const id of pool.slots[14]) assert(![5, 6, 7, 9].includes(items.get(id).weaponType));
  for (const id of pool.slots[15]) assert([5, 7].includes(items.get(id).weaponType));
  assert(pool.slots[15].some((id) => items.get(id).weaponType === 5));
  assert(pool.slots[15].some((id) => items.get(id).weaponType === 7));
  const oneHand = items.get(fixture.seed.items[14].id),
    source = sources.get(oneHand.id);
  for (const weaponType of [6, 9])
    assert.equal(eligibleShamanHealingItem({ ...oneHand, weaponType }, source, context, 14), false);
  assert.equal(eligibleShamanHealingItem({ ...oneHand, handType: 3 }, source, context, 14), false);
});

test("Shaman armor and totem ownership are class-correct", () => {
  for (const armorType of [1, 2, 3])
    assert(pool.slots[0].some((id) => items.get(id).armorType === armorType));
  assert(!pool.slots[0].some((id) => items.get(id).armorType === 4));
  assert(pool.slots[16].every((id) => items.get(id).rangedWeaponType === 7));
  const totem = items.get(pool.slots[16][0]),
    source = sources.get(totem.id);
  for (const rangedWeaponType of [4, 5, 8])
    assert.equal(
      eligibleShamanHealingItem({ ...totem, rangedWeaponType }, source, context, 16),
      false,
    );
  assert.equal(
    eligibleShamanHealingItem({ ...totem, classAllowlist: [4] }, source, context, 16),
    false,
  );
});

test("raid materials and unadmitted upgrade rewards cannot enter the candidate pool", () => {
  for (const id of [19682, 19999, 19687]) {
    assert.equal(sources.get(id).craftAudit.status, "raid-dependent");
    for (let slot = 0; slot < 17; slot++)
      assert.equal(eligibleShamanHealingItem(items.get(id), sources.get(id), context, slot), false);
  }
  for (const id of [22095, 22096, 22097, 22098, 22099, 22100, 22101, 22102]) {
    assert.deepEqual(sources.get(id).sources, []);
    assert(!pool.slots.flat().includes(id));
  }
  const item = items.get(fixture.seed.items[14].id),
    source = sources.get(item.id);
  for (const changed of [
    undefined,
    { ...source, requiredLevel: 61 },
    { ...source, requiredLevel: undefined },
    { ...source, requiredAbility: 1 },
    { ...source, sources: [{ kind: "dungeon", zoneId: 3429 }] },
  ])
    assert.equal(eligibleShamanHealingItem(item, changed, context, 14), false);
});

test("faction profession and whole-loadout ownership restrictions survive the weapon-style override", () => {
  const item = items.get(fixture.seed.items[14].id),
    source = sources.get(item.id);
  assert.equal(
    eligibleShamanHealingItem({ ...item, factionRestriction: 1 }, source, context, 14),
    false,
  );
  assert.equal(
    eligibleShamanHealingItem({ ...item, requiredProfession: 1 }, source, context, 14),
    false,
  );
  assert(
    eligibleShamanHealingItem(
      { ...item, requiredProfession: 1 },
      source,
      { ...context, professions: [1, 4] },
      14,
    ),
  );
  assert.equal(
    eligibleShamanHealingItem(item, { ...source, raceMasks: [1, 0] }, context, 14),
    false,
  );
  const gear = structuredClone(fixture.seed),
    changedItems = new Map(items);
  const ring = items.get(gear.items[10].id);
  changedItems.set(ring.id, { ...ring, unique: true });
  gear.items[11] = { id: ring.id };
  assert.equal(legalShamanHealingGear(gear, changedItems, sources, context), false);
  assert.throws(() =>
    collectShamanHealingEquipment(items, sources, { ...context, playerClass: 4 }),
  );
});

test("complete hand Cartesian alternatives preserve two-hand and empty-offhand legality", () => {
  const pairs = [...shamanHealingHandCandidates(pool, items)];
  const two = pool.slots[14].filter((id) => items.get(id).handType === 4),
    one = pool.slots[14].filter((id) => items.get(id).handType !== 4);
  assert.equal(pairs.length, two.length + one.length * (pool.slots[15].length + 1));
  assert.equal(new Set(pairs.map((pair) => `${pair.mainHand}/${pair.offHand}`)).size, pairs.length);
  for (const pair of pairs) {
    const gear = structuredClone(fixture.seed);
    gear.items[14] = { id: pair.mainHand };
    gear.items[15] = { id: pair.offHand };
    assert(legalShamanHealingGear(gear, items, sources, context));
  }
  const gear = structuredClone(fixture.seed);
  gear.items[14] = { id: two[0] };
  gear.items[15] = { id: pool.slots[15][0] };
  assert.equal(legalShamanHealingGear(gear, items, sources, context), false);
  gear.items[15] = { id: 0 };
  assert(legalShamanHealingGear(gear, items, sources, context));
  gear.items[15].enchant = 1;
  assert.equal(legalShamanHealingGear(gear, items, sources, context), false);
});
