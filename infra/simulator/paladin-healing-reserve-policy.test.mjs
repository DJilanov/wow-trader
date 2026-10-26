import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createPaladinHealingSpellPolicy } from "./paladin-healing-eligibility.mjs";
import {
  applyPaladinHealingReservePolicy,
  paladinHealingReservePolicyIds,
} from "./paladin-healing-reserve-policy.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("fixtures/" + name, import.meta.url))));
const baseline = fixture("paladin-baseline-source.v1.json.gz"),
  actives = fixture("paladin-healing-actives-source.v1.json.gz"),
  books = fixture("healer-spell-eligibility-source.v1.json.gz");
const spellPolicy = createPaladinHealingSpellPolicy({
  baseline,
  actives,
  books: linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(books.atlas.source),
    tables: new Map(Object.entries(books.tables)),
    source: books.source,
  }),
});
const group = fixture("paladin-survival-policy-controls.v1.json.gz").cases.find(
  (row) => row.kind === "group",
);
const apply = (input, policyId) =>
  applyPaladinHealingReservePolicy({ ...input, spellPolicy, policyId });

test("three fixed group proposals preserve the complete unchanged workload", () => {
  assert.deepEqual(paladinHealingReservePolicyIds(), [
    "unchanged",
    "resource-window",
    "resource-window-fast-rescue",
  ]);
  assert.deepEqual(apply(group, "unchanged"), group.frame);
  assert.throws(() => apply(group, "invented"));
  assert.throws(() => apply({ ...group, kind: "tank" }, "resource-window"));
});

test("resource eligibility preserves timings, demands, priority order and every unrelated field", () => {
  const expected = structuredClone(group.frame);
  expected.cooldowns.find((row) => row.itemId === 12662).minimumMissingMana = 500;
  expected.cooldowns.find((row) => row.itemId === 13444).minimumMissingMana = 750;
  assert.deepEqual(apply(group, "resource-window"), expected);
  const earlier = structuredClone(group);
  earlier.frame.cooldowns.find((row) => row.itemId === 12662).minimumMissingMana = 100;
  assert.equal(
    apply(earlier, "resource-window").cooldowns.find((row) => row.itemId === 12662)
      .minimumMissingMana,
    100,
  );
});

test("the fast rescue uses the highest eligible nonraid Flash of Light rank at the declared deficit", () => {
  const expected = apply(group, "resource-window");
  const maximum = group.frame.targets.find((row) => row.raidIndex === 1).maximumHealth;
  expected.priorities.unshift({
    spellId: 19943,
    raidIndex: -1,
    minimumMissingHealth: maximum * 0.6,
  });
  assert.deepEqual(apply(group, "resource-window-fast-rescue"), expected);
});

test("missing, duplicate or unsafe resource policies cannot weaken a guard", () => {
  for (const mutate of [
    (row) =>
      row.frame.cooldowns.splice(
        row.frame.cooldowns.findIndex((policy) => policy.itemId === 12662),
        1,
      ),
    (row) =>
      row.frame.cooldowns.push(
        structuredClone(row.frame.cooldowns.find((policy) => policy.itemId === 13444)),
      ),
    (row) => {
      row.frame.cooldowns.find((policy) => policy.itemId === 12662).minimumMissingMana = NaN;
    },
    (row) => {
      row.frame.cooldowns.find((policy) => policy.itemId === 12662).requireHealingDemand = false;
    },
    (row) => {
      row.frame.priorities[0].raidIndex = 1;
    },
  ]) {
    const changed = structuredClone(group);
    mutate(changed);
    assert.throws(() => apply(changed, "resource-window"));
  }
});

test("fast rescue rejects mismatched health pools or missing target membership", () => {
  for (const mutate of [
    (row) => {
      row.frame.targets.find((target) => target.raidIndex === 1).maximumHealth = 15000;
    },
    (row) => {
      row.frame.damage[0].raidIndex = 999;
    },
    (row) => {
      row.frame.targets.find((target) => target.raidIndex === 2).raidIndex = 1;
    },
  ]) {
    const changed = structuredClone(group);
    mutate(changed);
    assert.throws(() => apply(changed, "resource-window-fast-rescue"));
  }
});

test("proposal output owns its arrays and leaves actual source fixtures unchanged", () => {
  const before = structuredClone(group);
  const result = apply(group, "resource-window-fast-rescue");
  result.priorities[0].minimumMissingHealth = 0;
  result.cooldowns[0].minimumMissingMana = 0;
  assert.deepEqual(group, before);
});
