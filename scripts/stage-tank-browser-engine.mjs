import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { patchTankPickerPolearms } from "../infra/simulator/tank-picker-polearms.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha(JSON.stringify(value));
const pointer = await json(join(base, "engine.json")),
  engine = await json(pointer.manifest);
assert.equal(engine.schema, "kfc-tank-search-engine.v1");
assert.equal(engine.fingerprint, pointer.fingerprint);
assert.equal(hash(engine.inputs), engine.fingerprint);
const engineDirectory = resolve(pointer.manifest, "..");
assert.equal(sha(await readFile(engine.binary)), engine.binarySha256);
const qualification = await json(join(engineDirectory, "qualification.json"));
assert.equal(qualification.status, "passed");
assert.equal(qualification.engine, engine.fingerprint);
assert.equal(qualification.nativeSha256, engine.binarySha256);
assert.equal(qualification.checked.length, 14);
const wasm = await readFile(join(engineDirectory, "lib.wasm"));
assert.equal(sha(wasm), qualification.wasmSha256);
const api = await import(pathToFileURL(join(root, "packages/forever-data/dist/simulator.js")).href);
const parentRelease = "3c62628f43a96aa1d77e702b",
  parentDirectory = join(root, "artifacts/forever-simulator", parentRelease);
const parent = api.simulatorManifestSchema.parse(
  await json(join(parentDirectory, "manifest.json")),
);
assert.equal(parent.release, parentRelease);
const database = await json(join(engineDirectory, "database.json"));
assert.equal(hash(database), engine.dataSha256.database);
assert.equal(
  hash(await json(join(parentDirectory, "assets/database/db.json"))),
  hash(database),
  "A changed catalog needs its own presentation admission",
);
const ts = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("typescript");
const tankStyles = await readFile(join(root, "infra/simulator/tank-browser.css"));
const inputs = {
  parent: hash(parent),
  engine: engine.fingerprint,
  wasm: sha(wasm),
  qualification: hash(qualification),
  pickerAdapter: sha(await readFile(join(root, "infra/simulator/tank-picker-polearms.mjs"))),
  tankStyles: sha(tankStyles),
  script: sha(await readFile(import.meta.filename)),
};
const release = hash(inputs).slice(0, 24),
  directory = join(base, "browser-models", release);
await mkdir(directory, { recursive: true });
const immutable = async (name, bytes) => {
  const path = join(directory, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(
      sha(await readFile(path)),
      sha(bytes),
      "Research release already exists with different bytes: " + name,
    );
  }
  return { bytes: bytes.length, sha256: sha(bytes) };
};
const redirects = new Map(
  api.SIMULATOR_SPECS.filter((spec) => spec.role !== "tank").map((spec) => [
    `${spec.page}/index.html`,
    `/tools/forever/simulator/${spec.slug}`,
  ]),
);
for (const page of ["bis", "dps_rankings", "scrub", "stat_weights"])
  redirects.set(page + "/index.html", "/tools/forever/simulator");
const files = {},
  presentationChanges = [];
let pickerTables = 0;
for (const [name, expected] of Object.entries(parent.files).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  assert(
    /^[a-zA-Z0-9_./-]+$/.test(name) &&
      !name.startsWith("/") &&
      !name.split("/").some((part) => part === ".." || part === "."),
    "Unsafe parent asset path",
  );
  if (["kfc-reviewed-presets.json", "kfc-preset-safety.json"].includes(name)) continue;
  let bytes = await readFile(join(parentDirectory, name));
  assert.equal(bytes.length, expected.bytes);
  assert.equal(sha(bytes), expected.sha256, name);
  if (name === "lib.wasm") bytes = wasm;
  else if (redirects.has(name)) {
    const target = redirects.get(name);
    bytes = Buffer.from(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Opening approved simulator</title><meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script><a href="${target}">Open simulator</a></html>`,
    );
  } else if (/\.(html|js|css)$/.test(name)) {
    let source = bytes
      .toString("utf8")
      .replaceAll(`/forever-sim/${parentRelease}/`, `/forever-sim/${release}/`);
    if (name.endsWith(".js")) {
      const patched = patchTankPickerPolearms(source, ts);
      pickerTables += patched.matched;
      if (patched.modified)
        presentationChanges.push({
          asset: name,
          kind: "druid-polearm-picker",
          sourceSha256: expected.sha256,
        });
      source = patched.source;
    }
    if (
      ["tank_warrior", "feral_tank_druid", "protection_paladin"].some(
        (profile) => name === `${profile}/index.html`,
      )
    ) {
      assert.equal(source.split("</head>").length, 2);
      source = source.replace(
        "</head>",
        `<link rel="stylesheet" href="/forever-sim/${release}/kfc-tank-workspace.css"></head>`,
      );
    }
    bytes = Buffer.from(source);
  }
  files[name] = await immutable(name, bytes);
}
assert.equal(pickerTables, 1, "Missing/ambiguous Druid weapon picker table");
files["kfc-tank-workspace.css"] = await immutable("kfc-tank-workspace.css", tankStyles);
const provenance = {
  schema: "kfc-tank-browser-research.v1",
  status: "research-only-not-optimized-defaults",
  release,
  sourceRelease: parentRelease,
  engine: engine.fingerprint,
  nativeBinarySha256: engine.binarySha256,
  wasmSha256: sha(wasm),
  databaseSha256: hash(database),
  inputs,
  presentationChanges,
  notice:
    "Isolated tank engine and picker qualification. Existing starter gear is retained. No active, profile or publication pointer is changed. Other simulator classes navigate to their approved website workspaces. Optimized defaults require completed item searches and separate delivery review.",
};
const provenanceBytes = Buffer.from(JSON.stringify(provenance, null, 2) + "\n");
files["kfc-tank-browser-research.json"] = await immutable(
  "kfc-tank-browser-research.json",
  provenanceBytes,
);
const manifest = api.simulatorManifestSchema.parse({
  ...parent,
  release,
  files,
  preparedAt: engine.preparedAt,
});
await immutable("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
console.log(
  JSON.stringify({
    status: provenance.status,
    release,
    directory,
    assets: Object.keys(files).length,
    presentationChanges,
    pointerWrites: 0,
  }),
);
