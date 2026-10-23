import assert from "node:assert/strict";
import { test } from "node:test";
import { tankThreatBreakdown } from "./tank-threat-breakdown.mjs";

const database = { items: [], spellIcons: [{ id: 1, name: "Test ability" }] };
const unit = {
  dps: { avg: 3 },
  threat: { avg: 6 },
  actions: [
    {
      id: { spellId: 1 },
      targets: [
        { damage: 120, threat: 240 },
        { damage: 60, threat: 120 },
      ],
    },
    { id: { spellId: 1, tag: 1 }, targets: [{ damage: 60, threat: 120 }] },
    { id: { otherId: "OtherActionAttack", tag: 1 }, targets: [{ damage: 30, threat: 30 }] },
    { id: { otherId: "OtherActionAttack", tag: 3 }, targets: [{ damage: 30, threat: 30 }] },
    { id: { spellId: 2 }, targets: [{ threat: 60 }] },
  ],
};
test("merges action tags, sums every target once and retains threat without damage", () => {
  const before = globalThis.structuredClone(unit);
  const rows = tankThreatBreakdown(unit, database, 10, 10);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].damagePerSecond, 2.4);
  assert.equal(rows[0].threatPerSecond, 4.8);
  assert.equal(rows.find((row) => row.key === "other:OtherActionAttack").damagePerSecond, 0.6);
  assert.equal(rows.find((row) => row.key === "spell:2").damagePerSecond, 0);
  assert.deepEqual(unit, before);
});
test("rejects mismatched totals, missing identities and non-finite counters", () => {
  assert.throws(
    () => tankThreatBreakdown({ ...unit, threat: { avg: 10 } }, database, 10, 10),
    /reconcile/,
  );
  assert.throws(
    () => tankThreatBreakdown({ ...unit, actions: [{ id: {}, targets: [] }] }, database, 10, 10),
    /identity/,
  );
  assert.throws(
    () =>
      tankThreatBreakdown(
        { ...unit, actions: [{ id: { spellId: 1 }, targets: [{ damage: NaN }] }] },
        database,
        10,
        10,
      ),
    /counters/,
  );
});
