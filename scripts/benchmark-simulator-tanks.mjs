import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { parseArgs } from "node:util";
import { Buffer } from "node:buffer";
import console from "node:console";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import {
  captureTankSettings,
  openTankWorker,
  callTankWorker,
} from "../infra/simulator/tank-tier-browser.mjs";
import {
  createTankTierSettings,
  tankTierPolicy,
  tankTierProfiles,
  tankTierUnranked,
} from "../infra/simulator/tank-tier-policy.mjs";
import { raidBenchmarkDebuffs } from "../infra/simulator/tier-scenarios.mjs";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    release: { type: "string" },
    "artifact-root": { type: "string" },
    "write-snapshot": { type: "boolean", default: false },
    "verify-cache": { type: "boolean", default: false },
  },
  strict: true,
  allowPositionals: false,
});
assert(/^[a-f0-9]{24}$/.test(values.release ?? ""), "Pass --release=<published tank release>");
const release = values.release;
const directory = resolve(values["artifact-root"] ?? join(root, "artifacts/forever-simulator"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const manifest = await json(join(directory, release, "manifest.json"));
assert.equal(manifest.release, release);
const active = await json(join(directory, "active.json"));
const selection = await json(join(directory, "model-update.json"));
assert.equal(selection.release, release, "Benchmark the approved global tank presentation");
const overrides = await json(join(directory, "profile-model-updates.json"));
assert(
  tankTierProfiles.every((profile) => !Object.hasOwn(overrides.profiles, profile)),
  "A tank-specific model requires a new admission policy",
);
const approvedSelection = {
  activeManifestSha256: hash(JSON.stringify(active)),
  modelSelectionSha256: hash(JSON.stringify(selection)),
};
const assets = ["lib.wasm", "assets/database/db.json", "kfc-tank-starters.json"];
for (const file of assets)
  assert.equal(
    hash(await readFile(join(directory, release, file))),
    manifest.files[file].sha256,
    file,
  );
const database = await json(join(directory, release, "assets/database/db.json"));
// The UI catalog also carries icons, vendors and phase metadata. The pinned combat
// protobuf accepts only these SimItem/SimEnchant fields; keep strict decoding on.
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
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
const starters = await json(join(directory, release, "kfc-tank-starters.json"));
const codec = join(
  directory,
  "optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href);
function tankMetrics(raw, policy) {
  const result = api.RaidSimResult.fromBinary(raw);
  assert(!result.error?.message, result.error?.message);
  assert.equal(result.iterationsDone, 5000);
  assert(Math.abs(result.avgIterationDuration - policy.durationSeconds) < 0.001);
  const player = result.raidMetrics.parties[0].players[0];
  return Object.fromEntries(
    ["threat", "dtps", "dps"].map((name) => {
      const value = player[name];
      assert(
        Number.isFinite(value.avg) &&
          value.avg > 0 &&
          Number.isFinite(value.stdev) &&
          value.stdev >= 0,
        "Missing tank metric: " + name,
      );
      return [name, { avg: value.avg, stdev: value.stdev }];
    }),
  );
}
const support = await json(join(root, "infra/simulator/raid-buff-defaults.v2.json"));
const storage = join(directory, "optimization/tank-tier-list", release);
await mkdir(storage, { recursive: true });
const chromium = values["verify-cache"]
  ? null
  : createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("playwright").chromium;
const server = chromium ? await startSimulatorLocalServer(directory, manifest) : null;
const browser = chromium ? await chromium.launch() : null;
const snapshots = [];
try {
  const captured = new Map();
  for (const profile of tankTierProfiles) {
    const path = join(storage, `${profile}-starter.json`);
    let starter;
    try {
      starter = await json(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      assert(browser && server, "Missing starter capture; run without --verify-cache");
      const context = await browser.newContext();
      try {
        const settings = await captureTankSettings(
          await context.newPage(),
          server.origin,
          release,
          profile,
        );
        starter = { release, profile, manifestSha256: hash(JSON.stringify(manifest)), settings };
        await writeFile(path, JSON.stringify(starter, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      } finally {
        await context.close();
      }
    }
    assert.equal(starter.release, release);
    assert.equal(starter.profile, profile);
    assert.equal(starter.manifestSha256, hash(JSON.stringify(manifest)));
    const ids = (gear) => gear.items.map((item) => item.id ?? 0);
    assert(
      [starters[profile].gear, starters[profile].hordeGear].some(
        (gear) =>
          gear &&
          JSON.stringify(ids(gear)) === JSON.stringify(ids(starter.settings.player.equipment)),
      ),
      "Captured equipment is not a published starter",
    );
    captured.set(profile, starter.settings);
  }
  for (const scenario of ["solo", "raid"]) {
    const policy = tankTierPolicy(scenario);
    const policySha256 = hash(JSON.stringify(policy));
    const entries = [];
    for (const profile of tankTierProfiles) {
      const settings = createTankTierSettings(
        captured.get(profile),
        scenario,
        profile,
        support,
        raidBenchmarkDebuffs,
      );
      // Round-trip the exact native import schema before using it for a combat request.
      const encoded = api.IndividualSimSettings.toBinary(
        api.IndividualSimSettings.fromJson(settings, { ignoreUnknownFields: false }),
      );
      const canonical = api.IndividualSimSettings.toJson(
        api.IndividualSimSettings.fromBinary(encoded),
      );
      const request = api.RaidSimRequest.fromJson(
        {
          raid: {
            parties: [
              {
                players: [{ ...canonical.player, database: combatDatabase }],
                buffs: canonical.partyBuffs,
              },
            ],
            buffs: canonical.raidBuffs,
            debuffs: canonical.debuffs,
            tanks: canonical.tanks,
            numActiveParties: 1,
          },
          encounter: canonical.encounter,
          simOptions: {
            iterations: policy.iterations,
            randomSeed: String(policy.seed),
            ruleset: 1,
          },
        },
        { ignoreUnknownFields: false },
      );
      const bytes = api.RaidSimRequest.toBinary(request);
      const requestSha256 = hash(bytes);
      const path = join(storage, `${scenario}-${profile}-${requestSha256.slice(0, 16)}.json`);
      let evidence;
      try {
        evidence = await json(path);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        assert(browser && server, "Missing measurement; run without --verify-cache");
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          await openTankWorker(page, server.origin, release, profile);
          const stats = api.ComputeStatsResult.fromBinary(
            await callTankWorker(
              page,
              "computeStats",
              api.ComputeStatsRequest.toBinary(
                api.ComputeStatsRequest.create({
                  raid: request.raid,
                  encounter: request.encounter,
                  ruleset: 1,
                }),
              ),
            ),
          );
          assert(!stats.errorResult?.message, stats.errorResult?.message);
          const rotation = stats.raidStats.parties[0].players[0].rotationStats;
          assert.deepEqual(
            [...rotation.priorityList, ...rotation.prepullActions].flatMap(
              (entry) => entry.warnings,
            ),
            [],
            "Invalid tank rotation",
          );
          const response = await callTankWorker(page, "raidSim", bytes);
          tankMetrics(response, policy);
          evidence = {
            schema: "kfc-tank-tier-measurement.v1",
            scenario,
            profile,
            release,
            policySha256,
            requestSha256,
            requestBase64: Buffer.from(bytes).toString("base64"),
            responseSha256: hash(response),
            responseBase64: Buffer.from(response).toString("base64"),
            capturedAt: new Date().toISOString(),
          };
          await writeFile(path, JSON.stringify(evidence, null, 2) + "\n", {
            flag: "wx",
            mode: 0o600,
          });
        } finally {
          await context.close();
        }
      }
      assert.equal(evidence.schema, "kfc-tank-tier-measurement.v1");
      assert.equal(evidence.profile, profile);
      assert.equal(evidence.release, release);
      assert.equal(evidence.scenario, scenario);
      assert.equal(evidence.policySha256, policySha256);
      assert.equal(evidence.requestSha256, requestSha256);
      assert.equal(evidence.requestBase64, Buffer.from(bytes).toString("base64"));
      const raw = Buffer.from(evidence.responseBase64, "base64");
      assert.equal(hash(raw), evidence.responseSha256);
      const metrics = tankMetrics(raw, policy);
      entries.push({
        id: profile.replaceAll("_", "-"),
        profile,
        release,
        metrics,
        iterations: 5000,
        talents: canonical.player.talentsString,
        race: canonical.player.race,
        manifestSha256: hash(JSON.stringify(manifest)),
        wasmSha256: manifest.files["lib.wasm"].sha256,
        databaseSha256: manifest.files["assets/database/db.json"].sha256,
        starterSha256: manifest.files["kfc-tank-starters.json"].sha256,
        requestSha256,
        responseSha256: evidence.responseSha256,
        benchmarkHref: `/forever-sim/${release}/${profile}/?i=gtrcmxeu#${deflateSync(encoded).toString("base64")}`,
        capturedAt: evidence.capturedAt,
      });
      console.log(JSON.stringify({ scenario, profile, iterations: 5000, metrics }));
    }
    snapshots.push({
      schema: "kfc-forever-tank-tier-list.v1",
      policy,
      policySha256,
      supportSha256: hash(JSON.stringify({ support, debuffs: raidBenchmarkDebuffs })),
      approvedSelection,
      entries,
      unranked: tankTierUnranked,
    });
  }
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
if (values["write-snapshot"]) {
  for (const snapshot of snapshots)
    await writeFile(
      join(root, `apps/web/src/lib/data/forever-tank-tier-list.${snapshot.policy.scenario}.json`),
      JSON.stringify(snapshot, null, 2) + "\n",
    );
}
console.log(
  JSON.stringify({
    status: "passed",
    scenarios: snapshots.length,
    measurements: snapshots.reduce((sum, snapshot) => sum + snapshot.entries.length, 0),
    evidenceDirectory: storage,
  }),
);
