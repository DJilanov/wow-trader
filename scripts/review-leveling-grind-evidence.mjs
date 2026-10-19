import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import {
  campaignGrindEvidenceSchema,
  campaignGrindMeasurementSchema,
  parseLuaDataLiteral,
} from "../packages/leveling/dist/index.js";

const MAXIMUM_INPUT_BYTES = 8_000_000;
const MAXIMUM_SESSIONS = 250;

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

function boolean(value) {
  return typeof value === "boolean" ? value : null;
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

function xpPosition(value, field, issues) {
  try {
    const source = table(value, field);
    const level = integer(source.get("level"), 1, 60);
    const xp = integer(source.get("xp"), 0, 100_000_000);
    const xpMax = integer(source.get("xpMax"), 0, 100_000_000);
    if (level === null || xp === null || xpMax === null || xp > xpMax)
      throw new Error(`${field} is invalid.`);
    return { level, xp, xpMax };
  } catch (error) {
    issues.push(error instanceof Error ? error.message : `${field} is invalid.`);
    return null;
  }
}

function party(value, field, issues) {
  try {
    const source = table(value, field);
    const size = integer(source.get("size"), 1, 5);
    const levels = array(source.get("levels"), `${field}.levels`).map((entry) =>
      integer(entry, 1, 60),
    );
    const guids = array(source.get("guids"), `${field}.guids`).map((entry) =>
      typeof entry === "string" && entry.length <= 200 ? entry : null,
    );
    if (
      size === null ||
      levels.length !== size ||
      guids.length !== size ||
      levels.some((entry) => entry === null) ||
      guids.some((entry) => entry === null)
    )
      throw new Error(`${field} is invalid.`);
    return { size, levels, guids };
  } catch (error) {
    issues.push(error instanceof Error ? error.message : `${field} is invalid.`);
    return null;
  }
}

function areas(value, issues) {
  try {
    return array(value, "areas").map((raw, index) => {
      const source = table(raw, `areas[${index + 1}]`);
      const mapId = integer(source.get("mapId"), 0, 10_000_000);
      const instanceId = integer(source.get("instanceId"), 0, 10_000_000);
      const capturedAt = integer(source.get("capturedAt"), 1, 10_000_000_000);
      const zone = string(source.get("zone"), 200);
      const subzone = string(source.get("subzone"), 200);
      const instanceType = string(source.get("instanceType"), 60);
      if (mapId === null && !zone) throw new Error(`areas[${index + 1}] has no location.`);
      if (capturedAt === null) throw new Error(`areas[${index + 1}] has no timestamp.`);
      return { mapId, zone, subzone, instanceId, instanceType, capturedAt };
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Area samples are invalid.");
    return [];
  }
}

function killMix(value, issues) {
  try {
    return array(value, "killMix").map((raw, index) => {
      const source = table(raw, `killMix[${index + 1}]`);
      const npcId = integer(source.get("npcId"), 1, 10_000_000);
      const name = string(source.get("name"), 200);
      const level = integer(source.get("level"), 1, 100);
      const count = integer(source.get("count"), 1, 100_000);
      const reportedXp = integer(source.get("reportedXp"), 0, 100_000_000);
      const unparsedMessages = integer(source.get("unparsedMessages"), 0, 100_000);
      if (
        npcId === null ||
        !name ||
        level === null ||
        count === null ||
        reportedXp === null ||
        unparsedMessages === null
      )
        throw new Error(`killMix[${index + 1}] is invalid.`);
      return { npcId, name, level, count, reportedXp, unparsedMessages };
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Kill mix is invalid.");
    return [];
  }
}

function expectedCheckpoints(backlog) {
  if (
    !backlog ||
    backlog.schema !== "campaign-evidence-backlog.v1" ||
    !Array.isArray(backlog.tasks)
  )
    throw new Error("Expected a campaign-evidence-backlog.v1 artifact.");
  const ids = new Set();
  for (const task of backlog.tasks) {
    if (task?.code !== "adaptive-grind-unmeasured") continue;
    if (typeof task.actionId !== "string" || !task.actionId)
      throw new Error("Adaptive grind backlog task has no action ID.");
    ids.add(task.actionId);
  }
  if (!ids.size) throw new Error("The evidence backlog contains no adaptive grind checkpoints.");
  return ids;
}

function normalizeSession(raw, index, expected, sourceSha256, expectedBuild) {
  const issues = [];
  const warnings = [];
  let value;
  try {
    value = table(raw, `grinds[${index}]`);
  } catch (error) {
    return {
      index,
      sessionId: null,
      checkpointId: null,
      status: "rejected",
      issues: [error instanceof Error ? error.message : "Session is invalid."],
      warnings,
    };
  }
  const sessionId = string(value.get("sessionId"), 200);
  const checkpointId = string(value.get("checkpointId"), 180);
  const build = integer(value.get("build"), 1, 10_000_000);
  const release = string(value.get("release"), 100);
  const compiler = string(value.get("compiler"), 100);
  const startedAt = integer(value.get("startedAt"), 1, 10_000_000_000);
  const endedAt = integer(value.get("endedAt"), 1, 10_000_000_000);
  const elapsedSeconds = integer(value.get("elapsedSeconds"), 0, 10_000_000);
  const activeSeconds = integer(value.get("activeSeconds"), 0, 10_000_000);
  const combatSeconds = integer(value.get("combatSeconds"), 0, 10_000_000);
  const xpGained = integer(value.get("xpGained"), 0, 100_000_000);
  const killCount = integer(value.get("killCount"), 0, 100_000);
  const unattributedKillCount = integer(value.get("unattributedKillCount"), 0, 100_000);
  const reportedKillXp = integer(value.get("reportedKillXp"), 0, 100_000_000);
  const unparsedKillMessageCount = integer(value.get("unparsedKillMessageCount"), 0, 100_000);
  const questTurnIns = integer(value.get("questTurnIns"), 0, 10_000);
  const deaths = integer(value.get("deaths"), 0, 10_000);
  const xpDiscontinuities = integer(value.get("xpDiscontinuities"), 0, 10_000);
  const completionReason = string(value.get("completionReason"), 60);
  const checkpointKnown = boolean(value.get("checkpointKnown"));
  const xpTrackingComplete = boolean(value.get("xpTrackingComplete"));
  const partyChanged = boolean(value.get("partyChanged"));
  const liveCaptureFailed = value.has("liveCaptureFailed")
    ? boolean(value.get("liveCaptureFailed"))
    : false;
  const mixTruncated = value.has("killMixTruncated")
    ? boolean(value.get("killMixTruncated"))
    : false;
  const start = xpPosition(value.get("start"), "start", issues);
  const finish = xpPosition(value.get("finish"), "finish", issues);
  const startParty = party(value.get("startParty"), "startParty", issues);
  const endParty = party(value.get("endParty"), "endParty", issues);
  const areaSamples = areas(value.get("areas"), issues);
  const mix = killMix(value.get("killMix"), issues);
  const required = [
    [sessionId, "Session ID"],
    [checkpointId, "Checkpoint ID"],
    [build, "Build"],
    [startedAt, "Start timestamp"],
    [endedAt, "End timestamp"],
    [elapsedSeconds, "Elapsed seconds"],
    [activeSeconds, "Active seconds"],
    [combatSeconds, "Combat seconds"],
    [xpGained, "XP gained"],
    [killCount, "Kill count"],
    [unattributedKillCount, "Unattributed kill count"],
    [reportedKillXp, "Reported kill XP"],
    [unparsedKillMessageCount, "Unparsed kill message count"],
    [questTurnIns, "Quest turn-in count"],
    [deaths, "Death count"],
    [xpDiscontinuities, "XP discontinuity count"],
    [completionReason, "Completion reason"],
    [checkpointKnown, "Checkpoint-known flag"],
    [xpTrackingComplete, "XP tracking flag"],
    [partyChanged, "Party-changed flag"],
  ];
  for (const [entry, label] of required) if (entry === null) issues.push(`${label} is invalid.`);
  if (checkpointId && !expected.has(checkpointId))
    issues.push("Checkpoint is absent from the adaptive-grind backlog.");
  if (expectedBuild !== null && build !== expectedBuild)
    issues.push(`Session build does not match expected build ${expectedBuild}.`);
  if (checkpointKnown !== true)
    issues.push("The installed guide did not recognize this checkpoint.");
  if (!release || !compiler) issues.push("Exact guide release/compiler provenance is missing.");
  if (!xpTrackingComplete || xpDiscontinuities !== 0 || liveCaptureFailed)
    issues.push("XP tracking was incomplete or discontinuous.");
  if (completionReason !== "manual-stop" && completionReason !== "all-stop")
    issues.push("The session was not explicitly completed by the player.");
  if (elapsedSeconds !== null && elapsedSeconds <= 0) issues.push("Elapsed duration is empty.");
  if (activeSeconds !== null && activeSeconds <= 0) issues.push("Active duration is empty.");
  if (xpGained !== null && xpGained <= 0) issues.push("No XP gain was observed.");
  if (killCount !== null && killCount <= 0) issues.push("No kill-XP messages were observed.");
  if (questTurnIns !== null && questTurnIns > 0)
    issues.push("Quest turn-in XP contaminated the grind session.");
  if (partyChanged) issues.push("Party membership changed during the session.");
  if (mixTruncated) issues.push("The attributed kill mix exceeded its bounded storage.");
  if (areaSamples.length === 0) issues.push("No camp/area sample was captured.");
  const attributedKills =
    killCount !== null && unattributedKillCount !== null ? killCount - unattributedKillCount : null;
  const mixedKills = mix.reduce((sum, entry) => sum + entry.count, 0);
  if (attributedKills !== null && (attributedKills < 0 || mixedKills !== attributedKills))
    issues.push("The attributed kill mix does not reconcile with the kill count.");
  if (unattributedKillCount && killCount && unattributedKillCount / killCount > 0.2)
    issues.push("More than 20% of kills lack an NPC attribution candidate.");
  else if (unattributedKillCount)
    warnings.push(`${unattributedKillCount} kill(s) lack NPC attribution.`);
  if (unparsedKillMessageCount)
    warnings.push(`${unparsedKillMessageCount} kill message(s) lack parsed XP.`);
  if (
    unparsedKillMessageCount === 0 &&
    reportedKillXp !== null &&
    xpGained !== null &&
    reportedKillXp !== xpGained
  )
    issues.push("XP-bar gain does not reconcile with the parsed kill-XP messages.");
  const restedAtStart = integer(value.get("restedAtStart"), 0, 1_000_000_000);
  const restedAtEnd = integer(value.get("restedAtEnd"), 0, 1_000_000_000);
  if (restedAtStart === null || restedAtEnd === null)
    issues.push("Rested-XP state is unavailable.");
  else if (restedAtStart > 0 || restedAtEnd > 0)
    issues.push("Rested XP influenced or could influence this checkpoint measurement.");
  if (deaths) warnings.push(`${deaths} player death(s) occurred during the session.`);
  if (elapsedSeconds && activeSeconds !== null && activeSeconds / elapsedSeconds < 0.8)
    warnings.push("Less than 80% of elapsed time was active player time.");
  const character = (() => {
    try {
      const source = table(value.get("character"), "character");
      const name = string(source.get("name"), 200);
      const guid = string(source.get("guid"), 200);
      const realm = string(source.get("realm"), 200);
      const className = string(source.get("class"), 60);
      const race = string(source.get("race"), 60);
      if (!name || !guid || !realm || !className || !race) throw new Error();
      return {
        fingerprint: createHash("sha256")
          .update(`${sourceSha256}:${guid}:${realm}:${name}`)
          .digest("hex")
          .slice(0, 24),
        class: className,
        race,
      };
    } catch {
      issues.push("Character provenance is incomplete.");
      return null;
    }
  })();
  const measurement = {
    sessionId,
    checkpointId,
    build,
    release,
    compiler,
    character,
    startedAt,
    endedAt,
    start,
    finish,
    xpGained,
    elapsedSeconds,
    activeSeconds,
    combatSeconds,
    party:
      startParty && endParty
        ? {
            size: startParty.size,
            startLevels: startParty.levels,
            endLevels: endParty.levels,
          }
        : null,
    areas: areaSamples,
    killCount,
    unattributedKillCount,
    reportedKillXp,
    unparsedKillMessageCount,
    killMix: mix,
    questTurnIns,
    deaths,
    restedAtStart,
    restedAtEnd,
    source: `KFC grind observer ${sourceSha256.slice(0, 16)}; SavedVariables session ${sessionId ?? index}`,
    contextVerified: true,
  };
  if (!issues.length) {
    const validated = campaignGrindMeasurementSchema.safeParse(measurement);
    if (!validated.success)
      for (const issue of validated.error.issues)
        issues.push(`${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`);
  }
  return {
    index,
    sessionId,
    checkpointId,
    status: issues.length ? "rejected" : "review-required",
    issues: [...new Set(issues)],
    warnings,
    measurement,
  };
}

export function reviewGrindSavedVariables(source, backlog, options = {}) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAXIMUM_INPUT_BYTES)
    throw new Error("Grind SavedVariables input exceeds its size budget.");
  const expected = expectedCheckpoints(backlog);
  const root = table(parseLuaDataLiteral(rootLiteral(source)), "KFCForeverGuideEvidence");
  if (integer(root.get("schemaVersion"), 1, 100) !== 3)
    throw new Error("Run the grind-capable KFCForeverGuides observer before reviewing evidence.");
  const rawSessions = array(root.get("grinds"), "grinds");
  if (rawSessions.length > MAXIMUM_SESSIONS)
    throw new Error("Grind session count exceeds the observer limit.");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const expectedBuild =
    options.expectedBuild === undefined ? null : integer(options.expectedBuild, 1, 10_000_000);
  if (options.expectedBuild !== undefined && expectedBuild === null)
    throw new Error("Expected build must be a positive integer.");
  const sessions = rawSessions.map((entry, index) =>
    normalizeSession(entry, index + 1, expected, sourceSha256, expectedBuild),
  );
  const byId = new Map();
  for (const entry of sessions) {
    if (!entry.sessionId) continue;
    const duplicates = byId.get(entry.sessionId) ?? [];
    duplicates.push(entry);
    byId.set(entry.sessionId, duplicates);
  }
  for (const duplicates of byId.values()) {
    if (duplicates.length < 2) continue;
    for (const entry of duplicates) {
      entry.status = "rejected";
      entry.issues.push("Session ID is duplicated.");
    }
  }
  const approved = new Set(options.approvedSessionIds ?? []);
  for (const id of approved) {
    const entries = byId.get(id);
    if (!entries) throw new Error(`Approved grind session is absent: ${id}`);
    if (entries.length !== 1 || entries[0].status !== "review-required")
      throw new Error(`Grind session cannot be approved: ${id}`);
  }
  const measurements = sessions
    .filter((entry) => entry.sessionId && approved.has(entry.sessionId))
    .map((entry) => entry.measurement);
  const evidence = campaignGrindEvidenceSchema.parse({
    schema: "campaign-grind-evidence.v1",
    sourceSha256,
    measurements,
  });
  const observed = new Set(
    sessions
      .filter((entry) => entry.status === "review-required")
      .map((entry) => entry.checkpointId),
  );
  return {
    report: {
      schema: "forever-grind-observer-review.v1",
      sourceSha256,
      sourceFile: options.sourceFile ? basename(options.sourceFile) : null,
      expectedBuild,
      expectedCheckpointCount: expected.size,
      observedReviewableCheckpointCount: observed.size,
      missingCheckpointIds: [...expected].filter((id) => !observed.has(id)).sort(),
      sessionCount: sessions.length,
      rejectedSessionCount: sessions.filter((entry) => entry.status === "rejected").length,
      approvedSessionCount: measurements.length,
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
      "Use --saved-variables=file --backlog=file --destination=directory [--expected-build=number] [--approve=session-id[,session-id]].",
    );
  const value = (name) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const sourceFile = value("saved-variables");
  const backlogFile = value("backlog");
  const destination = value("destination");
  if (!sourceFile || !backlogFile || !destination)
    throw new Error("SavedVariables, backlog, and destination are required.");
  const sourcePath = resolve(sourceFile);
  if ((await stat(sourcePath)).size > MAXIMUM_INPUT_BYTES)
    throw new Error("Grind SavedVariables input exceeds its size budget.");
  const [source, backlogRaw] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(resolve(backlogFile), "utf8"),
  ]);
  const reviewed = reviewGrindSavedVariables(source, JSON.parse(backlogRaw), {
    sourceFile: sourcePath,
    expectedBuild: value("expected-build") ? Number(value("expected-build")) : undefined,
    approvedSessionIds: (value("approve") ?? "").split(",").filter(Boolean),
  });
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const reportRaw = `${JSON.stringify(reviewed.report, null, 2)}\n`;
  const reportHash = createHash("sha256").update(reportRaw).digest("hex");
  const reportPath = join(root, `grind-review-${reportHash.slice(0, 16)}.json`);
  await writeImmutable(reportPath, reportRaw);
  let evidencePath = null;
  if (reviewed.evidence.measurements.length) {
    const evidenceRaw = `${JSON.stringify(reviewed.evidence, null, 2)}\n`;
    const evidenceHash = createHash("sha256").update(evidenceRaw).digest("hex");
    evidencePath = join(root, `grind-evidence-${evidenceHash.slice(0, 16)}.json`);
    await writeImmutable(evidencePath, evidenceRaw);
  }
  process.stdout.write(
    `${JSON.stringify({ report: reportPath, evidence: evidencePath, sessions: reviewed.report.sessionCount, rejected: reviewed.report.rejectedSessionCount, reviewableCheckpoints: reviewed.report.observedReviewableCheckpointCount, missingCheckpoints: reviewed.report.missingCheckpointIds.length, approved: reviewed.report.approvedSessionCount })}\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Grind review failed."}\n`);
    process.exitCode = 1;
  });
