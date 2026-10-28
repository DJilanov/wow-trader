import { createPaladinHealingFrameBrowserJob } from "./paladin-healing-browser-request-v2.mjs";

/** Preserve measured inputs and reconcile owned effects only for personal equipment changes.
 * @param {object} api @param {object} input @returns {object}
 */
export function createPaladinHealingEquipmentBrowserJob(api, input) {
  const policies = api.equipmentPolicies;
  if (
    !policies ||
    typeof policies.apply !== "function" ||
    policies.modelIdentity !== api.modelIdentity ||
    policies.catalogSha256 !== api.catalogSha256 ||
    !Array.isArray(policies.scenarioIds) ||
    !policies.scenarioIds.includes(input?.scenarioId)
  )
    throw new Error("Choose the Paladin equipment model and a reviewed mechanics scenario.");
  const job = createPaladinHealingFrameBrowserJob(api, input);
  const request = api.RaidSimRequest.fromBinary(
    Uint8Array.from(globalThis.atob(input.sourceRequestBase64), (character) =>
      character.charCodeAt(0),
    ),
  );
  const source = request.raid.parties
    .flatMap((party) => party.players)
    .find((player) => player.class === api.paladinClass);
  if (!source || !Array.isArray(source.equipment?.items) || source.equipment.items.length !== 17)
    throw new Error("The original Paladin equipment template is incomplete.");
  if (source.equipment.items.some((item, index) => item.id !== input.gear[index].id))
    job.workload = policies.apply(job.workload, input.gear, input.scenarioId);
  return job;
}
