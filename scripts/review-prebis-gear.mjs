import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import console from "node:console";
import { fileURLToPath } from "node:url";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import {
  eligiblePrebis,
  legalPrebisGear,
  prebisContext,
  prebisSetSubsets,
  prebisSources,
  statisticallyBetter,
} from "../infra/simulator/prebis-pool.mjs";
import {
  carryCompatibleEnchants,
  describePrebisGear,
  prebisEnchantFits,
  prebisEnchantPolicy,
} from "../infra/simulator/prebis-enchants.mjs";
import { enchantDefaultGear } from "../infra/simulator/default-enchants.mjs";
import {
  decodeTalents,
  selectedTalentEvidence,
  talentProblem,
} from "../infra/simulator/talent-search.mjs";
import {
  assertIndependentSeedRanges,
  assertValidationSeeds,
  selectionSeedRanges,
} from "../infra/simulator/simulation-seeds.mjs";

const args = process.argv.slice(2);
assert(
  args.length === 1 && /^--gear-review=.+-gear\.json$/.test(args[0]),
  "Pass exactly --gear-review=<completed-gear.json>; no numerical jobs or builds are started",
);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(root, "artifacts/forever-simulator/optimization");
const upstream = join(root, ".cache/forever-sim-upstream");
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
const gearPath = resolve(root, args[0].slice("--gear-review=".length));
const wrapper = await readArchive(gearPath);
const report = await readArchive(gearPath.replace(/-gear\.json$/, "-results.json"));
const checkpoint = await readArchive(gearPath + ".checkpoint.json");
assert.equal(report.schema, "kfc-prebis-results.v1");
assert.equal(checkpoint.schema, "kfc-gear-search-checkpoint.v1");
assert.match(wrapper.fingerprint, /^[a-f0-9]{64}$/);
assert.equal(wrapper.fingerprint, report.fingerprint);
assert.equal(wrapper.fingerprint, checkpoint.fingerprint);
const result = wrapper.result;
assert.equal(result?.status, "simulation-complete-awaiting-browser-review");
assert.equal(result.converged, true, "Gear search has not converged");
assert.deepEqual(report.profiles, [result], "Gear report and selected result disagree");
assert.deepEqual(result.comparisons, checkpoint.comparisons, "Final checkpoint changed");
const baseline = await readArchive(result.baselinePath);
const talents = await readArchive(result.talentReviewPath);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
for (const field of ["profile", "variant", "playerClass"])
  assert.equal(result[field], baseline[field], `Gear review ${field} changed`);
assert.equal(report.baselineSha256, hash(baseline));
assert.equal(report.talentReviewSha256, hash(talents));
assert.equal(talents.baselineSha256, hash(baseline));
assert.equal(talents.gearSha256, hash(baseline.settings.player.equipment));
assert.equal(talents.requestHashEncoding ?? "json-string", "json-string");
assert.equal(talents.requestSha256, hash(JSON.stringify(baseline.requestBase64)));
assert.equal(result.requestSha256, hash(baseline.requestBase64));
const selected = selectedTalentEvidence(talents, baseline);
assert.equal(result.talentsString, selected.talents);
assert.deepEqual(result.rotation, selected.rotation.value);
const db = await readJson(join(upstream, "assets/database/db.json"), upstream);
const inspection = await readJson(join(upstream, "ui/core/kfc_inspection.json"), upstream);
const imports = await readJson(join(upstream, "ui/core/kfc_prebis_import.json"), upstream);
const catalog = await readJson(
  join(upstream, "assets/db_inputs/forever_gear_catalog.json"),
  upstream,
);
const craftAudit = await readJson(
  join(root, "artifacts/forever-simulator/craft-acquisition.json"),
  join(root, "artifacts/forever-simulator"),
);
const requests = await readArchive(join(archive, "requests.json"));
assert.equal(report.dbSha256, hash(db), "Compiled item database changed");
assert.equal(baseline.dbSha256, hash(db));
assert.equal(talents.dbSha256, hash(db));
const talentTreeNames = {
  1: "druid",
  2: "hunter",
  3: "mage",
  4: "paladin",
  5: "priest",
  6: "rogue",
  7: "shaman",
  8: "warlock",
  9: "warrior",
};
const treeName = talentTreeNames[baseline.playerClass];
assert(treeName, "Unknown talent-tree class");
const talentTrees = await readJson(
  join(upstream, "ui/core/talents/trees", treeName + ".json"),
  upstream,
);
assert.equal(talents.treeSha256, hash(talentTrees), "Canonical talent tree changed");
assert.equal(talentProblem(talentTrees, decodeTalents(talentTrees, selected.talents)), "");
assert.equal(report.craftAuditSha256, hash(craftAudit));
assert.deepEqual(report.imports, imports);
assert.equal(report.scenario.validationIterationsPerSeed, 100000, "100k validation required");
const nativeBinarySha256 = createHash("sha256")
  .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
  .digest("hex");
