import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  campaignQuestRewardEvidenceSchema,
  parseLuaDataLiteral,
} from "../packages/leveling/dist/index.js";

const MAXIMUM_INPUT_BYTES = 8_000_000;
const MAXIMUM_REWARD_SESSIONS = 20;
const MAXIMUM_REWARDS = 100;

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

function expectedRewards(backlog) {
  if (
    !backlog ||
    backlog.schema !== "campaign-evidence-backlog.v1" ||
    !Array.isArray(backlog.tasks)
  )
    throw new Error("Expected a campaign-evidence-backlog.v1 artifact.");
  const ids = new Set();
  for (const task of backlog.tasks) {
    if (task?.code !== "reward-historical-estimate") continue;
    if (!Number.isSafeInteger(task.questId) || task.questId <= 0)
      throw new Error("Historical reward backlog task has no valid quest ID.");
    ids.add(task.questId);
  }
  if (!ids.size) throw new Error("The evidence backlog contains no historical reward tasks.");
  return ids;
}

function questLevels(questEvidence, expected) {
  if (
    !questEvidence ||
    questEvidence.schema !== "campaign-quest-source-evidence.v1" ||
    !Array.isArray(questEvidence.quests)
  )
    throw new Error("Expected a campaign-quest-source-evidence.v1 artifact.");
  const result = new Map();
  for (const quest of questEvidence.quests) {
    if (!Number.isSafeInteger(quest?.questId) || result.has(quest.questId))
      throw new Error("Quest source evidence contains an invalid or duplicate quest.");
    const questLevel = integer(quest.questLevel, 1, 60);
    const minimumLevel = integer(quest.minimumLevel, 1, 60);
    result.set(quest.questId, { questLevel, minimumLevel });
  }
  const missing = [...expected].filter((questId) => !result.has(questId));
  if (missing.length)
    throw new Error(`Quest source evidence is missing expected quest IDs: ${missing.join(", ")}`);
  return result;
}

function normalizeSession(raw, index, sourceSha256, expectedBuild) {
  const issues = [];
  let value;
  try {
    value = table(raw, `rewardSessions[${index}]`);
  } catch (error) {
    return {
      index,
      sessionId: null,
      status: "rejected",
      issues: [error instanceof Error ? error.message : "Reward session is invalid."],
      build: null,
      startedAt: null,
      release: null,
      compiler: null,
      character: null,
    };
  }
  const sessionId = string(value.get("sessionId"), 200);
  const build = integer(value.get("build"), 1, 10_000_000);
  const startedAt = integer(value.get("startedAt"), 1, 10_000_000_000);
  const release = string(value.get("release"), 100);
  const compiler = string(value.get("compiler"), 100);
  if (!sessionId) issues.push("Session ID is invalid.");
  if (build === null) issues.push("Session build is invalid.");
  else if (build !== expectedBuild)
    issues.push(`Session build does not match expected build ${expectedBuild}.`);
  if (startedAt === null) issues.push("Session start timestamp is invalid.");
  if (!release || !compiler) issues.push("Exact guide release/compiler provenance is missing.");
  let character = null;
  try {
    const rawCharacter = table(value.get("character"), `rewardSessions[${index}].character`);
    const name = string(rawCharacter.get("name"), 200);
    const guid = string(rawCharacter.get("guid"), 200);
    const realm = string(rawCharacter.get("realm"), 200);
    const className = string(rawCharacter.get("class"), 60);
    const race = string(rawCharacter.get("race"), 60);
    if (!name || !guid || !realm || !className || !race) throw new Error();
    character = {
      fingerprint: createHash("sha256")
        .update(`${sourceSha256}:${guid}:${realm}:${name}`)
        .digest("hex")
        .slice(0, 24),
      class: className,
      race,
    };
  } catch {
    issues.push("Character provenance is incomplete.");
  }
  return {
    index,
    sessionId,
    status: issues.length ? "rejected" : "review-required",
    issues,
    build,
    startedAt,
    release,
    compiler,
    character,
  };
}

