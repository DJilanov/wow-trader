import assert from "node:assert/strict";
import { createDruidBaselineSpellPolicy } from "./druid-healing-eligibility.mjs";
import { extractDruidAdvancedHealing } from "./druid-healing-advanced.mjs";

const requirements = { swiftmend: [18562, "swiftmend"], "wild-growth": [408120, "wildGrowth"] };

/** Combine the baseline and implemented special spells without admitting raid books.
 * @param {object} evidence @param {object} books @returns {object}
 */
export function createDruidHealingSpellPolicy(evidence, books) {
  const baseline = createDruidBaselineSpellPolicy(evidence, books),
    ranks = baseline.ranks.map((rank) => ({ ...rank, requiredTalent: null }));
  for (const rank of extractDruidAdvancedHealing(evidence).ranks) {
    const requirement = requirements[rank.family];
    if (requirement) {
      const talents = evidence.classTalents.filter(
        (talent) => talent.spellId === requirement[0] && talent.layoutResolved,
      );
      assert.equal(talents.length, 1);
      assert.equal(talents[0].maxRanks, 1);
    }
    assert(
      !books.books.some((book) => book.spellId === rank.id),
      "Review new special-spell raid-book acquisition",
    );
    ranks.push({
      spellId: rank.id,
      family: rank.family,
      rank: rank.rank,
      requiredLevel: rank.requiredLevel,
      status: "conditional-client-candidate",
      bookItemId: null,
      liveTrainingVerified: false,
      requiredTalent: requirement ? { spellId: requirement[0], field: requirement[1] } : null,
    });
  }
  assert.equal(new Set(ranks.map((rank) => rank.spellId)).size, 39);
  ranks.sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  return {
    schema: "kfc-druid-healing-spell-policy.v1",
    className: "Druid",
    source: baseline.source,
    ranks,
    retainedCandidatesAreConditional: true,
    liveTrainingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {object} policy @param {{level:number,talents:object,allowConditionalCandidates?:boolean}} options @returns {object[]} */
export function eligibleDruidHealingRanks(
  policy,
  { level, talents, allowConditionalCandidates = false },
) {
  assert.equal(policy.schema, "kfc-druid-healing-spell-policy.v1");
  assert(Number.isInteger(level) && level >= 1 && level <= 60);
  assert(talents && typeof talents === "object" && !Array.isArray(talents));
  assert.equal(typeof allowConditionalCandidates, "boolean");
  for (const field of ["swiftmend", "wildGrowth"])
    assert(talents[field] === undefined || typeof talents[field] === "boolean");
  if (!allowConditionalCandidates) return [];
  return policy.ranks.filter(
    (rank) =>
      rank.status === "conditional-client-candidate" &&
      rank.requiredLevel <= level &&
      (!rank.requiredTalent || talents[rank.requiredTalent.field] === true),
  );
}

/** @param {object} policy @param {number[]} spellIds @param {object} options @returns {void} */
export function assertDruidHealingSpellEligibility(policy, spellIds, options) {
  assert(Array.isArray(spellIds) && spellIds.length > 0);
  const ids = new Set(eligibleDruidHealingRanks(policy, options).map((rank) => rank.spellId));
  for (const id of spellIds)
    assert(ids.has(id), `Druid healing spell ${id} is outside the declared eligibility domain`);
}
