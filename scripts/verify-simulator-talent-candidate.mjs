import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { prebisEnchantPolicy } from "../infra/simulator/prebis-enchants.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { selectedTalentEvidence } from "../infra/simulator/talent-search.mjs";

const root = resolve(import.meta.dirname, "..");
const args = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(baseline|talent-review)=(.+)$/.exec(argument);
  assert(match && !args.has(match[1]), "Pass --baseline=<file> --talent-review=<file> once each");
  args.set(match[1], match[2]);
}
assert.equal(args.size, 2, "Pass --baseline=<file> --talent-review=<file>");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const baseline = await read(args.get("baseline"));
const review = await read(args.get("talent-review"));
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert(["warrior/fury", "warrior/arms"].includes(`${baseline.profile}/${baseline.variant}`));
assert.equal(review.schema, "kfc-talent-search.v1");
assert.equal(review.status, "simulation-complete-awaiting-browser-review");
assert.equal(review.baselineSha256, simulationHash(baseline));
assert.equal(review.dbSha256, baseline.dbSha256);
assert.equal(review.gearSha256, simulationHash(baseline.settings.player.equipment));
assert.equal(review.requestHashEncoding, "json-string");
assert.equal(review.requestSha256, simulationHash(JSON.stringify(baseline.requestBase64)));
const selected = selectedTalentEvidence(review, baseline);
const active = await read("artifacts/forever-simulator/active.json");
assert.equal(baseline.revision, active.revision);
const db = await read(`artifacts/forever-simulator/${active.release}/assets/database/db.json`);
assert.equal(simulationHash(db), baseline.dbSha256);
assert.deepEqual(db, await read(".cache/forever-sim-upstream/assets/database/db.json"));
assert(/^[a-f0-9]{64}$/.test(review.nativeBinarySha256));
const binary = join(
  root,
  "artifacts/forever-simulator/optimization/native-engines",
  "kfc-prebis-" + review.nativeBinarySha256,
);
assert.equal(
  createHash("sha256")
    .update(await readFile(binary))
    .digest("hex"),
  review.nativeBinarySha256,
);
const settings = globalThis.structuredClone(baseline.settings);
settings.player.talentsString = selected.talents;
settings.player.rotation = selected.rotation.value;
assert.equal(settings.player.foreverTier1Bonuses ?? false, false);
assert.equal(settings.player.enableItemSwap ?? false, false);
assert.equal(settings.player.warrior.options.startingRage ?? 0, 0);
const captured = await captureSimulatorRequest(root, settings, {
  release: active.release,
  profile: baseline.profile,
  iterations: 25,
  seed: 1337,
  allowProvisionalEnchants: prebisEnchantPolicy(baseline).provisionalEffectIds.length > 0,
});

// Use the exact archived executable: never rebuild or touch frozen engine inputs while
// another search is running. Compare search context against the actual browser request too.
async function native(id, requestBase64) {
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      binary,
      [],
      {
        cwd: join(root, ".cache/forever-sim-upstream"),
        timeout: 180000,
        maxBuffer: 2_000_000,
        env: { ...process.env, GOMAXPROCS: "1" },
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          assert.equal(result.id, id);
          assert(!result.error, result.error);
          assert.equal(result.iterations, 25);
          assert(Number.isFinite(result.dps) && result.dps > 0);
          resolveResult(result);
        } catch (failure) {
          reject(failure);
        }
      },
    );
    child.stdin.on("error", reject);
    child.stdin.end(
      JSON.stringify({
        id,
        requestBase64,
        gear: settings.player.equipment.items,
        talentsString: selected.talents,
        rotation: selected.rotation.value,
        iterations: 25,
        seed: 1337,
        detail: false,
      }) + "\n",
    );
  });
}

const control = await native("search-context", baseline.requestBase64);
const current = await native("browser-context", captured.requestBase64);
assert.equal(control.dps, current.dps, "The browser changed the controlled search context");
assert(
  Math.abs(current.dps - captured.browserDps) < 0.0051,
  "Native/browser talent candidate mismatch",
);
const receipt = {
  schema: "kfc-talent-candidate-browser-verification.v1",
  baselinePath: args.get("baseline"),
  baselineSha256: simulationHash(baseline),
  talentReviewPath: args.get("talent-review"),
  talentReviewSha256: simulationHash(review),
  release: active.release,
  dbSha256: baseline.dbSha256,
  nativeBinarySha256: review.nativeBinarySha256,
  talents: selected.talents,
  rotationSha256: simulationHash(selected.rotation.value),
  settingsSha256: simulationHash(settings),
  capturedRequestSha256: simulationHash(captured.requestBase64),
  iterations: 25,
  seed: 1337,
  controlledNativeDps: control.dps,
  capturedNativeDps: current.dps,
  browserDps: captured.browserDps,
  verificationScriptSha256: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  notice:
    "Early talent/APL integration check on this baseline's gear only. Not completed equipment feedback, global BiS, a new optimization gain measurement, or authorization to publish a build. Frozen source/catalog inputs are not modified.",
};
const output = join(
  root,
  "artifacts/forever-simulator/optimization",
  `talent-browser-${simulationHash(receipt).slice(0, 16)}.json`,
);
await writeFile(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" }).catch(
  async (error) => {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(output), receipt);
  },
);
console.log(
  JSON.stringify({
    output,
    talents: selected.talents,
    nativeDps: current.dps,
    browserDps: captured.browserDps,
    release: active.release,
  }),
);
