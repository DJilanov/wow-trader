import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { prebisEnchantPolicy, describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import { provisionalWarriorWeaponSettings } from "../infra/simulator/prebis-proc-scenario.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

const root = resolve(import.meta.dirname, "..");
assert(
  process.argv.length === 3 && /^--baseline=.+$/.test(process.argv[2]),
  "Pass only --baseline=<controlled-warrior-baseline.json>",
);
const argument = process.argv[2].slice(11);
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(argument);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
assert.equal(baseline.playerClass, 9);
const db = await read(".cache/forever-sim-upstream/assets/database/db.json");
const inspection = await read(".cache/forever-sim-upstream/ui/core/kfc_inspection.json");
const manifest = await read("artifacts/forever-simulator/active.json");
assert.equal(baseline.dbSha256, simulationHash(db));
assert.equal(baseline.revision, manifest.revision);
const adapted = globalThis.structuredClone(baseline);
Object.assign(adapted, provisionalWarriorWeaponSettings(baseline, db, inspection));
delete adapted.predecessor;
delete adapted.rotationScenarioParent;
describePrebisGear(
  adapted.settings.player.equipment,
  adapted.profile,
  adapted.variant,
  adapted.playerClass,
  db,
  inspection,
  prebisEnchantPolicy(adapted),
);
const captured = await captureSimulatorRequest(root, adapted.settings, {
  release: manifest.release,
  profile: adapted.profile,
  allowProvisionalEnchants: true,
});
assert.equal(captured.provisionalEnchantsEnabled, true);
adapted.settings = captured.settings;
adapted.requestBase64 = captured.requestBase64;
adapted.browserMetrics = captured.metrics;
adapted.sourceRelease = manifest.release;
adapted.capturedAt = new Date().toISOString();
adapted.name += " · provisional Crusader experiment";
adapted.notice +=
  " " +
  adapted.enchantPolicy.notice +
  " Retest talents/APL and all gear; prior optimality and DPS are not inherited.";
adapted.enchantScenarioParent = {
  baselinePath: argument,
  baselineSha256: simulationHash(baseline),
};
const output = join(
  root,
  "artifacts/forever-simulator/optimization/baselines",
  `warrior-${baseline.variant}-crusader-${simulationHash(adapted).slice(0, 16)}.json`,
);
await writeFile(output, JSON.stringify(adapted, null, 2) + "\n");
console.log(
  JSON.stringify({ output, metrics: captured.metrics, notice: adapted.enchantPolicy.notice }),
);
