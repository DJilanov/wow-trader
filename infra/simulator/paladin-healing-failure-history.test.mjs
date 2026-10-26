import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { selectPaladinHealingHistoryAwareTraining } from "./paladin-healing-failure-history.mjs";

const bytes = readFileSync(
  new URL("fixtures/paladin-healing-history-source.v1.json.gz", import.meta.url),
);
assert.equal(
  createHash("sha256").update(bytes).digest("hex"),
  "d3eddba2257190f85f08a5633823595f7f66231d10b716486009853a310f75d3",
);
const source = JSON.parse(gunzipSync(bytes));
const select = (failedGameplayKeys = new Set(), candidates = source.candidates) =>
  selectPaladinHealingHistoryAwareTraining({
    candidates,
    failedGameplayKeys,
    plannedIncomingDamage: source.plannedIncomingDamage,
  });
test("empty history reproduces the original real training choice without qualifying it", () => {
  const actual = select();
  assert.equal(actual.selected.optionId, source.sourceSelectedOptionId);
  assert.equal(actual.observedSurvivingCandidates, 39);
  assert.equal(actual.admissibleSurvivingCandidates, 39);
  assert.deepEqual(actual.excludedKnownFailures, []);
  assert.equal(actual.independentConfirmationRequired, true);
  assert.equal(actual.classQualified, false);
  assert.equal(actual.publicationAllowed, false);
});

test("a known failed setup cannot win a green batch and its observed metrics are preserved", () => {
  const before = structuredClone(source.candidates),
    winner = source.candidates.find((row) => row.optionId === source.sourceSelectedOptionId),
    actual = select(new Set([winner.gameplayKey]));
  assert(actual.selected);
  assert.notEqual(actual.selected.gameplayKey, winner.gameplayKey);
  assert.equal(actual.observedSurvivingCandidates, 39);
  assert.equal(actual.admissibleSurvivingCandidates, 38);
  assert.deepEqual(actual.excludedKnownFailures, [
    { optionId: winner.optionId, gameplayKey: winner.gameplayKey, survivedThisTraining: true },
  ]);
  assert.deepEqual(source.candidates, before);
});

test("the actual duplicate option representations are excluded by their shared gameplay key", () => {
  const groups = new Map();
  for (const row of source.candidates) {
    if (!groups.has(row.gameplayKey)) groups.set(row.gameplayKey, []);
    groups.get(row.gameplayKey).push(row);
  }
  const duplicate = [...groups.values()].find((rows) => rows.length > 1);
  assert.equal(duplicate.length, 2);
  assert.notEqual(duplicate[0].optionId, duplicate[1].optionId);
  const actual = select(new Set([duplicate[0].gameplayKey]));
  assert.deepEqual(
    new Set(actual.excludedKnownFailures.map((row) => row.optionId)),
    new Set(duplicate.map((row) => row.optionId)),
  );
});

test("no admissible survivor returns no recommendation rather than waiving failure evidence", () => {
  const allSurvivorsFailed = new Set(
      source.candidates.filter((row) => row.feasible).map((row) => row.gameplayKey),
    ),
    actual = select(allSurvivorsFailed);
  assert.equal(actual.selected, null);
  assert.equal(actual.selection, null);
  assert.equal(actual.observedSurvivingCandidates, 39);
  assert.equal(actual.admissibleSurvivingCandidates, 0);
  const noneSurvived = select(
    new Set(),
    source.candidates.filter((row) => !row.feasible),
  );
  assert.equal(noneSurvived.selected, null);
  assert.equal(noneSurvived.observedSurvivingCandidates, 0);
});

test("excluded malformed observations still fail validation before selection", () => {
  for (const mutate of [
    (row) => {
      row.summaries[0].meanMissingHealth = NaN;
    },
    (row) => {
      row.summaries[0].survivalRate = 0;
      row.summaries[0].feasible = true;
    },
    (row) => {
      row.summaries[0].deliveredIncomingDamageMean = 0;
      row.summaries[0].feasible = true;
    },
    (row) => {
      row.meanMissingHealth += 100;
    },
  ]) {
    const copy = structuredClone(source.candidates),
      row = copy.find((row) => row.optionId === source.sourceSelectedOptionId);
    mutate(row);
    assert.throws(() => select(new Set([row.gameplayKey]), copy));
  }
  assert.throws(() => select(new Set(["unverified-key"])));
});
