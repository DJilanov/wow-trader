import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { selectPaladinHealingHistoryAwareTraining } from "./paladin-healing-failure-history.mjs";
import {
  assessPaladinCoupledConfirmation,
  freezePaladinCoupledConfirmationCase,
  paladinCoupledConfirmationRounds,
} from "./paladin-healing-coupled-confirmation.mjs";

const bytes = await readFile(
    new URL("./fixtures/paladin-coupled-confirmation-source.v1.json.gz", import.meta.url),
  ),
  fixture = JSON.parse(gunzipSync(bytes)),
  hash = (value) => createHash("sha256").update(value).digest("hex"),
  historyBytes = await readFile(
    new URL("./fixtures/paladin-healing-history-source.v1.json.gz", import.meta.url),
  ),
  history = JSON.parse(gunzipSync(historyBytes));
assert.equal(hash(bytes), "efe2683ee6936500153c39ef4bfac9811caa9996339b07b4235f18822f07c79e");
assert.equal(
  hash(historyBytes),
  "d3eddba2257190f85f08a5633823595f7f66231d10b716486009853a310f75d3",
);
assert.equal(fixture.newNumericalRequests, 0);
assert.equal(fixture.newCoupledFeedbackClosureAttested, false);
const passing = fixture.cases.find((row) => row.label === "passing"),
  failed = fixture.cases.find((row) => row.label === "failed");

function trainingArgs(row) {
  return {
    caseId: row.caseId,
    selectedOptionId: row.selectedOptionId,
    sourceSelectedOptionId: row.sourceSelectedOptionId,
    measurements: row.groups[0].rows,
    failedGameplayKeys: new Set(),
    plannedDamage: row.plannedDamage,
    feedbackComplete: true,
  };
}

function assessmentArgs(row, input = trainingArgs(row)) {
  const plan = freezePaladinCoupledConfirmationCase(input),
    byId = new Map(row.groups[1].rows.map((entry) => [entry.optionId, entry]));
  const reviewed = plan.candidates.map((entry) => byId.get(entry.optionId));
  assert(reviewed.every(Boolean));
  return {
    plan,
    rounds: row.groups[1].rounds,
    excludedSeeds: row.excludedSeeds,
    durationSeconds: row.durationSeconds,
    reviewed,
  };
}

test("actual historical four-by-512 rounds remain distinct from all recorded prior seeds", () => {
  for (const row of fixture.cases) {
    const input = { rounds: row.groups[1].rounds, excludedSeeds: row.excludedSeeds },
      before = structuredClone(input),
      result = paladinCoupledConfirmationRounds(input);
    assert.deepEqual(result, input.rounds);
    result[0].seed += 1;
    assert.deepEqual(input, before);
  }
});

test("partial, duplicated, adjacent, reused or undersized confirmation batches are rejected", () => {
  for (const mutate of [
    (value) => {
      value.rounds.pop();
    },
    (value) => {
      value.rounds[1].seed = value.rounds[0].seed;
    },
    (value) => {
      value.rounds[1].seed = value.rounds[0].seed + 9999;
    },
    (value) => {
      value.rounds[0].iterations = 256;
    },
    (value) => {
      value.rounds[0].seed = 0;
    },
    (value) => {
      value.excludedSeeds.push(value.rounds[0].seed);
    },
    (value) => {
      value.excludedSeeds.push(value.rounds[0].seed - 1);
    },
    (value) => {
      value.excludedSeeds.push(NaN);
    },
  ]) {
    const input = structuredClone({
      rounds: passing.groups[1].rounds,
      excludedSeeds: passing.excludedSeeds,
    });
    mutate(input);
    assert.throws(() => paladinCoupledConfirmationRounds(input));
  }
});

test("cohorts retain the real training choice, objective leaders, distinct gears and complete training inventory", () => {
  for (const row of fixture.cases) {
    const input = trainingArgs(row),
      before = structuredClone(input),
      plan = freezePaladinCoupledConfirmationCase(input),
      byId = new Map(input.measurements.map((entry) => [entry.optionId, entry]));
    assert.equal(plan.status, "ready");
    assert.equal(plan.candidates[0].optionId, row.selectedOptionId);
    assert.deepEqual(
      plan.trainingCandidateIds,
      input.measurements.map((entry) => entry.optionId),
    );
    assert.equal(
      plan.candidates.length + plan.trainingCandidatesOutsideCohort.length,
      input.measurements.length,
    );
    const leaders = input.measurements
      .filter((entry) => entry.feasible)
      .toSorted(
        (a, b) => a.meanMissingHealth - b.meanMissingHealth || a.optionId.localeCompare(b.optionId),
      );
    for (const entry of leaders.slice(0, 8))
      assert(plan.candidates.some((candidate) => candidate.optionId === entry.optionId));
    const gears = new Set(leaders.map((entry) => entry.gearId));
    assert(new Set(plan.candidates.map((entry) => entry.gearId)).size >= Math.min(5, gears.size));
    assert(plan.candidates.every((entry) => byId.get(entry.optionId).feasible));
    assert.equal(plan.classQualified, false);
    assert.equal(plan.publicationAllowed, false);
    assert.deepEqual(input, before);
  }
});

