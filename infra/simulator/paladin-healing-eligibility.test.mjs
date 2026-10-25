import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  createPaladinHealingSpellPolicy,
  eligiblePaladinHealingRanks,
  assertPaladinHealingPriorityEligibility,
} from "./paladin-healing-eligibility.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 8 * 1024 ** 2 }));
}
const baseline = fixture(
    "paladin-baseline-source.v1.json.gz",
    "2b222889cae0e61bb4bb93ef957620ce1a93be248e0514e72d759a3b26c4ff0d",
  ),
  actives = fixture(
    "paladin-healing-actives-source.v1.json.gz",
    "3c65be557d4f61b2160013d3211ab3ee03f0b03173f399feb5c28f4adcfb531a",
  ),
  captured = fixture(
    "healer-spell-eligibility-source.v1.json.gz",
    "f8ddd54bfe89b584669c3670b545e5caf7643d266506067ab783febc775ff5db",
  ),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(captured.atlas.source),
    tables: new Map(Object.entries(captured.tables)),
    source: captured.source,
  }),
  policy = createPaladinHealingSpellPolicy({ baseline, actives, books }),
  options = {
    level: 60,
    talents: { holyShock: true, lightsVigil: true },
    allowConditionalCandidates: true,
  };

test("excludes actual Holy Light IX learning book while retaining basic downranks and seven active roots", () => {
  assert.equal(policy.ranks.length, 22);
  assert.deepEqual(
    policy.ranks
      .filter((row) => row.status === "excluded-known-classic-raid-book")
      .map((row) => [row.spellId, row.bookItemId]),
    [[25292, 21290]],
  );
  assert.equal(eligiblePaladinHealingRanks(policy, options).length, 21);
  assertPaladinHealingPriorityEligibility(
    policy,
    [635, 1042, 10329, 19943, 20930, 1311595],
    options,
  );
  for (const spellId of [25292, 25903, 1311596, 20216, 999999])
    assert.throws(
      () => assertPaladinHealingPriorityEligibility(policy, [spellId], options),
      /outside the declared/,
    );
  assert.equal(policy.liveTrainingVerified, false);
  assert.equal(policy.classMechanicsAdmission, false);
});

test("requires explicit conditional scope, level and the actual owning talents", () => {
  assert.deepEqual(eligiblePaladinHealingRanks(policy, { level: 60 }), []);
  assert.equal(eligiblePaladinHealingRanks(policy, { ...options, talents: {} }).length, 14);
  assert.deepEqual(
    eligiblePaladinHealingRanks(policy, { ...options, level: 1 }).map((row) => row.spellId),
    [635],
  );
  assert.equal(
    eligiblePaladinHealingRanks(policy, { ...options, level: 39 }).some(
      (row) => row.family === "lights-vigil",
    ),
    false,
  );
  assert.throws(() => eligiblePaladinHealingRanks(policy, { ...options, level: 61 }));
  assert.throws(() =>
    eligiblePaladinHealingRanks(policy, { ...options, talents: { lightsVigil: true } }),
  );
  assert.throws(() =>
    eligiblePaladinHealingRanks(policy, { ...options, talents: { holyShock: 1 } }),
  );
});

test("rejects cross-build, incomplete or ambiguous acquisition evidence", () => {
  for (const change of [
    (input) => {
      input.books.source.build.buildNumber++;
    },
    (input) => {
      input.actives.source.manifest.byteSha256 = "0".repeat(64);
    },
    (input) => {
      input.baseline.source.evidence.byteSha256 = "0".repeat(64);
    },
    (input) => {
      input.books.unresolved = 1;
    },
    (input) => {
      input.books.books.find((row) => row.spellId === 25292).spellMetadataStatus =
        "missing-or-ambiguous";
    },
    (input) => {
      input.books.books[0] = input.books.books[1];
    },
  ]) {
    const input = structuredClone({ baseline, actives, books });
    change(input);
    assert.throws(() => createPaladinHealingSpellPolicy(input));
  }
});

test("does not mutate source evidence or the saved policy", () => {
  const before = JSON.stringify({ baseline, actives, books, policy });
  createPaladinHealingSpellPolicy({ baseline, actives, books });
  eligiblePaladinHealingRanks(policy, options);
  assert.equal(JSON.stringify({ baseline, actives, books, policy }), before);
});
