import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";
import { planSimulatorCatalogUpdate } from "../infra/simulator/catalog-update-plan.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPrefix = "artifacts/forever-simulator/optimization/catalog-update-plans";

/** Read only bounded regular JSON files inside the supplied repository.
 * @param {string} root @param {string} path @param {string|undefined} expected
 * @returns {Promise<{value:object,path:string,sha256:string}>}
 */
async function readJson(root, path, expected) {
  assert(
    typeof path === "string" && path.endsWith(".json") && !path.includes("\0"),
    "Expected a JSON source path",
  );
  const target = resolve(root, path),
    info = await lstat(target);
  assert(
    info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 32 * 1024 ** 2,
    "Invalid or oversized JSON source",
  );
  const canonical = await realpath(target);
  assert(
    canonical.startsWith(root + sep) && canonical === target,
    "JSON source escapes its repository or uses a symlink",
  );
  const bytes = await readFile(target),
    digest = sha(bytes);
  if (expected !== undefined) {
    assert(/^[a-f0-9]{64}$/.test(expected), "Invalid expected source checksum");
    assert.equal(digest, expected, "Source checksum differs: " + path);
  }
  const value = JSON.parse(bytes.toString("utf8"));
  assert(value && typeof value === "object" && !Array.isArray(value), "Expected a JSON object");
  return { value, path: relative(root, target).split(sep).join("/"), sha256: digest };
}

/** Produce an immutable, source-bound plan without starting simulations or selecting releases.
 * @param {{root:string,inputPath:string}} options
 * @returns {Promise<{output:string,sha256:string,plan:object}>}
 */
export async function prepareSimulatorCatalogUpdatePlan({ root, inputPath }) {
  const canonicalRoot = await realpath(root),
    manifest = await readJson(canonicalRoot, inputPath);
  assert.equal(manifest.value.schema, "kfc-simulator-catalog-update-input.v1");
  const sources = [],
    snapshots = {};
  for (const label of ["before", "after"]) {
    const source = manifest.value[label];
    assert(source && typeof source === "object");
    for (const ref of [source.catalog, source.inspection])
      assert(
        ref && typeof ref.path === "string" && /^[a-f0-9]{64}$/.test(ref.sha256),
        "Catalog and inspection sources require exact checksums",
      );
    const catalog = await readJson(canonicalRoot, source.catalog.path, source.catalog.sha256);
    const inspection = await readJson(
      canonicalRoot,
      source.inspection.path,
      source.inspection.sha256,
    );
    sources.push(
      { label: label + "-catalog", path: catalog.path, sha256: catalog.sha256 },
      { label: label + "-inspection", path: inspection.path, sha256: inspection.sha256 },
    );
    snapshots[label] = {
      catalog: catalog.value,
      inspection: inspection.value,
      incumbent: source.incumbent,
      backend: source.backend,
      mechanicsSha256: source.mechanicsSha256,
      requestContextSha256: source.requestContextSha256,
      eligibilitySha256: source.eligibilitySha256,
    };
  }
  const plan = planSimulatorCatalogUpdate({
    profile: manifest.value.profile,
    before: snapshots.before,
    after: snapshots.after,
  });
  const toolSourcePins = [];
  for (const path of [
    "scripts/plan-simulator-catalog-update.mjs",
    "infra/simulator/catalog-update-plan.mjs",
    "infra/simulator/simulation-fingerprint.mjs",
    "infra/simulator/prebis-pool.mjs",
    "infra/simulator/equipment-ownership.mjs",
    "infra/simulator/classic-acquisition.mjs",
  ]) {
    toolSourcePins.push({ path, sha256: sha(await readFile(join(toolRoot, path))) });
  }
  const body = {
    schema: "kfc-simulator-catalog-update-preparation.v1",
    input: { path: manifest.path, sha256: manifest.sha256 },
    sources,
    toolSourcePins,
    plan,
  };
  const identity = sha(JSON.stringify(body)),
    report = { ...body, identity },
    bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
  let directory = canonicalRoot;
  for (const part of outputPrefix.split("/")) {
    directory = join(directory, part);
    try {
      await mkdir(directory);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const info = await lstat(directory);
    assert(
      info.isDirectory() && !info.isSymbolicLink(),
      "Plan output uses a symlink or non-directory",
    );
    assert.equal(await realpath(directory), directory, "Plan output uses a symlink");
  }
  const output = join(directory, identity + ".json");
  // Recheck both the manifest and its sources before persisting a plan.
  for (const ref of [{ path: manifest.path, sha256: manifest.sha256 }, ...sources])
    await readJson(canonicalRoot, ref.path, ref.sha256);
  for (const ref of toolSourcePins)
    assert.equal(
      sha(await readFile(join(toolRoot, ref.path))),
      ref.sha256,
      "Planner source changed",
    );
  const temporary = join(directory, ".pending-" + randomUUID());
  const handle = await open(temporary, "wx", 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    try {
      // A same-directory hard link publishes complete bytes without replacing
      // an existing immutable plan, including when two callers finish together.
      await link(temporary, output);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const info = await lstat(output);
      assert(info.isFile() && !info.isSymbolicLink(), "Existing plan is not a regular file");
      assert.deepEqual(
        await readFile(output),
        bytes,
        "Refusing to replace different immutable plan bytes",
      );
    }
  } finally {
    try {
      await handle.close();
    } finally {
      await unlink(temporary);
    }
  }
  return { output, sha256: sha(bytes), plan };
}

/** @returns {Promise<void>} */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "pnpm simulator:prebis:plan-update --input=<source-bound-input.json>\nWrites an immutable catalog/gear impact plan. Starts no simulations and does not change selections or production.",
    );
    return;
  }
  assert(
    args.length === 1 && args[0].startsWith("--input="),
    "Expected exactly --input=<source-bound-input.json>",
  );
  const inputPath = args[0].slice("--input=".length);
  assert(
    inputPath && !isAbsolute(inputPath) && !inputPath.split(/[\\/]/).includes(".."),
    "Use a repository-relative input path",
  );
  const result = await prepareSimulatorCatalogUpdatePlan({ root: toolRoot, inputPath });
  console.log(
    JSON.stringify({
      output: relative(toolRoot, result.output).split(sep).join("/"),
      sha256: result.sha256,
      mode: result.plan.mode,
      affectedSlots: result.plan.slots,
      groups: result.plan.groups.length,
      nativeJobs: 0,
      browserJobs: 0,
      publicationAllowed: false,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
