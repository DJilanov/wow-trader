import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL, URL } from "node:url";
import { parseArgs } from "node:util";
import { deflateSync, inflateSync } from "node:zlib";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import {
  currentDpsTierPolicy,
  currentDpsTierSettings,
  healerTierPolicy,
  healerTierDemand,
  poolHealingMeasurements,
  assertCurrentTankComparison,
  currentTankTierPolicy,
} from "../infra/simulator/current-tier-policy.mjs";
import { createTankTierSettings } from "../infra/simulator/tank-tier-policy.mjs";
import { tankThreatBreakdown } from "../infra/simulator/tank-threat-breakdown.mjs";
import { raidBenchmarkDebuffs } from "../infra/simulator/tier-scenarios.mjs";

const { values } = parseArgs({
  options: {
    inputs: { type: "string" },
    output: { type: "string" },
    only: { type: "string", default: "all" },
    "verify-cache": { type: "boolean", default: false },
    "write-snapshots": { type: "boolean", default: false },
  },
});
assert(values.inputs && values.output, "Choose --inputs and --output");
assert(["all", "solo", "raid", "healers", "tanks"].includes(values.only));
const root = resolve(import.meta.dirname, "..");
const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || value instanceof Uint8Array ? value : JSON.stringify(value),
    )
    .digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const inputBytes = await readFile(resolve(values.inputs));
const inputs = JSON.parse(inputBytes);
assert.equal(inputs.schema, "kfc-current-tier-inputs.v1");
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const codecPath = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codecPath)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codecPath));
const support = await json(join(root, "infra/simulator/raid-buff-defaults.v2.json"));
const encounter = (await json(join(root, "apps/web/src/lib/data/forever-dps-tier-list.raid.json")))
  .policy.encounter;
const chromium = values["verify-cache"]
  ? null
  : createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("playwright").chromium;
const browser = chromium ? await chromium.launch() : null;
let newMeasurements = 0,
  reusedMeasurements = 0;
