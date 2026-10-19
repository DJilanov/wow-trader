#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const mediaDirectoryArgument = process.argv[2];
if (!mediaDirectoryArgument) {
  throw new Error(
    "Usage: node scripts/verify-item-media.mjs <media-build-directory> [catalog-manifest]",
  );
}
const catalogManifestArgument = process.argv[3];

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

const unavailableIds = new Set();
if (!Array.isArray(manifest.unavailableIcons)) {
  throw new Error("Item media manifest has no unavailable-icon report");
}
for (const entry of manifest.unavailableIcons) {
  if (
    !Number.isSafeInteger(entry.fileDataId) ||
    entry.fileDataId <= 0 ||
    typeof entry.reason !== "string" ||
    entry.reason.trim().length === 0 ||
    unavailableIds.has(entry.fileDataId) ||
    expectedFiles.has(`${entry.fileDataId}.png`)
  ) {
    throw new Error(`Invalid unavailable icon entry: ${String(entry.fileDataId)}`);
  }
  unavailableIds.add(entry.fileDataId);
}

let requiredIconCount;
if (catalogManifestArgument) {
  const catalogPath = resolve(catalogManifestArgument);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  for (const field of ["product", "clientVersion", "buildNumber"]) {
    if (manifest[field] !== catalog[field]) {
      throw new Error(`Item media ${field} does not match the target catalog`);
    }
  }
  const artifact = catalog.normalizedArtifacts?.items;
  if (!artifact || typeof artifact.path !== "string") {
    throw new Error("Catalog manifest has no normalized items artifact");
  }
  const contents = await readFile(resolve(dirname(catalogPath), artifact.path));
  if (createHash("sha256").update(contents).digest("hex") !== artifact.sha256) {
    throw new Error("Catalog items artifact checksum mismatch");
  }
  const requiredIds = new Set();
  for (const line of gunzipSync(contents).toString("utf8").split("\n").filter(Boolean)) {
    const { iconFileDataId } = JSON.parse(line);
    if (iconFileDataId === null) continue;
    if (!Number.isSafeInteger(iconFileDataId) || iconFileDataId <= 0) {
      throw new Error(`Invalid catalog icon ID: ${String(iconFileDataId)}`);
    }
    requiredIds.add(iconFileDataId);
  }
  const missingIds = [...requiredIds].filter(
    (id) => !expectedFiles.has(`${id}.png`) && !unavailableIds.has(id),
  );
  if (missingIds.length > 0) {
    throw new Error(
      `Item media is missing ${missingIds.length} catalog icons: ${missingIds.slice(0, 20).join(", ")}`,
    );
  }
  requiredIconCount = requiredIds.size;
}

process.stdout.write(
  `${JSON.stringify({
    buildNumber: manifest.buildNumber,
    clientVersion: manifest.clientVersion,
    iconCount: expectedFiles.size,
    unavailableIconCount: unavailableIds.size,
    requiredIconCount,
    product: manifest.product,
    verified: true,
  })}\n`,
);
