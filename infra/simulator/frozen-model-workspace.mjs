import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const upstreamPrefix = ".cache/forever-sim-upstream/";
const outputPrefix = "artifacts/forever-simulator/optimization/";
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** @typedef {{path: string, byteSha256: string}} SourcePin */
/** @typedef {{path: string, sourcePath: string, sha256: string, bytes: number, kind: 'source'|'overlay'}} WorkspaceFile */
/** @typedef {{schema: string, fingerprint: string, files: WorkspaceFile[], unlistedMutableFilesUsed: false}} FrozenWorkspace */

/** @param {string} value @returns {void} */
function assertRelativePath(value) {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      !isAbsolute(value) &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      value.split("/").every((part) => part && part !== "." && part !== ".."),
    "Invalid frozen source path",
  );
}

/** @param {string} root @param {string} path @returns {Promise<void>} */
async function assertOutputPath(root, path) {
  const offset = relative(root, path).split(sep).join("/");
  assert(offset.startsWith(outputPrefix), "Frozen workspace must stay in research storage");
  assertRelativePath(offset);
  let ancestor = path;
  for (;;) {
    try {
      const entry = await lstat(ancestor);
      assert(!entry.isSymbolicLink(), "Workspace parent contains a symlink");
      assert(entry.isDirectory(), "Workspace parent is not a directory");
      assert.equal(await realpath(ancestor), ancestor, "Workspace parent contains a symlink");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      ancestor = dirname(ancestor);
    }
  }
  try {
    await lstat(path);
    assert.fail("Frozen workspace already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

/**
 * Materialize only the parent's pinned files and effective Go overlay. Unlisted
 * files in the shared checkout never enter the new compiler workspace.
 * @param {{root: string, output: string, sourcePins: SourcePin[], generatedInputs?: SourcePin[], overlay: {Replace: Record<string, string>}}} options
 * @returns {Promise<FrozenWorkspace>}
 */
export async function materializeFrozenModelWorkspace({
  root,
  output,
  sourcePins,
  generatedInputs = [],
  overlay,
}) {
  const requestedRoot = resolve(root);
  const canonicalRoot = await realpath(requestedRoot);
  // macOS may expose the same temporary root under /var and /private/var.
  const canonicalPath = (value) => {
    const offset = relative(requestedRoot, value);
    return offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset)
      ? join(canonicalRoot, offset)
      : value;
  };
  const destination = isAbsolute(output)
    ? canonicalPath(resolve(output))
    : resolve(canonicalRoot, output);
  await assertOutputPath(canonicalRoot, destination);
  assert(Array.isArray(sourcePins) && sourcePins.length > 0 && sourcePins.length <= 10000);
  assert(Array.isArray(generatedInputs) && generatedInputs.length <= 10000);
  assert(overlay && Object.keys(overlay).length === 1 && Object.hasOwn(overlay, "Replace"));
  assert(overlay.Replace && typeof overlay.Replace === "object" && !Array.isArray(overlay.Replace));
  const pins = new Map();
  for (const pin of [...sourcePins, ...generatedInputs]) {
    assertRelativePath(pin.path);
    assert(/^[a-f0-9]{64}$/.test(pin.byteSha256), "Missing source checksum");
    assert(!pins.has(pin.path) || pins.get(pin.path) === pin.byteSha256, "Conflicting source pins");
    pins.set(pin.path, pin.byteSha256);
  }
  const assignments = new Map();
  for (const pin of sourcePins.filter((row) => row.path.startsWith(upstreamPrefix))) {
    const path = pin.path.slice(upstreamPrefix.length);
    assertRelativePath(path);
    assignments.set(path, { sourcePath: pin.path, kind: "source" });
  }
  assert(assignments.has("go.mod") && assignments.has("go.sum"), "Missing Go module identity");
  const upstream = join(canonicalRoot, upstreamPrefix);
  for (const [target, replacement] of Object.entries(overlay.Replace)) {
    assert(isAbsolute(target) && resolve(target) === target, "Invalid Go overlay destination");
    const path = relative(upstream, canonicalPath(target)).split(sep).join("/");
    assertRelativePath(path);
    assert(
      isAbsolute(replacement) && resolve(replacement) === replacement,
      "Invalid overlay source",
    );
    const sourcePath = relative(canonicalRoot, canonicalPath(replacement)).split(sep).join("/");
    assertRelativePath(sourcePath);
    assert(pins.has(sourcePath), "Overlay replacement has no authenticated source pin");
    assignments.set(path, { sourcePath, kind: "overlay" });
  }
  assert(assignments.size <= 10000);
  const pending = [];
  let totalBytes = 0;
  for (const [path, source] of [...assignments].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const target = join(canonicalRoot, source.sourcePath);
    const entry = await lstat(target);
    assert(entry.isFile() && !entry.isSymbolicLink(), "Frozen source must be a regular file");
    assert.equal(await realpath(target), target, "Frozen source contains a symlink");
    assert(entry.size <= 128 * 1024 ** 2, "Frozen source exceeds its file budget");
    const bytes = await readFile(target);
    assert.equal(bytes.length, entry.size);
    const sha256 = checksum(bytes);
    assert.equal(
      sha256,
      pins.get(source.sourcePath),
      "Frozen source changed: " + source.sourcePath,
    );
    totalBytes += bytes.length;
    assert(totalBytes <= 256 * 1024 ** 2, "Frozen workspace exceeds its read budget");
    pending.push({ record: { path, ...source, sha256, bytes: bytes.length }, bytes });
  }
  // Check every input before reserving the new output. Existing work is never replaced.
  await mkdir(dirname(destination), { recursive: true });
  await assertOutputPath(canonicalRoot, destination);
  await mkdir(destination);
  for (const { record, bytes } of pending) {
    const target = join(destination, record.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o644 });
  }
  const files = pending.map(({ record }) => record);
  const report = {
    schema: "kfc-frozen-go-workspace.v1",
    fingerprint: checksum(JSON.stringify(files)),
    files,
    unlistedMutableFilesUsed: false,
  };
  await writeFile(
    join(destination, ".kfc-frozen-workspace.json"),
    JSON.stringify(report, null, 2) + "\n",
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  return report;
}
