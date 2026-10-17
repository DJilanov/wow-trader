import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import process from "node:process";
import console from "node:console";
import {
  loadDungeonManaEvidence,
  reviewedDungeonManaSources,
} from "../infra/simulator/dungeon-set-mana-adapter.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

assert.equal(process.argv.length, 2, "Dungeon-mana staging accepts no arguments or active targets");
const root = resolve(import.meta.dirname, "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const capture = await loadDungeonManaEvidence(root);
const dispatchPath = join(upstream, "sim/core/item_sets.go");
const dispatch = await readFile(dispatchPath, "utf8");
const supportPath = join(upstream, "sim/core/forever_equipment_sets.go");
const support = await readFile(supportPath, "utf8");
const handlers = await readFile(join(upstream, "sim/common/item_sets/dungeon_set_1.go"));
const reviewed = reviewedDungeonManaSources(dispatch, support, handlers);
const helper = await readFile(join(root, "infra/simulator/dungeon-set-mana.go"), "utf8");
const test = await readFile(join(root, "infra/simulator/dungeon-set-mana_test.go"), "utf8");
const nativePath = join(root, ".cache/simulator-toolchain/bin/kfc-prebis");
const unchanged = {
  dispatchSha256: sha(dispatch),
  supportSha256: sha(support),
  nativeBinarySha256: sha(await readFile(nativePath)),
  databaseBytesSha256: sha(await readFile(join(upstream, "assets/database/db.json"))),
  activeReleaseBytesSha256: sha(
    await readFile(join(root, "artifacts/forever-simulator/active.json")),
  ),
};
const goCompilerSha256 = sha(await readFile(join(root, ".cache/simulator-toolchain/go/bin/go")));
const inputs = {
  ...capture,
  ...unchanged,
  handlersSha256: sha(handlers),
  helperSha256: sha(helper),
  testSha256: sha(test),
  adapterSha256: sha(await readFile(join(root, "infra/simulator/dungeon-set-mana-adapter.mjs"))),
  stageScriptSha256: sha(await readFile(import.meta.filename)),
  goCompilerSha256,
};
const identity = simulationHash(inputs);
const directory = join(
  root,
  "artifacts/forever-simulator/optimization/staged-dungeon-mana",
  identity.slice(0, 16),
);
await mkdir(directory, { recursive: true });
const exact = async (name, text) => {
  const path = join(directory, name);
  try {
    await writeFile(path, text, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(await readFile(path, "utf8"), text, "Existing staged overlay changed");
  }
  return path;
};
let completed;
try {
  completed = JSON.parse(await readFile(join(directory, "review.json"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (completed) {
  assert.equal(completed.schema, "kfc-dungeon-mana-overlay-review.v1");
  assert.equal(completed.status, "overlay-tested-not-active");
  assert.equal(completed.identity, identity);
  assert.deepEqual(completed.inputs, inputs);
  assert.deepEqual(completed.models, capture.models);
  assert.deepEqual(completed.checks.activeInputsUnchanged, unchanged);
  assert.equal(completed.checks.originalRegressionExitCode, 1);
  assert.equal(completed.checks.correctedRegressionExitCode, 0);
  for (const [name, expected] of [
    ["dungeon-set-mana.go", helper],
    ["dungeon-set-mana_test.go", test],
    ["item_sets.go", reviewed.patchedDispatch],
    ["item_sets.original.go", reviewed.originalDispatch],
    ["forever_equipment_sets.go", reviewed.patchedSupport],
    ["forever_equipment_sets.original.go", reviewed.originalSupport],
  ])
    assert.equal(await readFile(join(directory, name), "utf8"), expected, "Staged source changed");
  const replacements = {
    [join(upstream, "sim/core/kfc_dungeon_set_mana.go")]: join(directory, "dungeon-set-mana.go"),
    [join(upstream, "sim/common/kfc_dungeon_set_mana_test.go")]: join(
      directory,
      "dungeon-set-mana_test.go",
    ),
  };
  for (const [name, expected] of [
    [
      "original.overlay.json",
      {
        Replace: {
          ...replacements,
          [dispatchPath]: join(directory, "item_sets.original.go"),
          [supportPath]: join(directory, "forever_equipment_sets.original.go"),
        },
      },
    ],
    [
      "fixed.overlay.json",
      {
        Replace: {
          ...replacements,
          [dispatchPath]: join(directory, "item_sets.go"),
          [supportPath]: join(directory, "forever_equipment_sets.go"),
        },
      },
    ],
  ])
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, name), "utf8")),
      expected,
      "Staged overlay changed",
    );
  for (const log of [
    completed.checks.originalRegressionLog,
    completed.checks.correctedRegressionLog,
  ]) {
    assert(/^(before|after)-[a-f0-9]{16}\.log$/.test(log.file));
    assert.equal(sha(await readFile(join(directory, log.file))), log.sha256);
  }
  console.log(
    JSON.stringify({
      output: join(directory, "review.json"),
      reused: true,
      status: completed.status,
    }),
  );
} else {
  const helperPath = await exact("dungeon-set-mana.go", helper);
  const testPath = await exact("dungeon-set-mana_test.go", test);
  const fixedPath = await exact("item_sets.go", reviewed.patchedDispatch);
  const originalPath = await exact("item_sets.original.go", reviewed.originalDispatch);
  const fixedSupport = await exact("forever_equipment_sets.go", reviewed.patchedSupport);
  const originalSupport = await exact(
    "forever_equipment_sets.original.go",
    reviewed.originalSupport,
  );
  const replacements = {
    [join(upstream, "sim/core/kfc_dungeon_set_mana.go")]: helperPath,
    [join(upstream, "sim/common/kfc_dungeon_set_mana_test.go")]: testPath,
  };
  const originalOverlay = await exact(
    "original.overlay.json",
    JSON.stringify(
      {
        Replace: { ...replacements, [dispatchPath]: originalPath, [supportPath]: originalSupport },
      },
      null,
      2,
    ) + "\n",
  );
  const fixedOverlay = await exact(
    "fixed.overlay.json",
    JSON.stringify(
      { Replace: { ...replacements, [dispatchPath]: fixedPath, [supportPath]: fixedSupport } },
      null,
      2,
    ) + "\n",
  );
  const run = async (overlay) => {
    try {
      const result = await promisify(execFile)(
        join(root, ".cache/simulator-toolchain/go/bin/go"),
        [
          "test",
          `-overlay=${overlay}`,
          "-tags",
          "with_db",
          "./sim/common",
          "-run",
          "TestKfcDungeonSetMana",
          "-count=1",
          "-timeout=60s",
        ],
        {
          cwd: upstream,
          timeout: 120000,
          maxBuffer: 2_000_000,
          env: { ...process.env, GOTOOLCHAIN: "local", GOMAXPROCS: "2" },
        },
      );
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      assert(Number.isInteger(error.code), "Overlay test failed to execute");
      return { exitCode: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  };
  console.log("Testing missing five-piece dispatch against the original engine source…");
  const before = await run(originalOverlay);
  const beforeText = before.stdout + before.stderr;
  const originalRegressionLog = {
    file: `before-${sha(beforeText).slice(0, 16)}.log`,
    sha256: sha(beforeText),
  };
  await exact(originalRegressionLog.file, beforeText);
  assert.equal(before.exitCode, 1, "Original source no longer reproduces the missing proc");
  assert.equal(before.stdout.match(/five-piece mana proc not registered exactly once/g)?.length, 6);
  assert(
    !/build failed|panic:/.test(before.stdout + before.stderr),
    "Invalid regression reproducer",
  );
  console.log("Testing the isolated corrected overlay; active source and binary stay unchanged…");
  const after = await run(fixedOverlay);
  const afterText = after.stdout + after.stderr;
  const correctedRegressionLog = {
    file: `after-${sha(afterText).slice(0, 16)}.log`,
    sha256: sha(afterText),
  };
  await exact(correctedRegressionLog.file, afterText);
  assert.equal(after.exitCode, 0, "Corrected dungeon-mana overlay failed; inspect its staged log");
  assert.equal(sha(await readFile(dispatchPath)), unchanged.dispatchSha256);
  assert.equal(sha(await readFile(supportPath)), unchanged.supportSha256);
  assert.equal(sha(await readFile(nativePath)), unchanged.nativeBinarySha256);
  assert.equal(
    sha(await readFile(join(upstream, "assets/database/db.json"))),
    unchanged.databaseBytesSha256,
  );
  assert.equal(
    sha(await readFile(join(root, "artifacts/forever-simulator/active.json"))),
    unchanged.activeReleaseBytesSha256,
  );
  const report = {
    schema: "kfc-dungeon-mana-overlay-review.v1",
    status: "overlay-tested-not-active",
    identity,
    inputs,
    clientVersion: capture.clientVersion,
    models: capture.models,
    checks: {
      originalRegressionExitCode: before.exitCode,
      correctedRegressionExitCode: after.exitCode,
      originalRegressionLog,
      correctedRegressionLog,
      activeInputsUnchanged: unchanged,
    },
    unsupportedSetIds: [183, 184, 185, 187, 188, 189],
    notice:
      "Local overlay regression only. Three current-client-supported five-piece mana models are restored without duplicate flat bonuses. Other unsupported proc/utility thresholds remain gated. No active source, binary, database or UI release changed. Integration, native/browser review and affected optimization reruns are still required before recommendation publication. Not server proc verification.",
  };
  const output = await exact("review.json", JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({ output, status: report.status, models: report.models.map((m) => m.id) }),
  );
}
