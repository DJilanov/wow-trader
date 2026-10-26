import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  createPaladinHealingSpellPolicy,
  eligiblePaladinHealingRanks,
} from "./paladin-healing-eligibility.mjs";
import {
  applyPaladinHealingAdaptiveRankPolicy,
  paladinHealingAdaptiveRankPolicies,
} from "./paladin-healing-adaptive-ranks.mjs";
import { simulationHash } from "./simulation-fingerprint.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("fixtures/" + name, import.meta.url))));
const books = fixture("healer-spell-eligibility-source.v1.json.gz");
const spellPolicy = createPaladinHealingSpellPolicy({
  baseline: fixture("paladin-baseline-source.v1.json.gz"),
  actives: fixture("paladin-healing-actives-source.v1.json.gz"),
  books: linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(books.atlas.source),
    tables: new Map(Object.entries(books.tables)),
    source: books.source,
  }),
});
const source = fixture("paladin-survival-policy-controls.v1.json.gz"),
  group = source.cases.find((row) => row.kind === "group"),
  tank = source.cases.find((row) => row.kind === "tank");
const input = (row) => ({ frame: row.frame, talents: row.talents, spellPolicy });
const apply = (row, policy) => applyPaladinHealingAdaptiveRankPolicy({ ...input(row), policy });

test("all nonraid direct ranks participate in the finite adaptive domain without granting actives", () => {
  for (const [row, count] of [
    [group, 216],
    [tank, 432],
  ]) {
    const policies = [...paladinHealingAdaptiveRankPolicies(input(row))];
    assert.equal(policies.length, count);
    assert.equal(new Set(policies.map((row) => row.policyId)).size, count);
    const eligible = eligiblePaladinHealingRanks(spellPolicy, {
      level: 60,
      talents: {
        holyShock: Boolean(row.talents.holyShock),
        lightsVigil: Boolean(row.talents.lightsVigil),
      },
      allowConditionalCandidates: true,
    }).filter((rank) => ["holy-light", "flash-of-light"].includes(rank.family));
    assert.deepEqual(
      new Set(policies.flatMap((row) => [row.policy.sustainSpellId, row.policy.recoverySpellId])),
      new Set(eligible.map((rank) => rank.spellId)),
    );
    assert(
      !policies.some((row) =>
        [row.policy.sustainSpellId, row.policy.recoverySpellId].includes(25292),
      ),
    );
    for (const entry of policies) {
      assert.equal(simulationHash(entry.policy), entry.policyId);
      const frame = apply(row, entry.policy);
      assert(
        frame.priorities.every(
          (priority) =>
            eligible.some((rank) => rank.spellId === priority.spellId) ||
            row.frame.priorities.some((old) => old.spellId === priority.spellId),
        ),
      );
    }
  }
  assert(
    [...paladinHealingAdaptiveRankPolicies(input(group))].every(
      (row) => row.policy.activeOrder === "active-first",
    ),
  );
});

test("adaptive choices preserve full demand, resources, timing, assumptions and input ownership", () => {
  for (const row of [group, tank]) {
    const before = structuredClone(row),
      choice = [...paladinHealingAdaptiveRankPolicies(input(row))][0],
      frame = apply(row, choice.policy),
      expected = structuredClone(row.frame);
    frame.priorities = expected.priorities;
    assert.deepEqual(frame, expected);
    assert.deepEqual(row, before);
  }
});

test("recovery thresholds use recipient health and preserve actual active conditions and targets", () => {
  const choices = [...paladinHealingAdaptiveRankPolicies(input(tank))],
    active = tank.frame.priorities.slice(0, -1),
    policy = choices.find(
      (row) =>
        row.policy.recoveryHealthFraction === 0.3 && row.policy.sustainMinimumMissingHealth === 400,
    ).policy;
  const frame = apply(tank, policy);
  assert.deepEqual(frame.priorities.slice(0, active.length), active);
  assert.equal(tank.frame.targets.find((row) => row.raidIndex === 1).maximumHealth, 18000);
  assert.equal(frame.priorities.at(-2).minimumMissingHealth, 5400);
  assert.equal(frame.priorities.at(-1).minimumMissingHealth, 400);
  assert(frame.priorities.every((row) => row.raidIndex === 1));
  const recoveryFirst = apply(tank, { ...policy, activeOrder: "recovery-first" });
  assert.deepEqual(recoveryFirst.priorities.slice(1, -1), active);
  assert.equal(recoveryFirst.priorities[0].spellId, policy.recoverySpellId);
  const anchored = structuredClone(tank);
  anchored.frame.priorities[0].raidIndex = 0;
  assert.equal(apply(anchored, policy).priorities[0].raidIndex, 0);
});

test("unadmitted spells, reversed or unreviewed pairs and arbitrary policies are rejected", () => {
  const policy = [...paladinHealingAdaptiveRankPolicies(input(group))][0].policy;
  for (const change of [
    { recoverySpellId: 25292 },
    { sustainSpellId: 1310911 },
    { sustainSpellId: policy.recoverySpellId },
    { sustainSpellId: policy.recoverySpellId, recoverySpellId: policy.sustainSpellId },
    { recoveryHealthFraction: 0.25 },
    { sustainMinimumMissingHealth: 1 },
    { activeOrder: "recovery-first" },
    { extra: true },
  ])
    assert.throws(() => apply(group, { ...policy, ...change }));
});

test("incomplete target evidence and conditional direct priorities cannot be silently rewritten", () => {
  const policy = [...paladinHealingAdaptiveRankPolicies(input(group))][0].policy;
  for (const mutate of [
    (row) => {
      row.frame.targets.find((target) => target.raidIndex === 2).maximumHealth = 12000;
    },
    (row) => {
      row.frame.damage[0].raidIndex = 999;
    },
    (row) => {
      row.frame.targets.find((target) => target.raidIndex === 2).raidIndex = 1;
    },
    (row) => {
      row.frame.priorities[0].requireVigil = true;
    },
  ]) {
    const changed = structuredClone(group);
    mutate(changed);
    assert.throws(() => apply(changed, policy));
  }
  const missingTalent = structuredClone(tank);
  delete missingTalent.talents.lightsVigil;
  assert.throws(() => [...paladinHealingAdaptiveRankPolicies(input(missingTalent))]);
});

test("small health pools emit only correctly ordered threshold policies", () => {
  const small = structuredClone(group);
  for (const target of small.frame.targets) if (target.raidIndex > 0) target.maximumHealth = 1000;
  const rows = [...paladinHealingAdaptiveRankPolicies(input(small))];
  assert(rows.length > 0 && rows.length < 216);
  for (const row of rows) {
    const priorities = apply(small, row.policy).priorities;
    assert(priorities.at(-2).minimumMissingHealth > priorities.at(-1).minimumMissingHealth);
  }
});
