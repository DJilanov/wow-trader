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
  assertDruidHealingSpellEligibility,
  createDruidHealingSpellPolicy,
  eligibleDruidHealingRanks,
} from "./druid-healing-spell-policy.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes));
}
const evidence = fixture(
    "druid-client-healing-source.v1.json.gz",
    "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
  ),
  booksSource = fixture(
    "healer-spell-eligibility-source.v1.json.gz",
    "f8ddd54bfe89b584669c3670b545e5caf7643d266506067ab783febc775ff5db",
  ),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(booksSource.atlas.source),
    tables: new Map(Object.entries(booksSource.tables)),
    source: booksSource.source,
  }),
  policy = createDruidHealingSpellPolicy(evidence, books),
  options = {
    level: 60,
    talents: { swiftmend: true, wildGrowth: true },
    allowConditionalCandidates: true,
  };

test("the full healing domain retains 37 conditional pre-raid ranks and two raid-book exclusions", () => {
  assert.equal(policy.ranks.length, 39);
  assert.equal(eligibleDruidHealingRanks(policy, options).length, 37);
  assert.deepEqual(
    policy.ranks
      .filter((rank) => rank.status === "excluded-known-classic-raid-book")
      .map((rank) => rank.spellId)
      .sort((a, b) => a - b),
    [25297, 25299],
  );
  assert.equal(policy.classMechanicsAdmission, false);
  assert.equal(policy.publicationAllowed, false);
});
test("special-spell ranks require their actual current talent and level", () => {
  const untalented = eligibleDruidHealingRanks(policy, { ...options, talents: {} });
  assert.equal(untalented.length, 33);
  assert(!untalented.some((rank) => rank.spellId === 18562 || rank.family === "wild-growth"));
  assert.equal(
    eligibleDruidHealingRanks(policy, { ...options, level: 39 }).filter(
      (rank) => rank.family === "wild-growth",
    ).length,
    0,
  );
  assertDruidHealingSpellEligibility(policy, [9889, 9858, 9841, 9863, 18562, 1238215], options);
  for (const id of [25297, 25299, 999999])
    assert.throws(() => assertDruidHealingSpellEligibility(policy, [id], options));
  assert.throws(() =>
    assertDruidHealingSpellEligibility(policy, [1238215], { ...options, talents: {} }),
  );
});
test("conditional reference acceptance remains explicit and talent flag types are checked", () => {
  assert.deepEqual(
    eligibleDruidHealingRanks(policy, { ...options, allowConditionalCandidates: false }),
    [],
  );
  assert.throws(() => eligibleDruidHealingRanks(policy, { ...options, talents: { swiftmend: 1 } }));
});
