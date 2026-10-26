import assert from "node:assert/strict";

/** Register actual damage reception before the owned Shaman is finalized.
 * @param {string} implementation @returns {string}
 */
export function integrateShamanHealingWorkload(implementation) {
  const anchor = "\tresto.Shaman.Initialize()\n";
  assert.equal(implementation.split(anchor).length, 2, "Missing Shaman initialization");
  assert(!implementation.includes("registerKFCShamanWorkloadDamage()"));
  return implementation.replace(anchor, anchor + "\tresto.registerKFCShamanWorkloadDamage()\n");
}

/** Bind the shared strict protobuf/JSON worker boundary to the owned controller.
 * @param {string} implementation @returns {string}
 */
export function renderShamanHealingWorkloadJob(implementation) {
  assert(implementation.startsWith("package healing\n"));
  assert(implementation.includes("func RunKFCHealingJob("));
  return implementation
    .replace("package healing\n", "package restoration\n")
    .replaceAll("KFCHealing", "KFCShamanHealing")
    .replaceAll("kfcHealing", "kfcShamanHealing")
    .replaceAll("kfc-healing-", "kfc-shaman-healing-");
}
