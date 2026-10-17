import assert from "node:assert/strict";
import { test } from "node:test";
import { furyRotationCandidates } from "../infra/simulator/fury-rotations.mjs";

const cast = (id, condition) => ({
  action: { castSpell: { spellId: { spellId: id } }, ...(condition ? { condition } : {}) },
});

test("feedback searches rebuild policies from the fixed template, not the modified incumbent", () => {
  const initial = furyRotationCandidates(fixture);
  const incumbent = initial.find(
    (entry) => entry.name.includes("disabled") && entry.name.includes("No Heroic Strike"),
  );
  const policies = furyRotationCandidates(incumbent.value, fixture);
  assert.equal(policies.length, 225);
  assert.deepEqual(policies[0].value, incumbent.value);
  assert(
    policies.some(
      (entry) => entry.name.includes("Heroic Strike ≥90") && entry.name.includes("original25"),
    ),
  );
  for (const policy of policies) {
    const rageActions = policy.value.priorityList.filter(
      (entry) => entry.action.castSpell.spellId.spellId === 18499,
    );
    assert(
      rageActions.length <= 1,
      "feedback must not accumulate duplicate Berserker Rage actions",
    );
  }
});
const cmp = (op, val) => ({ cmp: { op, lhs: { currentRage: {} }, rhs: { const: { val } } } });
const fixture = {
  type: "TypeAPL",
  priorityList: [
    cast(1719, { const: { val: "false" } }),
    cast(2457, { and: { vals: [cmp("OpLe", "25")] } }),
    cast(11585),
    cast(2458),
    cast(20662),
    cast(23894),
    cast(1680),
    cast(11574, { not: { val: { dotIsActive: { spellId: { spellId: 11574 } } } } }),
    cast(25286, { and: { vals: [cmp("OpGe", "30")] } }),
  ],
};

test("rage, stance and Rend policies preserve the exact original and have unique APLs", () => {
  const before = globalThis.structuredClone(fixture);
  const policies = furyRotationCandidates(fixture);
  assert.equal(policies.length, 225);
  assert.deepEqual(policies[0].value, fixture);
  assert.deepEqual(fixture, before);
  assert.equal(
    new Set(policies.map((policy) => JSON.stringify(policy.value))).size,
    policies.length,
  );
  for (const policy of policies) {
    assert.deepEqual(
      policy.value.priorityList.find((entry) => entry.action.castSpell.spellId.spellId === 1719)
        .action.condition,
      { const: { val: "false" } },
    );
    if (policy.family.startsWith("disabled"))
      assert(
        !policy.value.priorityList.some((entry) =>
          [2457, 2458, 11585, 11574].includes(entry.action.castSpell.spellId.spellId),
        ),
      );
    if (policy.family.endsWith("early Rend")) {
      const ids = policy.value.priorityList.map((entry) => entry.action.castSpell.spellId.spellId);
      assert(ids.indexOf(2457) < ids.indexOf(11574));
      assert(ids.indexOf(11574) < ids.indexOf(11585));
    }
  }
  assert(policies.some((policy) => policy.name.includes("Heroic Strike ≥15")));
  assert(policies.some((policy) => policy.name.includes("No Heroic Strike")));
});
