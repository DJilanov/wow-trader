import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  campaignQuestValidationEvidenceSchema,
  campaignQuestValidationObservationSchema,
  parseLuaDataLiteral,
} from "../packages/leveling/dist/index.js";

const MAXIMUM_INPUT_BYTES = 8_000_000;
const MAXIMUM_SESSIONS = 200;
const EVIDENCE_CODES = new Set([
  "named-target-unverified",
  "personal-eligibility-unverified",
  "quest-lifecycle-unverified",
  "pickup-level-conflict",
  "source-gate-conflict",
]);

function table(value, field) {
  if (!(value instanceof Map)) throw new Error(`${field} must be a SavedVariables table.`);
  return value;
}

function array(value, field) {
  const source = table(value, field);
  const result = [];
  for (let index = 1; index <= source.size; index++) {
    if (!source.has(index)) throw new Error(`${field} contains an array gap.`);
    result.push(source.get(index));
  }
  if ([...source.keys()].some((key) => typeof key !== "number" || key < 1 || key > source.size))
    throw new Error(`${field} contains a keyed value.`);
  return result;
}

function integer(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function string(value, maximum = 500) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function nullableBoolean(source, key) {
  if (!source.has(key) || source.get(key) === null) return null;
  return typeof source.get(key) === "boolean" ? source.get(key) : undefined;
}

function rootLiteral(source) {
  const assignment = /(?:^|\n)\s*KFCForeverGuideEvidence\s*=\s*/m.exec(source);
  if (!assignment) throw new Error("KFCForeverGuideEvidence was not found.");
  let start = assignment.index + assignment[0].length;
  while (/\s/.test(source[start] ?? "")) start++;
  if (source[start] !== "{")
    throw new Error("KFCForeverGuideEvidence does not contain a table literal.");
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "{") depth++;
    else if (character === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("KFCForeverGuideEvidence table is incomplete.");
}

function expectedTasks(backlog) {
  if (
    !backlog ||
    backlog.schema !== "campaign-evidence-backlog.v1" ||
    !Array.isArray(backlog.tasks)
  )
    throw new Error("Expected a campaign-evidence-backlog.v1 artifact.");
  const result = new Map();
  for (const task of backlog.tasks) {
    if (!EVIDENCE_CODES.has(task?.code)) continue;
    if (!Number.isSafeInteger(task.questId) || task.questId <= 0)
      throw new Error("Quest validation task has no valid quest ID.");
    const key = `${task.code}:${task.questId}`;
    if (result.has(key)) throw new Error(`Duplicate quest validation task ${key}.`);
    result.set(key, {
      key,
      code: task.code,
      questId: task.questId,
      actionId: typeof task.actionId === "string" ? task.actionId : null,
      editions: Array.isArray(task.editions) ? task.editions : [],
      players: Array.isArray(task.players) ? task.players : [],
    });
  }
  if (!result.size) throw new Error("The evidence backlog contains no quest-validation tasks.");
  return result;
}

function fingerprint(sourceSha256, guid) {
  return createHash("sha256").update(`${sourceSha256}:${guid}`).digest("hex").slice(0, 24);
}

function normalizeParty(raw, field, sourceSha256, issues) {
  try {
    const value = table(raw, field);
    const size = integer(value.get("size"), 1, 5);
    const members = array(value.get("members"), `${field}.members`).map((rawMember, index) => {
      const member = table(rawMember, `${field}.members[${index + 1}]`);
      const guid = string(member.get("guid"), 200);
      const level = integer(member.get("level"), 1, 100);
      const className = string(member.get("class"), 60);
      const race = string(member.get("race"), 60);
      if (!guid || level === null || !className || !race)
        throw new Error(`${field}.members[${index + 1}] is invalid.`);
      return { fingerprint: fingerprint(sourceSha256, guid), level, class: className, race };
    });
    if (size === null || members.length !== size) throw new Error(`${field} is invalid.`);
    const guids = array(value.get("members"), `${field}.members`).map((rawMember, index) => {
      const member = table(rawMember, `${field}.members[${index + 1}]`);
      const guid = string(member.get("guid"), 200);
      if (!guid) throw new Error(`${field}.members[${index + 1}] has no GUID.`);
      return guid;
    });
    const setFingerprint = createHash("sha256")
      .update(`kfc-quest-party-v1:${[...guids].sort().join(":")}`)
      .digest("hex")
      .slice(0, 24);
    return {
      size,
      setFingerprint,
      members: members.map((member, index) => ({
        ...member,
        rosterFingerprint: createHash("sha256")
          .update(`kfc-quest-member-v1:${setFingerprint}:${guids[index]}`)
          .digest("hex")
          .slice(0, 24),
      })),
    };
  } catch (error) {
    issues.push(error instanceof Error ? error.message : `${field} is invalid.`);
    return null;
  }
}

function normalizeSnapshots(raw, sourceSha256, issues) {
  try {
    return array(raw, "snapshots").map((rawSnapshot, snapshotIndex) => {
      const value = table(rawSnapshot, `snapshots[${snapshotIndex + 1}]`);
      const capturedAt = integer(value.get("capturedAt"), 1, 10_000_000_000);
      const onQuest = nullableBoolean(value, "onQuest");
      const readyForTurnIn = nullableBoolean(value, "readyForTurnIn");
      const rewarded = nullableBoolean(value, "rewarded");
      const availableAtGossip = nullableBoolean(value, "availableAtGossip");
      if (
        capturedAt === null ||
        onQuest === undefined ||
        readyForTurnIn === undefined ||
        rewarded === undefined ||
        availableAtGossip === undefined
      )
        throw new Error(`snapshots[${snapshotIndex + 1}] has invalid public values.`);
      const objectives = array(
        value.get("objectives"),
        `snapshots[${snapshotIndex + 1}].objectives`,
      ).map((rawObjective, objectiveIndex) => {
        const objective = table(
          rawObjective,
          `snapshots[${snapshotIndex + 1}].objectives[${objectiveIndex + 1}]`,
        );
        const index = integer(objective.get("index"), 1, 20);
        const text = objective.has("text") ? string(objective.get("text"), 500) : null;
        const fulfilled = objective.has("fulfilled")
          ? integer(objective.get("fulfilled"), 0, 1_000_000)
          : null;
        const required = objective.has("required")
          ? integer(objective.get("required"), 0, 1_000_000)
          : null;
        const finished = nullableBoolean(objective, "finished");
        if (index === null || finished === undefined)
          throw new Error(`Objective ${objectiveIndex + 1} is invalid.`);
        return {
          index,
          textSha256: text
            ? createHash("sha256").update(`${sourceSha256}:${text}`).digest("hex")
            : null,
          fulfilled,
          required,
          finished,
        };
      });
      let target = null;
      if (value.has("target") && value.get("target") !== null) {
        const rawTarget = table(value.get("target"), `snapshots[${snapshotIndex + 1}].target`);
        const name = string(rawTarget.get("name"), 200);
        const npcId = rawTarget.has("npcId")
          ? integer(rawTarget.get("npcId"), 1, 10_000_000)
          : null;
        const level = rawTarget.has("level") ? integer(rawTarget.get("level"), 1, 100) : null;
        if (!name) throw new Error(`snapshots[${snapshotIndex + 1}].target is invalid.`);
        const guid = rawTarget.has("guid") ? string(rawTarget.get("guid"), 200) : null;
        const guidId = guid?.match(/^(?:Creature|Vehicle)-\d+-\d+-\d+-\d+-(\d+)-/);
        if (guid && (!guidId || Number(guidId[1]) !== npcId))
          throw new Error("Target GUID does not match its numeric NPC identity.");
        target =
          npcId === null
            ? null
            : {
                npcId,
                name,
                level,
                ...(guid
                  ? {
                      fingerprint: createHash("sha256")
                        .update(`kfc-quest-target-v1:${guid}`)
                        .digest("hex")
                        .slice(0, 24),
                    }
                  : {}),
              };
      }
      const rawLocation = table(value.get("location"), `snapshots[${snapshotIndex + 1}].location`);
      const mapId = rawLocation.has("mapId")
        ? integer(rawLocation.get("mapId"), 0, 10_000_000)
        : null;
      const zone = rawLocation.has("zone") ? string(rawLocation.get("zone"), 200) : null;
      const subzone = rawLocation.has("subzone") ? string(rawLocation.get("subzone"), 200) : null;
      const prerequisites = value.has("prerequisites")
        ? array(value.get("prerequisites"), "prerequisites").map((rawPrerequisite) => {
            const prerequisite = table(rawPrerequisite, "prerequisite");
            const questId = integer(prerequisite.get("questId"), 1, 10_000_000);
            const onQuest = nullableBoolean(prerequisite, "onQuest");
            const rewarded = nullableBoolean(prerequisite, "rewarded");
            if (questId === null || onQuest === undefined || rewarded === undefined)
              throw new Error("Prerequisite state is invalid.");
            return { questId, onQuest, rewarded };
          })
        : undefined;
      return {
        capturedAt,
        onQuest,
        readyForTurnIn,
        rewarded,
        availableAtGossip,
        objectives,
        ...(prerequisites ? { prerequisites } : {}),
        target,
        location: { mapId, zone, subzone },
      };
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Quest snapshots are invalid.");
    return [];
  }
}

function normalizeEvents(raw, issues) {
  try {
    return array(raw, "events").map((rawEvent, index) => {
      const value = table(rawEvent, `events[${index + 1}]`);
      const name = string(value.get("name"), 40);
      const questId = integer(value.get("questId"), 1, 10_000_000);
      const capturedAt = integer(value.get("capturedAt"), 1, 10_000_000_000);
      if (
        !["QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED"].includes(name) ||
        questId === null ||
        capturedAt === null
      )
        throw new Error(`events[${index + 1}] is invalid.`);
      return { name, questId, capturedAt };
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Quest events are invalid.");
    return [];
  }
}

function signalSummary(snapshots, events, lootMessageSha256) {
  const first = snapshots[0];
  const later = snapshots.slice(1);
  const objectiveRows = new Map();
  for (const snapshot of snapshots)
    for (const objective of snapshot.objectives) {
      const rows = objectiveRows.get(objective.index) ?? [];
      rows.push(objective);
      objectiveRows.set(objective.index, rows);
    }
  const objectiveProgress = [...objectiveRows.values()].some((rows) => {
    const amounts = rows.map((row) => row.fulfilled).filter((value) => value !== null);
    return amounts.length > 1 && Math.max(...amounts) > Math.min(...amounts);
  });
  const objectiveCompleted =
    [...objectiveRows.values()].some(
      (rows) =>
        rows.some((row) => row.finished === false) && rows.some((row) => row.finished === true),
    ) ||
    (first?.readyForTurnIn === false && later.some((snapshot) => snapshot.readyForTurnIn === true));
  return {
    accepted: events.some((event) => event.name === "QUEST_ACCEPTED"),
    turnedIn: events.some((event) => event.name === "QUEST_TURNED_IN"),
    heldTransition: first?.onQuest === false && later.some((snapshot) => snapshot.onQuest === true),
    rewardedTransition:
      first?.rewarded === false && later.some((snapshot) => snapshot.rewarded === true),
    objectiveProgress,
    objectiveCompleted,
    gossipAvailable: snapshots.some((snapshot) => snapshot.availableAtGossip === true),
    matchingTargetSeen: snapshots.some((snapshot) => typeof snapshot.target?.npcId === "number"),
    lootMessageCount: lootMessageSha256.length,
    lootMessageSha256,
  };
}

function normalizeSession(raw, index, expected, sourceSha256, expectedBuild) {
  const issues = [];
  let value;
  try {
    value = table(raw, `questValidations[${index}]`);
  } catch (error) {
    return {
      index,
      sessionId: null,
      taskKey: null,
      status: "rejected",
      issues: [error instanceof Error ? error.message : "Quest validation is invalid."],
      observation: null,
    };
  }
  const sessionId = string(value.get("sessionId"), 200);
  const questId = integer(value.get("questId"), 1, 10_000_000);
  const evidenceCode = string(value.get("evidenceCode"), 60);
  const taskKey = evidenceCode && questId ? `${evidenceCode}:${questId}` : null;
  const build = integer(value.get("build"), 1, 10_000_000);
  const release = string(value.get("release"), 100);
  const compiler = string(value.get("compiler"), 100);
  const startedAt = integer(value.get("startedAt"), 1, 10_000_000_000);
  const endedAt = integer(value.get("endedAt"), 1, 10_000_000_000);
  const completionReason = string(value.get("completionReason"), 60);
  const partyChanged = value.get("partyChanged");
  if (!sessionId) issues.push("Session ID is invalid.");
  if (questId === null) issues.push("Quest ID is invalid.");
  if (!evidenceCode || !EVIDENCE_CODES.has(evidenceCode)) issues.push("Evidence code is invalid.");
  else if (taskKey && !expected.has(taskKey))
    issues.push("Session is absent from the evidence backlog.");
  if (build === null || build !== expectedBuild)
    issues.push(`Session build does not match expected build ${expectedBuild}.`);
  if (!release || !compiler) issues.push("Exact guide release/compiler provenance is missing.");
  if (startedAt === null || endedAt === null || endedAt <= startedAt)
    issues.push("Session timestamps are invalid or empty.");
  if (completionReason !== "manual-stop" && completionReason !== "all-stop")
    issues.push("Session was not explicitly stopped by the player.");
  if (partyChanged !== false) issues.push("Party membership changed during the session.");
  let character = null;
  let playerGuid = null;
  try {
    const rawCharacter = table(value.get("character"), "character");
    const name = string(rawCharacter.get("name"), 200);
    const guid = string(rawCharacter.get("guid"), 200);
    const realm = string(rawCharacter.get("realm"), 200);
    const className = string(rawCharacter.get("class"), 60);
    const race = string(rawCharacter.get("race"), 60);
    if (!name || !guid || !realm || !className || !race) throw new Error();
    playerGuid = guid;
    character = { fingerprint: fingerprint(sourceSha256, guid), class: className, race };
  } catch {
    issues.push("Character provenance is incomplete.");
  }
  const startParty = normalizeParty(value.get("startParty"), "startParty", sourceSha256, issues);
  const endParty = normalizeParty(value.get("endParty"), "endParty", sourceSha256, issues);
  if (playerGuid && startParty?.members[0]?.fingerprint !== fingerprint(sourceSha256, playerGuid))
    issues.push("Player is not the first start-party member.");
  const snapshots = normalizeSnapshots(value.get("snapshots"), sourceSha256, issues);
  const events = normalizeEvents(value.get("events"), issues);
  let lootMessageSha256 = [];
  try {
    lootMessageSha256 = array(value.get("lootMessages"), "lootMessages").map(
      (rawMessage, messageIndex) => {
        const message = table(rawMessage, `lootMessages[${messageIndex + 1}]`);
        const text = string(message.get("message"), 500);
        const capturedAt = integer(message.get("capturedAt"), 1, 10_000_000_000);
        if (!text || capturedAt === null)
          throw new Error(`lootMessages[${messageIndex + 1}] is invalid.`);
        return createHash("sha256").update(`${sourceSha256}:${text}`).digest("hex");
      },
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Loot messages are invalid.");
  }
  const signals = signalSummary(snapshots, events, lootMessageSha256);
  if (evidenceCode === "named-target-unverified") {
    if (startParty?.size !== 5)
      issues.push("Named-target evidence requires the five-player party.");
    if (!signals.matchingTargetSeen) issues.push("No numeric target NPC was captured.");
    if (!signals.objectiveProgress && !signals.objectiveCompleted && !signals.lootMessageCount)
      issues.push("No objective or loot transition was observed.");
  } else if (
    evidenceCode === "personal-eligibility-unverified" ||
    evidenceCode === "pickup-level-conflict" ||
    evidenceCode === "source-gate-conflict"
  ) {
    if (!signals.accepted && !signals.heldTransition)
      issues.push("No matching quest acceptance/held transition was observed.");
  } else if (
    evidenceCode === "quest-lifecycle-unverified" &&
    !signals.accepted &&
    !signals.heldTransition &&
    !signals.objectiveProgress &&
    !signals.objectiveCompleted &&
    !signals.turnedIn &&
    !signals.rewardedTransition
  )
    issues.push("No quest lifecycle transition was observed.");
  const observation = {
    sessionId,
    questId,
    evidenceCode,
    build,
    release,
    compiler,
    character,
    startedAt,
    endedAt,
    completionReason,
    startParty,
    endParty,
    partyChanged,
    snapshots,
    events,
    signals,
    source: `KFC quest observer ${sourceSha256.slice(0, 16)}; session ${sessionId ?? index}`,
    contextVerified: true,
  };
  if (!issues.length) {
    const parsed = campaignQuestValidationObservationSchema.safeParse(observation);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        issues.push(`${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`);
  }
  return {
    index,
    sessionId,
    taskKey,
    status: issues.length ? "rejected" : "review-required",
    issues: [...new Set(issues)],
    observation,
  };
}

export function reviewQuestValidationSavedVariables(source, backlog, options = {}) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAXIMUM_INPUT_BYTES)
    throw new Error("Quest-validation SavedVariables input exceeds its size budget.");
  const expectedBuild = integer(options.expectedBuild, 1, 10_000_000);
  if (expectedBuild === null) throw new Error("Expected build must be a positive integer.");
  const expected = expectedTasks(backlog);
  const root = table(parseLuaDataLiteral(rootLiteral(source)), "KFCForeverGuideEvidence");
  if (integer(root.get("schemaVersion"), 1, 100) !== 3)
    throw new Error(
      "Run the quest-validation KFCForeverGuides observer before reviewing evidence.",
    );
  const rawSessions = array(root.get("questValidations"), "questValidations");
  if (rawSessions.length > MAXIMUM_SESSIONS)
    throw new Error("Quest-validation session count exceeds the observer limit.");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const sessions = rawSessions.map((entry, index) =>
    normalizeSession(entry, index + 1, expected, sourceSha256, expectedBuild),
  );
  const groups = new Map();
  for (const session of sessions) {
    if (!session.sessionId) continue;
    const group = groups.get(session.sessionId) ?? [];
    group.push(session);
    groups.set(session.sessionId, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const session of group) {
      session.status = "rejected";
      session.issues.push("Session ID is duplicated.");
    }
  }
  const approved = new Set(options.approvedSessionIds ?? []);
  for (const sessionId of approved) {
    const group = groups.get(sessionId);
    if (!group) throw new Error(`Approved quest-validation session is absent: ${sessionId}`);
    if (group.length !== 1 || group[0].status !== "review-required")
      throw new Error(`Quest-validation session cannot be approved: ${sessionId}`);
  }
  const observations = sessions
    .filter((session) => session.sessionId && approved.has(session.sessionId))
    .map((session) => session.observation);
  const evidence = campaignQuestValidationEvidenceSchema.parse({
    schema: "campaign-quest-validation-evidence.v1",
    sourceSha256,
    runtimeBuild: expectedBuild,
    observations,
  });
  const observedKeys = new Set(
    sessions
      .filter((session) => session.status === "review-required")
      .map((session) => session.taskKey),
  );
  return {
    report: {
      schema: "forever-quest-validation-review.v1",
      sourceSha256,
      sourceFile: options.sourceFile ? basename(options.sourceFile) : null,
      expectedBuild,
      expectedTaskCount: expected.size,
      observedReviewableTaskCount: observedKeys.size,
      missingTaskKeys: [...expected.keys()].filter((key) => !observedKeys.has(key)).sort(),
      approvedSessionCount: observations.length,
      sessionCount: sessions.length,
      rejectedSessionCount: sessions.filter((session) => session.status === "rejected").length,
      sessions,
    },
    evidence,
  };
}

async function writeImmutable(path, contents) {
  try {
    await writeFile(path, contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    if ((await readFile(path, "utf8")) !== contents)
      throw new Error(`Existing review artifact has different contents: ${path}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (argument) =>
        !/^--(?:saved-variables|backlog|destination|approve|expected-build)=.+/.test(argument),
    )
  )
    throw new Error(
      "Use --saved-variables=file --backlog=file --destination=directory --expected-build=number [--approve=session-id[,session-id]].",
    );
  const value = (name) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const sourceFile = value("saved-variables");
  const backlogFile = value("backlog");
  const destination = value("destination");
  const expectedBuild = value("expected-build");
  if (!sourceFile || !backlogFile || !destination || !expectedBuild)
    throw new Error("SavedVariables, backlog, destination, and expected build are required.");
  const sourcePath = resolve(sourceFile);
  if ((await stat(sourcePath)).size > MAXIMUM_INPUT_BYTES)
    throw new Error("Quest-validation SavedVariables input exceeds its size budget.");
  const [source, backlogRaw] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(resolve(backlogFile), "utf8"),
  ]);
  const reviewed = reviewQuestValidationSavedVariables(source, JSON.parse(backlogRaw), {
    sourceFile: sourcePath,
    expectedBuild: Number(expectedBuild),
    approvedSessionIds: (value("approve") ?? "").split(",").filter(Boolean),
  });
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const reportRaw = `${JSON.stringify(reviewed.report, null, 2)}\n`;
  const reportHash = createHash("sha256").update(reportRaw).digest("hex");
  const reportPath = join(root, `quest-validation-review-${reportHash.slice(0, 16)}.json`);
  await writeImmutable(reportPath, reportRaw);
  let evidencePath = null;
  if (reviewed.evidence.observations.length) {
    const evidenceRaw = `${JSON.stringify(reviewed.evidence, null, 2)}\n`;
    const evidenceHash = createHash("sha256").update(evidenceRaw).digest("hex");
    evidencePath = join(root, `quest-validation-evidence-${evidenceHash.slice(0, 16)}.json`);
    await writeImmutable(evidencePath, evidenceRaw);
  }
  process.stdout.write(
    `${JSON.stringify({ report: reportPath, evidence: evidencePath, sessions: reviewed.report.sessionCount, rejected: reviewed.report.rejectedSessionCount, reviewableTasks: reviewed.report.observedReviewableTaskCount, missingTasks: reviewed.report.missingTaskKeys.length, approved: reviewed.report.approvedSessionCount })}\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Quest validation review failed."}\n`,
    );
    process.exitCode = 1;
  });
