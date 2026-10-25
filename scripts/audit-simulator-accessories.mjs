import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import {
  createAccessoryChallenges,
  shortlistAccessoryChallenges,
  accessoryConfirmationResults,
} from "../infra/simulator/accessory-challengers.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";
import { reviewPrebisFeedback } from "../infra/simulator/prebis-feedback.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { hasCurrentPrebisCoverage } from "../infra/simulator/prebis-search-coverage.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { createSimulationCache, simulationHash } from "../infra/simulator/retained-simulation-cache.mjs";
import {
  independentValidationSeeds,
  assertIndependentSeedRanges,
  selectionSeedRanges,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

const root = resolve(import.meta.dirname, "..");
const args = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(feedback-review|kind)=(.+)$/.exec(argument);
  assert(
    match && !args.has(match[1]),
    "Pass --feedback-review=<file> --kind=trinkets|rings once each",
  );
  args.set(match[1], match[2]);
}
assert.equal(args.size, 2, "Pass --feedback-review=<file> --kind=trinkets|rings");
assert(["rings", "trinkets"].includes(args.get("kind")), "Choose rings or trinkets");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const report = await read(args.get("feedback-review"));
assert.equal(
  report.status,
  "closed-loop-verified",
  "Finish equipment/talent feedback before auditing accessories",
);
const paths = report.evidencePaths;
assert(
  paths &&
    ["baseline", "gear-review", "talent-review", "browser-review"].every(
      (key) => typeof paths[key] === "string",
    ),
);
const [baseline, gearReview, talentReview, browserReview] = await Promise.all(
  ["baseline", "gear-review", "talent-review", "browser-review"].map((key) => read(paths[key])),
);
assert(/^[a-z][a-z_]*$/.test(baseline.profile), "Invalid simulator profile");
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
assert(treeClass, "Unknown simulator player class");
const reviewed = reviewPrebisFeedback({ baseline, gearReview, talentReview, browserReview });
for (const [key, value] of Object.entries(reviewed)) assert.deepEqual(report[key], value);
assert.equal(
  report.iterations,
  400000,
  "Final accessory audit requires completed 100k-range feedback",
);

