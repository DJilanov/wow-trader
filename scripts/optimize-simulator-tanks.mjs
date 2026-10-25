import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { createSimulationCache } from "../infra/simulator/retained-simulation-cache.mjs";
import { legalPrebisGear, prebisContext, prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { prebisEnchantPolicy, describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import {
  tankSearchPolicy,
  tankCandidatePools,
  tankSearchGroups,
  tankGearProposals,
  tankObjectiveScore,
  tankImprovement,
  tankSearchMetric,
  admitPublishedTankSources,
  shortlistTankCandidates,
} from "../infra/simulator/tank-optimization.mjs";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    scenario: { type: "string", default: "raid" },
    objective: { type: "string", default: "both" },
    workers: { type: "string", default: "4" },
    "health-floor": { type: "string", default: "none" },
    "provisional-enchants": { type: "string", default: "include" },
    "verify-only": { type: "boolean", default: false },
  },
  strict: true,
});
const classes = { tank_warrior: 9, feral_tank_druid: 1, protection_paladin: 4 };
assert(
  Object.hasOwn(classes, values.profile),
  "Choose --profile=tank_warrior|feral_tank_druid|protection_paladin",
);
assert(["raid", "solo"].includes(values.scenario));
assert(["both", ...tankSearchPolicy.objectives].includes(values.objective));
assert(["none", "starter"].includes(values["health-floor"]), "Choose --health-floor=none|starter");
assert(["include", "exclude"].includes(values["provisional-enchants"]));
const profile = values.profile,
  scenario = values.scenario;
const base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest("hex");
const pointer = await json(join(base, "engine.json")),
  engine = await json(pointer.manifest);
assert.equal(engine.schema, "kfc-tank-search-engine.v1");
assert.equal(pointer.fingerprint, engine.fingerprint);
const directory = resolve(pointer.manifest, "..");
const data = {};
for (const key of ["database", "catalog", "imports", "inspection"]) {
  data[key] = await json(join(directory, `${key}.json`));
  assert.equal(hash(data[key]), engine.dataSha256[key], "Frozen search data changed");
}
const db = data.database,
  items = new Map(db.items.map((item) => [item.id, item]));
const craft = await json(join(root, "artifacts/forever-simulator/craft-acquisition.json"));
const sources = prebisSources(data.catalog, data.imports, craft, items);
const release = "3c62628f43a96aa1d77e702b";
const evidenceRoot = join(root, "artifacts/forever-simulator/optimization/tank-tier-list", release);
const { readdir } = await import("node:fs/promises");
const evidenceName = (await readdir(evidenceRoot)).filter((name) =>
  name.startsWith(`${scenario}-${profile}-`),
);
assert.equal(evidenceName.length, 1, "Exactly one pinned comparison request is required");
const evidence = await json(join(evidenceRoot, evidenceName[0]));
assert.equal(hash(Buffer.from(evidence.requestBase64, "base64")), evidence.requestSha256);
const settings = (await json(join(evidenceRoot, `${profile}-starter.json`))).settings;
const modelDirectory = join(root, "artifacts/forever-simulator", release);
const modelManifest = await json(join(modelDirectory, "manifest.json"));
const starterBytes = await readFile(join(modelDirectory, "kfc-tank-starters.json"));
assert.equal(hash(starterBytes), modelManifest.files["kfc-tank-starters.json"].sha256);
const starterAdmission = admitPublishedTankSources(
  sources,
  profile,
  JSON.parse(starterBytes)[profile],
  items,
);
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href);
const request = api.RaidSimRequest.fromBinary(Buffer.from(evidence.requestBase64, "base64"));
// The Bear UI saved an Alliance selector with a Tauren and only one profession.
// Use the character's real faction and make the second profession explicit.
const baseline = {
  profile,
  playerClass: classes[profile],
  settings: globalThis.structuredClone(settings),
};
const horde = ["RaceOrc", "RaceTauren", "RaceTroll", "RaceUndead", "RaceSkyborneWindshaper"];
baseline.settings.settings.faction = horde.includes(settings.player.race) ? "Horde" : "Alliance";
baseline.settings.player.profession2 ??= "Enchanting";
request.raid.parties[0].players[0].profession2 = api.IndividualSimSettings.fromJson(
  baseline.settings,
).player.profession2;
// The pinned native engine owns this exact database. Do not serialize thousands
// of items again for every gear proposal; the native runner discards that field.
request.raid.parties[0].players[0].database = undefined;
const requestBase64 = Buffer.from(api.RaidSimRequest.toBinary(request)).toString("base64");
const context = prebisContext(baseline, items),
  enchantPolicy = prebisEnchantPolicy({
    enchantPolicy: {
      schema: "kfc-enchant-model-policy.v1",
      provisionalEffectIds:
        values["provisional-enchants"] === "include" ? [36, 803, 1898, 1900] : [],
    },
  });
