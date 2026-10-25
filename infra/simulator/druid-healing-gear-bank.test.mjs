import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { druidHealingGearCandidates } from "./druid-healing-gear-bank.mjs";
import {
  collectDruidHealingEquipment,
  druidHealingHandCandidates,
  legalDruidHealingGear,
} from "./druid-healing-equipment.mjs";
import { prebisEnchantFits } from "./prebis-enchants.mjs";

function fixture(name, hash) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "druid-healing-gear-bank-source.v1.json.gz",
    "444cc59f2fc397ab10d9380c201baa59cb561ab08f7b0553f7a18730d716169f",
  ),
  inspection = fixture(
    "druid-healing-enchants-source.v1.json.gz",
    "9d6425e608685a4d78d70c0db0dd827a2d2fcc93f511adee659166032e2c9e2e",
  ),
  items = new Map(source.items.map((row) => [row.id, row])),
  sources = new Map(source.sources.map((row) => [row.id, row])),
  context = {
    ...source.context,
    currentIds: new Set(),
    originalItems: source.seed.items.map((row) => items.get(row.id)),
  },
  pool = collectDruidHealingEquipment(items, sources, context),
  bank = {
    gear: source.seed,
    items,
    sources,
    context,
    pool,
    inspection,
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
  };

test("every eligible Druid single slot is tested without item quality or stat pruning", () => {
  assert.deepEqual(pool, source.pool);
  assert.equal(pool.totalDistinctCandidates, 1460);
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16]) {
    const rows = [...druidHealingGearCandidates({ ...bank, group: "slot-" + slot })];
    assert.deepEqual(
      rows.map((row) => row.gear.items[slot].id).sort((a, b) => a - b),
      pool.slots[slot],
    );
    assert(rows.every((row) => legalDruidHealingGear(row.gear, items, sources, context)));
  }
});

test("paired hands cover every legal two-hand, one-hand and held-item configuration", () => {
  const rows = [...druidHealingGearCandidates({ ...bank, group: "hands" })],
    expected = [...druidHealingHandCandidates(pool, items)].filter((pair) => {
      const gear = structuredClone(source.seed);
      gear.items[14] = { id: pair.mainHand };
      gear.items[15] = { id: pair.offHand };
      return legalDruidHealingGear(gear, items, sources, context);
    });
  assert.equal(rows.length, expected.length);
  assert(rows.some((row) => items.get(row.gear.items[14].id).handType === 4));
  assert(rows.some((row) => row.gear.items[15].id));
  assert(
    rows.every((row) => !row.gear.items[15].id || items.get(row.gear.items[14].id).handType !== 4),
  );
});

test("both jewelry orders are included and actual uniqueness constraints are enforced", () => {
  for (const [left, right, group] of [
    [10, 11, "rings"],
    [12, 13, "trinkets"],
  ]) {
    const rows = [...druidHealingGearCandidates({ ...bank, group })];
    let expected = 0;
    for (const first of pool.slots[left])
      for (const second of pool.slots[right]) {
        const gear = structuredClone(source.seed);
        gear.items[left] = { id: first };
        gear.items[right] = { id: second };
        if (legalDruidHealingGear(gear, items, sources, context)) expected++;
      }
    assert.equal(rows.length, expected);
    const pairs = new Set(
      rows.map((row) => row.gear.items[left].id + ":" + row.gear.items[right].id),
    );
    for (const pair of pairs) assert(pairs.has(pair.split(":").reverse().join(":")));
    assert(rows.every((row) => legalDruidHealingGear(row.gear, items, sources, context)));
  }
});

test("set exploration crosses every Wildheart threshold with all multi-piece subsets", () => {
  const rows = [...druidHealingGearCandidates({ ...bank, group: "set-185" })],
    counts = new Set(
      rows.map((row) => row.gear.items.filter((spec) => items.get(spec.id)?.setId === 185).length),
    );
  assert.equal(rows.length, 2 ** 8 - 8 - 1);
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5, 6, 7, 8]);
  assert(rows.every((row) => legalDruidHealingGear(row.gear, items, sources, context)));
});

test("enchant banks use Druid restrictions, preserve input and reject unreviewed seed enchants", () => {
  const gear = structuredClone(source.seed),
    before = JSON.stringify(gear),
    rows = [...druidHealingGearCandidates({ ...bank, gear, group: "enchant-14" })],
    expected = new Set([0]);
  for (const enchant of Object.values(inspection.enchants))
    if (prebisEnchantFits(enchant, items.get(gear.items[14].id), 1, 14, bank.enchantPolicy))
      expected.add(enchant.effectId);
  assert.deepEqual(new Set(rows.map((row) => row.gear.items[14].enchant ?? 0)), expected);
  assert(expected.has(2567));
  assert.equal(JSON.stringify(gear), before);
  gear.items[14].enchant = 99999999;
  assert.throws(
    () => [...druidHealingGearCandidates({ ...bank, gear, group: "hands" })],
    /Unreviewed seed enchant/,
  );
});
