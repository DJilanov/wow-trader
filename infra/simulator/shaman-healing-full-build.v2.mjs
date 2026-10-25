import assert from "node:assert/strict";
import { integrateShamanHealingFullBuild as integrateParent } from "./shaman-healing-full-build.mjs";

export {
  renderShamanHealingFullBuild,
  renderShamanHealingFullBuildTests,
} from "./shaman-healing-full-build.mjs";

/** Reject applying the factory transformation twice, preserving the frozen first model.
 * @param {string} implementation @returns {string}
 */
export function integrateShamanHealingFullBuild(implementation) {
  assert(!implementation.includes("validateKFCShamanHealingStudyFactory(player)"));
  assert(!implementation.includes("if kfcShamanScopedUtilityAllowed(field)"));
  return integrateParent(implementation);
}
