import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import process from "node:process";
import test from "node:test";
import { prepareSimulatorCatalogUpdatePlan } from "./plan-simulator-catalog-update.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kfc-catalog-update-"));
  const items = [{ id: 1, type: 1, stats: Array(44).fill(0) }];
  const sources = {
    "before-catalog.json": { items, enchants: [] },
    "after-catalog.json": {
      items: [...items, { id: 2, type: 11, stats: Array(44).fill(0) }],
      enchants: [],
    },
    "before-inspection.json": { items: { 1: {} }, sets: {} },
    "after-inspection.json": { items: { 1: {}, 2: {} }, sets: {} },
  };
  const metadata = {
    mechanicsSha256: sha("mechanics"),
    requestContextSha256: sha("context"),
    eligibilitySha256: sha("eligibility"),
    backend: Object.fromEntries(
      ["binarySha256", "compiledDatabaseSha256", "codecSha256", "runnerSourceSha256"].map((key) => [
        key,
        sha(key),
      ]),
    ),
    incumbent: { items: Array.from({ length: 17 }, (_, slot) => ({ id: slot === 0 ? 1 : 0 })) },
  };
  const manifest = {
    schema: "kfc-simulator-catalog-update-input.v1",
    profile: "warrior",
    before: globalThis.structuredClone(metadata),
    after: globalThis.structuredClone(metadata),
  };
  for (const [name, value] of Object.entries(sources)) {
    const bytes = Buffer.from(JSON.stringify(value) + "\n");
    await writeFile(join(root, name), bytes, { flag: "wx" });
    const [label, kind] = name.replace(".json", "").split("-");
    manifest[label][kind] = { path: name, sha256: sha(bytes) };
  }
  const save = () => writeFile(join(root, "input.json"), JSON.stringify(manifest) + "\n");
  await save();
  return { root, manifest, save };
}

test("the public preparation writes a source-bound immutable plan and reuses identical bytes", async () => {
  const { root } = await fixture();
  try {
    const result = await prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" });
    const bytes = await readFile(result.output),
      report = JSON.parse(bytes);
    assert.equal(result.sha256, sha(bytes));
    assert.equal(report.sources.length, 4);
    assert.equal(report.toolSourcePins.length, 6);
    assert.equal(report.plan.nativeJobs, 0);
    assert.equal(report.plan.mode, "affected-groups-review-required");
    assert.deepEqual(report.plan.slots, [10, 11]);
    assert.equal(report.plan.measurementReuseAuthorized, false);
    const again = await prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" });
    assert.equal(again.output, result.output);
    assert.equal(again.sha256, result.sha256);
    assert.deepEqual(await readdir(dirname(result.output)), [report.identity + ".json"]);
    await writeFile(result.output, "tampered\n");
    await assert.rejects(
      prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }),
      /Refusing to replace/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing or changed checksums and invalid input schemas are rejected", async () => {
  for (const change of [
    (manifest) => {
      delete manifest.after.catalog.sha256;
    },
    (manifest) => {
      manifest.after.catalog.sha256 = "0".repeat(64);
    },
    (manifest) => {
      manifest.schema = "unreviewed";
    },
  ]) {
    const { root, manifest, save } = await fixture();
    try {
      change(manifest);
      await save();
      await assert.rejects(prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("concurrent callers publish one complete immutable plan without leaving temporary files", async () => {
  const { root } = await fixture();
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }),
      ),
    );
    assert.equal(new Set(results.map((result) => result.output)).size, 1);
    assert.equal(new Set(results.map((result) => result.sha256)).size, 1);
    const report = JSON.parse(await readFile(results[0].output));
    assert.deepEqual(await readdir(dirname(results[0].output)), [report.identity + ".json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source symlinks and outside-repository sources cannot be read as catalog data", async () => {
  const { root, manifest, save } = await fixture(),
    external = await mkdtemp(join(tmpdir(), "kfc-catalog-external-"));
  try {
    const target = join(external, "catalog.json");
    await writeFile(target, JSON.stringify({ items: [], enchants: [] }));
    manifest.after.catalog = { path: target, sha256: sha(await readFile(target)) };
    await save();
    await assert.rejects(
      prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }),
      /escapes/,
    );
    await symlink(target, join(root, "linked.json"));
    manifest.after.catalog.path = "linked.json";
    await save();
    await assert.rejects(
      prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }),
      /Invalid/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("output symlinks are refused before any nested directories are created outside the root", async () => {
  const { root } = await fixture(),
    external = await mkdtemp(join(tmpdir(), "kfc-catalog-output-"));
  try {
    await symlink(external, join(root, "artifacts"));
    await assert.rejects(
      prepareSimulatorCatalogUpdatePlan({ root, inputPath: "input.json" }),
      /symlink/,
    );
    assert.deepEqual(await readdir(external), []);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("the command documents its one-command entry and rejects unknown flags or path traversal", async () => {
  const script = fileURLToPath(new URL("./plan-simulator-catalog-update.mjs", import.meta.url));
  const run = promisify(execFile);
  const help = await run(process.execPath, [script, "--help"]);
  assert(help.stdout.includes("simulator:prebis:plan-update"));
  assert.equal(help.stderr, "");
  for (const args of [
    ["--execute"],
    ["--input=../input.json"],
    ["--input=input.json", "--deploy"],
  ]) {
    await assert.rejects(
      run(process.execPath, [script, ...args]),
      (error) => error.code === 1 && error.stdout === "",
    );
  }
});
