import assert from "node:assert/strict";
import test from "node:test";
import { assertShamanLegacyItemPolicy, shamanLegacyItemPolicies } from "./shaman-legacy-items.mjs";

test("reference matrices describe only the legacy items actually equipped", () => {
  for (const [ids, count, fields] of [
    [[], 0, []],
    [[11819, 272439], 0, []],
    [[12930], 3, ["briarwoodSpellPower"]],
    [[18471], 2, ["royalSealSpellPower"]],
    [[13968], 1, ["eyeScriptReference"]],
    [[12930, 18471], 6, ["briarwoodSpellPower", "royalSealSpellPower"]],
    [[12930, 13968], 3, ["briarwoodSpellPower", "eyeScriptReference"]],
  ]) {
    const policies = shamanLegacyItemPolicies(ids);
    assert.equal(policies.length, count);
    for (const policy of policies) {
      assertShamanLegacyItemPolicy(policy);
      assert.deepEqual(
        Object.keys(policy)
          .filter((key) => !["schema", "id"].includes(key))
          .sort(),
        fields.toSorted(),
      );
    }
    assert.equal(new Set(policies.map((policy) => JSON.stringify(policy))).size, count);
  }
});

test("nonfinite, empty, invented and script-verified references are rejected", () => {
  for (const value of [
    null,
    [],
    {},
    { schema: "kfc-shaman-legacy-item-policy.v1", id: "empty" },
    ...[0, 14, 31, NaN, Infinity, null, "15"].map((briarwoodSpellPower) => ({
      schema: "kfc-shaman-legacy-item-policy.v1",
      id: "invalid",
      briarwoodSpellPower,
    })),
    ...[0, 17, 36, NaN, Infinity, null, "18"].map((royalSealSpellPower) => ({
      schema: "kfc-shaman-legacy-item-policy.v1",
      id: "invalid",
      royalSealSpellPower,
    })),
    {
      schema: "kfc-shaman-legacy-item-policy.v1",
      id: "bad-script",
      eyeScriptReference: "verified-no-effect",
    },
    {
      schema: "kfc-shaman-legacy-item-policy.v1",
      id: "bad-property",
      briarwoodSpellPower: 15,
      serverVerified: true,
    },
  ])
    assert.throws(() => assertShamanLegacyItemPolicy(value));
});

test("references preserve inputs, return immutable independent values and ignore unrelated gear", () => {
  const ids = [0, 12930, 13968, 11819];
  const original = [...ids];
  const first = shamanLegacyItemPolicies(ids),
    second = shamanLegacyItemPolicies(ids);
  assert.deepEqual(ids, original);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first[0], second[0]);
  assert(Object.isFrozen(first) && first.every(Object.isFrozen));
  assert.throws(() => {
    first[0].briarwoodSpellPower = 999;
  });
  for (const input of [null, {}, [-1], [NaN], [1.5], ["12930"]])
    assert.throws(() => shamanLegacyItemPolicies(input));
});

test("Eye's script is never silently promoted to current base or server verification", () => {
  const [policy] = shamanLegacyItemPolicies([13968]);
  assert.equal(policy.eyeScriptReference, "captured-passive-unmodeled-script-reference");
  assert.equal(policy.briarwoodSpellPower, undefined);
  assert.equal(policy.royalSealSpellPower, undefined);
  for (const key of [
    "currentBaseStatsVerified",
    "serverMechanicsVerified",
    "numericalQualification",
    "publicationAllowed",
  ])
    assert.equal(policy[key], undefined);
});
