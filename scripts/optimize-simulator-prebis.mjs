import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import {
  eligiblePrebis,
  legalPrebisGear,
  statisticallyBetter,
  prebisNotice,
  prebisSources,
  prebisContext,
  prebisSetSubsets,
} from "../infra/simulator/prebis-pool.mjs";
import { enchantDefaultGear } from "../infra/simulator/default-enchants.mjs";
import {
  describePrebisGear,
  carryCompatibleEnchants,
  prebisEnchantFits,
  prebisEnchantPolicy,
} from "../infra/simulator/prebis-enchants.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { runIndependentValidation } from "../infra/simulator/validation-runner.mjs";
import { createSimulationCache } from "../infra/simulator/simulation-cache.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
  parseValidationIterations,
} from "../infra/simulator/simulation-seeds.mjs";
import {
  decodeTalents,
  talentProblem,
  selectedTalentEvidence,
} from "../infra/simulator/talent-search.mjs";

const root = resolve(import.meta.dirname, "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const validationIterationsPerSeed = parseValidationIterations(
  process.argv
    .find((argument) => argument.startsWith("--validation-iterations="))
    ?.slice("--validation-iterations=".length),
);
const output = join(root, "artifacts/forever-simulator/optimization");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
const requests = await read(join(output, "requests.json"));
const specArgument = process.argv.find((argument) => argument.startsWith("--spec="))?.slice(7);
let selectedProfiles = requests.profiles.filter(
  (profile) => `${profile.profile}/${profile.variant}` === specArgument,
);
if (selectedProfiles.length !== 1)
  throw new Error(
    "Select exactly one spec, for example --spec=warrior/fury. Finish its review before moving to the next.",
  );
const baselineArgument =
  process.argv.find((argument) => argument.startsWith("--baseline="))?.slice(11) ||
  (specArgument === "warrior/fury"
    ? "artifacts/forever-simulator/optimization/baselines/warrior-fury-blue.json"
    : null);
const talentArgument = process.argv
  .find((argument) => argument.startsWith("--talent-review="))
  ?.slice(16);
if (!baselineArgument || !talentArgument)
  throw new Error(
    "A reviewed baseline and --talent-review=<evidence.json> are required before gear optimization",
  );
const baselineProfile = await read(resolve(root, baselineArgument));
const talentReview = await read(resolve(root, talentArgument));
const seedArgument = process.argv
  .find((argument) => argument.startsWith("--seed-gear="))
  ?.slice(12);
const seedInput = seedArgument ? await read(resolve(root, seedArgument)) : null;
if (seedInput) assert.equal(seedInput.schema, "kfc-prebis-search-seed.v1");
if (
  baselineProfile.schema !== "kfc-optimization-baseline.v1" ||
  `${baselineProfile.profile}/${baselineProfile.variant}` !== specArgument ||
  talentReview.profile !== specArgument ||
  talentReview.baselineSha256 !== hash(baselineProfile)
)
  throw new Error("Unvalidated or mismatched talent/baseline evidence");
