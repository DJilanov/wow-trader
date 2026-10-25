import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  assertDruidBaselinePriorityEligibility,
  createDruidBaselineSpellPolicy,
  eligibleDruidBaselineRanks,
} from "./druid-healing-eligibility.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 8 * 1024 ** 2 }));
}
const druid = fixture(
    "druid-client-healing-source.v1.json.gz",
    "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
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
  policy = createDruidBaselineSpellPolicy(druid, books),
  options = { level: 60, allowConditionalCandidates: true };

test("real Druid raid-book links exclude the two AQ healing ranks", () => {
  assert.deepEqual(
    policy.ranks
      .filter((rank) => rank.status === "excluded-known-classic-raid-book")
      .map((rank) => rank.spellId)
      .sort((a, b) => a - b),
    [25297, 25299],
  );
  const eligible = eligibleDruidBaselineRanks(policy, options);
  assert.equal(eligible.length, 29);
  assert(
    eligible.some((rank) => rank.spellId === 9889) &&
      eligible.some((rank) => rank.spellId === 9841) &&
      eligible.some((rank) => rank.spellId === 9858),
  );
  assert.equal(policy.classMechanicsAdmission, false);
  assert.equal(policy.liveTrainingVerified, false);
});

test("downranks remain available within the declared level and conditional scope", () => {
  assert.deepEqual(eligibleDruidBaselineRanks(policy, { level: 60 }), []);
  assert.deepEqual(
    eligibleDruidBaselineRanks(policy, { level: 1, allowConditionalCandidates: true }).map(
      (rank) => rank.spellId,
    ),
    [5185],
  );
  assert.throws(() =>
    eligibleDruidBaselineRanks(policy, { level: 61, allowConditionalCandidates: true }),
  );
  assertDruidBaselinePriorityEligibility(policy, [5185, 9889, 9841, 9858], options);
  for (const id of [25297, 25299, 408120, 18562, 999999])
    assert.throws(
      () => assertDruidBaselinePriorityEligibility(policy, [id], options),
      /outside the declared/,
    );
});

test("cross-build or unresolved acquisition evidence fails closed", () => {
  const changed = globalThis.structuredClone(books);
  changed.source.build.buildNumber++;
  assert.throws(() => createDruidBaselineSpellPolicy(druid, changed));
  changed.source = books.source;
  changed.unresolved = 1;
  assert.throws(() => createDruidBaselineSpellPolicy(druid, changed));
});
