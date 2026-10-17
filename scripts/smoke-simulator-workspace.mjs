import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright");
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017";
const directory = resolve(
  process.env.FOREVER_SIMULATOR_ROOT || join(root, "artifacts/forever-simulator"),
);
const manifest = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
const baselinePath = join(directory, "workspace-baseline.json");
const capture = process.argv.includes("--capture-baseline");
const interactionsOnly = process.argv.includes("--interactions-only");
if (capture && interactionsOnly)
  throw new Error("Choose baseline capture or interaction checks, not both");
const starters = capture
  ? {}
  : JSON.parse(await readFile(join(directory, manifest.release, "kfc-tank-starters.json"), "utf8"));
const baseline =
  capture || interactionsOnly ? null : JSON.parse(await readFile(baselinePath, "utf8"));
const defaultEnchants = capture
  ? null
  : JSON.parse(
      await readFile(join(directory, manifest.release, "kfc-default-enchants.json"), "utf8"),
    );
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const runs = {};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
try {
  for (const spec of SIMULATOR_SPECS.filter(
    (entry) => entry.role !== "raid" && !interactionsOnly,
  )) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__workspaceRequests = [];
      const original = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync", "raidSimRequestSplit"].includes(message.msg)) {
          globalThis.__workspaceRequests.push({
            msg: message.msg,
            bytes: Array.from(message.inputData),
          });
        }
        return original.call(this, message, ...rest);
      };
    });
    try {
      const response = await page.goto(`${origin}/forever-sim/${manifest.release}/${spec.page}/`, {
        waitUntil: "domcontentloaded",
      });
      assert(response?.ok(), `${spec.slug}: HTTP ${response?.status()}`);
      await page.locator(".dps-action").waitFor({ state: "visible", timeout: 45000 });
      await page.waitForFunction(() => globalThis.document.querySelector("#simui-fixed-rng-seed"));
      await page.evaluate(() => {
        for (const [id, value] of [
          ["simui-fixed-rng-seed", "1337"],
          ["simui-iterations", "10"],
        ]) {
          const input = globalThis.document.getElementById(id);
          input.value = value;
          input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
        }
      });
      if (spec.role === "tank" && !capture) await assertTankStarter(page, spec.page);
      if (!capture) await assertDefaultEnchants(page, spec.page);
      await page.locator(".dps-action").click();
      await page.waitForFunction(
        () =>
          /\d[\d,]*\.\d+/.test(
            globalThis.document.querySelector(".results-content .topline-result-avg")
              ?.textContent ?? "",
          ) && !globalThis.document.querySelector(".dps-action")?.disabled,
        null,
        { timeout: 90000 },
      );
      const requests = await page.evaluate(() => globalThis.__workspaceRequests);
      assert(requests.length, `${spec.slug}: no real combat request`);
      const metrics = await page.locator(".results-content .topline-result-avg").allTextContents();
      runs[spec.slug] = {
        requests: requests.map((request) => ({
          msg: request.msg,
          sha256: digest(Buffer.from(request.bytes)),
        })),
        metrics,
      };
      if (!capture) {
        if (spec.role !== "tank") {
          const original = await savedSettings(page);
          const unenchanted = globalThis.structuredClone(original.value);
          const preset = defaultEnchants.presets.find(
            (entry) =>
              entry.profile === spec.page &&
              entry.gear.items.every(
                (item, i) => (item.id || 0) === (original.value.player.equipment.items[i]?.id || 0),
              ),
          );
          assert(preset, `${spec.slug}: cannot identify the default gear variant`);
          // Reconstruct every archived slot and the old explicit T1 setting, not just accessories.
          unenchanted.player.equipment = JSON.parse(
            execFileSync(
              "git",
              ["show", `HEAD:ui/${spec.page}/gear_sets/forever_${preset.variant}.gear.json`],
              { cwd: join(root, ".cache/forever-sim-upstream"), encoding: "utf8" },
            ),
          );
          for (const item of unenchanted.player.equipment.items) delete item.enchant;
          unenchanted.player.foreverTier1Bonuses = true;
          await page.evaluate(
            ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
            { key: original.key, value: unenchanted },
          );
          await page.reload();
          await page.locator(".dps-action").waitFor({ state: "visible", timeout: 45000 });
          await page.locator(".dps-action").click();
          await page.waitForFunction(
            () =>
              /\d[\d,]*\.\d+/.test(
                globalThis.document.querySelector(".results-content .topline-result-avg")
                  ?.textContent ?? "",
              ) && !globalThis.document.querySelector(".dps-action")?.disabled,
            null,
            { timeout: 90000 },
          );
          const requests = await page.evaluate(() => globalThis.__workspaceRequests);
          assert.deepEqual(
            {
              requests: requests.map((request) => ({
                msg: request.msg,
                sha256: digest(Buffer.from(request.bytes)),
              })),
              metrics: await page.locator(".results-content .topline-result-avg").allTextContents(),
            },
            baseline.runs[spec.slug],
            `${spec.slug}: reconstructing archived gear and T1 setting must reproduce the old engine inputs/results`,
          );
          await page.evaluate(
            ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
            original,
          );
          await page.reload();
          await page.locator(".dps-action").waitFor({ state: "visible", timeout: 45000 });
          await assertDefaultEnchants(page, spec.page);
        } else {
          assert(
            metrics.length > 0 &&
              metrics.every((metric) => Number.isFinite(Number(metric.replaceAll(",", "")))),
            `${spec.slug}: invalid tank combat results`,
          );
        }
        await assertWorkspace(page);
      }
      assert.deepEqual(errors, [], `${spec.slug}: browser errors`);
      console.log(
        `PASS ${spec.slug}: ${metrics.join(" / ")}${capture ? " baseline captured" : spec.role === "tank" ? " enchanted real-item starter" : " enchanted defaults; unenchanted engine baseline unchanged"}`,
      );
    } finally {
      await context.close();
    }
  }
  if (capture) {
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(
      baselinePath,
      JSON.stringify(
        {
          revision: manifest.revision,
          release: manifest.release,
          wasm: manifest.files["lib.wasm"].sha256,
          runs,
        },
        null,
        2,
      ),
    );
    console.log(`Saved deterministic baseline: ${baselinePath}`);
  } else {
    if (baseline) {
      assert.equal(manifest.revision, baseline.revision);
      // Removing only the added default enchants still reproduces the old requests/results.
      assert.equal(
        digest(await readFile(join(directory, manifest.release, "lib.wasm"))),
        manifest.files["lib.wasm"].sha256,
        "WASM release integrity",
      );
    }
    await testTankStarterPresets(browser);
    await testDpsEnchantPresets(browser);
    await testInteractions(browser);
  }
} finally {
  await browser.close();
}

