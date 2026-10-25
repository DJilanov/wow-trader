import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { materializeFrozenModelWorkspace } from "./frozen-model-workspace.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "kfc-frozen-model-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourcePins = [];
  async function source(path, text) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
    const pin = { path, byteSha256: sha(text) };
    sourcePins.push(pin);
    return pin;
  }
  await source(".cache/forever-sim-upstream/go.mod", "module example.test/frozen\n");
  await source(".cache/forever-sim-upstream/go.sum", "");
  await source(".cache/forever-sim-upstream/sim/core/character.go", "package core\n");
  const output = "artifacts/forever-simulator/optimization/model-test/workspace";
  return { root, sourcePins, output, overlay: { Replace: {} }, source };
}

test("copies only pinned compiler inputs and leaves unlisted healer work outside", async (t) => {
  const options = await fixture(t);
  const unlisted = join(options.root, ".cache/forever-sim-upstream/sim/core/healer-new.go");
  await writeFile(unlisted, "package core\nfunc NewHealer() {}\n");
  const report = await materializeFrozenModelWorkspace(options);
  assert.equal(report.files.length, 3);
  assert.equal(report.unlistedMutableFilesUsed, false);
  assert.deepEqual(await readdir(join(options.root, options.output, "sim/core")), ["character.go"]);
  assert.equal(await readFile(unlisted, "utf8"), "package core\nfunc NewHealer() {}\n");
});

test("materializes pinned replacements and overlay-only files without trusting overwritten originals", async (t) => {
  const options = await fixture(t);
  const replacement = await options.source(
    "artifacts/review/character.go",
    "package core\nfunc Fixed() {}\n",
  );
  options.sourcePins.pop();
  const added = await options.source("artifacts/review/regression_test.go", "package core\n");
  options.sourcePins.pop();
  options.generatedInputs = [replacement, added];
  const original = join(options.root, ".cache/forever-sim-upstream/sim/core/character.go");
  await writeFile(original, "package core\nfunc UnfinishedHealer() {}\n");
  options.overlay.Replace[original] = join(options.root, replacement.path);
  options.overlay.Replace[
    join(options.root, ".cache/forever-sim-upstream/sim/core/fixed_test.go")
  ] = join(options.root, added.path);
  const report = await materializeFrozenModelWorkspace(options);
  assert.equal(report.files.filter((row) => row.kind === "overlay").length, 2);
  assert.equal(
    await readFile(join(options.root, options.output, "sim/core/character.go"), "utf8"),
    "package core\nfunc Fixed() {}\n",
  );
  assert.match(await readFile(original, "utf8"), /UnfinishedHealer/);
});

test("rejects changed source bytes before creating an output", async (t) => {
  const options = await fixture(t);
  await writeFile(join(options.root, options.sourcePins[2].path), "package changed\n");
  await assert.rejects(materializeFrozenModelWorkspace(options), /Frozen source changed/);
  await assert.rejects(readFile(join(options.root, options.output, ".kfc-frozen-workspace.json")), {
    code: "ENOENT",
  });
});

test("rejects an unpinned overlay and escaped destination", async (t) => {
  const options = await fixture(t);
  options.overlay.Replace[join(options.root, ".cache/forever-sim-upstream/sim/new.go")] = join(
    options.root,
    "untrusted.go",
  );
  await assert.rejects(materializeFrozenModelWorkspace(options), /no authenticated source pin/);
  options.overlay.Replace = {
    [join(options.root, "outside.go")]: join(options.root, options.sourcePins[0].path),
  };
  await assert.rejects(materializeFrozenModelWorkspace(options), /Invalid frozen source path/);
});

test("never overwrites an existing workspace or accepts a source alias", async (t) => {
  const options = await fixture(t);
  await materializeFrozenModelWorkspace(options);
  await assert.rejects(materializeFrozenModelWorkspace(options), /already exists/);
  const target = join(options.root, options.sourcePins[2].path);
  const replacement = join(options.root, "source-alias.go");
  await writeFile(replacement, "package core\n");
  await rm(target);
  await symlink(replacement, target);
  await assert.rejects(
    materializeFrozenModelWorkspace({ ...options, output: options.output + "-second" }),
    /regular file/,
  );
});

test("rejects conflicting pins, output escape and symlinked output parents", async (t) => {
  const options = await fixture(t);
  await assert.rejects(
    materializeFrozenModelWorkspace({
      ...options,
      generatedInputs: [{ ...options.sourcePins[0], byteSha256: "0".repeat(64) }],
    }),
    /Conflicting source pins/,
  );
  await assert.rejects(
    materializeFrozenModelWorkspace({ ...options, output: ".cache/overwrite" }),
    /research storage/,
  );
  const real = join(options.root, "real-output");
  await mkdir(real);
  const link = join(options.root, "artifacts/forever-simulator/optimization");
  await mkdir(dirname(link), { recursive: true });
  await symlink(real, link);
  await assert.rejects(materializeFrozenModelWorkspace(options), /symlink/);
});