const original = {
  items: settings.player.equipment.items.map((item) => ({
    id: item.id ?? 0,
    ...(item.enchant ? { enchant: item.enchant } : {}),
  })),
};
assert(legalPrebisGear(original, items, sources, context), "Starting tank equipment is ineligible");
const pools = tankCandidatePools(db, sources, context);
const helpers = {};
for (const file of [
  "tank-optimization.mjs",
  "tank-starters-adapter.mjs",
  "prebis-pool.mjs",
  "prebis-enchants.mjs",
  "equipment-ownership.mjs",
  "default-enchants.mjs",
  "enchant-acquisition.mjs",
])
  helpers[file] = hash(await readFile(join(root, "infra/simulator", file)));
const inputs = {
  engine: engine.fingerprint,
  binary: engine.binarySha256,
  request: hash(requestBase64),
  craft: hash(craft),
  script: hash(await readFile(import.meta.filename)),
  helpers,
  healthFloor: values["health-floor"],
  enchantPolicy,
  starterAdmission,
  policy: tankSearchPolicy,
  candidateIdsBySlot: pools.map((pool) => pool.map((item) => item.id)),
  context: {
    profile,
    playerClass: context.playerClass,
    faction: context.factionName,
    professions: context.professions,
  },
  sourceRelease: release,
};
const fingerprint = hash(inputs),
  runDirectory = join(base, "runs", fingerprint);
