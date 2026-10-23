import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import { createHash } from "node:crypto";
import { prebisSources, prebisContext, legalPrebisGear } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import {
  tankSearchPolicy,
  tankCandidatePools,
  tankSearchGroups,
  tankGearProposals,
  tankObjectiveScore,
  tankImprovement,
  shortlistTankCandidates,
  admitPublishedTankSources,
} from "../infra/simulator/tank-optimization.mjs";
import {
  tankEvidenceFingerprint,
  tankEvidenceInput,
  readTankEvidence,
} from "../infra/simulator/tank-evidence.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({ options: { report: { type: "string" } }, strict: true });
assert(values.report, "Pass --report=<completed report.json>");
const reportPath = await realpath(resolve(root, values.report));
const offset = relative(await realpath(join(base, "runs")), reportPath);
assert(
  offset && offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset),
  "Report escaped tank research storage",
);
const parts = offset.split(sep);
assert.equal(parts.length, 2);
assert.equal(parts[1], "report.json");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const bytesHash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const report = await json(reportPath),
  inputs = report.inputs;
assert(/^[a-f0-9]{64}$/.test(inputs.engine));
assert(/^[a-f0-9]{24}$/.test(inputs.sourceRelease));
assert.equal(report.schema, "kfc-tank-item-optimization.v1");
assert.equal(report.status, "measured-awaiting-model-and-browser-review");
assert.equal(hash(inputs), report.fingerprint);
assert.equal(parts[0], report.fingerprint);
assert.equal(report.profile, inputs.context.profile);
assert.deepEqual(inputs.policy, tankSearchPolicy, "Replay requires the original search policy");
assert.deepEqual(
  Object.keys(inputs.helpers).sort(),
  [
    "tank-optimization.mjs",
    "tank-starters-adapter.mjs",
    "prebis-pool.mjs",
    "prebis-enchants.mjs",
    "equipment-ownership.mjs",
    "default-enchants.mjs",
    "enchant-acquisition.mjs",
  ].sort(),
  "Unexpected replay source reference",
);
for (const [name, sha256] of Object.entries(inputs.helpers))
  assert.equal(
    bytesHash(await readFile(join(root, "infra/simulator", name))),
    sha256,
    "Replay requires original helper source: " + name,
  );
assert.equal(
  bytesHash(await readFile(join(root, "scripts/optimize-simulator-tanks.mjs"))),
  inputs.script,
);
const engineDirectory = join(base, "engines", inputs.engine),
  engine = await json(join(engineDirectory, "manifest.json"));
assert.equal(engine.fingerprint, inputs.engine);
assert.equal(hash(engine.inputs), engine.fingerprint);
assert.equal(engine.binarySha256, inputs.binary);
assert.equal(await realpath(engine.binary), await realpath(join(engineDirectory, "kfc-prebis")));
assert.equal(bytesHash(await readFile(engine.binary)), engine.binarySha256);
const data = {};
for (const key of ["database", "catalog", "imports", "inspection"]) {
  data[key] = await json(join(engineDirectory, `${key}.json`));
  assert.equal(hash(data[key]), engine.dataSha256[key]);
}
const craft = await json(join(root, "artifacts/forever-simulator/craft-acquisition.json"));
assert.equal(hash(craft), inputs.craft);
const db = data.database,
  items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(data.catalog, data.imports, craft, items);
