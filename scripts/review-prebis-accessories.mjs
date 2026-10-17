import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";
import {
  createAccessoryChallenges,
  shortlistAccessoryChallenges,
} from "../infra/simulator/accessory-challengers.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { hasCurrentPrebisCoverage } from "../infra/simulator/prebis-search-coverage.mjs";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import {
  assertIndependentSeedRanges,
  independentValidationSeeds,
  selectionSeedRanges,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

const args = process.argv.slice(2);
assert(
  args.length === 1 && /^--audit=.+\.json$/.test(args[0]),
  "Pass exactly --audit=<completed-accessory-audit.json>; no workers, builds or writes are started",
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "artifacts/forever-simulator/optimization");
const upstream = join(root, ".cache/forever-sim-upstream");
const auditSourceSha256 = createHash("sha256")
  .update(await readFile(fileURLToPath(import.meta.url)))
  .digest("hex");
const inside = (directory, path) => {
  const offset = relative(directory, path);
  return offset !== "" && offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset);
};
async function readJson(path, directory) {
  const resolved = resolve(root, path);
  assert(inside(resolve(directory), resolved), "Evidence is outside its allowed directory");
  const [canonicalDirectory, canonical] = await Promise.all([
    realpath(directory),
    realpath(resolved),
  ]);
  assert(inside(canonicalDirectory, canonical), "Evidence symlink escaped its allowed directory");
  const metadata = await stat(canonical);
  assert(metadata.isFile() && metadata.size <= 8_000_000, "Invalid or oversized evidence file");
  return JSON.parse(await readFile(canonical, "utf8"));
}
const readArchive = (path) => readJson(path, archive);
const audit = await readArchive(args[0].slice("--audit=".length));
assert.equal(audit.schema, "kfc-accessory-challenger-audit.v1");
assert(["rings", "trinkets"].includes(audit.kind), "Unknown accessory kind");
assert(
  ["no-confirmed-challenger", "challenger-requires-feedback"].includes(audit.status),
  "Accessory audit is not complete",
);
assert(typeof audit.feedbackReviewPath === "string" && audit.feedbackReviewPath.length > 0);
const core = await readArchive(audit.feedbackReviewPath);
assert.equal(audit.feedbackReviewSha256, hash(core), "Feedback receipt changed");
const evidence = core.evidencePaths;
assert(
  evidence &&
    ["baseline", "gear-review", "talent-review", "browser-review"].every(
      (key) => typeof evidence[key] === "string",
    ),
);
const [baseline, gearReview, talentReview, browserReview] = await Promise.all(
  ["baseline", "gear-review", "talent-review", "browser-review"].map((key) =>
    readArchive(evidence[key]),
  ),
);
const rebuiltCore = reviewPrebisFeedback({ baseline, gearReview, talentReview, browserReview });
for (const [key, value] of Object.entries(rebuiltCore)) assert.deepEqual(core[key], value);
assert.equal(core.iterations, 400000, "Accessory review requires completed100k-range feedback");
assert.equal(audit.baselineSha256, hash(baseline));
assert.equal(audit.profile, baseline.profile);
assert.equal(audit.variant, baseline.variant);
const treeClass = {
  1: "druid",
  2: "hunter",
  3: "mage",
  4: "paladin",
  5: "priest",
  6: "rogue",
  7: "shaman",
  8: "warlock",
  9: "warrior",
}[baseline.playerClass];
assert(treeClass, "Unknown simulator class");
const inputPaths = [
  join(upstream, "assets/database/db.json"),
  join(upstream, "assets/db_inputs/forever_gear_catalog.json"),
  join(upstream, "ui/core/kfc_prebis_import.json"),
  join(upstream, "ui/core/kfc_inspection.json"),
  join(root, "artifacts/forever-simulator/craft-acquisition.json"),
  join(upstream, `ui/core/talents/trees/${treeClass}.json`),
];
assert.deepEqual(audit.inputPaths, inputPaths, "Unexpected accessory input paths");
const inputs = await Promise.all(inputPaths.map((path) => readJson(path, root)));
assert.deepEqual(audit.inputHashes, inputs.map(hash), "Accessory input hashes changed");
const [db, catalog, imports, inspection, craft, trees] = inputs;
assert.equal(hash(db), baseline.dbSha256);
assert.equal(audit.dbSha256, baseline.dbSha256);
assert.equal(hash(trees), talentReview.treeSha256);
const active = await readJson("artifacts/forever-simulator/active.json", root);
assert.equal(baseline.revision, active.revision);
assert.equal(baseline.sourceRelease, active.release);
assert.deepEqual(
  db,
  await readJson(`artifacts/forever-simulator/${active.release}/assets/database/db.json`, root),
);
const sourcePaths = [
  "scripts/audit-simulator-accessories.mjs",
  "infra/simulator/accessory-challengers.mjs",
  "infra/simulator/prebis-pool.mjs",
  "infra/simulator/equipment-ownership.mjs",
  "infra/simulator/simulation-cache.mjs",
  "infra/simulator/simulation-seeds.mjs",
  "infra/simulator/native-runner.mjs",
  "infra/simulator/simulator-workspace.mjs",
  "infra/simulator/prebis-feedback.mjs",
  "infra/simulator/prebis-enchants.mjs",
];
assert.deepEqual(Object.keys(audit.sourceHashes), sourcePaths, "Unreviewed accessory sources");
for (const path of sourcePaths)
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(root, path)))
      .digest("hex"),
    audit.sourceHashes[path],
    `Accessory source changed: ${path}`,
  );
