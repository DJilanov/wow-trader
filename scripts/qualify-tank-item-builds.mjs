import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, realpath, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve, relative, isAbsolute, sep } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import console from "node:console";
import {
  tankBuildSettings,
  combineTankValidation,
  normalizeTankImportRequest,
} from "../infra/simulator/tank-build-import.mjs";
import { prebisSources } from "../infra/simulator/prebis-pool.mjs";
import { admitPublishedTankSources } from "../infra/simulator/tank-optimization.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({
  options: { report: { type: "string" }, release: { type: "string" } },
  strict: true,
});
assert(values.report, "Pass --report=<replayed item report>");
assert(/^[a-f0-9]{24}$/.test(values.release ?? ""), "Pass --release=<staged tank browser>");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const objectHash = (value) => hash(JSON.stringify(value));
const reportPath = await realpath(resolve(root, values.report)),
  report = await json(reportPath);
const offset = relative(await realpath(join(base, "runs")), reportPath);
assert(
  offset && offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset),
  "Import report escaped tank research storage",
);
assert(/^[a-f0-9]{64}$/.test(report.fingerprint));
assert.equal(reportPath, await realpath(join(base, "runs", report.fingerprint, "report.json")));
const replay = await json(join(dirname(reportPath), "replay.json"));
assert.equal(replay.status, "passed");
assert.equal(replay.reportSha256, objectHash(report));
assert.equal(replay.fingerprint, report.fingerprint);
assert.equal(replay.engine, report.inputs.engine);
const engineDirectory = join(base, "engines", report.inputs.engine),
  engine = await json(join(engineDirectory, "manifest.json"));
assert.equal(engine.fingerprint, report.inputs.engine);
assert.equal(objectHash(engine.inputs), engine.fingerprint);
assert.equal(engine.binarySha256, report.inputs.binary);
assert.equal(replay.nativeBinarySha256, engine.binarySha256);
const browserRoot = join(base, "browser-models"),
  directory = join(browserRoot, values.release),
  manifest = await json(join(directory, "manifest.json")),
  model = await json(join(directory, "kfc-tank-browser-research.json")),
  browserReview = await json(join(directory, "browser-review.json"));
assert.equal(model.engine, engine.fingerprint);
assert.equal(model.release, values.release);
assert.equal(browserReview.status, "passed");
assert.equal(browserReview.release, model.release);
assert.equal(browserReview.engine, engine.fingerprint);
assert.equal(browserReview.wasmSha256, model.wasmSha256);
assert.equal(manifest.files["lib.wasm"].sha256, model.wasmSha256);
assert.equal(hash(await readFile(join(directory, "lib.wasm"))), model.wasmSha256);
const data = {};
for (const key of ["database", "catalog", "imports", "inspection"]) {
  data[key] = await json(join(engineDirectory, key + ".json"));
  assert.equal(objectHash(data[key]), engine.dataSha256[key]);
}
assert.equal(
  objectHash(await json(join(directory, "assets/database/db.json"))),
  engine.dataSha256.database,
);
const craft = await json(join(root, "artifacts/forever-simulator/craft-acquisition.json"));
assert.equal(objectHash(craft), report.inputs.craft);
const items = new Map(data.database.items.map((item) => [item.id, item])),
  sources = prebisSources(data.catalog, data.imports, craft, items);
const sourceDirectory = join(root, "artifacts/forever-simulator", report.inputs.sourceRelease),
  sourceManifest = await json(join(sourceDirectory, "manifest.json")),
  starterBytes = await readFile(join(sourceDirectory, "kfc-tank-starters.json"));
assert.equal(hash(starterBytes), sourceManifest.files["kfc-tank-starters.json"].sha256);
admitPublishedTankSources(sources, report.profile, JSON.parse(starterBytes)[report.profile], items);
const starter = await json(
  join(
    root,
    "artifacts/forever-simulator/optimization/tank-tier-list",
    report.inputs.sourceRelease,
    report.profile + "-starter.json",
  ),
);
assert.equal(starter.manifestSha256, objectHash(sourceManifest));
const requestDocument = await json(join(dirname(reportPath), "request.json"));
assert.equal(hash(requestDocument.requestBase64), report.inputs.request);
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  hash(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href),
  originalRequest = api.RaidSimRequest.fromBinary(
    Buffer.from(requestDocument.requestBase64, "base64"),
  ),
  requestJson = api.RaidSimRequest.toJson(originalRequest);
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const server = await startSimulatorLocalServer(browserRoot, manifest),
  browser = await chromium.launch(),
  workers = await openNativeRunners(engine.binary, engine.workspace, engine.binarySha256, 1),
  builds = [];