async function savedSettings(page) {
  return page.evaluate(() => {
    for (const key of Object.keys(globalThis.localStorage)) {
      try {
        const value = JSON.parse(globalThis.localStorage.getItem(key));
        if (key.endsWith("__currentSettings__") && value?.player?.equipment) return { key, value };
      } catch {
        // Other engine settings include plain strings and numbers.
      }
    }
    throw new Error("No persisted individual simulator settings");
  });
}

async function assertTankStarter(page, key) {
  const { value } = await savedSettings(page);
  const horde = [
    "RaceOrc",
    "RaceTauren",
    "RaceTroll",
    "RaceUndead",
    "RaceSkyborneWindshaper",
  ].includes(value.player.race);
  assert.deepEqual(
    value.player.equipment.items.map((item) => item.id ?? 0),
    (horde ? starters[key].hordeGear : starters[key].gear).items.map((item) => item.id ?? 0),
    `${key}: starter gear was dropped or changed`,
  );
  assert.deepEqual(
    value.player.equipment.items.map((item) => item.enchant ?? 0),
    (horde ? starters[key].hordeGear : starters[key].gear).items.map((item) => item.enchant ?? 0),
    `${key}: default enchants were dropped`,
  );
  assert.equal(value.player.foreverTier1Bonuses ?? false, false, `${key}: phantom Tier 1 bonuses`);
  assert(
    value.player.bonusStats?.stats?.every((stat) => stat === 0) ?? true,
    `${key}: synthetic bonus stats`,
  );
}

async function assertDefaultEnchants(page, profile) {
  const { value } = await savedSettings(page);
  const actual = value.player.equipment.items.map((item) => [item.id ?? 0, item.enchant ?? 0]);
  assert(
    defaultEnchants.presets.some(
      (preset) =>
        preset.profile === profile &&
        JSON.stringify(preset.gear.items.map((item) => [item.id ?? 0, item.enchant ?? 0])) ===
          JSON.stringify(actual),
    ),
    `${profile}: supplied default enchants missing or altered`,
  );
}

