import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { promisify } from "node:util";
import {
  patchItemWeaponSkills,
  withoutItemWeaponSkills,
} from "../infra/simulator/item-weapon-skills.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";

assert.equal(process.argv.length, 2, "Item-skill staging accepts no active targets or arguments");
const root = resolve(import.meta.dirname, "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lease = await acquireSimulatorWorkspace(root, import.meta.filename);
try {
  const protectedPaths = [
    "sim/core/character.go",
    "assets/database/db.json",
    "assets/database/db.bin",
  ].map((path) => join(upstream, path));
  protectedPaths.push(
    join(root, ".cache/simulator-toolchain/bin/kfc-prebis"),
    ...["active.json", "published-reviews.json", "presentation.json", "preset-safety.json"].map(
      (path) => join(root, "artifacts/forever-simulator", path),
    ),
  );
  const before = Object.fromEntries(
    await Promise.all(protectedPaths.map(async (path) => [path, sha(await readFile(path))])),
  );
  const verifyProtectedInputs = async () => {
    for (const [path, checksum] of Object.entries(before))
      assert.equal(
        sha(await readFile(path)),
        checksum,
        `Protected simulator input changed: ${path}`,
      );
  };
  const source = await readFile(protectedPaths[0], "utf8");
  const patched = patchItemWeaponSkills(source);
  assert.notEqual(patched, source, "The original model is already patched; use a new baseline");
  const normalized = withoutItemWeaponSkills(JSON.parse(await readFile(protectedPaths[1], "utf8")));
  const parent = join(root, "artifacts/forever-simulator/optimization/staged-item-skills");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "no-item-skills-"));
  const exact = async (name, value) => {
    const path = join(directory, name);
    await writeFile(path, value, { flag: "wx" });
    return path;
  };
  const fixedSource = await exact("character.go", patched);
  const testBytes = await readFile(join(root, "infra/simulator/item-weapon-skills_test.go"));
  const testPath = await exact("item-weapon-skills_test.go", testBytes);
  const replacements = { [join(upstream, "sim/core/kfc_item_weapon_skills_test.go")]: testPath };
  const originalOverlay = await exact(
    "original.overlay.json",
    JSON.stringify({ Replace: replacements }),
  );
  const fixedOverlay = await exact(
    "fixed.overlay.json",
    JSON.stringify({ Replace: { ...replacements, [protectedPaths[0]]: fixedSource } }),
  );
  const compiler = join(root, ".cache/simulator-toolchain/go/bin/go");
  const run = async (overlay) => {
    try {
      const output = await promisify(execFile)(
        compiler,
        [
          "test",
          `-overlay=${overlay}`,
          "./sim/core",
          "-run",
          "TestKfcItemWeaponSkills",
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
      return { exitCode: 0, text: output.stdout + output.stderr };
    } catch (error) {
      assert(Number.isInteger(error.code), "Could not execute the item-skill regression test");
      return { exitCode: error.code, text: error.stdout + error.stderr };
    }
  };
  try {
    const old = await run(originalOverlay);
    await exact("before.log", old.text);
    assert.equal(old.exitCode, 1, "Original item-skill issue no longer reproduces");
    assert(old.text.includes("Forever item skill leaked into the character"), old.text);
    assert(!/build failed|panic:/.test(old.text), "Original regression failed to compile");
    const fixed = await run(fixedOverlay);
    await exact("after.log", fixed.text);
    assert.equal(fixed.exitCode, 0, fixed.text);
    await promisify(execFile)(
      compiler,
      ["build", `-overlay=${fixedOverlay}`, "-o", join(directory, "lib.wasm"), "./sim/wasm"],
      {
        cwd: upstream,
        timeout: 180000,
        maxBuffer: 2_000_000,
        env: { ...process.env, GOTOOLCHAIN: "local", GOMAXPROCS: "2", GOOS: "js", GOARCH: "wasm" },
      },
    );
    await verifyProtectedInputs();
    const report = {
      schema: "kfc-item-weapon-skills-overlay-review.v1",
      status: "overlay-tested-not-active",
      policy: normalized.manifest,
      inputs: before,
      adapterSha256: sha(await readFile(join(root, "infra/simulator/item-weapon-skills.mjs"))),
      testSha256: sha(testBytes),
      correctedSourceSha256: sha(patched),
      correctedDatabaseSha256: sha(JSON.stringify(normalized.equipment)),
      wasmSha256: sha(await readFile(join(directory, "lib.wasm"))),
      checks: {
        originalRegressionExitCode: old.exitCode,
        correctedRegressionExitCode: fixed.exitCode,
        wasmCompiled: true,
      },
      notice:
        "Isolated native regression and WASM compilation, not a public release or numerical gear revalidation. Active assets, engine, database, publications and historical checkpoints are unchanged. Publish only newly validated results against the no-item-skill model.",
    };
    const path = await exact("review.json", JSON.stringify(report, null, 2) + "\n");
    console.log(
      JSON.stringify(
        {
          path,
          status: report.status,
          affectedItems: normalized.manifest.changes.map((item) => ({
            id: item.id,
            name: item.name,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await verifyProtectedInputs();
  }
} finally {
  await lease.release();
}
