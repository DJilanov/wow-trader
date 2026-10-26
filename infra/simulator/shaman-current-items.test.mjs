import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  recoverShamanCurrentItems,
  reviewShamanCurrentItemStats,
  renderShamanCurrentItemTests,
} from "./shaman-current-items.mjs";

const bytes = readFileSync(
  new URL("fixtures/shaman-current-equipment-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "b3f170ed1346d92e650fae177c28ee6a139acff509dd81756d229acaa06800c2",
);
const evidence = JSON.parse(gunzipSync(bytes));

test("six explicit stat cells change while every other field and acquisition survives", () => {
  const parent = { items: evidence.items, enchants: [{ id: 1 }] },
    sources = evidence.sources,
    before = structuredClone({ parent, sources, evidence });
  const result = recoverShamanCurrentItems(parent, sources, evidence);
  assert.equal(result.changes.length, 6);
  assert.deepEqual(result.addedIds, []);
  assert.equal(result.numericalReuseAllowed, false);
  assert.deepEqual({ parent, sources, evidence }, before);
  assert.deepEqual(result.db.enchants, parent.enchants);
  for (let index = 0; index < parent.items.length; index++) {
    const row = result.review.corrections.find((row) => row.id === parent.items[index].id),
      expected = structuredClone(parent.items[index]);
    if (row) expected.stats[row.engineStat] = row.after;
    assert.deepEqual(result.db.items[index], expected);
  }
  for (let index = 0; index < sources.length; index++) {
    const original = structuredClone(sources[index]),
      changed = structuredClone(result.sources[index]);
    delete original.statReview;
    delete changed.statReview;
    assert.deepEqual(changed, original);
  }
  result.db.items[0].stats[0] += 1;
  assert.deepEqual({ parent, sources, evidence }, before);
});

test("absent current channels remain intact and recovery cannot be replayed on changed inputs", () => {
  const parent = { items: structuredClone(evidence.items) },
    sources = structuredClone(evidence.sources);
  const id = 272603,
    item = parent.items.find((row) => row.id === id);
  assert.equal(
    evidence.currentItems.find((row) => row.itemId === id).stats.some((row) => row.statType === 45),
    false,
  );
  const spellPower = item.stats[5];
  assert(spellPower > 0);
  const result = recoverShamanCurrentItems(parent, sources, evidence);
  assert.equal(result.db.items.find((row) => row.id === id).stats[5], spellPower);
  assert.throws(() => recoverShamanCurrentItems(result.db, result.sources, evidence));
  parent.items = parent.items.filter((row) => row.id !== 1936);
  assert.throws(() => recoverShamanCurrentItems(parent, sources, evidence));
});

test("source mapping diagnostics payloads and effect additions require new review", () => {
  for (const change of [
    (source) =>
      (source.engineStats = source.engineStats.replace("\tShadowPower\n", "\tUnexpectedPower\n")),
    (source) => (source.normalizer = source.normalizer.replace("88: 11,", "88: 10,")),
    (source) => (source.diagnostic[0].current += 1),
    (source) =>
      source.currentItems
        .find((row) => row.itemId === 1936)
        .stats.push({ statType: 5, value: 100 }),
    (source) => source.currentItems.find((row) => row.itemId === 1936).effectIds.push(1),
    (source) => source.tables.ItemXItemEffect.push({ ItemID: 1936, ItemEffectID: 1 }),
    (source) => source.changedIds.reverse(),
    (source) => (source.publicationAllowed = true),
  ]) {
    const altered = structuredClone(evidence);
    change(altered);
    assert.throws(() => reviewShamanCurrentItemStats(altered));
  }
});

test("native regression source uses the validated engine stat identities", () => {
  const implementation = readFileSync(
      new URL("shaman-current-items_test.go", import.meta.url),
      "utf8",
    ),
    rendered = renderShamanCurrentItemTests(implementation, evidence);
  assert(rendered.includes("{1484,stats.ShadowPower,0,27}"));
  assert(rendered.includes("{272603,stats.SpellPenetration,0,5}"));
  assert.throws(() => renderShamanCurrentItemTests(rendered, evidence));
});