await mkdir(runDirectory, { recursive: true });
const atomic = async (name, value) => {
  const path = join(runDirectory, name);
  await writeFile(path + ".pending", JSON.stringify(value, null, 2) + "\n");
  await rename(path + ".pending", path);
};
const workers = await openNativeRunners(
  engine.binary,
  engine.workspace,
  engine.binarySha256,
  Number(values.workers),
);
// Retain numerical distributions and health, without duplicating large action tables for every screened item.
const summaries = workers.map((worker) => ({
  async run(input) {
    const result = await worker.run(input);
    const metrics = Object.fromEntries(
      ["dps", "threat", "dtps", "tmi", "tto"]
        .filter((key) => result.metrics[key])
        .map((key) => [
          key,
          { avg: result.metrics[key].avg ?? 0, stdev: result.metrics[key].stdev ?? 0 },
        ]),
    );
    return { ...result, metrics };
  },
}));
const cache = await createSimulationCache(
  join(base, "cache"),
  hash({ engine: engine.fingerprint, request: hash(requestBase64), summary: 1 }),
  summaries,
);
const runBatch = async (gears, iterations, seed) => {
  const results = await cache.run(
    gears.map((gear) => ({
      requestBase64,
      gear: gear.items,
      duration: request.encounter.duration,
      iterations,
      seed,
      detail: true,
    })),
  );
  return results.map((result, index) => {
    tankSearchMetric(result, "threat");
    tankSearchMetric(result, "mitigation");
    return { ...result, gear: gears[index] };
  });
};
try {
  const starting = (await runBatch([original], 2000, tankSearchPolicy.searchSeed))[0];
  const minimumHealth = values["health-floor"] === "starter" ? starting.health : 0;
  const report = {
    schema: "kfc-tank-item-optimization.v1",
    fingerprint,
    inputs,
    profile,
    scenario,
    baseline: starting,
    minimumHealth,
    results: [],
    excludedHeroismIds: [21994, 21995, 21996, 21997, 21998, 21999, 22000, 22001],
    exclusionsNotice:
      "Heroism records exist in the client but have no reviewed Forever pre-raid acquisition. They are not silently substituted with Classic stats. Set effects and provisional item mechanics retain their engine admission limitations.",
    status: "searching",
    startedAt: new Date().toISOString(),
  };
  await atomic("inputs.json", { ...inputs, fingerprint, notice: tankSearchPolicy.notice });
  await atomic("request.json", {
    profile,
    scenario,
    requestBase64,
    requestSha256: hash(Buffer.from(requestBase64, "base64")),
    sourceRequestSha256: evidence.requestSha256,
  });
  console.log(
    `START ${profile}/${scenario}: ${starting.metrics.threat.avg.toFixed(2)} TPS / ${starting.metrics.dtps.avg.toFixed(2)} DTPS / ${starting.health} HP; pools ${pools.map((pool) => pool.length).join("/")}`,
  );
  if (values["verify-only"]) {
    console.log(
      JSON.stringify({
        status: "baseline-verified",
        runDirectory,
        metrics: {
          threat: starting.metrics.threat.avg,
          dtps: starting.metrics.dtps.avg,
          health: starting.health,
          armor: starting.armor,
        },
      }),
    );
  } else {
    const objectives =
      values.objective === "both" ? tankSearchPolicy.objectives : [values.objective];
    for (const objective of objectives) {
      const progressFile = `${objective}.checkpoint.json`;
      let current = globalThis.structuredClone(original),
        comparisons = [],
        nextPass = 0,
        nextGroup = 0,
        converged = false;
      try {
        const saved = await json(join(runDirectory, progressFile));
        assert.equal(saved.fingerprint, fingerprint);
        ({ current, comparisons, nextPass, nextGroup, converged } = saved);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const groups = tankSearchGroups(pools);
      for (let pass = nextPass; pass < tankSearchPolicy.maximumPasses && !converged; pass++) {
        const priorAccepted = comparisons.filter(
          (entry) => entry.pass === pass && entry.accepted,
        ).length;
        let acceptedInPass = priorAccepted;
        for (let index = pass === nextPass ? nextGroup : 0; index < groups.length; index++) {
          const group = groups[index],
            proposals = tankGearProposals(
              current,
              group,
              pools,
              db,
              sources,
              context,
              data.inspection,
              enchantPolicy,
            );
          if (proposals.length > 1) {
            console.log(
              `SEARCH ${objective} pass ${pass + 1} ${group.join("+")}: ${proposals.length} proposals`,
            );
            const order = (a, b) =>
              tankObjectiveScore(b, objective, minimumHealth) -
              tankObjectiveScore(a, objective, minimumHealth);
            const screened = (
              await runBatch(
                proposals,
                tankSearchPolicy.screeningIterations,
                tankSearchPolicy.searchSeed,
              )
            ).sort(order);
            const alternatives = shortlistTankCandidates(
              screened,
              objective,
              minimumHealth,
              16,
            ).filter(
              (entry) =>
                hash(entry.gear) !== hash(current) &&
                tankObjectiveScore(entry, objective, minimumHealth) > -Infinity,
            );
            const rechecked = (
              await runBatch(
                [current, ...alternatives.map((entry) => entry.gear)],
                tankSearchPolicy.shortlistIterations,
                tankSearchPolicy.searchSeed,
              )
            ).sort(order);
            const finalists = [
              current,
              ...shortlistTankCandidates(rechecked, objective, minimumHealth, 4)
                .filter((entry) => hash(entry.gear) !== hash(current))
                .map((entry) => entry.gear),
            ];
            const confirmed = await runBatch(
              finalists,
              tankSearchPolicy.selectionIterations,
              tankSearchPolicy.searchSeed,
            );
            const incumbent = confirmed[0],
              best = [...confirmed].sort(order)[0];
            const accepted = tankImprovement(best, incumbent, objective, minimumHealth);
            comparisons.push({
              pass,
              group,
              proposed: proposals.length,
              screened: screened.length,
              rechecked: rechecked.length,
              confirmed: confirmed.length,
              accepted,
              before: {
                tps: incumbent.metrics.threat.avg,
                dtps: incumbent.metrics.dtps.avg,
                health: incumbent.health,
              },
              best: {
                tps: best.metrics.threat.avg,
                dtps: best.metrics.dtps.avg,
                health: best.health,
                gear: best.gear,
              },
            });
            if (accepted) {
              current = best.gear;
              acceptedInPass++;
              console.log(
                `ACCEPT ${objective}: ${best.metrics.threat.avg.toFixed(2)} TPS / ${best.metrics.dtps.avg.toFixed(2)} DTPS / ${best.health} HP`,
              );
            }
          }
          await atomic(progressFile, {
            fingerprint,
            current,
            comparisons,
            nextPass: pass,
            nextGroup: index + 1,
            converged: false,
            stats: cache.stats,
          });
        }
        converged = acceptedInPass === 0;
        await atomic(progressFile, {
          fingerprint,
          current,
          comparisons,
          nextPass: pass + 1,
          nextGroup: 0,
          converged,
          stats: cache.stats,
        });
        console.log(
          `PASS ${objective}/${pass + 1}: ${converged ? "stable" : "continue"}; ${cache.stats.simulations} simulations / ${cache.stats.iterations} iterations`,
        );
      }
      const searchedGearDescription = describePrebisGear(
        current,
        profile,
        "tank",
        classes[profile],
        db,
        data.inspection,
        enchantPolicy,
      );
      const validation = [];
      for (const seed of tankSearchPolicy.validationSeeds) {
        const [baseline, candidate] = await runBatch(
          [original, current],
          tankSearchPolicy.validationIterations,
          seed,
        );
        validation.push({
          seed,
          baseline,
          candidate,
          accepted: tankImprovement(candidate, baseline, objective, minimumHealth, true),
        });
      }
      const accepted = validation.every((entry) => entry.accepted);
      const result = {
        objective,
        converged,
        accepted,
        gear: accepted ? current : original,
        searchedGear: current,
        searchedGearDescription,
        validation,
        comparisons,
        status: "measured-awaiting-model-and-browser-review",
      };
      report.results.push(result);
      await atomic(`${objective}.json`, result);
      console.log(`VALIDATED ${objective}: accepted=${accepted}, converged=${converged}`);
    }
    report.status = "measured-awaiting-model-and-browser-review";
    report.finishedAt = new Date().toISOString();
    report.cache = cache.stats;
    await atomic("report.json", report);
    console.log(`REPORT ${join(runDirectory, "report.json")}`);
  }
} finally {
  for (const worker of workers) worker.close();
}
