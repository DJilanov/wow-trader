import assert from "node:assert/strict";

/** Canonicalize encoding/json protobuf measurements without adding omitted fields.
 * Unlike emitted protobuf JSON, empty action/pet arrays can be absent. Every
 * recorded value, duplicate check and unit/target position remains intact.
 * @param {object} metrics @returns {object}
 */
export function canonicalizeCompactHealingActionMetrics(metrics) {
  const result = structuredClone(metrics);
  assert(result && Array.isArray(result.parties), "Invalid compact raid metrics");
  function unit(value) {
    assert(value && typeof value === "object" && !Array.isArray(value));
    if (Object.hasOwn(value, "actions")) {
      assert(Array.isArray(value.actions), "Invalid compact action list");
      const key = (action) => {
        assert(action?.id && typeof action.id === "object" && !Array.isArray(action.id));
        return JSON.stringify(
          Object.fromEntries(
            Object.keys(action.id)
              .sort()
              .map((name) => [name, action.id[name]]),
          ),
        );
      };
      const identities = value.actions.map(key);
      assert.equal(new Set(identities).size, identities.length, "Duplicate compact action ID");
      value.actions.sort((a, b) => key(a).localeCompare(key(b)));
    }
    if (Object.hasOwn(value, "pets")) {
      assert(Array.isArray(value.pets), "Invalid compact pet list");
      for (const pet of value.pets) unit(pet);
    }
  }
  for (const party of result.parties) {
    assert(party && Array.isArray(party.players), "Invalid compact party metrics");
    for (const player of party.players) unit(player);
  }
  return result;
}
