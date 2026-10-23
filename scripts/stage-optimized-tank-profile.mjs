import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import console from "node:console";
import { patchTankNativeEntry } from "../infra/simulator/tank-native-entry.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({
  options: { profile: { type: "string" }, "browser-release": { type: "string" } },
  strict: true,
});
assert(["tank_warrior", "feral_tank_druid", "protection_paladin"].includes(values.profile));
assert(/^[a-f0-9]{24}$/.test(values["browser-release"] ?? ""));
const profile = values.profile,
  browserRelease = values["browser-release"],
  json = async (path) => JSON.parse(await readFile(path, "utf8")),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  hash = (value) => sha(JSON.stringify(value));
const currentReporter = sha(
  await readFile(join(root, "scripts/benchmark-optimized-tank-builds.mjs")),
);
let previousReporter;
async function verifyReporter(checksum) {
  if (checksum === currentReporter) return;
  if (!previousReporter) {
    const archivedReviewId = "e7ce09a7084f096ea319c03937c1c236c364782e55e1c7c21df8b3585af2098b",
      directory = join(base, "review-source-snapshots", archivedReviewId),
      archived = await json(join(directory, "manifest.json"));
    assert.equal(hash(archived.files), archivedReviewId);
    previousReporter = archived.files["scripts/benchmark-optimized-tank-builds.mjs"];
    assert.equal(
      sha(await readFile(join(directory, "scripts/benchmark-optimized-tank-builds.mjs"))),
      previousReporter,
    );
  }
  // The earlier reporter qualified populated-slot builds; its successor also accepts
  // protobuf-equivalent empty off-hand spelling. Combat measurements are unchanged.
  assert.equal(checksum, previousReporter, "Unreviewed tank counter reporter");
}
const api = await import(pathToFileURL(join(root, "packages/forever-data/dist/simulator.js")).href);
const parentDirectory = join(base, "browser-models", browserRelease),
  parent = api.simulatorManifestSchema.parse(await json(join(parentDirectory, "manifest.json"))),
  model = await json(join(parentDirectory, "kfc-tank-browser-research.json")),
  qualification = await json(join(parentDirectory, "browser-review.json"));
