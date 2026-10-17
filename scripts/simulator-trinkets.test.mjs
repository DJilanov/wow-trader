import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import {
  defaultTrinketProfiles,
  selectDefaultTrinkets,
} from "../infra/simulator/default-trinkets.mjs";
import { defaultEnchantProfiles } from "../infra/simulator/default-enchants.mjs";
import { selectDefaultRings } from "../infra/simulator/default-rings.mjs";

test("Classic accessory identities stay in the review work list, not a silent stat fallback", async () => {
  const worklist = JSON.parse(
    await readFile(new URL("../infra/simulator/classic-accessory-worklist.json", import.meta.url)),
  );
  assert.equal(worklist.simulationInput, false);
  assert.equal(new Set(worklist.items.map((item) => item.id)).size, worklist.items.length);
  for (const id of [11815, 13965, 12930, 13968, 13098, 18500, 21563])
    assert(worklist.items.some((item) => item.id === id));
  assert(worklist.items.some((item) => item.slot === "ring"));
  assert(worklist.items.every((item) => !Object.hasOwn(item, "stats")));
  assert(worklist.referenceSource.includes("7779ebbf79dc7f1341e6ab939b28a3402c9a730a"));
});

test("DPS rings use current caster/physical stats; tank faction rings stay unchanged", () => {
  const stats = (index, value) => Array.from({ length: 44 }, (_, i) => (i === index ? value : 0));
  const items = [
    { id: 19325, name: "Don Julio's Band", type: 11, stats: stats(18, 1) },
    { id: 13001, name: "Maiden's Circle", type: 11, stats: stats(5, 18) },
    { id: 272406, name: "Channeler's Ring", type: 11, stats: stats(3, 14) },
    { id: 272408, name: "Cutthroat's Signet", type: 11, stats: stats(1, 14) },
  ];
  const db = { items };
  const catalog = {
    items: items.map((item) => ({ id: item.id, requiredLevel: 60, sources: [{ kind: "vendor" }] })),
  };
  const gear = { items: Array.from({ length: 17 }, () => ({})) };
  for (const [profile, definition] of Object.entries(defaultEnchantProfiles)) {
    const result = selectDefaultRings(gear, profile, definition.playerClass, db, catalog);
    if (profile.includes("tank") || profile === "protection_paladin")
      assert.deepEqual(result.gear, gear);
    else
      assert.deepEqual(
        result.gear.items.slice(10, 12).map((item) => item.id),
        defaultTrinketProfiles[profile].role === "caster" ? [13001, 272406] : [19325, 272408],
      );
  }
  items[1].stats[5] = 19;
  assert.throws(() => selectDefaultRings(gear, "warlock", 8, db, catalog), /Unverified/);
});

function fixture() {
  const definitions = [
    [272437, "Adaptive Combat Assistant", 22, 2],
    [249469, "Frozen Heart of the Mountain", 18, 0.9],
    [249470, "Molten Heart of the Mountain", 36, 7],
    [272438, "Weakness Analyzer", 5, 22],
    [272440, "Defender's Grip Stabilizer", 28, 13],
    [1490, "Guardian Talisman", 2, 9],
  ];
  const items = definitions.map(([id, name, stat, value]) => ({
    id,
    name,
    type: 12,
    stats: Array.from({ length: 44 }, (_, index) => (index === stat ? value : 0)),
  }));
  return {
    gear: { items: Array.from({ length: 17 }, (_, index) => ({ id: index + 1 })) },
    db: { items },
    catalog: {
      items: items.map((item) => ({
        id: item.id,
        requiredLevel: 60,
        limitCategory: item.id >= 272437 ? 707 : 0,
        sources: [{ kind: "dungeon" }],
      })),
    },
  };
}

test("all 28 supplied lists receive audited role-appropriate pre-raid pairs", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input);
  assert.deepEqual(
    Object.keys(defaultTrinketProfiles).sort(),
    Object.keys(defaultEnchantProfiles).sort(),
  );
  let count = 0;
  for (const [profile, definition] of Object.entries(defaultEnchantProfiles)) {
    for (const variant of definition.variants ??
      (profile === "protection_paladin" ? ["alliance"] : ["alliance", "horde"])) {
      const result = selectDefaultTrinkets(
        input.gear,
        profile,
        definition.playerClass,
        input.db,
        input.catalog,
      );
      assert.deepEqual(
        result.gear.items.slice(12, 14).map((item) => item.id),
        defaultTrinketProfiles[profile].ids,
        variant,
      );
      assert.equal(result.choices.length, 2);
      result.gear.items.forEach((item, index) => {
        if (![12, 13].includes(index)) assert.deepEqual(item, input.gear.items[index]);
      });
      if (result.role === "caster") {
        assert.equal(result.choices[0].stats[5], 22);
        assert.equal(result.choices[1].stats[18], 0.9);
        assert(result.choices[1].note.includes("including spells"));
        assert(!result.choices.some((item) => item.itemId === 249470));
      }
      if (profile === "hunter") assert(!result.choices.some((item) => item.itemId === 272437));
      if (profile === "protection_paladin")
        assert.deepEqual(
          result.choices.map((item) => item.itemId),
          [272440, 1490],
        );
      count++;
    }
  }
  assert.equal(count, 28);
  assert.deepEqual(input, before);
});

test("missing or changed evidence, raid loot, profession, faction and unique conflicts fail closed", () => {
  for (const corrupt of [
    (input) => input.db.items.pop(),
    (input) => {
      input.db.items[0].stats[22] = 0;
    },
    (input) => {
      input.db.items[0].requiredProfession = 4;
    },
    (input) => {
      input.db.items[0].factionRestriction = 2;
    },
    (input) => {
      input.db.items[0].classAllowlist = [8];
    },
    (input) => {
      input.catalog.items[0].requiredLevel = 61;
    },
    (input) => {
      input.catalog.items[0].sources = [{ kind: "raid" }];
    },
    (input) => {
      input.catalog.items[0].sources = [];
    },
    (input) => {
      input.catalog.items[0].limitCategory = 707;
      input.catalog.items[1].limitCategory = 707;
    },
  ]) {
    const input = fixture();
    corrupt(input);
    const profile = input.db.items.some((item) => item.id === 1490)
      ? "warrior"
      : "protection_paladin";
    assert.throws(
      () => selectDefaultTrinkets(input.gear, profile, 9, input.db, input.catalog),
      /Unverified|conflict/,
    );
  }
});
