import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import process from "node:process";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import {
  brotliCompressSync,
  brotliDecompressSync,
  constants,
  gzipSync,
  gunzipSync,
} from "node:zlib";
import { parseArgs } from "node:util";
import {
  shamanHealerLibraryIndexSchema,
  parseShamanHealerGroupPayload,
  parseShamanHealerCatalogPayload,
} from "../packages/forever-data/dist/shaman-healer-library.js";
import {
  shamanHealerPresentationSchema,
  shamanHealerReleaseSchema,
} from "../packages/forever-data/dist/shaman-healer-release.js";
import {
  configurationForShamanHealerBuild,
  shamanHealerConfigurationProblem,
} from "../packages/forever-data/dist/shaman-healer-workspace.js";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const identity = (bytes) => ({ bytes: bytes.length, sha256: sha(bytes) });

/** Build immutable browser assets from already-reviewed inputs; no numerical search is run. */
export async function prepareShamanHealerBrowser({
  libraryDirectory,
  presentationFile,
  wasmFile,
  runtimeFile,
  codecFile,
  expectedWasmSha256,
  expectedRuntimeSha256,
  expectedCodecSha256,
  outputDirectory,
  esbuildPackage,
}) {
  for (const value of [expectedWasmSha256, expectedRuntimeSha256, expectedCodecSha256])
    if (!/^[a-f0-9]{64}$/.test(value ?? ""))
      throw new Error("Pinned runtime, WASM and codec checksums are required");
  const indexBytes = await readFile(join(libraryDirectory, "library-index.json"));
  const index = shamanHealerLibraryIndexSchema.parse(JSON.parse(indexBytes));
  const presentationBytes = await readFile(presentationFile);
  const presentation = shamanHealerPresentationSchema.parse(JSON.parse(presentationBytes));
  if (
    presentation.modelIdentity !== index.modelIdentity ||
    presentation.runtimeIdentity !== index.runtimeIdentity ||
    presentation.libraryIndexSha256 !== sha(indexBytes)
  )
    throw new Error("Shaman presentation and library differ");
  const files = new Map([
    ["library-index.json", indexBytes],
    ["presentation.json", presentationBytes],
  ]);
  for (const descriptor of [index.catalog, ...index.groups.map((entry) => entry.asset)]) {
    const bytes = await readFile(join(libraryDirectory, descriptor.file));
    if (bytes.length !== descriptor.bytes || sha(bytes) !== descriptor.byteSha256)
      throw new Error("Shaman library input changed: " + descriptor.file);
    const parsed = JSON.parse(bytes);
    if (descriptor.file === index.catalog.file) parseShamanHealerCatalogPayload(index, parsed);
    else {
      const group = parseShamanHealerGroupPayload(index, parsed);
      for (const source of group.configurations) {
        const config = configurationForShamanHealerBuild(index, group, "0".repeat(24), source.id);
        const problem = shamanHealerConfigurationProblem(
          index,
          group,
          presentation,
          config,
          config.release,
        );
        if (problem) throw new Error(group.group.title + ": " + problem);
      }
    }
    files.set(descriptor.file, bytes);
  }
  for (const [name, path, expected] of [
    ["healing.wasm", wasmFile, expectedWasmSha256],
    ["wasm_exec.js", runtimeFile, expectedRuntimeSha256],
  ]) {
    const bytes = await readFile(path);
    if (sha(bytes) !== expected) throw new Error("Frozen Shaman runtime changed: " + name);
    files.set(name, bytes);
  }
  const codecBytes = await readFile(codecFile);
  if (sha(codecBytes) !== expectedCodecSha256)
    throw new Error("Frozen Shaman protobuf codec changed");
  const require = createRequire(resolve(esbuildPackage));
  const { build } = require("esbuild");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const entry = (path) => JSON.stringify(resolve(root, path));
  const requestSource = `import * as api from ${JSON.stringify(resolve(codecFile))};
import {createShamanHealingBrowserJob} from ${entry("infra/simulator/shaman-healing-browser-request.mjs")};
export function createJob(input) {return createShamanHealingBrowserJob({...api,eligibleRaces:[1,5,6,7,10],shamanClass:api.Class.ClassShaman,foreverRuleset:api.Ruleset.RulesetForever},input);}`;
  const workerSource = `import {installShamanHealingWorker} from ${entry("infra/simulator/shaman-healing-worker.mjs")};
import {shamanHealingJobSchema,shamanHealingReplySchema} from ${entry("packages/forever-data/dist/shaman-healing-simulator.js")};
installShamanHealingWorker({runtimeURL:new URL('wasm_exec.js',self.location.href).href,wasmURL:new URL('healing.wasm',self.location.href).href,parseJob:value=>shamanHealingJobSchema.parse(value),parseReply:value=>shamanHealingReplySchema.parse(value)});`;
  for (const [name, contents, format] of [
    ["request-codec.js", requestSource, "esm"],
    ["healing-worker.js", workerSource, "iife"],
  ]) {
    const result = await build({
      stdin: { contents, resolveDir: root, sourcefile: name },
      bundle: true,
      write: false,
      format,
      platform: "browser",
      target: "es2022",
      minify: true,
      metafile: true,
      legalComments: "inline",
    });
    const imports = Object.keys(result.metafile.inputs);
    if (imports.some((path) => path.endsWith("simulation-cache.mjs")))
      throw new Error("Protected cache helper entered the browser build");
    if (result.outputFiles.length !== 1) throw new Error("Unexpected Shaman browser chunks");
    files.set(name, Buffer.from(result.outputFiles[0].contents));
  }
  const identities = Object.fromEntries([...files].map(([name, bytes]) => [name, identity(bytes)]));
  const release = sha(
    JSON.stringify({
      model: index.modelIdentity,
      runtime: index.runtimeIdentity,
      files: identities,
    }),
  ).slice(0, 24);
  const directory = join(resolve(outputDirectory), release);
  await mkdir(resolve(outputDirectory), { recursive: true });
  await mkdir(directory, { recursive: false });
  try {
    const encodings = {};
    for (const [name, bytes] of files) {
      await writeFile(join(directory, name), bytes, { flag: "wx" });
      const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }),
        gzip = gzipSync(bytes, { level: 9 });
      if (!brotliDecompressSync(br).equals(bytes) || !gunzipSync(gzip).equals(bytes))
        throw new Error("Shaman compression round-trip failed");
      await writeFile(join(directory, name + ".br"), br, { flag: "wx" });
      await writeFile(join(directory, name + ".gz"), gzip, { flag: "wx" });
      encodings[name] = { br: identity(br), gzip: identity(gzip) };
    }
    const manifest = shamanHealerReleaseSchema.parse({
      schema: "kfc-shaman-healer-browser-release.v1",
      release,
      profile: "healing-shaman",
      modelIdentity: index.modelIdentity,
      runtimeIdentity: index.runtimeIdentity,
      libraryIndexSha256: sha(indexBytes),
      preparedAt: new Date().toISOString(),
      files: identities,
      encodings,
    });
    await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest) + "\n", {
      flag: "wx",
    });
    return {
      directory,
      manifest,
      configurationCount: index.groups.reduce(
        (count, entry) => count + entry.group.configurationIds.length,
        0,
      ),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: Object.fromEntries(
      [
        "library",
        "presentation",
        "wasm",
        "runtime",
        "codec",
        "wasm-sha",
        "runtime-sha",
        "codec-sha",
        "out",
        "esbuild-package",
      ].map((key) => [key, { type: "string" }]),
    ),
  });
  for (const key of [
    "library",
    "presentation",
    "wasm",
    "runtime",
    "codec",
    "wasm-sha",
    "runtime-sha",
    "codec-sha",
    "out",
    "esbuild-package",
  ])
    if (!values[key]) throw new Error("Missing --" + key);
  await mkdir(resolve(values.out), { recursive: true });
  const result = await prepareShamanHealerBrowser({
    libraryDirectory: values.library,
    presentationFile: values.presentation,
    wasmFile: values.wasm,
    runtimeFile: values.runtime,
    codecFile: values.codec,
    expectedWasmSha256: values["wasm-sha"],
    expectedRuntimeSha256: values["runtime-sha"],
    expectedCodecSha256: values["codec-sha"],
    outputDirectory: values.out,
    esbuildPackage: values["esbuild-package"],
  });
  const temporary = join(resolve(values.out), ".prepared-" + process.pid + ".json");
  await writeFile(temporary, JSON.stringify(result.manifest) + "\n", { flag: "wx" });
  await rename(temporary, join(resolve(values.out), "prepared.json"));
  console.log(
    JSON.stringify({
      release: result.manifest.release,
      directory: result.directory,
      configurationCount: result.configurationCount,
      activated: false,
    }),
  );
}
