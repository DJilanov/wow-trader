import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { materializeDerivedModelWorkspace } from "./derived-model-workspace.mjs";

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "kfc-derived-workspace-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = temporary,
    sourceRoot = "artifacts/forever-simulator/optimization/source/upstream",
    output = "artifacts/forever-simulator/optimization/derived/upstream",
    sourcePins = [];
  await mkdir(join(root, sourceRoot), { recursive: true });
  for (const [path, body] of [
    ["go.mod", "module isolated.test"],
    ["go.sum", ""],
    ["sim/source.go", "package sim"],
  ]) {
    await mkdir(join(root, sourceRoot, path, ".."), { recursive: true });
    await writeFile(join(root, sourceRoot, path), body);
    sourcePins.push({
      path: sourceRoot + "/" + path,
      byteSha256: createHash("sha256").update(body).digest("hex"),
    });
  }
  await writeFile(join(root, sourceRoot, "unlisted.go"), "must never enter derived model");
  return { root, sourceRoot, sourcePins, output };
}

test("only authenticated declared files enter the derived workspace; the parent remains unchanged", async (t) => {
  const options = await fixture(t),
    before = await readFile(join(options.root, options.sourceRoot, "sim/source.go")),
    result = await materializeDerivedModelWorkspace(options);
  assert.equal(result.files.length, 3);
  assert.equal(result.unlistedSourceFilesCopied, false);
  assert.deepEqual(await readFile(join(options.root, options.output, "sim/source.go")), before);
  assert.deepEqual(await readFile(join(options.root, options.sourceRoot, "sim/source.go")), before);
  await assert.rejects(readFile(join(options.root, options.output, "unlisted.go")), {
    code: "ENOENT",
  });
  await assert.rejects(materializeDerivedModelWorkspace(options), /already exists/);
});

test("changed bytes fail before output creation", async (t) => {
  const options = await fixture(t);
  await writeFile(join(options.root, options.sourceRoot, "sim/source.go"), "changed");
  await assert.rejects(materializeDerivedModelWorkspace(options), /source changed/);
  await assert.rejects(readFile(join(options.root, options.output, "go.mod")), { code: "ENOENT" });
});

test("foreign paths, duplicates and missing module identity fail closed", async (t) => {
  const options = await fixture(t);
  for (const change of [
    { sourcePins: [...options.sourcePins, options.sourcePins[0]] },
    { sourcePins: options.sourcePins.slice(1) },
    { sourcePins: [{ path: "../outside", byteSha256: "0".repeat(64) }] },
    { output: options.sourceRoot + "/nested" },
    { output: "outside/upstream" },
  ])
    await assert.rejects(materializeDerivedModelWorkspace({ ...options, ...change }));
});

test("source-file and output-parent symlinks cannot change the selected source boundary", async (t) => {
  const options = await fixture(t),
    target = join(options.root, options.sourceRoot, "sim/source.go");
  await rm(target);
  await symlink(join(options.root, options.sourceRoot, "go.mod"), target);
  await assert.rejects(materializeDerivedModelWorkspace(options));
  await rm(target);
  await writeFile(target, "package sim");
  const outputParent = join(options.root, "artifacts/forever-simulator/optimization/derived");
  await symlink(join(options.root, options.sourceRoot), outputParent);
  await assert.rejects(materializeDerivedModelWorkspace(options));
});
