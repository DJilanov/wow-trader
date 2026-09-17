#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.argv[2] ? resolve(process.argv[2]) : null;
if (!root) fail("Usage: scripts/verify-forever-assets.mjs <asset-root>");

const manifest = await readManifest(root);
if (manifest.version !== "forever-asset-manifest.v1") {
  fail(`Unsupported manifest version: ${String(manifest.version)}`);
}
if (!isSha256(manifest.snapshotChecksum)) fail("Manifest snapshot checksum is invalid");
if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
  fail("Manifest contains no assets");
}
if (!Array.isArray(manifest.missing) || manifest.missing.length > 0) {
  fail(
    `Manifest reports ${Array.isArray(manifest.missing) ? manifest.missing.length : "invalid"} missing assets`,
  );
}

const expected = { backgrounds: new Set(), icons: new Set() };
const seen = new Set();
for (const entry of manifest.entries) {
  assertEntry(entry);
  const identity = `${entry.kind}:${entry.key}`;
  if (seen.has(identity)) fail(`Duplicate manifest entry: ${identity}`);
  seen.add(identity);
  const directory = entry.kind === "icon" ? "icons" : "backgrounds";
  const filename = `${entry.key}.jpg`;
  expected[directory].add(filename);
  const image = await readFile(join(root, directory, filename));
  if (image.byteLength !== entry.bytes) fail(`Byte count mismatch for ${identity}`);
  const checksum = createHash("sha256").update(image).digest("hex");
  if (checksum !== entry.sha256) fail(`Checksum mismatch for ${identity}`);
}

for (const directory of ["icons", "backgrounds"]) {
  const actual = (await readdir(join(root, directory))).filter((name) => name.endsWith(".jpg"));
  const unexpected = actual.filter((name) => !expected[directory].has(name));
  const absent = [...expected[directory]].filter((name) => !actual.includes(name));
  if (unexpected.length > 0) fail(`Unexpected ${directory}: ${unexpected.slice(0, 5).join(", ")}`);
  if (absent.length > 0) fail(`Missing ${directory}: ${absent.slice(0, 5).join(", ")}`);
}

process.stdout.write(
  `Verified ${manifest.entries.length} Forever assets for ${manifest.snapshotChecksum.slice(0, 12)}\n`,
);

async function readManifest(assetRoot) {
  try {
    return JSON.parse(await readFile(join(assetRoot, "manifest.json"), "utf8"));
  } catch (error) {
    fail(`Cannot read asset manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertEntry(entry) {
  if (!entry || typeof entry !== "object") fail("Manifest contains an invalid entry");
  if (entry.kind !== "icon" && entry.kind !== "background") {
    fail(`Invalid asset kind: ${String(entry.kind)}`);
  }
  const validKey =
    entry.kind === "icon" ? /^[a-z0-9_]+$/iu.test(entry.key) : /^\d+$/u.test(entry.key);
  if (!validKey) fail(`Invalid ${entry.kind} key: ${String(entry.key)}`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
    fail(`Invalid byte count for ${entry.kind}:${entry.key}`);
  }
  if (!isSha256(entry.sha256)) fail(`Invalid checksum for ${entry.kind}:${entry.key}`);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
