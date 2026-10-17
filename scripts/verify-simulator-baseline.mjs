import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import console from "node:console";
import process from "node:process";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";

const root = resolve(import.meta.dirname, "..");
const argument = process.argv.find((value) => value.startsWith("--baseline="))?.slice(11);
if (!argument) throw new Error("Pass --baseline=<controlled-baseline.json>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(argument);
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert.equal(baseline.profile, "warrior");
assert(
  ["fury", "arms"].includes(baseline.variant),
  "Only reviewed warrior baseline policies are available",
);
assert.equal(baseline.playerClass, 9);
const manifest = await read("artifacts/forever-simulator/active.json");
const db = await read(".cache/forever-sim-upstream/assets/database/db.json");
assert.equal(baseline.dbSha256, simulationHash(db));
assert.equal(baseline.revision, manifest.revision);
let workers = [];
try {
  const captured = await captureSimulatorRequest(root, baseline.settings, {
    release: manifest.release,
    profile: baseline.profile,
    allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
  });
  assert.equal(captured.settings.player.foreverTier1Bonuses ?? false, false);
  assert.equal(captured.settings.player.enableItemSwap ?? false, false);
  assert.equal(captured.settings.player.warrior.options.startingRage ?? 0, 0);
  workers = await createNativeRunners(root, 1);
  const request = {
    gear: baseline.settings.player.equipment.items,
    talentsString: baseline.settings.player.talentsString,
    rotation: baseline.settings.player.rotation,
    iterations: 25,
    seed: 1337,
    detail: false,
  };
  const capturedRequest = captured.requestBase64;
  const control = await workers[0].run({
    ...request,
    id: "controlled",
    requestBase64: baseline.requestBase64,
  });
  const current = await workers[0].run({
    ...request,
    id: "browser",
    requestBase64: capturedRequest,
  });
  assert.equal(
    current.dps,
    control.dps,
    "Browser encounter/buff context differs from controlled search",
  );
  const browserDps = captured.browserDps;
  assert(
    Number.isFinite(browserDps) && Math.abs(browserDps - current.dps) < 0.0051,
    "Native/browser combat mismatch",
  );
  const receipt = {
    schema: "kfc-baseline-browser-verification.v1",
    baselinePath: argument,
    baselineSha256: simulationHash(baseline),
    release: manifest.release,
    dbSha256: baseline.dbSha256,
    nativeBinarySha256: workers[0].binarySha256,
    capturedRequestSha256: simulationHash(capturedRequest),
    iterations: 25,
    seed: 1337,
    controlledNativeDps: control.dps,
    capturedNativeDps: current.dps,
    browserDps,
    provisionalEnchantsEnabled: captured.provisionalEnchantsEnabled,
    notice:
      "Deterministic context/parity check only; does not establish an optimization gain or global BiS.",
  };
  const output = join(
    root,
    "artifacts/forever-simulator/optimization",
    `browser-verification-${simulationHash(receipt).slice(0, 16)}.json`,
  );
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({ output, nativeDps: current.dps, browserDps, release: manifest.release }),
  );
} finally {
  for (const worker of workers) worker.close();
}