assert.equal(talents.nativeBinarySha256, nativeBinarySha256, "Native combat engine changed");
const source = (path) => readFile(join(root, path), "utf8");
const runner = await source("infra/simulator/prebis-runner.go");
const fingerprint = hash({
  nativeBinarySha256,
  revision: requests.revision,
  db: hash(db),
  imports,
  inspection: hash(inspection),
  requests: hash(requests),
  script: await source("scripts/optimize-simulator-prebis.mjs"),
  pool: await source("infra/simulator/prebis-pool.mjs"),
  ownership: await source("infra/simulator/equipment-ownership.mjs"),
  enchantAcquisition: await source("infra/simulator/enchant-acquisition.mjs"),
  runner,
  enchantPolicy: await source("infra/simulator/default-enchants.mjs"),
  enchantValidation: await source("infra/simulator/prebis-enchants.mjs"),
  baseline,
  talentReview: talents,
  craftAudit,
  seedInput: report.seedPath ? await readArchive(report.seedPath) : null,
  seedPolicy: await source("infra/simulator/simulation-seeds.mjs"),
  validationIterationsPerSeed: 100000,
  validationRunner: await source("infra/simulator/validation-runner.mjs"),
});
assert.equal(fingerprint, wrapper.fingerprint, "Gear-search inputs changed");
assert.equal(result.validationSeedContext, fingerprint);
assert.deepEqual(
  report.scenario.validationSeeds,
  result.validation.map((row) => row.seed),
);
const validationRanges = [
  ...selectionSeedRanges,
  ...assertValidationSeeds(talents, "talents"),
  ...assertValidationSeeds(result, "gear"),
];
assertIndependentSeedRanges(validationRanges);
assert.equal(
  result.baselineDps,
  result.validation.reduce((sum, row) => sum + row.baseline.dps, 0) / result.validation.length,
  "Reported baseline DPS average differs from its measurements",
);
assert.equal(
  result.optimizedDps,
  result.validation.reduce(
    (sum, row) => sum + (result.accepted ? row.candidate.dps : row.baseline.dps),
    0,
  ) / result.validation.length,
  "Reported selected DPS average differs from its measurements",
);
const items = new Map(db.items.map((item) => [item.id, item]));
const sources = prebisSources(catalog, imports, craftAudit, items);
const context = prebisContext(baseline, items);
const policy = prebisEnchantPolicy(baseline);
assert.deepEqual(report.enchantPolicy, policy);
const original = baseline.settings.player.equipment;
const current = checkpoint.current;
for (const gear of [original, current, result.gear]) {
  assert(legalPrebisGear(gear, items, sources, context), "Illegal equipment in completed evidence");
  describePrebisGear(
    gear,
    baseline.profile,
    baseline.variant,
    baseline.playerClass,
    db,
    inspection,
    policy,
  );
}
function enchant(gear) {
  const output = enchantDefaultGear(gear, baseline.profile, baseline.variant, db, inspection).gear;
  for (const [slot, spec] of gear.items.entries()) {
    const item = items.get(spec.id);
    if (
      spec.enchant &&
      item &&
      Object.values(inspection.enchants).some(
        (entry) =>
          entry.effectId === spec.enchant &&
          prebisEnchantFits(entry, item, baseline.playerClass, slot, policy),
      )
    )
      output.items[slot].enchant = spec.enchant;
  }
  return output;
}
const weights = [...baseline.settings.epWeightsStats.stats];
weights[18] = weights[13] = Math.max(weights[18] || 0, weights[13] || 0);
weights[19] = weights[14] = Math.max(weights[19] || 0, weights[14] || 0);
const score = (item, slot) =>
  item.stats.reduce((sum, value, index) => sum + value * (weights[index] || 0), 0) +
  (item.weaponSpeed && slot >= 14
    ? ((item.weaponDamageMin + item.weaponDamageMax) / (2 * item.weaponSpeed)) *
      (baseline.settings.epWeightsStats.pseudoStats[slot - 14] || 0)
    : 0);
