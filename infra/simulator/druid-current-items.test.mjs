import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  auditDruidCurrentStats,
  extractDruidCurrentItemReview,
  recoverDruidCurrentItems,
} from "./druid-current-items.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-current-items-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "94cf580c6a4cfc65640da7d9ca4d6e161c76d7ded603396cc9a11233a85b4d4f",
);
const source = JSON.parse(gunzipSync(bytes));
function parent() {
  return {
    items: [...structuredClone(source.items), structuredClone(source.observedWeapon)],
    enchants: [{ effectId: 999, stats: [1] }],
  };
}

test("current item review excludes only authenticated non-healing effects and damage-only modifier", () => {
  const review = extractDruidCurrentItemReview(source);
  assert.deepEqual(
    review.effectReviews.map((row) => row.id),
    [5197, 7720, 9414],
  );
  assert.equal(review.excludedModifier.statType, 136);
  assert.equal(review.negativeStat.value, -11);
  assert.equal(review.publicationAllowed, false);
});

test("reconciliation fixes all 27 reviewed records and preserves unrelated data and source ownership", () => {
  const original = parent(),
    sources = structuredClone(source.sources),
    before = JSON.stringify([original, sources]);
  const result = recoverDruidCurrentItems(original, sources, source),
    items = new Map(result.db.items.map((row) => [row.id, row]));
  assert.equal(result.changes.length, 27);
  assert.deepEqual(
    auditDruidCurrentStats(result.db, source.normalized.items, source.reviewedIds),
    [],
  );
  assert.equal(items.get(6695).stats[5], 5);
  assert.equal(items.get(4746).stats[2], -11);
  assert.equal(items.get(4746).quality, 2);
  assert.equal(items.get(4746).stats[26], 55);
  assert.equal(items.get(5197).stats[0], 0);
  assert.equal(items.get(5197).stats[4], 4);
  assert.equal(items.get(5197).weaponDamageMin, 28);
  assert.equal(items.get(20069).ilvl, 60);
  assert.equal(items.get(20069).weaponDamageMin, 154);
  assert.equal(items.get(20069).weaponDamageMax, 231);
  assert.deepEqual(items.get(272681), source.observedWeapon);
  assert.deepEqual(result.db.enchants, original.enchants);
  for (const row of result.sources) {
    const previous = sources.find((item) => item.id === row.id);
    assert.deepEqual(row.sources, previous.sources);
    assert.equal(
      row.requiredLevel,
      source.normalized.items.find((item) => item.itemId === row.id).requiredLevel,
    );
  }
  assert.equal(JSON.stringify([original, sources]), before);
  assert.equal(result.numericalReuseAllowed, false);
});

test("changed effect scope, unreviewed modifiers and new flat stat payloads reject reconciliation", () => {
  for (const mutate of [
    (row) => {
      row.healingScope.offensiveAttacks = true;
    },
    (row) => {
      row.tables.SpellEffect[0].EffectAura = 29;
    },
    (row) => {
      row.tables.ItemEffect[0].ChrSpecializationID = 1;
    },
    (row) => {
      row.normalized.items
        .find((row) => row.itemId === 6695)
        .stats.find((row) => row.statType === 136).value = 99;
    },
    (row) => {
      row.tables.ItemSparse.pop();
    },
  ]) {
    const changed = structuredClone(source);
    mutate(changed);
    assert.throws(() => recoverDruidCurrentItems(parent(), source.sources, changed));
  }
});

test("repeated amendments and altered parent records cannot reuse the recovery identity", () => {
  const initial = parent(),
    result = recoverDruidCurrentItems(initial, source.sources, source);
  assert.throws(() => recoverDruidCurrentItems(result.db, result.sources, source));
  initial.items.find((row) => row.id === 6695).stats[5] = 500;
  assert.throws(() => recoverDruidCurrentItems(initial, source.sources, source));
});
