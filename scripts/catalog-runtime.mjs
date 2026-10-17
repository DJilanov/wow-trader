import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  readFile,
  readdir,
  readlink,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const manifestName = "catalog-runtime.json";

/** @typedef {{path: string, kind: "file", bytes: number, sha256: string} | {path: string, kind: "symlink", target: string}} CatalogRuntimeEntry */

/** @param {string} root @param {string} manifestFile @param {string[]} requiredFiles @returns {Promise<{fingerprint: string, entries: CatalogRuntimeEntry[]}>} */
async function inspectRuntime(root, manifestFile, requiredFiles) {
  const directory = await realpath(root);
  /** @type {CatalogRuntimeEntry[]} */
  const entries = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const name = relative(directory, path).split(sep).join("/");
      if (name === manifestFile) continue;
      if (name.split("/").some((part) => part.startsWith(".env"))) {
        throw new Error(`Environment files cannot be included in catalog tooling: ${name}`);
      }
      if (entry.isSymbolicLink()) {
        const target = await readlink(path);
        const resolved = await realpath(path);
        if (
          isAbsolute(target) ||
          (resolved !== directory && !resolved.startsWith(directory + sep))
        ) {
          throw new Error(`Catalog tooling symlink escapes its runtime: ${name}`);
        }
        entries.push({ path: name, kind: "symlink", target });
      } else if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile()) {
        const contents = await readFile(path);
        entries.push({
          path: name,
          kind: "file",
          bytes: contents.length,
          sha256: createHash("sha256").update(contents).digest("hex"),
        });
      } else {
        throw new Error(`Unsupported file in catalog tooling: ${name}`);
      }
    }
  }
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  for (const file of requiredFiles) {
    if (!(await lstat(join(directory, file))).isFile()) {
      throw new Error(`Tooling must contain a regular ${file}`);
    }
  }
  return {
    fingerprint: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    entries,
  };
}

/** @param {string} root @returns {Promise<number>} */
export async function removeDanglingDeploymentLinks(root) {
  const directory = await realpath(root);
  const temporaryRoot = await realpath(tmpdir());
  const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  if (
    !directory.startsWith(temporaryRoot + sep) ||
    basename(directory) !== "runtime" ||
    !basename(dirname(directory)).startsWith("wow-trader-catalog-runtime-") ||
    metadata.name !== "@wow-trader/catalog"
  ) {
    throw new Error("Dangling-link cleanup is restricted to a newly generated catalog runtime");
  }
  const modules = join(directory, "node_modules");
  const moduleStat = await lstat(modules);
  if (!moduleStat.isDirectory() || moduleStat.isSymbolicLink()) {
    throw new Error("Catalog runtime node_modules must be a physical directory");
  }
  let removed = 0;
  const pending = [modules];
  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isSymbolicLink()) {
        const target = await readlink(path);
        try {
          const destination = await realpath(path);
          if (
            isAbsolute(target) ||
            (destination !== directory && !destination.startsWith(directory + sep))
          ) {
            throw new Error(`Deployment link escapes its runtime: ${relative(directory, path)}`);
          }
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
            throw error;
          }
          // pnpm 9 deploy retains hoist links for dev packages excluded by --prod.
          await unlink(path);
          removed++;
        }
      }
    }
  }
  return removed;
}

/** @param {string} root @returns {Promise<string>} */
export async function writeCatalogRuntimeManifest(root) {
  return writeToolingManifest(root, manifestName, "catalog-runtime.v1", ["dist/cli.js"]);
}

