import assert from "node:assert/strict";
import { paladinHealingPriorityCandidates } from "./paladin-healing-feedback-v2.mjs";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";

/** Retain the incumbent and compare legal direct ranks with coarse owned resource policies.
 * Gear, full talents, consumes and source assumptions remain with the supplied option.
 * @param {{option:object,kind:'tank'|'group',spellPolicy:object}} input
 * @returns {Generator<object>}
 */
export function* paladinHealingAssignmentRankCandidates({ option, kind, spellPolicy }) {
  assert(["tank", "group"].includes(kind));
  assert(option?.state?.fields && option.gear && option.consumes);
  if (option.reservePolicyId !== undefined) assert.equal(kind, "group");
  if (option.tankReservePolicyId !== undefined) assert.equal(kind, "tank");
  yield structuredClone(option);
  const fields = option.state.fields;
  const eligible = eligiblePaladinHealingRanks(spellPolicy, {
    level: 60,
    talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
    allowConditionalCandidates: true,
  });
  const lowest = (family) =>
    eligible.filter((row) => row.family === family).toSorted((a, b) => a.rank - b.rank)[0]?.spellId;
  for (const policy of paladinHealingPriorityCandidates(spellPolicy, fields).filter((row) =>
    [0, 400].includes(row.directMinimumMissingHealth),
  )) {
    const policies = [policy];
    if (policy.holyShock && policy.lightsVigil) {
      assert(lowest("holy-shock") && lowest("lights-vigil"));
      policies.push({
        ...structuredClone(policy),
        ranks: { "holy-shock": lowest("holy-shock"), "lights-vigil": lowest("lights-vigil") },
      });
    }
    for (const policy of policies) {
      const current = { ...structuredClone(option), policy: structuredClone(policy) };
      current.requireVigil = Boolean(
        current.requireVigil && policy.holyShock && policy.lightsVigil,
      );
      if (!policy.lightsVigil) {
        current.minimumPartyTargets = 0;
        current.minimumPartyMissingHealth = 0;
      }
      yield current;
      const clean = structuredClone(current);
      delete clean.survivalPolicyId;
      delete clean.reservePolicyId;
      delete clean.tankReservePolicyId;
      if (kind === "tank") {
        yield { ...structuredClone(clean), tankReservePolicyId: "fixed-cycle-resource-window" };
        yield { ...structuredClone(clean), tankReservePolicyId: "fixed-cycle-potion-window-1500" };
      } else {
        yield { ...structuredClone(clean), survivalPolicyId: "earlier-resources" };
        yield {
          ...structuredClone(clean),
          survivalPolicyId: "earlier-resources",
          reservePolicyId: "resource-window",
        };
      }
    }
  }
}
