import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  assertShamanHealingPriorityEligibility,
  createShamanHealingSpellPolicy,
  eligibleShamanHealingActions,
} from "./shaman-healing-eligibility.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  classSource = fixture("shaman-client-healing-source.v1.json.gz"),
  source = fixture("healer-spell-eligibility-source.v1.json.gz"),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(source.atlas.source),
    tables: new Map(Object.entries(source.tables)),
    source: source.source,
  }),
  policy = createShamanHealingSpellPolicy({ classSource, books }),
  full = {
    level: 60,
    talents: { riptide: true, waterShield: true, naturesSwiftness: true, manaTideTotem: true },
    allowConditionalCandidates: true,
  };

test("Shaman pre-raid policy explicitly excludes the mapped Healing Wave X raid book", () => {
  assert.equal(policy.actions.length, 33);
  const excluded = policy.actions.filter(
    (entry) => entry.status === "excluded-known-classic-raid-book",
  );
  assert.equal(excluded.length, 1);
  assert.deepEqual([excluded[0].spellId, excluded[0].bookItemId], [25357, 21291]);
  assert.equal(eligibleShamanHealingActions(policy, full).length, 32);
  assert(!eligibleShamanHealingActions(policy, full).some((entry) => entry.spellId === 25357));
  assert.throws(() => assertShamanHealingPriorityEligibility(policy, [25357], full));
  assert.equal(policy.modelAdmission, false);
  assert.equal(policy.startsNewClassClock, false);
});

test("Shaman candidate access needs explicit conditional opt-in and real talent ownership", () => {
  assert.deepEqual(
    eligibleShamanHealingActions(policy, { ...full, allowConditionalCandidates: false }),
    [],
  );
  const untalented = eligibleShamanHealingActions(policy, {
    level: 60,
    allowConditionalCandidates: true,
  });
  assert.equal(untalented.length, 23);
  assert(untalented.every((entry) => !entry.requiredTalentField));
  assertShamanHealingPriorityEligibility(policy, [331, 10468, 10623], full);
  assertShamanHealingPriorityEligibility(policy, [1239243], full);
  assert.throws(() =>
    assertShamanHealingPriorityEligibility(policy, [1239243], { ...full, talents: {} }),
  );
});

test("talent tier gates and rank levels retain the earliest legal action level", () => {
  for (const [id, level] of [
    [408521, 40],
    [1239242, 50],
    [1239243, 60],
    [408510, 20],
    [16188, 30],
    [16190, 25],
    [1325256, 58],
  ]) {
    assert.equal(policy.actions.find((entry) => entry.spellId === id).requiredLevel, level);
    assert(
      !eligibleShamanHealingActions(policy, { ...full, level: level - 1 }).some(
        (entry) => entry.spellId === id,
      ),
    );
    assert(
      eligibleShamanHealingActions(policy, { ...full, level }).some(
        (entry) => entry.spellId === id,
      ),
    );
  }
});

test("resource cooldowns and totems cannot silently enter the direct healing priority list", () => {
  for (const id of [408510, 16188, 1325256, 10463]) {
    assert(eligibleShamanHealingActions(policy, full).some((entry) => entry.spellId === id));
    assert.throws(() => assertShamanHealingPriorityEligibility(policy, [id], full));
  }
  assert.throws(() => assertShamanHealingPriorityEligibility(policy, [], full));
});

test("Shaman eligibility rejects mismatched source identities and malformed ownership settings", () => {
  const changed = structuredClone(books);
  changed.source.build.buildNumber += 1;
  assert.throws(() => createShamanHealingSpellPolicy({ classSource, books: changed }));
  for (const options of [
    { ...full, level: 61 },
    { ...full, level: 0 },
    { ...full, talents: { unknown: true } },
    { ...full, talents: { riptide: 1 } },
    { ...full, allowConditionalCandidates: "yes" },
  ])
    assert.throws(() => eligibleShamanHealingActions(policy, options));
  const original = JSON.stringify(policy),
    rows = eligibleShamanHealingActions(policy, full);
  rows[0].requiredLevel = 1;
  assert.equal(JSON.stringify(policy), original);
});
