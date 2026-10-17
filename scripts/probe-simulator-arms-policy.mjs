import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import process from "node:process";
import console from "node:console";
import { armsRotationCandidates, armsRotationForTalents } from "../infra/simulator/arms-policy.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { referenceTalentSeeds } from "../infra/simulator/reference-builds.mjs";
import { createSimulationCache, simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { summarizeTalents, talentsFromFields } from "../infra/simulator/talent-search.mjs";

assert.equal(process.argv.length, 2, "The Arms control probe accepts no arguments");
const root = resolve(import.meta.dirname, "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const directory = join(root, "artifacts/forever-simulator/optimization");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const baseline = await read(join(directory, "baselines/warrior-arms-alliance-blue.json"));
const db = await read(join(upstream, "assets/database/db.json"));
const active = await read(join(root, "artifacts/forever-simulator/active.json"));
assert.equal(baseline.schema, "kfc-optimization-baseline.v1");
assert.equal(baseline.profile, "warrior");
assert.equal(baseline.variant, "arms");
assert.equal(baseline.revision, active.revision);
assert.equal(baseline.dbSha256, simulationHash(db));
const trees = await read(join(upstream, "ui/core/talents/trees/warrior.json"));
const archive = await read(join(root, "infra/simulator/reference-builds.json"));
const reference = referenceTalentSeeds(archive, "warrior", "arms", trees, baseline.revision);
assert.equal(reference.length, 1);
const fields = Object.fromEntries(
  summarizeTalents(trees, baseline.settings.player.talentsString)
    .flatMap((tree) => tree.talents)
    .map((talent) => [talent.field, talent.rank]),
);
const controls = [
  baseline.settings.player.talentsString,
  reference[0].talentsString,
  talentsFromFields(trees, { ...fields, spearingStrike: 0, deflection: 1 }),
  talentsFromFields(trees, { ...fields, bloodthrill: 0, deflection: 5 }),
];
const policies = armsRotationCandidates(baseline.settings.player.rotation);
const jobs = controls.flatMap((talentsString) =>
  policies.map((policy, index) => ({
    id: `${talentsString}:${index}`,
    requestBase64: baseline.requestBase64,
    talentsString,
    rotation: armsRotationForTalents(trees, talentsString, policy.value),
  })),
);
const invalidControl = globalThis.structuredClone(jobs[0]);
invalidControl.id = "invalid-spell-control";
invalidControl.rotation.priorityList.push({
  action: { castSpell: { spellId: { spellId: 999999999 } } },
});
const command = join(upstream, "cmd/kfcaplvalidation");
await mkdir(command, { recursive: true });
await copyFile(join(root, "infra/simulator/apl-validation.go"), join(command, "main.go"));
const binary = join(root, ".cache/simulator-toolchain/bin/kfc-apl-validation");
await promisify(execFile)(
  join(root, ".cache/simulator-toolchain/go/bin/go"),
  ["build", "-tags", "with_db", "-o", binary, "./cmd/kfcaplvalidation"],
  { cwd: upstream, timeout: 180000, env: { ...process.env, GOTOOLCHAIN: "local" } },
);
const child = spawn(binary, [], {
  cwd: upstream,
  env: { ...process.env, GOMAXPROCS: "1" },
  stdio: ["pipe", "pipe", "pipe"],
  timeout: 180000,
});
const closed = once(child, "close");
let stderr = "";
child.stderr.on("data", (bytes) => (stderr = (stderr + bytes).slice(-6000)));
const results = [];
const output = (async () => {
  for await (const line of createInterface({ input: child.stdout })) results.push(JSON.parse(line));
})();
try {
  for (const job of [...jobs, invalidControl])
    if (!child.stdin.write(JSON.stringify(job) + "\n")) await once(child.stdin, "drain");
  child.stdin.end();
  await output;
  const [code] = await closed;
  assert.equal(code, 0, stderr);
  assert.equal(results.length, jobs.length + 1);
  const negative = results.pop();
  assert.equal(negative.id, invalidControl.id);
  assert(!negative.error, negative.error);
  assert(
    negative.warnings.some((warning) => warning.message.includes("does not know spell")),
    "Validator missed the intentionally unavailable spell",
  );
  for (const [index, result] of results.entries()) {
    assert.equal(result.id, jobs[index].id);
    assert(!result.error, result.error);
    assert.deepEqual(result.warnings, [], `APL ${result.id} has engine validation warnings`);
  }
} finally {
  child.kill();
}
console.log(`Arms engine APL validation: ${results.length} policies/controls, zero warnings`);
const workers = await createNativeRunners(root);
try {
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
  const simulations = await cache.run(
    jobs.map((job) => ({
      requestBase64: job.requestBase64,
      gear: baseline.settings.player.equipment.items,
      talentsString: job.talentsString,
      rotation: job.rotation,
      iterations: 5,
      seed: 1337,
      detail: false,
    })),
  );
  assert.equal(simulations.length, jobs.length);
  const receipt = {
    schema: "kfc-arms-policy-probe.v1",
    notice:
      "Five-iteration execution and APL validation smoke only, not a DPS ranking or optimization proof.",
    baselineSha256: simulationHash(baseline),
    dbSha256: baseline.dbSha256,
    treeSha256: simulationHash(trees),
    policySha256: simulationHash(
      await readFile(join(root, "infra/simulator/arms-policy.mjs"), "utf8"),
    ),
    validatorSha256: simulationHash(
      await readFile(join(root, "infra/simulator/apl-validation.go"), "utf8"),
    ),
    probeSha256: simulationHash(await readFile(import.meta.filename, "utf8")),
    nativeBinarySha256: workers[0].binarySha256,
    controls,
    policyCount: policies.length,
    policyValuesSha256: simulationHash(
      jobs.map((job) => ({ talents: job.talentsString, rotation: job.rotation })),
    ),
    validatedCount: results.length,
    warnings: 0,
    unavailableSpellNegativeControl: "rejected-with-engine-warning",
    executionCount: simulations.length,
    iterationsPerJob: 5,
    seed: 1337,
  };
  const path = join(directory, `arms-policy-probe-${simulationHash(receipt).slice(0, 16)}.json`);
  try {
    await writeFile(path, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(path), receipt);
  }
  console.log(JSON.stringify({ output: path, ...receipt, cache: cache.stats }, null, 2));
} finally {
  workers.forEach((worker) => worker.close());
}
