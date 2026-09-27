import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path, { relative } from "node:path";
import process from "node:process";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";

const manifestArgument = process.argv[2];
if (!manifestArgument) {
  throw new Error("Usage: node scripts/generate-forever-addon-seeds.mjs <world-manifest.json>");
}

const manifestPath = path.resolve(manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (
  manifest.schemaVersion !== "world-snapshot-manifest.v1" ||
  manifest.product !== "wow_classic_beta" ||
  !Number.isSafeInteger(manifest.buildNumber) ||
  manifest.buildNumber <= 0
) {
  throw new Error("Expected a wow_classic_beta world-snapshot-manifest.v1 manifest");
}

const snapshotDirectory = path.dirname(manifestPath);
const quests = await readNdjsonArtifact(snapshotDirectory, manifest, "quests");
const bosses = await readNdjsonArtifact(snapshotDirectory, manifest, "bosses");
const questIds = quests
  .map((row) => row.questId)
  .filter((questId) => Number.isSafeInteger(questId) && questId > 0)
  .sort((left, right) => left - right);
const bossIdentities = bosses
  .map((row) => ({ creatureID: row.creatureId, name: row.name }))
  .filter(
    (row) =>
      Number.isSafeInteger(row.creatureID) &&
      row.creatureID > 0 &&
      typeof row.name === "string" &&
      row.name.length > 0,
  )
  .sort((left, right) => left.creatureID - right.creatureID);

assertUnique(questIds, "quest ID");
assertUnique(
  bossIdentities.map((row) => row.creatureID),
  "boss creature ID",
);
if (questIds.length === 0 || bossIdentities.length === 0) {
  throw new Error("Refusing to generate empty Forever addon catalogs");
}

const addonDirectory = path.resolve("apps/addon/WowTraderCollector");
await mkdir(addonDirectory, { recursive: true });
await Promise.all([
  writeFile(
    path.join(addonDirectory, "ForeverQuestCatalog.lua"),
    renderQuestCatalog(manifest.buildNumber, questIds),
    "utf8",
  ),
  writeFile(
    path.join(addonDirectory, "ForeverBossCatalog.lua"),
    renderBossCatalog(manifest.buildNumber, bossIdentities),
    "utf8",
  ),
]);

process.stdout.write(
  `Generated ${questIds.length} quest IDs and ${bossIdentities.length} boss identities for build ${manifest.buildNumber}.\n`,
);

async function readNdjsonArtifact(snapshotDirectory, sourceManifest, artifactName) {
  const artifact = sourceManifest.normalizedArtifacts?.[artifactName];
  if (!artifact || typeof artifact.path !== "string") {
    throw new Error(`Manifest does not contain normalized artifact ${artifactName}`);
  }
  const artifactPath = path.resolve(snapshotDirectory, artifact.path);
  const traversal = relative(snapshotDirectory, artifactPath);
  if (traversal.startsWith("..") || path.isAbsolute(traversal)) {
    throw new Error(`Artifact path escapes the snapshot directory: ${artifact.path}`);
  }
  if (typeof artifact.sha256 !== "string") {
    throw new Error(`Manifest artifact ${artifactName} has no SHA-256`);
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
  const actualSha256 = hash.digest("hex");
  if (actualSha256 !== artifact.sha256) {
    throw new Error(`Checksum mismatch for normalized artifact ${artifactName}`);
  }
  const rows = [];
  const input = createReadStream(artifactPath).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of lines) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  if (rows.length !== artifact.recordCount) {
    throw new Error(
      `${artifactName} contains ${rows.length} rows but the manifest declares ${artifact.recordCount}`,
    );
  }
  return rows;
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in snapshot`);
}

function renderQuestCatalog(buildNumber, questIds) {
  const lines = [
    `-- Generated from the audited world snapshot for wow_classic_beta build ${buildNumber}.`,
    "-- Structural presence is not proof that a quest is live, visible, or obtainable.",
    `WOW_TRADER_FOREVER_QUEST_CATALOG_BUILD = ${buildNumber}`,
    "WOW_TRADER_FOREVER_QUEST_CATALOG = {",
  ];
  for (let index = 0; index < questIds.length; index += 12) {
    lines.push(`  ${questIds.slice(index, index + 12).join(", ")},`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function renderBossCatalog(buildNumber, bosses) {
  const lines = [
    `-- Generated from criteria-backed identities in wow_classic_beta build ${buildNumber}.`,
    "-- These are resolver inputs, not claims that each identity is live or correctly boss-labeled.",
    `WOW_TRADER_FOREVER_BOSS_CATALOG_BUILD = ${buildNumber}`,
    "WOW_TRADER_FOREVER_BOSS_CATALOG = {",
  ];
  for (const boss of bosses) {
    lines.push(`  { creatureID = ${boss.creatureID}, name = ${luaString(boss.name)} },`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

function luaString(value) {
  let escaped = "";
  for (const character of value) {
    if (character === "\\") escaped += "\\\\";
    else if (character === '"') escaped += '\\"';
    else if (character === "\n") escaped += "\\n";
    else if (character === "\r") escaped += "\\r";
    else if (character === "\t") escaped += "\\t";
    else {
      const codePoint = character.codePointAt(0);
      escaped +=
        codePoint !== undefined && (codePoint < 32 || codePoint === 127)
          ? `\\${codePoint.toString().padStart(3, "0")}`
          : character;
    }
  }
  return `"${escaped}"`;
}
