import assert from "node:assert/strict";

function checkedEquipment(equipment) {
  assert(
    Array.isArray(equipment?.items) && equipment.items.length === 17,
    "Expected 17 equipment slots",
  );
  assert(
    equipment.items.every((item) => item && typeof item === "object" && !Array.isArray(item)),
    "Invalid equipment slot",
  );
  return equipment;
}

/** Build stat input from a normalized one-player Forever simulation request.
 * Pass both request types through the same protobuf codec before comparison.
 * This preserves the complete raid and encounter; it does not validate acquisition
 * or authorize numerical reuse across models.
 * @param {object} simulation
 * @param {object|undefined} equipment
 * @returns {object}
 */
export function createSimulationStatsRequest(simulation, equipment) {
  const ruleset = simulation?.simOptions?.ruleset;
  assert(ruleset === 1 || ruleset === "RulesetForever", "Expected an explicit Forever ruleset");
  assert.equal(simulation.raid?.numActiveParties, 1, "Expected one active party");
  assert.equal(simulation.raid.parties?.length, 1, "Expected one simulator party");
  assert.equal(simulation.raid.parties[0].players?.length, 1, "Expected one simulated player");
  assert(
    Array.isArray(simulation.encounter?.targets) && simulation.encounter.targets.length > 0,
    "Missing encounter targets",
  );
  checkedEquipment(simulation.raid.parties[0].players[0].equipment);
  const result = structuredClone({
    raid: simulation.raid,
    encounter: simulation.encounter,
    ruleset,
  });
  if (equipment !== undefined)
    result.raid.parties[0].players[0].equipment = structuredClone(checkedEquipment(equipment));
  return result;
}

/** Reject stat evidence from a different raid, encounter or equipment context.
 * @param {object} simulation
 * @param {object} statsRequest
 * @param {object|undefined} equipment
 * @returns {void}
 */
export function assertSimulationStatsContext(simulation, statsRequest, equipment) {
  assert.deepEqual(
    statsRequest,
    createSimulationStatsRequest(simulation, equipment),
    "Stat request differs from simulation context",
  );
}
