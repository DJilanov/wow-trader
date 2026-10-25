import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { auditDruidStaticHealing, recoverDruidStaticHealing } from "./druid-static-healing.mjs";

const bytes = readFileSync(
  new URL("./fixtures/druid-static-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "84d9471696e0c7fd57cb573eb77b3eaba88cd95078c2e7e147fa7b8e23937851",
);
const evidence = JSON.parse(gunzipSync(bytes));
const parent = {
  items: [...evidence.items, evidence.observedWeapon],
  otherCatalogData: { preserved: true },
};

test("all six missing healing values are recovered while parent data and observed weapon stay intact", () => {
  const before = structuredClone(parent),
    output = recoverDruidStaticHealing(parent, evidence);
  assert.deepEqual(parent, before);
  assert.deepEqual(
    output.changes.map((row) => row.after),
    [11, 11, 11, 20, 24, 15],
  );
  assert.deepEqual(output.db.items.at(-1), evidence.observedWeapon);
  assert.deepEqual(output.db.otherCatalogData, parent.otherCatalogData);
  assert.equal(output.publicationAllowed, false);
  assert.equal(output.numericalReuseAllowed, false);
});
test("the reusable domain audit finds omissions and sees none after the reviewed correction", () => {
  assert.equal(
    auditDruidStaticHealing(parent, evidence.currentItems, evidence.reviewedIds).length,
    6,
  );
  assert.deepEqual(
    auditDruidStaticHealing(
      recoverDruidStaticHealing(parent, evidence).db,
      evidence.currentItems,
      evidence.reviewedIds,
    ),
    [],
  );
  assert.throws(() =>
    auditDruidStaticHealing({ items: [] }, evidence.currentItems, evidence.reviewedIds),
  );
});
test("nonzero healing, combined spell power, stale metadata and unknown effects cannot be overwritten", () => {
  for (const mutate of [
    (value) => {
      value.items[0].stats[41] = 1;
    },
    (value) => {
      value.items[0].stats[5] = 11;
    },
    (value) => {
      value.items[0].ilvl++;
    },
    (value) => {
      value.items.at(-1).stats[41] = 0;
    },
  ]) {
    const changed = structuredClone(parent);
    mutate(changed);
    assert.throws(() => recoverDruidStaticHealing(changed, evidence));
  }
  const changed = structuredClone(evidence);
  changed.currentItems[0].effectIds.push(1);
  assert.throws(() => recoverDruidStaticHealing(parent, changed));
});
test("reapplying recovery and ambiguous current records are rejected", () => {
  const amended = recoverDruidStaticHealing(parent, evidence).db;
  assert.throws(() => recoverDruidStaticHealing(amended, evidence));
  assert.throws(() =>
    auditDruidStaticHealing(
      parent,
      [...evidence.currentItems, evidence.currentItems[0]],
      evidence.reviewedIds,
    ),
  );
});
