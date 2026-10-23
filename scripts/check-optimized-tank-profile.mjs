import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import console from "node:console";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";
import { openNativeRunners } from "../infra/simulator/native-runner.mjs";
import { normalizeTankImportRequest } from "../infra/simulator/tank-build-import.mjs";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1");
const { values } = parseArgs({ options: { release: { type: "string" } }, strict: true });
assert(
  /^[a-f0-9]{24}$/.test(values.release ?? ""),
  "Pass --release=<staged optimized tank profile>",
);
const release = values.release,
  directory = join(base, "deliveries", release),
  json = async (path) => JSON.parse(await readFile(path, "utf8")),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  hash = (value) => sha(JSON.stringify(value));
const manifest = await json(join(directory, "manifest.json")),
  proof = await json(join(directory, "kfc-optimized-tank-profile.json"));
assert.equal(proof.release, release);
assert.equal(proof.status, "staged-awaiting-default-and-preset-review");
assert.equal(hash(proof.inputs).slice(0, 24), release);
assert.equal(
  manifest.files["kfc-optimized-tank-profile.json"].sha256,
  sha(await readFile(join(directory, "kfc-optimized-tank-profile.json"))),
);
assert.equal(manifest.files["lib.wasm"].sha256, proof.wasmSha256);
const engine = await json(join(base, "engines", proof.engine, "manifest.json"));
assert.equal(engine.fingerprint, proof.engine);
assert.equal(engine.binarySha256, proof.nativeBinarySha256);
const db = await json(join(directory, "assets/database/db.json"));
assert.equal(hash(db), proof.databaseSha256);
const codec = join(
  root,
  "artifacts/forever-simulator/optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs",
);
assert.equal(
  sha(await readFile(codec)),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(codec).href),
  { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
    "playwright",
  ),
  server = await startSimulatorLocalServer(join(base, "deliveries"), manifest),
  browser = await chromium.launch(),
  workers = await openNativeRunners(engine.binary, engine.workspace, engine.binarySha256, 1),
  checked = [];
