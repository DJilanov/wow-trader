import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const execute = promisify(execFile);
const verifier = join(import.meta.dirname, "verify-item-media.mjs");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=",
  "base64",
);

/** @param {import('node:test').TestContext} t @param {number[]} requiredIds */
async function fixture(t, requiredIds = [7_731_377]) {
  const root = await mkdtemp(join(tmpdir(), "item-media-coverage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mediaDirectory = join(root, "media");
  await mkdir(join(mediaDirectory, "icons"), { recursive: true });
  const identity = {
    product: "wow_classic_beta",
    clientVersion: "1.60.1.70450",
    buildNumber: 70450,
  };
  await writeFile(join(mediaDirectory, "icons/7731377.png"), png);
  await writeFile(
    join(mediaDirectory, "manifest.json"),
    JSON.stringify({
      schemaVersion: "item-icon-manifest.v1",
      ...identity,
      icons: [{ fileDataId: 7_731_377, sha256: sha256(png), width: 1, height: 1 }],
      unavailableIcons: [],
    }),
  );
  const items = gzipSync(
    [...requiredIds.map((id) => ({ iconFileDataId: id })), { iconFileDataId: null }]
      .map((item) => JSON.stringify(item))
      .join("\n") + "\n",
  );
  await writeFile(join(root, "items.ndjson.gz"), items);
  const catalogPath = join(root, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({
      ...identity,
      normalizedArtifacts: { items: { path: "items.ndjson.gz", sha256: sha256(items) } },
    }),
  );
  return { root, mediaDirectory, catalogPath };
}

/** @param {Buffer} contents @returns {string} */
function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

test("verifies complete catalog coverage and deduplicates shared icon IDs", async (t) => {
  const { mediaDirectory, catalogPath } = await fixture(t, [7_731_377, 7_731_377]);
  const { stdout } = await execute(process.execPath, [verifier, mediaDirectory, catalogPath]);
  assert.deepEqual(JSON.parse(stdout), {
    buildNumber: 70_450,
    clientVersion: "1.60.1.70450",
    iconCount: 1,
    unavailableIconCount: 0,
    requiredIconCount: 1,
    product: "wow_classic_beta",
    verified: true,
  });
});

test("rejects a checksum-valid older media set missing newly resolved catalog icons", async (t) => {
  const { mediaDirectory, catalogPath } = await fixture(t, [7_731_377, 7_731_372]);
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /missing 1 catalog icons: 7731372/,
  );
});

test("reports genuinely unavailable client assets separately from extracted PNGs", async (t) => {
  const { mediaDirectory, catalogPath } = await fixture(t, [7_731_377, 7_731_372]);
  const manifestPath = join(mediaDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.unavailableIcons.push({ fileDataId: 7_731_372, reason: "Unsupported BLP" });
  await writeFile(manifestPath, JSON.stringify(manifest));
  const { stdout } = await execute(process.execPath, [verifier, mediaDirectory, catalogPath]);
  const report = JSON.parse(stdout);
  assert.equal(report.iconCount, 1);
  assert.equal(report.requiredIconCount, 2);
  assert.equal(report.unavailableIconCount, 1);
});

test("unavailable assets require a reason and cannot also be listed as extracted", async (t) => {
  const { mediaDirectory, catalogPath } = await fixture(t, [7_731_377, 7_731_372]);
  const manifestPath = join(mediaDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.unavailableIcons = [{ fileDataId: 7_731_372, reason: "" }];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /Invalid unavailable icon entry/,
  );
  manifest.unavailableIcons = [{ fileDataId: 7_731_377, reason: "Unsupported BLP" }];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /Invalid unavailable icon entry/,
  );
});

test("rejects another product or build even when file IDs match", async (t) => {
  const { mediaDirectory, catalogPath } = await fixture(t);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  await writeFile(catalogPath, JSON.stringify({ ...catalog, product: "wow_anniversary" }));
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /product does not match/,
  );
  await writeFile(catalogPath, JSON.stringify({ ...catalog, buildNumber: 70_338 }));
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /buildNumber does not match/,
  );
});

test("rejects tampered catalog evidence and missing PNG bytes", async (t) => {
  const { root, mediaDirectory, catalogPath } = await fixture(t);
  const itemsPath = join(root, "items.ndjson.gz");
  const items = await readFile(itemsPath);
  await writeFile(itemsPath, "tampered");
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /items artifact checksum mismatch/,
  );
  await writeFile(itemsPath, items);
  await rm(join(mediaDirectory, "icons/7731377.png"));
  await assert.rejects(
    execute(process.execPath, [verifier, mediaDirectory, catalogPath]),
    /ENOENT/,
  );
});

test("retains standalone media verification for existing operational callers", async (t) => {
  const { mediaDirectory } = await fixture(t);
  const { stdout } = await execute(process.execPath, [verifier, mediaDirectory]);
  assert.equal(JSON.parse(stdout).verified, true);
});
