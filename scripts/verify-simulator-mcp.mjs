import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { loadManualCrowdEvidence } from "../infra/simulator/manual-crowd-pummeler.mjs";

assert.equal(process.argv.length, 2, "MCP verification accepts no overrides");
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const active = await read(join(directory, "active.json"));
const db = await read(join(directory, active.release, "assets/database/db.json"));
const upstream = join(root, ".cache/forever-sim-upstream");
assert.deepEqual(db, await read(join(upstream, "assets/database/db.json")));
const model = await read(join(directory, active.release, "kfc-mcp-model.json"));
assert.deepEqual(model, await loadManualCrowdEvidence(root, upstream));
const oldSha = "f59e2df32f80ccdfb6aac7214c4698a378ba443f51f39111013ec1bc9b353615";
const oldBinary = join(directory, "optimization/native-engines", "kfc-prebis-" + oldSha);
assert.equal(
  createHash("sha256")
    .update(await readFile(oldBinary))
    .digest("hex"),
  oldSha,
);
assert.deepEqual(
  db,
  await read(join(directory, "3857bbcbda4b436714931a96/assets/database/db.json")),
);

async function archived(input) {
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      oldBinary,
      [],
      {
        cwd: upstream,
        timeout: 180000,
        maxBuffer: 4_000_000,
        env: { ...process.env, GOMAXPROCS: "1" },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          assert.equal(result.id, input.id);
          assert(!result.error, result.error);
          assert(Number.isFinite(result.dps) && result.dps > 0);
          resolveResult(result);
        } catch (failure) {
          reject(failure);
        }
      },
    );
    child.stdin.on("error", reject);
    child.stdin.end(JSON.stringify(input) + "\n");
  });
}

function uses(result) {
  assert(Array.isArray(result.metrics?.actions), "Missing action metrics");
  return result.metrics.actions
    .filter((row) => row.id?.spellId === 13494)
    .flatMap((row) => row.targets)
    .reduce((sum, row) => sum + (row.casts ?? 0), 0);
}

const baseline = await read(
  join(directory, "optimization/baselines/warrior-arms-catalog-refresh-572ee0202ddc31ca.json"),
);
assert.equal(baseline.dbSha256, simulationHash(db));
assert.equal(baseline.revision, active.revision);
const workers = await createNativeRunners(root, 1);
const cases = [];
try {
  assert.notEqual(workers[0].binarySha256, oldSha);
  for (const duration of [300, 600]) {
    const settings = globalThis.structuredClone(baseline.settings);
    settings.player.equipment.items[14] = { id: 9449 };
    settings.encounter.duration = duration;
    settings.player.rotation.priorityList.unshift({
      action: { castSpell: { spellId: { spellId: 13494 } } },
    });
    const captured = await captureSimulatorRequest(root, settings, {
      release: active.release,
      profile: "warrior",
      iterations: 25,
      seed: 1337,
    });
    const input = {
      id: `mcp-${duration}`,
      requestBase64: captured.requestBase64,
      gear: captured.settings.player.equipment.items,
      talentsString: captured.settings.player.talentsString,
      rotation: captured.settings.player.rotation,
      duration,
      iterations: 25,
      seed: 1337,
      detail: true,
    };
    const current = await workers[0].run(input);
    const previous = await archived(input);
    assert(Math.abs(current.dps - captured.browserDps) < 0.0051, "MCP browser/native mismatch");
    const expected = duration === 300 ? 50 : 75;
    assert.equal(
      uses(current),
      expected,
      "Current MCP cooldown/charge limit is not applied in combat",
    );
    assert(uses(previous) > expected, "Archived bug did not reproduce");
    cases.push({
      duration,
      currentUses: uses(current),
      archivedUses: uses(previous),
      nativeDps: current.dps,
      browserDps: captured.browserDps,
      archivedDps: previous.dps,
      requestSha256: simulationHash(captured.requestBase64),
      settingsSha256: simulationHash(captured.settings),
    });
    console.log(
      `PASS MCP ${duration}s: real browser/native parity; archived/current uses ${uses(previous)}/${uses(current)} over25 iterations`,
    );
  }
  const unchanged = {
    id: "unchanged-arms",
    requestBase64: baseline.requestBase64,
    gear: baseline.settings.player.equipment.items,
    talentsString: baseline.settings.player.talentsString,
    rotation: baseline.settings.player.rotation,
    iterations: 25,
    seed: 1337,
  };
  const current = await workers[0].run(unchanged);
  const previous = await archived(unchanged);
  assert.equal(current.dps, previous.dps, "Non-MCP Arms control changed");
  const report = {
    schema: "kfc-mcp-browser-review.v1",
    release: active.release,
    dbSha256: simulationHash(db),
    nativeBinarySha256: workers[0].binarySha256,
    archivedBinarySha256: oldSha,
    modelSha256: simulationHash(model),
    verificationScriptSha256: createHash("sha256")
      .update(await readFile(import.meta.filename))
      .digest("hex"),
    iterations: 25,
    seed: 1337,
    cases,
    unchangedArmsDps: current.dps,
    notice:
      "Forced on-use integration fixtures, NOT recommended equipment or optimization results. Current native/browser execution agrees and observes current-client cooldown/charge limits; server behavior remains unverified. Classic behavior is separately Go-tested unchanged.",
  };
  const output = join(
    directory,
    "optimization",
    `mcp-browser-${simulationHash(report).slice(0, 16)}.json`,
  );
  try {
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(output), report);
  }
  console.log(
    JSON.stringify({ output, native: report.nativeBinarySha256, unchangedArmsDps: current.dps }),
  );
} finally {
  workers.forEach((worker) => worker.close());
}
