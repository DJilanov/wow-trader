import assert from "node:assert/strict";
import { extractPriestHealingBaseline } from "./priest-healing-model.mjs";
import { extractPriestActiveHealing } from "./priest-healing-active-spells-model.mjs";
import { extractPriestHealingBenchmarkMechanics } from "./priest-healing-benchmark-model.mjs";

/** Read the installed addon's explicitly scoped Classic raid-book reference.
 * @param {string} source @returns {object}
 */
export function extractClassicRaidSpellBooks(source) {
  const text = source.replaceAll("\r\n", "\n");
  const instance = text.indexOf('data["TheRuinsofAhnQiraj"] = {');
  const start = text.indexOf("{ -- AQ20ClassBooks", instance);
  const end = text.indexOf("\n\t\tAQ_SCARABS", start);
  assert(instance >= 0 && start > instance && end > start, "Missing Classic AQ raid-book section");
  const itemsStart = text.indexOf("\n\titems = {", instance);
  assert(itemsStart > instance && itemsStart < start, "Missing Classic raid header");
  const header = text.slice(instance, itemsStart);
  assert(/MapID\s*=\s*3429,/.test(header));
  assert(/ContentType\s*=\s*RAID20_CONTENT,/.test(header));
  const section = text.slice(start, end);
  const books = [...section.matchAll(/\{\s*\d+,\s*(\d+)\s*\},\s*--\s*([^\n]+)/g)]
    .map((match) => ({ itemId: Number(match[1]), label: match[2].trim() }))
    .sort((a, b) => a.itemId - b.itemId);
  assert.equal(books.length, 27, "Unreviewed Classic raid-book reference changed");
  assert.equal(new Set(books.map((row) => row.itemId)).size, books.length);
  return {
    schema: "kfc-classic-raid-spell-books.v1",
    zoneId: 3429,
    books,
    sourceScope: "historical-classic-raid-reference",
    foreverAcquisitionVerified: false,
  };
}

function assertSourceIdentity(source) {
  assert.equal(source.build.product, "wow_classic_beta");
  assert(/^1\.60\.1\.\d+$/.test(source.build.clientVersion));
  assert.equal(Number(source.build.clientVersion.split(".").at(-1)), source.build.buildNumber);
  for (const field of ["buildKey", "cdnKey"])
    assert(/^[a-f0-9]{32}$/.test(source.build[field]), `Invalid client ${field}`);
  assert(/^[a-f0-9]{64}$/.test(source.manifest.byteSha256));
  assert(/^[a-f0-9]{64}$/.test(source.hotfixSha256));
  assert(/^[a-f0-9]{40}$/.test(source.definitionsRevision));
}

/** Trace the current client's item-learning encoding without inferring server loot/trainer sources.
 * @param {{reference: object, tables: Map<string, object[]>, source: object}} input
 * @returns {object}
 */
