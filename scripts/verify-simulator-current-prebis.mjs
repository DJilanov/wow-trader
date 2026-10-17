import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import { loadCurrentPrebisRecovery } from "../infra/simulator/current-prebis-recovery.mjs";
import { createNativeRunners } from "../infra/simulator/native-runner.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

assert.equal(process.argv.length, 2, "Current-item verification accepts no overrides");
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const upstream = join(root, ".cache/forever-sim-upstream");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const active = await read(join(directory, "active.json"));
const db = await read(join(directory, active.release, "assets/database/db.json"));
assert.deepEqual(db, await read(join(upstream, "assets/database/db.json")));
const imported = await read(join(directory, active.release, "kfc-prebis-import.json"));
const inspection = await read(join(directory, active.release, "kfc-inspection.json"));
const recovered = await loadCurrentPrebisRecovery(root, upstream, { items: db.items });
assert.equal(recovered.addedCount, 0, "Published database is missing a reviewed current item");
assert.deepEqual(imported.currentItems, recovered.currentItems);
for (const source of recovered.currentItems) {
  const metadata = inspection.items[source.id];
  assert.equal(metadata.provenance, source.status);
  assert.equal(metadata.provenanceNote, source.note);
  assert.equal(metadata.requiredLevel, source.requiredLevel);
  assert.equal(metadata.setId, source.setId);
  assert.equal(metadata.limitCategory, source.limitCategory);
}
const review = await read(join(root, "infra/simulator/current-prebis-equipment.json"));
for (const { id } of review.blocked) assert(!db.items.some((item) => item.id === id));
const requests = await read(join(directory, "optimization/requests.json"));
assert.equal(requests.revision, active.revision);

const workers = await createNativeRunners(root, 1);
const cases = [];
try {
  for (const fixture of [
    {
      profile: "rogue",
      variant: "combat",
      race: "RaceHuman",
      faction: "Alliance",
      slots: [
        [4, 23298],
        [2, 23313],
      ],
    },
    {
      profile: "warlock",
      variant: "demonology",
      slots: [
        [5, 13107],
        [3, 10776],
      ],
    },
    { profile: "hunter", variant: "beast_mastery", slots: [[5, 16681]] },
  ]) {
    const source = requests.profiles.find(
      (entry) => entry.profile === fixture.profile && entry.variant === fixture.variant,
    );
    assert(source, `Missing integration control: ${fixture.profile}/${fixture.variant}`);
    const settings = globalThis.structuredClone(source.settings);
    settings.player.foreverTier1Bonuses = false;
    settings.player.enableItemSwap = false;
    settings.player.itemSwap = {};
    if (fixture.race) settings.player.race = fixture.race;
    if (fixture.faction) settings.settings.faction = fixture.faction;
    for (const [slot, id] of fixture.slots) settings.player.equipment.items[slot] = { id };
    const captured = await captureSimulatorRequest(root, settings, {
      release: active.release,
      profile: fixture.profile,
      iterations: 25,
      seed: 1337,
    });
    const result = await workers[0].run({
      id: `current-recovery-${fixture.profile}`,
      requestBase64: captured.requestBase64,
      gear: captured.settings.player.equipment.items,
      talentsString: captured.settings.player.talentsString,
      rotation: captured.settings.player.rotation,
      iterations: 25,
      seed: 1337,
    });
    assert(
      Math.abs(result.dps - captured.browserDps) < 0.0051,
      `Recovered-item browser/native mismatch: ${fixture.profile}`,
    );
    cases.push({
      profile: fixture.profile,
      variant: fixture.variant,
      recoveredItemIds: fixture.slots.map(([, id]) => id),
      settingsSha256: simulationHash(captured.settings),
      requestSha256: simulationHash(captured.requestBase64),
      nativeDps: result.dps,
      browserDps: captured.browserDps,
    });
    console.log(
      `PASS recovered ${fixture.profile}: real browser/native combat parity (${result.dps.toFixed(2)} DPS)`,
    );
  }
  const report = {
    schema: "kfc-current-prebis-browser-review.v1",
    release: active.release,
    revision: active.revision,
    dbSha256: simulationHash(db),
    reviewSha256: simulationHash(review),
    sourceManifestSha256: review.mechanicsManifestBytesSha256,
    currentItemsSha256: simulationHash(recovered.currentItems),
    inspectionSha256: simulationHash(inspection),
    nativeBinarySha256: workers[0].binarySha256,
    verificationScriptSha256: createHash("sha256")
      .update(await readFile(import.meta.filename))
      .digest("hex"),
    reviewedItemCount: recovered.currentItems.length,
    iterations: 25,
    seed: 1337,
    cases,
    notice:
      "Non-optimized integration fixtures, not recommended pre-BiS builds. Current stats and metadata are revalidated against the pinned raw client tables; historical acquisition and PvP access remain provisional. Unsupported item/set utility and proc effects remain excluded or disclosed. Browser/native agreement does not verify server behavior.",
  };
  const output = join(
    directory,
    "optimization",
    `current-prebis-browser-${simulationHash(report).slice(0, 16)}.json`,
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
      dbSha256: report.dbSha256,
      cases: cases.length,
    }),
  );
} finally {
  workers.forEach((worker) => worker.close());
}