const profile = globalThis.structuredClone(baselineProfile);
const enchantPolicy = prebisEnchantPolicy(profile);
const selectedTalents = selectedTalentEvidence(talentReview, baselineProfile);
profile.settings.player.talentsString = selectedTalents.talents;
profile.settings.player.rotation = selectedTalents.rotation.value;
selectedProfiles = [profile];
const db = await read(join(upstream, "assets/database/db.json"));
const catalog = await read(join(upstream, "assets/db_inputs/forever_gear_catalog.json"));
const imports = await read(join(upstream, "ui/core/kfc_prebis_import.json"));
const inspection = await read(join(upstream, "ui/core/kfc_inspection.json"));
assert.equal(baselineProfile.dbSha256, hash(db), "Baseline item database changed");
assert.equal(talentReview.dbSha256, hash(db), "Talent review database changed");
const talentTrees = await read(
  join(
    upstream,
    "ui/core/talents/trees",
    profile.profile === "warrior" ? "warrior.json" : `${profile.profile}.json`,
  ),
);
assert.equal(talentReview.treeSha256, hash(talentTrees), "Talent tree changed since review");
assert.equal(
  talentProblem(talentTrees, decodeTalents(talentTrees, profile.settings.player.talentsString)),
  "",
);
const craftAudit = await read(join(root, "artifacts/forever-simulator/craft-acquisition.json"));
assert.equal(craftAudit.schema, "kfc-prebis-craft-acquisition.v1");
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(catalog, imports, craftAudit, items);
const workers = await createNativeRunners(root);
const fingerprint = hash({
  nativeBinarySha256: workers[0].binarySha256,
  revision: requests.revision,
  db: hash(db),
  imports,
  inspection: hash(inspection),
  requests: hash(requests),
  script: await readFile(import.meta.filename, "utf8"),
  pool: await readFile(join(root, "infra/simulator/prebis-pool.mjs"), "utf8"),
  ownership: await readFile(join(root, "infra/simulator/equipment-ownership.mjs"), "utf8"),
  enchantAcquisition: await readFile(join(root, "infra/simulator/enchant-acquisition.mjs"), "utf8"),
  runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
  enchantPolicy: await readFile(join(root, "infra/simulator/default-enchants.mjs"), "utf8"),
  enchantValidation: await readFile(join(root, "infra/simulator/prebis-enchants.mjs"), "utf8"),
  baseline: baselineProfile,
  talentReview,
  craftAudit,
  seedInput,
  seedPolicy: await readFile(join(root, "infra/simulator/simulation-seeds.mjs"), "utf8"),
  validationIterationsPerSeed,
  validationRunner: await readFile(join(root, "infra/simulator/validation-runner.mjs"), "utf8"),
});
const cache = await createSimulationCache(
  join(output, "simulation-cache"),
  hash({
    binarySha256: workers[0].binarySha256,
    db: hash(db),
    runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
    revision: profile.revision,
  }),
  workers,
);
const report = {
  schema: "kfc-prebis-results.v1",
  fingerprint,
  revision: requests.revision,
  dbSha256: hash(db),
  notice: prebisNotice,
  scenario: {
    duration: 300,
    targetLevel: 63,
    screenIterations: 80,
    selectionIterations: 2000,
    validationIterationsPerSeed,
    validationSeeds: independentValidationSeeds(fingerprint, "gear"),
    method:
      "One spec at a time after fixed-PvP talent search. All eligible admitted items without an item-level floor or accessory EP cutoff, ordered weapon/accessory pairs including legal duplicates, set proposals and compatible reviewed deterministic enchant effects. Provisional procs require an explicit baseline policy. 80-iteration screening, broader 500-iteration recheck and top-four 2,000-iteration selection; selection gains are exploratory, not statistical proof. Repeat until stable (maximum six passes). Independent A/B checks at the requested per-range precision. Raid-dependent crafted gear and raid enhancement sources excluded. Not exhaustive global proof.",
  },
  imports,
  baselineSha256: hash(baselineProfile),
  talentReviewSha256: hash(talentReview),
  craftAuditSha256: hash(craftAudit),
  craftAuditNotice: craftAudit.notice,
  enchantPolicy,
  seedPath: seedArgument ?? null,
  seedSha256: seedInput ? hash(seedInput) : null,
  profiles: [],
};
let simulations = 0,
  iterations = 0;
