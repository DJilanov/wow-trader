import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL, URL } from "node:url";
import { inflateSync, deflateSync } from "node:zlib";
import process from "node:process";
import console from "node:console";
import { parseArgs } from "node:util";
import {
  createTierBenchmarkSettings,
  tierBenchmarkPolicy,
} from "../infra/simulator/tier-benchmark.mjs";
import {
  createTierScenarioSettings,
  tierScenarioPolicy,
} from "../infra/simulator/tier-scenarios.mjs";

const root = resolve(import.meta.dirname, "..");
const { values, positionals } = parseArgs({
  options: {
    "write-snapshot": { type: "boolean", default: false },
    "verify-cache": { type: "boolean", default: false },
    scenario: { type: "string" },
    "artifact-root": { type: "string" },
  },
  strict: true,
  allowPositionals: false,
});
assert.equal(positionals.length, 0);
const scenario = values.scenario;
assert(
  scenario === undefined || ["solo", "raid"].includes(scenario),
  "Choose --scenario=solo or --scenario=raid",
);
const storage = resolve(values["artifact-root"] ?? join(root, "artifacts/forever-simulator"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const origin = new URL(process.env.SIMULATOR_TEST_URL ?? "http://127.0.0.1:3334/tools");
assert(
  ["localhost", "127.0.0.1"].includes(origin.hostname),
  "Benchmarks run against a loopback preview only",
);
const codecPath =
  "optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs";
assert.equal(
  hash(await readFile(join(storage, codecPath))),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(join(storage, codecPath)).href);
const pointerBytes = await readFile(join(storage, "published-reviews.json"));
const pointer = JSON.parse(pointerBytes);
assert.equal(pointer.schema, "kfc-published-simulator-reviews.v1");
let standardBuildCount = 0;
for (const [profile, reference] of Object.entries(pointer.profiles)) {
  assert(/^[a-z_]+$/.test(profile));
  assert(/^[a-f0-9]{64}$/.test(reference.sha256));
  assert.equal(
    reference.path,
    `published-reviews/${profile}-${reference.sha256.slice(0, 16)}.json`,
  );
  const publication = await json(join(storage, reference.path));
  assert.equal(hash(JSON.stringify(publication)), reference.sha256);
  assert.equal(publication.profile, profile);
  standardBuildCount += publication.builds.filter(
    (build) => !build.requiresProvisionalEnchantOptIn,
  ).length;
}
assert.equal(
  standardBuildCount,
  21,
  "This release measures only the 21 publicly replayable standard builds",
);
assert.equal(Object.keys(pointer.profiles).length, 11, "Published profile coverage changed");
const support = await json(join(root, "infra/simulator/raid-buff-defaults.v2.json"));
const anchor = await json(join(storage, pointer.profiles.smite_priest.path));
const decode = (href) =>
  api.IndividualSimSettings.toJson(
    api.IndividualSimSettings.fromBinary(
      inflateSync(Buffer.from(new URL(href, origin).hash.slice(1), "base64")),
    ),
  );
const encounter = decode(anchor.builds[0].href).encounter;
const policy = {
  ...(scenario ? tierScenarioPolicy(scenario, support) : { ...tierBenchmarkPolicy, support }),
  encounter,
  ...(scenario ? {} : { externalDebuffs: "none; self-applied class effects remain" }),
  playerEquipmentTalentsRaceConsumes: "retained from each published reviewed build",
};
const policySha256 = hash(JSON.stringify(policy));
const directory = join(storage, "optimization/tier-list", policySha256.slice(0, 16));
await mkdir(directory, { recursive: true });
const chromium = values["verify-cache"]
  ? null
  : createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("playwright").chromium;
const browser = chromium ? await chromium.launch() : null;
const entries = [];
let newMeasurements = 0;
let reusedMeasurements = 0;
try {
  for (const [profile, reference] of Object.entries(pointer.profiles)) {
    const publication = await json(join(storage, reference.path));
    assert.equal(hash(JSON.stringify(publication)), reference.sha256);
    const release = publication.presentationRelease;
    const manifest = await json(join(storage, release, "manifest.json"));
    const dbBytes = await readFile(join(storage, release, "assets/database/db.json"));
    assert.equal(hash(dbBytes), manifest.files["assets/database/db.json"].sha256);
    assert.equal(
      hash(await readFile(join(storage, release, "lib.wasm"))),
      manifest.files["lib.wasm"].sha256,
    );
    const database = JSON.parse(dbBytes);
    const page = browser
      ? await browser.newPage({ extraHTTPHeaders: { DNT: "1", "Sec-GPC": "1" } })
      : null;
    const errors = [];
    if (page) {
      await page.addInitScript(() => {
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      });
      await page.route(origin.origin + "/forever-sim/**", async (route) => {
        const url = new URL(route.request().url());
        url.pathname = origin.pathname.replace(/\/$/, "") + url.pathname;
        const response = await globalThis.fetch(url);
        assert.equal(response.status, 200, url.href);
        const body = Buffer.from(await response.arrayBuffer());
        const headers = Object.fromEntries(response.headers);
        delete headers["content-length"];
        delete headers["content-encoding"];
        assert.equal(headers.etag, `"${hash(body)}"`, "Simulator asset integrity");
        await route.fulfill({ status: 200, headers, body });
      });
      page.on("pageerror", (error) => errors.push(error.message));
    }
    try {
      if (page) {
        assert(
          (
            await page.goto(
              `${origin.href.replace(/\/$/, "")}/forever-sim/${release}/${profile}/`,
              {
                waitUntil: "domcontentloaded",
              },
            )
          )?.ok(),
        );
        await page.evaluate(async (url) => {
          const worker = new globalThis.Worker(url);
          globalThis.__tierWorker = worker;
          await new Promise((resolve, reject) => {
            const timer = globalThis.setTimeout(
              () => reject(new Error("WASM worker did not become ready")),
              60000,
            );
            worker.onerror = (event) => reject(new Error(event.message));
            worker.onmessage = ({ data }) => {
              globalThis.clearTimeout(timer);
              if (data.msg === "ready" && data.outputData[0] === 1) resolve();
              else reject(new Error("Actual WASM engine required"));
            };
          });
          globalThis.__tierCall = (id, kind, bytes) =>
            new Promise((resolve, reject) => {
              const timer = globalThis.setTimeout(
                () => reject(new Error("Benchmark worker timed out")),
                300000,
              );
              worker.onerror = (event) => reject(new Error(event.message));
              worker.onmessage = ({ data }) => {
                if (data.msg !== kind || data.id !== id) return;
                globalThis.clearTimeout(timer);
                resolve(Array.from(data.outputData));
              };
              worker.postMessage({ id, msg: kind, inputData: Uint8Array.from(bytes) });
            });
        }, `/forever-sim/${release}/sim_worker.js`);
      }
      for (const build of publication.builds.filter(
        (build) => !build.requiresProvisionalEnchantOptIn,
      )) {
        const settings = scenario
          ? createTierScenarioSettings(decode(build.href), encounter, support, scenario, profile)
          : createTierBenchmarkSettings(decode(build.href), encounter, support);
        if (scenario) {
          api.RaidSimRequest.fromJson(
            {
              raid: {
                buffs: settings.raidBuffs,
                debuffs: settings.debuffs,
                parties: [
                  { buffs: settings.partyBuffs, players: [{ buffs: settings.player.buffs }] },
                ],
              },
            },
            { ignoreUnknownFields: false },
          );
        }
        const request = api.RaidSimRequest.fromJson(
          {
            raid: {
              parties: [
                { players: [{ ...settings.player, database }], buffs: settings.partyBuffs },
              ],
              buffs: settings.raidBuffs,
              debuffs: settings.debuffs,
              numActiveParties: 1,
            },
            encounter: settings.encounter,
            simOptions: {
              iterations: tierBenchmarkPolicy.iterations,
              randomSeed: String(tierBenchmarkPolicy.seed),
              ruleset: 1,
            },
          },
          { ignoreUnknownFields: true },
        );
        const bytes = api.RaidSimRequest.toBinary(request);
        const requestSha256 = hash(bytes);
        const saved = join(directory, `${build.id}-${requestSha256.slice(0, 16)}.json`);
        let evidence;
        try {
          evidence = await json(saved);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (!evidence) {
          assert(page, "Missing cache: --verify-cache never starts new simulations");
          newMeasurements++;
          const statsBytes = api.ComputeStatsRequest.toBinary(
            api.ComputeStatsRequest.create({
              raid: request.raid,
              encounter: request.encounter,
              ruleset: 1,
            }),
          );
          const admitted = api.ComputeStatsResult.fromBinary(
            Uint8Array.from(
              await page.evaluate(
                ({ id, bytes }) => globalThis.__tierCall(id, "computeStats", bytes),
                { id: build.id, bytes: Array.from(statsBytes) },
              ),
            ),
          );
          assert(!admitted.errorResult?.message, admitted.errorResult?.message);
          const players = admitted.raidStats.parties
            .flatMap((party) => party.players)
            .filter((player) => player.rotationStats);
          assert.equal(players.length, 1);
          const warnings = [
            ...players[0].rotationStats.priorityList,
            ...players[0].rotationStats.prepullActions,
          ].flatMap((entry) => entry.warnings);
          assert.deepEqual(warnings, [], "Invalid benchmark rotation: " + build.id);
          const response = Uint8Array.from(
            await page.evaluate(({ id, bytes }) => globalThis.__tierCall(id, "raidSim", bytes), {
              id: build.id,
              bytes: Array.from(bytes),
            }),
          );
          const result = api.RaidSimResult.fromBinary(response);
          assert(!result.error?.message, result.error?.message);
          assert.equal(result.iterationsDone, tierBenchmarkPolicy.iterations);
          assert.equal(result.avgIterationDuration, tierBenchmarkPolicy.durationSeconds);
          const metric = result.raidMetrics.parties[0].players[0].dps;
          assert(
            Number.isFinite(metric.avg) &&
              metric.avg > 0 &&
              Number.isFinite(metric.stdev) &&
              metric.stdev >= 0,
          );
          evidence = {
            schema: "kfc-tier-list-browser-measurement.v1",
            id: build.id,
            policySha256,
            publicationSha256: reference.sha256,
            originalHrefSha256: hash(build.href),
            requestSha256,
            requestBase64: Buffer.from(bytes).toString("base64"),
            responseSha256: hash(response),
            responseBase64: Buffer.from(response).toString("base64"),
            dps: metric.avg,
            stdev: metric.stdev,
            iterations: tierBenchmarkPolicy.iterations,
            capturedAt: new Date().toISOString(),
          };
          await writeFile(saved, JSON.stringify(evidence, null, 2) + "\n", {
            flag: "wx",
            mode: 0o600,
          });
        } else {
          reusedMeasurements++;
        }
        assert.equal(evidence.schema, "kfc-tier-list-browser-measurement.v1");
        assert.equal(evidence.id, build.id);
        assert.equal(evidence.policySha256, policySha256);
        assert.equal(evidence.originalHrefSha256, hash(build.href));
        assert.equal(evidence.requestSha256, requestSha256);
        assert.equal(evidence.requestBase64, Buffer.from(bytes).toString("base64"));
        assert.equal(evidence.publicationSha256, reference.sha256);
        const raw = Buffer.from(evidence.responseBase64, "base64");
        assert.equal(hash(raw), evidence.responseSha256);
        const verifiedResult = api.RaidSimResult.fromBinary(raw);
        assert.equal(verifiedResult.iterationsDone, tierBenchmarkPolicy.iterations);
        assert.equal(verifiedResult.avgIterationDuration, tierBenchmarkPolicy.durationSeconds);
        const metric = verifiedResult.raidMetrics.parties[0].players[0].dps;
        assert.equal(metric.avg, evidence.dps);
        assert.equal(metric.stdev, evidence.stdev);
        const canonical = api.IndividualSimSettings.toBinary(
          api.IndividualSimSettings.fromJson({
            ...settings,
            settings: {
              ...settings.settings,
              iterations: tierBenchmarkPolicy.iterations,
              fixedRngSeed: String(tierBenchmarkPolicy.seed),
              ruleset: 1,
            },
          }),
        );
        entries.push({
          ...(scenario ? { scenario, policySha256 } : {}),
          id: build.id,
          profile,
          spec: build.spec,
          name: build.displayName ?? build.spec.split("/")[1],
          faction: build.faction,
          dps: evidence.dps,
          stdev: evidence.stdev,
          iterations: evidence.iterations,
          talents: settings.player.talentsString,
          race: settings.player.race,
          release,
          revision: manifest.revision,
          databaseSha256: hash(dbBytes),
          wasmSha256: manifest.files["lib.wasm"].sha256,
          publicationSha256: reference.sha256,
          originalHrefSha256: hash(build.href),
          requestSha256,
          responseSha256: evidence.responseSha256,
          benchmarkHref: `/forever-sim/${release}/${profile}/${scenario ? "?i=gtrcmxeu" : ""}#${deflateSync(Buffer.from(canonical)).toString("base64")}`,
          capturedAt: evidence.capturedAt,
        });
        console.error(
          `[tier benchmark] ${build.id}: ${evidence.dps.toFixed(2)} DPS / ${evidence.iterations} fights`,
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      if (page) {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await page.close();
      }
    }
  }
} finally {
  await browser?.close();
}
assert.deepEqual(
  await readFile(join(storage, "published-reviews.json")),
  pointerBytes,
  "Publication changed during benchmark",
);
assert.equal(
  entries.length,
  21,
  "Expected all 21 non-provisional reviewed builds; review coverage before changing this count",
);
const snapshot = { schema: "kfc-forever-dps-tier-list.v1", policySha256, policy, entries };
const output = join(
  root,
  `apps/web/src/lib/data/forever-dps-tier-list${scenario ? "." + scenario : ""}.json`,
);
const serialized = JSON.stringify(snapshot, null, 2) + "\n";
let previous;
try {
  previous = await readFile(output, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (previous !== serialized) {
  if (previous !== undefined) {
    assert(
      values["write-snapshot"],
      "Snapshot differs; review coverage and use --write-snapshot to publish the new measurements",
    );
    const archive = join(directory, `previous-snapshot-${hash(previous).slice(0, 16)}.json`);
    try {
      await writeFile(archive, previous, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      assert.equal(await readFile(archive, "utf8"), previous);
    }
  }
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, serialized, { flag: "wx" });
  await rename(temporary, output);
}
console.log(
  JSON.stringify({
    status: "measured",
    entries: entries.length,
    iterations: entries.length * tierBenchmarkPolicy.iterations,
    newIterations: newMeasurements * tierBenchmarkPolicy.iterations,
    reusedMeasurements,
    verificationOnly: values["verify-cache"],
    policySha256,
  }),
);
