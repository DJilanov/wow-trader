import assert from "node:assert/strict";
import { extractDruidHealingBaseline } from "./druid-healing-model.mjs";

/** Keep the baseline candidate domain separate from historical raid-book ranks.
 * @param {object} evidence @param {object} books @returns {object}
 */
export function createDruidBaselineSpellPolicy(evidence, books) {
  assert.equal(books.schema, "kfc-client-raid-spell-books.v1");
  assert.equal(books.mapped, 27);
  assert.equal(books.unresolved, 0);
  assert.equal(books.books.length, 27);
  assert(books.books.every((book) => book.status === "mapped"));
  assert.deepEqual(evidence.source.build, books.source.build);
  assert.equal(evidence.source.manifest.byteSha256, books.source.manifest.byteSha256);
  for (const field of ["hotfixSha256", "definitionsRevision"])
    assert.equal(evidence.source[field], books.source[field]);
  const linked = new Map(books.books.map((book) => [book.spellId, book]));
  assert.equal(linked.size, 27);
  const ranks = extractDruidHealingBaseline(evidence).ranks.map((rank) => {
    const book = linked.get(rank.id);
    if (book) {
      assert(Number.isSafeInteger(book.itemClassMask) && (book.itemClassMask & 1024) !== 0);
      assert.equal(book.spellMetadataStatus, "resolved");
    }
    return {
      spellId: rank.id,
      family: rank.family,
      rank: rank.rank,
      requiredLevel: rank.requiredLevel,
      status: book ? "excluded-known-classic-raid-book" : "conditional-client-candidate",
      bookItemId: book?.itemId ?? null,
      liveTrainingVerified: false,
    };
  });
  assert.equal(
    ranks.filter((rank) => rank.status === "excluded-known-classic-raid-book").length,
    2,
  );
  return {
    schema: "kfc-druid-baseline-spell-policy.v1",
    className: "Druid",
    source: globalThis.structuredClone(books.source),
    ranks,
    scope: "three-baseline-families-with-historical-raid-book-exclusions",
    retainedCandidatesAreConditional: true,
    liveTrainingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {object} policy @param {{level:number,allowConditionalCandidates?:boolean}} options @returns {object[]} */
export function eligibleDruidBaselineRanks(policy, { level, allowConditionalCandidates = false }) {
  assert.equal(policy.schema, "kfc-druid-baseline-spell-policy.v1");
  assert(Number.isInteger(level) && level >= 1 && level <= 60);
  assert.equal(typeof allowConditionalCandidates, "boolean");
  if (!allowConditionalCandidates) return [];
  return policy.ranks.filter(
    (rank) => rank.status === "conditional-client-candidate" && rank.requiredLevel <= level,
  );
}

/** @param {object} policy @param {number[]} spellIds @param {object} options @returns {void} */
export function assertDruidBaselinePriorityEligibility(policy, spellIds, options) {
  assert(Array.isArray(spellIds) && spellIds.length > 0);
  const eligible = new Set(eligibleDruidBaselineRanks(policy, options).map((rank) => rank.spellId));
  for (const id of spellIds)
    assert(eligible.has(id), `Druid priority ${id} is outside the declared baseline spell domain`);
}
