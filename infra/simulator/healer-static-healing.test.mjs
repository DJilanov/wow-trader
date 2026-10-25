import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  priestHealingStatRecoveryIds,
  recoverPriestStaticHealing,
} from "./healer-static-healing.mjs";

const bytes = readFileSync(
  new URL("./fixtures/healer-static-healing-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "cfd539faefaea4025153cf0f6ceb43e95be6505bc45f8812dba580ab38c04451",
);
const evidence = JSON.parse(gunzipSync(bytes)),
  parent = { items: evidence.priorItems },
  recovered = recoverPriestStaticHealing(parent, evidence),
  item = (database, id) => database.items.find((row) => row.id === id);

test("the recovery applies all 25 reviewed current direct healing values", () => {
  assert.equal(recovered.changes.length, 25);
  assert.equal(recovered.db.items.length, parent.items.length);
  for (const change of recovered.changes) {
    assert.equal(item(parent, change.id).stats[41], 0);
    assert.equal(item(recovered.db, change.id).stats[41], change.healingPower);
    assert(change.healingPower > 0);
  }
  assert.equal(recovered.classMechanicsAdmission, false);
  assert.equal(recovered.numericalQualification, false);
  assert.equal(recovered.publicationAllowed, false);
});

test("all eight Devout pieces retain their actual healing rather than zero", () => {
  const pieces = Array.from({ length: 8 }, (_, index) => 16690 + index);
  assert.equal(item(recovered.db, 16690).stats[41], 20);
  assert.equal(
    pieces.reduce((sum, id) => sum + item(recovered.db, id).stats[41], 0),
    123,
  );
});

test("a low-level healing weapon remains included with its current 68 healing", () => {
  assert.equal(item(recovered.db, 2816).stats[41], 68);
  assert.equal(item(recovered.db, 2816).ilvl, 33);
  assert.equal(item(recovered.db, 2816).weaponDamageMin, item(parent, 2816).weaponDamageMin);
});

test("observed vendor stats take priority over the incomplete raw view", () => {
  const raw = evidence.currentItems.find((row) => row.itemId === 272681);
  assert.equal(raw.stats.filter((row) => row.statType === 41).length, 0);
  assert.deepEqual(item(recovered.db, 272681), item(parent, 272681));
  assert.equal(item(recovered.db, 272681).stats[41], 176);
  assert.equal(item(recovered.db, 272681).stats[42], 58);
  assert.equal(recovered.preservedObserved.currentServerVerified, false);
});

test("missing or conflicting observation evidence prevents rewriting the catalog", () => {
  for (const mutate of [
    (value) => {
      value.observedMace.sourceSha256 = "1".repeat(64);
    },
    (value) => {
      value.observedMace.captureBuild = "70532";
    },
    (value) => {
      value.observedMace.record.item.stats.ITEM_MOD_SPELL_HEALING_DONE_SHORT = 0;
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => recoverPriestStaticHealing(parent, changed));
  }
});

test("existing positive healing values cannot be silently overwritten or double-applied", () => {
  const changed = globalThis.structuredClone(parent);
  item(changed, 16690).stats[41] = 30;
  assert.throws(() => recoverPriestStaticHealing(changed, evidence), /Refusing to replace/);
  assert.throws(() => recoverPriestStaticHealing(recovered.db, evidence), /Refusing to replace/);
});

test("unknown client versions and changed review sets require a separate review", () => {
  assert.throws(() =>
    recoverPriestStaticHealing(parent, { ...evidence, currentClientVersion: "1.60.1.70533" }),
  );
  assert.throws(() =>
    recoverPriestStaticHealing(parent, { ...evidence, normalizedSha256: "1".repeat(64) }),
  );
  assert.throws(() =>
    recoverPriestStaticHealing(parent, {
      ...evidence,
      reviewedIds: priestHealingStatRecoveryIds.slice(1),
    }),
  );
});

test("missing, duplicate, unresolved or non-finite current values fail closed", () => {
  for (const mutate of [
    (value) => {
      value.currentItems = value.currentItems.filter((row) => row.itemId !== 16690);
    },
    (value) => {
      value.currentItems.push(value.currentItems[0]);
    },
    (value) => {
      value.currentItems.find((row) => row.itemId === 16690).issues = ["test-unresolved-budget"];
    },
    (value) => {
      value.currentItems
        .find((row) => row.itemId === 16690)
        .stats.find((row) => row.statType === 41).value = Number.NaN;
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => recoverPriestStaticHealing(parent, changed));
  }
});

test("all other stats and item metadata keep their existing values and provenance", () => {
  for (const previous of parent.items) {
    const next = item(recovered.db, previous.id);
    assert.deepEqual({ ...previous, stats: [] }, { ...next, stats: [] });
    for (let index = 0; index < 44; index++)
      if (index !== 41) assert.equal(next.stats[index], previous.stats[index]);
  }
  assert(recovered.scope.includes("not complete stat/effect/set reconciliation"));
});

test("recovery is deterministic and neither the archive nor parent is modified", () => {
  const before = JSON.stringify({ evidence, parent });
  assert.deepEqual(recoverPriestStaticHealing(parent, evidence), recovered);
  assert.equal(JSON.stringify({ evidence, parent }), before);
});
