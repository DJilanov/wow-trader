import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

assert.equal(process.argv.length, 2, "Dungeon-mana verification accepts no overrides");
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const active = await read(join(directory, "active.json"));
const models = await read(join(directory, active.release, "kfc-dungeon-mana-models.json"));
assert.equal(models.schema, "kfc-dungeon-mana-models.v1");
assert.deepEqual(
  models.models.map((model) => model.id),
  [181, 182, 186],
);
const requests = await read(join(directory, "optimization/requests.json"));
assert.equal(
  requests.revision,
  active.revision,
  "Integration controls use another engine revision",
);
const db = await read(join(directory, active.release, "assets/database/db.json"));
assert.equal(
  simulationHash(db),
  simulationHash(await read(join(root, ".cache/forever-sim-upstream/assets/database/db.json"))),
  "Browser and native item databases differ",
);
const archivedDb = await read(join(directory, "23e8cccb25de7635d64ebdaa/assets/database/db.json"));
assert.equal(
  simulationHash(archivedDb),
  "b11f758667ebd0556fabf9c3bf65f73f948cc3f237842364640583e07720344e",
);
assert.deepEqual(db.enchants, archivedDb.enchants, "Archived-engine enchant data changed");
const oldSha = "62fe851bfa71ae05c499d7efbf8bf08719e06cb4293fb6295380c0c8fca6b05d";
const archived = join(directory, "optimization/native-engines", `kfc-prebis-${oldSha}`);
assert.equal(
  createHash("sha256")
    .update(await readFile(archived))
    .digest("hex"),
  oldSha,
);

async function oldEngine(input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(archived, [], {
      cwd: join(root, ".cache/forever-sim-upstream"),
      env: { ...process.env, GOMAXPROCS: "1" },
      signal: globalThis.AbortSignal.timeout(180000),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (bytes) => {
      stdout += bytes.toString("utf8");
      if (stdout.length > 4_000_000) {
        child.kill();
        reject(new Error("Archived engine result exceeds its size limit"));
      }
    });
    child.stderr.on("data", (bytes) => {
      stderr = (stderr + bytes).slice(-6000);
    });
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => {
      try {
        assert.equal(code, 0, `Archived engine failed: ${stderr}`);
        const result = JSON.parse(stdout.trim());
        assert.equal(result.id, input.id);
        assert(!result.error, result.error);
        assert(Number.isFinite(result.dps) && result.dps > 0);
        resolveResult(result);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(input) + "\n");
  });
}

function manaGain(result, spellId) {
  assert(Array.isArray(result.metrics?.resources), "Native resource metrics missing");
  return result.metrics.resources
    .filter((row) => row.id?.spellId === spellId && row.type === "ResourceTypeMana")
    .reduce((sum, row) => {
      assert(Number.isFinite(row.actualGain));
      return sum + row.actualGain;
    }, 0);
}

const workers = await createNativeRunners(root, 1);
const cases = [];
try {
  assert.notEqual(workers[0].binarySha256, oldSha);
  for (const fixture of [
    {
      setId: 181,
      profile: "mage",
      variant: "fire",
      spellId: 450527,
      items: [16686, 16689, 16688, 16684, 16687],
    },
    {
      setId: 182,
      profile: "shadow_priest",
      variant: "shadow",
      spellId: 450576,
      items: [16693, 16695, 16690, 16692, 16694],
    },
    {
      setId: 186,
      profile: "hunter",
      variant: "beast_mastery",
      spellId: 450577,
      items: [16677, 16679, 16674, 16676, 16678],
    },
  ]) {
    const source = requests.profiles.find(
      (entry) => entry.profile === fixture.profile && entry.variant === fixture.variant,
    );
    assert(source, `Missing captured integration control ${fixture.profile}/${fixture.variant}`);
    const settings = globalThis.structuredClone(source.settings);
    settings.player.foreverTier1Bonuses = false;
    settings.player.enableItemSwap = false;
    settings.player.itemSwap = {};
    const slots = [0, 2, 4, 6, 8];
    fixture.items.forEach((id, index) => {
      assert.equal(db.items.find((item) => item.id === id)?.setId, fixture.setId);
      settings.player.equipment.items[slots[index]] = { id };
    });
    for (const item of settings.player.equipment.items) {
      if (!item.id) continue;
      const currentItem = db.items.find((row) => row.id === item.id);
      const oldItem = archivedDb.items.find((row) => row.id === item.id);
      assert(currentItem && oldItem, `Fixture item ${item.id} is unavailable in one engine`);
      assert.deepEqual(currentItem, oldItem, `Archived-engine item data changed: ${item.id}`);
    }
    const captured = await captureSimulatorRequest(root, settings, {
      release: active.release,
      profile: fixture.profile,
      iterations: 25,
      seed: 1337,
    });
    const input = {
      id: `dungeon-mana-${fixture.setId}`,
      requestBase64: captured.requestBase64,
      gear: captured.settings.player.equipment.items,
      talentsString: captured.settings.player.talentsString,
      rotation: captured.settings.player.rotation,
      iterations: 25,
      seed: 1337,
      detail: true,
    };
    const current = await workers[0].run(input);
    const previous = await oldEngine(input);
    assert(
      Math.abs(current.dps - captured.browserDps) < 0.0051,
      `Browser/native mismatch for set ${fixture.setId}`,
    );
    const currentMana = manaGain(current, fixture.spellId);
    const previousMana = manaGain(previous, fixture.spellId);
    assert(currentMana > 0, `No real mana recovery for set ${fixture.setId}`);
    assert.equal(
      previousMana,
      0,
      `Archived engine unexpectedly recovered mana for set ${fixture.setId}`,
    );
    cases.push({
      profile: fixture.profile,
      variant: fixture.variant,
      setId: fixture.setId,
      requestSha256: simulationHash(captured.requestBase64),
      settingsSha256: simulationHash(captured.settings),
      nativeDps: current.dps,
      browserDps: captured.browserDps,
      oldNativeDps: previous.dps,
      currentManaRecovered: currentMana,
      oldManaRecovered: previousMana,
    });
    console.log(
      `PASS set ${fixture.setId}: browser/native combat parity; real mana recovery ${previousMana} → ${currentMana}`,
    );
  }
  const report = {
    schema: "kfc-dungeon-mana-browser-review.v1",
    release: active.release,
    dbSha256: simulationHash(db),
    nativeBinarySha256: workers[0].binarySha256,
    oldNativeBinarySha256: oldSha,
    modelManifestSha256: simulationHash(models),
    verificationScriptSha256: createHash("sha256")
      .update(await readFile(import.meta.filename))
      .digest("hex"),
    archivedDbSha256: simulationHash(archivedDb),
    iterations: 25,
    seed: 1337,
    cases,
    notice:
      "Three non-optimized integration fixtures, not BiS recommendations or statistical DPS-gain claims. Current engine and real browser agree; archived engine has no recovery for the same exact requests. Server proc behavior is not independently verified.",
  };
  const output = join(
    directory,
    "optimization",
    `dungeon-mana-browser-${simulationHash(report).slice(0, 16)}.json`,
  );
  try {
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(output), report);
  }
  console.log(
    JSON.stringify({
      output,
      native: report.nativeBinarySha256,
      release: active.release,
      cases: cases.length,
    }),
  );
} finally {
  workers.forEach((worker) => worker.close());
}
