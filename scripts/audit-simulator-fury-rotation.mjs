import assert from "node:assert/strict";
import { loadBlueControl } from "../infra/simulator/baseline-control.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { resolvedWarriorPolicies } from "../infra/simulator/warrior-policies.mjs";
import { reviewedWarriorRotation } from "../infra/simulator/fury-rotation-audit.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { runIndependentValidation } from "../infra/simulator/validation-runner.mjs";
import { createSimulationCache, simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { statisticallyBetter } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear, prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { decodeTalents, talentProblem } from "../infra/simulator/talent-search.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
  parseValidationIterations,
} from "../infra/simulator/simulation-seeds.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = (name) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const baselinePath = argument("baseline");
const feedbackPath = argument("feedback-review");
const validationIterationsPerSeed = parseValidationIterations(argument("validation-iterations"));
assert(
  baselinePath && feedbackPath,
  "Pass --baseline=<final.json> --feedback-review=<review.json>",
);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(baselinePath);
const feedback = await read(feedbackPath);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
const label = baseline.variant === "arms" ? "Arms" : "Fury";
assert.equal(feedback.status, "closed-loop-verified");
assert.equal(
  feedback.validationSeedPolicy,
  validationSeedPolicy,
  "Refresh legacy feedback validation first",
);
assert.equal(feedback.baselineSha256, simulationHash(baseline));
assert.equal(feedback.dbSha256, baseline.dbSha256);
assert.equal(feedback.revision, baseline.revision);
const db = await read(".cache/forever-sim-upstream/assets/database/db.json");
const inspection = await read(".cache/forever-sim-upstream/ui/core/kfc_inspection.json");
const manifest = await read("artifacts/forever-simulator/active.json");
assert.equal(baseline.dbSha256, simulationHash(db));
assert.equal(baseline.revision, manifest.revision);
const trees = await read(".cache/forever-sim-upstream/ui/core/talents/trees/warrior.json");
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
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
const { control: template } = await loadBlueControl(root, baseline);
const policies = resolvedWarriorPolicies(baseline, template, trees);
const directory = join(root, "artifacts/forever-simulator/optimization");
const workspace = await acquireSimulatorWorkspace(root, resolve(root, feedbackPath));
try {
  const workers = await createNativeRunners(root);
  let report;
  try {
    assert.equal(
      workers[0].binarySha256,
      feedback.nativeBinarySha256,
      "Re-run feedback on the current engine",
    );
    const cache = await createSimulationCache(
      join(directory, "simulation-cache"),
      simulationHash({
        binarySha256: workers[0].binarySha256,
        db: simulationHash(db),
        runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
        revision: baseline.revision,
      }),
      workers,
    );
    const policyInput = (index) => ({
      requestBase64: baseline.requestBase64,
      gear: baseline.settings.player.equipment.items,
      talentsString: baseline.settings.player.talentsString,
      rotation: policies[index].value,
    });
    const describe = ({ dps, stdev, iterations }, index) => ({
      index,
      rotationSha256: simulationHash(policies[index].value),
      name: policies[index].name,
      dps,
      stdev,
      iterations,
    });
    const run = async (indices, iterations, seed) => {
      const rows = await cache.run(
        indices.map((index) => ({ ...policyInput(index), iterations, seed, detail: false })),
      );
      return rows.map((row, i) => describe(row, indices[i]));
    };
    const screen = (
      await run(
        policies.map((_, index) => index),
        1000,
        1337,
      )
    ).sort((a, b) => b.dps - a.dps);
    console.log(
      `Final ${label} rotation audit: ${policies.length} policies on the exact chosen talents/equipment`,
    );
    const finalists = (
      await run([...new Set([0, ...screen.slice(0, 16).map((row) => row.index)])], 10000, 77191)
    ).sort((a, b) => b.dps - a.dps);
    const winner = finalists[0];
    const validationSeedContext = simulationHash({
      baseline: simulationHash(baseline),
      policies: simulationHash(policies),
      binary: workers[0].binarySha256,
      script: await readFile(import.meta.filename, "utf8"),
      validationIterationsPerSeed,
      validationRunner: await readFile(join(root, "infra/simulator/validation-runner.mjs"), "utf8"),
    });
    const checked = await runIndependentValidation(
      cache,
      policyInput(0),
      policyInput(winner.index),
      independentValidationSeeds(validationSeedContext, "rotation"),
      validationIterationsPerSeed,
    );
    const validation = checked.map((row) => ({
      seed: row.seed,
      baseline: describe(row.baseline, 0),
      candidate: describe(row.candidate, winner.index),
    }));
    for (const { seed, baseline: original, candidate } of validation) {
      console.log(
        `Final rotation seed ${seed}: ${original.dps.toFixed(2)} → ${candidate.dps.toFixed(2)} DPS`,
      );
    }
    const validated = validation.every((row) => statisticallyBetter(row.candidate, row.baseline));
    report = {
      schema: `kfc-${baseline.variant}-rotation-audit.v1`,
      status: "rotation-audited-not-promoted",
      baselinePath,
      baselineSha256: simulationHash(baseline),
      feedbackPath,
      feedbackSha256: simulationHash(feedback),
      revision: baseline.revision,
      dbSha256: baseline.dbSha256,
      nativeBinarySha256: workers[0].binarySha256,
      policySetSha256: simulationHash(policies),
      policySourceSha256: simulationHash(
        await readFile(
          join(
            root,
            baseline.variant === "arms"
              ? "infra/simulator/arms-policy.mjs"
              : "infra/simulator/fury-rotations.mjs",
          ),
          "utf8",
        ),
      ),
      talents: baseline.settings.player.talentsString,
      screenSeed: 1337,
      finalistSeed: 77191,
      screen,
      finalists,
      winner: { rotation: policies[winner.index] },
      validation,
      validationSeedPolicy,
      validationSeedContext,
      validationIterationsPerSeed,
      validated,
      selection: {
        rotation: policies[validated ? winner.index : 0],
        reason: validated
          ? "independently-validated-rotation-gain"
          : "kept-incumbent-no-proven-gain",
      },
      cache: cache.stats,
      notice: `Full generated ${label} rage/stance/ability-priority policy coverage on this exact final gear/talent case, deduplicated after resolving available talent actions. Not every possible APL or global BiS. Any proven rotation change needs another gear/talent feedback loop before public promotion.`,
    };
  } finally {
    workers.forEach((worker) => worker.close());
  }
  reviewedWarriorRotation(report, baseline, policies);
  const output = join(
    directory,
    `${baseline.variant}-rotation-audit-${simulationHash(report).slice(0, 16)}.json`,
  );
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  let nextBaseline = resolve(root, baselinePath);
  if (report.validated) {
    const adapted = globalThis.structuredClone(baseline);
    adapted.settings.player.rotation = report.selection.rotation.value;
    const captured = await captureSimulatorRequest(root, adapted.settings, {
      release: manifest.release,
      profile: baseline.profile,
      allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
    });
    adapted.settings = captured.settings;
    adapted.requestBase64 = captured.requestBase64;
    adapted.browserMetrics = captured.metrics;
    adapted.sourceRelease = manifest.release;
    adapted.capturedAt = new Date().toISOString();
    adapted.name += " · full-policy rotation feedback";
    adapted.notice +=
      " Full-policy rotation audit found an independently validated gain; gear and talents must be retested. No inherited convergence claim.";
    delete adapted.predecessor;
    adapted.rotationScenarioParent = {
      baselinePath,
      baselineSha256: simulationHash(baseline),
      rotationAuditPath: output,
      rotationAuditSha256: simulationHash(report),
    };
    nextBaseline = join(
      directory,
      "baselines",
      `warrior-${baseline.variant}-rotation-feedback-${simulationHash(adapted).slice(0, 16)}.json`,
    );
    await writeFile(nextBaseline, JSON.stringify(adapted, null, 2) + "\n");
  }
  console.log(
    JSON.stringify({
      output,
      validated: report.validated,
      nextBaseline,
      selection: report.selection.rotation.name,
    }),
  );
} finally {
  await workspace.release();
}
