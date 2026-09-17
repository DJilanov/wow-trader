#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const mediaDirectoryArgument = process.argv[2];
if (!mediaDirectoryArgument) {
  throw new Error("Usage: node scripts/verify-item-media.mjs <media-build-directory>");
}

const mediaDirectory = resolve(mediaDirectoryArgument);
const manifestPath = resolve(mediaDirectory, "manifest.json");
const iconDirectory = resolve(mediaDirectory, "icons");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.schemaVersion !== "item-icon-manifest.v1" || !Array.isArray(manifest.icons)) {
  throw new Error(`Unsupported item media manifest: ${manifestPath}`);
}

const expectedFiles = new Set();
for (const entry of manifest.icons) {
  if (
    !Number.isSafeInteger(entry.fileDataId) ||
    entry.fileDataId <= 0 ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`Invalid icon manifest entry for file data ID ${String(entry.fileDataId)}`);
  }

  const fileName = `${entry.fileDataId}.png`;
  if (expectedFiles.has(fileName)) throw new Error(`Duplicate icon manifest entry: ${fileName}`);
  expectedFiles.add(fileName);

  const contents = await readFile(resolve(iconDirectory, fileName));
  const checksum = createHash("sha256").update(contents).digest("hex");
  if (checksum !== entry.sha256) throw new Error(`Checksum mismatch for ${fileName}`);
}

const actualFiles = (await readdir(iconDirectory)).filter((fileName) => fileName.endsWith(".png"));
const unexpectedFiles = actualFiles.filter((fileName) => !expectedFiles.has(fileName));
if (unexpectedFiles.length > 0) {
  throw new Error(`Unexpected icon files: ${unexpectedFiles.slice(0, 10).join(", ")}`);
}
if (actualFiles.length !== expectedFiles.size) {
  throw new Error(`Expected ${expectedFiles.size} icons but found ${actualFiles.length}`);
}

process.stdout.write(
  `${JSON.stringify({
    buildNumber: manifest.buildNumber,
    clientVersion: manifest.clientVersion,
    iconCount: expectedFiles.size,
    product: manifest.product,
    verified: true,
  })}\n`,
);
