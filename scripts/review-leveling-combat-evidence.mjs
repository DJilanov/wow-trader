import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

import { killXpEvidenceSchema, parseLuaDataLiteral } from "../packages/leveling/dist/index.js";

const MAXIMUM_SAVED_VARIABLES_BYTES = 8_000_000;

function table(value) {
  if (!(value instanceof Map)) throw new Error("Expected a SavedVariables table.");
  return value;
}

function array(value) {
  const source = table(value);
  const result = [];
  for (let index = 1; index <= source.size; index++) {
    if (!source.has(index)) throw new Error("SavedVariables array contains a gap.");
    result.push(source.get(index));
  }
  if ([...source.keys()].some((key) => typeof key !== "number" || key < 1 || key > source.size))
    throw new Error("SavedVariables array contains a keyed value.");
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

function payout(message) {
  const match = /\b(?:gain|gained)\s+([\d,.' ]+)\s+experience\b/i.exec(message);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, "");
  return integer(Number(digits), 0, 1_000_000);
}

function sample(raw, index) {
  const value = table(raw);
  const message = string(value.get("message"));
  const level = integer(value.get("level"), 1, 60);
  const build = integer(value.get("build"), 1, 10_000_000);
  const capturedAt = integer(value.get("capturedAt"), 1, 10_000_000_000);
  const partySize = integer(value.get("partySize"), 1, 5);
  const npcId = integer(value.get("candidateNpcId"), 1, 10_000_000);
  const mobLevel = integer(value.get("candidateMobLevel"), 1, 100);
  const attribution = string(value.get("attribution"), 60);
  const instanceType = string(value.get("instanceType"), 60);
  const sessionId = string(value.get("sessionId"), 200);
  const restedAtCapture = integer(value.get("restedAtCapture"), 0, 1_000_000_000);
  let partyLevels = null;
  try {
    partyLevels = array(value.get("partyLevels")).map((entry) => integer(entry, 1, 60));
  } catch {
    partyLevels = null;
  }
  const issues = [];
  if (!message || !level || !build || !capturedAt || !partySize || !sessionId)
    issues.push("Required public context is missing or invalid.");
  if (attribution !== "target-name-candidate" || !npcId || !mobLevel)
    issues.push("A recent target-name NPC candidate is unavailable.");
  if (!partyLevels || partyLevels.length !== partySize || partyLevels.some((entry) => !entry))
    issues.push("The complete party level vector is unavailable.");
  else if (partyLevels.some((entry) => entry !== level))
    issues.push("Only controlled equal-level parties can calibrate this model.");
  if (restedAtCapture !== 0)
    issues.push("The character had rested XP or its rested state was unavailable.");
  const environment =
    instanceType === "party" ? "dungeon" : instanceType === "none" ? "outdoor" : null;
  if (!environment)
    issues.push("The sample is not from an outdoor or five-player dungeon context.");
  const xp = message ? payout(message) : null;
  if (xp === null) issues.push("The localized combat message does not expose a numeric XP payout.");
  return {
    index,
    message,
    level,
    build,
    capturedAt,
    partySize,
    partyLevels,
    npcId,
    mobLevel,
    environment,
    sessionId,
    restedAtCapture,
    xp,
    issues,
  };
}

export function reviewCombatSavedVariables(source, options = {}) {
  if (typeof source !== "string" || Buffer.byteLength(source) > MAXIMUM_SAVED_VARIABLES_BYTES)
    throw new Error("Combat SavedVariables input exceeds its size budget.");
  const root = table(parseLuaDataLiteral(rootLiteral(source)));
  const schemaVersion = integer(root.get("schemaVersion"), 1, 100);
  if (schemaVersion !== 2)
    throw new Error("Run the current KFCForeverGuides observer before reviewing combat evidence.");
  const rawSamples = array(root.get("combat"));
  if (rawSamples.length > 2000) throw new Error("Combat sample count exceeds the observer limit.");
  const samples = rawSamples.map((entry, index) => sample(entry, index + 1));
  const grouped = new Map();
  for (const entry of samples.filter((candidate) => candidate.issues.length === 0)) {
    const key = [
      entry.build,
      entry.npcId,
      entry.level,
      entry.mobLevel,
      entry.partySize,
      entry.environment,
    ].join(":");
    const values = grouped.get(key) ?? [];
    values.push(entry);
    grouped.set(key, values);
  }
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const groups = [...grouped]
    .map(([key, entries]) => {
      const payouts = [...new Set(entries.map((entry) => entry.xp))];
      const sessions = [...new Set(entries.map((entry) => entry.sessionId))];
      const status =
        payouts.length !== 1
          ? "conflicting-payouts"
          : entries.length < 3
            ? "insufficient-samples"
            : "review-required";
      return {
        key,
        status,
        sampleCount: entries.length,
        payouts,
        sessions,
        sampleIndices: entries.map((entry) => entry.index),
        suggestedEvidence:
          status === "review-required"
            ? {
                npcId: entries[0].npcId,
                build: entries[0].build,
                playerLevel: entries[0].level,
                mobLevel: entries[0].mobLevel,
                partySize: entries[0].partySize,
                environment: entries[0].environment,
                unrestedXpPerPlayer: payouts[0],
                partyLevels: entries[0].partyLevels,
                sampleCount: entries.length,
                source: `KFC observer ${sourceSha256.slice(0, 16)}; sessions ${sessions.join(", ")}; samples ${entries.map((entry) => entry.index).join(",")}`,
              }
            : null,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
  const approved = new Set(options.approvedKeys ?? []);
  const knownKeys = new Set(groups.map((group) => group.key));
  for (const key of approved)
    if (!knownKeys.has(key)) throw new Error(`Approved combat context is absent: ${key}`);
  const evidence = groups
    .filter((group) => approved.has(group.key))
    .map((group) => {
      if (group.status !== "review-required" || !group.suggestedEvidence)
        throw new Error(`Combat context cannot be approved: ${group.key}`);
      return killXpEvidenceSchema.parse({
        ...group.suggestedEvidence,
        contextVerified: true,
      });
    });
  return {
    report: {
      schema: "forever-combat-observer-review.v1",
      sourceSha256,
      sourceFile: options.sourceFile ? basename(options.sourceFile) : null,
      sampleCount: samples.length,
      rejectedSampleCount: samples.filter((entry) => entry.issues.length > 0).length,
      approvedContextCount: evidence.length,
      groups,
      rejectedSamples: samples
        .filter((entry) => entry.issues.length > 0)
        .map((entry) => ({ index: entry.index, issues: entry.issues })),
    },
    evidence,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((argument) => !/^--(?:saved-variables|destination|approve)=.+/.test(argument)))
    throw new Error(
      "Use --saved-variables=file --destination=directory [--approve=context-key[,context-key]].",
    );
  const value = (name) =>
    args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
  const sourceFile = value("saved-variables");
  const destination = value("destination");
  if (!sourceFile || !destination) throw new Error("SavedVariables and destination are required.");
  const path = resolve(sourceFile);
  if ((await stat(path)).size > MAXIMUM_SAVED_VARIABLES_BYTES)
    throw new Error("Combat SavedVariables input exceeds its size budget.");
  const source = await readFile(path, "utf8");
  const reviewed = reviewCombatSavedVariables(source, {
    sourceFile: path,
    approvedKeys: (value("approve") ?? "").split(",").filter(Boolean),
  });
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const reportRaw = `${JSON.stringify(reviewed.report, null, 2)}\n`;
  const reportHash = createHash("sha256").update(reportRaw).digest("hex");
  const reportPath = join(root, `combat-review-${reportHash.slice(0, 16)}.json`);
  await writeFile(reportPath, reportRaw, { flag: "wx", mode: 0o600 });
  let evidencePath = null;
  if (reviewed.evidence.length) {
    const evidenceRaw = `${JSON.stringify(reviewed.evidence, null, 2)}\n`;
    const evidenceHash = createHash("sha256").update(evidenceRaw).digest("hex");
    evidencePath = join(root, `kill-xp-evidence-${evidenceHash.slice(0, 16)}.json`);
    await writeFile(evidencePath, evidenceRaw, { flag: "wx", mode: 0o600 });
  }
  process.stdout.write(
    `${JSON.stringify({ report: reportPath, evidence: evidencePath, samples: reviewed.report.sampleCount, rejected: reviewed.report.rejectedSampleCount, reviewGroups: reviewed.report.groups.length, approved: reviewed.evidence.length })}\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Combat review failed."}\n`);
    process.exitCode = 1;
  });
