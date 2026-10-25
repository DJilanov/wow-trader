import assert from "node:assert/strict";
import { extractPaladinHealingBaseline } from "./paladin-healing-model.mjs";
import { extractPaladinHealingActives } from "./paladin-healing-actives.mjs";

/** Keep source-backed candidate ranks separate from historical raid-book acquisition.
 * @param {{baseline:object,actives:object,books:object}} evidence @returns {object}
 */
export function createPaladinHealingSpellPolicy({ baseline, actives, books }) {
  assert.equal(books.schema, "kfc-client-raid-spell-books.v1");
  assert.equal(books.mapped, 27);
  assert.equal(books.unresolved, 0);
  assert.equal(books.books.length, 27);
  assert(books.books.every((row) => row.status === "mapped"));
  assert.deepEqual(baseline.source.build, books.source.build);
  assert.deepEqual(actives.source.build, books.source.build);
  assert.deepEqual(baseline.source.manifest, books.source.manifest);
  assert.deepEqual(actives.source.manifest, books.source.manifest);
  assert.deepEqual(baseline.source.evidence, actives.source.evidence);
  const linked = new Map(books.books.map((book) => [book.spellId, book]));
  assert.equal(linked.size, 27);
  const basic = extractPaladinHealingBaseline(baseline),
    active = extractPaladinHealingActives(actives);
  const candidates = [
    ...basic.ranks.map((rank) => ({ ...rank, talent: null })),
    ...active.shock.map((rank) => ({
      id: rank.id,
      family: "holy-shock",
      rank: rank.rank,
      requiredLevel: rank.heal.requiredLevel,
      talent: "holyShock",
    })),
    ...active.vigil.map((rank) => ({
      id: rank.id,
      family: "lights-vigil",
      rank: rank.rank,
      requiredLevel: rank.heal.requiredLevel,
      talent: "lightsVigil",
    })),
  ];
  assert.equal(candidates.length, 22);
  assert.equal(new Set(candidates.map((rank) => rank.id)).size, candidates.length);
  const ranks = candidates.map((rank) => {
    const book = linked.get(rank.id);
    if (book) {
      assert.equal(rank.id, 25292, "Unreviewed Paladin healing raid-book rank");
      assert.equal(book.itemId, 21290);
      assert.equal(book.spellName, "Holy Light");
      assert.equal(book.spellMetadataStatus, "resolved");
      assert.equal(book.spellRequiredLevel, rank.requiredLevel);
      assert(Number.isSafeInteger(book.itemClassMask) && (book.itemClassMask & 2) !== 0);
    }
    return {
      spellId: rank.id,
      family: rank.family,
      rank: rank.rank,
      requiredLevel: rank.requiredLevel,
      requiredTalent: rank.talent,
      status: book ? "excluded-known-classic-raid-book" : "conditional-client-candidate",
      bookItemId: book?.itemId ?? null,
      liveTrainingVerified: false,
    };
  });
  assert.equal(
    ranks.filter((rank) => rank.status === "excluded-known-classic-raid-book").length,
    1,
  );
  return {
    schema: "kfc-paladin-healing-spell-policy.v1",
    className: "Paladin",
    source: structuredClone(books.source),
    ranks,
    scope: "basic-and-talented-active-heals-with-historical-raid-book-exclusion",
    retainedCandidatesAreConditional: true,
    liveTrainingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** @param {object} policy @param {{level:number,talents?:{holyShock?:boolean,lightsVigil?:boolean},allowConditionalCandidates?:boolean}} options @returns {object[]} */
export function eligiblePaladinHealingRanks(
  policy,
  { level, talents = {}, allowConditionalCandidates = false },
) {
  assert.equal(policy.schema, "kfc-paladin-healing-spell-policy.v1");
  assert(Number.isInteger(level) && level >= 1 && level <= 60);
  assert.equal(typeof allowConditionalCandidates, "boolean");
  assert(talents && typeof talents === "object" && !Array.isArray(talents));
  for (const [field, value] of Object.entries(talents)) {
    assert(["holyShock", "lightsVigil"].includes(field), "Unsupported Paladin eligibility talent");
    assert.equal(typeof value, "boolean");
  }
  assert(!talents.lightsVigil || talents.holyShock, "Light's Vigil requires Holy Shock");
  if (!allowConditionalCandidates) return [];
  return policy.ranks.filter(
    (rank) =>
      rank.status === "conditional-client-candidate" &&
      rank.requiredLevel <= level &&
      (rank.requiredTalent === null || talents[rank.requiredTalent] === true),
  );
}

/** @param {object} policy @param {number[]} spellIds @param {object} options @returns {void} */
export function assertPaladinHealingPriorityEligibility(policy, spellIds, options) {
  assert(Array.isArray(spellIds) && spellIds.length > 0);
  const eligible = new Set(
    eligiblePaladinHealingRanks(policy, options).map((rank) => rank.spellId),
  );
  for (const spellId of spellIds)
    assert(
      eligible.has(spellId),
      `Paladin priority ${spellId} is outside the declared spell domain`,
    );
}
