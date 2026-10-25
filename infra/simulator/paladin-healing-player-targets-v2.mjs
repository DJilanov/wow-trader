import assert from "node:assert/strict";

/** Derive player membership from the raid's agents rather than cached unit slices.
 * @param {{workload:string,active:string,assignment:string,rules:string}} source @returns {object}
 */
export function renderPaladinHealingPlayerTargets(source) {
  const patterns = {
      workload: ["sim.Raid.AllUnits", "healer.kfcPaladinHealingPlayerUnits()", 3],
      active: ["holy.Env.Raid.AllUnits", "holy.kfcPaladinHealingPlayerUnits()", 4],
      assignment: ["healer.Env.Raid.AllUnits", "healer.kfcPaladinHealingPlayerUnits()", 1],
      rules: ["holy.Env.Raid.AllPlayerUnits", "holy.kfcPaladinHealingPlayerUnits()", 1],
    },
    result = {};
  for (const [key, [before, after, count]] of Object.entries(patterns)) {
    assert.equal(source[key].split(before).length - 1, count, key);
    result[key] = source[key].replaceAll(before, after);
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
