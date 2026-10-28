import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSimulatorProgressWriter } from "./simulator-progress.mjs";

test("concurrent workers cannot rename each other's progress file or regress the final state", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "simulator-progress-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"),
    publish = createSimulatorProgressWriter(path);
  await publish({ sequence: -1, completedFrames: 2 });
  const updates = Array.from({ length: 200 }, (_, sequence) =>
    publish({ sequence, completedFrames: 2 }),
  );
  const observations = Array.from({ length: 200 }, async () => {
    const state = JSON.parse(await readFile(path, "utf8"));
    assert(Number.isInteger(state.sequence));
    assert.equal(state.completedFrames, 2);
  });
  await Promise.all([...updates, ...observations]);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { sequence: 199, completedFrames: 2 });
  assert.deepEqual(await readdir(directory), ["state.json"]);
});

test("each queued snapshot retains its values from submission time", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "simulator-progress-snapshot-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"),
    publish = createSimulatorProgressWriter(path);
  const snapshot = { sequence: 1, frames: ["first", "second"] };
  const pending = publish(snapshot);
  snapshot.sequence = 2;
  snapshot.frames.push("unconfirmed");
  await pending;
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
    sequence: 1,
    frames: ["first", "second"],
  });
});

test("a failed write is reported and does not poison later progress updates", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "simulator-progress-recovery-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const missing = join(directory, "missing"),
    path = join(missing, "state.json");
  const publish = createSimulatorProgressWriter(path);
  await assert.rejects(publish({ sequence: 0 }), { code: "ENOENT" });
  await mkdir(missing);
  await publish({ sequence: 1 });
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { sequence: 1 });
  assert.deepEqual(await readdir(missing), ["state.json"]);
});

test("invalid JSON snapshots fail before changing the last valid progress", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "simulator-progress-invalid-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.json"),
    publish = createSimulatorProgressWriter(path);
  await publish({ sequence: 1 });
  await assert.rejects(publish({ sequence: 2n }), TypeError);
  for (const value of [undefined, null, [], "invalid", { toJSON: () => undefined }])
    await assert.rejects(publish(value), TypeError);
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { sequence: 1 });
  assert.deepEqual(await readdir(directory), ["state.json"]);
});