async function verifySources() {
  for (const source of inputs.sourceBindings)
    assert.equal(
      hash(await readFile(join(inputs.root, source.path))),
      source.sha256,
      "Selected runtime changed: " + source.path,
    );
  assert.equal(
    hash(await readFile(resolve(values.inputs))),
    hash(inputBytes),
    "Tier input changed",
  );
}
async function session(directory, manifest, healing = false) {
  const server = await startSimulatorLocalServer(directory, manifest);
  const page = await browser.newPage({ extraHTTPHeaders: { DNT: "1", "Sec-GPC": "1" } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(server.origin + "/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Private tier measurement</title>",
    }),
  );
  await page.goto(server.origin + "/");
  await page.evaluate(
    async ({ url, healing }) => {
      const worker = new globalThis.Worker(url);
      globalThis.__tierWorker = worker;
      await new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
          () => reject(Error("Tier worker initialization timed out")),
          60000,
        );
        worker.onerror = (event) => {
          globalThis.clearTimeout(timer);
          reject(Error(event.message));
        };
        worker.onmessage = ({ data }) => {
          globalThis.clearTimeout(timer);
          if (healing ? data.type === "ready" : data.msg === "ready" && data.outputData[0] === 1)
            resolve();
          else reject(Error(data.error ?? "A real WASM engine is required"));
        };
      });
      globalThis.__tierCall = (kind, payload) =>
        new Promise((resolve, reject) => {
          const timer = globalThis.setTimeout(
            () => reject(Error("Tier measurement timed out")),
            300000,
          );
          worker.onerror = (event) => {
            globalThis.clearTimeout(timer);
            reject(Error(event.message));
          };
          worker.onmessage = ({ data }) => {
            if (healing && data.type === "started") return;
            if (healing && data.type === "fatal") {
              globalThis.clearTimeout(timer);
              reject(Error(data.error));
              return;
            }
            if (healing ? data.type !== "result" : data.msg !== kind) return;
            globalThis.clearTimeout(timer);
            resolve(healing ? data.reply : Array.from(data.outputData));
          };
          worker.postMessage(
            healing
              ? { type: "run", job: payload }
              : { id: "current-tier", msg: kind, inputData: Uint8Array.from(payload) },
          );
        });
    },
    {
      url: `/forever-sim/${manifest.release}/${healing ? "healing-worker.js" : "sim_worker.js"}`,
      healing,
    },
  );
  return {
    page,
    async close() {
      await page.close();
      await server.close();
      assert.deepEqual(errors, []);
    },
  };
}
async function measured(key, request, identity, run) {
  const path = join(output, key + "-" + hash({ request, identity }).slice(0, 24) + ".json");
  let saved;
  try {
    saved = await json(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (saved) {
    assert.equal(saved.requestSha256, hash(request));
    assert.equal(saved.identitySha256, hash(identity));
    assert.equal(saved.resultSha256, hash(saved.result));
    reusedMeasurements++;
    return saved;
  }
  assert(!values["verify-cache"], "Missing exact cached measurement: " + key);
  const result = await run();
  newMeasurements++;
  saved = {
    schema: "kfc-current-tier-measurement.v1",
    capturedAt: new Date().toISOString(),
    request,
    requestSha256: hash(request),
    identity,
    identitySha256: hash(identity),
    result,
    resultSha256: hash(result),
  };
  await writeFile(path, JSON.stringify(saved, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return saved;
}
async function snapshot(name, value) {
  await verifySources();
  await writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
  if (values["write-snapshots"])
    await writeFile(
      join(root, "apps/web/src/lib/data", name),
      JSON.stringify(value, null, 2) + "\n",
    );
}
try {
  await verifySources();
  for (const scenario of ["solo", "raid"].filter(
    (value) => values.only === "all" || values.only === value,
  )) {
    const policy = currentDpsTierPolicy(scenario, support, encounter),
      policySha256 = hash(policy),
      entries = [];
    for (const group of inputs.combat.filter((entry) => entry.role === "damage")) {
      const manifest = group.manifest,
        rawDatabase = await json(join(inputs.root, manifest.release, "assets/database/db.json"));
      // Public catalogs include tooltip/provenance fields outside the combat protobuf.
      const database = api.RaidSimRequest.toJson(
        api.RaidSimRequest.fromJson(
          { raid: { parties: [{ players: [{ database: rawDatabase }] }] } },
          { ignoreUnknownFields: true },
        ),
      ).raid.parties[0].players[0].database;
      let worker;
      try {
        for (const build of group.builds) {
          const original = api.IndividualSimSettings.fromBinary(
            inflateSync(
              Buffer.from(new URL(build.href, "http://localhost").hash.slice(1), "base64"),
            ),
          );
          const decoded = api.IndividualSimSettings.toJson(original);
          assert.deepEqual(
            api.IndividualSimSettings.toBinary(api.IndividualSimSettings.fromJson(decoded)),
            api.IndividualSimSettings.toBinary(original),
            "Codec would discard current settings: " + build.id,
          );
          const settings = currentDpsTierSettings(
            decoded,
            encounter,
            support,
            scenario,
            group.profile,
            build.id,
          );
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
              simOptions: { iterations: 5000, randomSeed: "58723001", ruleset: 1 },
            },
            { ignoreUnknownFields: false },
          );
          const bytes = api.RaidSimRequest.toBinary(request);
          const identity = {
            release: manifest.release,
            wasmSha256: manifest.files["lib.wasm"].sha256,
            policySha256,
            sourceHrefSha256: hash(build.href),
            databaseSha256: manifest.files["assets/database/db.json"].sha256,
          };
          const evidence = await measured(
            `${scenario}-${build.id}`,
            Buffer.from(bytes).toString("base64"),
            identity,
            async () => {
              worker ??= await session(inputs.root, manifest);
              const stats = api.ComputeStatsRequest.toBinary(
                api.ComputeStatsRequest.create({
                  raid: request.raid,
                  encounter: request.encounter,
                  ruleset: 1,
                }),
              );
              const admitted = api.ComputeStatsResult.fromBinary(
                Uint8Array.from(
                  await worker.page.evaluate(
                    (payload) => globalThis.__tierCall("computeStats", payload),
                    Array.from(stats),
                  ),
                ),
              );
              assert(!admitted.errorResult?.message, admitted.errorResult?.message);
              const player = admitted.raidStats.parties[0].players[0];
              assert.deepEqual(
                [
                  ...player.rotationStats.priorityList,
                  ...player.rotationStats.prepullActions,
                ].flatMap((row) => row.warnings),
                [],
                "Invalid current APL: " + build.id,
              );
              return await worker.page.evaluate(
                (payload) => globalThis.__tierCall("raidSim", payload),
                Array.from(bytes),
              );
            },
          );
          const result = api.RaidSimResult.fromBinary(Uint8Array.from(evidence.result));
          assert(!result.error?.message, result.error?.message);
          assert.equal(result.iterationsDone, 5000);
          assert.equal(result.avgIterationDuration, 300);
          const metric = result.raidMetrics.parties[0].players[0].dps;
          assert(metric.avg > 0 && Number.isFinite(metric.stdev));
          const canonical = api.IndividualSimSettings.toBinary(
            api.IndividualSimSettings.fromJson({
              ...settings,
              settings: {
                ...settings.settings,
                iterations: 5000,
                fixedRngSeed: "58723001",
                ruleset: 1,
              },
            }),
          );
          entries.push({
            scenario,
            policySha256,
            id: build.id,
            profile: group.profile,
            spec: build.spec,
            name: build.displayName ?? build.spec.split("/")[1],
            faction: build.faction,
            dps: metric.avg,
            stdev: metric.stdev,
            iterations: 5000,
            talents: settings.player.talentsString,
            race: settings.player.race,
            release: manifest.release,
            revision: manifest.revision,
            databaseSha256: identity.databaseSha256,
            wasmSha256: identity.wasmSha256,
            publicationSha256: group.publication.sha256,
            originalHrefSha256: hash(build.href),
            requestSha256: hash(bytes),
            responseSha256: hash(Uint8Array.from(evidence.result)),
            benchmarkHref: `/forever-sim/${manifest.release}/${group.profile}/?i=gtrcmxeu#${deflateSync(Buffer.from(canonical)).toString("base64")}`,
            capturedAt: evidence.capturedAt,
          });
          console.log(`${scenario} ${build.id}: ${metric.avg.toFixed(2)} DPS`);
        }
      } finally {
        await worker?.close();
      }
    }
    assert.equal(entries.length, 25);
    await snapshot(`forever-dps-tier-list.current.${scenario}.json`, {
      schema: "kfc-forever-dps-tier-list.v1",
      sourceBindings: inputs.sourceBindings,
      sourcePublications: Object.fromEntries(
        inputs.combat
          .filter((entry) => entry.role === "damage")
          .map((entry) => [entry.profile, entry.publication]),
      ),
      policySha256,
      policy,
      entries,
    });
  }
  if (["all", "healers"].includes(values.only)) {
    const entries = [];
    for (const group of inputs.healers) {
      let worker;
      const directory = join(inputs.root, group.relativeDirectory);
      try {
        for (const build of group.builds) {
          const results = [],
            proofs = [],
            demand = healerTierDemand(build.assignment);
          let originalJob = globalThis.structuredClone(build.job);
          if (build.codecInput) {
            const { createJob } = await import(
              pathToFileURL(join(directory, group.manifest.release, "request-codec.js"))
            );
            originalJob = createJob({
              ...build.codecInput,
              id: "tier-source",
              iterations: 256,
              seed: 58723001,
            });
          }
          for (const seed of healerTierPolicy.seeds) {
            const request = api.RaidSimRequest.fromBinary(
              Buffer.from(originalJob.requestBase64, "base64"),
            );
            request.simOptions.iterations = 256;
            request.simOptions.randomSeed = BigInt(seed);
            request.encounter.duration = 180;
            request.encounter.durationVariation = 0;
            const job = globalThis.structuredClone(originalJob);
            job.id = "tier-" + hash({ profile: group.profile, id: build.id, seed }).slice(0, 32);
            job.requestBase64 = Buffer.from(api.RaidSimRequest.toBinary(request)).toString(
              "base64",
            );
            job.detail = false;
            const workload =
              group.profile === "healing-shaman" ? job.workload.workload : job.workload;
            Object.assign(workload, {
              name: `shared-tier-${build.assignment}-180s`,
              targets: demand.targets,
              damage: demand.damage,
            });
            const identity = {
              profile: group.profile,
              release: group.manifest.release,
              modelIdentity: group.manifest.modelIdentity,
              wasmSha256: group.manifest.files["healing.wasm"].sha256,
              policySha256: hash(healerTierPolicy),
              demandSha256: hash(demand),
              sourceBuild: build.id,
            };
            const evidence = await measured(
              `healer-${group.profile}-${build.assignment}-${hash(build.id).slice(0, 10)}-${seed}`,
              job,
              identity,
              async () => {
                worker ??= await session(directory, group.manifest, true);
                return await worker.page.evaluate(
                  (payload) => globalThis.__tierCall("healing", payload),
                  job,
                );
              },
            );
            const reply = evidence.result;
            assert.equal(reply.status, "complete", JSON.stringify(reply.error));
            assert.equal(reply.id, job.id);
            const result = reply.result;
            assert.equal(result.iterations, 256);
            assert(result.survivalRate >= 0 && result.survivalRate <= 1);
            assert(Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) < 1e-6);
            const planned = demand.damage.reduce((sum, event) => sum + event.amount, 0);
            assert.equal(result.plannedIncomingPostMitigationDamage, planned);
            results.push(result);
            proofs.push({
              requestSha256: evidence.requestSha256,
              responseSha256: evidence.resultSha256,
              capturedAt: evidence.capturedAt,
            });
          }
          const metrics = poolHealingMeasurements(results);
          entries.push({
            id: group.profile + "-" + hash(build.id).slice(0, 16),
            profile: group.profile,
            buildId: build.id,
            title: build.title,
            archetype: build.archetype,
            assignment: build.assignment,
            release: group.manifest.release,
            modelIdentity: group.manifest.modelIdentity,
            wasmSha256: group.manifest.files["healing.wasm"].sha256,
            sourceWorkloadSha256: hash(build.job),
            demandSha256: hash(demand),
            simulatorHref: build.href,
            metrics,
            proofs,
          });
          console.log(
            `healer ${group.profile} ${build.archetype} ${build.assignment}: ${metrics.hps.toFixed(2)} useful HPS / ${(metrics.survivalRate * 100).toFixed(1)}% survival`,
          );
        }
      } finally {
        await worker?.close();
      }
    }
    for (const assignment of ["tank", "group", "burst"])
      assert.equal(
        new Set(
          entries.filter((entry) => entry.assignment === assignment).map((entry) => entry.profile),
        ).size,
        4,
        "Every assignment needs all four healers",
      );
    await snapshot("forever-healer-tier-list.json", {
      schema: "kfc-forever-healer-tier-list.v1",
      sourceBindings: inputs.sourceBindings,
      policy: healerTierPolicy,
      policySha256: hash(healerTierPolicy),
      capturedAt: entries
        .flatMap((entry) => entry.proofs.map((proof) => proof.capturedAt))
        .sort()
        .at(-1),
      entries,
    });
  }
  if (["all", "tanks"].includes(values.only)) {
    for (const scenario of ["solo", "raid"]) {
      const policy = currentTankTierPolicy(scenario);
      const entries = [];
      for (const group of inputs.combat.filter((entry) => entry.role === "tank")) {
        const { manifest } = group;
        const proofPath = join(inputs.root, manifest.release, "kfc-qualified-tank-model.json");
        const proofBytes = await readFile(proofPath),
          proof = JSON.parse(proofBytes);
        assert.equal(hash(proofBytes), manifest.files["kfc-qualified-tank-model.json"].sha256);
        const native = await json(
          join(inputs.root, manifest.release, "kfc-tank-native-builds.json"),
        );
        const database = await json(join(inputs.root, manifest.release, "assets/database/db.json"));
        let worker;
        try {
          for (const objective of ["threat", "mitigation"]) {
            const matches = proof.builds.filter(
              (build) =>
                build.scenario === scenario &&
                build.objective === objective &&
                !build.requiresProvisionalEnchantOptIn,
            );
            assert.equal(matches.length, 1);
            const row = matches[0];
            const published = group.builds.find((build) => build.id === row.id);
            assert(published);
            assert.equal(published.href, row.href);
            const originalSettings = api.IndividualSimSettings.toJson(
              api.IndividualSimSettings.fromBinary(
                inflateSync(
                  Buffer.from(new URL(row.href, "http://localhost").hash.slice(1), "base64"),
                ),
              ),
            );
            const settings = createTankTierSettings(
              originalSettings,
              scenario,
              group.profile,
              support,
              raidBenchmarkDebuffs,
            );
            assertCurrentTankComparison(settings, scenario, group.profile, support);
            const preset = native.builds.find((build) => build.id === row.id);
            assert(preset);
            assert.deepEqual(preset.reference, row.reference);
            assert.equal(row.reference.iterations, 40000);
            const actualGear = settings.player.equipment.items;
            assert.deepEqual(
              actualGear.map((item) => ({
                id: item.id ?? 0,
                ...(item.enchant ? { enchant: item.enchant } : {}),
              })),
              row.gear.items.map((item) => ({
                id: item.id ?? 0,
                ...(item.enchant ? { enchant: item.enchant } : {}),
              })),
            );
            const combatDatabase = api.RaidSimRequest.toJson(
              api.RaidSimRequest.fromJson(
                { raid: { parties: [{ players: [{ database }] }] } },
                { ignoreUnknownFields: true },
              ),
            ).raid.parties[0].players[0].database;
            const request = api.RaidSimRequest.fromJson(
              {
                raid: {
                  parties: [
                    {
                      players: [{ ...settings.player, database: combatDatabase }],
                      buffs: settings.partyBuffs,
                    },
                  ],
                  buffs: settings.raidBuffs,
                  debuffs: settings.debuffs,
                  tanks: settings.tanks,
                  numActiveParties: 1,
                },
                encounter: settings.encounter,
                simOptions: { iterations: 5000, randomSeed: "61723001", ruleset: 1 },
              },
              { ignoreUnknownFields: false },
            );
            const bytes = api.RaidSimRequest.toBinary(request);
            const evidence = await measured(
              `tank-${scenario}-${row.id}`,
              Buffer.from(bytes).toString("base64"),
              {
                release: manifest.release,
                wasmSha256: manifest.files["lib.wasm"].sha256,
                sourceHrefSha256: hash(row.href),
                policySha256: hash(policy),
              },
              async () => {
                worker ??= await session(inputs.root, manifest);
                const stats = api.ComputeStatsResult.fromBinary(
                  Uint8Array.from(
                    await worker.page.evaluate(
                      (payload) => globalThis.__tierCall("computeStats", payload),
                      Array.from(
                        api.ComputeStatsRequest.toBinary(
                          api.ComputeStatsRequest.create({
                            raid: request.raid,
                            encounter: request.encounter,
                            ruleset: 1,
                          }),
                        ),
                      ),
                    ),
                  ),
                );
                assert(!stats.errorResult?.message, stats.errorResult?.message);
                const rotation = stats.raidStats.parties[0].players[0].rotationStats;
                assert.deepEqual(
                  [...rotation.priorityList, ...rotation.prepullActions].flatMap(
                    (action) => action.warnings,
                  ),
                  [],
                );
                return await worker.page.evaluate(
                  (payload) => globalThis.__tierCall("raidSim", payload),
                  Array.from(bytes),
                );
              },
            );
            const result = api.RaidSimResult.fromBinary(Uint8Array.from(evidence.result));
            assert(!result.error?.message, result.error?.message);
            assert.equal(result.iterationsDone, 5000);
            assert.equal(result.avgIterationDuration, policy.durationSeconds);
            const player = result.raidMetrics.parties[0].players[0];
            const metrics = { dps: player.dps, threat: player.threat, dtps: player.dtps };
            const cleanMetrics = Object.fromEntries(
              Object.entries(metrics).map(([name, metric]) => [
                name,
                { avg: metric.avg, stdev: metric.stdev },
              ]),
            );
            const breakdown = tankThreatBreakdown(
              api.RaidSimResult.toJson(result).raidMetrics.parties[0].players[0],
              database,
              5000,
              policy.durationSeconds,
            );
            const canonical = api.IndividualSimSettings.toBinary(
              api.IndividualSimSettings.fromJson({
                ...settings,
                settings: {
                  ...settings.settings,
                  iterations: 5000,
                  fixedRngSeed: "61723001",
                  ruleset: 1,
                },
              }),
            );
            entries.push({
              id: group.profile.replaceAll("_", "-"),
              profile: group.profile,
              release: manifest.release,
              objective,
              iterations: 5000,
              metrics: cleanMetrics,
              threatBreakdown: breakdown,
              health: row.reference.health,
              armor: row.reference.armor,
              talents: settings.player.talentsString,
              race: settings.player.race,
              manifestSha256: hash(
                await readFile(join(inputs.root, manifest.release, "manifest.json")),
              ),
              wasmSha256: manifest.files["lib.wasm"].sha256,
              databaseSha256: manifest.files["assets/database/db.json"].sha256,
              proofSha256: hash(proofBytes),
              settingsSha256: hash(settings),
              benchmarkHref: `/forever-sim/${manifest.release}/${group.profile}/?i=gtrcmxeu#${deflateSync(Buffer.from(canonical)).toString("base64")}`,
              capturedAt: evidence.capturedAt,
              warnings: preset.warnings,
              gear: actualGear.map((equipped, slot) => {
                const item = database.items.find((item) => item.id === equipped.id),
                  enchant = equipped.enchant
                    ? database.enchants.find(
                        (entry) => (entry.effectId ?? entry.id) === equipped.enchant,
                      )
                    : null;
                return {
                  slot,
                  id: equipped.id ?? 0,
                  name: item?.name ?? (equipped.id ? `Item ${equipped.id}` : "Empty"),
                  enchant:
                    enchant?.name ?? (equipped.enchant ? `Enchant ${equipped.enchant}` : null),
                  provisionalSource: item?.source?.status === "classic-provisional",
                };
              }),
            });
            console.log(
              `tank ${scenario} ${row.id}: ${player.threat.avg.toFixed(2)} TPS / ${player.dtps.avg.toFixed(2)} DTPS`,
            );
          }
        } finally {
          await worker?.close();
        }
      }
      assert.equal(entries.length, 6);
      await snapshot(`forever-tank-tier-list.current.${scenario}.json`, {
        schema: "kfc-forever-tank-tier-list.v4",
        sourceBindings: inputs.sourceBindings,
        policy,
        policySha256: hash(policy),
        supportSha256: hash({ support, debuffs: raidBenchmarkDebuffs }),
        entries,
      });
    }
  }
} finally {
  await browser?.close();
}
await verifySources();
console.log(
  JSON.stringify({
    status: "passed",
    only: values.only,
    sourceBindings: inputs.sourceBindings.length,
    newMeasurements,
    reusedMeasurements,
    output,
  }),
);
