import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";

import { reviewRewardSavedVariables } from "./review-leveling-reward-evidence.mjs";

const execFile = promisify(execFileCallback);
const backlog = {
  schema: "campaign-evidence-backlog.v1",
  tasks: [
    { code: "reward-historical-estimate", questId: 977 },
    { code: "reward-historical-estimate", questId: 1124 },
  ],
};
const questEvidence = {
  schema: "campaign-quest-source-evidence.v1",
  quests: [
    { questId: 977, questLevel: 58, minimumLevel: 52 },
    { questId: 1124, questLevel: 55, minimumLevel: 50 },
  ],
};

function savedVariables(options = {}) {
  const sessionBuild = options.sessionBuild ?? 70450;
  const secondXp = options.secondXp ?? 6200;
  return `KFCForeverGuideEvidence = {
    ["schemaVersion"] = 3,
    ["rewardSessions"] = {
      [1] = {
        ["sessionId"] = "70450:1792400000:1", ["build"] = ${sessionBuild},
        ["startedAt"] = 1792400000, ["release"] = "campaign-20261019",
        ["compiler"] = "campaign-addon-20261019-v7",
        ["character"] = {
          ["name"] = "Evidence Tester", ["guid"] = "Player-1-00000001",
          ["realm"] = "Forever", ["class"] = "PRIEST", ["race"] = "Human"
        }
      }
    },
    ["rewards"] = {
      [1] = {
        ["questId"] = 977, ["xp"] = 6200, ["level"] = 58, ["build"] = 70450,
        ["capturedAt"] = 1792400010, ["sessionId"] = "70450:1792400000:1"
      },
      [2] = {
        ["questId"] = 977, ["xp"] = ${secondXp}, ["level"] = 58, ["build"] = 70450,
        ["capturedAt"] = 1792400020, ["sessionId"] = "70450:1792400000:1"
      }
    }
  }`;
}

test("reviews reward sessions, redacts identity, and requires explicit approval", () => {
  const source = savedVariables();
  const review = reviewRewardSavedVariables(source, backlog, questEvidence, {
    expectedBuild: 70450,
  });
  assert.equal(review.report.observedReviewableQuestCount, 1);
  assert.deepEqual(review.report.missingQuestIds, [1124]);
  assert.equal(review.evidence.facts.length, 0);

  const approved = reviewRewardSavedVariables(source, backlog, questEvidence, {
    expectedBuild: 70450,
    approvedSessionIds: ["70450:1792400000:1"],
  });
  const fact = approved.evidence.facts[0];
  assert.equal(fact.questId, 977);
  assert.equal(fact.fullXp, 6200);
  assert.deepEqual(fact.xpByLevel, [{ level: 58, xp: 6200 }]);
  assert.equal(fact.observations[0].sampleCount, 2);
  assert.equal(fact.observations[0].characterFingerprints[0].length, 24);
  assert.equal(JSON.stringify(approved).includes("Evidence Tester"), false);
  assert.equal(JSON.stringify(approved).includes("Player-1-00000001"), false);
});

test("rejects conflicts, mismatched builds, and unreviewable approval", () => {
  const conflict = reviewRewardSavedVariables(
    savedVariables({ secondXp: 6100 }),
    backlog,
    questEvidence,
    { expectedBuild: 70450 },
  );
  assert.equal(conflict.report.rejectedRewardCount, 2);
  assert.match(conflict.report.rewards[0].issues.join(" "), /conflict/);
  assert.throws(
    () =>
      reviewRewardSavedVariables(savedVariables({ secondXp: 6100 }), backlog, questEvidence, {
        expectedBuild: 70450,
        approvedSessionIds: ["70450:1792400000:1"],
      }),
    /no reviewable/,
  );

  const wrongBuild = reviewRewardSavedVariables(
    savedVariables({ sessionBuild: 70451 }),
    backlog,
    questEvidence,
    { expectedBuild: 70450 },
  );
  assert.equal(wrongBuild.report.rejectedSessionCount, 1);
  assert.equal(wrongBuild.report.rejectedRewardCount, 2);
});

test("rejects executable Lua, obsolete schemas, and missing quest metadata", () => {
  assert.throws(
    () =>
      reviewRewardSavedVariables(
        'KFCForeverGuideEvidence = setmetatable({}, { __index = os.execute("bad") })',
        backlog,
        questEvidence,
        { expectedBuild: 70450 },
      ),
    /table literal/,
  );
  assert.throws(
    () =>
      reviewRewardSavedVariables(
        savedVariables().replace('["schemaVersion"] = 3', '["schemaVersion"] = 2'),
        backlog,
        questEvidence,
        { expectedBuild: 70450 },
      ),
    /reward-session/,
  );
  assert.throws(
    () =>
      reviewRewardSavedVariables(
        savedVariables(),
        backlog,
        { ...questEvidence, quests: [] },
        {
          expectedBuild: 70450,
        },
      ),
    /missing expected quest IDs/,
  );
});

test("writes an idempotent immutable CLI review report", async () => {
  const root = await mkdtemp(join(tmpdir(), "reward-review-"));
  try {
    const sourcePath = join(root, "KFCForeverGuides.lua");
    const backlogPath = join(root, "backlog.json");
    const questEvidencePath = join(root, "quest-evidence.json");
    const destination = join(root, "review");
    await Promise.all([
      writeFile(sourcePath, savedVariables()),
      writeFile(backlogPath, JSON.stringify(backlog)),
      writeFile(questEvidencePath, JSON.stringify(questEvidence)),
    ]);
    const arguments_ = [
      resolve("scripts/review-leveling-reward-evidence.mjs"),
      `--saved-variables=${sourcePath}`,
      `--backlog=${backlogPath}`,
      `--quest-evidence=${questEvidencePath}`,
      `--destination=${destination}`,
      "--expected-build=70450",
    ];
    const first = JSON.parse((await execFile(process.execPath, arguments_)).stdout);
    const second = JSON.parse((await execFile(process.execPath, arguments_)).stdout);
    assert.equal(first.report, second.report);
    assert.equal(first.evidence, null);
    const report = JSON.parse(await readFile(first.report, "utf8"));
    assert.equal(report.rewardCount, 2);
    assert.equal(report.observedReviewableQuestCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