function normalizeReward(raw, index, sessions, expected, levels, expectedBuild) {
  const issues = [];
  let value;
  try {
    value = table(raw, `rewards[${index}]`);
  } catch (error) {
    return {
      index,
      questId: null,
      level: null,
      xp: null,
      sessionId: null,
      capturedAt: null,
      status: "rejected",
      issues: [error instanceof Error ? error.message : "Reward observation is invalid."],
      characterFingerprint: null,
    };
  }
  const questId = integer(value.get("questId"), 1, 10_000_000);
  const xp = integer(value.get("xp"), 1, 100_000_000);
  const level = integer(value.get("level"), 1, 59);
  const build = integer(value.get("build"), 1, 10_000_000);
  const capturedAt = integer(value.get("capturedAt"), 1, 10_000_000_000);
  const sessionId = string(value.get("sessionId"), 200);
  if (questId === null) issues.push("Quest ID is invalid.");
  else if (!expected.has(questId))
    issues.push("Quest is absent from the historical reward backlog.");
  if (xp === null) issues.push("A positive leveling XP reward was not observed.");
  if (level === null) issues.push("Hand-in level must be between 1 and 59.");
  if (build === null) issues.push("Reward build is invalid.");
  else if (build !== expectedBuild) issues.push(`Reward build does not match ${expectedBuild}.`);
  if (capturedAt === null) issues.push("Reward timestamp is invalid.");
  if (!sessionId) issues.push("Reward session ID is invalid.");
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) issues.push("Reward session provenance is missing.");
  else {
    if (session.status === "rejected") issues.push("Reward session provenance was rejected.");
    if (build !== null && session.build !== build) issues.push("Reward and session builds differ.");
    if (capturedAt !== null && session.startedAt !== null && capturedAt < session.startedAt)
      issues.push("Reward predates its observation session.");
  }
  const quest = questId === null ? null : levels.get(questId);
  if (
    quest?.minimumLevel !== null &&
    quest?.minimumLevel !== undefined &&
    level !== null &&
    level < quest.minimumLevel
  )
    issues.push(`Hand-in level is below known minimum level ${quest.minimumLevel}.`);
  return {
    index,
    questId,
    level,
    xp,
    sessionId,
    capturedAt,
    status: issues.length ? "rejected" : "review-required",
    issues,
    characterFingerprint: session?.character?.fingerprint ?? null,
  };
}

function rejectConflicts(rewards) {
  const groups = new Map();
  for (const reward of rewards) {
    if (reward.status !== "review-required") continue;
    const key = `${reward.questId}:${reward.level}`;
    const group = groups.get(key) ?? [];
    group.push(reward);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (new Set(group.map((reward) => reward.xp)).size <= 1) continue;
    for (const reward of group) {
      reward.status = "rejected";
      reward.issues.push("Observations conflict for the same quest and hand-in level.");
    }
  }
}