const modelDirectory = join(root, "artifacts/forever-simulator", inputs.sourceRelease);
const modelManifest = await json(join(modelDirectory, "manifest.json"));
const starterBytes = await readFile(join(modelDirectory, "kfc-tank-starters.json"));
assert.equal(bytesHash(starterBytes), modelManifest.files["kfc-tank-starters.json"].sha256);
assert.deepEqual(
  admitPublishedTankSources(
    sources,
    report.profile,
    JSON.parse(starterBytes)[report.profile],
    items,
  ),
  inputs.starterAdmission,
);
const requestDocument = await json(join(dirname(reportPath), "request.json"));
assert(/^[a-f0-9]{64}$/.test(requestDocument.sourceRequestSha256));
assert.equal(requestDocument.profile, report.profile);
assert.equal(requestDocument.scenario, report.scenario);
assert.equal(hash(requestDocument.requestBase64), inputs.request);
assert.equal(
  bytesHash(Buffer.from(requestDocument.requestBase64, "base64")),
  requestDocument.requestSha256,
);
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  bytesHash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href);
const request = api.RaidSimRequest.fromBinary(Buffer.from(requestDocument.requestBase64, "base64"));
const sourceDirectory = join(
  root,
  "artifacts/forever-simulator/optimization/tank-tier-list",
  inputs.sourceRelease,
);
const sourceEvidence = await json(
  join(
    sourceDirectory,
    `${report.scenario}-${report.profile}-${requestDocument.sourceRequestSha256.slice(0, 16)}.json`,
  ),
);
assert.equal(
  bytesHash(Buffer.from(sourceEvidence.requestBase64, "base64")),
  requestDocument.sourceRequestSha256,
);
const sourceRequest = api.RaidSimRequest.fromBinary(
  Buffer.from(sourceEvidence.requestBase64, "base64"),
);
sourceRequest.raid.parties[0].players[0].database = undefined;
sourceRequest.raid.parties[0].players[0].profession2 ||= api.IndividualSimSettings.fromJson({
  player: { profession2: "Enchanting" },
}).player.profession2;
assert.deepEqual(
  api.RaidSimRequest.toBinary(request),
  api.RaidSimRequest.toBinary(sourceRequest),
  "Search changed unapproved character/encounter inputs",
);
assert.equal(request.encounter.duration, report.scenario === "raid" ? 300 : 60);
assert.equal(request.simOptions.ruleset, 1);
assert.equal(request.raid.parties.length, 1);
assert.equal(request.raid.parties[0].players.length, 1);
const original = report.baseline.gear;
const classes = { tank_warrior: 9, feral_tank_druid: 1, protection_paladin: 4 };
assert(Object.hasOwn(classes, report.profile));
const context = prebisContext(
  {
    profile: report.profile,
    playerClass: classes[report.profile],
    settings: {
      player: {
        ...api.RaidSimRequest.toJson(request).raid.parties[0].players[0],
        equipment: original,
      },
      settings: { faction: inputs.context.faction },
    },
  },
  items,
);
assert.equal(context.playerClass, inputs.context.playerClass);
assert.deepEqual(context.professions, inputs.context.professions);
assert(legalPrebisGear(original, items, sources, context));
assert.equal(request.raid.parties[0].players[0].class, context.playerClass);
assert.deepEqual(
  request.raid.parties[0].players[0].equipment.items.map((item) => item.id),
  original.items.map((item) => item.id),
);
const pools = tankCandidatePools(db, sources, context);
assert.deepEqual(
  pools.map((pool) => pool.map((item) => item.id)),
  inputs.candidateIdsBySlot,
  "Candidate pool changed",
);
const fingerprint = tankEvidenceFingerprint(engine.fingerprint, requestDocument.requestBase64),
  evidence = new Map();
