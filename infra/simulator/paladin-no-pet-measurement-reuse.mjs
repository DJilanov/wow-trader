import assert from "node:assert/strict";
import { simulationHash } from "./simulation-fingerprint.mjs";
import { parsePaladinAssignmentHealingJobReply } from "./paladin-assignment-protocol.mjs";

/** Reuse a successful strict-player parent measurement under the reviewed identity-preserving correction.
 * @param {object} row
 * @param {{parentBinarySha256:string,targetBinarySha256:string,parentIdentity:string,targetIdentity:string,qualification:object,qualificationSha256:string,sourceJournalSha256:string}} proof
 * @returns {object}
 */
export function reusePaladinNoPetMeasurement(row, proof) {
  for (const value of [
    proof.parentBinarySha256,
    proof.targetBinarySha256,
    proof.parentIdentity,
    proof.targetIdentity,
    proof.qualificationSha256,
    proof.sourceJournalSha256,
  ])
    assert(/^[a-f0-9]{64}$/.test(value));
  const qualification = proof.qualification;
  assert.equal(qualification.schema, "kfc-paladin-healing-player-targets-final-review.v1");
  assert.equal(qualification.status, "paladin-inactive-equipment-guardian-controls-passed");
  assert.equal(qualification.identity, proof.targetIdentity);
  assert.equal(qualification.parentNoPetCompatibility.parentIdentity, proof.parentIdentity);
  assert.equal(qualification.parentNoPetCompatibility.allParentMeasurementGroupsPreserved, true);
  assert.equal(qualification.parentNoPetCompatibility.globalHandlersChanged, false);
  assert.equal(qualification.classMechanicsAdmission, true);
  assert.equal(qualification.inactiveEquipmentGuardiansAllowed, true);
  assert.equal(qualification.activeGuardiansRejected, true);
  assert.equal(qualification.assignmentScoringRequired, "external-demand-v1");
  assert.equal(row.runtimeSha256, proof.parentBinarySha256);
  assert.equal(row.origin, undefined, "Chained reuse requires a new explicit proof");
  assert.equal(typeof row.detail, "boolean");
  const identity = {
    runtimeSha256: row.runtimeSha256,
    requestBase64: row.requestBase64,
    workloadSha256: row.workloadSha256,
    detail: row.detail,
  };
  assert.equal(row.key, simulationHash(identity));
  parsePaladinAssignmentHealingJobReply(
    JSON.stringify(row.reply),
    "h-" + row.key.slice(0, 32),
    row.detail,
    true,
  );
  assert.equal(row.reply.status, "complete");
  const key = simulationHash({ ...identity, runtimeSha256: proof.targetBinarySha256 });
  return {
    ...structuredClone(row),
    key,
    runtimeSha256: proof.targetBinarySha256,
    reply: { ...structuredClone(row.reply), id: "h-" + key.slice(0, 32) },
    origin: {
      schema: "kfc-paladin-no-pet-compatible-measurement.v1",
      sourceKey: row.key,
      sourceRuntimeSha256: row.runtimeSha256,
      sourceJournalSha256: proof.sourceJournalSha256,
      qualificationSha256: proof.qualificationSha256,
      executedOnTarget: false,
    },
  };
}
