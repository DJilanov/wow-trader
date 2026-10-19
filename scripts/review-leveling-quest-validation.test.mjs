import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { promisify } from "node:util";

import { reviewQuestValidationSavedVariables } from "./review-leveling-quest-validation.mjs";
import {
  CAMPAIGN_ADDON_COMPILER_REVISION,
  createQuestValidationResolver,
  questValidationCertificate,
  questValidationCoverageSchema,
  createQuestValidationCertificateResolver,
} from "../packages/leveling/dist/index.js";

const execFile = promisify(execFileCallback);
const backlog = {
  schema: "campaign-evidence-backlog.v1",
  tasks: [
    { code: "personal-eligibility-unverified", questId: 1053, actionId: "accept-1053" },
    { code: "quest-lifecycle-unverified", questId: 1053, actionId: "accept-1053" },
  ],
};

function savedVariables(options = {}) {
  const build = options.build ?? 70450;
  const partyChanged = options.partyChanged ?? false;
  return `KFCForeverGuideEvidence = {
    ["schemaVersion"] = 3,
    ["questValidations"] = {
      [1] = {
        ["sessionId"] = "70450:1792500000:1", ["questId"] = 1053,
        ["evidenceCode"] = "personal-eligibility-unverified", ["build"] = ${build},
        ["release"] = "campaign-20261019", ["compiler"] = "campaign-addon-20261019-v7",
        ["startedAt"] = 1792500000, ["endedAt"] = 1792500010,
        ["completionReason"] = "manual-stop", ["partyChanged"] = ${partyChanged},
        ["character"] = {
          ["name"] = "Evidence Tester", ["guid"] = "Player-1-00000001",
          ["realm"] = "Forever", ["class"] = "PRIEST", ["race"] = "Human"
        },
        ["startParty"] = { ["size"] = 1, ["members"] = {
          [1] = { ["guid"] = "Player-1-00000001", ["level"] = 30, ["class"] = "PRIEST", ["race"] = "Human" }
        } },
        ["endParty"] = { ["size"] = 1, ["members"] = {
          [1] = { ["guid"] = "Player-1-00000001", ["level"] = 30, ["class"] = "PRIEST", ["race"] = "Human" }
        } },
        ["snapshots"] = {
          [1] = {
            ["capturedAt"] = 1792500000, ["onQuest"] = false, ["readyForTurnIn"] = false,
            ["rewarded"] = false, ["availableAtGossip"] = true, ["objectives"] = {},
            ["location"] = { ["mapId"] = 1453, ["zone"] = "Stormwind City", ["subzone"] = "Cathedral Square" }
          },
          [2] = {
            ["capturedAt"] = 1792500001, ["onQuest"] = true, ["readyForTurnIn"] = false,
            ["rewarded"] = false, ["availableAtGossip"] = false,
            ["objectives"] = { [1] = { ["index"] = 1, ["text"] = "Defeat target", ["fulfilled"] = 0, ["required"] = 1, ["finished"] = false } },
            ["location"] = { ["mapId"] = 1453, ["zone"] = "Stormwind City", ["subzone"] = "Cathedral Square" }
          }
        },
        ["events"] = { [1] = { ["name"] = "QUEST_ACCEPTED", ["questId"] = 1053, ["capturedAt"] = 1792500001 } },
        ["lootMessages"] = {}
      }
    }
  }`;
}

test("normalizes and redacts a quest eligibility observation", () => {
  const review = reviewQuestValidationSavedVariables(savedVariables(), backlog, {
    expectedBuild: 70450,
  });
  assert.equal(review.report.observedReviewableTaskCount, 1);
  assert.deepEqual(review.report.missingTaskKeys, ["quest-lifecycle-unverified:1053"]);
  assert.equal(review.evidence.observations.length, 0);

  const approved = reviewQuestValidationSavedVariables(savedVariables(), backlog, {
    expectedBuild: 70450,
    approvedSessionIds: ["70450:1792500000:1"],
  });
  const observation = approved.evidence.observations[0];
  assert.equal(observation.signals.accepted, true);
  assert.equal(observation.signals.heldTransition, true);
  assert.equal(observation.signals.matchingTargetSeen, false);
  assert.equal(observation.character.fingerprint.length, 24);
  assert.equal(observation.snapshots[1].objectives[0].textSha256.length, 64);
  assert.equal(JSON.stringify(approved).includes("Evidence Tester"), false);
  assert.equal(JSON.stringify(approved).includes("Player-1-00000001"), false);
  assert.equal(JSON.stringify(approved).includes("Defeat target"), false);
});

test("correlates a member within the same roster across files without exporting their GUID", () => {
  const options = { expectedBuild: 70450, approvedSessionIds: ["70450:1792500000:1"] };
  const first = reviewQuestValidationSavedVariables(savedVariables(), backlog, options).evidence;
  const next = reviewQuestValidationSavedVariables(
    `${savedVariables()}\n-- subsequent file`,
    backlog,
    options,
  ).evidence;
  const left = first.observations[0].startParty.members[0];
  const right = next.observations[0].startParty.members[0];
  assert.notEqual(left.fingerprint, right.fingerprint);
  assert.equal(left.rosterFingerprint, right.rosterFingerprint);
  assert.equal(JSON.stringify(next).includes("Player-1-00000001"), false);
});

