import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  assertPriestHealingPriorityEligibility,
  createPriestHealingSpellPolicy,
  eligiblePriestHealingRanks,
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 8 * 1024 ** 2 }));
}
const captured = fixture(
    "healer-spell-eligibility-source.v1.json.gz",
    "f8ddd54bfe89b584669c3670b545e5caf7643d266506067ab783febc775ff5db",
  ),
  priest = fixture(
    "priest-client-healing-source.v1.json.gz",
    "e4ed880f99c62ca8de42ee1f20e22800541df6849d90e56b15811b4d0e3940ab",
  ),
  reference = extractClassicRaidSpellBooks(captured.atlas.source),
  tables = new Map(Object.entries(captured.tables)),
  links = linkClientRaidSpellBooks({ reference, tables, source: captured.source }),
  policy = createPriestHealingSpellPolicy(priest, links),
  options = {
    level: 60,
    talents: { bindingHeal: true, penance: true, prayerOfMending: true, holyNova: true },
    allowConditionalCandidates: true,
  },
  workload = (ids) => ({
    schema: "kfc-healing-workload.v1",
    priorities: ids.map((spellId) => ({ spellId })),
  });

test("the installed AQ20 reference scopes 27 books to historical Classic raid acquisition", () => {
  assert.equal(reference.books.length, 27);
  assert.equal(reference.zoneId, 3429);
  assert.equal(reference.sourceScope, "historical-classic-raid-reference");
  assert.equal(reference.foreverAcquisitionVerified, false);
  assert.deepEqual(
    extractClassicRaidSpellBooks(captured.atlas.source.replaceAll("\r\n", "\n")),
    reference,
  );
  assert.throws(() =>
    extractClassicRaidSpellBooks(
      captured.atlas.source.replace("RAID20_CONTENT", "DUNGEON_CONTENT"),
    ),
  );
  assert.throws(() =>
    extractClassicRaidSpellBooks(captured.atlas.source.replace(/\{ 1,\s+21284 \}/, "{}")),
  );
});

test("all 27 books link through the generic reader and separate learned-spell effect", () => {
  assert.equal(links.mapped, 27);
  assert.equal(links.unresolved, 0);
  assert(links.books.every((row) => row.readerSpellId === 402265));
  const readerEffects = captured.tables.SpellEffect.filter(
    (row) => row.SpellID === 402265 && row.Effect === 36,
  );
  assert.equal(readerEffects.length, 1);
  assert.equal(readerEffects[0].EffectTriggerSpell, 0);
  for (const row of links.books) {
    assert.equal(row.learningEncoding, "item-effect-trigger-6");
    assert.equal(row.foreverAcquisitionVerified, false);
  }
  assert.equal(links.books.find((row) => row.itemId === 21284).spellId, 25314);
  assert.equal(links.classMechanicsAdmission, false);
  assert.equal(links.publicationAllowed, false);
});

test("a learning link is not proof that its target still has live spell metadata", () => {
  const multiShot = links.books.find((row) => row.itemId === 21304);
  assert.equal(multiShot.status, "mapped");
  assert.equal(multiShot.spellId, 25294);
  assert.equal(multiShot.spellName, null);
  assert.equal(multiShot.spellMetadataStatus, "missing-or-ambiguous");
  assert.equal(links.resolvedSpellMetadata, 26);
});

test("missing, duplicate and unsupported learning records fail closed", () => {
  for (const mutation of ["missing", "ambiguous", "wrong-trigger", "no-reader"]) {
    const changed = globalThis.structuredClone(captured.tables),
      book = links.books.find((row) => row.itemId === 21284),
      effect = changed.ItemEffect.find((row) => row.id === book.learnedEffectId);
    if (mutation === "missing")
      changed.ItemEffect = changed.ItemEffect.filter((row) => row !== effect);
    else if (mutation === "wrong-trigger") effect.TriggerType = 2;
    else if (mutation === "no-reader") changed.SpellEffect = [];
    else {
      changed.ItemEffect.push({ ...effect, id: 99999990 });
      changed.ItemXItemEffect.push({ id: 99999991, ItemID: 21284, ItemEffectID: 99999990 });
    }
    const result = linkClientRaidSpellBooks({
      reference,
      tables: new Map(Object.entries(changed)),
      source: captured.source,
    });
    assert(result.unresolved > 0, mutation);
    assert.equal(result.books.find((row) => row.itemId === 21284).status, "unresolved");
    assert.throws(() => createPriestHealingSpellPolicy(priest, result));
  }
  const duplicate = globalThis.structuredClone(captured.tables);
  duplicate.ItemSparse.push(duplicate.ItemSparse[0]);
  assert.throws(
    () =>
      linkClientRaidSpellBooks({
        reference,
        tables: new Map(Object.entries(duplicate)),
        source: captured.source,
      }),
    /Duplicate ItemSparse/,
  );
});

