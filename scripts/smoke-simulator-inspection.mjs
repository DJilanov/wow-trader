import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright");
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017";
const directory = resolve(
  process.env.FOREVER_SIMULATOR_ROOT || join(root, "artifacts/forever-simulator"),
);
const manifest = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function settle(page) {
  await page.evaluate(async () => {
    await Promise.allSettled(
      globalThis.document.getAnimations().map((animation) => animation.finished),
    );
  });
}
async function saved(page) {
  return page.evaluate(() => {
    for (const key of Object.keys(globalThis.localStorage)) {
      const raw = globalThis.localStorage.getItem(key);
      if (!raw?.startsWith("{")) continue;
      const value = JSON.parse(raw);
      if (value.player?.equipment) return { key, value };
    }
    throw new Error("No saved character");
  });
}
async function start(page, spec) {
  const response = await page.goto(`${origin}/forever-sim/${manifest.release}/${spec}/`, {
    waitUntil: "domcontentloaded",
  });
  assert(response?.ok());
  await page.locator(".dps-action").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => globalThis.document.querySelector("#simui-fixed-rng-seed"));
  await settle(page);
}
async function assertInside(page, selector) {
  assert(
    await page.locator(selector).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return (
        box.left >= -1 &&
        box.top >= -1 &&
        box.right <= globalThis.innerWidth + 1 &&
        box.bottom <= globalThis.innerHeight + 1
      );
    }),
    `${selector} escapes viewport`,
  );
}
async function run(page) {
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
  await page.locator(".dps-action").click();
  await page.waitForFunction(
    () =>
      /\d[\d,]*\.\d+/.test(
        globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
          "",
      ) && !globalThis.document.querySelector(".dps-action")?.disabled,
    null,
    { timeout: 90000 },
  );
  return page.locator(".results-content .topline-result-avg").allTextContents();
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page, "tank_warrior");
  assert((await page.locator(".item-picker-enchant:visible").count()) > 0);
  const firstItem = page.locator(".gear-picker-root .item-picker-name").first();
  for (const width of [1600, 1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.mouse.move(1, 1);
    await firstItem.hover();
    await page.locator("[role=tooltip] .kfc-item-tooltip").waitFor();
    assert.match(await page.locator("[role=tooltip] .kfc-item-tooltip").innerText(), /Stamina/);
    await assertInside(page, "[role=tooltip] .kfc-item-tooltip");
    await page.keyboard.press("Escape");
    await page.locator("[role=tooltip] .kfc-item-tooltip").waitFor({ state: "hidden" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const back = page
    .locator(".gear-picker-root .item-picker-root")
    .filter({ has: page.locator(".kfc-slot-label", { hasText: /^Back$/ }) });
  await back.locator(".item-picker-enchant").click();
  const modal = page.locator(".modal.show .selector-modal");
  await modal.waitFor();
  await settle(page);
  await firstItem.dispatchEvent("pointerover");
  assert(
    await page
      .locator("[role=tooltip] .kfc-item-tooltip:visible")
      .evaluateAll((tooltips) =>
        tooltips.every((tooltip) =>
          tooltip.closest("[data-tippy-root]")?._tippy?.reference?.closest(".modal.show"),
        ),
      ),
    "Only previews owned by the active picker may be visible",
  );
  assert.equal(
    await modal.getByRole("tab", { name: "Enchant", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  const search = modal.locator(".tab-pane.active .selector-modal-search");
  await search.fill("Minor Agility");
  const miniGear = modal
    .locator('.item-picker-icon-wrapper[data-slot="13"] [data-kfc-inspect]')
    .first();
  await page.mouse.move(1, 1);
  await miniGear.hover();
  await page.locator("[role=tooltip] .kfc-item-tooltip").waitFor();
  assert.equal(
    await page
      .locator("[data-tippy-root]:has(.kfc-item-tooltip)")
      .evaluate((tooltip) => globalThis.getComputedStyle(tooltip).pointerEvents),
    "none",
    "Preview must not intercept candidate/detail clicks",
  );
  const candidate = modal
    .locator(".selector-modal-list-item-link")
    .filter({ hasText: "Enchant Cloak - Minor Agility" });
  await candidate.locator("..").locator(".kfc-item-details").click();
  await page.locator("dialog[open]").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  assert(await modal.isVisible(), "Closing candidate details must not close the picker");
  await page.mouse.move(1, 1);
  await candidate.hover();
  assert.match(await page.locator("[role=tooltip] .kfc-item-tooltip").innerText(), /\+3 Agility/);
  await page.keyboard.press("Escape");
  assert(await modal.isVisible());
  await candidate.click();
  await page.waitForFunction(() =>
    Object.values(globalThis.localStorage).some((raw) => raw.includes('"enchant":247')),
  );
  await modal.locator(".modal-header .btn-close:visible").first().click();
  await settle(page);
  assert.match(await back.locator(".item-picker-enchant").innerText(), /\+3 Agility/);
  const before = await saved(page);
  await page.reload();
  await page.locator(".item-picker-enchant:visible").first().waitFor();
  assert((await saved(page)).value.player.equipment.items.some((item) => item.enchant === 247));
  assert.equal((await saved(page)).value.player.talentsString, before.value.player.talentsString);
  assert.deepEqual((await saved(page)).value.player.rotation, before.value.player.rotation);
  console.log("PASS enchant apply/save/reload retains gear, talents and rotation");
  await back.locator(".item-picker-enchant").click();
  await settle(page);
  await search.fill("Minor Resistance");
  const unsupported = modal
    .locator(".selector-modal-list-item-link")
    .filter({ hasText: "Enchant Cloak - Minor Resistance" });
  assert.equal(await unsupported.getAttribute("aria-disabled"), "true");
  await unsupported.evaluate((element) => element.click());
  assert((await saved(page)).value.player.equipment.items.some((item) => item.enchant === 247));
  await modal.getByRole("button", { name: "No enchant", exact: true }).click();
  await modal.locator(".modal-header .btn-close:visible").first().click();
  await settle(page);
  assert.equal((await saved(page)).value.player.equipment.items[3].enchant, undefined);
  await page.reload();
  await page.locator(".item-picker-enchant:visible").first().waitFor();
  assert.equal(
    (await saved(page)).value.player.equipment.items[3].enchant,
    undefined,
    "No enchant must survive reload without default autofill",
  );
  console.log("PASS unsupported activation rejected; No enchant removes only enhancement");
  await page.setViewportSize({ width: 390, height: 844 });
  await firstItem.locator("..").locator(".kfc-item-details").click();
  await page.locator("dialog[open]").waitFor();
  assert.match(await page.locator("dialog[open]").innerText(), /Stamina/);
  await assertInside(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.screenshot({ path: join(directory, "inspection-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await firstItem.hover();
  await page.locator("[role=tooltip] .kfc-item-tooltip").waitFor();
  await page.screenshot({ path: join(directory, "inspection-desktop.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const weapon = page
    .locator(".gear-picker-root .item-picker-root")
    .filter({ has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }) });
  await weapon.locator(".item-picker-enchant").click();
  await settle(page);
  await search.fill("Crusader");
  const crusader = modal
    .locator(".selector-modal-list-item-link")
    .filter({ hasText: "Enchant Weapon - Crusader" });
  assert.equal(await crusader.getAttribute("aria-disabled"), "true");
  await crusader.evaluate((element) => element.click());
  assert(!(await saved(page)).value.player.equipment.items.some((item) => item.enchant === 1900));
  await modal.locator(".tab-pane.active .kfc-enchant-optin input").check();
  assert.equal(await crusader.getAttribute("aria-disabled"), "false");
  await crusader.click();
  assert((await saved(page)).value.player.equipment.items.some((item) => item.enchant === 1900));
  await modal.getByRole("button", { name: "No enchant", exact: true }).click();
  await modal.locator(".modal-header .btn-close:visible").first().click();
  await settle(page);
  console.log("PASS provisional proc activation requires explicit opt-in");
  const valid = await saved(page);
  const broken = globalThis.structuredClone(valid.value);
  broken.player.equipment.items[0].enchant = 999999;
  const original = JSON.stringify(broken);
  await page.evaluate(({ key, raw }) => globalThis.localStorage.setItem(key, raw), {
    key: valid.key,
    raw: original,
  });
  await page.reload();
  await page.locator(".kfc-build-recovery").waitFor();
  assert.equal(
    await page.evaluate(
      (key) => globalThis.localStorage.getItem(key + "_enchant_recovery"),
      valid.key,
    ),
    original,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download original build", exact: true }).click();
  const download = await downloadPromise;
  assert.equal(await readFile(await download.path(), "utf8"), original);
  console.log(
    "PASS unknown saved enchant: visible warning, exact local recovery and original download",
  );
  assert.deepEqual(errors, []);
  await context.close();
  console.log("PASS hover/focus dismissal, viewport placement and mobile details");
  const embeddedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const embeddedPage = await embeddedContext.newPage();
  const shell = origin + "/__inspection_test_shell";
  await embeddedPage.route(shell, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<main style="padding-top:250px"><iframe title="Embedded simulator" style="width:98%;height:1200px;border:0" src="${origin}/forever-sim/${manifest.release}/tank_warrior/"></iframe></main>`,
    }),
  );
  await embeddedPage.goto(shell, { waitUntil: "domcontentloaded" });
  const frame = embeddedPage.frameLocator("iframe");
  await frame.locator(".item-picker-enchant:visible").first().waitFor();
  await frame.locator(".gear-picker-root .item-picker-name").first().hover();
  const tip = frame.locator("[role=tooltip] .kfc-item-tooltip");
  await tip.waitFor();
  const tipBox = await tip.boundingBox();
  assert(
    tipBox && tipBox.y >= -1 && tipBox.y + tipBox.height <= 901,
    "Embedded tooltip escapes the outer browser viewport",
  );
  await embeddedPage.evaluate(() => globalThis.scrollBy(0, 100));
  await embeddedPage.waitForTimeout(100);
  // Scrolling may move a non-interactive anchor away from the pointer and dismiss its preview.
  await embeddedPage.mouse.move(1, 1);
  await frame.locator(".gear-picker-root .item-picker-name").first().hover();
  await tip.waitFor();
  const moved = await tip.boundingBox();
  assert(
    moved && moved.y >= -1 && moved.y + moved.height <= 901,
    "Parent scrolling lost tooltip placement",
  );
  await embeddedContext.close();
  console.log("PASS same-origin iframe visible bounds and parent scroll");
  for (const spec of SIMULATOR_SPECS.filter((entry) => entry.role !== "raid")) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => globalThis.localStorage.setItem("classic_wasmconcurrency", "1"));
    try {
      await start(page, spec.page);
      if (["protection_paladin", "feral_tank_druid"].includes(spec.page)) {
        const slot = spec.page === "protection_paladin" ? "Off Hand" : "Main Hand";
        const name =
          spec.page === "protection_paladin"
            ? "Enchant Shield - Greater Stamina"
            : "Enchant 2H Weapon - Agility";
        const card = page
          .locator(".gear-picker-root .item-picker-root")
          .filter({ has: page.locator(".kfc-slot-label", { hasText: new RegExp(`^${slot}$`) }) });
        await card.locator(".item-picker-enchant").click();
        await settle(page);
        const modal = page.locator(".modal.show .selector-modal");
        await modal.locator(".tab-pane.active .selector-modal-search").fill(name);
        const choice = modal.locator(".selector-modal-list-item-link").filter({ hasText: name });
        assert.equal(await choice.getAttribute("aria-disabled"), "false");
        await choice.click();
        await modal.locator(".modal-header .btn-close:visible").first().click();
        await settle(page);
      }
      const metrics = await run(page);
      assert(metrics.every((metric) => Number.isFinite(Number(metric.replaceAll(",", "")))));
      assert.deepEqual(errors, []);
      console.log(`PASS ${spec.slug}: real combat ${metrics.join(" / ")}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