test("redacts NPC instance identities and retains explicit prerequisite observations", () => {
  const targetGuid = "Creature-0-1-2-3-448-0000000001";
  const source = savedVariables().replaceAll(
    '["location"] = {',
    `
    ["target"] = { ["npcId"] = 448, ["guid"] = "${targetGuid}", ["name"] = "Hogger", ["level"] = 11 },
    ["prerequisites"] = { [1] = { ["questId"] = 1052, ["onQuest"] = false, ["rewarded"] = false } },
    ["location"] = {`,
  );
  const options = { expectedBuild: 70450, approvedSessionIds: ["70450:1792500000:1"] };
  const approved = reviewQuestValidationSavedVariables(source, backlog, options).evidence;
  assert.equal(approved.observations[0].snapshots[0].target.fingerprint.length, 24);
  assert.deepEqual(approved.observations[0].snapshots[0].prerequisites, [
    { questId: 1052, onQuest: false, rewarded: false },
  ]);
  assert.equal(JSON.stringify(approved).includes(targetGuid), false);
  const malformed = reviewQuestValidationSavedVariables(
    source.replaceAll('["npcId"] = 448', '["npcId"] = 999'),
    backlog,
    { expectedBuild: 70450 },
  );
  assert.equal(malformed.report.rejectedSessionCount, 1);
});

test("carries an approved observation through scoped audit proof to privacy-safe browser coverage", () => {
  const source = savedVariables().replaceAll(
    "campaign-addon-20261019-v7",
    CAMPAIGN_ADDON_COMPILER_REVISION,
  );
  const approved = reviewQuestValidationSavedVariables(source, backlog, {
    expectedBuild: 70450,
    approvedSessionIds: ["70450:1792500000:1"],
  }).evidence;
  const context = {
    release: "campaign-20261019",
    raceId: "human",
    classSlug: "priest",
    partySize: 1,
    objectiveIndexes: [],
    targetNpcIds: [],
    minimumLevelClaims: [],
    prerequisiteGate: null,
  };
  const issue = {
    code: "personal-eligibility-unverified",
    questId: 1053,
    actionId: "accept-1053",
    message: "Need evidence",
    domain: "eligibility",
    resolution: "in-game",
    blocksForecast: false,
  };
  const proof = createQuestValidationResolver(
    [approved],
    70450,
    CAMPAIGN_ADDON_COMPILER_REVISION,
  )(issue, context);
  assert.ok(proof);
  const coverage = questValidationCoverageSchema.parse({
    schema: "campaign-quest-validation-coverage.v1",
    runtimeBuild: 70450,
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    certificates: [questValidationCertificate(proof)],
  });
  const published = createQuestValidationCertificateResolver(
    coverage,
    70450,
    CAMPAIGN_ADDON_COMPILER_REVISION,
  );
  assert.equal(published(issue, context).observationCount, 1);
  assert.equal(published(issue, { ...context, raceId: "gnome" }), null);
  assert.equal(JSON.stringify(coverage).includes("sessionIds"), false);
  assert.equal(JSON.stringify(coverage).includes("fingerprint"), false);
  assert.equal(JSON.stringify(coverage).includes("Evidence Tester"), false);
});

test("does not export another player's name from a non-NPC target snapshot", () => {
  const source = savedVariables().replaceAll(
    '["location"] = {',
    '["target"] = { ["name"] = "Private Target Player", ["level"] = 30 }, ["location"] = {',
  );
  const reviewed = reviewQuestValidationSavedVariables(source, backlog, {
    expectedBuild: 70450,
    approvedSessionIds: ["70450:1792500000:1"],
  });
  assert.equal(reviewed.evidence.observations[0].snapshots[0].target, null);
  assert.equal(JSON.stringify(reviewed).includes("Private Target Player"), false);
});

test("rejects wrong builds, party changes, and unreviewable approval", () => {
  const review = reviewQuestValidationSavedVariables(
    savedVariables({ build: 70451, partyChanged: true }),
    backlog,
    { expectedBuild: 70450 },
  );
  assert.equal(review.report.rejectedSessionCount, 1);
  assert.match(review.report.sessions[0].issues.join(" "), /build/);
  assert.match(review.report.sessions[0].issues.join(" "), /Party membership changed/);
  assert.throws(
    () =>
      reviewQuestValidationSavedVariables(savedVariables({ partyChanged: true }), backlog, {
        expectedBuild: 70450,
        approvedSessionIds: ["70450:1792500000:1"],
      }),
    /cannot be approved/,
  );
});

test("rejects executable Lua, obsolete schemas, and invalid backlogs", () => {
  assert.throws(
    () =>
      reviewQuestValidationSavedVariables(
        'KFCForeverGuideEvidence = setmetatable({}, { __index = os.execute("bad") })',
        backlog,
        { expectedBuild: 70450 },
      ),
    /table literal/,
  );
  assert.throws(
    () =>
      reviewQuestValidationSavedVariables(
        savedVariables().replace('["schemaVersion"] = 3', '["schemaVersion"] = 2'),
        backlog,
        { expectedBuild: 70450 },
      ),
    /quest-validation/,
  );
  assert.throws(
    () =>
      reviewQuestValidationSavedVariables(
        savedVariables(),
        { schema: "wrong" },
        { expectedBuild: 70450 },
      ),
    /campaign-evidence-backlog/,
  );
});

test("writes an idempotent immutable CLI review report", async () => {
  const root = await mkdtemp(join(tmpdir(), "quest-validation-review-"));
  try {
    const sourcePath = join(root, "KFCForeverGuides.lua");
    const backlogPath = join(root, "backlog.json");
    const destination = join(root, "review");
    await Promise.all([
      writeFile(sourcePath, savedVariables()),
      writeFile(backlogPath, JSON.stringify(backlog)),
    ]);
    const arguments_ = [
      resolve("scripts/review-leveling-quest-validation.mjs"),
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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
