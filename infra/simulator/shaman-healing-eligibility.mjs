import assert from "node:assert/strict";
import { extractShamanHealingSource } from "./shaman-healing-source.mjs";
import { extractShamanHealingActiveSource } from "./shaman-healing-active-source.mjs";

/** Retain current candidates while excluding the explicitly linked historical raid book.
 * @param {{classSource:object,books:object}} input @returns {object}
 */
export function createShamanHealingSpellPolicy({ classSource, books }) {
  assert.equal(books.schema, "kfc-client-raid-spell-books.v1");
  assert.equal(books.mapped, 27);
  assert.equal(books.unresolved, 0);
  assert.equal(books.books.length, 27);
  assert(books.books.every((entry) => entry.status === "mapped"));
  for (const key of ["build", "manifest", "hotfixSha256", "definitionsRevision"])
    assert.deepEqual(classSource.source[key], books.source[key]);
  const baseline = extractShamanHealingSource(classSource),
    actives = extractShamanHealingActiveSource(classSource),
    linked = new Map(books.books.map((entry) => [entry.spellId, entry]));
  function requiredLevel(id, requiredTalentField) {
    const levels = classSource.rawTables.SpellLevels.filter((entry) => entry.SpellID === id);
    assert.equal(levels.length, 1, "Missing Shaman action level");
    const baseLevel = levels[0].SpellLevel;
    assert(Number.isSafeInteger(baseLevel) && baseLevel > 0);
    if (!requiredTalentField) return baseLevel;
    const talentId = {
        riptide: 408521,
        waterShield: 408510,
        naturesSwiftness: 16188,
        manaTideTotem: 16190,
      }[requiredTalentField],
      talents = classSource.classTalents.filter((entry) => entry.spellId === talentId);
    assert.equal(talents.length, 1);
    assert(talents[0].layoutResolved && talents[0].row >= 0);
    return Math.max(baseLevel, 10 + 5 * talents[0].row);
  }
  const candidates = [
    ...baseline.ranks.map((entry) => ({
      spellId: entry.id,
      family: entry.family,
      rank: entry.rank,
      kind: "heal",
      requiredTalentField: null,
    })),
    ...actives.riptide.map((entry) => ({
      spellId: entry.id,
      family: "riptide",
      rank: entry.rank,
      kind: "heal",
      requiredTalentField: "riptide",
    })),
    ...actives.healingStream.map((entry) => ({
      spellId: entry.id,
      family: "healing-stream",
      rank: entry.rank,
      kind: "totem",
      requiredTalentField: null,
    })),
    ...actives.manaTide.map((entry) => ({
      spellId: entry.id,
      family: "mana-tide",
      rank: entry.rank,
      kind: "totem",
      requiredTalentField: "manaTideTotem",
    })),
    ...[
      [actives.waterShield.id, "water-shield", "waterShield"],
      [actives.naturesSwiftness.id, "natures-swiftness", "naturesSwiftness"],
    ].map(([spellId, family, requiredTalentField]) => ({
      spellId,
      family,
      rank: 1,
      kind: "cooldown",
      requiredTalentField,
    })),
  ];
  assert.equal(candidates.length, 33);
  assert.equal(new Set(candidates.map((entry) => entry.spellId)).size, 33);
  const actions = candidates.map((candidate) => {
    const book = linked.get(candidate.spellId),
      level = requiredLevel(candidate.spellId, candidate.requiredTalentField);
    if (book) {
      assert.equal(candidate.spellId, 25357, "Unreviewed Shaman raid-book action");
      assert.equal(book.itemId, 21291);
      assert.equal(book.spellName, "Healing Wave");
      assert.equal(book.spellRequiredLevel, level);
      assert.equal(book.spellMetadataStatus, "resolved");
      assert(Number.isSafeInteger(book.itemClassMask) && (book.itemClassMask & 64) !== 0);
    }
    return {
      ...candidate,
      requiredLevel: level,
      status: book ? "excluded-known-classic-raid-book" : "conditional-client-candidate",
      bookItemId: book?.itemId ?? null,
      liveTrainingVerified: false,
    };
  });
  assert.equal(
    actions.filter((entry) => entry.status === "excluded-known-classic-raid-book").length,
    1,
  );
  return {
    schema: "kfc-shaman-healing-spell-policy.v1",
    className: "Shaman",
    source: structuredClone(books.source),
    actions,
    retainedCandidatesAreConditional: true,
    historicalRaidBookExclusion: { spellId: 25357, itemId: 21291 },
    liveTrainingVerified: false,
    modelAdmission: false,
    startsNewClassClock: false,
    publicationAllowed: false,
  };
}

/** Conditional candidates still require their level and actual talent ownership.
 * @param {object} policy
 * @param {{level:number,talents?:Record<string,boolean>,allowConditionalCandidates?:boolean}} options
 * @returns {object[]}
 */
export function eligibleShamanHealingActions(
  policy,
  { level, talents = {}, allowConditionalCandidates = false },
) {
  assert.equal(policy.schema, "kfc-shaman-healing-spell-policy.v1");
  assert(Number.isInteger(level) && level >= 1 && level <= 60);
  assert(talents && typeof talents === "object" && !Array.isArray(talents));
  assert.equal(typeof allowConditionalCandidates, "boolean");
  for (const [field, value] of Object.entries(talents)) {
    assert(["riptide", "waterShield", "manaTideTotem", "naturesSwiftness"].includes(field));
    assert.equal(typeof value, "boolean");
  }
  return policy.actions
    .filter(
      (entry) =>
        entry.status === "conditional-client-candidate" &&
        allowConditionalCandidates &&
        entry.requiredLevel <= level &&
        (!entry.requiredTalentField || talents[entry.requiredTalentField] === true),
    )
    .map((entry) => structuredClone(entry));
}

/** Healing priorities cannot use resource cooldowns or unavailable ranked heals.
 * @param {object} policy @param {number[]} spellIds
 * @param {{level:number,talents?:Record<string,boolean>,allowConditionalCandidates?:boolean}} options
 * @returns {void}
 */
export function assertShamanHealingPriorityEligibility(policy, spellIds, options) {
  assert(Array.isArray(spellIds) && spellIds.length > 0);
  const allowed = new Set(
    eligibleShamanHealingActions(policy, options)
      .filter((entry) => entry.kind === "heal")
      .map((entry) => entry.spellId),
  );
  assert(
    spellIds.every((id) => Number.isSafeInteger(id) && allowed.has(id)),
    "Unavailable Shaman healing priority",
  );
}
