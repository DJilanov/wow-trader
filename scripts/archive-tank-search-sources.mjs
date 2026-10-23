import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import console from "node:console";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({ options: { run: { type: "string" } }, strict: true });
assert(/^[a-f0-9]{64}$/.test(values.run ?? ""), "Pass --run=<search fingerprint>");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha(JSON.stringify(value));
const runDirectory = join(base, "runs", values.run),
  raw = JSON.parse(await readFile(join(runDirectory, "inputs.json"), "utf8"));
const { fingerprint, notice, ...inputs } = raw;
assert.equal(fingerprint, values.run);
assert.equal(hash(inputs), fingerprint);
assert.equal(typeof notice, "string");
const entry = "scripts/optimize-simulator-tanks.mjs";
const required = { [entry]: inputs.script };
const helperNames = [
  "tank-optimization.mjs",
  "tank-starters-adapter.mjs",
  "prebis-pool.mjs",
  "prebis-enchants.mjs",
  "equipment-ownership.mjs",
  "default-enchants.mjs",
  "enchant-acquisition.mjs",
];
assert.deepEqual(Object.keys(inputs.helpers).sort(), helperNames.sort());
for (const [name, checksum] of Object.entries(inputs.helpers))
  required["infra/simulator/" + name] = checksum;
for (const [name, checksum] of Object.entries(required))
  assert.equal(
    sha(await readFile(join(root, name))),
    checksum,
    "Source changed since this run started: " + name,
  );
const esbuild = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))("esbuild");
let graph;
try {
  graph = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
} finally {
  esbuild.stop();
}
const files = {},
  contents = new Map();
for (const name of Object.keys(graph.metafile.inputs).sort()) {
  assert(
    /^(infra\/simulator|scripts)\/[a-zA-Z0-9_./-]+\.(mjs|json)$/.test(name) &&
      !name.split("/").includes(".."),
    "Unexpected source graph member: " + name,
  );
  const bytes = await readFile(join(root, name));
  files[name] = sha(bytes);
  contents.set(name, bytes);
}
for (const [name, checksum] of Object.entries(required))
  assert.equal(files[name], checksum, "Source graph omitted or changed a direct input");
const identity = hash(files),
  directory = join(base, "source-snapshots", identity);
const immutable = async (name, bytes) => {
  const path = join(directory, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(sha(await readFile(path)), sha(bytes));
  }
};
for (const [name, bytes] of contents) await immutable(name, bytes);
const manifest = {
  schema: "kfc-tank-source-snapshot.v1",
  identity,
  files,
  notice:
    "Direct inputs match the running search exactly; reachable module source is preserved for review. Import pure helpers for replay. The archived controller is provenance, not a standalone installation or publication approval.",
};
await immutable("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
const reference = {
  schema: "kfc-tank-recorded-sources.v1",
  run: fingerprint,
  path: `source-snapshots/${identity}/manifest.json`,
  sha256: hash(manifest),
  directInputCount: Object.keys(required).length,
};
const path = join(runDirectory, "sources.json");
await writeFile(path + ".pending", JSON.stringify(reference, null, 2) + "\n");
await rename(path + ".pending", path);
console.log(
  JSON.stringify({
    status: "recorded",
    run: fingerprint,
    identity,
    files: Object.keys(files).length,
    directInputCount: reference.directInputCount,
  }),
);
