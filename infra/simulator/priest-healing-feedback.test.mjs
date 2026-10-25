import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import { summarizeTalents } from "./talent-search.mjs";
import {
  priestHealingTalentSeeds,
  createPriestHealingAssignment,
} from "./priest-healing-study.mjs";
import {
  createPriestHealingSpellPolicy,
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  priestHealingHybridSeeds,
  priestHealingTalentFields,
  priestHealingTalentNeighbors,
  priestHealingFeedbackRanks,
  priestHealingPriorityCandidates,
  createPriestHealingFeedbackWorkload,
  priestHealingSupportRankNeighbors,
} from "./priest-healing-feedback.mjs";
function fixture(name) {
  return JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
}
const trees = fixture("priest-healing-study-source.v1.json.gz").trees,
  seeds = priestHealingTalentSeeds(trees),
  priest = fixture("priest-client-healing-source.v1.json.gz"),
  books = fixture("healer-spell-eligibility-source.v1.json.gz"),
  policy = createPriestHealingSpellPolicy(
    priest,
    linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(books.atlas.source),
      tables: new Map(Object.entries(books.tables)),
      source: books.source,
    }),
  );
test("hybrid counterexamples are legal51point builds with their actual healing gates", () => {
  const hybrid = priestHealingHybridSeeds(trees, seeds);
  assert.equal(hybrid.length, 2);
  for (const row of hybrid) {
    assert.deepEqual(priestHealingTalentFields(trees, row.talentsString), {
      ...Object.fromEntries(trees.flatMap((t) => t.talents.map((n) => [n.fieldName, 0]))),
      ...row.fields,
    });
  }
  assert.deepEqual(
    hybrid.map((row) => summarizeTalents(trees, row.talentsString).map((t) => t.points)),
    [
      [23, 28, 0],
      [28, 23, 0],
    ],
  );
  assert(hybrid[0].fields.penance && hybrid[0].fields.spiritualHealing);
  assert(!hybrid[0].fields.prayerOfMending);
});
test("talent neighborhoods preserve their declared archetype without illegal point strings", () => {
  for (const row of [...seeds, ...priestHealingHybridSeeds(trees, seeds)]) {
    const neighbors = priestHealingTalentNeighbors(trees, row);
    assert(neighbors.length > 1);
    for (const n of neighbors) {
      const fields = priestHealingTalentFields(trees, n.talentsString);
      if (row.spec === "holy") assert.equal(fields.prayerOfMending, 1);
      if (row.spec === "discipline") assert.equal(fields.powerInfusion, 1);
    }
  }
});
test("priority screening retains every eligible direct rank and excludes raid books", () => {
  for (const row of seeds) {
    const ranks = priestHealingFeedbackRanks(policy, row.fields),
      candidates = priestHealingPriorityCandidates(policy, row.fields, "group");
    for (const rank of ranks.filter((r) =>
      [
        "lesser-heal",
        "heal",
        "greater-heal",
        "flash-heal",
        "binding-heal",
        "prayer-of-healing",
        "holy-nova",
      ].includes(r.family),
    ))
      assert(candidates.some((c) => c.directSpellId === rank.spellId));
    assert(candidates.every((c) => ![25314, 25315, 25316].includes(c.directSpellId)));
    assert(candidates.some((c) => c.directSpellId === 2050));
  }
});
test("support-rank feedback preserves the assignment and rejects locked or wrong-family overrides", () => {
  const row = seeds[0],
    assignment = createPriestHealingAssignment({
      kind: "tank",
      durationSeconds: 180,
      damagePerSecond: 400,
    }),
    p = {
      directSpellId: 10965,
      shield: true,
      renew: true,
      groupHeal: false,
      directMinimumMissingHealth: 1200,
      ranks: {},
    };
  const frame = createPriestHealingFeedbackWorkload(assignment, row.fields, p, policy),
    neighbors = priestHealingSupportRankNeighbors(policy, row.fields, frame, p);
  assert(neighbors.some((n) => n.ranks.renew === 139));
  assert(neighbors.some((n) => n.ranks.shield === 17));
  assert.equal(assignment.priorities.length, 0);
  const lower = createPriestHealingFeedbackWorkload(
    assignment,
    row.fields,
    { ...p, ranks: { renew: 139 } },
    policy,
  );
  assert(lower.priorities.some((x) => x.spellId === 139 && x.keepRenew));
  assert.throws(() =>
    createPriestHealingFeedbackWorkload(
      assignment,
      row.fields,
      { ...p, ranks: { renew: 10965 } },
      policy,
    ),
  );
  assert.throws(() =>
    createPriestHealingFeedbackWorkload(
      assignment,
      row.fields,
      { ...p, ranks: { renew: 25315 } },
      policy,
    ),
  );
  assert.throws(() =>
    createPriestHealingFeedbackWorkload(
      assignment,
      row.fields,
      { ...p, directSpellId: 1316995 },
      policy,
    ),
  );
});