/** @param {string} root @param {string} filename @param {string} schemaVersion @param {string[]} requiredFiles @returns {Promise<string>} */
async function writeToolingManifest(root, filename, schemaVersion, requiredFiles) {
  const inspected = await inspectRuntime(root, filename, requiredFiles);
  await writeFile(
    join(root, filename),
    JSON.stringify({ schemaVersion, ...inspected }, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" },
  );
  return inspected.fingerprint;
}

/** @param {string} root @param {string | undefined} expectedFingerprint @returns {Promise<string>} */
export async function verifyCatalogRuntime(root, expectedFingerprint) {
  return verifyToolingManifest(
    root,
    manifestName,
    "catalog-runtime.v1",
    ["dist/cli.js"],
    expectedFingerprint,
  );
}

/** @param {string} root @param {string} filename @param {string} schemaVersion @param {string[]} requiredFiles @param {string | undefined} expectedFingerprint @returns {Promise<string>} */
async function verifyToolingManifest(
  root,
  filename,
  schemaVersion,
  requiredFiles,
  expectedFingerprint,
) {
  const manifest = JSON.parse(await readFile(join(root, filename), "utf8"));
  const inspected = await inspectRuntime(root, filename, requiredFiles);
  if (
    manifest.schemaVersion !== schemaVersion ||
    manifest.fingerprint !== inspected.fingerprint ||
    JSON.stringify(manifest.entries) !== JSON.stringify(inspected.entries) ||
    (expectedFingerprint !== undefined && expectedFingerprint !== inspected.fingerprint)
  ) {
    throw new Error("Catalog runtime integrity verification failed");
  }
  return inspected.fingerprint;
}

const guardianFiles = [
  "bin/node",
  "extractor/WowTrader.Extractor",
  "scripts/catalog-guardian.mjs",
  "installation.json",
  "runtime/dist/cli.js",
];

/** @param {string} root @returns {Promise<string>} */
export async function writeGuardianReleaseManifest(root) {
  return writeToolingManifest(
    root,
    "guardian-release.json",
    "catalog-guardian-release.v1",
    guardianFiles,
  );
}

/** @param {string} root @param {string | undefined} expectedFingerprint @returns {Promise<string>} */
export async function verifyGuardianRelease(root, expectedFingerprint) {
  return verifyToolingManifest(
    root,
    "guardian-release.json",
    "catalog-guardian-release.v1",
    guardianFiles,
    expectedFingerprint,
  );
}

/** @param {string} repositoryRoot @param {string} runtimeDirectory @param {(command: string, args: string[]) => Promise<unknown>} run @returns {Promise<string>} */
export async function buildCatalogRuntime(repositoryRoot, runtimeDirectory, run) {
  await run("corepack", [
    "pnpm",
    "--filter",
    "@wow-trader/catalog...",
    "--recursive",
    "run",
    "build",
  ]);
  await run("corepack", [
    "pnpm",
    "--filter",
    "@wow-trader/catalog",
    "deploy",
    "--prod",
    "--no-optional",
    runtimeDirectory,
  ]);
  await removeDanglingDeploymentLinks(runtimeDirectory);
  await copyFile(
    join(repositoryRoot, "scripts/catalog-runtime.mjs"),
    join(runtimeDirectory, "verify-runtime.mjs"),
  );
  await copyFile(
    join(repositoryRoot, "scripts/verify-item-media.mjs"),
    join(runtimeDirectory, "verify-item-media.mjs"),
  );
  const fingerprint = await writeCatalogRuntimeManifest(runtimeDirectory);
  await verifyCatalogRuntime(runtimeDirectory, fingerprint);
  return fingerprint;
}

/** @param {Record<string, unknown>} previous @param {Record<string, unknown>} update @returns {Record<string, unknown>} */
export function mergeGuardianStatus(previous, update) {
  const changedSnapshot =
    update.state === "preparing" ||
    (update.buildNumber !== undefined && update.buildNumber !== previous.buildNumber) ||
    (update.hotfixHash !== undefined && update.hotfixHash !== previous.hotfixHash) ||
    (update.product !== undefined && update.product !== previous.product);
  const retained = changedSnapshot
    ? { lastReviewNotifiedKey: previous.lastReviewNotifiedKey }
    : previous;
  return { schemaVersion: 1, ...retained, ...update };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = process.argv[2] ?? dirname(import.meta.filename);
  await verifyCatalogRuntime(root, process.argv[3]).then(
    (fingerprint) => process.stdout.write(`Verified catalog runtime ${fingerprint}\n`),
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
