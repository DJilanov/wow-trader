import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { createSimulationCache, simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { defaultEnchantFits } from "../infra/simulator/default-enchants.mjs";
import { prebisEnchantProblem } from "../infra/simulator/enchant-acquisition.mjs";
import { statisticallyBetter } from "../infra/simulator/prebis-pool.mjs";
import { describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import { talentProblem, decodeTalents } from "../infra/simulator/talent-search.mjs";
import {
  independentValidationSeeds,
  validationSeedPolicy,
} from "../infra/simulator/simulation-seeds.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = process.argv.find((value) => value.startsWith("--baseline="))?.slice(11);
if (!argument) throw new Error("Pass --baseline=<controlled-Fury-baseline.json>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(argument);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert.equal(`${baseline.profile}/${baseline.variant}`, "warrior/fury");
assert.equal(baseline.playerClass, 9);
assert.equal(baseline.settings.player.foreverTier1Bonuses ?? false, false);
assert.equal(baseline.settings.player.enableItemSwap ?? false, false);
const db = await read(".cache/forever-sim-upstream/assets/database/db.json");
const inspection = await read(".cache/forever-sim-upstream/ui/core/kfc_inspection.json");
assert.equal(baseline.dbSha256, simulationHash(db));
describePrebisGear(
  baseline.settings.player.equipment,
  baseline.profile,
  baseline.variant,
  baseline.playerClass,
  db,
  inspection,
);
const trees = await read(".cache/forever-sim-upstream/ui/core/talents/trees/warrior.json");
assert.equal(
  talentProblem(trees, decodeTalents(trees, baseline.settings.player.talentsString)),
  "",
);
const candidates = Object.values(inspection.enchants).filter(
  (enchant) => enchant.effectId === 1900,
);
assert.equal(candidates.length, 1, "Crusader enchant identity changed");
const crusader = candidates[0];
assert.equal(
  crusader.status,
  "provisional",
  "Re-review the proc evidence before changing this benchmark",
);
assert.equal(prebisEnchantProblem(crusader), "");
for (const slot of [14, 15]) {
  const item = db.items.find(
    (item) => item.id === baseline.settings.player.equipment.items[slot]?.id,
  );
  // Check compatibility without relabeling the saved evidence or enabling the
  // public UI's provisional switch. This is a separate native-only experiment.
  assert(
    item && defaultEnchantFits({ ...crusader, status: "static" }, item, baseline.playerClass, slot),
    "Incompatible Crusader experiment",
  );
}
const variants = [
  { name: "Static incumbent", slots: [] },
  { name: "Crusader main hand", slots: [14] },
  { name: "Crusader off hand", slots: [15] },
  { name: "Crusader both weapons", slots: [14, 15] },
].map((variant) => {
  const gear = globalThis.structuredClone(baseline.settings.player.equipment);
  for (const slot of variant.slots) gear.items[slot].enchant = 1900;
  return { name: variant.name, gear };
});
const workers = await createNativeRunners(root, 1);
try {
  const fingerprint = simulationHash({
    binarySha256: workers[0].binarySha256,
    db: simulationHash(db),
    runner: await readFile(join(root, "infra/simulator/prebis-runner.go"), "utf8"),
    revision: baseline.revision,
  });
  const cache = await createSimulationCache(
    join(root, "artifacts/forever-simulator/optimization/simulation-cache"),
    fingerprint,
    workers,
  );
  const checks = [];
  const validationSeedContext = simulationHash({
    baseline: simulationHash(baseline),
    fingerprint,
    script: await readFile(import.meta.filename, "utf8"),
  });
  for (const seed of independentValidationSeeds(validationSeedContext, "proc")) {
    const results = await cache.run(
      variants.map((variant) => ({
        requestBase64: baseline.requestBase64,
        gear: variant.gear.items,
        talentsString: baseline.settings.player.talentsString,
        rotation: baseline.settings.player.rotation,
        iterations: 20000,
        seed,
        detail: false,
      })),
    );
    checks.push({
      seed,
      variants: results.map(({ dps, stdev, iterations }, index) => ({
        name: variants[index].name,
        dps,
        stdev,
        iterations,
      })),
    });
    console.log(
      `Crusader sensitivity seed ${seed}: ${checks
        .at(-1)
        .variants.map((row) => `${row.name} ${row.dps.toFixed(2)}`)
        .join("; ")}`,
    );
  }
  const report = {
    schema: "kfc-provisional-enchant-sensitivity.v1",
    status: "native-experiment-not-promoted",
    baselinePath: argument,
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    revision: baseline.revision,
    nativeBinarySha256: workers[0].binarySha256,
    enchantEffectId: 1900,
    model:
      "Maintained engine's provisional 1 PPM Crusader, 100 Strength for 15 seconds per weapon at level 60. Proc probability remains unverified in Forever.",
    notice:
      "A model sensitivity, not verified game behavior, a public preset or a completed gear/talent optimization. The inherited consumables remain unchanged. The public explicit opt-in guard is not weakened.",
    checks,
    validationSeedPolicy,
    validationSeedContext,
    improvements: variants.slice(1).map((variant, index) => ({
      name: variant.name,
      independentlyImproves: checks.every((check) =>
        statisticallyBetter(check.variants[index + 1], check.variants[0]),
      ),
    })),
    cache: cache.stats,
  };
  const output = join(
    root,
    "artifacts/forever-simulator/optimization",
    `proc-sensitivity-${simulationHash(report).slice(0, 16)}.json`,
  );
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, improvements: report.improvements }));
} finally {
  for (const worker of workers) worker.close();
}