let representedIterations = 0;
async function load(gear, iterations, seed) {
  assert(legalPrebisGear(gear, items, sources, context), "Recorded proposal is illegal");
  const input = tankEvidenceInput(
    requestDocument.requestBase64,
    gear,
    request.encounter.duration,
    iterations,
    seed,
  );
  const id = hash(input);
  if (!evidence.has(id)) {
    evidence.set(id, await readTankEvidence(join(base, "cache"), fingerprint, input));
    representedIterations += iterations;
  }
  return { ...evidence.get(id), gear };
}
async function batch(gears, iterations, seed) {
  const results = [];
  for (let offset = 0; offset < gears.length; offset += 32)
    results.push(
      ...(await Promise.all(
        gears.slice(offset, offset + 32).map((gear) => load(gear, iterations, seed)),
      )),
    );
  return results;
}
assert.deepEqual(
  await load(original, 2000, tankSearchPolicy.searchSeed),
  report.baseline,
  "Baseline does not match raw evidence",
);
assert.equal(report.minimumHealth, inputs.healthFloor === "starter" ? report.baseline.health : 0);
assert.equal(report.results.length, 2, "Both objectives must finish before publication");
assert.deepEqual(report.results.map((result) => result.objective).sort(), ["mitigation", "threat"]);
const replayed = [];
for (const result of report.results) {
  const objective = result.objective,
    order = (a, b) =>
      tankObjectiveScore(b, objective, report.minimumHealth) -
      tankObjectiveScore(a, objective, report.minimumHealth);
  let current = globalThis.structuredClone(original),
    comparisonIndex = 0,
    converged = false,
    passes = 0;
  for (let pass = 0; pass < tankSearchPolicy.maximumPasses && !converged; pass++) {
    let acceptedInPass = 0;
    for (const group of tankSearchGroups(pools)) {
      const proposals = tankGearProposals(
        current,
        group,
        pools,
        db,
        sources,
        context,
        data.inspection,
        inputs.enchantPolicy,
      );
      if (proposals.length === 1) continue;
      const comparison = result.comparisons[comparisonIndex++];
      assert(comparison, "Missing coordinate search");
      assert.equal(comparison.pass, pass);
      assert.deepEqual(comparison.group, group);
      const screened = (
        await batch(proposals, tankSearchPolicy.screeningIterations, tankSearchPolicy.searchSeed)
      ).sort(order);
      const alternatives = shortlistTankCandidates(
        screened,
        objective,
        report.minimumHealth,
        16,
      ).filter(
        (entry) =>
          hash(entry.gear) !== hash(current) &&
          tankObjectiveScore(entry, objective, report.minimumHealth) > -Infinity,
      );
      const rechecked = (
        await batch(
          [current, ...alternatives.map((entry) => entry.gear)],
          tankSearchPolicy.shortlistIterations,
          tankSearchPolicy.searchSeed,
        )
      ).sort(order);
      const finalists = [
        current,
        ...shortlistTankCandidates(rechecked, objective, report.minimumHealth, 4)
          .filter((entry) => hash(entry.gear) !== hash(current))
          .map((entry) => entry.gear),
      ];
      const confirmed = await batch(
        finalists,
        tankSearchPolicy.selectionIterations,
        tankSearchPolicy.searchSeed,
      );
      const incumbent = confirmed[0],
        best = [...confirmed].sort(order)[0];
      const accepted = tankImprovement(best, incumbent, objective, report.minimumHealth);
      assert.deepEqual(comparison, {
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
      }
    }
    converged = acceptedInPass === 0;
    passes++;
  }
  assert.equal(comparisonIndex, result.comparisons.length, "Unexpected/omitted coordinate records");
  assert.equal(result.converged, converged);
  assert(converged, "Capped search is not a final optimized recommendation");
  assert.deepEqual(result.searchedGear, current);
  assert.deepEqual(
    result.searchedGearDescription,
    describePrebisGear(
      current,
      report.profile,
      "tank",
      context.playerClass,
      db,
      data.inspection,
      inputs.enchantPolicy,
    ),
  );
  const validation = [];
  for (const seed of tankSearchPolicy.validationSeeds) {
    const baseline = await load(original, tankSearchPolicy.validationIterations, seed),
      candidate = await load(current, tankSearchPolicy.validationIterations, seed);
    validation.push({
      seed,
      baseline,
      candidate,
      accepted: tankImprovement(candidate, baseline, objective, report.minimumHealth, true),
    });
  }
  assert.deepEqual(result.validation, validation, "Independent confirmation changed");
  const accepted = validation.every((row) => row.accepted);
  assert.equal(result.accepted, accepted);
  assert.deepEqual(result.gear, accepted ? current : original);
  replayed.push({ objective, passes, stages: comparisonIndex, accepted });
}
const receipt = {
  schema: "kfc-tank-evidence-replay.v1",
  status: "passed",
  reportSha256: hash(report),
  fingerprint: report.fingerprint,
  engine: engine.fingerprint,
  nativeBinarySha256: engine.binarySha256,
  verifierSha256: bytesHash(await readFile(import.meta.filename)),
  requestsRead: evidence.size,
  representedIterations,
  newSimulations: 0,
  replayed,
  verifiedAt: new Date().toISOString(),
};
await writeFile(join(dirname(reportPath), "replay.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
