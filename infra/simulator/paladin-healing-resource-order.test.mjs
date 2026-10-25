import assert from "node:assert/strict";
import test from "node:test";
import {
  orderPaladinHealingResources,
  paladinHealingResourceOrders,
} from "./paladin-healing-resource-order.mjs";

const source = [
  { itemId: 13444, minimumMissingMana: 3000 },
  { itemId: 12662, minimumMissingMana: 1500 },
  { spellId: 1302205 },
  { itemId: 4381, targetRaidIndex: 0 },
  { itemId: 18637, minimumMissingMana: 1500 },
];
test("resource order changes precedence while preserving every owned action and condition", () => {
  const before = structuredClone(source);
  for (const policy of paladinHealingResourceOrders) {
    const result = orderPaladinHealingResources(source, policy);
    assert.deepEqual(
      result.map((row) => JSON.stringify(row)).sort(),
      source.map((row) => JSON.stringify(row)).sort(),
    );
    assert.deepEqual(source, before);
    assert.notEqual(result[0], source[0]);
  }
  assert.deepEqual(orderPaladinHealingResources(source, "as-declared"), source);
  assert.deepEqual(
    orderPaladinHealingResources(source, "recomb-first")
      .slice(0, 2)
      .map((row) => row.itemId),
    [4381, 18637],
  );
  assert.deepEqual(
    orderPaladinHealingResources(source, "major-recomb-first")
      .slice(0, 2)
      .map((row) => row.itemId),
    [18637, 4381],
  );
  assert.equal(orderPaladinHealingResources(source, "rune-last").at(-1).itemId, 12662);
});
test("absent resource items stay absent and unknown policies fail", () => {
  for (const policy of paladinHealingResourceOrders)
    assert.deepEqual(orderPaladinHealingResources([{ spellId: 15604 }], policy), [
      { spellId: 15604 },
    ]);
  assert.throws(() => orderPaladinHealingResources(source, "extra-rune"));
});
