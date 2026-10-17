import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import process from "node:process";
import { URL } from "node:url";
import { pruneBuildCache } from "./build-cache.mjs";

/** @param {import('node:test').TestContext} t @returns {Promise<string>} */
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "turbo-cleanup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".turbo/cache"), { recursive: true });
  return root;
}

/** @param {string} root @param {string} hash @param {number} time @returns {Promise<void>} */
async function archive(root, hash, time) {
  for (const suffix of [".tar.zst", "-meta.json", "-manifest.json"]) {
    const path = join(root, ".turbo/cache", hash + suffix);
    await writeFile(path, "1234");
    await utimes(path, time / 1000, time / 1000);
  }
}

test("prunes oldest complete entries to budget, preserving outputs and unknown files", async (t) => {
  const root = await fixture(t);
  await archive(root, "aaaaaaaaaaaaaaaa", 1000);
  await archive(root, "bbbbbbbbbbbbbbbb", 2000);
  await writeFile(join(root, ".turbo/cache/keep.txt"), "source");
  await mkdir(join(root, "dist"));
  await writeFile(join(root, "dist/app.js"), "application");
  const result = await pruneBuildCache(root, { maxBytes: 12, now: 100000, maxAgeMs: 1000000 });
  assert.deepEqual(result.removed, ["aaaaaaaaaaaaaaaa"]);
  assert.equal(result.bytes, 12);
  await assert.rejects(readFile(join(root, ".turbo/cache/aaaaaaaaaaaaaaaa-manifest.json")), {
    code: "ENOENT",
  });
  assert.equal(await readFile(join(root, "dist/app.js"), "utf8"), "application");
  assert.equal(await readFile(join(root, ".turbo/cache/keep.txt"), "utf8"), "source");
});

test("dry run and fresh concurrent writes are preserved; old entries expire", async (t) => {
  const root = await fixture(t);
  await archive(root, "aaaaaaaaaaaaaaaa", 1000);
  await archive(root, "bbbbbbbbbbbbbbbb", 99000);
  const options = { now: 100000, maxAgeMs: 10000, maxBytes: 0 };
  const preview = await pruneBuildCache(root, { ...options, dryRun: true });
  assert.deepEqual(preview.removed, ["aaaaaaaaaaaaaaaa"]);
  assert.equal(await readFile(join(root, ".turbo/cache/aaaaaaaaaaaaaaaa.tar.zst"), "utf8"), "1234");
  assert.deepEqual((await pruneBuildCache(root, options)).removed, preview.removed);
  assert.equal(await readFile(join(root, ".turbo/cache/bbbbbbbbbbbbbbbb.tar.zst"), "utf8"), "1234");
});

test("refuses redirected cache directories and leaves symlink entries untouched", async (t) => {
  const root = await fixture(t);
  const external = join(root, "external");
  await mkdir(external);
  await writeFile(join(external, "data"), "keep");
  await symlink(join(external, "data"), join(root, ".turbo/cache/aaaaaaaaaaaaaaaa.tar.zst"));
  assert.deepEqual((await pruneBuildCache(root, { maxBytes: 0 })).removed, []);
  await rm(join(root, ".turbo/cache"), { recursive: true });
  await symlink(external, join(root, ".turbo/cache"));
  await assert.rejects(pruneBuildCache(root), /symlinked/);
  assert.equal(await readFile(join(external, "data"), "utf8"), "keep");
});

test("the command wrapper forwards arguments, cleans on failure, and preserves the exit code", async (t) => {
  const root = await fixture(t);
  await archive(root, "aaaaaaaaaaaaaaaa", 1000);
  await mkdir(join(root, "scripts"));
  const script = join(root, "scripts/build-cache.mjs");
  await writeFile(script, await readFile(new URL("./build-cache.mjs", import.meta.url)));
  await mkdir(join(root, "node_modules/turbo/bin"), { recursive: true });
  await writeFile(
    join(root, "node_modules/turbo/bin/turbo"),
    'process.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n"); process.exit(37);',
  );
  const result = spawnSync(process.execPath, [script, "--run", "build", "--filter=example"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 37, result.stderr);
  assert.match(result.stdout, /\["run","build","--filter=example"\]/);
  assert.match(result.stdout, /Removed 1 cache entries/);
  await assert.rejects(readFile(join(root, ".turbo/cache/aaaaaaaaaaaaaaaa.tar.zst")), {
    code: "ENOENT",
  });
});
