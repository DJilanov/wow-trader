import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { createSimulationCache } from "../infra/simulator/retained-simulation-cache.mjs";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: { iterations: { type: "string", default: "20000" } },
  strict: true,
});
const iterations = Number(values.iterations);
const controlSeeds = [79491001, 80491001];
assert(Number.isSafeInteger(iterations) && iterations >= 100 && iterations <= 100000);
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const pointer = await json(join(base, "engine.json")),
  engine = await json(pointer.manifest);
assert.equal(engine.fingerprint, pointer.fingerprint);
const database = await json(join(resolve(pointer.manifest, ".."), "database.json"));
assert.equal(hash(JSON.stringify(database)), engine.dataSha256.database);
const items = new Map(database.items.map((item) => [item.id, item]));
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href);
const release = "3c62628f43a96aa1d77e702b";
const evidenceRoot = join(root, "artifacts/forever-simulator/optimization/tank-tier-list", release);
const workers = await openNativeRunners(engine.binary, engine.workspace, engine.binarySha256, 2);
const cache = await createSimulationCache(
  join(base, "set-comparison-cache"),
  engine.binarySha256,
  workers,
);
const rows = [];
try {
  for (const scenario of ["solo", "raid"]) {
    const names = (await readdir(evidenceRoot)).filter((name) =>
      name.startsWith(`${scenario}-tank_warrior-`),
    );
    assert.equal(names.length, 1);
    const evidence = await json(join(evidenceRoot, names[0]));
    assert.equal(hash(Buffer.from(evidence.requestBase64, "base64")), evidence.requestSha256);
    const request = api.RaidSimRequest.fromBinary(Buffer.from(evidence.requestBase64, "base64"));
    const player = request.raid.parties[0].players[0];
    player.database = undefined;
    const original = player.equipment.items.map((item) => ({ id: item.id, enchant: item.enchant }));
    const valor = globalThis.structuredClone(original);
    for (const [slot, id] of [
      [0, 16731],
      [2, 16733],
      [4, 16730],
      [5, 16735],
      [6, 16737],
      [7, 16736],
      [8, 16732],
      [9, 16734],
    ]) {
      assert.equal(items.get(id)?.setId, 189);
      valor[slot].id = id;
    }
    const requestBase64 = Buffer.from(api.RaidSimRequest.toBinary(request)).toString("base64");
    for (const seed of controlSeeds) {
      const results = await cache.run(
        [original, valor].map((gear) => ({
          requestBase64,
          gear,
          duration: request.encounter.duration,
          iterations,
          seed,
          detail: true,
        })),
      );
      for (const [index, result] of results.entries()) {
        const label = index === 0 ? "published-starter" : "eight-piece-valor";
        assert(
          Number.isFinite(result.metrics?.threat?.avg) &&
            Number.isFinite(result.metrics?.dtps?.avg),
        );
        rows.push({
          scenario,
          label,
          seed,
          requestSha256: hash(Buffer.from(requestBase64, "base64")),
          gear: index === 0 ? original : valor,
          result,
        });
        console.log(
          JSON.stringify({
            scenario,
            label,
            seed,
            iterations,
            tps: result.metrics.threat.avg,
            dtps: result.metrics.dtps.avg,
            health: result.health,
            armor: result.armor,
          }),
        );
      }
    }
  }
  const report = {
    schema: "kfc-warrior-valor-comparison.v1",
    engine: engine.fingerprint,
    binarySha256: engine.binarySha256,
    iterationsPerSeed: iterations,
    seeds: controlSeeds,
    rows,
    notice:
      "Full-set A/B control with identical accessories, enchants, talents and rotation. No health floor excludes either set. Not an all-slot optimized winner; inspect the engine's unverified Valor cadence assumption.",
    completedAt: new Date().toISOString(),
  };
  const path = join(base, `warrior-valor-${engine.fingerprint.slice(0, 16)}-${iterations}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`REPORT ${path}`);
} finally {
  for (const worker of workers) worker.close();
}
