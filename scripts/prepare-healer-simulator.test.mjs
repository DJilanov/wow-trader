import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { prepareHealerSimulator } from "./prepare-healer-simulator.mjs";

const root = resolve(import.meta.dirname, ".."),
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  await mkdir(join(root, "artifacts"), { recursive: true });
  const folder = await mkdtemp(join(root, "artifacts/healer-delivery-test-")),
    library = gunzipSync(
      await readFile(join(root, "packages/forever-data/src/fixtures/healer-library.v1.json.gz")),
    ),
    names = [
      "library.json",
      "healing.wasm",
      "healing-worker.js",
      "request-codec.js",
      "wasm_exec.js",
    ],
    files = {};
  for (const name of names) {
    const bytes = name === "library.json" ? library : Buffer.from("Asset transport test: " + name),
      path = join(folder, name);
    await writeFile(path, bytes);
    files[name] = { path: relative(root, path), sha256: hash(bytes) };
  }
  const inputPath = join(folder, "input.json"),
    input = {
      schema: "kfc-healer-browser-input.v1",
      modelIdentity: JSON.parse(library).modelIdentity,
      files,
      sourcePins: [files["library.json"]],
    },
    directory = join(folder, "releases");
  await writeFile(inputPath, JSON.stringify(input));
  return { folder, inputPath, directory, input };
}

test("prepares an immutable compressed healer bundle without activating it", async () => {
  const f = await fixture();
  try {
    const result = await prepareHealerSimulator(f);
    assert.equal(result.active, false);
    const manifest = JSON.parse(await readFile(join(result.directory, "manifest.json")));
    assert.equal(manifest.encodings["healing.wasm"].br.bytes > 0, true);
    await assert.rejects(readFile(join(f.directory, "active.json")), { code: "ENOENT" });
    assert.deepEqual(await prepareHealerSimulator(f), result);
    await writeFile(join(result.directory, "healing.wasm"), "corrupted");
    await assert.rejects(prepareHealerSimulator(f));
  } finally {
    await rm(f.folder, { recursive: true, force: true });
  }
});

test("rejects source drift and paths outside the repository", async () => {
  const f = await fixture();
  try {
    f.input.sourcePins[0].sha256 = "0".repeat(64);
    await writeFile(f.inputPath, JSON.stringify(f.input));
    await assert.rejects(prepareHealerSimulator(f));
    f.input.sourcePins[0].path = "../escape";
    await writeFile(f.inputPath, JSON.stringify(f.input));
    await assert.rejects(prepareHealerSimulator(f), /Invalid healer source path/);
  } finally {
    await rm(f.folder, { recursive: true, force: true });
  }
});

test("activation requires the correct release review and all browser checks", async () => {
  const f = await fixture();
  try {
    const staged = await prepareHealerSimulator(f),
      manifest = await readFile(join(staged.directory, "manifest.json")),
      reviewPath = join(f.folder, "review.json"),
      review = {
        schema: "kfc-healer-workspace-browser-review.v1",
        status: "passed",
        release: staged.release,
        modelIdentity: staged.modelIdentity,
        manifestSha256: hash(manifest),
        simulationCompleted: true,
        stopWorked: false,
        gearEditingWorked: true,
        talentEditingWorked: true,
        raceEditingWorked: true,
      };
    await writeFile(reviewPath, JSON.stringify(review));
    await assert.rejects(prepareHealerSimulator({ ...f, activate: true, reviewPath }));
    review.stopWorked = true;
    await writeFile(reviewPath, JSON.stringify(review));
    const active = await prepareHealerSimulator({ ...f, activate: true, reviewPath });
    assert.equal(active.active, true);
    assert.deepEqual(await readFile(join(f.directory, "active.json")), manifest);
  } finally {
    await rm(f.folder, { recursive: true, force: true });
  }
});

test("supports larger source inventories while preserving the bounded input limit", async () => {
  const f = await fixture();
  try {
    f.input.sourcePins = Array.from({ length: 10001 }, (_, index) => ({
      path: `${f.input.files["library.json"].path}.missing-${index}`,
      sha256: "0".repeat(64),
    }));
    await writeFile(f.inputPath, JSON.stringify(f.input));
    await assert.rejects(prepareHealerSimulator(f), { code: "ENOENT" });
    f.input.sourcePins = Array.from({ length: 20001 }, (_, index) => ({
      path: `missing-${index}`,
      sha256: "0".repeat(64),
    }));
    await writeFile(f.inputPath, JSON.stringify(f.input));
    await assert.rejects(prepareHealerSimulator(f), /1–20000 pins/);
  } finally {
    await rm(f.folder, { recursive: true, force: true });
  }
});

test("rejects duplicate source paths before preparing a release", async () => {
  const f = await fixture();
  try {
    f.input.sourcePins.push({ ...f.input.sourcePins[0] });
    await writeFile(f.inputPath, JSON.stringify(f.input));
    await assert.rejects(prepareHealerSimulator(f), /Duplicate healer source path/);
  } finally {
    await rm(f.folder, { recursive: true, force: true });
  }
});