test("client class membership and AcquireMethod zero do not bypass historical raid-book exclusion", () => {
  const excluded = policy.ranks.filter((row) => row.bookItemId !== null);
  assert.deepEqual(
    excluded.map((row) => [row.spellId, row.rank, row.bookItemId]),
    [
      [25314, 5, 21284],
      [25316, 5, 21287],
      [25315, 10, 21285],
    ],
  );
  for (const row of excluded) {
    assert.equal(row.status, "excluded-known-classic-raid-book");
    assert(
      priest.rootAbilityRows.some(
        (ability) =>
          ability.Spell === row.spellId && ability.AcquireMethod === 0 && ability.ClassMask === 16,
      ),
    );
  }
  assert.equal(policy.ranks.length, 63);
  assert.equal(eligiblePriestHealingRanks(policy, options).length, 60);
  for (const id of [10965, 10929, 10961])
    assert(eligiblePriestHealingRanks(policy, options).some((row) => row.spellId === id));
});

test("conditional ranks require explicit acceptance and retain every eligible downrank", () => {
  assert.deepEqual(eligiblePriestHealingRanks(policy, { level: 60, talents: {} }), []);
  assert.equal(policy.retainedCandidatesAreConditional, true);
  assert.equal(policy.liveTrainingVerified, false);
  assert.equal(policy.publicationAllowed, false);
  assert.equal(policy.classMechanicsAdmission, false);
  const eligible = eligiblePriestHealingRanks(policy, options);
  assert(eligible.every((row) => row.liveTrainingVerified === false));
  assert.deepEqual(
    eligible.filter((row) => row.family === "greater-heal").map((row) => row.rank),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    eligible.filter((row) => row.family === "renew").map((row) => row.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("level and explicit talent gates apply independently to all ranks", () => {
  const untalented = eligiblePriestHealingRanks(policy, { ...options, talents: {} });
  assert(untalented.every((row) => row.requiredTalent === null));
  for (const field of Object.keys(options.talents)) {
    const one = eligiblePriestHealingRanks(policy, { ...options, talents: { [field]: true } });
    assert(one.length > untalented.length);
    assert(one.every((row) => row.requiredTalent === null || row.requiredTalent.field === field));
  }
  const lowLevel = eligiblePriestHealingRanks(policy, { ...options, level: 10 });
  assert(lowLevel.length > 0);
  assert(lowLevel.every((row) => row.requiredLevel <= 10));
  assert.throws(() => eligiblePriestHealingRanks(policy, { ...options, level: 61 }));
  assert.throws(() => eligiblePriestHealingRanks(policy, { ...options, talents: { penance: 1 } }));
  assert.throws(() =>
    eligiblePriestHealingRanks(policy, { ...options, allowConditionalCandidates: "true" }),
  );
});

test("study priorities reject every excluded, unknown or untalented rank before execution", () => {
  assert.doesNotThrow(() =>
    assertPriestHealingPriorityEligibility(
      policy,
      workload(eligiblePriestHealingRanks(policy, options).map((row) => row.spellId)),
      options,
    ),
  );
  for (const id of [25314, 25315, 25316, 99999999])
    assert.throws(
      () => assertPriestHealingPriorityEligibility(policy, workload([id]), options),
      /outside the declared/,
    );
  const penance = policy.ranks.find((row) => row.family === "penance").spellId;
  assert.throws(
    () =>
      assertPriestHealingPriorityEligibility(policy, workload([penance]), {
        ...options,
        talents: {},
      }),
    /outside the declared/,
  );
  assert.throws(() => assertPriestHealingPriorityEligibility(policy, workload([]), options));
  assert.throws(() =>
    assertPriestHealingPriorityEligibility(policy, workload([10965]), { level: 60, talents: {} }),
  );
});

test("build, hotfix, manifest and definitions mismatches cannot be combined into one policy", () => {
  for (const mutate of [
    (value) => {
      value.build.cdnKey = "1".repeat(32);
    },
    (value) => {
      value.build.clientVersion = "1.60.1.70533";
      value.build.buildNumber = 70533;
    },
    (value) => {
      value.hotfixSha256 = "1".repeat(64);
    },
    (value) => {
      value.manifest.byteSha256 = "1".repeat(64);
    },
    (value) => {
      value.definitionsRevision = "1".repeat(40);
    },
  ]) {
    const changed = globalThis.structuredClone(links);
    mutate(changed.source);
    assert.throws(() => createPriestHealingSpellPolicy(priest, changed), /differs/);
  }
});

test("extraction, policy creation and filtering are deterministic without modifying captured inputs", () => {
  const before = JSON.stringify({ captured, priest, links, policy });
  assert.deepEqual(linkClientRaidSpellBooks({ reference, tables, source: captured.source }), links);
  assert.deepEqual(createPriestHealingSpellPolicy(priest, links), policy);
  eligiblePriestHealingRanks(policy, options);
  assert.equal(JSON.stringify({ captured, priest, links, policy }), before);
});
