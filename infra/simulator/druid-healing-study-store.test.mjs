import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDruidHealingWorkloadStore } from "./druid-healing-study-store.mjs";
async function folder(t) {
  const path = await mkdtemp(join(tmpdir(), "kfc-healing-workloads-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const frame = {
  schema: "kfc-druid-healing-workload.v1",
  name: "controlled-test",
  damage: [],
  priorities: [],
};
test("concurrent workers and store instances share one immutable workload file", async (t) => {
  const directory = await folder(t),
    first = createDruidHealingWorkloadStore(directory),
    second = createDruidHealingWorkloadStore(directory);
  const results = await Promise.all(
    Array.from({ length: 64 }, (_, i) => (i % 2 ? first : second).save(frame)),
  );
  assert.equal((await readdir(directory)).length, 1);
  for (const result of results) assert.deepEqual(result, results[0]);
  await first.verify();
  await second.verify();
});
test("the caller cannot change an in-flight saved workload", async (t) => {
  const directory = await folder(t),
    store = createDruidHealingWorkloadStore(directory),
    source = globalThis.structuredClone(frame),
    pending = store.save(source);
  source.name = "changed";
  const result = await pending;
  assert.equal(JSON.parse(await readFile(result.path)).name, "controlled-test");
  await store.verify();
});
test("changed evidence is rejected and never overwritten", async (t) => {
  const directory = await folder(t),
    store = createDruidHealingWorkloadStore(directory),
    ref = await store.save(frame),
    changed = JSON.stringify({ ...frame, name: "tampered" });
  await writeFile(ref.path, changed);
  await assert.rejects(store.verify(), /bytes changed/);
  await assert.rejects(createDruidHealingWorkloadStore(directory).save(frame), /evidence changed/);
  assert.equal(await readFile(ref.path, "utf8"), changed);
});
