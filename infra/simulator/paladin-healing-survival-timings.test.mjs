import assert from "node:assert/strict";
import test from "node:test";
import { paladinHealingSurvivalPolicyIds } from "./paladin-healing-survival-policies.mjs";
import { paladinHealingSurvivalTimingSettings } from "./paladin-healing-survival-timings.mjs";

test("only explicit earlier-resource policies add coarse owned mana-item schedules", () => {
  for (const kind of ["group", "tank"])
    for (const policyId of paladinHealingSurvivalPolicyIds(kind)) {
      const value = paladinHealingSurvivalTimingSettings({ kind, policyId, durationSeconds: 180 });
      if (policyId.includes("earlier-resources"))
        assert.deepEqual(value, {
          cooldowns: [
            { id: { itemId: 12662 }, timings: [15, 135] },
            { id: { itemId: 13444 }, timings: [30, 150] },
          ],
        });
      else assert.equal(value, null);
    }
});

test("resource schedules cannot silently extend to undeclared fights or policies", () => {
  for (const durationSeconds of [0, -1, NaN, 120, 300])
    assert.throws(() =>
      paladinHealingSurvivalTimingSettings({
        kind: "tank",
        policyId: "earlier-resources",
        durationSeconds,
      }),
    );
  assert.throws(() =>
    paladinHealingSurvivalTimingSettings({
      kind: "tank",
      policyId: "shock-rescue",
      durationSeconds: 180,
    }),
  );
});

test("resource schedule callers cannot mutate later plans", () => {
  const input = { kind: "group", policyId: "earlier-resources", durationSeconds: 180 },
    a = paladinHealingSurvivalTimingSettings(input);
  a.cooldowns[0].timings[0] = 0;
  a.cooldowns[1].id.itemId = 1;
  const b = paladinHealingSurvivalTimingSettings(input);
  assert.equal(b.cooldowns[0].timings[0], 15);
  assert.equal(b.cooldowns[1].id.itemId, 13444);
});
