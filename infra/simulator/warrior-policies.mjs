import assert from "node:assert/strict";
import { armsRotationCandidates, armsRotationForTalents } from "./arms-policy.mjs";
import { furyRotationCandidates } from "./fury-rotations.mjs";
import { simulationHash } from "./simulation-cache.mjs";

export function resolvedWarriorPolicies(baseline, control, trees) {
  const key = `${baseline.profile}/${baseline.variant}`;
  assert(["warrior/fury", "warrior/arms"].includes(key), "Unsupported warrior policy");
  assert.equal(`${control.profile}/${control.variant}`, key, "Wrong fixed rotation template");
  const original = baseline.settings.player.rotation;
  const template = control.settings.player.rotation;
  if (baseline.variant === "fury") return furyRotationCandidates(original, template);
  const result = [];
  const seen = new Set();
  for (const policy of armsRotationCandidates(original, template)) {
    const value = armsRotationForTalents(
      trees,
      baseline.settings.player.talentsString,
      policy.value,
    );
    const hash = simulationHash(value);
    if (seen.has(hash)) continue;
    seen.add(hash);
    result.push({ ...policy, value });
  }
  assert.deepEqual(result[0].value, original, "The Arms incumbent contains unavailable actions");
  return result;
}
