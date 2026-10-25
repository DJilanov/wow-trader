import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { recoverPaladinCurrentItems } from "./paladin-current-items.mjs";

const fixture = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/paladin-current-items-source.v2.json.gz", import.meta.url)),
  ),
);
const shared = JSON.parse(
  gunzipSync(
    await readFile(new URL("./fixtures/druid-current-items-source.v1.json.gz", import.meta.url)),
  ),
);
const parent = { items: [...fixture.items, shared.observedWeapon] };
const sources = [...fixture.sources, shared.sources[0]];

test("Paladin recovery restores the additional current heals and preserves observed vendor stats", () => {
  const input = structuredClone(parent),
    sourceInput = structuredClone(sources);
  const result = recoverPaladinCurrentItems(input, sourceInput, fixture);
  assert.equal(result.changes.length, 11);
  assert.equal(result.explicitDifferencesBefore, 16);
  assert.equal(result.explicitDifferencesAfter, 0);
  for (const [id, healing] of [
    [6641, 33],
    [6905, 24],
    [9522, 10],
    [272107, 37],
  ])
    assert.equal(result.db.items.find((row) => row.id === id).stats[41], healing);
  assert.deepEqual(
    result.db.items.find((row) => row.id === 272681),
    shared.observedWeapon,
  );
  assert.equal(result.db.items.find((row) => row.id === 6630).stats[3], 5);
  assert.equal(result.db.items.find((row) => row.id === 5196).stats[4], 3);
  assert.equal(result.publicationAllowed, false);
  assert.equal(result.numericalReuseAllowed, false);
  assert.deepEqual(input, parent);
  assert.deepEqual(sourceInput, sources);
});

test("Paladin recovery keeps acquisition and unrelated rows while recording changed fields", () => {
  const result = recoverPaladinCurrentItems(parent, sources, fixture);
  for (const source of fixture.sources) {
    const next = result.sources.find((row) => row.id === source.id);
    assert.deepEqual(next.sources, source.sources);
    assert.equal(next.statReview.historicalAcquisitionPreserved, true);
  }
  assert.deepEqual(result.sources.at(-1), sources.at(-1));
  for (const change of result.changes)
    assert(change.fields.every((field) => ["stats", "quality", "weaponDamageMin"].includes(field)));
  assert.throws(() => recoverPaladinCurrentItems(result.db, result.sources, fixture));
});

test("Paladin recovery rejects new effects, altered metadata, missing evidence and changed diagnostics", () => {
  for (const change of [
    (f) => {
      f.normalized.items[0].effectIds = [1];
    },
    (f) => {
      f.normalized.items[0].requiredLevel = 61;
      f.itemSparse[0].RequiredLevel = 61;
    },
    (f) => {
      f.itemSparse.pop();
    },
    (f) => {
      f.diagnostic.pop();
    },
    (f) => {
      f.items[0].name = "Changed control identity";
    },
    (f) => {
      f.sources[0].sources = [];
    },
  ]) {
    const copy = structuredClone(fixture);
    change(copy);
    assert.throws(() => recoverPaladinCurrentItems(parent, sources, copy));
  }
});
