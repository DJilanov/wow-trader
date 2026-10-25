import assert from "node:assert/strict";

/** Require the external-demand ledger for numerical healer selection.
 * @param {object} result @returns {object}
 */
export function paladinHealingAssignmentMetrics(result) {
  const assignment = result.assignment;
  assert.equal(
    assignment?.schema,
    "kfc-paladin-external-assignment.v1",
    "Paladin optimization requires external-demand scoring",
  );
  const value = {
    survivalRate: result.survivalRate,
    hps: assignment.supportHpsMean,
    hpsStdev: assignment.supportHpsStdev,
    absorbedHps: assignment.absorbedHpsMean,
    effectiveHealingHps: assignment.healthRestoredHpsMean,
    missingHealthSecondsMean: assignment.externalMissingHealthSecondsMean,
    finalMissingHealthMean: assignment.finalExternalMissingHealthMean,
    manaRemainingMean: result.manaRemainingMean,
    manaBlockedSecondsMean: result.manaBlockedSecondsMean,
    deliveredIncomingDamageMean: assignment.damageDemandMean,
  };
  assert(
    Object.values(value).every(
      (number) => typeof number === "number" && Number.isFinite(number) && number >= 0,
    ),
  );
  assert(value.survivalRate <= 1);
  assert(
    Math.abs(value.hps - value.absorbedHps - value.effectiveHealingHps) <=
      Math.max(1, value.hps) * 1e-7,
  );
  return value;
}

/** Add an explicit external-demand ledger without changing legacy job summaries.
 * @param {string} parent @returns {string}
 */
export function renderPaladinHealingAssignment(parent) {
  function replace(anchor, value) {
    assert.equal(
      parent.split(anchor).length,
      2,
      "Missing or ambiguous assignment scoring integration",
    );
    parent = parent.replace(anchor, value);
  }
  replace(
    "type KFCPaladinHealingWorkload struct {",
    'type KFCPaladinHealingWorkload struct {\n AssignmentScoring string `json:"assignmentScoring,omitempty"`',
  );
  replace(
    "type KFCPaladinHealingWorkloadResult struct {",
    'type KFCPaladinHealingWorkloadResult struct {\n Assignment *KFCPaladinAssignmentMetrics `json:"assignment,omitempty"`',
  );
  replace(
    "\tif input == nil || input.Raid == nil",
    "\tassignment,scoreErr:=newKFCPaladinAssignment(frame.AssignmentScoring)\n\tif scoreErr!=nil{return nil,scoreErr}\n\tif input == nil || input.Raid == nil",
  );
  replace(
    "\tif frame.RecombobulatorCanCrit != nil",
    "\tif err=healer.validateKFCPaladinSetAdmission();err!=nil{return nil,err}\n\tif frame.RecombobulatorCanCrit != nil",
  );
  replace(
    "\t\tsim.PrePull()",
    "\t\tif assignment!=nil{assignment.resetIteration()}\n\t\tsim.PrePull()",
  );
  replace(
    "\t\t\t\tincoming.DealDamage(sim, result)",
    "\t\t\t\tbeforeHealth:=target.CurrentHealth()\n\t\t\t\tincoming.DealDamage(sim, result)\n\t\t\t\tif assignment!=nil{assignment.observeDamage(beforeHealth,result)}",
  );
  replace(
    "\t\t\tbeforeTime, beforeMissing, blocked :=",
    "\t\t\tbeforeExternal:=0.0\n\t\t\tif assignment!=nil{beforeExternal=healer.kfcExternalAssignmentMissing()}\n\t\t\tbeforeTime, beforeMissing, blocked :=",
  );
  replace(
    "\t\t\toutput.MissingHealthSecondsMean += beforeMissing * elapsed",
    "\t\t\toutput.MissingHealthSecondsMean += beforeMissing * elapsed\n\t\t\tif assignment!=nil{assignment.metrics.ExternalMissingHealthSecondsMean+=beforeExternal*elapsed}",
  );
  replace(
    "\t\t\t\toutput.MissingHealthSecondsMean += missing() * remainder",
    "\t\t\t\toutput.MissingHealthSecondsMean += missing() * remainder\n\t\t\t\tif assignment!=nil{assignment.metrics.ExternalMissingHealthSecondsMean+=healer.kfcExternalAssignmentMissing()*remainder}",
  );
  replace(
    "\t\toutput.FinalMissingHealthMean += missing()",
    "\t\toutput.FinalMissingHealthMean += missing()\n\t\tif assignment!=nil{if scoreErr:=assignment.finishIteration(sim.Duration.Seconds(),healer.kfcExternalAssignmentMissing());scoreErr!=nil{sim.Cleanup();return nil,scoreErr}}",
  );
  replace(
    "\toutput.Metrics = sim.Raid.GetMetrics()",
    "\tif assignment!=nil{output.Assignment=assignment.result()}\n\toutput.Metrics = sim.Raid.GetMetrics()",
  );
  return parent;
}
