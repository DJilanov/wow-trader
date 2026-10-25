import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  collectDruidHealingEquipment,
  eligibleDruidHealingItem,
  legalDruidHealingGear,
  druidHealingHandCandidates,
} from "./druid-healing-equipment.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-equipment-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "dc4719caea7b7b5288d087c67196aa538526986a5aefbc3438b1f5351450c28c",
);
const fixture = JSON.parse(gunzipSync(bytes)),
  items = new Map(fixture.items.map((row) => [row.id, row])),
  sources = new Map(fixture.sources.map((row) => [row.id, row])),
  context = {
    ...fixture.context,
    currentIds: new Set(),
    originalItems: fixture.seed.items.map((row) => items.get(row.id)),
  },
  pool = collectDruidHealingEquipment(items, sources, context);

test("Druid pool covers all 17 slots and idols without stat or quality pruning", () => {
  assert.equal(fixture.selectedRowsAreSourceSubsets, true);
  assert.equal(pool.slots.length, 17);
  assert(pool.slots.every((row) => row.length > 0));
  assert(pool.slots[14].includes(2848));
  assert(pool.slots[12].includes(1490));
  assert(pool.slots[16].includes(22398));
  assert.equal(pool.statPruning, false);
  assert.equal(pool.qualityPruning, false);
  assert.equal(pool.weaponStyleLocked, false);
  assert.equal(pool.publicationAllowed, false);
  assert.equal(fixture.seedPurpose, "equipment-legality-control-only");
});
test("Druid hands include two-hand maces, polearms, staves, daggers and fists", () => {
  for (const id of [1976, 5200, 1155, 13964])
    assert(eligibleDruidHealingItem(items.get(id), sources.get(id), context, 14), String(id));
  const fist = fixture.items.find((row) => row.weaponType === 3);
  assert(fist);
  assert(eligibleDruidHealingItem(fist, sources.get(fist.id), context, 14));
  for (const id of [12602, 6341])
    assert.equal(eligibleDruidHealingItem(items.get(id), sources.get(id), context, 14), false);
  assert.equal(eligibleDruidHealingItem(items.get(13938), sources.get(13938), context, 16), false);
  assert.equal(eligibleDruidHealingItem(items.get(1936), sources.get(1936), context, 15), false);
});
test("whole loadouts enforce paired hands and do not allow enchanting an empty off-hand", () => {
  const gear = JSON.parse(JSON.stringify(fixture.seed));
  assert(legalDruidHealingGear(gear, items, sources, context));
  gear.items[14] = { id: 1976 };
  assert(legalDruidHealingGear(gear, items, sources, context));
  gear.items[15] = { id: 6341 };
  assert.equal(legalDruidHealingGear(gear, items, sources, context), false);
  gear.items[14] = { id: 13964 };
  assert(legalDruidHealingGear(gear, items, sources, context));
  gear.items[15] = { id: 0, enchant: 1 };
  assert.equal(legalDruidHealingGear(gear, items, sources, context), false);
});
test("raid-dependent recipes and known raid zones remain excluded", () => {
  for (const id of [19682, 19999, 19687]) {
    assert.equal(sources.get(id).craftAudit.status, "raid-dependent");
    const slot = { 19682: 4, 19999: 0, 19687: 8 }[id];
    assert.equal(eligibleDruidHealingItem(items.get(id), sources.get(id), context, slot), false);
  }
  const item = items.get(2816),
    source = sources.get(2816);
  assert.equal(
    eligibleDruidHealingItem(
      item,
      { ...source, sources: [{ kind: "dungeon", zoneId: 3429 }] },
      context,
      14,
    ),
    false,
  );
  assert.equal(eligibleDruidHealingItem(item, undefined, context, 14), false);
});
test("class, faction, profession and race restrictions survive the hand-style override", () => {
  const item = items.get(2816),
    source = sources.get(2816);
  assert.equal(
    eligibleDruidHealingItem({ ...item, classAllowlist: [5] }, source, context, 14),
    false,
  );
  assert.equal(
    eligibleDruidHealingItem({ ...item, factionRestriction: 2 }, source, context, 14),
    false,
  );
  assert.equal(
    eligibleDruidHealingItem({ ...item, requiredProfession: 1 }, source, context, 14),
    false,
  );
  assert(
    eligibleDruidHealingItem(
      { ...item, requiredProfession: 1 },
      source,
      { ...context, professions: [1, 4] },
      14,
    ),
  );
  assert.equal(
    eligibleDruidHealingItem(item, { ...source, raceMasks: [1, 0] }, context, 14),
    false,
  );
  assert(pool.slots[10].includes(271908));
  assert(!pool.slots[10].includes(272064));
});
test("hand enumeration includes every legal style and held-item alternative", () => {
  const pairs = [...druidHealingHandCandidates(pool, items)],
    twoHand = pool.slots[14].filter((id) => items.get(id).handType === 4),
    oneHand = pool.slots[14].filter((id) => items.get(id).handType !== 4);
  assert.equal(pairs.length, twoHand.length + oneHand.length * (pool.slots[15].length + 1));
  for (const pair of pairs) {
    const gear = JSON.parse(JSON.stringify(fixture.seed));
    gear.items[14] = { id: pair.mainHand };
    gear.items[15] = { id: pair.offHand };
    assert(legalDruidHealingGear(gear, items, sources, context));
  }
});
test("incomplete loadouts and other classes cannot enter the Druid domain", () => {
  assert.equal(legalDruidHealingGear({ items: [] }, items, sources, context), false);
  const gear = JSON.parse(JSON.stringify(fixture.seed));
  gear.items[16] = { id: 0 };
  assert.equal(legalDruidHealingGear(gear, items, sources, context), false);
  assert.throws(
    () => collectDruidHealingEquipment(items, sources, { ...context, playerClass: 5 }),
    /Druid-only/,
  );
  assert.throws(() =>
    collectDruidHealingEquipment(items, sources, { ...context, requireCraftAudit: false }),
  );
});
