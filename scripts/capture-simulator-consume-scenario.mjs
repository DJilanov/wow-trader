import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import {
  preRaidConsumeSettings,
  weaponConsumeProblem,
} from "../infra/simulator/prebis-consumes.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = process.argv.find((value) => value.startsWith("--baseline="))?.slice(11);
if (!argument) throw new Error("Pass --baseline=<controlled-baseline.json>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(argument);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert.equal(`${baseline.profile}/${baseline.variant}`, "warrior/fury");
const db = await read(".cache/forever-sim-upstream/assets/database/db.json");
const manifest = await read("artifacts/forever-simulator/active.json");
assert.equal(baseline.dbSha256, simulationHash(db));
assert.equal(baseline.revision, manifest.revision);
const scenario = preRaidConsumeSettings(baseline, db);
assert.equal(weaponConsumeProblem(scenario.settings, db), "");
assert(
  scenario.changes.length > 0,
  "No selected known raid-recipe weapon consumes; reuse the input baseline",
);
const captured = await captureSimulatorRequest(root, scenario.settings, {
  release: manifest.release,
  profile: baseline.profile,
  iterations: 10,
  allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
});
assert.deepEqual(captured.settings.player.consumes, scenario.settings.player.consumes);
const adapted = globalThis.structuredClone(baseline);
adapted.name += " · non-raid weapon consumes";
adapted.sourceRelease = manifest.release;
adapted.settings = captured.settings;
adapted.requestBase64 = captured.requestBase64;
adapted.browserMetrics = captured.metrics;
adapted.capturedAt = new Date().toISOString();
adapted.notice += " " + scenario.notice;
adapted.consumeScenario = {
  id: "non-raid-weapon-consumes",
  baselinePath: argument,
  baselineSha256: simulationHash(baseline),
  changes: scenario.changes,
};
const output = join(
  root,
  "artifacts/forever-simulator/optimization/baselines",
  `warrior-fury-nonraid-consumes-${simulationHash(adapted).slice(0, 16)}.json`,
);
await writeFile(output, JSON.stringify(adapted, null, 2) + "\n");
console.log(JSON.stringify({ output, changes: scenario.changes, metrics: captured.metrics }));