const storedSettings = async (page) => {
  const found = await page.evaluate(() =>
    Object.entries(globalThis.localStorage)
      .filter(([key]) => key.endsWith("__currentSettings__"))
      .map(([, value]) => JSON.parse(value))
      .filter((value) => value.player && value.encounter),
  );
  assert.equal(found.length, 1);
  return found[0];
};
try {
  for (const result of report.results) {
    assert(result.converged && result.accepted, "Unaccepted or unfinished item result");
    assert.deepEqual(result.gear, result.searchedGear);
    const requiresProvisionalEnchantOptIn = result.searchedGearDescription.choices.some(
      (choice) => choice.status === "provisional",
    );
    const iterations = 100,
      seed = 83491001,
      settings = api.IndividualSimSettings.toJson(
        api.IndividualSimSettings.fromJson(
          tankBuildSettings(
            starter.settings,
            requestJson,
            result.gear,
            report.inputs.context.faction,
            iterations,
            seed,
          ),
          { ignoreUnknownFields: false },
        ),
      ),
      encoded = api.IndividualSimSettings.toBinary(api.IndividualSimSettings.fromJson(settings)),
      href = `/forever-sim/${model.release}/${report.profile}/?i=gtrcmxeu#${deflateSync(encoded).toString("base64")}`,
      checked = [];
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
      await page.addInitScript(() => {
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
        globalThis.__tankImportRequests = [];
        const post = globalThis.Worker.prototype.postMessage;
        globalThis.Worker.prototype.postMessage = function (message, ...rest) {
          if (["raidSim", "raidSimAsync"].includes(message.msg))
            globalThis.__tankImportRequests.push(Array.from(message.inputData));
          return post.call(this, message, ...rest);
        };
      });
      try {
        assert((await page.goto(server.origin + href))?.ok());
        await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
        const loaded = await storedSettings(page);
        for (const field of [
          "equipment",
          "race",
          "profession1",
          "profession2",
          "talentsString",
          "rotation",
          "consumes",
          "buffs",
        ])
          assert.deepEqual(
            loaded.player[field],
            settings.player[field],
            "Imported character changed " + field,
          );
        for (const field of ["raidBuffs", "partyBuffs", "debuffs", "tanks", "encounter"])
          assert.deepEqual(loaded[field], settings[field], "Imported encounter changed " + field);
        assert.equal(loaded.settings.faction, report.inputs.context.faction);
        assert.equal(loaded.settings.iterations, iterations);
        assert.equal(loaded.settings.fixedRngSeed, String(seed));
        if (width < 900) await page.getByRole("button", { name: "Build", exact: true }).click();
        await assertProcConsentDisabled(page);
        if (requiresProvisionalEnchantOptIn) {
          const hand = page
            .locator(".gear-picker-root .item-picker-root")
            .filter({ has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }) });
          await hand.locator(".item-picker-enchant").click();
          const modal = page.locator(".modal.show .selector-modal");
          await modal.locator(".tab-pane.active .kfc-enchant-optin input").check();
          await modal.locator(".modal-header .btn-close:visible").first().click();
        }
        if (width < 900) await page.getByRole("button", { name: "Results", exact: true }).click();
        await page.locator(".dps-action").click();
        await page.waitForFunction(
          () =>
            /\d[\d,]*\.\d+/.test(
              globalThis.document.querySelector(".results-content .topline-result-avg")
                ?.textContent ?? "",
            ) && !globalThis.document.querySelector(".dps-action")?.disabled,
          null,
          { timeout: 180000 },
        );
        const captured = await page.evaluate(() => ({
          bytes: globalThis.__tankImportRequests.at(-1),
          metrics: Array.from(
            globalThis.document.querySelectorAll(".results-content .topline-result-avg"),
            (node) => node.textContent,
          ),
        }));
        assert(captured.bytes?.length > 0, "Import did not send a real combat request");
        const actual = api.RaidSimRequest.fromBinary(Uint8Array.from(captured.bytes)),
          expected = api.RaidSimRequest.clone(originalRequest);
        expected.raid.parties[0].players[0].equipment = api.EquipmentSpec.fromJson(result.gear);
        expected.simOptions.iterations = iterations;
        expected.simOptions.randomSeed = BigInt(seed);
        assert.equal(actual.simOptions.iterations, iterations);
        assert.equal(actual.simOptions.randomSeed, BigInt(seed));
        assert.equal(actual.simOptions.ruleset, 1);
        const comparable = api.RaidSimRequest.fromJson(
          normalizeTankImportRequest(api.RaidSimRequest.toJson(actual)),
        );
        comparable.simOptions = expected.simOptions;
        if (
          !Buffer.from(api.RaidSimRequest.toBinary(comparable)).equals(
            Buffer.from(api.RaidSimRequest.toBinary(expected)),
          )
        )
          await writeFile(
            join(dirname(reportPath), `import-mismatch-${result.objective}-${width}.json`),
            JSON.stringify(
              {
                actual: api.RaidSimRequest.toJson(comparable),
                expected: api.RaidSimRequest.toJson(expected),
              },
              null,
              2,
            ) + "\n",
          );
        assert.deepEqual(
          api.RaidSimRequest.toBinary(comparable),
          api.RaidSimRequest.toBinary(expected),
          "Browser import changed the measured combat setup",
        );
        const native = await workers[0].run({
          id: `${report.profile}-${result.objective}-${width}`,
          requestBase64: Buffer.from(captured.bytes).toString("base64"),
          gear: result.gear.items,
          duration: actual.encounter.duration,
          iterations,
          seed,
          detail: true,
        });
        const frozen = await workers[0].run({
          id: `${report.profile}-${result.objective}-${width}-frozen`,
          requestBase64: Buffer.from(api.RaidSimRequest.toBinary(expected)).toString("base64"),
          gear: result.gear.items,
          duration: expected.encounter.duration,
          iterations,
          seed,
          detail: true,
        });
        const metrics = {};
        for (const name of ["dps", "threat", "dtps", "tmi", "tto"]) {
          metrics[name] = {
            avg: native.metrics[name].avg ?? 0,
            stdev: native.metrics[name].stdev ?? 0,
          };
          for (const field of ["avg", "stdev"])
            assert(
              Math.abs(metrics[name][field] - (frozen.metrics[name][field] ?? 0)) < 1e-8,
              "UI padding or embedded database changed " + name + " " + field,
            );
        }
        assert.equal(native.health, frozen.health);
        assert.equal(native.armor, frozen.armor);
        const displayed = captured.metrics
          .slice(0, 3)
          .map((value) => Number(value.replaceAll(",", "")));
        for (const [index, name] of ["dps", "threat", "dtps"].entries())
          assert(
            Math.abs(displayed[index] - native.metrics[name].avg) <= 0.0051,
            "Imported browser/native " + name + " differs",
          );
        assert(!/Simulation notice/.test(await page.locator("body").innerText()));
        assert.deepEqual(errors, []);
        assert(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2,
          ),
        );
        await page.screenshot({
          path: join(dirname(reportPath), `${result.objective}-${model.release}-${width}.png`),
          fullPage: true,
        });
        await page.reload();
        await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
        assert.deepEqual((await storedSettings(page)).player.equipment, settings.player.equipment);
        if (width < 900) await page.getByRole("button", { name: "Build", exact: true }).click();
        await assertProcConsentDisabled(page);
        const row = {
          width,
          iterations,
          seed,
          metrics,
          health: native.health,
          armor: native.armor,
          requestSha256: hash(Buffer.from(captured.bytes)),
          importMatchesMeasuredSetup: true,
          savedEquipmentPersists: true,
          consentOffAfterReload: true,
          pageErrors: errors.length,
        };
        checked.push(row);
        console.log(
          JSON.stringify({
            profile: report.profile,
            scenario: report.scenario,
            objective: result.objective,
            width,
            status: "passed",
            requiresProvisionalEnchantOptIn,
          }),
        );
      } finally {
        await context.close();
      }
    }
    const gear = result.gear.items.map((spec, slot) => {
      if (!spec.id) return { slot, id: 0 };
      const item = items.get(spec.id),
        source = sources.get(spec.id);
      assert(item && source, "Selected item lacks catalog or acquisition evidence");
      return {
        slot,
        id: item.id,
        name: item.name,
        stats: item.stats,
        unique: item.unique ?? false,
        factionRestriction: item.factionRestriction ?? 0,
        source,
        inspection: data.inspection.items[item.id] ?? null,
        set: item.setId ? (data.inspection.sets[item.setId] ?? null) : null,
        enchant:
          result.searchedGearDescription.choices.find((choice) => choice.gearIndex === slot) ??
          null,
      };
    });
    builds.push({
      id: `${report.profile.replaceAll("_", "-")}-${report.scenario}-${result.objective}${report.inputs.enchantPolicy.provisionalEffectIds.length ? "-procs" : ""}`,
      profile: report.profile,
      scenario: report.scenario,
      objective: result.objective,
      href,
      settings,
      requiresProvisionalEnchantOptIn,
      validation: combineTankValidation(result.validation),
      checked,
      gear,
    });
  }
  const receipt = {
    schema: "kfc-tank-item-import-review.v1",
    status: "passed",
    scope: "exact-selected-imports-not-published-defaults",
    fingerprint: report.fingerprint,
    reportSha256: objectHash(report),
    replaySha256: objectHash(replay),
    release: model.release,
    engine: engine.fingerprint,
    nativeBinarySha256: engine.binarySha256,
    wasmSha256: model.wasmSha256,
    databaseSha256: engine.dataSha256.database,
    sourceSha256: {
      controller: hash(await readFile(import.meta.filename)),
      importPolicy: hash(await readFile(join(root, "infra/simulator/tank-build-import.mjs"))),
      consentCheck: hash(await readFile(join(root, "scripts/review-prebis-browser.mjs"))),
    },
    builds,
    verifiedAt: new Date().toISOString(),
    pointerWrites: 0,
  };
  const receiptPath = join(dirname(reportPath), `imports-${model.release}.json`),
    temporary = receiptPath + "." + randomUUID() + ".pending";
  await writeFile(temporary, JSON.stringify(receipt, null, 2) + "\n");
  await rename(temporary, receiptPath);
  console.log(
    JSON.stringify({
      status: "passed",
      fingerprint: report.fingerprint,
      release: model.release,
      importedBuilds: builds.length,
      browserChecks: builds.reduce((sum, build) => sum + build.checked.length, 0),
      pointerWrites: 0,
    }),
  );
} finally {
  for (const worker of workers) worker.close();
  await browser.close();
  await server.close();
}
