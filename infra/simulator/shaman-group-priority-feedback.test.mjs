import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createShamanHealingSpellPolicy } from "./shaman-healing-eligibility.mjs";
import {
  createShamanHealingAssignment,
  createShamanHealingPriorities,
} from "./shaman-healing-study.mjs";
import {
  createShamanGroupPriorityWorkload,
  shamanGroupPriorityCandidates,
} from "./shaman-group-priority-feedback.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const books = fixture("healer-spell-eligibility-source.v1");
const spellPolicy = createShamanHealingSpellPolicy({
  classSource: fixture("shaman-client-healing-source.v1"),
  books: linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(books.atlas.source),
    tables: new Map(Object.entries(books.tables)),
    source: books.source,
  }),
});
const fields = { waterShield: 1, manaTideTotem: 1, naturesSwiftness: 1, riptide: 1 };
const assignment = createShamanHealingAssignment({
  kind: "group",
  durationSeconds: 180,
  damagePerSecond: 800,
  geometry: "stacked",
});

test("the bank keeps all eligible high direct ranks, all Chain Heal ranks and the original packet", () => {
  const policies = shamanGroupPriorityCandidates(spellPolicy, fields);
  assert.equal(policies.length, 3345);
  assert.equal(new Set(policies.map((row) => row.id)).size, policies.length);
  assert.equal(policies.filter((row) => row.incumbent).length, 1);
  assert.deepEqual(
    new Set(policies.map((row) => row.chainSpellId)),
    new Set([0, 1064, 10622, 10623]),
  );
  assert.equal(new Set(policies.map((row) => row.directSpellId)).size, 11);
  assert(!policies.some((row) => [331, 332, 547, 913, 25357].includes(row.directSpellId)));
  assert.deepEqual(
    createShamanGroupPriorityWorkload({
      assignment,
      fields,
      spellPolicy,
      policy: policies.find((row) => row.incumbent),
    }),
    createShamanHealingPriorities(assignment, fields, spellPolicy, {
      directSpellId: 10396,
      directMinimumMissingHealth: 500,
      chainSpellId: 10623,
    }),
  );
});

test("Riptide-free talent ownership and explicit Chain Heal triage remain intact", () => {
  const bare = { waterShield: 1, manaTideTotem: 1, naturesSwiftness: 1 };
  const policies = shamanGroupPriorityCandidates(spellPolicy, bare);
  assert.equal(policies.length, 1673);
  assert(policies.every((row) => !row.riptide));
  const policy = policies.find(
    (row) =>
      row.chainSpellId === 1064 &&
      row.chainMinimumInjuredTargets === 3 &&
      row.chainMinimumGroupMissingHealth === 2400 &&
      !row.stream,
  );
  const result = createShamanGroupPriorityWorkload({
    assignment,
    fields: bare,
    spellPolicy,
    policy,
  });
  const chain = result.priorities.find((row) => row.spellId === 1064);
  assert.equal(chain.minimumInjuredTargets, 3);
  assert.equal(chain.minimumGroupMissingHealth, 2400);
  assert.equal(chain.raidIndex, -1);
  assert(!result.priorities.some((row) => row.keepHot));
  assert.equal(result.useNaturesSwiftness, true);
  assert.deepEqual(result.damage, assignment.damage);
});

test("group and burst priorities preserve damage, geometry and source data without mutation", () => {
  const policy = shamanGroupPriorityCandidates(spellPolicy, fields).find(
    (row) => row.chainSpellId === 0 && !row.riptide && !row.stream,
  );
  for (const kind of ["group", "burst"]) {
    const before = createShamanHealingAssignment({
      kind,
      durationSeconds: 300,
      damagePerSecond: 800,
      geometry: "spread",
    });
    const original = structuredClone(before);
    const result = createShamanGroupPriorityWorkload({
      assignment: before,
      fields,
      spellPolicy,
      policy,
    });
    assert.deepEqual(before, original);
    assert.deepEqual(result.damage, original.damage);
    assert.deepEqual(result.targets, original.targets);
    assert.equal(result.priorities.length, 3);
    assert.equal(result.priorities.at(-1).spellId, policy.directSpellId);
  }
});

test("invalid rank, Chain Heal root, triage, missing ownership and tank assignments reject", () => {
  const policy = shamanGroupPriorityCandidates(spellPolicy, fields)[0];
  for (const change of [
    { schema: "unknown" },
    { directSpellId: 331 },
    { directSpellId: 25357 },
    { chainSpellId: 1325256 },
    { chainMinimumInjuredTargets: 4 },
    { chainMinimumGroupMissingHealth: -1 },
    { directMinimumMissingHealth: NaN },
  ])
    assert.throws(() =>
      createShamanGroupPriorityWorkload({
        assignment,
        fields,
        spellPolicy,
        policy: { ...policy, ...change },
      }),
    );
  assert.throws(() =>
    createShamanGroupPriorityWorkload({ assignment, fields: {}, spellPolicy, policy }),
  );
  assert.throws(() =>
    createShamanGroupPriorityWorkload({
      assignment: createShamanHealingAssignment({
        kind: "tank",
        durationSeconds: 180,
        damagePerSecond: 800,
        geometry: "stacked",
      }),
      fields,
      spellPolicy,
      policy,
    }),
  );
});
