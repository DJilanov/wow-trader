import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const researchPrefix = "artifacts/forever-simulator/optimization/",
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function safeRelative(path) {
  assert(
    typeof path === "string" &&
      path &&
      !isAbsolute(path) &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      path.split("/").every((part) => part && part !== "." && part !== ".."),
    "Invalid derived source path",
  );
}

/** Copy an already frozen model's declared files, excluding every unlisted file.
 * @param {{root:string,sourceRoot:string,sourcePins:{path:string,byteSha256:string}[],output:string}} options
 * @returns {Promise<object>}
 */
export async function materializeDerivedModelWorkspace({ root, sourceRoot, sourcePins, output }) {
  const canonical = await realpath(resolve(root));
  safeRelative(sourceRoot);
  safeRelative(output);
  assert(sourceRoot.startsWith(researchPrefix) && output.startsWith(researchPrefix));
  assert(
    sourceRoot !== output &&
      !output.startsWith(sourceRoot + "/") &&
      !sourceRoot.startsWith(output + "/"),
  );
  assert(Array.isArray(sourcePins) && sourcePins.length > 0 && sourcePins.length <= 10000);
  const origin = join(canonical, sourceRoot),
    destination = join(canonical, output),
    info = await lstat(origin);
  assert(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(await realpath(origin), origin, "Derived source contains a symlink");
  let ancestor = dirname(destination);
  for (;;) {
    try {
      const info = await lstat(ancestor);
      assert(info.isDirectory() && !info.isSymbolicLink());
      assert.equal(await realpath(ancestor), ancestor, "Derived output contains a symlink");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      ancestor = dirname(ancestor);
    }
  }
  try {
    await lstat(destination);
    assert.fail("Derived workspace already exists");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const pending = [],
    seen = new Set();
  let total = 0;
  for (const pin of [...sourcePins].sort((a, b) => a.path.localeCompare(b.path, "en"))) {
    safeRelative(pin.path);
    assert(pin.path.startsWith(sourceRoot + "/"));
    assert(/^[a-f0-9]{64}$/.test(pin.byteSha256));
    const path = pin.path.slice(sourceRoot.length + 1);
    safeRelative(path);
    assert(!seen.has(path), "Duplicate derived source");
    seen.add(path);
    const source = join(canonical, pin.path),
      entry = await lstat(source);
    assert(entry.isFile() && !entry.isSymbolicLink());
    assert.equal(await realpath(source), source, "Derived source contains a symlink");
    assert(entry.size <= 128 * 1024 ** 2);
    const bytes = await readFile(source);
    assert.equal(bytes.length, entry.size);
    assert.equal(sha(bytes), pin.byteSha256, "Derived source changed: " + pin.path);
    total += bytes.length;
    assert(total <= 256 * 1024 ** 2);
    pending.push({ path, sourcePath: pin.path, byteSha256: pin.byteSha256, bytes });
  }
  assert(seen.has("go.mod") && seen.has("go.sum"), "Missing derived Go module identity");
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination);
  for (const row of pending) {
    const target = join(destination, row.path);
    assert(!relative(destination, target).startsWith(".." + sep));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, row.bytes, { flag: "wx", mode: 0o644 });
  }
  const files = pending.map(({ path, sourcePath, byteSha256, bytes }) => ({
    path,
    sourcePath,
    byteSha256,
    bytes: bytes.length,
  }));
  return {
    schema: "kfc-derived-frozen-model-workspace.v1",
    sourceRoot,
    output,
    files,
    fingerprint: sha(JSON.stringify(files)),
    unlistedSourceFilesCopied: false,
  };
}
