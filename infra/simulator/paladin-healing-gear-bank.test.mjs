import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { paladinHealingGearCandidates } from "./paladin-healing-gear-bank.mjs";
import {
  collectPaladinHealingEquipment,
  paladinHealingHandCandidates,
  legalPaladinHealingGear,
} from "./paladin-healing-equipment.mjs";
import { prebisEnchantFits } from "./prebis-enchants.mjs";

function fixture(name, hash) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "paladin-healing-gear-bank-source.v1.json.gz",
    "3bea5f62572d9ef4e28963e947cdfbf21cf6c732634ea07f439d45bb28ea857e",
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
  pool = collectPaladinHealingEquipment(items, sources, context),
  bank = {
    gear: source.seed,
    items,
    sources,
    context,
    pool,
    inspection,
    enchantPolicy: { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [] },
  };

test("every eligible Paladin single slot is tested without item quality or stat pruning", () => {
  assert.equal(pool.statPruning, false);
  assert(pool.totalDistinctCandidates > 20);
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16]) {
    const rows = [...paladinHealingGearCandidates({ ...bank, group: "slot-" + slot })];
    assert.deepEqual(
      rows.map((row) => row.gear.items[slot].id).sort((a, b) => a - b),
      pool.slots[slot],
    );
    assert(rows.every((row) => legalPaladinHealingGear(row.gear, items, sources, context)));
  }
});

test("paired hands cover every legal two-hand, one-hand and held-item configuration", () => {
  const rows = [...paladinHealingGearCandidates({ ...bank, group: "hands" })],
    expected = [...paladinHealingHandCandidates(pool, items)].filter((pair) => {
      const gear = structuredClone(source.seed);
      gear.items[14] = { id: pair.mainHand };
      gear.items[15] = { id: pair.offHand };
      return legalPaladinHealingGear(gear, items, sources, context);
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
    const rows = [...paladinHealingGearCandidates({ ...bank, group })];
    let expected = 0;
    for (const first of pool.slots[left])
      for (const second of pool.slots[right]) {
        const gear = structuredClone(source.seed);
        gear.items[left] = { id: first };
        gear.items[right] = { id: second };
        if (legalPaladinHealingGear(gear, items, sources, context)) expected++;
      }
    assert.equal(rows.length, expected);
    const pairs = new Set(
      rows.map((row) => row.gear.items[left].id + ":" + row.gear.items[right].id),
    );
    for (const pair of pairs) assert(pairs.has(pair.split(":").reverse().join(":")));
    assert(rows.every((row) => legalPaladinHealingGear(row.gear, items, sources, context)));
  }
});

test("set exploration crosses every Soulforge threshold with all multi-piece subsets", () => {
  const plain = structuredClone(source.seed);
  const replacements = [3836, 2264, 1489, 1974, 1944, 2851, 1929, 2037];
  for (const [i, slot] of [0, 2, 4, 5, 6, 7, 8, 9].entries())
    plain.items[slot] = { id: replacements[i] };
  assert(legalPaladinHealingGear(plain, items, sources, context));
  const rows = [...paladinHealingGearCandidates({ ...bank, gear: plain, group: "set-516" })],
    counts = new Set(
      rows.map((row) => row.gear.items.filter((spec) => items.get(spec.id)?.setId === 516).length),
    );
  assert.equal(rows.length, 2 ** 8 - 8 - 1);
  assert.deepEqual([...counts].sort(), [2, 3, 4, 5, 6, 7, 8]);
  assert(rows.every((row) => legalPaladinHealingGear(row.gear, items, sources, context)));
});

test("enchant banks use Paladin restrictions, preserve input and reject unreviewed seed enchants", () => {
  const gear = structuredClone(source.seed),
    before = JSON.stringify(gear),
    rows = [...paladinHealingGearCandidates({ ...bank, gear, group: "enchant-14" })],
    expected = new Set([0]);
  for (const enchant of Object.values(inspection.enchants))
    if (prebisEnchantFits(enchant, items.get(gear.items[14].id), 4, 14, bank.enchantPolicy))
      expected.add(enchant.effectId);
  assert.deepEqual(new Set(rows.map((row) => row.gear.items[14].enchant ?? 0)), expected);
  assert(expected.has(2567));
  assert.equal(JSON.stringify(gear), before);
  gear.items[14].enchant = 99999999;
  assert.throws(
    () => [...paladinHealingGearCandidates({ ...bank, gear, group: "hands" })],
    /Unreviewed seed enchant/,
  );
});
