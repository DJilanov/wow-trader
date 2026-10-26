import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import {
  applyPaladinHealingTankReservePolicy,
  paladinHealingTankReservePolicyIds,
} from "./paladin-healing-tank-reserve-policy.mjs";

const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("fixtures/paladin-tank-reserve-policy-source.v1.json.gz", import.meta.url),
    ),
  ),
);
const input = { frame: fixture.job.workload, kind: "tank" };
const apply = (value, policyId = "resource-window") =>
  applyPaladinHealingTankReservePolicy({ ...value, policyId });

test("the fixed domain preserves an actual failed tank workload unchanged", () => {
  assert.deepEqual(paladinHealingTankReservePolicyIds(), ["unchanged", "resource-window"]);
  assert.deepEqual(apply(input, "unchanged"), input.frame);
  assert.throws(() => apply(input, "invented"));
  assert.throws(() => apply({ ...input, kind: "group" }));
});
test("only resource eligibility changes; healing priorities, demand and every other field are preserved", () => {
  const expected = structuredClone(input.frame);
  expected.cooldowns.find((row) => row.itemId === 12662).minimumMissingMana = 500;
  expected.cooldowns.find((row) => row.itemId === 13444).minimumMissingMana = 750;
  assert.deepEqual(apply(input), expected);
  const earlier = structuredClone(input);
  earlier.frame.cooldowns.find((row) => row.itemId === 13444).minimumMissingMana = 50;
  assert.equal(apply(earlier).cooldowns.find((row) => row.itemId === 13444).minimumMissingMana, 50);
});
test("the proposal rejects ambiguous targets and unsafe or duplicate resource guards", () => {
  for (const mutate of [
    (row) => {
      row.frame.damage[0].raidIndex = 2;
    },
    (row) => {
      row.frame.priorities[0].raidIndex = -1;
    },
    (row) => {
      row.frame.targets.push(structuredClone(row.frame.targets[1]));
    },
    (row) => {
      row.frame.cooldowns.find((policy) => policy.itemId === 12662).requireHealingDemand = false;
    },
    (row) => {
      row.frame.cooldowns.find((policy) => policy.itemId === 13444).minimumMissingMana = NaN;
    },
    (row) => {
      row.frame.cooldowns.push(
        structuredClone(row.frame.cooldowns.find((policy) => policy.itemId === 13444)),
      );
    },
    (row) => {
      row.frame.cooldowns = row.frame.cooldowns.filter((policy) => policy.itemId !== 12662);
    },
  ]) {
    const changed = structuredClone(input);
    mutate(changed);
    assert.throws(() => apply(changed));
  }
});
test("output mutations cannot alter the actual source fixture", () => {
  const before = structuredClone(input);
  const result = apply(input);
  result.priorities[0].minimumMissingHealth = 0;
  result.cooldowns[0].minimumMissingMana = 0;
  assert.deepEqual(input, before);
});
