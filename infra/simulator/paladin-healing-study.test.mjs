import assert from "node:assert/strict";
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
  extractPaladinHealingTalentDomain,
  paladinHealingTalentSeeds,
} from "./paladin-healing-talents.mjs";
import { createPriestHealingAssignment } from "./priest-healing-study.mjs";
import {
  createPaladinHealingAssignment,
  createPaladinHealingPriorities,
  summarizePaladinHealingAssignment,
} from "./paladin-healing-study.mjs";

const json = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/" + name, import.meta.url))));
const captured = json("healer-spell-eligibility-source.v1.json.gz"),
  policy = createPaladinHealingSpellPolicy({
    baseline: json("paladin-baseline-source.v1.json.gz"),
    actives: json("paladin-healing-actives-source.v1.json.gz"),
    books: linkClientRaidSpellBooks({
      reference: extractClassicRaidSpellBooks(captured.atlas.source),
      tables: new Map(Object.entries(captured.tables)),
      source: captured.source,
    }),
  }),
  domain = extractPaladinHealingTalentDomain(json("paladin-healing-talents-source.v1.json.gz")),
  seeds = paladinHealingTalentSeeds(domain);

test("Paladin assignments retain shared tank,group,burst schedules and require external scoring", () => {
  for (const kind of ["tank", "group", "burst"])
    for (const durationSeconds of [180, 300]) {
      const options = { kind, durationSeconds, damagePerSecond: 400 },
        result = createPaladinHealingAssignment(options),
        reference = createPriestHealingAssignment(options);
      assert.deepEqual(result.damage, reference.damage);
      assert.deepEqual(result.targets, reference.targets);
      assert.equal(result.assignmentScoring, "external-demand-v1");
      assert.equal(result.requireFullTalentBuild, true);
      assert.equal(result.useInnerFocus, undefined);
      assert.equal(result.usePowerInfusion, undefined);
      assert.equal(result.blessingOfLight.assignments.length, 5);
    }
});

test("Paladin priorities cover every eligible direct downrank with legal talent ownership", () => {
  for (const seed of seeds) {
    const frame = createPaladinHealingAssignment({
      kind: "group",
      durationSeconds: 180,
      damagePerSecond: 400,
    });
    const before = JSON.stringify(frame);
    const ranks = eligiblePaladinHealingRanks(policy, {
      level: 60,
      talents: {
        holyShock: Boolean(seed.fields.holyShock),
        lightsVigil: Boolean(seed.fields.lightsVigil),
      },
      allowConditionalCandidates: true,
    });
    for (const rank of ranks.filter((row) =>
      ["holy-light", "flash-of-light"].includes(row.family),
    )) {
      const result = createPaladinHealingPriorities(frame, seed.fields, policy, {
        directSpellId: rank.spellId,
      });
      assert.equal(result.priorities.at(-1).spellId, rank.spellId);
      assert(result.priorities.every((row) => row.raidIndex === -1 && row.spellId !== 25292));
      assert.equal(result.priorities.length, seed.fields.lightsVigil ? 3 : 2);
    }
    assert.equal(JSON.stringify(frame), before);
    assert.throws(() =>
      createPaladinHealingPriorities(frame, seed.fields, policy, { directSpellId: 25292 }),
    );
    assert.throws(() =>
      createPaladinHealingPriorities(frame, seed.fields, policy, {
        directMinimumMissingHealth: NaN,
      }),
    );
  }
  const tank = createPaladinHealingAssignment({
    kind: "tank",
    durationSeconds: 180,
    damagePerSecond: 400,
  });
  const priorities = createPaladinHealingPriorities(tank, seeds[0].fields, policy);
  assert(priorities.priorities.every((row) => row.raidIndex === 1));
  assert.throws(() => createPaladinHealingPriorities(tank, {}, policy, { holyShock: true }));
  assert.throws(() =>
    createPaladinHealingPriorities(tank, seeds[2].fields, policy, { lightsVigil: true }),
  );
  assert.throws(() =>
    createPaladinHealingPriorities(
      { ...tank, assignmentScoring: undefined },
      seeds[0].fields,
      policy,
    ),
  );
});

test("Paladin assignment summary rejects self-inflated totals and requires full delivered demand", () => {
  const result = {
    schema: "kfc-paladin-healing-workload-result.v1",
    name: "synthetic-tank-180s-400dps",
    classQualified: false,
    publicationAllowed: false,
    survivalRate: 1,
    hps: 5000,
    manaRemainingMean: 500,
    manaBlockedSecondsMean: 0,
    plannedIncomingPostMitigationDamage: 72000,
    assignment: {
      schema: "kfc-paladin-external-assignment.v1",
      supportHpsMean: 390,
      supportHpsStdev: 1,
      healthRestoredHpsMean: 380,
      absorbedHpsMean: 10,
      damageDemandMean: 72000,
      externalMissingHealthSecondsMean: 18000,
      finalExternalMissingHealthMean: 100,
    },
  };
  const summary = summarizePaladinHealingAssignment(result);
  assert.equal(summary.feasible, true);
  assert.equal(summary.hps, 390);
  assert.equal(summary.meanMissingHealth, 100);
  assert.equal(summarizePaladinHealingAssignment({ ...result, survivalRate: 0.9 }).feasible, false);
  assert.equal(
    summarizePaladinHealingAssignment({
      ...result,
      assignment: { ...result.assignment, damageDemandMean: 71000 },
    }).feasible,
    false,
  );
  assert.throws(() => summarizePaladinHealingAssignment({ ...result, assignment: undefined }));
  assert.throws(() =>
    summarizePaladinHealingAssignment({
      ...result,
      assignment: { ...result.assignment, damageDemandMean: 73000 },
    }),
  );
});