function compileFacts(rewards, levels, sourceSha256) {
  const byQuest = new Map();
  for (const reward of rewards) {
    const group = byQuest.get(reward.questId) ?? [];
    group.push(reward);
    byQuest.set(reward.questId, group);
  }
  return [...byQuest.entries()]
    .sort(([left], [right]) => left - right)
    .map(([questId, questRewards]) => {
      const byLevel = new Map();
      for (const reward of questRewards) {
        const group = byLevel.get(reward.level) ?? [];
        group.push(reward);
        byLevel.set(reward.level, group);
      }
      const observations = [...byLevel.entries()]
        .sort(([left], [right]) => left - right)
        .map(([level, samples]) => ({
          level,
          xp: samples[0].xp,
          sampleCount: samples.length,
          sessionIds: [...new Set(samples.map((sample) => sample.sessionId))].sort(),
          characterFingerprints: [
            ...new Set(samples.map((sample) => sample.characterFingerprint)),
          ].sort(),
          firstCapturedAt: Math.min(...samples.map((sample) => sample.capturedAt)),
          lastCapturedAt: Math.max(...samples.map((sample) => sample.capturedAt)),
        }));
      const quest = levels.get(questId);
      const fullBandXp = new Set(
        quest.questLevel === null
          ? []
          : observations
              .filter((observation) => observation.level <= quest.questLevel + 5)
              .map((observation) => observation.xp),
      );
      const lastCapturedAt = Math.max(
        ...observations.map((observation) => observation.lastCapturedAt),
      );
      return {
        questId,
        fullXp: fullBandXp.size === 1 ? [...fullBandXp][0] : null,
        questLevel: quest.questLevel,
        minimumLevel: quest.minimumLevel,
        xpByLevel: observations.map(({ level, xp }) => ({ level, xp })),
        sourceUrl: `KFC reward observer ${sourceSha256.slice(0, 16)}; quest ${questId}`,
        capturedAt: new Date(lastCapturedAt * 1000).toISOString(),
        status: "available",
        evidenceKind: "observed-forever",
        observations,
        contextVerified: true,
      };
    });
}

