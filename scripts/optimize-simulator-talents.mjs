import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { loadBlueControl } from "../infra/simulator/baseline-control.mjs";
import { runIndependentValidation } from "../infra/simulator/validation-runner.mjs";
import { furyRotationCandidates } from "../infra/simulator/fury-rotations.mjs";
import {
  armsRotationCandidates,
  armsRotationForTalents,
  armsTalentSeeds,
} from "../infra/simulator/arms-policy.mjs";
import { assertCompletedTalentEvidence } from "../infra/simulator/talent-evidence.mjs";
import { prebisEnchantPolicy, describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import { referenceTalentSeeds } from "../infra/simulator/reference-builds.mjs";
import { createSimulationCache } from "../infra/simulator/retained-simulation-cache.mjs";
import { statisticallyBetter } from "../infra/simulator/prebis-pool.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
  parseValidationIterations,
} from "../infra/simulator/simulation-seeds.mjs";
import {
  decodeTalents,
  encodeTalents,
  talentProblem,
  talentsFromFields,
  talentNeighbors,
  summarizeTalents,
  mergeTalentSimulation,
  talentFinalists,
} from "../infra/simulator/talent-search.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator/optimization");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const argumentsByName = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(spec|baseline|validation-iterations)=(.+)$/.exec(argument);
  if (!match || argumentsByName.has(match[1]))
    throw new Error(`Unknown, empty or duplicate talent-search argument: ${argument}`);
  argumentsByName.set(match[1], match[2]);
}
const validationIterationsPerSeed = parseValidationIterations(
  argumentsByName.get("validation-iterations"),
);
const selected = argumentsByName.get("spec");
if (!["warrior/fury", "warrior/arms"].includes(selected))
  throw new Error("Use a reviewed talent policy: --spec=warrior/fury or --spec=warrior/arms.");
const baselinePath =
  argumentsByName.get("baseline") ||
  (selected === "warrior/arms"
    ? "artifacts/forever-simulator/optimization/baselines/warrior-arms-alliance-blue.json"
    : "artifacts/forever-simulator/optimization/baselines/warrior-fury-blue.json");
const profile = await read(resolve(root, baselinePath));
assert.equal(profile.schema, "kfc-optimization-baseline.v1");
assert.equal(`${profile.profile}/${profile.variant}`, selected);
assert.equal(profile.playerClass, 9);
const isArms = profile.variant === "arms";
const label = isArms ? "Arms" : "Fury";
const db = await read(join(root, ".cache/forever-sim-upstream/assets/database/db.json"));
assert.equal(profile.dbSha256, hash(db), "Baseline database changed; recapture/adapt explicitly");
const trees = await read(
  join(root, ".cache/forever-sim-upstream/ui/core/talents/trees/warrior.json"),
);
const gear = profile.settings.player.equipment;
if (isArms) {
  assert.equal(
    db.items.find((item) => item.id === gear.items[14]?.id)?.handType,
    4,
    "Arms control requires a two-hand weapon",
  );
  assert(!gear.items[15]?.id, "Arms control must have an empty off-hand");
}
const inspection = await read(
  join(root, ".cache/forever-sim-upstream/ui/core/kfc_inspection.json"),
);
describePrebisGear(
  gear,
  profile.profile,
  profile.variant,
  profile.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(profile),
);
const originalTalents = encodeTalents(decodeTalents(trees, profile.settings.player.talentsString));
assert.equal(talentProblem(trees, decodeTalents(trees, originalTalents)), "");
const originalRotation = profile.settings.player.rotation;
const { control } = await loadBlueControl(root, profile);
let rotations = (isArms ? armsRotationCandidates : furyRotationCandidates)(
  originalRotation,
  control.settings.player.rotation,
);
const resolveRotation = (talents, value) =>
  isArms ? armsRotationForTalents(trees, talents, value) : value;
