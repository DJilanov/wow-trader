import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { inspectionSource } from "../infra/simulator/inspection-data.mjs";
import { tankSearchPolicy } from "../infra/simulator/tank-optimization.mjs";

const root = resolve(import.meta.dirname, "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const mechanics = join(
  root,
  "artifacts/forever-mechanics/70425",
  inspectionSource.hotfix,
  "mechanics-20261016T084757Z-2aedcf9205934b11898d991d60ee8d1d",
);
const manifestBytes = await readFile(join(mechanics, "manifest.json"));
assert.equal(hash(manifestBytes), inspectionSource.manifestSha256);
const manifest = JSON.parse(manifestBytes);
const tables = {};
for (const name of ["SpellEffect", "SpellAuraOptions", "ItemSetSpell"]) {
  const descriptor = manifest.tables[`${name}.effective`];
  const bytes = await readFile(join(mechanics, descriptor.path));
  assert.equal(hash(bytes), descriptor.sha256);
  const rows = gunzipSync(bytes, { maxOutputLength: 80_000_000 })
    .toString()
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(rows.length, descriptor.recordCount);
  tables[name] = rows;
}
const links = tables.ItemSetSpell.filter((row) => row.ItemSetID === 189)
  .map((row) => [row.Threshold, row.SpellID])
  .sort((a, b) => a[0] - b[0]);
assert.deepEqual(links, [
  [2, 18679],
  [3, 13198],
  [4, 1302721],
  [5, 450587],
  [6, 21347],
]);
const one = (table, predicate) => {
  const rows = tables[table].filter(predicate);
  assert.equal(rows.length, 1);
  return rows[0];
};
const chance = one("SpellAuraOptions", (row) => row.SpellID === 450587);
assert.equal(chance.ProcChance, 100);
assert.deepEqual(chance.ProcTypeMask, [4, 0]);
assert.equal(chance.SpellProcsPerMinuteID, 0);
assert.equal(chance.ProcCategoryRecovery, 0);
const trigger = one("SpellEffect", (row) => row.SpellID === 450587 && !row.DifficultyID);
assert.equal(trigger.EffectTriggerSpell, 450589);
assert.equal(trigger.EffectAura, 42);
const heal = one(
  "SpellEffect",
  (row) => row.SpellID === 450589 && row.EffectIndex === 0 && !row.DifficultyID,
);
const rage = one(
  "SpellEffect",
  (row) => row.SpellID === 450589 && row.EffectIndex === 1 && !row.DifficultyID,
);
assert.equal(heal.EffectBasePointsF, 110);
assert.equal(heal.Variance, 0.4);
assert.equal(heal.Effect, 10);
assert.equal(rage.EffectBasePointsF, 100);
assert.equal(rage.Effect, 30);
assert.equal(rage.EffectMiscValue[0], 1);
const regen = one("SpellEffect", (row) => row.SpellID === 21347 && !row.DifficultyID);
assert.equal(regen.EffectAura, 161);
assert.equal(regen.EffectBasePointsF, 15);
const evidence = {
  manifestSha256: hash(manifestBytes),
  links,
  chance,
  trigger,
  heal,
  rage,
  regen,
  notice:
    "Client-backed payload and trigger mask. Client ProcChance=100 does not establish server cadence. Use the inherited same-spell 1-PPM reference as an explicitly unverified assumption; retain the client-chance variant only as sensitivity evidence. Four-piece disarm utility has no trigger in this encounter. Heroism availability is not established by the current acquisition catalog.",
};

const relativeFiles = [];
async function collect(directory) {
  for (const entry of await readdir(join(upstream, directory), { withFileTypes: true })) {
    const name = join(directory, entry.name);
    if (entry.isDirectory()) await collect(name);
    else if (entry.name.endsWith(".go") || entry.name.endsWith(".json")) relativeFiles.push(name);
  }
}
await collect("sim");
await collect("assets/database");
relativeFiles.push("go.mod", "go.sum", "assets/database/db.bin");
const hashes = {};
for (const path of relativeFiles.sort()) hashes[path] = hash(await readFile(join(upstream, path)));
const owned = {};
for (const file of [
  "tank-valor-model.go",
  "tank-valor-model_test.go",
  "dungeon-set-mana_test.go",
  "prebis-runner.go",
  "tank-optimization.mjs",
])
  owned[file] = hash(await readFile(join(root, "infra/simulator", file)));
