import assert from "node:assert/strict";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

/** Compare legal burst-healing ranks without borrowing tank/group resource policies.
 * @param {{option:object,spellPolicy:object}} input
 * @returns {Generator<object>}
 */
export function* paladinHealingBurstPriorityCandidates({ option, spellPolicy }) {
  assert(option?.state?.fields && option.policy && option.gear && option.consumes);
  for (const field of ["survivalPolicyId", "reservePolicyId", "tankReservePolicyId"])
    assert.equal(option[field], undefined, "Burst cannot inherit a tank/group resource policy");
  const fields = option.state.fields;
  const eligible = eligiblePaladinHealingRanks(spellPolicy, {
    level: 60,
    talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
    allowConditionalCandidates: true,
  });
  const direct = eligible.filter((rank) => ["holy-light", "flash-of-light"].includes(rank.family));
  const shock = eligible.filter((rank) => rank.family === "holy-shock");
  const vigil = eligible.filter((rank) => rank.family === "lights-vigil");
  assert(direct.length > 0);
  assert(
    direct.some((rank) => rank.spellId === option.policy.directSpellId),
    "Ineligible burst direct rank",
  );
  assert(!option.policy.holyShock || fields.holyShock, "Burst Holy Shock is not owned");
  assert(
    !option.policy.lightsVigil || (option.policy.holyShock && fields.lightsVigil),
    "Burst Light's Vigil is not owned",
  );
  assert(
    !option.policy.maintainVigil || option.policy.lightsVigil,
    "Maintaining Vigil requires its active priority",
  );
  for (const [family, id] of Object.entries(option.policy.ranks ?? {})) {
    assert(["holy-shock", "lights-vigil"].includes(family));
    assert(
      eligible.some((rank) => rank.family === family && rank.spellId === id),
      "Ineligible burst active rank",
    );
    assert(
      family === "holy-shock" ? option.policy.holyShock : option.policy.lightsVigil,
      "Unused burst active rank",
    );
  }
  const active = [{ holyShock: false, lightsVigil: false, maintainVigil: false, ranks: {} }];
  for (const rank of shock)
    active.push({
      holyShock: true,
      lightsVigil: false,
      maintainVigil: false,
      ranks: { "holy-shock": rank.spellId },
    });
  for (const shockRank of shock)
    for (const vigilRank of vigil)
      for (const maintainVigil of [false, true])
        active.push({
          holyShock: true,
          lightsVigil: true,
          maintainVigil,
          ranks: { "holy-shock": shockRank.spellId, "lights-vigil": vigilRank.spellId },
        });
  const seen = new Set();
  function retain(value) {
    const id = simulationHash(value);
    if (seen.has(id)) return undefined;
    seen.add(id);
    return value;
  }
  yield retain(globalThis.structuredClone(option));
  for (const rank of direct)
    for (const directMinimumMissingHealth of [0, 400, 1200])
      for (const support of active) {
        const next = globalThis.structuredClone(option);
        next.policy = {
          directSpellId: rank.spellId,
          directMinimumMissingHealth,
          ...globalThis.structuredClone(support),
        };
        next.requireVigil = Boolean(next.requireVigil && support.holyShock && support.lightsVigil);
        if (!support.lightsVigil) {
          next.minimumPartyTargets = 0;
          next.minimumPartyMissingHealth = 0;
        }
        const proposal = retain(next);
        if (proposal) yield proposal;
      }
}
