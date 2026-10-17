import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { promisify } from "node:util";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import {
  assertDrakkisathDatabase,
  loadDrakkisathEvidence,
} from "../infra/simulator/drakkisath-trinkets.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

assert.equal(process.argv.length, 2, "Drakkisath verification accepts no overrides");
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const upstream = join(root, ".cache/forever-sim-upstream");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const active = await read(join(directory, "active.json"));
const db = await read(join(directory, active.release, "assets/database/db.json"));
assert.deepEqual(db, await read(join(upstream, "assets/database/db.json")));
assertDrakkisathDatabase(db);
const model = await read(join(directory, active.release, "kfc-drakkisath-models.json"));
assert.deepEqual(model, await loadDrakkisathEvidence(root, upstream));

const helper = join(upstream, "sim/common/kfc_drakkisath_trinkets.go");
const testPath = join(upstream, "sim/common/kfc_drakkisath_trinkets_test.go");
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [
      helper,
      testPath,
      join(upstream, "sim/core/target.go"),
      join(upstream, "sim/core/spell_result.go"),
    ].map(async (path) => [
      path.slice(upstream.length + 1),
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    ]),
  ),
);
const stage = join(
  directory,
  "optimization/staged-drakkisath",
  simulationHash({ model, sourceHashes }).slice(0, 16),
);
await mkdir(stage, { recursive: true });
const stub = join(stage, "missing-use.go");
const overlay = join(stage, "without-use.json");
await writeFile(stub, "package common\n");
await writeFile(overlay, JSON.stringify({ Replace: { [helper]: stub } }));
const go = join(root, ".cache/simulator-toolchain/go/bin/go");
const command = [
  "test",
  "-tags",
  "with_db",
  "./sim/common",
  "-run",
  "TestKfcDrakkisath",
  "-count=1",
];
const options = {
  cwd: upstream,
  timeout: 180000,
  maxBuffer: 2_000_000,
  env: { ...process.env, GOTOOLCHAIN: "local" },
};
let red;
try {
  await promisify(execFile)(go, [command[0], "-overlay", overlay, ...command.slice(1)], options);
  assert.fail("The missing-use negative control unexpectedly passed");
} catch (error) {
  assert.equal(error.code, 1, "Negative control must fail its runtime assertion, not compilation");
  assert.match(error.stdout, /Current Drakkisath on-use effects are not registered/);
  red = error.stdout;
}
const green = await promisify(execFile)(go, command, options);
await writeFile(join(stage, "without-use.log"), red);
await writeFile(join(stage, "current-use.log"), green.stdout);
console.log(
  "PASS Go runtime: missing-use control fails; current owner/target scope, actual crit calculations, hit scope, cooldowns, reset and Classic guards pass",
);

const imports = await read(join(directory, active.release, "kfc-prebis-import.json"));
const inspection = await read(join(directory, active.release, "kfc-inspection.json"));
for (const entry of model.models) {
  assert.equal(
    imports.items.find((item) => item.id === entry.itemId)?.status,
    "classic-provisional",
  );
  assert.deepEqual(imports.items.find((item) => item.id === entry.itemId)?.effectModel, entry);
  assert.equal(inspection.items[entry.itemId].modelNote, entry.notice);
}
const requests = await read(join(directory, "optimization/requests.json"));
const warrior = await read(
  join(directory, "optimization/reviewed-builds/warrior-arms-a2d3a980b135f4c6.json"),
);
const warlock = requests.profiles.find(
  (profile) => profile.profile === "warlock" && profile.variant === "affliction",
);
assert(warlock);
const workers = await createNativeRunners(root, 1);
const cases = [];
try {
  for (const [profile, itemId, template] of [
    ["warrior", 13965, warrior],
    ["warlock", 13968, warlock],
  ]) {
    // The engine executes events exactly at the encounter end. Stop one second before
    // a five-minute boundary so a zero-uptime terminal cast is not counted as another use.
    for (const duration of [299, 599]) {
      const settings = globalThis.structuredClone(template.settings);
      settings.player.foreverTier1Bonuses = false;
      settings.player.enableItemSwap = false;
      settings.player.itemSwap = {};
      settings.player.equipment.items[12] = { id: itemId };
      assert(
        !settings.player.equipment.items
          .slice(13, 14)
          .some((item) => [13965, 13968].includes(item.id)),
      );
      settings.encounter.duration = duration;
      settings.encounter.durationVariation = 0;
      settings.player.rotation.priorityList.unshift({
        action: { castSpell: { spellId: { itemId } } },
      });
      const captured = await captureSimulatorRequest(root, settings, {
        release: active.release,
        profile,
        iterations: 25,
        seed: 1337,
      });
      const result = await workers[0].run({
        id: `${itemId}-${duration}`,
        requestBase64: captured.requestBase64,
        gear: captured.settings.player.equipment.items,
        talentsString: captured.settings.player.talentsString,
        rotation: captured.settings.player.rotation,
        duration,
        iterations: 25,
        seed: 1337,
        detail: true,
      });
      assert(
        Math.abs(result.dps - captured.browserDps) < 0.0051,
        `Current trinket browser/native mismatch: ${itemId}, ${duration}s, native ${result.dps}, browser ${captured.browserDps}`,
      );
      const actions = result.metrics?.actions;
      assert(Array.isArray(actions));
      const uses = actions
        .filter((row) => row.id?.itemId === itemId)
        .flatMap((row) => row.targets)
        .reduce((sum, row) => sum + (row.casts ?? 0), 0);
      assert.equal(
        uses,
        duration === 299 ? 25 : 50,
        "Current five-minute use cooldown not applied in combat",
      );
      cases.push({
        profile,
        itemId,
        duration,
        uses,
        nativeDps: result.dps,
        browserDps: captured.browserDps,
        requestSha256: simulationHash(captured.requestBase64),
        settingsSha256: simulationHash(captured.settings),
      });
      console.log(
        `PASS ${profile} / ${itemId} / ${duration}s: native/browser parity and ${uses} uses over 25 runs`,
      );
    }
  }
  const report = {
    schema: "kfc-drakkisath-browser-review.v1",
    release: active.release,
    dbSha256: simulationHash(db),
    nativeBinarySha256: workers[0].binarySha256,
    modelSha256: simulationHash(model),
    sourceHashes,
    goRuntimeReview: { stage, missingUseControl: "expected-runtime-failure", current: "pass" },
    verificationScriptSha256: createHash("sha256")
      .update(await readFile(import.meta.filename))
      .digest("hex"),
    iterations: 25,
    seed: 1337,
    cases,
    notice:
      "Forced integration fixtures, not optimized loadouts or measured comparative gains. Partial readable current effects replace obsolete Classic passives; missing item metadata, empty scripts and Blackhand's Orc/Ogre doubling remain unverified/unmodeled and disclosed. No public build promotion.",
  };
  const output = join(
    directory,
    "optimization",
    `drakkisath-browser-${simulationHash(report).slice(0, 16)}.json`,
  );
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }).catch(
    async (error) => {
      if (error.code !== "EEXIST") throw error;
      assert.deepEqual(await read(output), report);
    },
  );
  console.log(
    JSON.stringify({
      output,
      release: active.release,
      nativeBinarySha256: workers[0].binarySha256,
      cases: cases.length,
    }),
  );
} finally {
  workers.forEach((worker) => worker.close());
}