try {
  for (const profile of selectedProfiles) {
    const key = `${profile.profile}/${profile.variant}`;
    const file = join(
      output,
      `${profile.profile}-${profile.variant}-${fingerprint.slice(0, 16)}-gear.json`,
    );
    if (process.argv.includes("--resume")) {
      try {
        const saved = await read(file);
        if (saved.fingerprint === fingerprint) {
          report.profiles.push(saved.result);
          console.log(`RESUME ${key}`);
          continue;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const player = profile.settings.player;
    const original = globalThis.structuredClone(player.equipment);
    const context = prebisContext(profile, items);
    for (const [slot, spec] of original.items.entries())
      if (spec.id && !eligiblePrebis(items.get(spec.id), sources.get(spec.id), context, slot))
        throw new Error(`${key}: ineligible starting slot ${slot}: ${spec.id}`);
    assert(legalPrebisGear(original, items, sources, context), `${key}: illegal baseline`);
    const enchant = (gear) => {
      const result = enchantDefaultGear(
        gear,
        profile.profile,
        profile.variant,
        db,
        inspection,
      ).gear;
      for (const [slot, spec] of gear.items.entries()) {
        const item = items.get(spec.id);
        if (
          spec.enchant &&
          Object.values(inspection.enchants).some(
            (entry) =>
              entry.effectId === spec.enchant &&
              item &&
              prebisEnchantFits(entry, item, profile.playerClass, slot, enchantPolicy),
          )
        )
          result.items[slot].enchant = spec.enchant;
      }
      describePrebisGear(
        result,
        profile.profile,
        profile.variant,
        profile.playerClass,
        db,
        inspection,
        enchantPolicy,
      );
      return result;
    };
    const gearInput = (gear) => {
      assert(legalPrebisGear(gear, items, sources, context), `${key}: illegal proposal`);
      describePrebisGear(
        gear,
        profile.profile,
        profile.variant,
        profile.playerClass,
        db,
        inspection,
        enchantPolicy,
      );
      return {
        requestBase64: profile.requestBase64,
        gear: gear.items,
        talentsString: player.talentsString,
        rotation: player.rotation,
      };
    };
    const runBatch = async (gears, count, seed) => {
      const inputs = gears.map((gear) => ({
        ...gearInput(gear),
        iterations: count,
        seed,
        detail: false,
      }));
      const results = await cache.run(inputs);
      simulations = cache.stats.simulations;
      iterations = cache.stats.iterations;
      return results.map((result, index) => ({ ...result, gear: gears[index] }));
    };
    const weights = [...profile.settings.epWeightsStats.stats];
    // Forever equipment hit/crit are universal: do not undervalue generic ratings for casters.
    weights[18] = weights[13] = Math.max(weights[18] || 0, weights[13] || 0);
    weights[19] = weights[14] = Math.max(weights[19] || 0, weights[14] || 0);
    const score = (item, slot) =>
      item.stats.reduce((sum, value, i) => sum + value * (weights[i] || 0), 0) +
      (item.weaponSpeed && slot >= 14
        ? ((item.weaponDamageMin + item.weaponDamageMax) / (2 * item.weaponSpeed)) *
          (profile.settings.epWeightsStats.pseudoStats[slot - 14] || 0)
        : 0);
    const pools = original.items.map((spec, slot) => {
      if (!spec.id) return [];
      const pool = db.items.filter((item) =>
        eligiblePrebis(item, sources.get(item.id), context, slot),
      );
      const ranked = pool.sort((a, b) => score(b, slot) - score(a, slot) || a.id - b.id);
      return ranked;
    });
    const comparisons = [];
    let current = enchant(original);
    if (seedInput) {
      assert.equal(seedInput.spec, key, "Gear seed belongs to another spec");
      assert(legalPrebisGear(seedInput.gear, items, sources, context), "Illegal search seed");
      const candidate = enchant(seedInput.gear);
      const [incumbent, alternative] = await runBatch([current, candidate], 2000, 1337);
      if (alternative.dps > incumbent.dps) current = candidate;
    }
    try {
      const preliminary = await read(join(output, `${profile.profile}-${profile.variant}.json`));
      if (legalPrebisGear(preliminary.result.gear, items, sources, context)) {
        const candidate = enchant(preliminary.result.gear);
        const [incumbent, alternative] = await runBatch([current, candidate], 2000, 1337);
        if (alternative.dps > incumbent.dps) current = candidate;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const starting = (await runBatch([current], 2000, 1337))[0];
    console.log(
      `START ${key}: ${starting.dps.toFixed(2)} DPS; ${pools.map((pool) => pool.length).join("/")} candidates per slot`,
    );
    let converged = false;
    for (let pass = 0; pass < 6; pass++) {
      const beforePass = hash(current);
      for (const slots of [
        ...Array.from({ length: 10 }, (_, i) => [i]),
        [14],
        [15],
        [16],
        [14, 15],
        ["sets"],
        [10, 11],
        [12, 13],
        ...Array.from({ length: 17 }, (_, i) => [`enchant:${i}`]),
      ]) {
        const proposals = [current];
        const seen = new Set([hash(current)]);
        const propose = (gear) => {
          if (!legalPrebisGear(gear, items, sources, context)) return;
          const value = enchant(
              carryCompatibleEnchants(
                gear,
                current,
                profile.playerClass,
                db,
                inspection,
                enchantPolicy,
              ),
            ),
            digest = hash(value);
          if (!seen.has(digest)) {
            seen.add(digest);
            proposals.push(value);
          }
        };
        if (typeof slots[0] === "string" && slots[0].startsWith("enchant:")) {
          const slot = Number(slots[0].slice(8)),
            item = items.get(current.items[slot].id);
          if (!item) continue;
          for (const entry of Object.values(inspection.enchants).filter((entry) =>
            prebisEnchantFits(entry, item, profile.playerClass, slot, enchantPolicy),
          )) {
            const gear = globalThis.structuredClone(current);
            gear.items[slot].enchant = entry.effectId;
            propose(gear);
          }
        } else if (slots[0] === "sets") {
          const sets = new Map();
          for (const item of db.items.filter((item) => item.setId)) {
            const slot = original.items.findIndex(
              (spec, slot) => spec.id && eligiblePrebis(item, sources.get(item.id), context, slot),
            );
            if (slot < 0) continue;
            const set = sets.get(item.setId) ?? new Map();
            if (!set.has(slot) || score(item, slot) > score(set.get(slot), slot))
              set.set(slot, item);
            sets.set(item.setId, set);
          }
          for (const set of sets.values()) {
            const entries = [...set];
            for (const selected of prebisSetSubsets(entries)) {
              const gear = globalThis.structuredClone(current);
              for (const [slot, item] of selected) gear.items[slot] = { id: item.id };
              propose(gear);
            }
          }
        } else if (slots.length === 2) {
          const mainPool = pools[slots[0]],
            secondPool = pools[slots[1]];
          for (let i = 0; i < mainPool.length; i++)
            for (let j = 0; j < secondPool.length; j++) {
              const gear = globalThis.structuredClone(current);
              gear.items[slots[0]] = { id: mainPool[i].id };
              gear.items[slots[1]] = { id: secondPool[j].id };
              propose(gear);
            }
        } else
          for (const item of pools[slots[0]]) {
            const gear = globalThis.structuredClone(current);
            gear.items[slots[0]] = { id: item.id };
            propose(gear);
          }
        if (proposals.length === 1) continue;
        console.log(
          `SEARCH ${key} pass ${pass + 1} slots ${slots.join("+")}: ${proposals.length} legal proposals`,
        );
        const screened = (await runBatch(proposals, 80, 1337)).sort((a, b) => b.dps - a.dps);
        const rechecked = await runBatch(
          [
            current,
            ...screened
              .filter((entry) => hash(entry.gear) !== hash(current))
              .slice(0, Math.min(128, Math.max(16, Math.ceil(proposals.length / 4))))
              .map((entry) => entry.gear),
          ],
          500,
          1337,
        );
        rechecked.sort((a, b) => b.dps - a.dps);
        const finalists = [
          current,
          ...rechecked
            .filter((entry) => hash(entry.gear) !== hash(current))
            .slice(0, 4)
            .map((entry) => entry.gear),
        ];
        const confirmed = await runBatch(finalists, 2000, 1337);
        const baseline = confirmed[0],
          best = [...confirmed].sort((a, b) => b.dps - a.dps)[0];
        const accepted = best.dps > baseline.dps + 0.05;
        comparisons.push({
          pass,
          slots,
          screened: proposals.length,
          beforeDps: baseline.dps,
          bestDps: best.dps,
          accepted,
          bestItems: best.gear.items.map((entry) => entry.id || 0),
        });
        if (accepted) current = best.gear;
        await writeFile(
          file + ".checkpoint.json",
          JSON.stringify(
            {
              schema: "kfc-gear-search-checkpoint.v1",
              fingerprint,
              current,
              comparisons,
              cache: cache.stats,
            },
            null,
            2,
          ),
        );
      }
      const measured = (await runBatch([current], 2000, 1337))[0];
      console.log(
        `PASS ${pass + 1} ${key}: ${measured.dps.toFixed(2)} DPS; ${simulations} actual sims / ${iterations} iterations overall`,
      );
      if (beforePass === hash(current)) {
        converged = true;
        break;
      }
    }
    const checked = await runIndependentValidation(
      cache,
      gearInput(enchant(original)),
      gearInput(current),
      report.scenario.validationSeeds,
      report.scenario.validationIterationsPerSeed,
    );
    simulations = cache.stats.simulations;
    iterations = cache.stats.iterations;
    const validation = checked.map(({ seed, baseline, candidate }) => ({
      seed,
      baseline: { dps: baseline.dps, stdev: baseline.stdev, iterations: baseline.iterations },
      candidate: { dps: candidate.dps, stdev: candidate.stdev, iterations: candidate.iterations },
    }));
    const accepted = validation.every((entry) =>
      statisticallyBetter(entry.candidate, entry.baseline),
    );
    const gear = accepted ? current : enchant(original);
    const result = {
      profile: profile.profile,
      variant: profile.variant,
      name: profile.name,
      playerClass: profile.playerClass,
      race: player.race,
      professions: context.professions,
      faction: context.faction,
      talentsString: player.talentsString,
      rotation: player.rotation,
      baselinePath: baselineArgument,
      talentReviewPath: talentArgument,
      craftExcludedIds: craftAudit.items
        .filter((item) => item.status !== "recipe-inputs-reviewed")
        .map((item) => item.id),
      requestSha256: hash(profile.requestBase64),
      gear,
      provisionalIds: gear.items
        .filter((entry) => sources.get(entry.id)?.status === "classic-provisional")
        .map((entry) => entry.id),
      provisionalAcquisitionIds: gear.items
        .filter(
          (entry) => sources.get(entry.id)?.acquisitionProvenance === "historical-provisional",
        )
        .map((entry) => entry.id),
      baselineDps:
        validation.reduce((sum, entry) => sum + entry.baseline.dps, 0) / validation.length,
      optimizedDps:
        validation.reduce(
          (sum, entry) => sum + (accepted ? entry.candidate.dps : entry.baseline.dps),
          0,
        ) / validation.length,
      accepted,
      converged,
      status: "simulation-complete-awaiting-browser-review",
      validation,
      validationSeedPolicy,
      validationSeedContext: fingerprint,
      comparisons,
      candidateIdsBySlot: pools.map((pool) => pool.map((item) => item.id)),
    };
    report.profiles.push(result);
    await writeFile(file, JSON.stringify({ fingerprint, result }, null, 2));
    console.log(
      `VALIDATED ${key}: ${result.baselineDps.toFixed(2)} → ${result.optimizedDps.toFixed(2)} DPS; provisional [${result.provisionalIds.join(", ")}]${accepted ? "" : " (kept baseline: no independently established gain)"}`,
    );
  }
  report.simulationsThisRun = simulations;
  report.iterationsThisRun = iterations;
  const reportPath = join(
    output,
    `${selectedProfiles[0].profile}-${selectedProfiles[0].variant}-${fingerprint.slice(0, 16)}-results.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Finished ${report.profiles.length} profiles. Report: ${reportPath}`);
} finally {
  for (const worker of workers) worker.close();
}