const pools = original.items.map((spec, slot) =>
  spec.id
    ? db.items
        .filter((item) => eligiblePrebis(item, sources.get(item.id), context, slot))
        .sort((a, b) => score(b, slot) - score(a, slot) || a.id - b.id)
    : [],
);
assert.equal(result.candidateIdsBySlot?.length, 17, "Incomplete candidate pools");
for (const [slot, pool] of pools.entries())
  assert.deepEqual(
    [...result.candidateIdsBySlot[slot]].sort((a, b) => a - b),
    pool.map((item) => item.id).sort((a, b) => a - b),
    `Candidate pool differs for slot ${slot}`,
  );
const finalPass = Math.max(...result.comparisons.map((row) => row.pass));
assert(Number.isSafeInteger(finalPass) && finalPass >= 0 && finalPass < 6);
const final = result.comparisons.filter((row) => row.pass === finalPass);
assert(final.length && final.every((row) => !row.accepted), "Final sweep is not stable");
const cacheFingerprint = hash({
  binarySha256: nativeBinarySha256,
  db: hash(db),
  runner,
  revision: baseline.revision,
});
const cacheRoot = join(archive, "simulation-cache", cacheFingerprint);
const checkedByPrecision = new Map();
const uniqueRecords = new Set();
async function metric(gear, iterations, seed = 1337) {
  const input = {
    requestBase64: baseline.requestBase64,
    gear: gear.items,
    talentsString: selected.talents,
    rotation: selected.rotation.value,
    iterations,
    seed,
    detail: false,
  };
  const id = hash(input);
  const record = await readJson(join(cacheRoot, id + ".json"), cacheRoot);
  assert.equal(record.schema, "kfc-simulation-evidence.v1");
  assert.equal(record.fingerprint, cacheFingerprint);
  assert.equal(record.requestSha256, id);
  assert.equal(record.result?.id, id);
  assert.equal(record.result.iterations, iterations);
  assert(
    Number.isFinite(record.result.dps) &&
      record.result.dps > 0 &&
      Number.isFinite(record.result.stdev) &&
      record.result.stdev >= 0 &&
      !record.result.error,
    "Invalid raw simulation measurement",
  );
  checkedByPrecision.set(iterations, (checkedByPrecision.get(iterations) || 0) + 1);
  uniqueRecords.add(id);
  return { ...record.result, gear };
}
async function batch(gears, iterations) {
  const results = [];
  for (const gear of gears) results.push(await metric(gear, iterations));
  return results;
}
const groups = [];
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
      carryCompatibleEnchants(gear, current, baseline.playerClass, db, inspection, policy),
    );
    const id = hash(value);
    if (!seen.has(id)) {
      seen.add(id);
      proposals.push(value);
    }
  };
  if (typeof slots[0] === "string" && slots[0].startsWith("enchant:")) {
    const slot = Number(slots[0].slice(8));
    const item = items.get(current.items[slot].id);
    if (!item) continue;
    for (const entry of Object.values(inspection.enchants).filter((entry) =>
      prebisEnchantFits(entry, item, baseline.playerClass, slot, policy),
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
      if (!set.has(slot) || score(item, slot) > score(set.get(slot), slot)) set.set(slot, item);
      sets.set(item.setId, set);
    }
    for (const set of sets.values())
      for (const entries of prebisSetSubsets([...set])) {
        const gear = globalThis.structuredClone(current);
        for (const [slot, item] of entries) gear.items[slot] = { id: item.id };
        propose(gear);
      }
  } else if (slots.length === 2) {
    for (const first of pools[slots[0]])
      for (const second of pools[slots[1]]) {
        const gear = globalThis.structuredClone(current);
        gear.items[slots[0]] = { id: first.id };
        gear.items[slots[1]] = { id: second.id };
        propose(gear);
      }
  } else
    for (const item of pools[slots[0]]) {
      const gear = globalThis.structuredClone(current);
      gear.items[slots[0]] = { id: item.id };
      propose(gear);
    }
  if (proposals.length === 1) continue;
  const comparison = final[groups.length];
  assert.deepEqual(comparison?.slots, slots, "Final sweep omitted or reordered a search group");
  assert.equal(comparison.screened, proposals.length, "Incomplete legal proposal coverage");
  const screened = (await batch(proposals, 80)).sort((a, b) => b.dps - a.dps);
  const rechecked = await batch(
    [
      current,
      ...screened
        .filter((entry) => hash(entry.gear) !== hash(current))
        .slice(0, Math.min(128, Math.max(16, Math.ceil(proposals.length / 4))))
        .map((entry) => entry.gear),
    ],
    500,
  );
  rechecked.sort((a, b) => b.dps - a.dps);
  const confirmed = await batch(
    [
      current,
      ...rechecked
        .filter((entry) => hash(entry.gear) !== hash(current))
        .slice(0, 4)
        .map((entry) => entry.gear),
    ],
    2000,
  );
  const best = [...confirmed].sort((a, b) => b.dps - a.dps)[0];
  assert.equal(comparison.beforeDps, confirmed[0].dps);
  assert.equal(comparison.bestDps, best.dps);
  assert.deepEqual(
    comparison.bestItems,
    best.gear.items.map((spec) => spec.id || 0),
  );
  assert.equal(comparison.accepted, best.dps > confirmed[0].dps + 0.05);
  groups.push({
    slots,
    screened: proposals.length,
    rechecked: rechecked.length,
    finalists: confirmed.length,
  });
}
assert.equal(final.length, groups.length, "Unexpected extra final sweep groups");
for (const row of result.validation) {
  for (const name of ["baseline", "candidate"]) {
    const measurement = await metric(
      name === "baseline" ? enchant(original) : current,
      100000,
      row.seed,
    );
    for (const key of ["dps", "stdev", "iterations"])
      assert.equal(measurement[key], row[name][key]);
  }
}
assert.equal(
  result.accepted,
  result.validation.every((row) => statisticallyBetter(row.candidate, row.baseline)),
);
assert.deepEqual(
  result.gear,
  result.accepted ? current : enchant(original),
  "Unvalidated selected gear",
);
console.log(
  JSON.stringify(
    {
      schema: "kfc-readonly-gear-coverage.v1",
      status: "passed",
      auditSourceSha256: hash(await readFile(fileURLToPath(import.meta.url), "utf8")),
      gearReviewSha256: hash(wrapper),
      gearSearchFingerprint: fingerprint,
      nativeBinarySha256,
      dbSha256: hash(db),
      talentTreeSha256: hash(talentTrees),
      cacheFingerprint,
      validationSeedRanges: validationRanges,
      finalPass: finalPass + 1,
      candidateCountBySlot: pools.map((pool) => pool.length),
      groups,
      rawMetricReferencesByIterations: Object.fromEntries(checkedByPrecision),
      uniqueRawCacheRecords: uniqueRecords.size,
      selectedGearEqualsSearchIncumbent: hash(result.gear) === hash(current),
      notice:
        "Read-only replay of saved current-input evidence, not new simulations, publication or global BiS proof. Search precision and independent 100k checks remain distinct; an unproven search gain may correctly retain the original gear. Configured weapon archetypes and set-proposal policy are not expanded by this audit.",
    },
    null,
    2,
  ),
);
