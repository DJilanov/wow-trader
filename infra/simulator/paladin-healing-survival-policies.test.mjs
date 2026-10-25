import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  createPaladinHealingSpellPolicy,
  eligiblePaladinHealingRanks,
} from "./paladin-healing-eligibility.mjs";
import {
  applyPaladinHealingSurvivalPolicy,
  paladinHealingSurvivalPolicyIds,
} from "./paladin-healing-survival-policies.mjs";

const fixture = (name) =>
    JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url)))),
  baseline = fixture("paladin-baseline-source.v1.json.gz"),
  actives = fixture("paladin-healing-actives-source.v1.json.gz"),
  captured = fixture("healer-spell-eligibility-source.v1.json.gz"),
  books = linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(captured.atlas.source),
    tables: new Map(Object.entries(captured.tables)),
    source: captured.source,
  }),
  spellPolicy = createPaladinHealingSpellPolicy({ baseline, actives, books }),
  bytes = readFileSync(
    new URL("./fixtures/paladin-survival-policy-controls.v1.json.gz", import.meta.url),
  );
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "ed9fcea3ce16bda0c6509e76dcbae1f5c3ca1a49c017dc29513ba04402db4727",
);
const cases = JSON.parse(gunzipSync(bytes)).cases,
  group = cases.find((row) => row.kind === "group"),
  tank = cases.find((row) => row.kind === "tank");
const apply = (input, policyId) =>
  applyPaladinHealingSurvivalPolicy({ ...input, spellPolicy, policyId });

test("survival correction has a fixed domain and preserves unchanged actual workload settings", () => {
  assert.equal(paladinHealingSurvivalPolicyIds("group").length, 6);
  assert.deepEqual(paladinHealingSurvivalPolicyIds("tank"), ["unchanged", "earlier-resources"]);
  for (const input of cases) assert.deepEqual(apply(input, "unchanged"), input.frame);
  assert.throws(() => paladinHealingSurvivalPolicyIds("burst"));
  assert.throws(() => apply(tank, "large-heal"));
});

test("earlier resources alter only declared mana thresholds without reordering or inventing cooldowns", () => {
  const result = apply(tank, "earlier-resources"),
    expected = structuredClone(tank.frame);
  expected.cooldowns.find((row) => row.itemId === 12662).minimumMissingMana = 1000;
  expected.cooldowns.find((row) => row.itemId === 13444).minimumMissingMana = 2000;
  assert.deepEqual(result, expected);
  const alreadyEarly = structuredClone(tank);
  alreadyEarly.frame.cooldowns[0].minimumMissingMana = 500;
  assert.equal(apply(alreadyEarly, "earlier-resources").cooldowns[0].minimumMissingMana, 500);
});

test("rescue uses highest admitted nonraid Holy Light and owned Holy Shock with explicit group triage", () => {
  const large = apply(group, "large-heal"),
    rescued = apply(group, "shock-rescue-earlier-resources");
  assert.deepEqual(large.priorities[0], {
    spellId: 10329,
    raidIndex: -1,
    minimumMissingHealth: 6000,
  });
  assert.deepEqual(large.priorities.slice(1), group.frame.priorities);
  const eligible = eligiblePaladinHealingRanks(spellPolicy, {
      level: 60,
      talents: { holyShock: true, lightsVigil: false },
      allowConditionalCandidates: true,
    }),
    highestShock = eligible
      .filter((row) => row.family === "holy-shock")
      .sort((a, b) => b.rank - a.rank)[0];
  assert.deepEqual(rescued.priorities.slice(0, 2), [
    { spellId: highestShock.spellId, raidIndex: -1, minimumMissingHealth: 7500 },
    { spellId: 10329, raidIndex: -1, minimumMissingHealth: 6000 },
  ]);
  assert(!rescued.priorities.some((row) => row.spellId === 25292));
  assert.deepEqual(rescued.damage, group.frame.damage);
  assert.deepEqual(rescued.targets, group.frame.targets);
});

test("rescue rejects missing ownership, unequal or unknown target health, and incompatible triage", () => {
  assert.throws(() =>
    apply({ ...group, talents: { holyShock: false, lightsVigil: false } }, "shock-rescue"),
  );
  for (const change of [
    (input) => {
      input.frame.targets[1].maximumHealth = 9000;
    },
    (input) => {
      input.frame.targets[1].maximumHealth = 0;
    },
    (input) => {
      input.frame.priorities[0].raidIndex = 1;
    },
    (input) => {
      input.frame.requireFullTalentBuild = false;
    },
    (input) => {
      input.frame.assignmentScoring = "raw-healing";
    },
  ]) {
    const input = structuredClone(group);
    change(input);
    assert.throws(() => apply(input, "large-heal"));
  }
  assert.throws(() => apply(group, "unbounded-search"));
});

test("all supported policies leave caller frames and talent evidence unchanged", () => {
  const before = structuredClone(cases);
  for (const input of cases)
    for (const id of paladinHealingSurvivalPolicyIds(input.kind)) {
      const result = apply(input, id);
      result.priorities[0].minimumMissingHealth = 123;
      assert.equal(result.requireFullTalentBuild, true);
      assert.equal(result.assignmentScoring, "external-demand-v1");
    }
  assert.deepEqual(cases, before);
});