assert.deepEqual(
  resolveRotation(originalTalents, originalRotation),
  originalRotation,
  "Remove unavailable talent actions and recapture the incumbent explicitly",
);
const baselineArms = {
  improvedHeroicStrike: 2,
  improvedRend: 3,
  improvedTacticalMastery: 5,
  improvedOverpower: 2,
  angerManagement: 1,
  deepWounds: 3,
  impale: 2,
};
const furyCore = {
  boomingVoice: 2,
  cruelty: 5,
  unbridledWrath: 5,
  furiousPrecision: 3,
  dualWieldSpecialization: 5,
  ragingBlows: 1,
  deathWish: 1,
  flurry: 5,
  bloodthirst: 1,
};
const seeds = new Set([originalTalents]);
const referenceArchive = await read(join(root, "infra/simulator/reference-builds.json"));
const referenceSeeds = referenceTalentSeeds(
  referenceArchive,
  profile.profile,
  profile.variant,
  trees,
  profile.revision,
);
for (const candidate of referenceSeeds) seeds.add(candidate.talentsString);
if (!isArms)
  for (const heroicStrike of [2, 3])
    for (const overpower of [0, 1, 2])
      for (const anger of [0, 1])
        for (const improvedExecute of [0, 1, 2])
          for (const improvedBerserkerRage of [0, 1, 2])
            for (const improvedBloodrage of [0, 1, 2]) {
              const fields = {
                ...baselineArms,
                ...furyCore,
                improvedHeroicStrike: heroicStrike,
                improvedOverpower: overpower,
                angerManagement: anger,
                improvedExecute,
                improvedBerserkerRage,
                improvedBloodrage,
              };
              const remaining = 51 - Object.values(fields).reduce((sum, value) => sum + value, 0);
              if (remaining < 0 || remaining > 5) continue;
              fields.enrage = remaining;
              try {
                seeds.add(talentsFromFields(trees, fields));
              } catch (error) {
                if (!/Locked tier|Missing prerequisite/.test(error.message)) throw error;
              }
              if (improvedBloodrage > 0 && heroicStrike === 2) {
                const heroic = {
                  ...fields,
                  improvedHeroicStrike: 3,
                  improvedBloodrage: improvedBloodrage - 1,
                };
                try {
                  seeds.add(talentsFromFields(trees, heroic));
                } catch (error) {
                  if (!/Locked tier|Missing prerequisite/.test(error.message)) throw error;
                }
              }
            }
if (isArms) {
  const expanded = armsTalentSeeds(trees, [
    originalTalents,
    control.settings.player.talentsString,
    ...referenceSeeds.map((candidate) => candidate.talentsString),
  ]);
  for (const candidate of expanded) seeds.add(candidate);
}
const workers = await createNativeRunners(root);
const searchInputs = {
  script: await readFile(import.meta.filename, "utf8"),
  rotations: await readFile(
    join(root, isArms ? "infra/simulator/arms-policy.mjs" : "infra/simulator/fury-rotations.mjs"),
    "utf8",
  ),
  evidence: await readFile(join(root, "infra/simulator/talent-evidence.mjs"), "utf8"),
  rotationTemplate: hash(control.settings.player.rotation),
  controlBaselineSha256: hash(control),
  controlLoader: await readFile(join(root, "infra/simulator/baseline-control.mjs"), "utf8"),
  talents: await readFile(join(root, "infra/simulator/talent-search.mjs"), "utf8"),
  statistics: await readFile(join(root, "infra/simulator/prebis-pool.mjs"), "utf8"),
  references: hash(referenceArchive),
  seedPolicy: await readFile(join(root, "infra/simulator/simulation-seeds.mjs"), "utf8"),
  validationIterationsPerSeed,
  validationRunner: await readFile(join(root, "infra/simulator/validation-runner.mjs"), "utf8"),
};
const validationSeedContext = hash({
  baseline: profile,
  algorithm: hash(searchInputs),
  binary: workers[0].binarySha256,
});
const ignoredUtilityFields = [
  "boomingVoice",
  "lingeringRage",
  "piercingHowl",
  "bloodCraze",
  "improvedIntercept",
  "deflection",
  "ironWill",
  "anticipation",
  "improvedDisarm",
  "improvedRevenge",
];
const runnerFingerprint = hash({
  binarySha256: workers[0].binarySha256,
  db: hash(db),
  runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
  revision: profile.revision,
});
const cache = await createSimulationCache(
  join(directory, "simulation-cache"),
  runnerFingerprint,
  workers,
);
const output = join(
  directory,
  `warrior-${profile.variant}-${hash({ baseline: profile, algorithm: hash(searchInputs), nativeBinarySha256: workers[0].binarySha256 }).slice(0, 16)}-talents.json`,
);
let simulations = 0,
  iterations = 0;
