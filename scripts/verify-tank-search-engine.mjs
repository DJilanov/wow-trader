import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import { openTankWorker, callTankWorker } from "../infra/simulator/tank-tier-browser.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pointer = await json(join(base, "engine.json")),
  engine = await json(pointer.manifest);
const directory = resolve(pointer.manifest, ".."),
  wasm = join(directory, "lib.wasm");
await promisify(execFile)(
  join(root, ".cache/simulator-toolchain/go/bin/go"),
  ["build", "-o", wasm, "./sim/wasm"],
  {
    cwd: engine.workspace,
    timeout: 180000,
    env: { ...process.env, GOTOOLCHAIN: "local", GOOS: "js", GOARCH: "wasm", GOMAXPROCS: "4" },
  },
);
const originalRelease = "3c62628f43a96aa1d77e702b";
const installed = join(root, "artifacts/forever-simulator", originalRelease);
const originalManifest = await json(join(installed, "manifest.json"));
const workerBytes = await readFile(join(installed, "sim_worker.js"));
assert.equal(hash(workerBytes), originalManifest.files["sim_worker.js"].sha256);
const wasmBytes = await readFile(wasm),
  release = hash(Buffer.from(engine.fingerprint + hash(wasmBytes))).slice(0, 24);
const assets = {
  "lib.wasm": wasmBytes,
  "sim_worker.js": workerBytes,
  "tank_warrior/index.html": Buffer.from(
    "<!doctype html><html lang=en><title>Tank engine qualification</title><body>Local research engine</body></html>",
  ),
};
const browserRoot = join(directory, "browser"),
  manifest = { release, files: {} };
for (const [name, bytes] of Object.entries(assets)) {
  const path = join(browserRoot, release, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, bytes);
  manifest.files[name] = { bytes: bytes.length, sha256: hash(bytes) };
}
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href);
const database = await json(join(directory, "database.json"));
assert.equal(hash(Buffer.from(JSON.stringify(database))), engine.dataSha256.database);
const pick = (item, fields) =>
  Object.fromEntries(
    fields.filter((field) => Object.hasOwn(item, field)).map((field) => [field, item[field]]),
  );
const combatDatabase = {
  items: database.items.map((item) =>
    pick(item, [
      "id",
      "classAllowlist",
      "name",
      "type",
      "armorType",
      "weaponType",
      "handType",
      "rangedWeaponType",
      "stats",
      "weaponDamageMin",
      "weaponDamageMax",
      "weaponSpeed",
      "bonusPhysicalDamage",
      "setName",
      "setId",
      "weaponSkills",
      "ilvl",
      "unique",
      "effectItemId",
    ]),
  ),
  enchants: database.enchants.map((enchant) =>
    pick(enchant, ["effectId", "stats", "requiredLevel", "itemLevelMin", "armorTypes"]),
  ),
  randomSuffixes: database.randomSuffixes,
};
const evidenceRoot = join(
  root,
  "artifacts/forever-simulator/optimization/tank-tier-list",
  originalRelease,
);
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const server = await startSimulatorLocalServer(browserRoot, manifest),
  browser = await chromium.launch();
const workers = await openNativeRunners(engine.binary, engine.workspace, engine.binarySha256, 1),
  checked = [];
try {
  const page = await browser.newPage();
  await openTankWorker(page, server.origin, release, "tank_warrior");
  for (const scenario of ["solo", "raid"])
    for (const profile of ["tank_warrior", "feral_tank_druid", "protection_paladin"]) {
      const name = (await readdir(evidenceRoot)).filter((name) =>
        name.startsWith(`${scenario}-${profile}-`),
      );
      assert.equal(name.length, 1);
      const evidence = await json(join(evidenceRoot, name[0]));
      assert.equal(hash(Buffer.from(evidence.requestBase64, "base64")), evidence.requestSha256);
      const original = api.RaidSimRequest.fromBinary(Buffer.from(evidence.requestBase64, "base64"));
      const variants = profile === "tank_warrior" ? [0, 4, 5, 6, 8] : [0];
      for (const pieces of variants) {
        const request = api.RaidSimRequest.clone(original),
          player = request.raid.parties[0].players[0];
        const gear = player.equipment.items.map((item) => ({ id: item.id, enchant: item.enchant }));
        const valor = [
          [0, 16731],
          [2, 16733],
          [4, 16730],
          [5, 16735],
          [6, 16737],
          [7, 16736],
          [8, 16732],
          [9, 16734],
        ];
        for (const [slot, id] of valor.slice(0, pieces)) gear[slot].id = id;
        player.equipment = api.EquipmentSpec.fromJson({ items: gear });
        player.database = api.RaidSimRequest.fromJson({
          raid: { parties: [{ players: [{ database: combatDatabase }] }] },
        }).raid.parties[0].players[0].database;
        request.simOptions.iterations = 100;
        request.simOptions.randomSeed = 61723001n;
        const bytes = api.RaidSimRequest.toBinary(request);
        const native = await workers[0].run({
          id: `${scenario}-${profile}-${pieces}`,
          requestBase64: Buffer.from(bytes).toString("base64"),
          gear,
          duration: request.encounter.duration,
          iterations: 100,
          seed: 61723001,
          detail: true,
        });
        const raw = await callTankWorker(page, "raidSim", bytes),
          response = api.RaidSimResult.fromBinary(raw);
        assert(!response.error?.message, response.error?.message);
        assert.equal(response.iterationsDone, 100);
        assert(Math.abs(response.avgIterationDuration - request.encounter.duration) < 1e-6);
        const unit = response.raidMetrics.parties[0].players[0],
          metrics = {};
        for (const key of ["dps", "threat", "dtps"]) {
          assert(
            Math.abs(unit[key].avg - native.metrics[key].avg) < 1e-8,
            `${scenario}/${profile}/${pieces}: ${key} differs`,
          );
          metrics[key] = { native: native.metrics[key].avg, wasm: unit[key].avg };
        }
        const statsRequest = api.ComputeStatsRequest.fromJson({
          raid: api.RaidSimRequest.toJson(request).raid,
          encounter: api.RaidSimRequest.toJson(request).encounter,
          ruleset: 1,
        });
        const stats = api.ComputeStatsResult.fromBinary(
          await callTankWorker(
            page,
            "computeStats",
            api.ComputeStatsRequest.toBinary(statsRequest),
          ),
        );
        assert(!stats.errorResult, stats.errorResult);
        const final = stats.raidStats.parties[0].players[0].finalStats.stats;
        assert.equal(final[34], native.health);
        assert.equal(final[26], native.armor);
        const row = {
          scenario,
          profile,
          valorPieces: pieces,
          requestSha256: hash(Buffer.from(bytes)),
          responseSha256: hash(Buffer.from(raw)),
          metrics,
          health: native.health,
          armor: native.armor,
        };
        checked.push(row);
        console.log(JSON.stringify(row));
      }
    }
  const report = {
    schema: "kfc-tank-search-engine-qualification.v1",
    engine: engine.fingerprint,
    nativeSha256: engine.binarySha256,
    wasmSha256: hash(wasmBytes),
    workerSha256: hash(workerBytes),
    iterationsPerCase: 100,
    status: "passed",
    checked,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(join(directory, "qualification.json"), JSON.stringify(report, null, 2) + "\n");
} finally {
  for (const worker of workers) worker.close();
  await browser.close();
  await server.close();
}