const sources = prebisSources(
  catalog,
  imports,
  craft,
  new Map(db.items.map((item) => [item.id, item])),
);
assert(
  hasCurrentPrebisCoverage(gearReview.result, baseline, db, sources, inspection, 100000),
  "Current item/enchant/set coverage changed",
);
describePrebisGear(
  baseline.settings.player.equipment,
  baseline.profile,
  baseline.variant,
  baseline.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(baseline),
);
const bank = createAccessoryChallenges(baseline, db, sources, audit.kind);
assert.deepEqual(
  audit.eligibleIdsBySlot,
  bank.eligibleIdsBySlot,
  "Accessory candidate pools changed",
);
const incumbent = bank.candidates.find((row) => row.id === bank.incumbentId);
assert(incumbent);
assert.deepEqual(audit.incumbent, incumbent, "Accessory incumbent changed");
const identity = hash({
  review: hash(core),
  kind: bank.kind,
  candidates: bank.candidates.map((row) => row.id),
  inputHashes: inputs.map(hash),
  sourceHashes: audit.sourceHashes,
});
assert.equal(audit.identity, identity, "Accessory input identity changed");
assert.equal(audit.validationSeedContext, identity);
assert.equal(audit.validationSeedPolicy, validationSeedPolicy);
assert.deepEqual(audit.validationSeeds, independentValidationSeeds(identity, "gear"));
assert.equal(
  audit.screeningSeed,
  independentValidationSeeds(hash({ identity, phase: "screening" }), "gear")[0],
);
assert.equal(audit.screeningIterations, 2000);
assert.equal(audit.validationIterations, 100000);
const validationSeedRanges = [
  ...selectionSeedRanges,
  ...core.validationSeedRanges,
  { label: `${bank.kind} screen`, seed: audit.screeningSeed, iterations: 2000 },
  ...audit.validationSeeds.map((seed, index) => ({
    label: `${bank.kind} confirmation ${index}`,
    seed,
    iterations: 100000,
  })),
];
assertIndependentSeedRanges(validationSeedRanges);
const nativeBinarySha256 = createHash("sha256")
  .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
  .digest("hex");