async function testDpsEnchantPresets(browser) {
  const profiles = [
    ...new Set(
      defaultEnchants.presets
        .filter((preset) => !starters[preset.profile])
        .map((preset) => preset.profile),
    ),
  ];
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/forever-sim/${manifest.release}/${profile}/`);
      await page.locator(".dps-action").waitFor({ timeout: 45000 });
      const initial = await savedSettings(page);
      for (const preset of defaultEnchants.presets.filter((preset) => preset.profile === profile)) {
        await page
          .locator(".gear-tab-right .saved-data-presets a.saved-data-set-name")
          .filter({ hasText: preset.name })
          .click();
        const { value } = await savedSettings(page);
        assert.deepEqual(
          value.player.equipment.items.map((item) => [item.id ?? 0, item.enchant ?? 0]),
          preset.gear.items.map((item) => [item.id ?? 0, item.enchant ?? 0]),
          `${profile}/${preset.variant}: preset load lost enchants`,
        );
        assert.equal(value.player.talentsString, initial.value.player.talentsString);
        assert.deepEqual(value.player.rotation, initial.value.player.rotation);
      }
      const original = await savedSettings(page);
      delete original.value.player.equipment.items[0].enchant;
      await page.evaluate(
        ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
        original,
      );
      await page.reload();
      await page.locator(".dps-action").waitFor({ timeout: 45000 });
      assert.equal(
        (await savedSettings(page)).value.player.equipment.items[0].enchant,
        undefined,
        `${profile}: custom No enchant overwritten`,
      );
      assert.deepEqual(errors, [], `${profile}: browser errors`);
      console.log(
        `PASS ${profile}: every named gear preset enchanted; custom empty enchant survives reload`,
      );
    } finally {
      await context.close();
    }
  }
}

async function testTankStarterPresets(browser) {
  for (const [key, starter] of Object.entries(starters)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/forever-sim/${manifest.release}/${key}/`);
      const preset = page
        .locator(
          ".gear-tab-right .saved-data-presets .saved-data-set-chip:not(.disabled) .saved-data-set-name",
        )
        .filter({ hasText: starter.name });
      await preset.waitFor();
      await page.locator("#simui-iterations").fill("10");
      await page.locator("#simui-iterations").dispatchEvent("change");
      await assertTankStarter(page, key);
      const saved = await savedSettings(page);
      saved.value.player.equipment.items[0] = {};
      saved.value.player.foreverTier1Bonuses = true;
      await page.evaluate(
        ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
        saved,
      );
      await page.reload();
      await preset.waitFor();
      const saveInput = page.locator(".gear-tab-right .saved-data-save-input");
      await saveInput.fill("Smoke test custom gear");
      await page.getByRole("button", { name: "Save Gear Set", exact: true }).click();
      await page
        .locator(".gear-tab-right .saved-data-custom .saved-data-set-name")
        .filter({ hasText: "Smoke test custom gear" })
        .waitFor();
      const edited = await savedSettings(page);
      assert.equal(
        edited.value.player.equipment.items[0].id ?? 0,
        0,
        "existing saved gear must not be overwritten on reload",
      );
      assert.equal(
        edited.value.player.foreverTier1Bonuses,
        true,
        "existing explicit Tier 1 setting must survive reload",
      );
      await preset.click();
      await assertTankStarter(page, key);
      const restored = await savedSettings(page);
      assert.equal(restored.value.player.talentsString, saved.value.player.talentsString);
      assert.deepEqual(restored.value.player.rotation, saved.value.player.rotation);
      await page.reload();
      await preset.waitFor();
      await assertTankStarter(page, key);
      await page
        .locator(".gear-tab-right .saved-data-custom .saved-data-set-name")
        .filter({ hasText: "Smoke test custom gear" })
        .waitFor();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await assertWorkspace(page);
        await page.locator(".kfc-starter-method summary").click();
        assert.match(await page.locator(".kfc-starter-method").innerText(), /not BiS/);
        await assertWorkspace(page);
        await page.locator(".kfc-starter-method summary").click();
        await page.evaluate(() => globalThis.scrollTo(0, 0));
        await page.waitForFunction(
          () =>
            globalThis.getComputedStyle(globalThis.document.querySelector("#gear-tab")).opacity ===
            "1",
        );
        await page.screenshot({
          path: join(directory, `${key}-starter-${width}.png`),
          fullPage: true,
        });
      }
      if (starter.factionVariants) {
        for (const horde of [false, true]) {
          const saved = await savedSettings(page);
          saved.value.player.race =
            key === "tank_warrior"
              ? horde
                ? "RaceOrc"
                : "RaceHuman"
              : horde
                ? "RaceTauren"
                : "RaceNightElf";
          await page.evaluate(
            ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
            saved,
          );
          await page.reload();
          await preset.waitFor();
          await preset.click();
          await assertTankStarter(page, key);
          const disabled = page.locator(
            ".gear-tab-right .saved-data-presets .saved-data-set-chip.disabled .saved-data-set-name",
          );
          assert.equal(await disabled.count(), 1);
          await disabled.evaluate((element) => element.click());
          await assertTankStarter(page, key);
          await page.reload();
          await preset.waitFor();
          await assertTankStarter(page, key);
        }
      }
      assert.deepEqual(errors, [], `${key}: browser errors`);
      console.log(
        `PASS ${key}: starter load, saved-build preservation, Tier 1 reset, reload and responsive library`,
      );
    } finally {
      await context.close();
    }
  }
}