export function reviewRewardSavedVariables(source, backlog, questEvidence, options = {}) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAXIMUM_INPUT_BYTES)
    throw new Error("Reward SavedVariables input exceeds its size budget.");
  const expectedBuild = integer(options.expectedBuild, 1, 10_000_000);
  if (expectedBuild === null) throw new Error("Expected build must be a positive integer.");
  const expected = expectedRewards(backlog);
  const levels = questLevels(questEvidence, expected);
  const root = table(parseLuaDataLiteral(rootLiteral(source)), "KFCForeverGuideEvidence");
  if (integer(root.get("schemaVersion"), 1, 100) !== 3)
    throw new Error("Run the reward-session KFCForeverGuides observer before reviewing evidence.");
  const rawSessions = array(root.get("rewardSessions"), "rewardSessions");
  const rawRewards = array(root.get("rewards"), "rewards");
  if (rawSessions.length > MAXIMUM_REWARD_SESSIONS)
    throw new Error("Reward session count exceeds the observer limit.");
  if (rawRewards.length > MAXIMUM_REWARDS)
    throw new Error("Reward observation count exceeds the observer limit.");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const sessionRows = rawSessions.map((entry, index) =>
    normalizeSession(entry, index + 1, sourceSha256, expectedBuild),
  );
  const sessionGroups = new Map();
  for (const session of sessionRows) {
    if (!session.sessionId) continue;
    const group = sessionGroups.get(session.sessionId) ?? [];
    group.push(session);
    sessionGroups.set(session.sessionId, group);
  }
  for (const group of sessionGroups.values()) {
    if (group.length < 2) continue;
    for (const session of group) {
      session.status = "rejected";
      session.issues.push("Session ID is duplicated.");
    }
  }
  const sessions = new Map(
    [...sessionGroups.entries()]
      .filter(([, group]) => group.length === 1)
      .map(([sessionId, group]) => [sessionId, group[0]]),
  );
  const rewards = rawRewards.map((entry, index) =>
    normalizeReward(entry, index + 1, sessions, expected, levels, expectedBuild),
  );
  rejectConflicts(rewards);
  const approved = new Set(options.approvedSessionIds ?? []);
  for (const sessionId of approved) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Approved reward session is absent: ${sessionId}`);
    if (session.status !== "review-required")
      throw new Error(`Reward session cannot be approved: ${sessionId}`);
    if (
      !rewards.some(
        (reward) => reward.sessionId === sessionId && reward.status === "review-required",
      )
    )
      throw new Error(`Reward session has no reviewable expected observations: ${sessionId}`);
  }
  const approvedRewards = rewards.filter(
    (reward) => reward.status === "review-required" && approved.has(reward.sessionId),
  );
  const facts = compileFacts(approvedRewards, levels, sourceSha256);
  const evidence = campaignQuestRewardEvidenceSchema.parse({
    schema: "campaign-quest-reward-evidence.v1",
    sourceSha256,
    runtimeBuild: expectedBuild,
    facts,
  });
  const observed = new Set(
    rewards.filter((reward) => reward.status === "review-required").map((reward) => reward.questId),
  );
  return {
    report: {
      schema: "forever-reward-observer-review.v1",
      sourceSha256,
      sourceFile: options.sourceFile ? basename(options.sourceFile) : null,
      expectedBuild,
      expectedQuestCount: expected.size,
      observedReviewableQuestCount: observed.size,
      missingQuestIds: [...expected]
        .filter((questId) => !observed.has(questId))
        .sort((a, b) => a - b),
      sessionCount: sessionRows.length,
      rejectedSessionCount: sessionRows.filter((session) => session.status === "rejected").length,
      rewardCount: rewards.length,
      rejectedRewardCount: rewards.filter((reward) => reward.status === "rejected").length,
      approvedSessionCount: approved.size,
      approvedQuestCount: facts.length,
      sessions: sessionRows,
      rewards,
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
        !/^--(?:saved-variables|backlog|quest-evidence|destination|approve|expected-build)=.+/.test(
          argument,
        ),
    )
  )
    throw new Error(
      "Use --saved-variables=file --backlog=file --quest-evidence=file --destination=directory --expected-build=number [--approve=session-id[,session-id]].",
    );
  const value = (name) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const sourceFile = value("saved-variables");
  const backlogFile = value("backlog");
  const questEvidenceFile = value("quest-evidence");
  const destination = value("destination");
  const expectedBuild = value("expected-build");
  if (!sourceFile || !backlogFile || !questEvidenceFile || !destination || !expectedBuild)
    throw new Error(
      "SavedVariables, backlog, quest evidence, destination, and expected build are required.",
    );
  const sourcePath = resolve(sourceFile);
  if ((await stat(sourcePath)).size > MAXIMUM_INPUT_BYTES)
    throw new Error("Reward SavedVariables input exceeds its size budget.");
  const [source, backlogRaw, questEvidenceRaw] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(resolve(backlogFile), "utf8"),
    readFile(resolve(questEvidenceFile), "utf8"),
  ]);
  const reviewed = reviewRewardSavedVariables(
    source,
    JSON.parse(backlogRaw),
    JSON.parse(questEvidenceRaw),
    {
      sourceFile: sourcePath,
      expectedBuild: Number(expectedBuild),
      approvedSessionIds: (value("approve") ?? "").split(",").filter(Boolean),
    },
  );
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const reportRaw = `${JSON.stringify(reviewed.report, null, 2)}\n`;
  const reportHash = createHash("sha256").update(reportRaw).digest("hex");
  const reportPath = join(root, `reward-review-${reportHash.slice(0, 16)}.json`);
  await writeImmutable(reportPath, reportRaw);
  let evidencePath = null;
  if (reviewed.evidence.facts.length) {
    const evidenceRaw = `${JSON.stringify(reviewed.evidence, null, 2)}\n`;
    const evidenceHash = createHash("sha256").update(evidenceRaw).digest("hex");
    evidencePath = join(root, `reward-evidence-${evidenceHash.slice(0, 16)}.json`);
    await writeImmutable(evidencePath, evidenceRaw);
  }
  process.stdout.write(
    `${JSON.stringify({ report: reportPath, evidence: evidencePath, sessions: reviewed.report.sessionCount, rewards: reviewed.report.rewardCount, rejected: reviewed.report.rejectedRewardCount, reviewableQuests: reviewed.report.observedReviewableQuestCount, missingQuests: reviewed.report.missingQuestIds.length, approvedQuests: reviewed.report.approvedQuestCount })}\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reward review failed."}\n`);
    process.exitCode = 1;
  });
