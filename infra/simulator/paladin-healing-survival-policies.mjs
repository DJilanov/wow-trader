import assert from "node:assert/strict";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";

/** Coarse, finite corrections for the diagnosed low-health and late-resource failures.
 * @param {'tank'|'group'} kind @returns {string[]}
 */
export function paladinHealingSurvivalPolicyIds(kind) {
  assert(["tank", "group"].includes(kind));
  return kind === "tank"
    ? ["unchanged", "earlier-resources"]
    : [
        "unchanged",
        "earlier-resources",
        "large-heal",
        "large-heal-earlier-resources",
        "shock-rescue",
        "shock-rescue-earlier-resources",
      ];
}

/** Apply explicit priorities to equal-health synthetic group targets; source spells and acquisition remain authoritative.
 * @param {{frame:object,spellPolicy:object,talents:object,kind:'tank'|'group',policyId:string}} input
 * @returns {object}
 */
export function applyPaladinHealingSurvivalPolicy({ frame, spellPolicy, talents, kind, policyId }) {
  assert(
    paladinHealingSurvivalPolicyIds(kind).includes(policyId),
    "Unreviewed Paladin survival policy",
  );
  assert.equal(frame.schema, "kfc-paladin-healing-workload.v1");
  assert.equal(frame.assignmentScoring, "external-demand-v1");
  assert.equal(frame.requireFullTalentBuild, true);
  assert.equal(frame.allowConditionalSpellCandidates, true);
  assert(Array.isArray(frame.priorities) && frame.priorities.length > 0);
  const result = structuredClone(frame);
  if (policyId === "unchanged") return result;
  if (policyId.includes("earlier-resources")) {
    assert(Array.isArray(result.cooldowns));
    for (const cooldown of result.cooldowns) {
      if (cooldown.itemId === 12662)
        cooldown.minimumMissingMana = Math.min(cooldown.minimumMissingMana ?? 0, 1000);
      if (cooldown.itemId === 13444)
        cooldown.minimumMissingMana = Math.min(cooldown.minimumMissingMana ?? 0, 2000);
    }
  }
  if (policyId.startsWith("large-heal") || policyId.startsWith("shock-rescue")) {
    assert.equal(kind, "group");
    const damagedIds = new Set(result.damage.map((event) => event.raidIndex)),
      recipients = result.targets.filter((target) => damagedIds.has(target.raidIndex));
    assert(recipients.length > 1 && recipients.length === damagedIds.size);
    const maximumHealth = recipients[0].maximumHealth;
    assert(Number.isFinite(maximumHealth) && maximumHealth > 0);
    assert(
      recipients.every((target) => target.maximumHealth === maximumHealth),
      "Group rescue requires explicit equal-health targets",
    );
    assert(
      result.priorities.every((priority) => priority.raidIndex === -1),
      "Group rescue requires global live-target triage",
    );
    const eligible = eligiblePaladinHealingRanks(spellPolicy, {
        level: 60,
        talents: {
          holyShock: Boolean(talents.holyShock),
          lightsVigil: Boolean(talents.lightsVigil),
        },
        allowConditionalCandidates: true,
      }),
      highest = (family) =>
        eligible.filter((rank) => rank.family === family).sort((a, b) => b.rank - a.rank)[0],
      large = highest("holy-light");
    assert(large, "No admitted large healing rank");
    const rescue = [
      { spellId: large.spellId, raidIndex: -1, minimumMissingHealth: maximumHealth * 0.6 },
    ];
    if (policyId.startsWith("shock-rescue")) {
      const shock = highest("holy-shock");
      assert(shock, "Holy Shock rescue requires actual talent ownership");
      rescue.unshift({
        spellId: shock.spellId,
        raidIndex: -1,
        minimumMissingHealth: maximumHealth * 0.75,
      });
    }
    result.priorities = [...rescue, ...result.priorities];
    assert(result.priorities.length <= 32);
  }
  return result;
}
