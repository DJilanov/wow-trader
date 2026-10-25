import assert from "node:assert/strict";

function actionKey(action) {
  assert(action && typeof action === "object" && !Array.isArray(action));
  const id = action.id;
  assert(id && typeof id === "object" && !Array.isArray(id), "Missing metric action ID");
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(id)
        .sort()
        .map((key) => [key, id[key]]),
    ),
  );
}

/** Go emits action metrics from a map. Match their full IDs while preserving every metric value,
 * target position, player position and iteration sequence.
 * @param {object} metrics @returns {object}
 */
export function canonicalizeHealingActionMetrics(metrics) {
  const result = structuredClone(metrics);
  assert(result && Array.isArray(result.parties), "Invalid raid metrics");
  function unit(value) {
    assert(
      value && Array.isArray(value.actions) && Array.isArray(value.pets),
      "Invalid unit metrics",
    );
    const keys = value.actions.map(actionKey);
    assert.equal(new Set(keys).size, keys.length, "Duplicate metric action ID");
    value.actions.sort((left, right) => actionKey(left).localeCompare(actionKey(right)));
    for (const pet of value.pets) unit(pet);
  }
  for (const party of result.parties) {
    assert(party && Array.isArray(party.players), "Invalid party metrics");
    for (const player of party.players) unit(player);
  }
  return result;
}
