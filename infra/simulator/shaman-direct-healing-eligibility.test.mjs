import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createShamanHealingSpellPolicy } from "./shaman-healing-eligibility.mjs";
import {
  assertShamanDirectPriorityEligibility,
  eligibleShamanDirectRanks,
} from "./shaman-direct-healing-eligibility.mjs";

function fixture(name, checksum) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum);
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 8 * 1024 ** 2 }));
}
const classSource = fixture(
    "shaman-client-healing-source.v1.json.gz",
    "3253264da0af56c7abeb9541e463751766140df618134508068d459fb6c2be13",
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
  policy = createShamanHealingSpellPolicy({ classSource, books }),
  options = { level: 60, allowConditionalCandidates: true };

test("direct scope composes the current full policy and keeps fifteen conditional downranks", () => {
  assert(policy.actions.some((action) => action.family === "chain-heal"));
  const before = JSON.stringify(policy),
    ranks = eligibleShamanDirectRanks(policy, options);
  assert.equal(ranks.length, 15);
  assert.equal(ranks.filter((rank) => rank.family === "healing-wave").length, 9);
  assert.equal(ranks.filter((rank) => rank.family === "lesser-healing-wave").length, 6);
  assert(!ranks.some((rank) => rank.spellId === 25357));
  assert.equal(JSON.stringify(policy), before);
});

test("full-policy acknowledgment and level restrictions still apply to direct controls", () => {
  assert.deepEqual(eligibleShamanDirectRanks(policy, { level: 60 }), []);
  assert.deepEqual(
    eligibleShamanDirectRanks(policy, { level: 1, allowConditionalCandidates: true }).map(
      (rank) => rank.spellId,
    ),
    [331],
  );
  assert.throws(() => eligibleShamanDirectRanks(policy, { level: 61 }));
  assert.throws(() =>
    assertShamanDirectPriorityEligibility(policy, [10468], {
      level: 59,
      allowConditionalCandidates: true,
    }),
  );
});

test("direct priorities reject raid books and all non-direct actions even with their talents", () => {
  const allTalents = {
    ...options,
    talents: { riptide: true, waterShield: true, naturesSwiftness: true, manaTideTotem: true },
  };
  assertShamanDirectPriorityEligibility(policy, [331, 10396, 8004, 10468], allTalents);
  for (const id of [25357, 1064, 10622, 10623, 408521, 1239242, 5394, 16188, 999999])
    assert.throws(
      () => assertShamanDirectPriorityEligibility(policy, [id], allTalents),
      /outside the declared/,
    );
  assert.throws(() => assertShamanDirectPriorityEligibility(policy, [], allTalents));
});