const output = join(directory, "browser-review");
await mkdir(output, { recursive: true });
const settings = async (page) => {
  const found = await page.evaluate(() =>
    Object.entries(globalThis.localStorage)
      .filter(([key]) => key.endsWith("__currentSettings__"))
      .map(([, value]) => JSON.parse(value))
      .filter((value) => value.player && value.encounter),
  );
  assert.equal(found.length, 1);
  return found[0];
};
const ready = async (page) => {
  await page.waitForFunction(
    () =>
      ["true", "error"].includes(
        globalThis.document.querySelector(".sim-ui")?.getAttribute("data-kfc-tank-builds-ready"),
      ),
    null,
    { timeout: 90000 },
  );
  assert.equal(
    await page.locator(".sim-ui").getAttribute("data-kfc-tank-builds-ready"),
    "true",
    await page.locator("body").innerText(),
  );
};
const gearTab = async (page, width) => {
  if (width < 900) await page.getByRole("button", { name: "Build", exact: true }).click();
  await page.getByRole("tab", { name: "Gear", exact: true }).click();
};
const assertSetup = async (page, build) => {
  const stored = await settings(page);
  for (const key of [
    "equipment",
    "race",
    "profession1",
    "profession2",
    "talentsString",
    "rotation",
    "consumes",
    "buffs",
  ])
    assert.deepEqual(stored.player[key], build.settings.player[key], "Preset changed " + key);
  for (const key of ["raidBuffs", "partyBuffs", "debuffs", "tanks", "encounter"])
    assert.deepEqual(stored[key], build.settings[key], "Preset changed " + key);
  assert.equal(stored.settings.iterations, 5000);
  assert.equal(stored.settings.fixedRngSeed, "81491001");
  assert.equal(stored.settings.faction, build.settings.settings.faction);
  assert.equal(await page.locator("#kfc-tank-build-choice").inputValue(), build.id);
};
async function simulate(page, build, width) {
  if (build.requiresProvisionalEnchantOptIn) {
    const hand = page
      .locator(".gear-picker-root .item-picker-root")
      .filter({ has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }) });
    await hand.locator(".item-picker-enchant").click();
    const modal = page.locator(".modal.show .selector-modal");
    await modal.locator(".tab-pane.active .kfc-enchant-optin input").check();
    await modal.locator(".modal-header .btn-close:visible").first().click();
  }
  if (width < 900) await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.evaluate(() => {
    for (const [id, value] of [
      ["simui-iterations", "100"],
      ["simui-fixed-rng-seed", "83491001"],
    ]) {
      const input = globalThis.document.getElementById(id);
      if (!input) throw new Error("Missing simulation control " + id);
      input.value = value;
      input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
    }
  });
  const before = await page.evaluate(() => globalThis.__kfcNativeRequests.length);
  await page.locator(".dps-action").click();
  await page.waitForFunction(
    (count) =>
      globalThis.__kfcNativeRequests.length > count &&
      !globalThis.document.querySelector(".dps-action")?.disabled &&
      /\d[\d,]*\.\d+/.test(
        globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
          "",
      ),
    before,
    { timeout: 180000 },
  );
  const captured = await page.evaluate(() => ({
    bytes: globalThis.__kfcNativeRequests.at(-1),
    metrics: Array.from(
      globalThis.document.querySelectorAll(".results-content .topline-result-avg"),
      (node) => node.textContent,
    ),
  }));
  const doc = await json(join(base, "runs", build.sourceFingerprint, "request.json")),
    expected = api.RaidSimRequest.fromBinary(Buffer.from(doc.requestBase64, "base64")),
    actual = api.RaidSimRequest.fromBinary(Uint8Array.from(captured.bytes));
  expected.raid.parties[0].players[0].equipment = api.EquipmentSpec.fromJson(
    build.settings.player.equipment,
  );
  expected.simOptions.iterations = 100;
  expected.simOptions.randomSeed = 83491001n;
  assert.equal(actual.simOptions.iterations, 100);
  assert.equal(actual.simOptions.randomSeed, 83491001n);
  assert.equal(actual.simOptions.ruleset, 1);
  const normalized = api.RaidSimRequest.fromJson(
    normalizeTankImportRequest(api.RaidSimRequest.toJson(actual)),
  );
  normalized.simOptions = expected.simOptions;
  assert.deepEqual(
    api.RaidSimRequest.toBinary(normalized),
    api.RaidSimRequest.toBinary(expected),
    "Preset did not generate the measured combat request",
  );
  const native = await workers[0].run({
    id: `${build.id}-${width}`,
    requestBase64: Buffer.from(captured.bytes).toString("base64"),
    gear: build.settings.player.equipment.items,
    duration: expected.encounter.duration,
    iterations: 100,
    seed: 83491001,
    detail: true,
  });
  const metrics = {};
  for (const [index, key] of ["dps", "threat", "dtps"].entries()) {
    const displayed = Number(captured.metrics[index].replaceAll(",", ""));
    assert(
      Math.abs(displayed - native.metrics[key].avg) <= 0.0051,
      "Preset browser/native " + key + " differs",
    );
    metrics[key] = native.metrics[key].avg;
  }
  assert(!/Simulation notice/.test(await page.locator("body").innerText()));
  return { metrics, requestSha256: sha(Buffer.from(captured.bytes)), iterations: 100 };
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      errors.push(dialog.message());
      await dialog.dismiss();
    });
    await page.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
    await page.addInitScript(() => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__kfcNativeRequests = [];
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync"].includes(message.msg))
          globalThis.__kfcNativeRequests.push(Array.from(message.inputData));
        return post.call(this, message, ...rest);
      };
    });
    try {
      assert((await page.goto(`${server.origin}/forever-sim/${release}/${proof.profile}/`))?.ok());
      await ready(page);
      const initial = proof.builds.find((build) => build.id === proof.defaultBuildId);
      assert(initial && !initial.requiresProvisionalEnchantOptIn);
      await assertSetup(page, initial);
      await gearTab(page, width);
      await assertProcConsentDisabled(page);
      assert(
        !/Blue PvP|stat-weighted fillers|Starter priorities/.test(
          await page.locator(".gear-tab-right").innerText(),
        ),
      );
      const saveName = page.locator(
        '.gear-tab-right .saved-data-manager-root:not(.preset-configuration-picker-root) input[type="text"]',
      );
      assert.equal(
        await saveName.inputValue(),
        initial.label,
        "Fresh save name still describes the old starter",
      );
      await page.screenshot({ path: join(output, `fresh-default-${width}.png`), fullPage: true });
      for (const build of proof.builds) {
        await gearTab(page, width);
        await page.locator("#kfc-tank-build-choice").selectOption(build.id);
        await assertSetup(page, build);
        await assertProcConsentDisabled(page);
        const result = await simulate(page, build, width);
        assert.deepEqual(errors, []);
        assert(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2,
          ),
        );
        await page.screenshot({ path: join(output, `${build.id}-${width}.png`), fullPage: true });
        checked.push({
          kind: "preset",
          build: build.id,
          width,
          ...result,
          consentExplicit: build.requiresProvisionalEnchantOptIn,
        });
        console.log(
          JSON.stringify({
            kind: "preset",
            build: build.id,
            width,
            status: "passed",
            metrics: result.metrics,
          }),
        );
        await page.goto(server.origin + build.href);
        await page.waitForURL((url) => url.hash === "");
        await ready(page);
        await assertSetup(page, build);
        await gearTab(page, width);
        await assertProcConsentDisabled(page);
      }
      await gearTab(page, width);
      await page.locator("#kfc-tank-build-choice").selectOption(initial.id);
      const report = await json(join(base, "runs", initial.sourceFingerprint, "report.json")),
        slot = [0, 2, 4, 14].find(
          (index) =>
            report.baseline.gear.items[index].id !==
            initial.settings.player.equipment.items[index].id,
        );
      assert(slot !== undefined, "No independent gear edit candidate");
      const candidate = db.items.find((item) => item.id === report.baseline.gear.items[slot].id),
        labels = { 0: "Head", 2: "Shoulders", 4: "Chest", 14: "Main Hand" };
      assert(candidate);
      const picker = page.locator(".gear-picker-root .item-picker-root").filter({
        has: page.locator(".kfc-slot-label", { hasText: new RegExp("^" + labels[slot] + "$") }),
      });
      await picker.locator(".item-picker-name").click();
      const modal = page.locator(".modal.show .selector-modal");
      await modal.waitFor();
      await modal.locator(".tab-pane.active .selector-modal-search").fill(candidate.name);
      await modal
        .locator(".selector-modal-list-item-link")
        .filter({ hasText: candidate.name })
        .first()
        .click();
      await modal.locator(".modal-header .btn-close:visible").first().click();
      assert.equal((await settings(page)).player.equipment.items[slot].id, candidate.id);
      assert.equal(await page.locator("#kfc-tank-build-choice").inputValue(), "");
      const customized = await settings(page);
      await page.reload();
      await ready(page);
      assert.deepEqual(
        (await settings(page)).player.equipment,
        customized.player.equipment,
        "Reload replaced the saved custom character",
      );
      assert.equal(await page.locator("#kfc-tank-build-choice").inputValue(), "");
      await page.goto(server.origin + initial.href);
      await page.waitForURL((url) => url.hash === "");
      await ready(page);
      await assertSetup(page, initial);
      checked.push({
        kind: "preservation",
        width,
        defaultReady: true,
        customGearSurvivesReload: true,
        explicitImportWins: true,
        noLegacyPresetCopy: true,
      });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  const receipt = {
    schema: "kfc-optimized-tank-browser-review.v1",
    status: "passed",
    profile: proof.profile,
    release,
    proofSha256: sha(await readFile(join(directory, "kfc-optimized-tank-profile.json"))),
    engine: proof.engine,
    wasmSha256: proof.wasmSha256,
    checked,
    gates: {
      freshDefault: true,
      everyPreset: true,
      exactCombatRequest: true,
      browserNativeParity: true,
      customCharacterPreserved: true,
      explicitImportPreserved: true,
      provisionalConsentOff: true,
      desktopMobile: true,
      noLegacyPresetCopy: true,
    },
    sourceSha256: sha(await readFile(import.meta.filename)),
    verifiedAt: new Date().toISOString(),
    pointerWrites: 0,
  };
  await writeFile(
    join(directory, "browser-review.json.pending"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  await rename(
    join(directory, "browser-review.json.pending"),
    join(directory, "browser-review.json"),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      release,
      profile: proof.profile,
      checks: checked.length,
      pointerWrites: 0,
    }),
  );
} finally {
  for (const worker of workers) worker.close();
  await browser.close();
  await server.close();
}
