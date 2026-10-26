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
  createShamanRecipientManaAssignment,
  summarizeShamanHealingAssignment,
} from "./shaman-healing-study.mjs";

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
const options = { kind: "group", durationSeconds: 180, damagePerSecond: 500, geometry: "stacked" };
const fields = { waterShield: 1, manaTideTotem: 1, naturesSwiftness: 1, riptide: 1 };
const priority = { directSpellId: 10396, directMinimumMissingHealth: 500, chainSpellId: 10623 };
const near = (actual, expected) =>
  assert(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("tank, distributed and burst schedules retain their exact emitted damage at both durations", () => {
  for (const durationSeconds of [180, 300])
    for (const kind of ["tank", "group", "burst"])
      for (const recipients of [4, 9, 39]) {
        const frame = createShamanHealingAssignment({
          ...options,
          durationSeconds,
          kind,
          recipients,
        });
        const expected =
          kind === "burst"
            ? Math.floor((durationSeconds - 1) / 15) * 15 * 500
            : (durationSeconds - 1) * 500;
        near(
          frame.damage.reduce((sum, row) => sum + row.amount, 0),
          expected,
        );
        assert(
          frame.damage.every(
            (row) =>
              row.atMs > 0 &&
              row.atMs < durationSeconds * 1000 &&
              row.raidIndex > 0 &&
              row.raidIndex <= recipients,
          ),
        );
        assert(frame.damage.length <= 20000);
        assert.equal(frame.targets[0].maximumHealth, 0);
        if (kind === "tank") assert(frame.damage.every((row) => row.raidIndex === 1));
      }
});

test("spread recipients remain directly reachable while lying outside one another's bounce range", () => {
  const frame = createShamanHealingAssignment({ ...options, geometry: "spread" });
  for (const row of frame.targets.slice(1)) {
    assert.equal(Math.hypot(row.x, row.y), 20);
    for (const other of frame.targets.slice(1))
      if (other !== row) assert(Math.hypot(row.x - other.x, row.y - other.y) > frame.bounceRange);
  }
  for (const recipients of [4, 9, 39]) {
    const stacked = createShamanHealingAssignment({ ...options, recipients });
    assert.equal(stacked.targets.length, recipients + 1);
    assert(stacked.targets.every((row) => Math.hypot(row.x, row.y) <= 20));
  }
  for (const change of [{ recipients: 9 }, { recipients: 39 }])
    assert.throws(() =>
      createShamanHealingAssignment({ ...options, geometry: "spread", ...change }),
    );
});

test("invalid assignment dimensions reject before constructing schedules", () => {
  for (const change of [
    { durationSeconds: 0 },
    { durationSeconds: 301 },
    { durationSeconds: 30.5 },
    { damagePerSecond: NaN },
    { damagePerSecond: -1 },
    { recipients: 40 },
    { recipients: 0 },
    { kind: "unscheduled" },
    { geometry: "guessed" },
  ])
    assert.throws(() => createShamanHealingAssignment({ ...options, ...change }));
});

test("priorities use actual eligible roots and ownership; the historical raid-book heal rejects", () => {
  const frame = createShamanHealingAssignment(options),
    snapshot = structuredClone(frame);
  const result = createShamanHealingPriorities(frame, fields, spellPolicy, priority);
  assert.deepEqual(frame, snapshot);
  assert.deepEqual(
    result.priorities.map((row) => row.spellId),
    [408510, 1325256, 10463, 1239243, 10623, 10396],
  );
  assert.equal(result.useNaturesSwiftness, true);
  assert(result.priorities.every((row) => row.raidIndex === -1));
  for (const change of [
    { directSpellId: 25357 },
    { directSpellId: 999999 },
    { chainSpellId: 25357 },
    { chainSpellId: 10396 },
  ])
    assert.throws(() =>
      createShamanHealingPriorities(frame, fields, spellPolicy, { ...priority, ...change }),
    );
  for (const action of spellPolicy.actions.filter(
    (row) =>
      row.status === "conditional-client-candidate" &&
      ["healing-wave", "lesser-healing-wave"].includes(row.family),
  ))
    assert(
      createShamanHealingPriorities(frame, fields, spellPolicy, {
        ...priority,
        directSpellId: action.spellId,
      }).priorities.some((row) => row.spellId === action.spellId),
    );
});

test("unlearned utilities and invalid healing thresholds cannot enter the controller", () => {
  const frame = createShamanHealingAssignment(options);
  const bare = createShamanHealingPriorities(frame, {}, spellPolicy, priority);
  assert.deepEqual(
    bare.priorities.map((row) => row.spellId),
    [10463, 10623, 10396],
  );
  assert.equal(bare.useNaturesSwiftness, false);
  assert.equal(bare.naturesSwiftnessMinimumMissingHealth, 0);
  for (const change of [
    { riptide: true },
    { tide: true },
    { shield: true },
    { chainRequireHot: true },
    { directMinimumMissingHealth: NaN },
    { chainMinimumInjuredTargets: 4 },
    { chainMinimumInjuredTargets: -1 },
    { tide: "yes" },
  ])
    assert.throws(() =>
      createShamanHealingPriorities(frame, {}, spellPolicy, { ...priority, ...change }),
    );
  const tank = createShamanHealingPriorities(
    createShamanHealingAssignment({ ...options, kind: "tank" }),
    fields,
    spellPolicy,
    { ...priority, chainRequireHot: true },
  );
  assert(
    tank.priorities
      .filter((row) => [10396, 10623, 1239243].includes(row.spellId))
      .every((row) => row.raidIndex === 1),
  );
  assert.equal(tank.priorities.find((row) => row.spellId === 10623).requireHot, true);
});

test("recipient resource schedules have owned costs, explicit timing and a bounded event count", () => {
  const input = {
    durationSeconds: 300,
    recipients: 39,
    maximumMana: 8000,
    startingMana: 4000,
    costAmount: 100,
    costPeriodMs: 2000,
    timing: "spend-after-pulses-reference",
  };
  const result = createShamanRecipientManaAssignment(input);
  assert.equal(result.recipients.length, 39);
  assert.equal(result.recipients[0].costs.length, 150);
  assert.deepEqual(result.recipients[0].costs[0], { atMs: 0, amount: 100 });
  assert.equal(result.recipients[0].costs.at(-1).atMs, 298000);
  result.recipients[0].costs[0].amount = 999;
  assert.equal(result.recipients[1].costs[0].amount, 100);
  for (const change of [
    { costPeriodMs: 0 },
    { costPeriodMs: 1 },
    { costPeriodMs: 1.5 },
    { startingMana: 9000 },
    { maximumMana: Infinity },
    { costAmount: 0 },
    { timing: "guessed" },
  ])
    assert.throws(() => createShamanRecipientManaAssignment({ ...input, ...change }));
});

function measured() {
  return {
    schema: "kfc-shaman-healing-workload-result.v1",
    classQualified: false,
    publicationAllowed: false,
    survivalRate: 1,
    manaRemainingMean: 500,
    plannedIncomingPostMitigationDamage: 15000,
    deliveredIncomingDamageMean: 15000,
    assignment: {
      schema: "kfc-shaman-external-assignment.v1",
      supportHpsMean: 400,
      healthRestoredHpsMean: 350,
      absorbedHpsMean: 50,
      damageDemandMean: 15000,
      externalMissingHealthSecondsMean: 9000,
      finalExternalMissingHealthMean: 3000,
      usefulOtherManaTideManaMean: 2000,
      recipientManaDemandMean: 1500,
      recipientManaSpentMean: 1000,
      recipientUnpaidManaMean: 500,
    },
  };
}

test("survival and full incoming delivery precede the external health-deficit objective", () => {
  const input = measured(),
    result = summarizeShamanHealingAssignment(input, 30);
  assert.equal(result.feasible, true);
  assert.equal(result.meanExternalMissingHealth, 300);
  assert.equal(result.supportHpsMean, 400);
  assert.equal(result.usefulOtherManaTideManaMean, 2000);
  input.survivalRate = 0.99;
  assert.equal(summarizeShamanHealingAssignment(input, 30).feasible, false);
  input.survivalRate = 1;
  input.deliveredIncomingDamageMean = 14000;
  assert.equal(summarizeShamanHealingAssignment(input, 30).feasible, false);
});

test("mana utility cannot masquerade as healing, missing health or unbounded resource spending", () => {
  for (const change of [
    (row) => {
      row.assignment.supportHpsMean += row.assignment.usefulOtherManaTideManaMean;
    },
    (row) => {
      row.assignment.healthRestoredHpsMean = 500;
    },
    (row) => {
      row.assignment.recipientManaSpentMean = 2000;
    },
    (row) => {
      row.assignment.externalMissingHealthSecondsMean = NaN;
    },
    (row) => {
      row.assignment.usefulOtherManaTideManaMean = -1;
    },
    (row) => {
      row.deliveredIncomingDamageMean = 16000;
    },
  ]) {
    const input = measured();
    change(input);
    assert.throws(() => summarizeShamanHealingAssignment(input, 30));
  }
});
