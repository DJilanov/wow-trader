import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  statfs,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";
import { deflateSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import {
  auditPresetGear,
  presetAcquisitionProblem,
  repairStarterPreset,
} from "../infra/simulator/preset-acquisition.mjs";
import { describePrebisGear } from "../infra/simulator/prebis-enchants.mjs";
import { prebisEnchantProblem } from "../infra/simulator/enchant-acquisition.mjs";
import { simulationHash as hash } from "../infra/simulator/simulation-cache.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";
import { linkWorkspaceStyles } from "../infra/simulator/workspace-adapter.mjs";
import { completeSimulatorStatLabels } from "../infra/simulator/stat-labels.mjs";
import { loadReviewedPresetInputs } from "./simulator-reviewed-preset-inputs.mjs";
import {
  loadCumulativeModelFirstPassInputs,
  modelFirstPassShareHref,
} from "./simulator-model-first-pass-input.mjs";
import { hunterMarksmanshipModelPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/hunter-marksmanship-model-preset-overlay-v1.mjs";
import { hunterSurvivalFirstPassPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/hunter-survival-first-pass-preset-overlay-v1.mjs";
import { feralFirstPassPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/feral-first-pass-preset-overlay-v1.mjs";
import { balanceFirstPassPresetFiles } from "../artifacts/forever-simulator/optimization/review-tools/balance-first-pass-preset-overlay-v1.mjs";

assert(
  [3, 4].includes(process.argv.length) &&
    ["--plan", "--build", "--model-update"].includes(process.argv[2]) &&
    (process.argv.length === 3 ||
      (process.argv[2] === "--model-update" &&
        /^--first-pass=optimization\/[a-z0-9-]+\/qualified-build\.json$/.test(process.argv[3]))),
  "Use --plan, --build or --model-update [--first-pass=optimization/<study>/qualified-build.json]; no active pointers are changed",
);
const modelUpdate = process.argv[2] === "--model-update";
const firstPassPath = process.argv[3]?.slice("--first-pass=".length);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = join(root, ".cache/forever-sim-upstream");
const directory = join(root, "artifacts/forever-simulator");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const require = createRequire(join(upstream, "package.json"));
const lease = await acquireSimulatorWorkspace(root, fileURLToPath(import.meta.url));
try {
  const esbuild = require("esbuild");
  let compiled;
  try {
    compiled = await esbuild.build({
      stdin: {
        contents:
          'export * from "./apps/web/src/lib/forever-simulator-presentation.ts"; export * from "./apps/web/src/lib/forever-simulator-published-reviews.ts"; export * from "./apps/web/src/lib/forever-simulator-model-first-pass.ts"; export * from "./apps/web/src/lib/forever-simulator-model-updates.ts"; export {IndividualSimSettings} from "./.cache/forever-sim-upstream/ui/core/proto/ui";',
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
  const activeBytes = await readFile(join(directory, "active.json"));
  const correctionDirectory = join(directory, "optimization/item-skill-revalidation-v1");
  const correctionContext = modelUpdate
    ? await read(join(correctionDirectory, "context.json"))
    : null;
  const corrections = modelUpdate ? await read(join(correctionDirectory, "results.json")) : null;
  const correctedResults = [];
  if (modelUpdate) {
    assert.equal(corrections.schema, "kfc-item-skill-correction-results.v1");
    assert.equal(corrections.release, correctionContext.release);
    assert.equal(corrections.builds.length, 9);
    for (const reference of corrections.builds) {
      assert.equal(reference.path, `optimization/item-skill-revalidation-v1/${reference.id}.json`);
      const result = await read(join(directory, reference.path));
      assert.equal(hash(result), reference.sha256);
      assert.equal(result.fingerprint, corrections.fingerprint);
      assert.equal(result.release, correctionContext.release);
      assert.equal(result.nativeBinarySha256, corrections.nativeBinarySha256);
      correctedResults.push(result);
    }
  }
  const parent = modelUpdate ? correctionContext.model : JSON.parse(activeBytes);
  const parentDirectory = join(directory, parent.release);
  const db = await read(
    modelUpdate ? join(correctionDirectory, "db.json") : join(upstream, "assets/database/db.json"),
  );
  assert.deepEqual(db, await read(join(parentDirectory, "assets/database/db.json")));
  const craft = await read(join(directory, "craft-acquisition.json"));
  const inspection = await read(join(upstream, "ui/core/kfc_inspection.json"));
  const items = new Map(db.items.map((item) => [item.id, item]));
  const sources = prebisSources(
    await read(join(upstream, "assets/db_inputs/forever_gear_catalog.json")),
    await read(join(upstream, "ui/core/kfc_prebis_import.json")),
    craft,
    items,
  );
  const starters = await read(join(upstream, "ui/core/kfc_tank_starters.json"));
  // Retain only the exact already-reviewed blue PvP cores; this is not a name/quality heuristic.
  for (const starter of Object.values(starters))
    for (const id of starter.core) {
      assert(items.has(id) && items.get(id).quality === 3);
      if (!sources.has(id))
        sources.set(id, {
          id,
          sources: [{ kind: "pvp" }],
          acquisition:
            "Existing pinned blue PvP starter declaration; vendor access still requires in-game confirmation.",
        });
    }
  // The migration context retains the original authenticated virtual sources. The current
  // model proof has a different shape and must not be parsed as its legacy parent approval.
  const approved = modelUpdate
    ? correctionContext.approved
    : await loadReviewedPresetInputs(root, api);
  for (const file of approved.files) assert.equal(sha(file.content), file.sha256);
  const additional = modelUpdate
    ? await loadCumulativeModelFirstPassInputs(root, firstPassPath, api)
    : [];
  for (const input of additional) assert.equal(input.build.sourceRelease, parent.release);
  const virtual = new Map(
    approved.files.map((file) => [resolve(upstream, file.path), file.content]),
  );
  const statNamesPath = join(upstream, "ui/core/proto_utils/names.ts");
  virtual.set(
    statNamesPath,
    completeSimulatorStatLabels(
      virtual.get(statNamesPath) ?? (await readFile(statNamesPath, "utf8")),
    ),
  );
  if (modelUpdate) {
    for (const result of correctedResults) {
      const previous = correctionContext.entries.find((entry) => entry.build.id === result.id);
      assert(previous);
      const stripped = (settings) => ({
        ...settings,
        player: { ...settings.player, equipment: null },
      });
      assert.deepEqual(
        stripped(result.settings),
        stripped(previous.settings),
        "Correction changed undeclared talents, rotation or scenario settings",
      );
      const targets = [...virtual].filter(
        ([path, content]) =>
          path.endsWith(".gear.json") &&
          isDeepStrictEqual(JSON.parse(content), previous.settings.player.equipment),
      );
      // Proc-enchant variants are deliberately full-share-only: no automatic opt-in preset.
      if (!targets.length && previous.build.requiresProvisionalEnchantOptIn) continue;
      assert.equal(targets.length, 1, `Expected one reviewed gear source for ${result.id}`);
      virtual.set(targets[0][0], JSON.stringify(result.settings.player.equipment, null, 2) + "\n");
    }
  }
  for (const input of additional) {
    const feral = input.build.id === "feral-cat-static";
    const balance = input.build.id === "balance-static";
    const presetPath = resolve(upstream, `ui/${input.build.profile}/presets.ts`);
    const parameters = {
      source: virtual.get(presetPath) ?? (await readFile(presetPath, "utf8")),
      build: input.build,
      buildReference: input.reference,
      trees: await read(
        join(upstream, `ui/core/talents/trees/${feral || balance ? "druid" : "hunter"}.json`),
      ),
    };
    const overlay = balance
      ? balanceFirstPassPresetFiles({
          ...parameters,
          simSource: await readFile(join(upstream, "ui/balance_druid/sim.ts"), "utf8"),
        })
      : feral
        ? feralFirstPassPresetFiles({
            ...parameters,
            simSource: await readFile(join(upstream, "ui/feral_druid/sim.ts"), "utf8"),
          })
        : input.build.id === "hunter-marksmanship-static"
          ? hunterMarksmanshipModelPresetFiles(parameters)
          : hunterSurvivalFirstPassPresetFiles({
              ...parameters,
              starterGear: repairStarterPreset(
                {
                  profile: "hunter",
                  variant: "survival",
                  playerClass: 2,
                  gear: await read(
                    join(upstream, "ui/hunter/gear_sets/forever_survival.gear.json"),
                  ),
                },
                db,
                sources,
                inspection,
              ).gear,
            });
    for (const file of overlay.files) virtual.set(resolve(upstream, file.path), file.content);
  }
  const manifest = await read(join(upstream, "ui/core/kfc_default_enchants.json"));
  const repairs = [];
  for (const preset of manifest.presets) {
    const path = `ui/${preset.profile}/gear_sets/forever_${preset.variant}.gear.json`;
    const old = virtual.get(resolve(upstream, path));
    const measured = old ? JSON.parse(old) : null;
    const input = { ...preset, gear: measured ?? preset.gear };
    const fixed = repairStarterPreset(input, db, sources, inspection);
    if (measured)
      assert.deepEqual(
        fixed.gear,
        measured,
        "Reviewed gear must not be silently repaired or assigned its old DPS",
      );
    Object.assign(
      preset,
      describePrebisGear(
        fixed.gear,
        preset.profile,
        preset.variant,
        preset.playerClass,
        db,
        inspection,
      ),
    );
    for (const [field, slots] of [
      ["trinkets", [12, 13]],
      ["rings", [10, 11]],
    ])
      preset[field] = slots.map((slot) => {
        const item = items.get(fixed.gear.items[slot].id);
        assert(item, `Missing ${preset.profile} accessory metadata`);
        return {
          itemId: item.id,
          name: item.name,
          stats: item.stats,
          note: "Non-raid source-reviewed equipment; Forever release access still needs confirmation.",
        };
      });
    repairs.push({
      profile: preset.profile,
      variant: preset.variant,
      gear: fixed.gear,
      changes: fixed.changes,
      kind: measured ? "reviewed" : "starter",
    });
    if (preset.profile in starters) {
      const key = preset.variant === "horde" ? "hordeGear" : "gear";
      starters[preset.profile][key] = fixed.gear;
      starters[preset.profile].enchantTotals = preset.enchantTotals;
      starters[preset.profile].enchantCount = preset.choices.length;
      if (!starters[preset.profile].factionVariants)
        starters[preset.profile].hordeGear = fixed.gear;
    } else virtual.set(resolve(upstream, path), JSON.stringify(fixed.gear, null, 2) + "\n");
  }
  for (const profile of new Set(
    manifest.presets.filter((p) => !(p.profile in starters)).map((p) => p.profile),
  )) {
    const path = resolve(upstream, `ui/${profile}/presets.ts`);
    let source = virtual.get(path) ?? (await readFile(path, "utf8"));
    source = source.replace(
      /(makePreset(?:Gear|Build)\()(["'])([^\n]*?)\2(?=,)/g,
      (match, prefix, quote, name) =>
        /tested|starter/.test(name) ? match : prefix + JSON.stringify(name + " · pre-raid starter"),
    );
    virtual.set(path, source);
  }
  virtual.set(join(upstream, "ui/core/kfc_tank_starters.json"), JSON.stringify(starters));
  virtual.set(join(upstream, "ui/core/kfc_default_enchants.json"), JSON.stringify(manifest));
  const blockedItems = db.items
    .filter((item) => presetAcquisitionProblem(item, sources.get(item.id)))
    .map((item) => ({ id: item.id, name: item.name }));
  const blockedEnchants = Object.values(inspection.enchants)
    .filter(
      (entry) =>
        prebisEnchantProblem(entry) &&
        !Object.values(inspection.enchants).some(
          (other) =>
            other.effectId === entry.effectId &&
            other.type === entry.type &&
            !prebisEnchantProblem(other),
        ),
    )
    .flatMap((entry) =>
      [entry.type, ...entry.extraTypes].map((type) => ({
        id: entry.effectId,
        type,
        name: entry.name,
      })),
    );
  const policy = { schema: "kfc-preset-acquisition-policy.v1", blockedItems, blockedEnchants };
  virtual.set(join(upstream, "ui/core/kfc_preset_acquisition.json"), JSON.stringify(policy));
  virtual.set(
    join(upstream, "ui/core/kfc_preset_notice.ts"),
    await readFile(join(root, "infra/simulator/preset-notice.ts"), "utf8"),
  );
  const individualPath = join(upstream, "ui/core/individual_sim_ui.ts");
  const individual = await readFile(individualPath, "utf8");
  const marker =
    "\t\t\t// This needs to go last so it doesn't re-store things as they are initialized.";
  assert.equal(individual.split(marker).length, 2);
  virtual.set(
    individualPath,
    "import { installKfcPresetNotice } from './kfc_preset_notice.js';\n" +
      individual.replace(
        marker,
        "\t\t\tthis.addOnDisposeCallback(installKfcPresetNotice(this.rootElem, () => this.player.getGear().asSpec().items, this.changeEmitter));\n" +
          marker,
      ),
  );
  for (const row of repairs)
    assert.deepEqual(auditPresetGear(row.gear, db, sources, inspection), []);
  const inputs = [...virtual]
    .map(([path, content]) => ({ path: relative(upstream, path), sha256: sha(content) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const identity = hash({
    source: parent.release,
    parents: approved.parents,
    files: inputs,
    craft: hash(craft),
    policy,
    builder: sha(await readFile(fileURLToPath(import.meta.url))),
    guard: sha(await readFile(join(root, "infra/simulator/preset-acquisition.mjs"))),
    ...(modelUpdate ? { correction: hash(corrections) } : {}),
    ...(additional.length ? { firstPass: additional.map((input) => input.entry) } : {}),
  });
  const release = identity.slice(0, 24);
  const summary = {
    release,
    sourceRelease: parent.release,
    parents: approved.parents,
    presets: repairs.length,
    changed: repairs.filter((r) => r.changes.length).length,
    slotRepairs: repairs.reduce((sum, r) => sum + r.changes.length, 0),
    reviewedBuilds: approved.reviewed.length + additional.length,
    nativeJobs: 0,
  };
  if (process.argv[2] === "--plan") {
    console.log(JSON.stringify(summary));
    process.exitCode = 0;
  } else {
    assert(
      Number((await statfs(directory)).bavail) * Number((await statfs(directory)).bsize) >
        5 * 1024 ** 3,
      "Need 5GiB build reserve",
    );
    const temporary = await mkdtemp(join(directory, ".preset-safety-"));
    const tree = join(temporary, "release");
    const ts = require("typescript");
    const config = ts.readConfigFile(join(upstream, "tsconfig.json"), ts.sys.readFile);
    assert(!config.error);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, upstream);
    const options = { ...parsed.options, noEmit: true, incremental: false, composite: false };
    const host = ts.createCompilerHost(options);
    const getSource = host.getSourceFile.bind(host),
      originalRead = host.readFile.bind(host),
      originalExists = host.fileExists.bind(host);
    host.readFile = (path) => virtual.get(resolve(path)) ?? originalRead(path);
    host.fileExists = (path) => virtual.has(resolve(path)) || originalExists(path);
    host.getSourceFile = (path, language, onError, create) =>
      virtual.has(resolve(path))
        ? ts.createSourceFile(path, virtual.get(resolve(path)), language, true)
        : getSource(path, language, onError, create);
    const program = ts.createProgram({
      rootNames: [
        ...new Set([...parsed.fileNames, ...virtual.keys()].filter((path) => /\.tsx?$/.test(path))),
      ],
      options,
      host,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    assert.deepEqual(diagnostics, [], "Actual virtual all-class TypeScript failed");
    console.log(
      "[presets] All-class virtual TypeScript passed; original numerical source untouched",
    );
    const { build } = await import(
      pathToFileURL(join(dirname(require.resolve("vite/package.json")), "dist/node/index.js")).href
    );
    const code = ts.transpileModule(
      await readFile(join(upstream, "tools/vite/spec_pages.mts"), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    );
    const module = { exports: {} };
    new Function("require", "module", "exports", code.outputText)(require, module, module.exports);
    const base = `/forever-sim/${release}/`;
    const pages = module.exports.specPages(join(upstream, "ui"), base);
    const built = await build({
      configFile: false,
      root: join(upstream, "ui"),
      cacheDir: join(temporary, "vite-cache"),
      publicDir: false,
      base,
      logLevel: "error",
      define: {
        __SITE_VERSION__: JSON.stringify(parent.revision.slice(0, 10) + "-pre-raid-presets"),
        __SITE_REPO__: JSON.stringify("gunba/wow-forever-sim"),
      },
      plugins: [
        {
          name: "kfc-virtual-safe-presets",
          enforce: "pre",
          resolveId: (path, importer) => {
            if (!importer || !path.startsWith(".")) return null;
            const target = resolve(dirname(importer), path);
            if (virtual.has(target)) return target;
            const typescript = target.replace(/\.js$/, ".ts");
            return virtual.has(typescript) ? typescript : null;
          },
          load: (id) => virtual.get(resolve(id)) ?? null,
        },
        pages,
      ],
      esbuild: { jsxInject: "import { element, fragment } from 'tsx-vanilla';" },
      css: {
        preprocessorOptions: {
          scss: {
            additionalData: "$site-base: '" + base + "';",
            includePaths: [join(upstream, "node_modules")],
          },
        },
      },
      build: {
        write: false,
        outDir: join(temporary, "unused"),
        emptyOutDir: false,
        minify: "terser",
        terserOptions: { maxWorkers: 2 },
        sourcemap: false,
        target: ["es2020"],
        rollupOptions: {
          output: {
            assetFileNames: "bundle/[name]-[hash].style.css",
            entryFileNames: "bundle/[name]-[hash].entry.js",
            chunkFileNames: "bundle/[name]-[hash].chunk.js",
          },
        },
      },
    });
    assert(!Array.isArray(built));
    const files = {};
    for (const [name, expected] of Object.entries(parent.files)) {
      if (
        name.startsWith("bundle/") ||
        name.endsWith(".html") ||
        name === "kfc-reviewed-presets.json"
      )
        continue;
      assert(!name.split("/").includes(".."));
      const bytes = await readFile(join(parentDirectory, name));
      assert.equal(bytes.length, expected.bytes);
      assert.equal(sha(bytes), expected.sha256);
      await mkdir(dirname(join(tree, name)), { recursive: true });
      await copyFile(join(parentDirectory, name), join(tree, name));
      files[name] = expected;
    }
    const vendors = await read(join(root, "infra/simulator/vendors.json"));
    for (const asset of built.output) {
      const name = asset.fileName;
      assert(!name.split("/").includes("..") && !/wasm|worker|^assets\/database\//.test(name));
      let bytes = asset.type === "chunk" ? Buffer.from(asset.code) : Buffer.from(asset.source);
      if (name.endsWith(".html")) {
        let html = bytes.toString("utf8");
        for (const vendor of vendors) html = html.replaceAll(vendor.url, base + vendor.path);
        html = html.replace(
          /<script[^>]*src="https:\/\/wow\.zamimg\.com\/js\/tooltips\.js"[^>]*><\/script>/g,
          "",
        );
        bytes = Buffer.from(linkWorkspaceStyles(html, base));
      }
      await mkdir(dirname(join(tree, name)), { recursive: true });
      await writeFile(join(tree, name), bytes);
      files[name] = { bytes: bytes.length, sha256: sha(bytes) };
    }
    for (const [name, value] of [
      ["kfc-default-enchants.json", manifest],
      ["kfc-tank-starters.json", starters],
      ["kfc-preset-acquisition.json", policy],
    ]) {
      const bytes = Buffer.from(JSON.stringify(value));
      await writeFile(join(tree, name), bytes);
      files[name] = { bytes: bytes.length, sha256: sha(bytes) };
    }
    const modelAssets = Object.fromEntries(
      Object.entries(parent.files).filter(([name]) => /wasm|worker|^assets\/database\//.test(name)),
    );
    for (const [name, value] of Object.entries(modelAssets)) assert.deepEqual(files[name], value);
    const report = {
      schema: "kfc-simulator-preset-safety.v1",
      identity,
      release,
      sourceRelease: parent.release,
      parents: approved.parents,
      createdAt: new Date().toISOString(),
      typecheckDiagnostics: 0,
      modelAssets,
      virtualSourceFiles: inputs,
      repairs,
      blockedItems,
      blockedEnchants,
      browserReview: null,
      limits:
        "Source-reviewed non-raid starter repair, not newly optimized DPS. Existing reviewed presets are byte-exact reconstructions. Historical acquisition and PvP/vendor access still need Forever release confirmation. Saved/custom characters are preserved and warned, not overwritten.",
    };
    const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
    await writeFile(join(tree, "kfc-preset-safety.json"), reportBytes);
    files["kfc-preset-safety.json"] = { bytes: reportBytes.length, sha256: sha(reportBytes) };
    let modelProof;
    if (modelUpdate) {
      const safety = await read(join(directory, "preset-safety.json"));
      assert.equal(safety.release, correctionContext.parentSafetyRelease);
      modelProof = {
        schema: additional.length
          ? "kfc-simulator-model-update-with-builds.v1"
          : "kfc-simulator-item-skill-update.v1",
        sourceRelease: parent.release,
        release,
        previousRelease: JSON.parse(activeBytes).release,
        previousManifestSha256: hash(JSON.parse(activeBytes)),
        sourceManifestSha256: hash(parent),
        nativeBinarySha256: corrections.nativeBinarySha256,
        databaseSha256: hash(db),
        policySha256: parent.files["kfc-item-weapon-skills.json"].sha256,
        parentSafety: { release: safety.release, reportSha256: safety.reportSha256 },
        typecheckDiagnostics: 0,
        modelAssets,
        virtualSourceFiles: inputs,
        presets: repairs.map((entry) => ({
          profile: entry.profile,
          variant: entry.variant,
          gearSha256: hash(entry.gear),
        })),
        builds: correctedResults
          .map((entry) => ({
            id: entry.id,
            profile: entry.profile,
            correction: corrections.builds.find((reference) => reference.id === entry.id),
            settingsSha256: hash(entry.settings),
            hrefSha256: sha(
              `/forever-sim/${release}/${entry.profile}/#` +
                deflateSync(
                  Buffer.from(
                    api.IndividualSimSettings.toBinary(
                      api.IndividualSimSettings.fromJson(entry.settings),
                    ),
                  ),
                ).toString("base64"),
            ),
            referenceDps: entry.referenceDps,
            validationIterations: entry.validationIterations,
          }))
          .map(({ correction, ...entry }) => ({
            ...entry,
            correction: { path: correction.path, sha256: correction.sha256 },
          })),
        ...(additional.length
          ? {
              firstPassBuilds: additional.map((input) => ({
                ...input.entry,
                hrefSha256: sha(modelFirstPassShareHref(input.build, release, api)),
              })),
            }
          : {}),
        notice:
          "Item-skill removal with fresh two20k confirmation per published build and bounded all-slot/paired-slot rechecks for affected builds. Items and other effects remain available. Earlier evidence is preserved, not relabelled; no global BiS or exhaustive new talent/rotation claim. Historical availability and proc uncertainties remain.",
      };
      const bytes = Buffer.from(JSON.stringify(modelProof, null, 2) + "\n");
      await writeFile(join(tree, "kfc-reviewed-presets.json"), bytes);
      files["kfc-reviewed-presets.json"] = { bytes: bytes.length, sha256: sha(bytes) };
    }
    const next = { ...parent, release, preparedAt: new Date().toISOString(), files };
    for (const page of parent.pages) assert(files[page + "/index.html"], `Missing ${page}`);
    await writeFile(join(tree, "manifest.json"), JSON.stringify(next, null, 2) + "\n", {
      flag: "wx",
    });
    assert.deepEqual(await readFile(join(directory, "active.json")), activeBytes);
    try {
      await lstat(join(directory, release));
      assert.fail("Immutable release exists; review it instead of rebuilding");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(tree, join(directory, release));
    if (modelUpdate) {
      const profiles = {};
      for (const profile of new Set([
        "warrior",
        "rogue",
        "hunter",
        ...additional.map((input) => input.build.profile),
      ])) {
        const builds = correctedResults
          .filter((result) => result.profile === profile)
          .map((result) => {
            const old = correctionContext.entries.find(
              (entry) => entry.build.id === result.id,
            ).build;
            const encoded = api.IndividualSimSettings.toBinary(
              api.IndividualSimSettings.fromJson(result.settings),
            );
            return {
              ...old,
              href:
                `/forever-sim/${release}/${profile}/#` +
                deflateSync(Buffer.from(encoded)).toString("base64"),
              referenceDps: result.referenceDps,
              validationIterations: result.validationIterations,
              stage: result.affected
                ? "item-skill correction · bounded all-slot recheck"
                : "skill-free model control · fresh confirmation",
              warnings: [
                ...old.warnings,
                "Item weapon skill is ignored; items and all other modeled properties remain available. Fresh 40,000-fight confirmation, not a new exhaustive talent/rotation search or proof of global BiS.",
              ],
            };
          });
        for (const input of additional.filter((entry) => entry.build.profile === profile)) {
          const value = input.build;
          const guide = value.rotationGuidance;
          builds.push({
            id: value.id,
            spec: value.profile + "/" + value.variant,
            faction: value.faction,
            scenario: value.variant + "-static",
            stage: "first-pass · corrected model · disclosed2% margin",
            status: "reviewed",
            displayName: value.name,
            href: modelFirstPassShareHref(value, release, api),
            referenceDps: value.referenceDps,
            validationIterations: value.validationIterations,
            requiresProvisionalEnchantOptIn: false,
            warnings: value.warnings,
            rotationGuidance: {
              talents: guide.talents,
              scenario: guide.scenario,
              instruction: guide.instruction,
              priorities: guide.priorities,
              caveats: guide.caveats,
            },
          });
        }
        const publication = api.createPublishedSimulatorProfile(
          { manifest: next, sourceRelease: parent.release, kind: "reviewed-presets" },
          profile,
          builds,
        );
        const sha256 = hash(publication);
        const path = `published-reviews/${profile}-${sha256.slice(0, 16)}.json`;
        await mkdir(join(directory, "published-reviews"), { recursive: true });
        await writeFile(join(directory, path), JSON.stringify(publication, null, 2) + "\n", {
          flag: "wx",
        });
        profiles[profile] = { path, sha256 };
      }
      const plan = {
        schema: "kfc-item-skill-publication-plan.v1",
        sourceRelease: parent.release,
        release,
        proofSha256: files["kfc-reviewed-presets.json"].sha256,
        profiles,
      };
      const planPath = additional.length
        ? join(
            directory,
            dirname(firstPassPath ?? additional.at(-1).qualifiedPath),
            `publication-plan-${release}.json`,
          )
        : join(correctionDirectory, "publication-plan.json");
      await writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
      console.log(
        JSON.stringify({
          status: "publication-plan-staged-not-selected",
          path: relative(directory, planPath),
        }),
      );
    }
    console.log(
      JSON.stringify({
        ...summary,
        status: "built-awaiting-browser-review",
        files: Object.keys(files).length,
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: "simulator-preset-build-failed",
      name: error.name,
      message: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await lease.release();
}