export function linkClientRaidSpellBooks({ reference, tables, source }) {
  assert.equal(reference.schema, "kfc-classic-raid-spell-books.v1");
  assert.equal(reference.zoneId, 3429);
  assert.equal(reference.books.length, 27);
  assertSourceIdentity(source);
  const rows = (name) => {
    assert(tables.has(name), `Missing spell-acquisition table: ${name}`);
    const result = tables.get(name);
    assert(Array.isArray(result), `Invalid spell-acquisition table: ${name}`);
    assert.equal(new Set(result.map((row) => row.id)).size, result.length, `Duplicate ${name} IDs`);
    return result;
  };
  const items = new Map(rows("ItemSparse").map((row) => [row.id, row]));
  const effects = new Map(rows("ItemEffect").map((row) => [row.id, row]));
  const links = rows("ItemXItemEffect"),
    spellEffects = rows("SpellEffect");
  const names = new Map(rows("SpellName").map((row) => [row.id, row.Name_lang]));
  const levels = rows("SpellLevels"),
    abilities = rows("SkillLineAbility");
  const books = reference.books.map((book) => {
    const item = items.get(book.itemId);
    const itemLinks = links.filter((row) => row.ItemID === book.itemId);
    const itemEffects = itemLinks.map((row) => effects.get(row.ItemEffectID));
    const learned = itemEffects.filter(
      (row) => row?.TriggerType === 6 && Number.isSafeInteger(row.SpellID) && row.SpellID > 0,
    );
    const readers = itemEffects.filter(
      (row) =>
        row?.TriggerType === 0 &&
        spellEffects.some((effect) => effect.SpellID === row.SpellID && effect.Effect === 36),
    );
    if (!item || itemEffects.some((row) => !row) || learned.length !== 1 || readers.length !== 1)
      return {
        ...book,
        status: "unresolved",
        reason: "Missing or unsupported item-learning records",
      };
    const spellId = learned[0].SpellID;
    const spellLevels = levels.filter((row) => row.SpellID === spellId);
    const metadataResolved = names.has(spellId) && spellLevels.length === 1;
    return {
      ...book,
      status: "mapped",
      itemName: item.Display_lang,
      itemRequiredLevel: item.RequiredLevel,
      itemClassMask: item.AllowableClass,
      spellId,
      spellName: names.get(spellId) ?? null,
      spellRequiredLevel: spellLevels.length === 1 ? spellLevels[0].SpellLevel : null,
      spellMetadataStatus: metadataResolved ? "resolved" : "missing-or-ambiguous",
      readerSpellId: readers[0].SpellID,
      readerEffectId: readers[0].id,
      learnedEffectId: learned[0].id,
      learningEncoding: "item-effect-trigger-6",
      classAbilityRows: abilities.filter((row) => row.Spell === spellId),
      historicalAcquisition: "classic-raid-book",
      foreverAcquisitionVerified: false,
    };
  });
  return {
    schema: "kfc-client-raid-spell-books.v1",
    source: globalThis.structuredClone(source),
    books,
    mapped: books.filter((row) => row.status === "mapped").length,
    unresolved: books.filter((row) => row.status === "unresolved").length,
    resolvedSpellMetadata: books.filter((row) => row.spellMetadataStatus === "resolved").length,
    encodingReference:
      "https://raw.githubusercontent.com/TrinityCore/TrinityCore/3.3.5/src/server/game/Entities/Item/ItemTemplate.h",
    foreverAcquisitionVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

const talentRequirements = {
  "binding-heal": [401937, "bindingHeal"],
  penance: [402174, "penance"],
  "prayer-of-mending": [401859, "prayerOfMending"],
  "holy-nova": [15237, "holyNova"],
};

/** Define a conservative reference domain; retained class rows are not proof of live trainer access.
 * @param {object} evidence @param {object} bookLinks @returns {object}
 */
export function createPriestHealingSpellPolicy(evidence, bookLinks) {
  assert.equal(evidence.className, "Priest");
  assert.equal(bookLinks.schema, "kfc-client-raid-spell-books.v1");
  assertSourceIdentity(evidence.source);
  assertSourceIdentity(bookLinks.source);
  for (const field of ["hotfixSha256", "definitionsRevision"])
    assert.equal(evidence.source[field], bookLinks.source[field], `Spell source ${field} differs`);
  assert.deepEqual(evidence.source.build, bookLinks.source.build, "Spell source build differs");
  assert.equal(
    evidence.source.manifest.byteSha256,
    bookLinks.source.manifest.byteSha256,
    "Spell source manifest differs",
  );
  assert.equal(bookLinks.mapped, 27);
  assert.equal(
    bookLinks.unresolved,
    0,
    "Resolve every referenced raid book before defining the study domain",
  );
  assert.equal(bookLinks.books.length, 27);
  assert(bookLinks.books.every((row) => row.status === "mapped"));
  const books = new Map(bookLinks.books.map((row) => [row.spellId, row]));
  const candidates = [
    ...extractPriestHealingBaseline(evidence).ranks,
    ...extractPriestActiveHealing(evidence).ranks,
    ...extractPriestHealingBenchmarkMechanics(evidence).nova.map((row) => ({
      id: row.damage.id,
      family: "holy-nova",
      rank: row.rank,
      requiredLevel: row.damage.requiredLevel,
    })),
  ];
  assert.equal(candidates.length, 63);
  assert.equal(new Set(candidates.map((row) => row.id)).size, candidates.length);
  const ranks = candidates
    .map((row) => {
      const requirement = talentRequirements[row.family];
      if (requirement) {
        const talents = evidence.classTalents.filter(
          (talent) => talent.spellId === requirement[0] && talent.layoutResolved,
        );
        assert.equal(talents.length, 1);
        assert.equal(talents[0].maxRanks, 1);
      }
      const book = books.get(row.id);
      return {
        spellId: row.id,
        family: row.family,
        rank: row.rank,
        requiredLevel: row.requiredLevel,
        requiredTalent: requirement ? { spellId: requirement[0], field: requirement[1] } : null,
        status: book ? "excluded-known-classic-raid-book" : "conditional-client-candidate",
        bookItemId: book?.itemId ?? null,
        liveTrainingVerified: false,
      };
    })
    .sort((a, b) => a.family.localeCompare(b.family) || a.rank - b.rank);
  assert.equal(ranks.filter((row) => row.status === "excluded-known-classic-raid-book").length, 3);
  return {
    schema: "kfc-priest-healing-spell-policy.v1",
    className: "Priest",
    source: globalThis.structuredClone(bookLinks.source),
    ranks,
    scope: "current-client-candidates-with-historical-raid-book-exclusions",
    retainedCandidatesAreConditional: true,
    liveTrainingVerified: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Preserve downranks and require explicit acceptance of the conditional reference domain.
 * @param {object} policy
 * @param {{level: number, talents: object, allowConditionalCandidates?: boolean}} options
 * @returns {object[]}
 */
export function eligiblePriestHealingRanks(
  policy,
  { level, talents, allowConditionalCandidates = false },
) {
  assert.equal(policy.schema, "kfc-priest-healing-spell-policy.v1");
  assert(Number.isInteger(level) && level >= 1 && level <= 60);
  assert(talents && typeof talents === "object" && !Array.isArray(talents));
  assert.equal(typeof allowConditionalCandidates, "boolean");
  for (const [, field] of Object.values(talentRequirements))
    assert(
      talents[field] === undefined || typeof talents[field] === "boolean",
      `Invalid healing talent flag: ${field}`,
    );
  if (!allowConditionalCandidates) return [];
  return policy.ranks.filter(
    (row) =>
      row.status === "conditional-client-candidate" &&
      row.requiredLevel <= level &&
      (!row.requiredTalent || talents[row.requiredTalent.field] === true),
  );
}

/** Refuse ineligible priority IDs before a study reaches the otherwise unrestricted benchmark engine.
 * @param {object} policy @param {object} workload @param {object} options @returns {void}
 */
export function assertPriestHealingPriorityEligibility(policy, workload, options) {
  assert.equal(workload.schema, "kfc-healing-workload.v1");
  assert(Array.isArray(workload.priorities) && workload.priorities.length > 0);
  const eligible = new Set(eligiblePriestHealingRanks(policy, options).map((row) => row.spellId));
  for (const row of workload.priorities)
    assert(
      eligible.has(row.spellId),
      `Healing priority ${row.spellId} is outside the declared spell eligibility domain`,
    );
}
