import assert from "node:assert/strict";

/** Keep inactive equipment guardians outside a declared player-only healing assignment.
 * @param {{workload:string,active:string,assignment:string}} source @returns {object}
 */
export function renderPaladinHealingPlayerTargets(source) {
  const expected = { workload: 3, active: 4, assignment: 1 },
    result = {};
  for (const [key, count] of Object.entries(expected)) {
    assert.equal(source[key].split(".Raid.AllUnits").length - 1, count, key);
    result[key] = source[key].replaceAll(".Raid.AllUnits", ".Raid.AllPlayerUnits");
  }
  for (const anchor of ["\t\tsim.Reset()", "\t\t\tfinished := sim.Step()"])
    assert.equal(result.workload.split(anchor).length, 2, anchor);
  const guard =
    "\n\t\tif guardianErr:=healer.validateKFCPaladinInactiveGuardians();guardianErr!=nil{sim.Cleanup();return nil,guardianErr}";
  result.workload = result.workload.replace("\t\tsim.Reset()", "\t\tsim.Reset()" + guard);
  result.workload = result.workload.replace(
    "\t\t\tfinished := sim.Step()",
    "\t\t\tfinished := sim.Step()" + guard,
  );
  return result;
}
