import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { promisify } from "node:util";
import { URL } from "node:url";
import { inflateSync } from "node:zlib";
import {
  withoutItemWeaponSkills,
  patchItemWeaponSkills,
} from "../infra/simulator/item-weapon-skills.mjs";
import {
  itemSkillSearchContext,
  itemSkillSearchPolicy as policy,
  uniqueItemSkillCandidates,
  itemSkillConfirmationVerdict,
} from "../infra/simulator/item-skill-revalidation.mjs";
import { acquireSimulatorWorkspace } from "../infra/simulator/simulator-workspace.mjs";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import { captureSimulatorRequest } from "../infra/simulator/browser-capture.mjs";
import {
  createSimulationCache,
  simulationHash as hash,
} from "../infra/simulator/retained-simulation-cache.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { loadReviewedPresetInputs } from "./simulator-reviewed-preset-inputs.mjs";

assert(
  process.argv.length === 3 && ["--prepare", "--run"].includes(process.argv[2]),
  "Use --prepare or --run",
);
const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const upstream = join(root, ".cache/forever-sim-upstream");
const study = join(directory, "optimization/item-skill-revalidation-v1");
const require = createRequire(join(upstream, "package.json"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const exact = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const text =
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : JSON.stringify(value, null, 2) + "\n";
  try {
    await writeFile(path, text, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(
      await readFile(path),
      Buffer.from(text),
      `Immutable correction input changed: ${path}`,
    );
  }
};
const lease = await acquireSimulatorWorkspace(root, import.meta.filename);
let server, workers, historicalWorkers;
try {
  const protectedPaths = [
    join(upstream, "sim/core/character.go"),
    join(upstream, "assets/database/db.json"),
    join(upstream, "assets/database/db.bin"),
    join(root, ".cache/simulator-toolchain/bin/kfc-prebis"),
    ...["active.json", "presentation.json", "published-reviews.json", "preset-safety.json"].map(
      (name) => join(directory, name),
    ),
  ];
  const protectedInputs = Object.fromEntries(
    await Promise.all(protectedPaths.map(async (path) => [path, sha(await readFile(path))])),
  );
  const esbuild = require("esbuild");
  const compiled = await esbuild.build({
    stdin: {
      contents: `export {IndividualSimSettings, UIDatabase} from './.cache/forever-sim-upstream/ui/core/proto/ui';
export * from './apps/web/src/lib/forever-simulator-presentation.ts';
export * from './apps/web/src/lib/forever-simulator-published-reviews.ts';`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  esbuild.stop();
  const api = await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputFiles[0].contents).toString("base64")
  );
  if (process.argv[2] === "--prepare") {
    const parent = await read(join(directory, "active.json"));
    const safety = await read(join(directory, "preset-safety.json"));
    assert.equal(safety.sourceRelease, parent.release);
    const display = await read(join(directory, safety.release, "manifest.json"));
    const db = await read(join(upstream, "assets/database/db.json"));
    assert.deepEqual(db, await read(join(directory, parent.release, "assets/database/db.json")));
    const normalized = withoutItemWeaponSkills(db);
    const originalSource = await readFile(join(upstream, "sim/core/character.go"), "utf8");
    const correctedSource = patchItemWeaponSkills(originalSource);
    assert.notEqual(
      correctedSource,
      originalSource,
      "Original numerical workspace must be preserved",
    );
    const approved = await loadReviewedPresetInputs(root, api);
    const publications = await read(join(directory, "published-reviews.json"));
    const entries = [];
    for (const [profile, reference] of Object.entries(publications.profiles)) {
      const publication = await read(join(directory, reference.path));
      assert.equal(hash(publication), reference.sha256);
      for (const build of publication.builds) {
        const settings = api.IndividualSimSettings.toJson(
          api.IndividualSimSettings.fromBinary(
            inflateSync(
              Buffer.from(new URL(build.href, "https://helper.invalid").hash.slice(1), "base64"),
            ),
          ),
        );
        entries.push({
          profile,
          build,
          settings,
          affected: settings.player.equipment.items.some((spec) =>
            normalized.manifest.changes.some((item) => item.id === spec.id),
          ),
        });
      }
    }
    const inputs = {
      parent: hash(parent),
      display: hash(display),
      database: hash(normalized.equipment),
      source: sha(correctedSource),
      adapter: sha(await readFile(join(root, "infra/simulator/item-weapon-skills.mjs"))),
      nativeRunner: sha(await readFile(join(root, "infra/simulator/prebis-runner.go"))),
      policy,
      publications: hash(publications),
    };
    const release = hash(inputs).slice(0, 24);
    await mkdir(study, { recursive: true });
    const dbBytes = api.UIDatabase.toBinary(api.UIDatabase.fromJson(normalized.equipment));
    await exact(join(study, "db.json"), JSON.stringify(normalized.equipment));
    await exact(join(study, "db.bin"), Buffer.from(dbBytes));
    await exact(join(study, "character.go"), correctedSource);
    const overlay = {
      Replace: {
        [join(upstream, "sim/core/character.go")]: join(study, "character.go"),
        [join(upstream, "assets/database/db.bin")]: join(study, "db.bin"),
        [join(upstream, "cmd/kfcprebis/main.go")]: join(root, "infra/simulator/prebis-runner.go"),
      },
    };
    await exact(join(study, "overlay.json"), overlay);
    const go = join(root, ".cache/simulator-toolchain/go/bin/go");
    const env = { ...process.env, GOTOOLCHAIN: "local", GOMAXPROCS: "4" };
    await promisify(execFile)(
      go,
      [
        "build",
        "-overlay=" + join(study, "overlay.json"),
        "-tags=with_db",
        "-o",
        join(study, "kfc-prebis"),
        "./cmd/kfcprebis",
      ],
      { cwd: upstream, timeout: 180000, env },
    );
    await promisify(execFile)(
      go,
      [
        "build",
        "-overlay=" + join(study, "overlay.json"),
        "-o",
        join(study, "lib.wasm"),
        "./sim/wasm",
      ],
      { cwd: upstream, timeout: 180000, env: { ...env, GOOS: "js", GOARCH: "wasm" } },
    );
    const target = join(directory, release);
    const files = {};
    for (const [name, expected] of Object.entries(display.files)) {
      if (["kfc-preset-safety.json", "kfc-reviewed-presets.json"].includes(name)) continue;
      const original = await readFile(join(directory, display.release, name));
      assert.equal(sha(original), expected.sha256);
      let bytes = original;
      if (/\.html$|\.js$|\.css$/.test(name))
        bytes = Buffer.from(
          original
            .toString("utf8")
            .replaceAll(`/forever-sim/${display.release}/`, `/forever-sim/${release}/`)
            .replaceAll(`/forever-sim/${parent.release}/`, `/forever-sim/${release}/`),
        );
      if (name === "lib.wasm") bytes = await readFile(join(study, "lib.wasm"));
      if (/^assets\/database\/(?:leftover_)?db\.json$/.test(name))
        bytes = Buffer.from(JSON.stringify(normalized.equipment));
      if (/^assets\/database\/(?:leftover_)?db\.bin$/.test(name)) bytes = Buffer.from(dbBytes);
      await exact(join(target, name), bytes);
      files[name] = { bytes: bytes.length, sha256: sha(bytes) };
    }
    const policyBytes = Buffer.from(JSON.stringify(normalized.manifest));
    await exact(join(target, "kfc-item-weapon-skills.json"), policyBytes);
    files["kfc-item-weapon-skills.json"] = { bytes: policyBytes.length, sha256: sha(policyBytes) };
    const model = {
      ...parent,
      release,
      preparedAt: new Date().toISOString(),
      itemWeaponSkillPolicy: normalized.manifest,
      files,
    };
    await exact(join(target, "manifest.json"), model);
    const context = {
      schema: "kfc-item-skill-revalidation-context.v1",
      release,
      parentRelease: parent.release,
      parentSafetyRelease: display.release,
      model,
      inputs,
      entries,
      approved,
      protectedInputs,
      nativeBinarySha256: sha(await readFile(join(study, "kfc-prebis"))),
      notice:
        "Isolated correction workspace. Previous evidence/source remain intact; no active/publication pointers changed.",
    };
    await exact(join(study, "context.json"), context);
    console.log(
      JSON.stringify({
        status: "isolated-model-prepared",
        release,
        builds: entries.length,
        affected: entries.filter((entry) => entry.affected).map((entry) => entry.build.id),
      }),
    );
  } else {
    const context = await read(join(study, "context.json"));
    assert.equal(context.schema, "kfc-item-skill-revalidation-context.v1");
    const db = await read(join(study, "db.json"));
    const sources = prebisSources(
      await read(join(upstream, "assets/db_inputs/forever_gear_catalog.json")),
      await read(join(upstream, "ui/core/kfc_prebis_import.json")),
      await read(join(directory, "craft-acquisition.json")),
      new Map(db.items.map((item) => [item.id, item])),
    );
    const inspection = await read(join(upstream, "ui/core/kfc_inspection.json"));
    const fingerprint = hash({
      inputs: context.inputs,
      native: context.nativeBinarySha256,
      search: sha(await readFile(join(root, "infra/simulator/item-skill-revalidation.mjs"))),
    });
    workers = await openNativeRunners(
      join(study, "kfc-prebis"),
      upstream,
      context.nativeBinarySha256,
      6,
    );
    const historicalPath = join(root, ".cache/simulator-toolchain/bin/kfc-prebis");
    historicalWorkers = await openNativeRunners(
      historicalPath,
      upstream,
      context.protectedInputs[historicalPath],
      1,
    );
    const cache = await createSimulationCache(
      join(study, "simulation-cache"),
      fingerprint,
      workers,
    );
    server = await startSimulatorLocalServer(directory, context.model);
    const results = [];
    for (const entry of context.entries.sort((a, b) => Number(b.affected) - Number(a.affected))) {
      const output = join(study, entry.build.id + ".json");
      try {
        const saved = await read(output);
        assert.equal(saved.fingerprint, fingerprint);
        results.push(saved);
        console.log(JSON.stringify({ id: entry.build.id, status: "reused-completed-correction" }));
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const capturedPath = join(study, entry.build.id + "-request.json");
      let captured;
      try {
        captured = await read(capturedPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        captured = await captureSimulatorRequest(root, entry.settings, {
          release: context.release,
          profile: entry.profile,
          iterations: 25,
          seed: 819000001,
          allowProvisionalEnchants: entry.build.requiresProvisionalEnchantOptIn,
          origin: server.origin,
        });
        await exact(capturedPath, captured);
      }
      const search = itemSkillSearchContext(entry, db, sources, inspection);
      const original = { gear: entry.settings.player.equipment, label: "incumbent" };
      let selected = original;
      const sweeps = [];
      const evaluate = async (candidates, iterations, seed) => {
        const values = uniqueItemSkillCandidates(candidates);
        const metrics = await cache.run(
          values.map((candidate) => ({
            requestBase64: captured.requestBase64,
            gear: candidate.gear.items,
            talentsString: candidate.talents ?? entry.settings.player.talentsString,
            rotation: candidate.rotation ?? entry.settings.player.rotation,
            iterations,
            seed,
          })),
        );
        return values
          .map((candidate, index) => ({ ...candidate, metric: metrics[index] }))
          .sort((a, b) => b.metric.dps - a.metric.dps || a.id.localeCompare(b.id));
      };
      const shortlist = async (candidates, seed) => {
        const screened = await evaluate(candidates, policy.screeningIterations, seed);
        const finalists = uniqueItemSkillCandidates([
          ...screened.slice(0, policy.shortlistCount),
          selected,
          original,
        ]);
        const ranked = await evaluate(finalists, policy.shortlistIterations, seed + 10000);
        return { screened, ranked };
      };
      if (entry.affected) {
        for (let pass = 0; pass < policy.maximumSweeps; pass++) {
          const before = hash(selected.gear);
          const comparisons = [];
          for (const slot of [15, 14, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16]) {
            const candidates = search.candidates(selected.gear, slot);
            const { screened, ranked } = await shortlist(
              candidates,
              820000001 + pass * 1000000 + slot * 20000,
            );
            selected = ranked[0];
            comparisons.push({
              slot,
              candidates: candidates.length,
              selected: selected.gear.items[slot],
              top: screened
                .slice(0, policy.weaponShortlistCount)
                .map((row) => ({ spec: row.gear.items[slot], dps: row.metric.dps })),
            });
          }
          const bySlot = new Map(comparisons.map((row) => [row.slot, row]));
          for (const [left, right] of [
            [14, 15],
            [10, 11],
            [12, 13],
          ]) {
            const pairs = [];
            const first = bySlot.get(left).top.map((row) => row.spec);
            const second = bySlot.get(right).top.map((row) => row.spec);
            for (const a of first)
              for (const b of second) {
                const gear = globalThis.structuredClone(selected.gear);
                gear.items[left] = a;
                gear.items[right] = b;
                if (search.legal(gear))
                  pairs.push({ gear, label: `${left}/${right}:${a.id}/${b.id}` });
              }
            const { ranked } = await shortlist(
              [...pairs, selected, original],
              824000001 + pass * 1000000 + left * 20000,
            );
            selected = ranked[0];
            comparisons.push({
              pair: [left, right],
              candidates: pairs.length,
              selected: selected.gear.items.filter((_, slot) => slot === left || slot === right),
            });
          }
          sweeps.push({ pass, before, after: hash(selected.gear), comparisons });
          console.log(
            JSON.stringify({
              id: entry.build.id,
              pass,
              screenDps: selected.metric.dps,
              weapons: selected.gear.items.slice(14, 16),
              simulations: cache.stats,
            }),
          );
          if (before === hash(selected.gear)) break;
        }
      }
      const confirmation = [];
      for (const seed of policy.confirmationSeeds) {
        const rows = await evaluate([original, selected], policy.confirmationIterations, seed);
        const old = rows.find((row) => hash(row.gear) === hash(original.gear));
        const candidate = rows.find((row) => hash(row.gear) === hash(selected.gear));
        confirmation.push({ seed, incumbent: old.metric, candidate: candidate.metric });
      }
      const verdict = itemSkillConfirmationVerdict(
        confirmation.map((row) => row.incumbent),
        confirmation.map((row) => row.candidate),
      );
      const winner = verdict.selected === "candidate" ? selected : original;
      const settings = globalThis.structuredClone(entry.settings);
      settings.player.equipment = winner.gear;
      const result = {
        schema: "kfc-item-skill-correction-result.v1",
        fingerprint,
        id: entry.build.id,
        profile: entry.profile,
        release: context.release,
        nativeBinarySha256: context.nativeBinarySha256,
        databaseSha256: hash(db),
        policy,
        affected: entry.affected,
        settings,
        sourceSettingsSha256: hash(entry.settings),
        referenceDps: verdict.selected === "candidate" ? verdict.newDps : verdict.oldDps,
        validationIterations: 40000,
        verdict,
        confirmation,
        sweeps,
        browserControl: { seed: 819000001, iterations: 25, dps: captured.browserDps },
        requestBase64: captured.requestBase64,
        scope: policy.scope,
      };
      const parity = (await evaluate([original], 25, 819000001))[0].metric;
      assert(
        Math.abs(parity.dps - captured.browserDps) <= 0.011,
        `Native/browser mismatch for ${entry.build.id}: ${parity.dps} / ${captured.browserDps}`,
      );
      const historical = await historicalWorkers[0].run({
        id: entry.build.id + "-historical-control",
        requestBase64: captured.requestBase64,
        gear: original.gear.items,
        talentsString: entry.settings.player.talentsString,
        rotation: entry.settings.player.rotation,
        iterations: 25,
        seed: 819000001,
      });
      result.browserControl.nativeDps = parity.dps;
      result.browserControl.historicalDps = historical.dps;
      if (!entry.affected)
        assert(
          Math.abs(historical.dps - parity.dps) < 1e-9,
          `Unexpected skill-free model change for ${entry.build.id}`,
        );
      assert(search.legal(settings.player.equipment));
      await exact(output, result);
      results.push(result);
      console.log(
        JSON.stringify({
          status: "corrected-build-confirmed",
          id: result.id,
          referenceDps: result.referenceDps,
          relativeChange: verdict.relativeChange,
          selection: verdict.selected,
          weapons: winner.gear.items.slice(14, 16),
          iterations: 40000,
        }),
      );
    }
    await exact(join(study, "results.json"), {
      schema: "kfc-item-skill-correction-results.v1",
      fingerprint,
      release: context.release,
      nativeBinarySha256: context.nativeBinarySha256,
      builds: results.map((result) => ({
        id: result.id,
        path: `optimization/item-skill-revalidation-v1/${result.id}.json`,
        sha256: hash(result),
      })),
    });
    console.log(
      JSON.stringify({
        status: "all-corrected-builds-confirmed",
        builds: results.length,
        cache: cache.stats,
      }),
    );
  }
  for (const [path, checksum] of Object.entries(protectedInputs))
    assert.equal(sha(await readFile(path)), checksum, `Original evidence changed: ${path}`);
} finally {
  workers?.forEach((worker) => worker.close());
  historicalWorkers?.forEach((worker) => worker.close());
  if (server) await server.close();
  await lease.release();
}