async function assertWorkspace(page) {
  assert.equal(await page.locator(".kfc-workspace-heading").count(), 1);
  assert.equal(await page.locator(".kfc-slot-label").count(), 17);
  assert.equal(
    (await page.locator(".kfc-workspace-heading .sim-tabs [role=tab]").count()) > 0,
    true,
  );
  if (await page.locator("#gear-tab").isVisible()) {
    assert.equal(
      await page.evaluate(() => {
        const library = globalThis.document.querySelector(".gear-tab-right");
        const gear = globalThis.document.querySelector(".gear-tab-left");
        return (
          library.nextElementSibling === gear &&
          library.getBoundingClientRect().bottom <= gear.getBoundingClientRect().top + 1
        );
      }),
      true,
      "Build library must precede equipment at every viewport width",
    );
  }
  assert.equal(
    await page.evaluate(() => {
      const workspace = globalThis.document.querySelector(".kfc-workspace");
      return (
        globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1 ||
        workspace.scrollWidth > workspace.clientWidth + 1
      );
    }),
    false,
    "horizontal overflow",
  );
}

async function testInteractions(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `${origin}/forever-sim/${manifest.release}/warrior/`;
  for (const width of [1600, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator(".kfc-slot-label").first().waitFor();
    await assertWorkspace(page);
    await page.locator(".import-link").click();
    await page.locator(".import-dropdown .dropdown-menu.show").waitFor();
    assert.match(await page.locator(".import-dropdown .dropdown-menu").innerText(), /JSON/);
    await page.keyboard.press("Escape");
    await page.locator(".export-link").click();
    await page.locator(".export-dropdown .dropdown-menu.show").waitFor();
    assert.match(await page.locator(".export-dropdown .dropdown-menu").innerText(), /JSON/);
    await page.keyboard.press("Escape");
    if (width < 900) {
      await page.getByRole("button", { name: "Results", exact: true }).click();
      assert.equal(await page.locator(".sim-sidebar .dps-action").isVisible(), true);
      await page.getByRole("button", { name: "Build", exact: true }).click();
    }
    await page.locator(".gear-picker-left .item-picker-name").first().click();
    await page.locator(".modal.show .selector-modal").waitFor();
    await page.locator(".modal.show").evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    assert.equal(
      await page
        .locator(".modal.show .selector-modal")
        .evaluate((element) => element.getBoundingClientRect().right <= globalThis.innerWidth + 1),
      true,
      "item modal escapes viewport",
    );
    const names = await page.locator(".gear-picker-root .item-picker-name").allTextContents();
    await page.locator(".modal.show .selector-modal-search").first().click();
    assert.equal(
      await page.locator(".modal.show .selector-modal").isVisible(),
      true,
      "clicking inside picker must not cancel it",
    );
    await page.mouse.click(1, 500);
    await page.locator(".modal.show .selector-modal").waitFor({ state: "hidden" });
    assert.deepEqual(
      await page.locator(".gear-picker-root .item-picker-name").allTextContents(),
      names,
      "outside-click dismissal changed equipment",
    );
    await page.locator(".gear-picker-left .item-picker-name").first().click();
    await page.locator(".modal.show").evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    await page.keyboard.press("Escape");
    await page.locator(".modal.show .selector-modal").waitFor({ state: "hidden" });
    await page.locator(".sim-tabs [data-bs-target='#gear-tab']").focus();
    const nextTab = await page
      .locator(".sim-tabs [role=tab]")
      .evaluateAll((tabs) =>
        tabs.filter((tab) => tab.getClientRects().length)[1].getAttribute("data-bs-target"),
      );
    await page.keyboard.press("ArrowRight");
    await page.locator(`${nextTab}.active`).waitFor();
    assert.equal(
      await page
        .locator(".sim-tabs [role=tab].active")
        .evaluate((tab) => globalThis.document.activeElement === tab),
      true,
      "keyboard switch lost focus",
    );
    await page.keyboard.press("Home");
    await page.locator("#gear-tab.active").waitFor();
    await page.locator(".sim-tabs [data-bs-target='#settings-tab']").click();
    await page.locator("#settings-tab.active").waitFor();
    await assertWorkspace(page);
    await page.locator(".sim-tabs [data-bs-target='#talents-tab']").click();
    await page.locator("#talents-tab.active").waitFor();
    await assertWorkspace(page);
    assert.equal(await page.locator(".talent-tree-picker-root").count(), 3);
    await page.locator(".sim-tabs [data-bs-target='#rotation-tab']").click();
    await page.locator("#rotation-tab.active").waitFor();
    await assertWorkspace(page);
    const resultsTab = page.locator(".sim-tabs [role=tab]").filter({ hasText: /^Results$/ });
    await resultsTab.click();
    await page.locator(`${await resultsTab.getAttribute("data-bs-target")}.active`).waitFor();
    await assertWorkspace(page);
    const layers = await page
      .locator(".dr-toolbar")
      .first()
      .evaluate((toolbar) => ({
        report: Number(globalThis.getComputedStyle(toolbar).zIndex),
        header: Number(
          globalThis.getComputedStyle(globalThis.document.querySelector(".kfc-workspace-heading"))
            .zIndex,
        ),
        top: parseFloat(globalThis.getComputedStyle(toolbar).top),
        headerHeight: globalThis.document
          .querySelector(".kfc-workspace-heading")
          .getBoundingClientRect().height,
      }));
    assert(layers.report < layers.header, "result toolbar overlaps workspace header");
    assert(
      width < 900 ? layers.top === 0 : layers.top >= layers.headerHeight,
      "result toolbar has wrong sticky offset",
    );
    await page.locator(".sim-tabs [data-bs-target='#gear-tab']").click();
    await page.locator("#gear-tab.active").waitFor();
    const screenshot = join(directory, `workspace-${width}.png`);
    await page.waitForFunction(
      () =>
        globalThis.getComputedStyle(globalThis.document.querySelector("#gear-tab")).opacity === "1",
    );
    await page.waitForFunction(
      () => globalThis.getComputedStyle(globalThis.document.body).opacity === "1",
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log(`PASS workspace interactions ${width}px: ${screenshot}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/forever-sim/${manifest.release}/raid/`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator(".kfc-workspace-heading").waitFor();
  assert.equal((await page.locator(".sim-tabs [role=tab]").count()) > 0, true);
  assert.deepEqual(errors, [], "interaction browser errors");
  await page.close();
  console.log("PASS Raid workspace");
  const embedded = await browser.newPage();
  await embedded.goto(origin + "/forever/simulator/warrior");
  await embedded.frameLocator("iframe").locator(".kfc-workspace-heading").waitFor();
  const focus = embedded.getByRole("button", { name: "Focus mode", exact: true });
  if (await embedded.evaluate(() => globalThis.document.fullscreenEnabled)) {
    await focus.click();
    await embedded.waitForFunction(() => !!globalThis.document.fullscreenElement);
    await embedded.getByRole("button", { name: "Exit focus mode", exact: true }).click();
    await embedded.waitForFunction(() => !globalThis.document.fullscreenElement);
    console.log("PASS embedded focus mode enter/exit");
  }
  const frame = embedded.frameLocator("iframe");
  for (const width of [1440, 390]) {
    await embedded.setViewportSize({ width, height: 1000 });
    await frame.locator(".gear-picker-left .item-picker-name").first().click();
    await frame.locator(".modal.show .selector-modal").waitFor();
    await frame.locator(".modal.show").evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    await embedded.locator("iframe").evaluate((iframe) => {
      const child = iframe.contentWindow;
      for (const [origin, source] of [
        [globalThis.location.origin, child],
        ["https://untrusted.example", globalThis.window],
      ]) {
        child.dispatchEvent(
          new globalThis.MessageEvent("message", {
            origin,
            source,
            data: { type: "kfc-simulator-dismiss-item-picker" },
          }),
        );
      }
    });
    assert.equal(
      await frame.locator(".modal.show .selector-modal").isVisible(),
      true,
      "untrusted dismissal message was accepted",
    );
    await embedded.mouse.click(1, 500);
    await frame.locator(".modal.show .selector-modal").waitFor({ state: "hidden" });
    console.log(`PASS embedded outside-click dismissal ${width}px, with origin/source guards`);
  }
  await embedded.setViewportSize({ width: 1440, height: 1000 });
  await frame
    .locator(".sim-tabs [role=tab]")
    .filter({ hasText: /^Results$/ })
    .click();
  await frame.locator(".detailed-results-1-iteration-button").click();
  await frame
    .locator(".results-content .topline-result-avg")
    .first()
    .filter({ hasText: /\d[\d,]*\.\d+/ })
    .waitFor({ timeout: 90000 });
  await embedded.locator("iframe").screenshot({ path: join(directory, "workspace-results.png") });
  await frame.locator(".sim-tabs [data-bs-target='#gear-tab']").click();
  await embedded.waitForFunction(() => {
    const document = globalThis.document.querySelector("iframe").contentDocument;
    return (
      document && globalThis.getComputedStyle(document.querySelector("#gear-tab")).opacity === "1"
    );
  });
  console.log("PASS embedded report single-iteration action produces real combat results");
  await embedded.screenshot({ path: join(directory, "workspace-embedded.png"), fullPage: true });
  await embedded.close();
  await testStopRecovery(browser);
}

async function testStopRecovery(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Simulate an unresponsive abort transport without replacing real combat requests/results.
  await page.addInitScript(() => {
    globalThis.__workspaceRunStarted = false;
    const original = globalThis.Worker.prototype.postMessage;
    globalThis.Worker.prototype.postMessage = function (message, ...rest) {
      if (message.msg === "raidSimAsync") globalThis.__workspaceRunStarted = true;
      if (message.msg === "abortById") return;
      return original.call(this, message, ...rest);
    };
  });
  try {
    await page.goto(`${origin}/forever-sim/${manifest.release}/warrior/`);
    await page.locator("#player-race").waitFor({ state: "attached" });
    await page.locator("#simui-iterations").fill("2000000");
    await page.locator("#simui-iterations").dispatchEvent("change");
    await page.locator(".dps-action").click();
    await page.waitForFunction(() => globalThis.__workspaceRunStarted);
    await page.locator(".sim-abort-button").waitFor();
    await page.locator(".sim-abort-button").click();
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector(".dps-action").disabled ||
        !globalThis.document.querySelector(".kfc-stop-note").hidden,
    );
    if (await page.locator(".dps-action").isDisabled()) {
      assert.equal(await page.locator(".kfc-run-status").innerText(), "Stopping…");
      await Promise.all([
        page.waitForEvent("domcontentloaded"),
        page.getByRole("button", { name: "Restart engine · clears results", exact: true }).click(),
      ]);
      await page.locator("#player-race").waitFor({ state: "attached" });
      assert.equal(
        await page.locator("#simui-iterations").inputValue(),
        "2000000",
        "recovery lost saved settings",
      );
      console.log("PASS stalled-worker recovery with preserved settings");
    } else console.log("PASS cooperative worker cancellation");
    await page.locator("#simui-iterations").fill("10");
    await page.locator("#simui-iterations").dispatchEvent("change");
    await page.locator(".dps-action").click();
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector(".dps-action").disabled &&
        !!globalThis.document.querySelector(".results-sim-set-reference"),
      null,
      { timeout: 90000 },
    );
    assert.deepEqual(errors, [], "recovery browser errors");
    console.log("PASS successful combat run after recovery");
  } finally {
    await page.close();
  }
}