const dataPaths = {
  database: "assets/database/db.json",
  catalog: "assets/db_inputs/forever_gear_catalog.json",
  imports: "ui/core/kfc_prebis_import.json",
  inspection: "ui/core/kfc_inspection.json",
};
const data = {};
for (const [key, path] of Object.entries(dataPaths)) data[key] = await json(join(upstream, path));
const dataSha256 = Object.fromEntries(
  Object.entries(data).map(([key, value]) => [key, hash(JSON.stringify(value))]),
);
const go = join(root, ".cache/simulator-toolchain/go/bin/go");
const inputs = {
  schema: "kfc-tank-search-engine-inputs.v1",
  sources: hashes,
  owned,
  evidence,
  dataSha256,
  policy: tankSearchPolicy,
  preparationSha256: hash(await readFile(import.meta.filename)),
  compilerSha256: hash(await readFile(go)),
  platform: process.platform,
  architecture: process.arch,
};
const fingerprint = hash(JSON.stringify(inputs));
const directory = join(base, "engines", fingerprint);
await mkdir(directory, { recursive: true });
const workspace = join(directory, "upstream");
await mkdir(workspace, { recursive: true });
for (const path of relativeFiles) {
  const bytes = await readFile(join(upstream, path));
  assert.equal(
    hash(bytes),
    hashes[path],
    "Shared source changed during snapshot; retry preparation",
  );
  const target = join(workspace, path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes);
}
const dispatch = join(workspace, "sim/core/item_sets.go");
const original = "\t\tactiveBonuses = character.foreverEquippedBonuses()\n";
const source = await readFile(dispatch, "utf8");
assert.equal(source.split(original).length, 2);
await writeFile(
  dispatch,
  source.replace(
    original,
    original + "\t\tactiveBonuses = append(activeBonuses, character.kfcValorBonuses()...)\n",
  ),
);
const supportPath = join(workspace, "sim/core/forever_equipment_sets.go");
const support = await readFile(supportPath, "utf8");
const supportReturn = "return foreverEquipmentSets[id].Bonuses[pieces].Supported";
assert.equal(support.split(supportReturn).length, 2);
await writeFile(
  supportPath,
  support.replace(supportReturn, supportReturn + " || (id == 189 && (pieces == 5 || pieces == 6))"),
);
await cp(
  join(root, "infra/simulator/tank-valor-model.go"),
  join(workspace, "sim/core/kfc_valor_model.go"),
);
await cp(
  join(root, "infra/simulator/tank-valor-model_test.go"),
  join(workspace, "sim/common/kfc_valor_model_test.go"),
);
await mkdir(join(workspace, "cmd/kfcprebis"), { recursive: true });
await cp(
  join(root, "infra/simulator/dungeon-set-mana_test.go"),
  join(workspace, "sim/common/kfc_dungeon_set_mana_test.go"),
);
await cp(join(root, "infra/simulator/prebis-runner.go"), join(workspace, "cmd/kfcprebis/main.go"));
for (const [key, path] of Object.entries(dataPaths)) {
  assert.equal(
    hash(JSON.stringify(await json(join(upstream, path)))),
    dataSha256[key],
    "Search metadata changed during snapshot",
  );
  await writeFile(join(directory, `${key}.json`), JSON.stringify(data[key]));
}
assert.equal(
  data.database.items.length,
  2591,
  "A changed item catalog needs a new admission review",
);
const run = promisify(execFile),
  env = { ...process.env, GOTOOLCHAIN: "local", GOMAXPROCS: "4" };
await run(
  go,
  [
    "test",
    "-tags=with_db",
    "./sim/common",
    "./sim/core",
    "-run",
    "TestKfc(Valor|TankStarter|Drakkisath|DungeonSetMana|Enchant|ManualCrowd|FlameWrath|ItemWeaponSkills)",
    "-count=1",
  ],
  { cwd: workspace, env, timeout: 180000 },
);
const binary = join(directory, "kfc-prebis");
await run(go, ["build", "-tags=with_db", "-o", binary, "./cmd/kfcprebis"], {
  cwd: workspace,
  env,
  timeout: 180000,
});
const result = {
  schema: "kfc-tank-search-engine.v1",
  fingerprint,
  inputs,
  binary,
  binarySha256: hash(await readFile(binary)),
  workspace,
  dataSha256,
  status: "isolated-research-not-published",
  preparedAt: new Date().toISOString(),
};
await writeFile(join(directory, "manifest.json"), JSON.stringify(result, null, 2) + "\n");
await mkdir(base, { recursive: true });
await writeFile(
  join(base, "engine.json"),
  JSON.stringify({ fingerprint, manifest: join(directory, "manifest.json") }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: result.status,
    fingerprint,
    binarySha256: result.binarySha256,
    directory,
  }),
);
