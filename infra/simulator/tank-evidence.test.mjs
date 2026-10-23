import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulationHash } from "./simulation-cache.mjs";
import { tankEvidenceFingerprint, tankEvidenceInput, readTankEvidence } from "./tank-evidence.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "tank-evidence-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = tankEvidenceInput(
    "AQ==",
    { items: Array.from({ length: 17 }, (_, index) => ({ id: index + 1 })) },
    300,
    80,
    1337,
  );
  const fingerprint = tankEvidenceFingerprint("a".repeat(64), input.requestBase64);
  const id = simulationHash(input);
  const result = {
    id,
    dps: 2,
    stdev: 0.1,
    iterations: 80,
    health: 5000,
    armor: 6000,
    metrics: {
      dps: { avg: 2, stdev: 0.1 },
      threat: { avg: 10, stdev: 1 },
      dtps: { avg: 3, stdev: 0.5 },
    },
  };
  const record = { schema: "kfc-simulation-evidence.v1", fingerprint, requestSha256: id, result };
  await mkdir(join(directory, fingerprint));
  const save = () => writeFile(join(directory, fingerprint, id + ".json"), JSON.stringify(record));
  await save();
  return { directory, input, fingerprint, result, record, save };
}

test("raw tank evidence is bound to its exact engine, request, equipment and seed", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await readTankEvidence(f.directory, f.fingerprint, f.input), f.result);
  assert.notEqual(tankEvidenceFingerprint("b".repeat(64), f.input.requestBase64), f.fingerprint);
  await assert.rejects(readTankEvidence(f.directory, f.fingerprint, { ...f.input, seed: 1338 }), {
    code: "ENOENT",
  });
  f.record.requestSha256 = "b".repeat(64);
  await f.save();
  await assert.rejects(readTankEvidence(f.directory, f.fingerprint, f.input), /request checksum/);
});

test("a result from another request or sampling count cannot qualify", async (t) => {
  const f = await fixture(t);
  f.result.id = "b".repeat(64);
  await f.save();
  await assert.rejects(readTankEvidence(f.directory, f.fingerprint, f.input), /another request/);
  f.result.id = f.record.requestSha256;
  f.result.iterations = 79;
  await f.save();
  await assert.rejects(readTankEvidence(f.directory, f.fingerprint, f.input), /sampling count/);
  f.result.iterations = 80;
  f.result.metrics.dps.avg = 3;
  await f.save();
  await assert.rejects(
    readTankEvidence(f.directory, f.fingerprint, f.input),
    /DPS counters disagree/,
  );
});

test("missing, negative or nonfinite tank metrics fail evidence validation", async (t) => {
  const f = await fixture(t);
  delete f.result.metrics.threat;
  await f.save();
  await assert.rejects(
    readTankEvidence(f.directory, f.fingerprint, f.input),
    /Invalid tank search metrics/,
  );
  f.result.metrics.threat = { avg: 10, stdev: -1 };
  await f.save();
  await assert.rejects(
    readTankEvidence(f.directory, f.fingerprint, f.input),
    /Invalid tank search metrics/,
  );
  f.result.metrics.threat = { avg: 10, stdev: 1 };
  f.result.health = Infinity;
  await f.save();
  await assert.rejects(
    readTankEvidence(f.directory, f.fingerprint, f.input),
    /Invalid tank search metrics/,
  );
});

test("evidence input refuses unqualified durations and malformed identities", () => {
  const gear = { items: Array.from({ length: 17 }, () => ({ id: 1 })) };
  assert.throws(() => tankEvidenceInput("AQ==", gear, 120, 80, 1337));
  assert.throws(() => tankEvidenceInput("AQ==", gear, 300, 0, 1337));
  assert.throws(() => tankEvidenceFingerprint("../outside", "AQ=="));
});
