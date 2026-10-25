import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSimulationCache, simulationHash } from "../infra/simulator/retained-simulation-cache.mjs";
import { runIndependentValidation } from "../infra/simulator/validation-runner.mjs";
import { nativeSimulationTimeout } from "../infra/simulator/native-runner.mjs";
import { setTimeout } from "node:timers/promises";

test("validation ranges use one batch with stable existing job identities and correct pairing", async () => {
  const baseline = {
    requestBase64: "fixture",
    gear: [{ id: 1 }],
    talentsString: "a",
    rotation: {},
    detail: true,
  };
  const candidate = { ...baseline, talentsString: "b" };
  const original = globalThis.structuredClone([baseline, candidate]);
  let batches = 0;
  const seeds = [100003, 200003];
  const rows = await runIndependentValidation(
    {
      run: async (inputs) => {
        batches++;
        assert.equal(inputs.length, 4);
        assert.equal(
          JSON.stringify(inputs[0]),
          JSON.stringify({
            requestBase64: "fixture",
            gear: [{ id: 1 }],
            talentsString: "a",
            rotation: {},
            iterations: 25,
            seed: seeds[0],
            detail: true,
          }),
        );
        return inputs.map((input, index) => ({ dps: 100 + index, iterations: input.iterations }));
      },
    },
    baseline,
    candidate,
    seeds,
    25,
  );
  assert.equal(batches, 1);
  assert.deepEqual(
    rows.map((row) => [row.seed, row.baseline.dps, row.candidate.dps]),
    [
      [100003, 100, 101],
      [200003, 102, 103],
    ],
  );
  assert.deepEqual([baseline, candidate], original);
});

test("identical A/B checks remain deduplicated while independent ranges run concurrently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kfc-validation-batch-"));
  let active = 0,
    maximum = 0,
    calls = 0;
  const worker = () => ({
    run: async (input) => {
      calls++;
      maximum = Math.max(maximum, ++active);
      await setTimeout(10);
      active--;
      return { id: input.id, dps: 500, stdev: 10, iterations: input.iterations };
    },
  });
  try {
    const cache = await createSimulationCache(directory, "c".repeat(64), [worker(), worker()]);
    const input = { requestBase64: "fixture", gear: [{ id: 1 }] };
    const rows = await runIndependentValidation(cache, input, input, [100003, 200003], 25);
    assert.equal(calls, 2);
    assert.equal(maximum, 2);
    assert.equal(rows[0].baseline, rows[0].candidate);
    await runIndependentValidation(cache, input, input, [100003, 200003], 25);
    assert.equal(calls, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("native watchdog scales with high-precision work and remains bounded", () => {
  assert.equal(nativeSimulationTimeout(25), 180000);
  assert.equal(nativeSimulationTimeout(20000), 180000);
  assert.equal(nativeSimulationTimeout(100000), 900000);
  assert.equal(nativeSimulationTimeout(1000000), 1800000);
  for (const count of [0, -1, 1.5, Number.NaN]) assert.throws(() => nativeSimulationTimeout(count));
});

test("simulation evidence is deduplicated, persisted and reused only for identical inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kfc-sim-cache-"));
  let calls = 0;
  const worker = {
    run: async (input) => {
      calls++;
      return { id: input.id, dps: 500, stdev: 10, iterations: input.iterations };
    },
  };
  const job = { requestBase64: "fixture", gear: [{ id: 1 }], iterations: 100, seed: 1337 };
  const fingerprint = "a".repeat(64);
  try {
    const first = await createSimulationCache(directory, fingerprint, [worker]);
    assert.equal((await first.run([job, job])).length, 2);
    assert.equal(calls, 1);
    const second = await createSimulationCache(directory, fingerprint, [worker]);
    await second.run([job]);
    assert.equal(calls, 1);
    assert.equal(second.stats.reused, 1);
    await second.run([{ ...job, seed: 42 }]);
    assert.equal(calls, 2);
    const other = await createSimulationCache(directory, "b".repeat(64), [worker]);
    await other.run([job]);
    assert.equal(calls, 3);
    const path = join(directory, fingerprint, simulationHash(job) + ".json");
    const evidence = JSON.parse(await readFile(path, "utf8"));
    evidence.result.iterations = 1;
    await writeFile(path, JSON.stringify(evidence));
    const broken = await createSimulationCache(directory, fingerprint, [worker]);
    await assert.rejects(() => broken.run([job]), /Invalid cached/);
    assert.equal(calls, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid native results are never committed as reusable measurements", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kfc-sim-cache-"));
  try {
    const cache = await createSimulationCache(directory, "a".repeat(64), [
      {
        run: async (input) => ({ id: input.id, dps: NaN, stdev: 0, iterations: input.iterations }),
      },
    ]);
    await assert.rejects(() => cache.run([{ iterations: 100, seed: 1 }]), /Invalid cached/);
    await assert.rejects(
      () => cache.run([{ id: "forged", iterations: 100, seed: 1 }]),
      /owns request IDs/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