test("known failed choices and incomplete feedback stay unqualified without reselection", () => {
  const input = trainingArgs(passing),
    winner = input.measurements.find((row) => row.optionId === input.selectedOptionId);
  const excluded = freezePaladinCoupledConfirmationCase({
    ...input,
    failedGameplayKeys: new Set([winner.gameplayKey]),
  });
  assert.equal(excluded.status, "known-failure");
  assert.equal(excluded.selectedOptionId, input.selectedOptionId);
  assert.deepEqual(excluded.candidates, []);
  assert(excluded.excludedKnownFailures.some((row) => row.optionId === winner.optionId));
  const incomplete = freezePaladinCoupledConfirmationCase({ ...input, feedbackComplete: false });
  assert.equal(incomplete.status, "feedback-incomplete");
  assert.deepEqual(incomplete.candidates, []);
  const noSurvivor = freezePaladinCoupledConfirmationCase({
    caseId: history.caseId,
    selectedOptionId: null,
    sourceSelectedOptionId: history.sourceSelectedOptionId,
    measurements: history.candidates.filter((row) => !row.feasible),
    failedGameplayKeys: new Set(),
    plannedDamage: history.plannedIncomingDamage,
    feedbackComplete: false,
  });
  assert.equal(noSurvivor.status, "no-survivor");
  assert.deepEqual(noSurvivor.candidates, []);
});

test("duplicate option representations do not consume distinct objective-leader places", () => {
  const choice = selectPaladinHealingHistoryAwareTraining({
      candidates: history.candidates,
      failedGameplayKeys: new Set(),
      plannedIncomingDamage: history.plannedIncomingDamage,
    }),
    plan = freezePaladinCoupledConfirmationCase({
      caseId: history.caseId,
      selectedOptionId: choice.selected.optionId,
      sourceSelectedOptionId: history.sourceSelectedOptionId,
      measurements: history.candidates,
      failedGameplayKeys: new Set(),
      plannedDamage: history.plannedIncomingDamage,
      feedbackComplete: true,
    }),
    objectives = plan.candidates.filter((row) =>
      row.reasons.includes("top-eight-distinct-training-objectives"),
    ),
    available = new Set(
      history.candidates.filter((row) => row.feasible).map((row) => row.gameplayKey),
    );
  assert.equal(new Set(objectives.map((row) => row.gameplayKey)).size, objectives.length);
  assert.equal(objectives.length, Math.min(8, available.size));
  assert.equal(plan.trainingCandidateIds.length, history.candidates.length);
});

test("malformed or duplicated training evidence cannot define a confirmation cohort", () => {
  for (const mutate of [
    (input) => {
      input.measurements[0].meanMissingHealth += 10;
    },
    (input) => {
      input.measurements[0].requestKeys[1] = input.measurements[0].requestKeys[0];
    },
    (input) => {
      input.measurements[1].optionId = input.measurements[0].optionId;
    },
    (input) => {
      input.measurements[0].summaries[0].manaBlockedSecondsMean = NaN;
    },
    (input) => {
      input.selectedOptionId = "0".repeat(64);
    },
    (input) => {
      input.selectedOptionId = null;
    },
  ]) {
    const input = structuredClone(trainingArgs(passing));
    mutate(input);
    assert.throws(() => freezePaladinCoupledConfirmationCase(input));
  }
});

test("real successful confirmation reproduces practical 2% and separate strict 1% results", () => {
  const input = assessmentArgs(passing),
    before = structuredClone(input),
    result = assessPaladinCoupledConfirmation(input);
  assert.equal(result.selectedOptionId, passing.selectedOptionId);
  assert.equal(result.selected.feasible, passing.expected.selectedFeasible);
  assert.equal(result.observedPractical2Percent, passing.expected.observedPractical2Percent);
  assert.equal(result.observedStrict1Percent, passing.expected.observedStrict1Percent);
  assert(result.distinctSurvivingComparators > 0);
  assert.equal(result.reselectionPerformed, false);
  assert.equal(result.classQualified, false);
  assert.equal(result.publicationAllowed, false);
  assert.deepEqual(input, before);
});

