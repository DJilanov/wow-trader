import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, realpath } from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { createSimulationCache } from "../infra/simulator/simulation-cache.mjs";
import { tankThreatBreakdown } from "../infra/simulator/tank-threat-breakdown.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({
  options: { report: { type: "string" }, release: { type: "string" } },
  strict: true,
});
assert(
  values.report && /^[a-f0-9]{24}$/.test(values.release ?? ""),
  "Pass --report=<completed report> --release=<qualified browser release>",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  objectHash = (value) => hash(JSON.stringify(value)),
  json = async (path) => JSON.parse(await readFile(path, "utf8"));
const reportPath = await realpath(resolve(root, values.report)),
  report = await json(reportPath),
  runDirectory = dirname(reportPath);
const offset = relative(await realpath(join(base, "runs")), reportPath);
assert(offset && offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset));
assert(/^[a-f0-9]{64}$/.test(report.fingerprint));
assert.equal(reportPath, await realpath(join(base, "runs", report.fingerprint, "report.json")));
assert.equal(objectHash(report.inputs), report.fingerprint);
const replay = await json(join(runDirectory, "replay.json")),
  imports = await json(join(runDirectory, `imports-${values.release}.json`));
assert.equal(replay.status, "passed");
assert.equal(replay.reportSha256, objectHash(report));
assert.equal(imports.status, "passed");
assert.equal(imports.fingerprint, report.fingerprint);
assert.equal(imports.release, values.release);
assert.equal(imports.reportSha256, objectHash(report));
assert.equal(imports.replaySha256, objectHash(replay));
assert.equal(
  imports.sourceSha256.controller,
  hash(await readFile(join(root, "scripts/qualify-tank-item-builds.mjs"))),
);
assert.equal(
  imports.sourceSha256.importPolicy,
  hash(await readFile(join(root, "infra/simulator/tank-build-import.mjs"))),
);
assert.equal(
  imports.sourceSha256.consentCheck,
  hash(await readFile(join(root, "scripts/review-prebis-browser.mjs"))),
);
const engineDirectory = join(base, "engines", report.inputs.engine),
  engine = await json(join(engineDirectory, "manifest.json"));
assert.equal(engine.fingerprint, report.inputs.engine);
assert.equal(imports.engine, engine.fingerprint);
assert.equal(objectHash(engine.inputs), engine.fingerprint);
assert.equal(engine.binarySha256, report.inputs.binary);
assert.equal(imports.nativeBinarySha256, engine.binarySha256);
const database = await json(join(engineDirectory, "database.json"));
assert.equal(objectHash(database), engine.dataSha256.database);
assert.equal(imports.databaseSha256, engine.dataSha256.database);
const requestDocument = await json(join(runDirectory, "request.json"));
assert.equal(hash(requestDocument.requestBase64), report.inputs.request);
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href),
  request = api.RaidSimRequest.fromBinary(Buffer.from(requestDocument.requestBase64, "base64")),
  workers = await openNativeRunners(engine.binary, engine.workspace, engine.binarySha256, 2),
  measurementCacheFingerprint = objectHash({
    engine: engine.fingerprint,
    native: engine.binarySha256,
    request: report.inputs.request,
    detail: "full-unit-v1",
  }),
  cache = await createSimulationCache(
    join(base, "selected-metrics-cache"),
    measurementCacheFingerprint,
    workers,
  ),
  builds = [];
try {
  assert.equal(report.results.length, 2);
  assert.equal(imports.builds.length, 2);
  for (const result of report.results) {
    assert(result.converged && result.accepted);
    const imported = imports.builds.find((build) => build.objective === result.objective);
    assert(imported);
    assert.deepEqual(
      api.EquipmentSpec.toBinary(api.EquipmentSpec.fromJson(imported.settings.player.equipment)),
      api.EquipmentSpec.toBinary(api.EquipmentSpec.fromJson(result.gear)),
    );
    const samples = await cache.run(
      result.validation.map((row) => ({
        requestBase64: requestDocument.requestBase64,
        gear: result.gear.items,
        duration: request.encounter.duration,
        iterations: row.candidate.iterations,
        seed: row.seed,
        detail: true,
      })),
    );
    const breakdown = new Map();
    for (const [index, sample] of samples.entries()) {
      const reference = result.validation[index].candidate;
      assert.equal(sample.iterations, 20000);
      assert.equal(sample.health, reference.health);
      assert.equal(sample.armor, reference.armor);
      for (const name of ["dps", "threat", "dtps"])
        for (const field of ["avg", "stdev"])
          assert(
            Math.abs(sample.metrics[name][field] - reference.metrics[name][field]) < 1e-8,
            "Selected action remeasurement differs from search confirmation: " + name + "/" + field,
          );
      const rows = tankThreatBreakdown(
        sample.metrics,
        database,
        sample.iterations,
        request.encounter.duration,
      );
      for (const row of rows) {
        const pooled = breakdown.get(row.key) ?? { ...row, damagePerSecond: 0, threatPerSecond: 0 };
        pooled.damagePerSecond += row.damagePerSecond / samples.length;
        pooled.threatPerSecond += row.threatPerSecond / samples.length;
        breakdown.set(row.key, pooled);
      }
    }
    const threatBreakdown = [...breakdown.values()].sort(
      (a, b) => b.threatPerSecond - a.threatPerSecond || a.key.localeCompare(b.key),
    );
    for (const [name, metric] of [
      ["damagePerSecond", "dps"],
      ["threatPerSecond", "threat"],
    ])
      assert(
        Math.abs(
          threatBreakdown.reduce((sum, row) => sum + row[name], 0) -
            imported.validation.metrics[metric].avg,
        ) < 1e-6,
        "Pooled action totals differ from published reference",
      );
    const build = {
      ...imported,
      threatBreakdown,
      measurementRequests: samples.map((sample) => ({
        id: sample.id,
        sha256: objectHash(sample),
        iterations: sample.iterations,
      })),
      measuredAt: new Date().toISOString(),
    };
    builds.push(build);
    console.log(
      JSON.stringify({
        profile: report.profile,
        scenario: report.scenario,
        objective: result.objective,
        iterations: imported.validation.iterations,
        threat: imported.validation.metrics.threat.avg,
        dtps: imported.validation.metrics.dtps.avg,
        actions: threatBreakdown.length,
        status: "reconciled",
      }),
    );
  }
  const receipt = {
    schema: "kfc-optimized-tank-measurements.v1",
    status: "passed",
    fingerprint: report.fingerprint,
    release: values.release,
    engine: engine.fingerprint,
    nativeBinarySha256: engine.binarySha256,
    wasmSha256: imports.wasmSha256,
    databaseSha256: engine.dataSha256.database,
    measurementCacheFingerprint,
    reportSha256: objectHash(report),
    importsSha256: objectHash(imports),
    sourceSha256: {
      controller: hash(await readFile(import.meta.filename)),
      breakdown: hash(await readFile(join(root, "infra/simulator/tank-threat-breakdown.mjs"))),
    },
    builds,
    cache: cache.stats,
    notice:
      "Exact selected-build action counters and pooled 40,000-fight metrics. No model or publication pointer is changed.",
    finishedAt: new Date().toISOString(),
  };
  const target = join(runDirectory, `measurements-${values.release}.json`),
    temporary = target + "." + randomUUID() + ".pending";
  await writeFile(temporary, JSON.stringify(receipt, null, 2) + "\n");
  await rename(temporary, target);
  console.log(
    JSON.stringify({ status: "passed", path: target, builds: builds.length, pointerWrites: 0 }),
  );
} finally {
  for (const worker of workers) worker.close();
}