assert.equal(qualification.status, "passed");
assert.equal(qualification.release, browserRelease);
assert.equal(qualification.engine, model.engine);
assert.equal(qualification.wasmSha256, model.wasmSha256);
const cases = [];
for (const name of (await readdir(join(base, "runs")))
  .filter((value) => /^[a-f0-9]{64}$/.test(value))
  .sort()) {
  let report;
  try {
    report = await json(join(base, "runs", name, "report.json"));
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  if (
    report.profile !== profile ||
    report.inputs.engine !== model.engine ||
    report.inputs.healthFloor !== "none"
  )
    continue;
  assert.equal(report.fingerprint, name);
  assert.equal(hash(report.inputs), name);
  assert.equal(report.inputs.sourceRelease, model.sourceRelease);
  assert.equal(report.status, "measured-awaiting-model-and-browser-review");
  assert.equal(report.minimumHealth, 0);
  assert(
    report.results.length === 2 && report.results.every((row) => row.accepted && row.converged),
  );
  const replay = await json(join(base, "runs", name, "replay.json")),
    imports = await json(join(base, "runs", name, `imports-${browserRelease}.json`)),
    measurements = await json(join(base, "runs", name, `measurements-${browserRelease}.json`));
  assert.equal(replay.status, "passed");
  assert.equal(replay.reportSha256, hash(report));
  assert.equal(imports.status, "passed");
  assert.equal(imports.reportSha256, hash(report));
  assert.equal(imports.replaySha256, hash(replay));
  assert.equal(measurements.status, "passed");
  assert.equal(measurements.reportSha256, hash(report));
  assert.equal(measurements.importsSha256, hash(imports));
  for (const evidence of [imports, measurements]) {
    assert.equal(evidence.fingerprint, name);
    assert.equal(evidence.release, browserRelease);
    assert.equal(evidence.engine, model.engine);
    assert.equal(evidence.nativeBinarySha256, model.nativeBinarySha256);
    assert.equal(evidence.wasmSha256, model.wasmSha256);
    assert.equal(evidence.databaseSha256, model.databaseSha256);
  }
  await verifyReporter(measurements.sourceSha256.controller);
  assert.equal(
    measurements.sourceSha256.breakdown,
    sha(await readFile(join(root, "infra/simulator/tank-threat-breakdown.mjs"))),
  );
  const provisional = report.inputs.enchantPolicy.provisionalEffectIds.length > 0;
  assert.deepEqual(
    report.inputs.enchantPolicy.provisionalEffectIds,
    provisional ? [36, 803, 1898, 1900] : [],
  );
  cases.push({ report, replay, imports, measurements, provisional });
}
assert.equal(
  cases.length,
  4,
  "All four completed profile cases are required; do not stage a partial comparison",
);
for (const scenario of ["raid", "solo"])
  for (const provisional of [false, true])
    assert.equal(
      cases.filter(
        (entry) => entry.report.scenario === scenario && entry.provisional === provisional,
      ).length,
      1,
    );
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  sha(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const types = await import(pathToFileURL(codec).href),
  require = createRequire(join(root, ".cache/forever-sim-upstream/package.json")),
  esbuild = require("esbuild"),
  ts = require("typescript");
const moduleSource = await readFile(join(root, "infra/simulator/tank-native-library.ts")),
  styles = await readFile(join(root, "infra/simulator/tank-browser.css"));
const compiled = esbuild.transformSync(moduleSource.toString("utf8"), {
  loader: "ts",
  format: "esm",
  target: "es2022",
  minify: false,
  legalComments: "none",
}).code;
const { parseTankNativePayload, tankCombatIdentity } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const selected = [];
for (const entry of cases)
  for (const measurement of entry.measurements.builds) {
    const result = entry.report.results.find((row) => row.objective === measurement.objective),
      imported = entry.imports.builds.find((row) => row.objective === measurement.objective);
    assert(result && imported && result.validation.length === 2);
    assert.equal(measurement.profile, profile);
    assert.equal(measurement.scenario, entry.report.scenario);
    assert.deepEqual(
      types.EquipmentSpec.toBinary(
        types.EquipmentSpec.fromJson(measurement.settings.player.equipment),
      ),
      types.EquipmentSpec.toBinary(types.EquipmentSpec.fromJson(result.gear)),
    );
    assert.deepEqual(measurement.validation, imported.validation);
    assert.equal(measurement.validation.iterations, 40000);
    if (entry.provisional && !measurement.requiresProvisionalEnchantOptIn) continue;
    assert.equal(measurement.requiresProvisionalEnchantOptIn, entry.provisional);
    const settings = globalThis.structuredClone(measurement.settings);
    settings.settings.iterations = 5000;
    settings.settings.fixedRngSeed = "81491001";
    const native = types.IndividualSimSettings.fromJson(settings, { ignoreUnknownFields: false });
    const seenBigInts = [];
    const walk = (value, path = "") => {
      if (typeof value === "bigint") seenBigInts.push(path);
      else if (value && typeof value === "object")
        for (const [key, item] of Object.entries(value)) walk(item, path ? path + "." + key : key);
    };
    walk(native);
    assert.deepEqual(
      seenBigInts,
      ["settings.fixedRngSeed"],
      "New native bigint fields require an explicit import adapter",
    );
    const proto = JSON.parse(
      JSON.stringify(native, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
    const mode = measurement.scenario === "raid" ? "Raid" : "Dungeon",
      goal = measurement.objective === "mitigation" ? "Physical mitigation" : "Threat";
    const warnings = [
      "Simulated pre-raid item search with fixed race, professions, talents and rotation. Health, threat and physical damage taken describe separate trade-offs; magic damage and a universal BiS claim are outside this benchmark.",
      "Historical Classic stats, acquisition and inherited proc models remain provisional where listed. Current-client stats and vendor/reputation access are separate evidence.",
      ...(profile === "tank_warrior"
        ? [
            "Valor uses the inherited 1-PPM reference, not the client's raw 100% chance field. Server cadence remains unverified.",
          ]
        : []),
      ...(profile === "feral_tank_druid"
        ? [
            "Bear ability threat coefficients and incoming rage include inherited, unverified model assumptions.",
          ]
        : []),
      ...new Set(
        measurement.gear
          .filter(
            (item) =>
              item.id &&
              (item.source.status === "classic-provisional" || item.source.acquisitionProvenance),
          )
          .map(
            (item) =>
              `${item.name}: ${item.source.note ?? item.source.acquisition ?? "Acquisition remains provisional."}`,
          ),
      ),
    ];
    selected.push({
      ...measurement,
      label: `${mode} · ${goal}${entry.provisional ? " · Provisional enchants" : ""}`,
      proto,
      settings,
      reference: measurement.validation,
      warnings,
      sourceFingerprint: entry.report.fingerprint,
      sourceMeasurementsSha256: hash(entry.measurements),
    });
  }
selected.sort(
  (a, b) =>
    Number(a.requiresProvisionalEnchantOptIn) - Number(b.requiresProvisionalEnchantOptIn) ||
    Number(a.scenario !== "raid") - Number(b.scenario !== "raid") ||
    Number(a.objective !== "mitigation") - Number(b.objective !== "mitigation"),
);
const payload = {
  schema: "kfc-tank-native-library.v1",
  profile,
  defaultBuildId: selected.find(
    (build) =>
      build.scenario === "raid" &&
      build.objective === "mitigation" &&
      !build.requiresProvisionalEnchantOptIn,
  )?.id,
  builds: selected.map(
    ({
      id,
      label,
      scenario,
      objective,
      requiresProvisionalEnchantOptIn,
      warnings,
      proto,
      reference,
    }) => ({
      id,
      label,
      scenario,
      objective,
      requiresProvisionalEnchantOptIn,
      warnings,
      proto,
      reference,
    }),
  ),
};
parseTankNativePayload(payload);
for (const build of selected)
  assert.equal(
    tankCombatIdentity(build.proto),
    tankCombatIdentity(types.IndividualSimSettings.fromJson(build.settings)),
  );
const inputs = {
  parent: hash(parent),
  researchReview: hash(qualification),
  engine: model.engine,
  profile,
  cases: cases.map((entry) => ({
    fingerprint: entry.report.fingerprint,
    report: hash(entry.report),
    replay: hash(entry.replay),
    imports: hash(entry.imports),
    measurements: hash(entry.measurements),
  })),
  payload: hash(payload),
  library: sha(moduleSource),
  compiled: sha(compiled),
  styles: sha(styles),
  entryAdapter: sha(await readFile(join(root, "infra/simulator/tank-native-entry.mjs"))),
  controller: sha(await readFile(import.meta.filename)),
};
const release = hash(inputs).slice(0, 24),
  directory = join(base, "deliveries", release);
await mkdir(directory, { recursive: true });
const immutable = async (name, bytes) => {
  const path = join(directory, name);
  await mkdir(resolve(path, ".."), { recursive: true });
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.equal(sha(await readFile(path)), sha(bytes), "Immutable tank delivery changed: " + name);
  }
  return { bytes: Buffer.byteLength(bytes), sha256: sha(bytes) };
};
const pageNames = new Map(
  api.SIMULATOR_SPECS.filter((spec) => spec.page !== profile).map((spec) => [
    `${spec.page}/index.html`,
    `/tools/forever/simulator/${spec.slug}`,
  ]),
);
const html = await readFile(join(parentDirectory, profile, "index.html"), "utf8"),
  entries = [...html.matchAll(/src="[^"]*\/bundle\/(ui\/[^" ]+\.entry\.js)"/g)];
assert.equal(entries.length, 1, "Profile entry changed");
const entryName = "bundle/" + entries[0][1],
  files = {};
for (const [name, metadata] of Object.entries(parent.files).sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  assert(
    /^[a-zA-Z0-9_./-]+$/.test(name) && !name.startsWith("/") && !name.split("/").includes(".."),
  );
  if (name === "kfc-tank-browser-research.json") continue;
  let bytes = await readFile(join(parentDirectory, name));
  assert.equal(bytes.length, metadata.bytes);
  assert.equal(sha(bytes), metadata.sha256, name);
  if (pageNames.has(name)) {
    const target = pageNames.get(name);
    bytes = Buffer.from(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Opening approved simulator</title><meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script><a href="${target}">Open simulator</a></html>`,
    );
  } else if (name === "kfc-tank-workspace.css") bytes = styles;
  else if (/\.(js|css|html)$/.test(name)) {
    let source = bytes
      .toString("utf8")
      .replaceAll(`/forever-sim/${browserRelease}/`, `/forever-sim/${release}/`);
    if (name === entryName)
      source = patchTankNativeEntry(
        source,
        profile,
        `/forever-sim/${release}/kfc-tank-native-builds.json`,
        `/forever-sim/${release}/kfc-tank-native-library.js`,
        ts,
      );
    bytes = Buffer.from(source);
  }
  files[name] = await immutable(name, bytes);
}
assert(files[entryName]);
files["kfc-tank-native-library.js"] = await immutable("kfc-tank-native-library.js", compiled);
files["kfc-tank-native-builds.json"] = await immutable(
  "kfc-tank-native-builds.json",
  JSON.stringify(payload, null, 2) + "\n",
);
for (const entry of cases) {
  const name = `tank-measurements/${entry.report.fingerprint}.json`;
  files[name] = await immutable(name, JSON.stringify(entry.measurements, null, 2) + "\n");
}
const builds = selected.map((row) => {
  const build = { ...row };
  delete build.proto;
  return {
    ...build,
    href: `/forever-sim/${release}/${profile}/?i=gtrcmxeu#${deflateSync(types.IndividualSimSettings.toBinary(types.IndividualSimSettings.fromJson(build.settings))).toString("base64")}`,
    settingsSha256: hash(build.settings),
  };
});
const proof = {
  schema: "kfc-optimized-tank-profile.v1",
  status: "staged-awaiting-default-and-preset-review",
  release,
  profile,
  sourceRelease: model.sourceRelease,
  researchRelease: browserRelease,
  sourceManifestSha256: hash(parent),
  engine: model.engine,
  nativeBinarySha256: model.nativeBinarySha256,
  wasmSha256: model.wasmSha256,
  databaseSha256: model.databaseSha256,
  inputs,
  defaultBuildId: payload.defaultBuildId,
  cases: inputs.cases,
  builds,
  notice:
    "Four conservative full tank setups plus separate explicit-consent enchant variants. Saved characters and explicit imports are preserved. Scope is this tank profile only; other workspaces navigate to their approved website route. No active, profile, or publication pointer is written.",
};
files["kfc-optimized-tank-profile.json"] = await immutable(
  "kfc-optimized-tank-profile.json",
  JSON.stringify(proof, null, 2) + "\n",
);
const manifest = api.simulatorManifestSchema.parse({ ...parent, release, files });
await immutable("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(
  JSON.stringify({
    status: proof.status,
    release,
    profile,
    directory,
    builds: builds.length,
    cases: cases.length,
    assets: Object.keys(files).length,
    pointerWrites: 0,
  }),
);