test("a genuine rare fresh-batch death remains failed despite surviving alternatives", () => {
  const input = assessmentArgs(failed),
    result = assessPaladinCoupledConfirmation(input);
  assert.equal(result.selectedOptionId, failed.selectedOptionId);
  assert.equal(result.selected.feasible, false);
  assert(result.selected.summaries.some((row) => row.survivalRate < 1));
  assert(result.reviewed.some((row) => row.feasible));
  assert.equal(result.observedPractical2Percent, false);
  assert.equal(result.observedStrict1Percent, false);
  assert.equal(result.reselectionPerformed, false);
});

test("a better holdout result cannot replace the supplied frozen choice", () => {
  const training = new Map(passing.groups[0].rows.map((row) => [row.optionId, row])),
    actual = passing.groups[1].rows.filter(
      (row) => row.feasible && training.get(row.optionId).feasible,
    ),
    mean = (row) => row.summaries.reduce((sum, summary) => sum + summary.meanMissingHealth, 0) / 4,
    ordered = actual.toSorted((a, b) => mean(a) - mean(b)),
    worst = ordered.at(-1);
  assert(mean(worst) > mean(ordered[0]) * 1.02);
  const input = assessmentArgs(passing, {
      ...trainingArgs(passing),
      selectedOptionId: worst.optionId,
    }),
    result = assessPaladinCoupledConfirmation(input);
  assert.equal(result.selectedOptionId, worst.optionId);
  assert.equal(result.observedPractical2Percent, false);
  assert.equal(result.reselectionPerformed, false);
});

test("missing, reordered, relabeled or duplicated fresh evidence is rejected", () => {
  for (const mutate of [
    (input) => {
      input.reviewed.pop();
    },
    (input) => {
      [input.reviewed[1], input.reviewed[2]] = [input.reviewed[2], input.reviewed[1]];
    },
    (input) => {
      input.reviewed[0].summaries.pop();
    },
    (input) => {
      input.reviewed[0].requestKeys[1] = input.reviewed[0].requestKeys[0];
    },
    (input) => {
      input.reviewed[0].requestKeys[0] = input.plan.candidates[0].trainingRequestKeys[0];
    },
    (input) => {
      input.reviewed[0].requestKeys[0] = input.plan.candidates[1].trainingRequestKeys[0];
    },
    (input) => {
      input.reviewed[0].iterations = 1024;
    },
    (input) => {
      input.reviewed[0].rounds[0].seed += 1;
    },
    (input) => {
      input.reviewed[0].summaries[0].meanMissingHealth += 1;
    },
    (input) => {
      input.reviewed[0].summaries[0].survivalRate = NaN;
    },
    (input) => {
      input.plan.feedbackComplete = false;
    },
    (input) => {
      input.durationSeconds = 300;
    },
  ]) {
    const input = structuredClone(assessmentArgs(passing));
    mutate(input);
    assert.throws(() => assessPaladinCoupledConfirmation(input));
  }
});

test("one surviving plan has no artificial optimality or confidence comparison", () => {
  const input = structuredClone(assessmentArgs(passing));
  input.plan.candidates = input.plan.candidates.slice(0, 1);
  input.reviewed = input.reviewed.slice(0, 1);
  const result = assessPaladinCoupledConfirmation(input);
  assert(result.selected.feasible);
  assert.equal(result.noSurvivingComparator, true);
  assert.equal(result.distinctSurvivingComparators, 0);
  assert.equal(result.observedPractical2Percent, false);
  assert.equal(result.largestPerComparison95Upper, null);
});

test("one native origin cannot carry different setup or measurement values", () => {
  for (const mutate of [
    (input) => {
      input.reviewed[1].requestKeys = [...input.reviewed[0].requestKeys];
    },
    (input) => {
      input.reviewed[1].requestKeys = [...input.reviewed[0].requestKeys];
      input.reviewed[1].gameplayKey = input.reviewed[0].gameplayKey;
      input.plan.candidates[1].gameplayKey = input.plan.candidates[0].gameplayKey;
    },
  ]) {
    const input = structuredClone(assessmentArgs(passing));
    mutate(input);
    assert.throws(() => assessPaladinCoupledConfirmation(input), /Shared origins/);
  }
  assert.equal(hash(bytes), "efe2683ee6936500153c39ef4bfac9811caa9996339b07b4235f18822f07c79e");
});
