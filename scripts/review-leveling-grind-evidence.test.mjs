import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";

import { reviewGrindSavedVariables } from "./review-leveling-grind-evidence.mjs";

const execFile = promisify(execFileCallback);

const backlog = {
  schema: "campaign-evidence-backlog.v1",
  tasks: [
    {
      code: "adaptive-grind-unmeasured",
      actionId: "westfall-level-21",
    },
  ],
};

function savedVariables(options = {}) {
  const sessionId = options.sessionId ?? "70450:1792400000:1";
  const checkpointId = options.checkpointId ?? "westfall-level-21";
  const questTurnIns = options.questTurnIns ?? 0;
  const schemaVersion = options.schemaVersion ?? 3;
  return `KFCForeverGuideEvidence = {
    ["schemaVersion"] = ${schemaVersion},
    ["grinds"] = {
      [1] = {
        ["sessionId"] = "${sessionId}",
        ["checkpointId"] = "${checkpointId}",
        ["checkpointKnown"] = true,
        ["release"] = "campaign-20261019",
        ["compiler"] = "campaign-addon-20261019-v7",
        ["build"] = 70450,
        ["startedAt"] = 1792400000,
        ["endedAt"] = 1792400100,
        ["elapsedSeconds"] = 100,
        ["activeSeconds"] = 100,
        ["combatSeconds"] = 80,
        ["start"] = { ["level"] = 20, ["xp"] = 23000, ["xpMax"] = 23200 },
        ["finish"] = { ["level"] = 21, ["xp"] = 50, ["xpMax"] = 25200 },
        ["xpGained"] = 250,
        ["xpTrackingComplete"] = true,
        ["xpDiscontinuities"] = 0,
        ["killCount"] = 2,
        ["unattributedKillCount"] = 0,
        ["reportedKillXp"] = 250,
        ["unparsedKillMessageCount"] = 0,
        ["questTurnIns"] = ${questTurnIns},
        ["deaths"] = 0,
        ["partyChanged"] = false,
        ["restedAtStart"] = 0,
        ["restedAtEnd"] = 0,
        ["completionReason"] = "manual-stop",
        ["character"] = {
          ["name"] = "Evidence Tester", ["guid"] = "Player-1-00000001",
          ["realm"] = "Forever", ["class"] = "PRIEST", ["race"] = "Human"
        },
        ["startParty"] = {
          ["size"] = 1, ["levels"] = { 20 }, ["guids"] = { "Player-1-00000001" }
        },
        ["endParty"] = {
          ["size"] = 1, ["levels"] = { 21 }, ["guids"] = { "Player-1-00000001" }
        },
        ["areas"] = {
          [1] = {
            ["mapId"] = 1436, ["zone"] = "Westfall", ["subzone"] = "Moonbrook",
            ["instanceId"] = 0, ["instanceType"] = "none", ["capturedAt"] = 1792400000
          }
        },
        ["killMix"] = {
          [1] = {
            ["npcId"] = 127, ["name"] = "Defias Trapper", ["level"] = 19,
            ["count"] = 2, ["reportedXp"] = 250, ["unparsedMessages"] = 0
          }
        }
      }
    }
  }`;
}

test("normalizes a complete checkpoint measurement and requires explicit approval", () => {
  const source = savedVariables();
  const review = reviewGrindSavedVariables(source, backlog, { expectedBuild: 70450 });
  assert.equal(review.report.sessionCount, 1);
  assert.equal(review.report.rejectedSessionCount, 0);
  assert.equal(review.report.observedReviewableCheckpointCount, 1);
  assert.deepEqual(review.report.missingCheckpointIds, []);
  assert.equal(review.evidence.measurements.length, 0);

  const approved = reviewGrindSavedVariables(source, backlog, {
    expectedBuild: 70450,
    approvedSessionIds: ["70450:1792400000:1"],
  });
  const measurement = approved.evidence.measurements[0];
  assert.equal(measurement.checkpointId, "westfall-level-21");
  assert.equal(measurement.xpGained, 250);
  assert.deepEqual(measurement.party.startLevels, [20]);
  assert.equal(measurement.killMix[0].npcId, 127);
  assert.equal(measurement.contextVerified, true);
  assert.equal(measurement.character.fingerprint.length, 24);
  assert.equal(JSON.stringify(measurement).includes("Evidence Tester"), false);
  assert.equal(JSON.stringify(measurement).includes("Player-1-00000001"), false);
});

test("rejects contaminated, unknown-checkpoint, and mismatched-build sessions", () => {
  const contaminated = reviewGrindSavedVariables(savedVariables({ questTurnIns: 1 }), backlog, {
    expectedBuild: 70451,
  });
  assert.equal(contaminated.report.rejectedSessionCount, 1);
  assert.match(contaminated.report.sessions[0].issues.join(" "), /Quest turn-in XP/);
  assert.match(contaminated.report.sessions[0].issues.join(" "), /expected build 70451/);

  const unknown = reviewGrindSavedVariables(
    savedVariables({ checkpointId: "not-in-route" }),
    backlog,
  );
  assert.match(
    unknown.report.sessions[0].issues.join(" "),
    /absent from the adaptive-grind backlog/,
  );
  assert.throws(
    () =>
      reviewGrindSavedVariables(savedVariables({ questTurnIns: 1 }), backlog, {
        approvedSessionIds: ["70450:1792400000:1"],
      }),
    /cannot be approved/,
  );

  const wrongCurve = reviewGrindSavedVariables(
    savedVariables().replace('["xpMax"] = 23200', '["xpMax"] = 24000'),
    backlog,
  );
  assert.match(wrongCurve.report.sessions[0].issues.join(" "), /audited curve/);
});

test("rejects executable Lua, obsolete schemas, and invalid backlogs", () => {
  assert.throws(
    () =>
      reviewGrindSavedVariables(
        'KFCForeverGuideEvidence = setmetatable({}, { __index = os.execute("bad") })',
        backlog,
      ),
    /table literal/,
  );
  assert.throws(
    () => reviewGrindSavedVariables(savedVariables({ schemaVersion: 2 }), backlog),
    /grind-capable/,
  );
  assert.throws(
    () => reviewGrindSavedVariables(savedVariables(), { schema: "wrong", tasks: [] }),
    /campaign-evidence-backlog/,
  );
});

test("writes an idempotent immutable CLI review report", async () => {
  const root = await mkdtemp(join(tmpdir(), "grind-review-"));
  try {
    const sourcePath = join(root, "KFCForeverGuides.lua");
    const backlogPath = join(root, "backlog.json");
    const destination = join(root, "review");
    await Promise.all([
      writeFile(sourcePath, savedVariables()),
      writeFile(backlogPath, JSON.stringify(backlog)),
    ]);
    const arguments_ = [
      resolve("scripts/review-leveling-grind-evidence.mjs"),
      `--saved-variables=${sourcePath}`,
      `--backlog=${backlogPath}`,
      `--destination=${destination}`,
      "--expected-build=70450",
    ];
    const first = JSON.parse((await execFile(process.execPath, arguments_)).stdout);
    const second = JSON.parse((await execFile(process.execPath, arguments_)).stdout);
    assert.equal(first.report, second.report);
    assert.equal(first.evidence, null);
    const report = JSON.parse(await readFile(first.report, "utf8"));
    assert.equal(report.sessionCount, 1);
    assert.equal(report.observedReviewableCheckpointCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
