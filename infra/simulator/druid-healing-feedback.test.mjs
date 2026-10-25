import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { druidHealingTalentSeeds, createDruidHealingAssignment } from "./druid-healing-study.mjs";
import { createDruidHealingSpellPolicy } from "./druid-healing-spell-policy.mjs";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import {
  druidHealingTalentNeighbors,
  druidHealingFeedbackRanks,
  createDruidHealingFeedbackWorkload,
  druidHealingPriorityCandidates,
  druidHealingSupportRankNeighbors,
} from "./druid-healing-feedback.mjs";

function fixture(name, hash) {
  const bytes = readFileSync(new URL("./fixtures/" + name, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return JSON.parse(gunzipSync(bytes));
}
const source = fixture(
    "druid-healing-study-source.v1.json.gz",
    "0cb33bc5759f95fedac345a808fad7249b9ee1f5851cff5b9cd56da6b44e2e31",
  ),
  client = fixture(
    "druid-client-healing-source.v1.json.gz",
    "e3912ed6cbd434dfd20181758ed331ea0c93f3c81c85329f77ca31e601ae3c22",
  ),
  books = fixture(
    "healer-spell-eligibility-source.v1.json.gz",
    "f8ddd54bfe89b584669c3670b545e5caf7643d266506067ab783febc775ff5db",
  ),
  policy = createDruidHealingSpellPolicy(
    client,
    linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(books.atlas.source),
      tables: new Map(Object.entries(books.tables)),
      source: books.source,
    }),
  ),
  seeds = druidHealingTalentSeeds(source.trees),
  assignment = createDruidHealingAssignment({
    kind: "group",
    durationSeconds: 180,
    damagePerSecond: 400,
  });

test("talent neighbors remain legal 51-point allocations and retain each archetype", () => {
  for (const seed of seeds) {
    const neighbors = druidHealingTalentNeighbors(source.trees, seed);
    assert(neighbors.length > 1);
    assert.equal(new Set(neighbors.map((row) => row.talentsString)).size, neighbors.length);
    for (const row of neighbors) {
      assert.equal(
        Object.values(row.fields).reduce((sum, points) => sum + points, 0),
        51,
      );
      assert.equal(
        seed.spec === "natures-grace" ? row.fields.naturesGrace : row.fields.wildGrowth,
        1,
      );
      if (seed.spec === "splendor-wild-growth") assert.equal(row.fields.naturesSplendor, 1);
    }
  }
  assert.throws(() => druidHealingTalentNeighbors(source.trees, { ...seeds[0], spec: "unknown" }));
});

test("priority choices retain all eligible direct ranks and avoid AQ books or unowned Wild Growth", () => {
  for (const seed of seeds)
    for (const kind of ["tank", "group", "burst"]) {
      const candidates = druidHealingPriorityCandidates(policy, seed.fields, kind),
        direct = druidHealingFeedbackRanks(policy, seed.fields).filter((rank) =>
          ["healing-touch", "regrowth"].includes(rank.family),
        );
      assert.deepEqual(
        new Set(candidates.map((row) => row.directSpellId)),
        new Set(direct.map((row) => row.spellId)),
      );
      for (const candidate of candidates) {
        const frame = createDruidHealingFeedbackWorkload(
          assignment,
          seed.fields,
          candidate,
          policy,
        );
        assert(frame.priorities.every((row) => ![25297, 25299].includes(row.spellId)));
        if (!seed.fields.wildGrowth) assert.equal(candidate.wildGrowth, false);
      }
    }
});

test("support downranks change only present families and preserve the direct heal", () => {
  const seed = seeds[0],
    base = {
      directSpellId: 9889,
      directMinimumMissingHealth: 400,
      rejuvenation: true,
      wildGrowth: true,
      ranks: {},
    },
    frame = createDruidHealingFeedbackWorkload(assignment, seed.fields, base, policy),
    candidates = druidHealingSupportRankNeighbors(policy, seed.fields, frame, base),
    before = JSON.stringify(base);
  assert(candidates.some((row) => row.ranks.rejuvenation === 774));
  assert(candidates.some((row) => row.ranks["wild-growth"]));
  for (const candidate of candidates)
    assert.equal(
      createDruidHealingFeedbackWorkload(assignment, seed.fields, candidate, policy).priorities.at(
        -1,
      ).spellId,
      9889,
    );
  assert.equal(JSON.stringify(base), before);
});

test("rank overrides reject unavailable families, wrong-family spells and raid books", () => {
  const seed = seeds[0],
    base = { directSpellId: 9889, rejuvenation: true, wildGrowth: false, ranks: {} };
  for (const ranks of [
    { rejuvenation: 25299 },
    { rejuvenation: 9889 },
    { "wild-growth": 1238215 },
    { unknown: 774 },
  ])
    assert.throws(() =>
      createDruidHealingFeedbackWorkload(assignment, seed.fields, { ...base, ranks }, policy),
    );
});