assert.equal(nativeBinarySha256, core.nativeBinarySha256);
assert.equal(nativeBinarySha256, audit.nativeBinarySha256);
const cacheFingerprint = hash({
  binarySha256: nativeBinarySha256,
  db: hash(db),
  runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
  revision: baseline.revision,
});
assert.equal(cacheFingerprint, audit.cacheFingerprint);
const cacheRoot = join(archive, "simulation-cache", cacheFingerprint);
const raw = new Map();
const referencesByIterations = new Map();
async function metric(gear, iterations, seed) {
  const request = {
    requestBase64: baseline.requestBase64,
    gear: gear.items,
    talentsString: baseline.settings.player.talentsString,
    rotation: baseline.settings.player.rotation,
    iterations,
    seed,
    detail: false,
  };
  const id = hash(request);
  referencesByIterations.set(iterations, (referencesByIterations.get(iterations) ?? 0) + 1);
  if (raw.has(id)) return raw.get(id);
  const record = await readJson(join(cacheRoot, id + ".json"), cacheRoot);
  assert.equal(record.schema, "kfc-simulation-evidence.v1");
  assert.equal(record.fingerprint, cacheFingerprint);
  assert.equal(record.requestSha256, id);
  assert.equal(record.result?.id, id);
  assert.deepEqual(
    Object.keys(record.result).sort(),
    ["dps", "id", "iterations", "stdev"],
    "Unexpected scalar measurement fields",
  );
  assert.equal(record.result.iterations, iterations, "Raw measurement precision changed");
  assert(Number.isFinite(record.result.dps) && record.result.dps > 0);
  assert(Number.isFinite(record.result.stdev) && record.result.stdev >= 0);
  raw.set(id, record.result);
  return record.result;
}
assert.equal(audit.screened?.length, bank.candidates.length, "Incomplete accessory screen");
const rows = [];
for (const [index, challenge] of bank.candidates.entries()) {
  const result = await metric(challenge.gear, 2000, audit.screeningSeed);
  assert.deepEqual(
    audit.screened[index],
    {
      id: challenge.id,
      itemIds: challenge.itemIds,
      dps: result.dps,
      stdev: result.stdev,
      iterations: result.iterations,
    },
    `Raw screen mismatch at candidate ${index}`,
  );
  rows.push({ ...result, challenge });
}
const shortlist = shortlistAccessoryChallenges(rows, bank.incumbentId);
assert.equal(audit.challenges?.length, shortlist.length, "Incomplete accessory shortlist");
const controls = await Promise.all(
  audit.validationSeeds.map((seed) => metric(incumbent.gear, 100000, seed)),
);
const challenges = [];
for (const [index, row] of shortlist.entries()) {
  const comparisons = [];
  for (const [range, seed] of audit.validationSeeds.entries()) {
    const baselineResult = controls[range];
    const candidate = await metric(row.challenge.gear, 100000, seed);
    const compact = (value) => ({
      dps: value.dps,
      stdev: value.stdev,
      iterations: value.iterations,
    });
    comparisons.push({
      seed,
      baseline: compact(baselineResult),
      candidate: compact(candidate),
      difference: candidate.dps - baselineResult.dps,
      threshold: Math.max(
        0.001,
        3 * Math.sqrt(baselineResult.stdev ** 2 / 100000 + candidate.stdev ** 2 / 100000),
      ),
    });
  }
  const rebuilt = {
    challenge: row.challenge,
    confirmed: comparisons.every((entry) => entry.difference > entry.threshold),
    averageDpsDifference:
      comparisons.reduce((sum, entry) => sum + entry.difference, 0) / comparisons.length,
    comparisons,
    notice:
      "Three-standard-error improvement required in BOTH disjoint ranges. This is a conservative modeled comparison, not proof of global BiS, a simultaneous confidence guarantee, or server verification. Non-significant differences remain uncertain.",
  };
  assert.deepEqual(audit.challenges[index], rebuilt, `Raw challenger verdict mismatch at ${index}`);
  challenges.push(rebuilt);
}
const confirmed = challenges
  .filter((row) => row.confirmed)
  .sort((a, b) => b.averageDpsDifference - a.averageDpsDifference);
assert.deepEqual(
  audit.bestConfirmed,
  confirmed[0] ?? null,
  "Selected accessory challenger changed",
);
assert.equal(
  audit.status,
  confirmed.length ? "challenger-requires-feedback" : "no-confirmed-challenger",
  "Accessory status contradicts raw comparisons",
);
assert.deepEqual(
  (await Promise.all(inputPaths.map((path) => readJson(path, root)))).map(hash),
  audit.inputHashes,
  "Inputs changed during readonly review",
);
for (const path of sourcePaths)
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(root, path)))
      .digest("hex"),
    audit.sourceHashes[path],
  );
assert.equal(
  createHash("sha256")
    .update(await readFile(fileURLToPath(import.meta.url)))
    .digest("hex"),
  auditSourceSha256,
  "Readonly reviewer source changed while running",
);
assert.equal(
  createHash("sha256")
    .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
    .digest("hex"),
  nativeBinarySha256,
);
assert.equal(
  (await readJson("artifacts/forever-simulator/active.json", root)).release,
  active.release,
);
assert.deepEqual(await readArchive(args[0].slice("--audit=".length)), audit);
assert.equal(hash(await readArchive(audit.feedbackReviewPath)), audit.feedbackReviewSha256);
console.log(
  JSON.stringify(
    {
      schema: "kfc-readonly-accessory-coverage.v1",
      status: "passed",
      auditSourceSha256,
      auditSha256: hash(audit),
      feedbackReviewSha256: hash(core),
      baselineSha256: hash(baseline),
      nativeBinarySha256,
      dbSha256: hash(db),
      cacheFingerprint,
      kind: bank.kind,
      screened: rows.length,
      nearCandidates: shortlist.length,
      confirmedCandidates: confirmed.length,
      incumbentIds: incumbent.itemIds,
      statusReproduced: audit.status,
      requiresAnotherFeedbackLoop: confirmed.length > 0,
      uniqueRawCacheRecords: raw.size,
      representedRawIterations: [...raw.values()].reduce((sum, row) => sum + row.iterations, 0),
      rawMetricReferencesByIterations: Object.fromEntries(referencesByIterations),
      rawIdStreamSha256: hash([...raw.keys()]),
      validationSeedRanges,
      notice:
        "Read-only full accessory replay: current stage source/input identity, every legal ordered-pair screen, shortlist and all100k confirmations. Does not execute new simulations, independently re-audit all raw core history, cover other cases/reserved RNG ranges, expand the policy/set bank, publish presets or prove global BiS. A confirmed challenger must complete another feedback loop.",
    },
    null,
    2,
  ),
);
