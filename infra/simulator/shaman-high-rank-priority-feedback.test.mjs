import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  createShamanHealingSpellPolicy,
  eligibleShamanHealingActions,
} from "./shaman-healing-eligibility.mjs";
import {
  createShamanHealingAssignment,
  createShamanHealingPriorities,
} from "./shaman-healing-study.mjs";
import {
  createShamanHighRankPriorityWorkload,
  shamanHighRankPriorityCandidates,
} from "./shaman-high-rank-priority-feedback.mjs";

const fixture = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name + ".json.gz", import.meta.url))));
const evidence = fixture("shaman-client-healing-source.v1"),
  books = fixture("healer-spell-eligibility-source.v1");
const spellPolicy = createShamanHealingSpellPolicy({
  classSource: evidence,
  books: linkClientRaidSpellBooks({
    reference: extractClassicRaidSpellBooks(books.atlas.source),
    tables: new Map(Object.entries(books.tables)),
    source: books.source,
  }),
});
const fields = { waterShield: 1, manaTideTotem: 1, naturesSwiftness: 1, riptide: 1 };
const assignment = createShamanHealingAssignment({
  kind: "tank",
  durationSeconds: 180,
  damagePerSecond: 800,
  geometry: "stacked",
});

test("the finite feedback bank preserves every admitted level20+ direct rank and the incumbent", () => {
  const values = shamanHighRankPriorityCandidates(spellPolicy, fields);
  assert.equal(values.length, 793);
  assert.equal(new Set(values.map((row) => row.id)).size, values.length);
  const expected = spellPolicy.actions
    .filter(
      (row) =>
        row.status === "conditional-client-candidate" &&
        row.requiredLevel >= 20 &&
        ["healing-wave", "lesser-healing-wave"].includes(row.family),
    )
    .map((row) => row.spellId);
  assert.deepEqual(new Set(values.map((row) => row.directSpellId)), new Set(expected));
  assert.equal(values.filter((row) => row.incumbent).length, 1);
  assert(!values.some((row) => [331, 332, 547, 913, 25357].includes(row.directSpellId)));
  const low = eligibleShamanHealingActions(spellPolicy, {
    level: 60,
    allowConditionalCandidates: true,
  });
  for (const id of [331, 332, 547, 913])
    assert(
      low.some((row) => row.spellId === id),
      "The source rank remains available outside this pass",
    );
});

test("the original priority packet is retained exactly, including utility and resource order", () => {
  const policy = shamanHighRankPriorityCandidates(spellPolicy, fields).find((row) => row.incumbent);
  assert.deepEqual(
    createShamanHighRankPriorityWorkload({ assignment, fields, spellPolicy, policy }),
    createShamanHealingPriorities(assignment, fields, spellPolicy, {
      directSpellId: 10396,
      directMinimumMissingHealth: 500,
    }),
  );
});

test("emergency healing precedes maintenance and leaves the normal rank available as fallback", () => {
  const policy = shamanHighRankPriorityCandidates(spellPolicy, fields).find(
    (row) =>
      row.directSpellId === 939 && row.emergencySpellId === 10468 && row.riptide && row.stream,
  );
  assert(policy);
  const before = structuredClone(assignment),
    result = createShamanHighRankPriorityWorkload({ assignment, fields, spellPolicy, policy });
  assert.deepEqual(result.priorities[0], {
    spellId: 10468,
    raidIndex: 1,
    minimumMissingHealth: 3000,
  });
  assert.equal(result.priorities.at(-1).spellId, 939);
  assert(result.priorities.some((row) => row.spellId === 408510));
  assert(result.priorities.some((row) => row.spellId === 1325256));
  assert.equal(result.useNaturesSwiftness, true);
  assert.deepEqual(assignment, before);
});

test("the Wave archetype cannot acquire Riptide through a priority policy", () => {
  const bare = { waterShield: 1, manaTideTotem: 1 },
    policies = shamanHighRankPriorityCandidates(spellPolicy, bare);
  assert.equal(policies.length, 397);
  assert(policies.every((row) => row.riptide === false));
  assert.throws(() =>
    createShamanHighRankPriorityWorkload({
      assignment,
      fields: bare,
      spellPolicy,
      policy: { ...policies[0], riptide: true },
    }),
  );
});

test("invalid references, lower-level ranks and nonhealing emergency roots reject", () => {
  const policy = shamanHighRankPriorityCandidates(spellPolicy, fields)[0];
  for (const change of [
    { schema: "unknown" },
    { directSpellId: 331 },
    { directSpellId: 25357 },
    { emergencySpellId: 1325256, emergencyMinimumMissingHealth: 3000 },
    { emergencySpellId: 10396, emergencyMinimumMissingHealth: NaN },
    { emergencySpellId: 0, emergencyMinimumMissingHealth: 3000 },
    { directMinimumMissingHealth: -1 },
  ])
    assert.throws(() =>
      createShamanHighRankPriorityWorkload({
        assignment,
        fields,
        spellPolicy,
        policy: { ...policy, ...change },
      }),
    );
  const group = createShamanHealingAssignment({
    kind: "group",
    durationSeconds: 180,
    damagePerSecond: 800,
    geometry: "stacked",
  });
  assert.throws(() =>
    createShamanHighRankPriorityWorkload({ assignment: group, fields, spellPolicy, policy }),
  );
});