const run = async (candidates, count, seed, detail = false) => {
  const inputs = candidates.map((candidate) => {
    assert.equal(talentProblem(trees, decodeTalents(trees, candidate.talents)), "");
    return {
      requestBase64: profile.requestBase64,
      gear: gear.items,
      talentsString: candidate.talents,
      rotation: resolveRotation(candidate.talents, rotations[candidate.rotation].value),
      iterations: count,
      seed,
      detail,
    };
  });
  const results = await cache.run(inputs);
  simulations = cache.stats.simulations;
  iterations = cache.stats.iterations;
  return results.map((result, index) => mergeTalentSimulation(result, candidates[index]));
};
try {
  const expected = {
    baseline: profile,
    nativeBinarySha256: workers[0].binarySha256,
    algorithmSha256: hash(searchInputs),
    optimizerSha256: hash(searchInputs.script),
    controlBaselineSha256: searchInputs.controlBaselineSha256,
    validationSeedContext,
    validationIterationsPerSeed,
  };
  let completed;
  try {
    completed = await read(output);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (completed) {
    assertCompletedTalentEvidence(
      completed,
      expected,
      trees,
      rotations.map((policy) => resolveRotation(completed.winner.talents, policy.value)),
    );
    console.log(
      `${label} talent evidence saved: ${output}; reused completed evidence without new simulations or rewriting measurements`,
    );
  } else {
    console.log(
      `${label} input: ${baselinePath}; ${seeds.size} legal seeds; native ${workers[0].binarySha256.slice(0, 12)}; ${workers.length} workers`,
    );
    const rageSeed = [...seeds].find((talents) =>
      summarizeTalents(trees, talents).some((tree) =>
        tree.talents.some(
          (talent) => talent.field === "improvedBerserkerRage" && talent.rank === 2,
        ),
      ),
    );
    if (!isArms) assert(rageSeed);
    const slamRank = (talents) =>
      summarizeTalents(trees, talents)
        .flatMap((tree) => tree.talents)
        .find((talent) => talent.field === "improvedSlam")?.rank ?? 0;
    const slamSeeds = [
      ...new Set([
        originalTalents,
        control.settings.player.talentsString,
        ...referenceSeeds.map((candidate) => candidate.talentsString),
      ]),
    ].sort((a, b) => slamRank(a) - slamRank(b));
    const screeningSeeds = isArms ? [...new Set([slamSeeds[0], slamSeeds.at(-1)])] : [rageSeed];
    if (isArms)
      assert(
        slamRank(screeningSeeds[0]) === 0 && slamRank(screeningSeeds.at(-1)) === 2,
        "Arms screening needs both untalented and fully talented Slam controls",
      );
    const rotationScreen = (
      await run(
        screeningSeeds.flatMap((talents) =>
          rotations.map((_, rotation) => ({ talents, rotation })),
        ),
        1000,
        1337,
      )
    ).sort((a, b) => b.dps - a.dps);
    const rotationIndices = [
      ...new Set([
        0,
        ...screeningSeeds.flatMap((talents) => {
          const screen = rotationScreen.filter((entry) => entry.talents === talents);
          return [
            ...screen.slice(0, 5).map((entry) => entry.rotation),
            ...[...new Set(rotations.map((rotation) => rotation.family))].flatMap((family) =>
              screen
                .filter((entry) => rotations[entry.rotation].family === family)
                .slice(0, 2)
                .map((entry) => entry.rotation),
            ),
            ...(isArms
              ? [...new Set(rotations.map((rotation) => rotation.stance))].flatMap((stance) =>
                  screen
                    .filter((entry) => rotations[entry.rotation].stance === stance)
                    .slice(0, 1)
                    .map((entry) => entry.rotation),
                )
              : []),
          ];
        }),
      ]),
    ];
    const rotationEvidence = rotationScreen.map((entry) => ({
      dps: entry.dps,
      stdev: entry.stdev,
      iterations: entry.iterations,
      name: rotations[entry.rotation].name,
      family: rotations[entry.rotation].family,
      talents: entry.talents,
    }));
    const testedRotationCount = rotations.length;
    rotations = rotationIndices.map((index) => rotations[index]);
    console.log(
      `${label} rotation audit: tested ${testedRotationCount} policies on ${screeningSeeds.length} talent control(s); retained ${rotations.length}`,
    );
    let candidates = [...seeds].flatMap((talents) =>
      rotations.map((_, rotation) => ({ talents, rotation })),
    );
    let ranked = (await run(candidates, 500, 1337)).sort((a, b) => b.dps - a.dps);
    console.log(
      `${label} talent audit: ${seeds.size} legal seed builds × ${rotations.length} APL variants`,
    );
    const history = [];
    let elite = [];
    let previous = "",
      stableRounds = 0;
    for (let round = 0; round < 8; round++) {
      const finalists = await run(
        talentFinalists(trees, ranked, elite, 10, ignoredUtilityFields),
        4000,
        1337,
      );
      ranked = finalists.sort((a, b) => b.dps - a.dps);
      elite = ranked.slice(0, 2);
      const best = ranked[0];
      const identity = `${best.talents}:${best.rotation}`;
      stableRounds = identity === previous ? stableRounds + 1 : 0;
      previous = identity;
      history.push({
        round,
        best: {
          talents: best.talents,
          rotation: rotations[best.rotation].name,
          dps: best.dps,
          stdev: best.stdev,
        },
        tested: simulations,
      });
      await writeFile(
        output + ".checkpoint.json",
        JSON.stringify(
          {
            schema: "kfc-talent-search-checkpoint.v1",
            baselinePath,
            history,
            elite,
            cache: cache.stats,
          },
          null,
          2,
        ),
      );
      console.log(
        `${label} talents round ${round + 1}: ${best.talents} / ${rotations[best.rotation].name} / ${best.dps.toFixed(2)} DPS (${simulations} real sims)`,
      );
      if (stableRounds >= 2) break;
      const next = new Map();
      for (const parent of ranked.slice(0, 4)) {
        for (const talents of [
          parent.talents,
          ...talentNeighbors(
            trees,
            parent.talents,
            isArms ? { mortalStrike: 1 } : { bloodthirst: 1 },
          ),
        ]) {
          for (const rotation of rotations.map((_, index) => index))
            next.set(`${talents}:${rotation}`, { talents, rotation });
        }
      }
      candidates = [...next.values()];
      ranked = (await run(candidates, 200, 1337)).sort((a, b) => b.dps - a.dps);
    }
    const finalists = (
      await run(talentFinalists(trees, ranked, elite, 8, ignoredUtilityFields), 10000, 77191)
    ).sort((a, b) => b.dps - a.dps);
    const winner = finalists[0];
    const baseline = { talents: originalTalents, rotation: 0 };
    const validationInput = (candidate) => ({
      requestBase64: profile.requestBase64,
      gear: gear.items,
      talentsString: candidate.talents,
      rotation: resolveRotation(candidate.talents, rotations[candidate.rotation].value),
      detail: true,
    });
    const checked = await runIndependentValidation(
      cache,
      validationInput(baseline),
      validationInput(winner),
      independentValidationSeeds(validationSeedContext, "talents"),
      validationIterationsPerSeed,
    );
    simulations = cache.stats.simulations;
    iterations = cache.stats.iterations;
    const validation = checked.map((row) => ({
      seed: row.seed,
      baseline: mergeTalentSimulation(row.baseline, baseline),
      candidate: mergeTalentSimulation(row.candidate, winner),
    }));
    const evidence = {
      schema: "kfc-talent-search.v1",
      status: "simulation-complete-awaiting-browser-review",
      profile: selected,
      revision: profile.revision,
      baselinePath,
      baselineSha256: hash(profile),
      baselineNotice: profile.notice,
      dbSha256: hash(db),
      treeSha256: hash(trees),
      referenceSeeds: referenceSeeds.map((build) => ({
        id: build.id,
        source: build.source,
        sourceResponseSha256: build.sourceResponseSha256,
      })),
      requestSha256: hash(profile.requestBase64),
      requestHashEncoding: "json-string",
      gearSha256: hash(gear),
      optimizerSha256: hash(searchInputs.script),
      controlBaselineSha256: searchInputs.controlBaselineSha256,
      algorithmSha256: hash(searchInputs),
      nativeBinarySha256: workers[0].binarySha256,
      rotationSearch: rotationEvidence,
      notice: `Best tested ${label} talent/APL combination for this gear and one 300-second level-63 target, not global proof. Incoming damage is not invented. Enrage and utility choices remain encounter-dependent. Gear must be reoptimized with these talents before finalizing a pre-raid preset.`,
      original: { talents: originalTalents, allocation: summarizeTalents(trees, originalTalents) },
      winner: {
        talents: winner.talents,
        rotation: {
          ...rotations[winner.rotation],
          value: resolveRotation(winner.talents, rotations[winner.rotation].value),
        },
        allocation: summarizeTalents(trees, winner.talents),
      },
      selection: validation.every((entry) => statisticallyBetter(entry.candidate, entry.baseline))
        ? {
            talents: winner.talents,
            rotation: {
              ...rotations[winner.rotation],
              value: resolveRotation(winner.talents, rotations[winner.rotation].value),
            },
            allocation: summarizeTalents(trees, winner.talents),
            reason: "independently-validated-gain",
          }
        : {
            talents: originalTalents,
            rotation: { name: "Original resolved rotation", value: originalRotation },
            allocation: summarizeTalents(trees, originalTalents),
            reason: "kept-incumbent-no-proven-gain",
          },
      history,
      finalists: finalists.map(({ talents, rotation, dps, stdev, iterations }) => ({
        talents,
        rotation: rotations[rotation].name,
        dps,
        stdev,
        iterations,
      })),
      validation,
      validationSeedContext,
      validationSeedPolicy,
      validationIterationsPerSeed,
      validated: validation.every((entry) => statisticallyBetter(entry.candidate, entry.baseline)),
      simulations,
      iterations,
    };
    assertCompletedTalentEvidence(
      evidence,
      expected,
      trees,
      rotations.map((policy) => resolveRotation(winner.talents, policy.value)),
    );
    await writeFile(output, JSON.stringify(evidence, null, 2), { flag: "wx" });
    console.log(
      `${label} talent evidence saved: ${output}; ${simulations} simulations, ${iterations} iterations; winning build ${winner.talents}`,
    );
  }
} finally {
  workers.forEach((worker) => worker.close());
}
