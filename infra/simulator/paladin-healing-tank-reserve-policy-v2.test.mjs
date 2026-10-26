import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { applyPaladinHealingTankReservePolicy as original } from "./paladin-healing-tank-reserve-policy.mjs";
import {
  applyPaladinHealingTankReservePolicy as apply,
  paladinHealingTankReservePolicyIds,
} from "./paladin-healing-tank-reserve-policy-v2.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("fixtures/paladin-tank-reserve-policy-source.v1.json.gz", import.meta.url),
    ),
  ),
);
const input = { frame: fixture.job.workload, kind: "tank" };
test("the fixed domain preserves both earlier proposals byte for byte", () => {
  assert.deepEqual(paladinHealingTankReservePolicyIds(), [
    "unchanged",
    "resource-window",
    "potion-window-1500",
    "potion-window-2000",
  ]);
  for (const policyId of ["unchanged", "resource-window"])
    assert.deepEqual(apply({ ...input, policyId }), original({ ...input, policyId }));
  assert.throws(() => apply({ ...input, policyId: "invented" }));
});
test("each potion-only proposal preserves the complete original rune and healing policies", () => {
  for (const threshold of [1500, 2000]) {
    const before = structuredClone(input),
      expected = structuredClone(input.frame);
    expected.cooldowns.find((row) => row.itemId === 13444).minimumMissingMana = threshold;
    const result = apply({ ...input, policyId: "potion-window-" + threshold });
    assert.deepEqual(result, expected);
    result.cooldowns[0].minimumMissingMana = 0;
    assert.deepEqual(input, before);
  }
});
test("potion-only proposals retain all target, demand and rune validation", () => {
  for (const mutate of [
    (row) => {
      row.frame.cooldowns.find((policy) => policy.itemId === 12662).requireHealingDemand = false;
    },
    (row) => {
      row.frame.cooldowns = row.frame.cooldowns.filter((policy) => policy.itemId !== 12662);
    },
    (row) => {
      row.frame.priorities[0].raidIndex = -1;
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    for (const policyId of ["potion-window-1500", "potion-window-2000"])
      assert.throws(() => apply({ ...changed, policyId }));
  }
});
