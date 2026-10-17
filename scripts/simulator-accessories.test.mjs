import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessorySnapshot,
  normalizeVerifiedAccessories,
} from "../infra/simulator/verified-accessories.mjs";

function fixture() {
  return {
    snapshot: {
      schema: "forever-client-mechanics.v1",
      clientVersion: accessorySnapshot.clientVersion,
      items: [
        [19325, "Don Julio's Band", 4],
        [13001, "Maiden's Circle", 3],
        [271908, "Theramore Signet", 3],
        [272064, "Insurgent's Band", 3],
      ].map(([itemId, name, quality]) => ({
        itemId,
        name,
        quality,
        itemLevel: 60,
        requiredLevel: 55,
        inventoryType: 11,
        classId: 4,
        armor: 0,
        issues: [],
        effectIds: [],
        stats: [
          { statType: 7, value: 10 },
          { statType: 31, value: 10 },
          { statType: 32, value: 14 },
          { statType: 38, value: 14 },
        ],
      })),
    },
    planner: Object.fromEntries(
      [19325, 13001, 271908, 272064].map((id) => [id, { icon: "inv_jewelry_ring_28" }]),
    ),
  };
}

test("reviewed client rings use current stats and convert ratings once, with faction-specific BG equivalents", () => {
  const f = fixture();
  const items = normalizeVerifiedAccessories(f.snapshot, f.planner);
  assert.deepEqual(
    items.map((item) => item.factionRestriction),
    [0, 0, 1, 2],
  );
  for (const item of items) {
    assert.equal(item.stats[18], 1);
    assert.equal(item.stats[19], 1);
    assert.equal(item.stats[17], 14);
    assert.equal(item.stats[27], 14, "generic attack power also applies to ranged attacks");
    assert.equal(item.stats[2], 10);
    assert.equal(item.stats[13], 0, "generic hit is not counted a second time as spell hit");
  }
});

test("missing, unresolved or unreviewed client accessory data fails closed without Classic fallback", () => {
  for (const corrupt of [
    (f) => {
      f.snapshot.clientVersion = "Classic";
    },
    (f) => {
      f.snapshot.items.pop();
    },
    (f) => {
      f.snapshot.items[0].issues = ["unresolved"];
    },
    (f) => {
      f.snapshot.items[0].stats[0].statType = 999;
    },
    (f) => {
      f.snapshot.items[0].effectIds = [123];
    },
    (f) => {
      f.planner[19325].icon = "../bad";
    },
  ]) {
    const f = fixture();
    corrupt(f);
    assert.throws(
      () => normalizeVerifiedAccessories(f.snapshot, f.planner),
      /Unreviewed|Unresolved|Unmapped/,
    );
  }
});

test("Maiden's Circle uses the extracted Forever spell power, intellect and spirit", () => {
  const f = fixture();
  delete f.planner[13001];
  f.snapshot.items.find((item) => item.itemId === 13001).stats = [
    { statType: 45, value: 18 },
    { statType: 5, value: 7 },
    { statType: 6, value: 6 },
  ];
  const item = normalizeVerifiedAccessories(f.snapshot, f.planner).find(
    (item) => item.id === 13001,
  );
  assert.equal(item.stats[5], 18);
  assert.equal(item.stats[3], 7);
  assert.equal(item.stats[4], 6);
  assert.equal(item.factionRestriction, 0);
  assert.equal(item.icon, "inv_jewelry_ring_12");
});
