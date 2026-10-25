import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import {
  extractClassicRaidSpellBooks,
  linkClientRaidSpellBooks,
} from "./healer-spell-eligibility.mjs";
import { createDruidHealingSpellPolicy } from "./druid-healing-spell-policy.mjs";
import { createPriestHealingAssignment } from "./priest-healing-study.mjs";
import { decodeTalents, talentProblem } from "./talent-search.mjs";
import {
  assertDruidHealingTalentLayout,
  createDruidHealingAssignment,
  createDruidHealingPriorities,
  druidHealingTalentSeeds,
  summarizeDruidHealingAssignment,
} from "./druid-healing-study.mjs";

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
  );

test("study seeds use the current layout, legal 51-point allocations and distinct healing mechanics", () => {
  assertDruidHealingTalentLayout(source.trees, client.classTalents);
  const seeds = druidHealingTalentSeeds(source.trees);
  assert.equal(new Set(seeds.map((seed) => seed.talentsString)).size, 3);
  for (const seed of seeds) {
    assert.equal(talentProblem(source.trees, decodeTalents(source.trees, seed.talentsString)), "");
    assert.equal(seed.fields.heartOfTheWild, 5);
  }
  assert.equal(seeds[0].fields.wildGrowth, 1);
  assert.equal(seeds[1].fields.naturesSplendor, 1);
  assert.equal(seeds[2].fields.naturesGrace, 1);
  assert.equal(seeds[2].fields.wildGrowth, undefined);
  const changed = structuredClone(source.trees);
  changed[2].talents[0].maxPoints = 4;
  assert.throws(() => assertDruidHealingTalentLayout(changed, client.classTalents));
});

test("all Druid assignments retain comparable schedules without Priest policies", () => {
  for (const kind of ["tank", "group", "burst"])
    for (const durationSeconds of [180, 300]) {
      const options = { kind, durationSeconds, damagePerSecond: 400 },
        frame = createDruidHealingAssignment(options),
        reference = createPriestHealingAssignment(options),
        spread = createDruidHealingAssignment({ ...options, spread: true });
      assert.deepEqual(frame.damage, reference.damage);
      assert.deepEqual(frame.targets, reference.targets);
      assert.deepEqual(spread.damage, frame.damage);
      assert.equal(spread.targets[4].x, 48);
      assert.equal(frame.useInnerFocus, undefined);
      assert.equal(frame.usePowerInfusion, undefined);
      assert.equal(frame.schema, "kfc-druid-healing-workload.v1");
      assert.equal(frame.innervateRequireHealingDemand, true);
    }
});

test("priorities require current talent ownership and pre-raid ranks for every seed", () => {
  for (const seed of druidHealingTalentSeeds(source.trees)) {
    const assignment = createDruidHealingAssignment({
      kind: "group",
      durationSeconds: 180,
      damagePerSecond: 400,
    });
    const before = JSON.stringify(assignment),
      frame = createDruidHealingPriorities(assignment, seed.fields, policy);
    assert.equal(JSON.stringify(assignment), before);
    assert(frame.priorities.every((row) => ![25297, 25299].includes(row.spellId)));
    assert.equal(
      frame.priorities.some(
        (row) => policy.ranks.find((rank) => rank.spellId === row.spellId).family === "wild-growth",
      ),
      Boolean(seed.fields.wildGrowth),
    );
    assert.equal(frame.priorities.at(-1).spellId, 9889);
    assert(frame.priorities.every((row) => row.raidIndex === -1));
    if (!seed.fields.wildGrowth)
      assert.throws(() =>
        createDruidHealingPriorities(assignment, seed.fields, policy, { wildGrowth: true }),
      );
    for (const options of [
      { directSpellId: 25297 },
      { directSpellId: 9841 },
      { directMinimumMissingHealth: NaN },
    ])
      assert.throws(() => createDruidHealingPriorities(assignment, seed.fields, policy, options));
  }
});

test("Swiftmend needs a declared HoT source, and tank priorities retain the assignment target", () => {
  const assignment = createDruidHealingAssignment({
      kind: "tank",
      durationSeconds: 180,
      damagePerSecond: 400,
    }),
    fields = druidHealingTalentSeeds(source.trees)[0].fields,
    plain = createDruidHealingPriorities(assignment, fields, policy, {
      rejuvenation: false,
      wildGrowth: false,
    }),
    regrowth = createDruidHealingPriorities(assignment, fields, policy, {
      rejuvenation: false,
      wildGrowth: false,
      directSpellId: 9858,
    });
  assert(!plain.priorities.some((row) => row.spellId === 18562));
  assert(regrowth.priorities.some((row) => row.spellId === 18562));
  assert(regrowth.priorities.every((row) => row.raidIndex === 1));
});

test("Druid assignment scoring rejects deaths and undelivered damage before throughput", () => {
  const result = {
    schema: "kfc-druid-healing-workload-result.v1",
    name: "synthetic-tank-180s-400dps",
    classQualified: false,
    publicationAllowed: false,
    survivalRate: 1,
    missingHealthSecondsMean: 18000,
    manaRemainingMean: 500,
    plannedIncomingPostMitigationDamage: 71600,
    deliveredIncomingDamageMean: 71600,
  };
  assert.equal(summarizeDruidHealingAssignment(result).feasible, true);
  assert.equal(summarizeDruidHealingAssignment(result).meanMissingHealth, 100);
  assert.equal(summarizeDruidHealingAssignment({ ...result, survivalRate: 0.99 }).feasible, false);
  assert.equal(
    summarizeDruidHealingAssignment({ ...result, deliveredIncomingDamageMean: 70000 }).feasible,
    false,
  );
});
