import assert from "node:assert/strict";
import test from "node:test";

import { reviewCombatSavedVariables } from "./review-leveling-combat-evidence.mjs";

function savedVariables(samples, schemaVersion = 2) {
  const rows = samples
    .map(
      (entry, index) => `
    [${index + 1}] = {
      ["message"] = "Harvest Watcher dies, you gain ${entry.xp} experience.",
      ["level"] = 20,
      ["build"] = 70205,
      ["capturedAt"] = ${1791100000 + index},
      ["partySize"] = 5,
      ["partyLevels"] = { 20, 20, 20, 20, 20 },
      ["candidateNpcId"] = 114,
      ["candidateMobLevel"] = 20,
      ["attribution"] = "target-name-candidate",
      ["instanceType"] = "party",
      ["sessionId"] = "70205:1791100000:1",
      ["restedAtCapture"] = ${entry.rested ?? 0},
    }`,
    )
    .join(",");
  return `KFCForeverGuideEvidence = { ["schemaVersion"] = ${schemaVersion}, ["combat"] = {${rows} } }`;
}

test("groups controlled observations but requires explicit context approval", () => {
  const source = savedVariables([{ xp: 29 }, { xp: 29 }, { xp: 29 }]);
  const review = reviewCombatSavedVariables(source);
  assert.equal(review.report.groups[0].status, "review-required");
  assert.equal(review.evidence.length, 0);
  const key = review.report.groups[0].key;
  const approved = reviewCombatSavedVariables(source, { approvedKeys: [key] });
  assert.deepEqual(approved.evidence[0], {
    npcId: 114,
    build: 70205,
    playerLevel: 20,
    mobLevel: 20,
    partySize: 5,
    environment: "dungeon",
    unrestedXpPerPlayer: 29,
    partyLevels: [20, 20, 20, 20, 20],
    sampleCount: 3,
    source: approved.evidence[0].source,
    contextVerified: true,
  });
});

test("holds rested, conflicting and undersampled observations", () => {
  const source = savedVariables([{ xp: 29 }, { xp: 30 }, { xp: 29, rested: 100 }]);
  const review = reviewCombatSavedVariables(source);
  assert.equal(review.report.groups[0].status, "conflicting-payouts");
  assert.equal(review.report.rejectedSampleCount, 1);
  assert.throws(
    () => reviewCombatSavedVariables(source, { approvedKeys: [review.report.groups[0].key] }),
    /cannot be approved/,
  );
});

test("rejects executable Lua and obsolete observer output", () => {
  assert.throws(
    () =>
      reviewCombatSavedVariables(
        'KFCForeverGuideEvidence = setmetatable({}, { __index = os.execute("bad") })',
      ),
    /table literal/,
  );
  assert.throws(
    () =>
      reviewCombatSavedVariables(
        'KFCForeverGuideEvidence = { ["schemaVersion"] = 1, ["combat"] = {} }',
      ),
    /current KFCForeverGuides observer/,
  );
});

test("accepts combat samples from the grind-capable observer schema", () => {
  const review = reviewCombatSavedVariables(savedVariables([{ xp: 29 }], 3));
  assert.equal(review.report.sampleCount, 1);
});