const directory = join(root, "artifacts/forever-simulator/optimization");
const progressPath = join(
  directory,
  `accessory-audit-${args.get("kind")}-${simulationHash(report).slice(0, 16)}.progress.json`,
);
const workspace = await acquireSimulatorWorkspace(root, progressPath);
const owner = workspace.owner;
let workers = [];
let interrupted = false;
const interrupt = () => {
  interrupted = true;
  workers.forEach((worker) => worker.terminate());
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
try {
  const upstream = join(root, ".cache/forever-sim-upstream");
  const active = await read("artifacts/forever-simulator/active.json");
  assert.equal(baseline.revision, active.revision);
  const inputPaths = [
    join(upstream, "assets/database/db.json"),
    join(upstream, "assets/db_inputs/forever_gear_catalog.json"),
    join(upstream, "ui/core/kfc_prebis_import.json"),
    join(upstream, "ui/core/kfc_inspection.json"),
    join(root, "artifacts/forever-simulator/craft-acquisition.json"),
    join(upstream, `ui/core/talents/trees/${treeClass}.json`),
  ];
  const inputValues = await Promise.all(inputPaths.map(read));
  const [db, catalog, imports, inspection, craftAudit, trees] = inputValues;
  const inputHashes = inputValues.map(simulationHash);
  assert.equal(simulationHash(trees), talentReview.treeSha256, "Talent tree changed");
  assert.equal(simulationHash(db), baseline.dbSha256);
  assert.deepEqual(
    db,
    await read(`artifacts/forever-simulator/${active.release}/assets/database/db.json`),
  );
  const sources = prebisSources(
    catalog,
    imports,
    craftAudit,
    new Map(db.items.map((item) => [item.id, item])),
  );
  assert(
    hasCurrentPrebisCoverage(gearReview.result, baseline, db, sources, inspection, 100000),
    "Current pool coverage changed",
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
  const bank = createAccessoryChallenges(baseline, db, sources, args.get("kind"));
  workers = await createNativeRunners(root);
  assert.equal(
    workers[0].binarySha256,
    report.nativeBinarySha256,
    "Native engine changed since the feedback review",
  );
  assert(!interrupted, "Accessory audit interrupted");
  const fingerprint = simulationHash({
    binarySha256: report.nativeBinarySha256,
    db: simulationHash(db),
    runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
    revision: baseline.revision,
  });
  const cache = await createSimulationCache(
    join(directory, "simulation-cache"),
    fingerprint,
    workers,
  );
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      [
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
      ].map(async (path) => [
        path,
        createHash("sha256")
          .update(await readFile(join(root, path)))
          .digest("hex"),
      ]),
    ),
  );
  const identity = simulationHash({
    review: simulationHash(report),
    kind: bank.kind,
    candidates: bank.candidates.map((entry) => entry.id),
    inputHashes,
    sourceHashes,
  });
  const seeds = independentValidationSeeds(identity, "gear");
  const screeningSeed = independentValidationSeeds(
    simulationHash({ identity, phase: "screening" }),
    "gear",
  )[0];
  assertIndependentSeedRanges([
    ...selectionSeedRanges,
    ...report.validationSeedRanges,
    { label: "accessory broad screen", seed: screeningSeed, iterations: 2000 },
    ...seeds.map((seed) => ({ label: "accessory confirmation", seed, iterations: 100000 })),
  ]);
  const input = (gear) => ({
    requestBase64: baseline.requestBase64,
    gear: gear.items,
    talentsString: baseline.settings.player.talentsString,
    rotation: baseline.settings.player.rotation,
  });
  const incumbent = bank.candidates.find((entry) => entry.id === bank.incumbentId);
  assert(incumbent);
  const progress = async (phase, completed = 0, total = bank.candidates.length) =>
    writeFile(
      progressPath,
      JSON.stringify(
        {
          schema: "kfc-accessory-audit-progress.v1",
          identity,
          owner,
          phase,
          completed,
          total,
          cache: cache.stats,
          notice:
            "Process liveness must be checked separately; not an optimized/public recommendation.",
        },
        null,
        2,
      ) + "\n",
    );
  await progress("screening");
  console.log(
    `ACCESSORY ${bank.kind}: ${bank.candidates.length} legal ordered pairs; 2000-iteration broad screen, no EP filter`,
  );
  const metrics = await cache.run(
    bank.candidates.map((entry) => ({
      ...input(entry.gear),
      iterations: 2000,
      seed: screeningSeed,
      detail: false,
    })),
  );
  const rows = metrics.map((metric, index) => ({ ...metric, challenge: bank.candidates[index] }));
  const shortlist = shortlistAccessoryChallenges(rows, bank.incumbentId);
  const challenges = [];
  await progress("confirmation", 0, shortlist.length);
  console.log(
    `ACCESSORY ${bank.kind}: confirming all ${shortlist.length} candidates within the four-SE screening band`,
  );
  // One cache batch shares the two controls and fills the worker pool across challengers.
  // Concurrent cache.run calls would otherwise submit work to already-busy native workers.
  const confirmations = await cache.run(
    seeds.flatMap((seed) =>
      [incumbent, ...shortlist.map((row) => row.challenge)].map((entry) => ({
        ...input(entry.gear),
        iterations: 100000,
        seed,
        detail: false,
      })),
    ),
  );
  const verdicts = accessoryConfirmationResults(confirmations, seeds, shortlist.length);
  for (const [index, row] of shortlist.entries()) {
    assert(!interrupted, "Accessory audit interrupted");
    const verdict = verdicts[index];
    challenges.push({ challenge: row.challenge, ...verdict });
    await progress("confirmation", challenges.length, shortlist.length);
    console.log(
      `ACCESSORY ${bank.kind} ${challenges.length}/${shortlist.length}: ${row.challenge.itemIds.join("+")} ${verdict.averageDpsDifference.toFixed(3)} DPS; ${verdict.confirmed ? "CONFIRMED CHALLENGER" : "not independently established"}`,
    );
  }
  const confirmed = challenges
    .filter((entry) => entry.confirmed)
    .sort((a, b) => b.averageDpsDifference - a.averageDpsDifference);
  assert(!interrupted, "Accessory audit interrupted");
  assert.deepEqual(
    (await Promise.all(inputPaths.map(read))).map(simulationHash),
    inputHashes,
    "Audit inputs changed while running",
  );
  for (const [path, checksum] of Object.entries(sourceHashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex"),
      checksum,
      `Audit source changed: ${path}`,
    );
  assert.equal((await read("artifacts/forever-simulator/active.json")).release, active.release);
  const result = {
    schema: "kfc-accessory-challenger-audit.v1",
    identity,
    status: confirmed.length ? "challenger-requires-feedback" : "no-confirmed-challenger",
    profile: baseline.profile,
    variant: baseline.variant,
    kind: bank.kind,
    feedbackReviewPath: args.get("feedback-review"),
    feedbackReviewSha256: simulationHash(report),
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    nativeBinarySha256: report.nativeBinarySha256,
    sourceHashes,
    inputPaths,
    inputHashes,
    cacheFingerprint: fingerprint,
    eligibleIdsBySlot: bank.eligibleIdsBySlot,
    incumbent,
    screeningSeed,
    screeningIterations: 2000,
    validationSeeds: seeds,
    validationSeedPolicy,
    validationSeedContext: identity,
    validationIterations: 100000,
    screened: rows.map(({ challenge, dps, stdev, iterations }) => ({
      id: challenge.id,
      itemIds: challenge.itemIds,
      dps,
      stdev,
      iterations,
    })),
    challenges,
    bestConfirmed: confirmed[0] ?? null,
    notice:
      "All eligible ordered accessory pairs screened on this final gear/talent/APL context. Every pair within four estimated standard errors of the incumbent receives both independent 100k checks. Confirmation requires three SE in both ranges; screening omissions and Monte Carlo uncertainty prevent a global-optimality claim. An improvement must re-enter full feedback. No public preset or existing evidence is overwritten.",
  };
  const output = join(
    directory,
    `accessory-${bank.kind}-${simulationHash(result).slice(0, 16)}.json`,
  );
  assert(!interrupted, "Accessory audit interrupted");
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" }).catch(
    async (error) => {
      if (error.code !== "EEXIST") throw error;
      assert.deepEqual(await read(output), result);
    },
  );
  await progress("complete", shortlist.length, shortlist.length);
  console.log(
    JSON.stringify({
      output,
      status: result.status,
      screened: rows.length,
      confirmed: confirmed.length,
    }),
  );
} catch (error) {
  workers.forEach((worker) => worker.terminate());
  try {
    await writeFile(
      progressPath,
      JSON.stringify(
        {
          schema: "kfc-accessory-audit-progress.v1",
          owner,
          phase: interrupted ? "interrupted" : "failed",
          lastError: error.message,
          notice: "No final audit was completed. Existing simulation cache is retained for replay.",
        },
        null,
        2,
      ) + "\n",
    );
  } catch (statusError) {
    throw new AggregateError(
      [error, statusError],
      "Accessory audit and failure-report persistence failed",
    );
  }
  throw error;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  workers.forEach((worker) => worker.close());
  await workspace.release();
}
