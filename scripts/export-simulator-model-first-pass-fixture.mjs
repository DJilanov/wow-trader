import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { gzipSync, gunzipSync } from "node:zlib";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import { loadModelFirstPassInput } from "./simulator-model-first-pass-input.mjs";

assert(
  process.argv.length === 3 &&
    ["--marksmanship", "--survival", "--feral", "--balance"].includes(process.argv[2]),
);
const survival = process.argv[2] === "--survival";
const feral = process.argv[2] === "--feral";
const balance = process.argv[2] === "--balance";
const compressed = survival || feral || balance;
try {
  const root = resolve(import.meta.dirname, "..");
  const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
  const esbuild = require("esbuild");
  let compiled;
  try {
    compiled = await esbuild.build({
      stdin: {
        contents:
          'export * from "./apps/web/src/lib/forever-simulator-model-first-pass"; export {IndividualSimSettings} from "./.cache/forever-sim-upstream/ui/core/proto/ui";',
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      logLevel: "silent",
    });
  } finally {
    esbuild.stop();
  }
  const api = await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].contents).toString("base64")
  );
  const documents = {};
  const input = await loadModelFirstPassInput(
    root,
    balance
      ? "optimization/balance-first-pass-v1/qualified-build.json"
      : feral
        ? "optimization/feral-first-pass-v2/qualified-build.json"
        : survival
          ? "optimization/hunter-survival-first-pass-v1/qualified-build.json"
          : "optimization/hunter-marksmanship-item-skill-correction-v1/qualified-build.json",
    {
      ...api,
      readSimulatorModelFirstPassBuild: async (entry, options) =>
        api.readSimulatorModelFirstPassBuild(entry, {
          ...options,
          reference: async (reference) => {
            const value = await options.reference(reference);
            assert(!documents[reference.path] || hash(documents[reference.path]) === hash(value));
            documents[reference.path] = value;
            return value;
          },
        }),
    },
  );
  const fixture = {
    schema: "kfc-model-first-pass-reader-fixture.v1",
    scope: balance
      ? "Genuine Balance blue/gear/state/closing selection, canonical display-label-only continuation, fresh40k confirmation, separate1%/2% math and actual10k native/WASM parity. Complete authentic source JSON; no public preset or browser-handoff approval is claimed."
      : feral
        ? "Genuine Feral blue/gear/state/closing selection, fresh40k independent confirmation, original1%/approved2% math and actual10k inspected native/WASM parity. Complete authentic source JSON; no public preset or browser-handoff approval is claimed."
        : survival
          ? "Genuine fresh Survival blue/gear/state selection,40k independent confirmation, original1%/approved2% math and actual10k inspected native/WASM parity. No preset/browser-publication approval is claimed by this fixture. Compressed only for storage; complete source JSON and digests are preserved."
          : "Genuine corrected-model Marksmanship selection,40k confirmation and actual10k inspected native/WASM parity. No preset/browser-publication approval is claimed by this fixture.",
    sourceRelease: input.build.sourceRelease,
    revision: input.build.revision,
    databaseSha256: input.build.dbSha256,
    entry: input.entry,
    documents,
  };
  const path = join(
    root,
    balance
      ? "apps/web/src/lib/fixtures/model-first-pass-balance.json.gz"
      : feral
        ? "apps/web/src/lib/fixtures/model-first-pass-feral.json.gz"
        : survival
          ? "apps/web/src/lib/fixtures/model-first-pass-survival.json.gz"
          : "apps/web/src/lib/fixtures/model-first-pass-marksmanship.json",
  );
  const json = JSON.stringify(fixture, null, 2) + "\n";
  const bytes = compressed ? gzipSync(Buffer.from(json), { level: 9 }) : Buffer.from(json);
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(
      JSON.parse(
        compressed
          ? gunzipSync(await readFile(path)).toString("utf8")
          : await readFile(path, "utf8"),
      ),
      fixture,
      "Immutable actual reader fixture changed",
    );
  }
  console.log(
    JSON.stringify({
      status: "actual-model-first-pass-fixture-exported",
      path,
      sha256: hash(fixture),
      bytes: Buffer.byteLength(bytes),
      documents: Object.keys(documents).length,
      nativeJobs: 0,
      browserJobs: 0,
      publicationAllowed: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "first-pass-fixture-export-failed",
      name: error.name,
      message: error.message,
    }),
  );
  process.exitCode = 1;
}
