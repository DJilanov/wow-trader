import assert from "node:assert/strict";
import console from "node:console";
import { createRequire } from "node:module";
import process from "node:process";
import { URL } from "node:url";
import { assertSimulatorPageScroll } from "./simulator-page-scroll.mjs";

const require = createRequire(
  new URL("../.cache/forever-sim-upstream/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const base = new URL(process.env.SIMULATOR_TEST_URL ?? "https://kfcguild.online/tools");
assert(["http:", "https:"].includes(base.protocol));
assert(!base.username && !base.password && !base.hash && !base.search);
const mount = base.pathname.replace(/\/$/, "");
assert(mount === "/tools" || mount === "");
const browser = await chromium.launch();
const errors = [];

async function ready(page) {
  const frame = await (
    await page.locator(".forever-simulator-frame iframe").elementHandle()
  ).contentFrame();
  assert(frame);
  await page.locator(".site-header .brand-mark img").evaluate(async (image) => {
    await image.decode();
    if (!image.complete || image.naturalWidth === 0)
      throw new Error("Topbar logo failed to render");
  });
  await frame.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 90000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
  await frame.locator(".kfc-frame-race #player-race").waitFor({ state: "attached" });
  await page.locator(".forever-simulator-frame iframe").scrollIntoViewIfNeeded();
  return frame;
}

async function menu(frame, className) {
  const root = frame.locator(".sim-title-dropdown-root > .dropdown > a");
  if ((await root.getAttribute("aria-expanded")) !== "true") await root.click();
  const submenu = frame
    .locator(".sim-title-dropdown-root .dropend > a")
    .filter({ has: frame.locator(".sim-link-title", { hasText: new RegExp(`^${className}$`) }) });
  if ((await submenu.getAttribute("aria-expanded")) !== "true") await submenu.click();
}

async function fight(frame, mobile) {
  if (mobile) await frame.getByRole("button", { name: "Results", exact: true }).click();
  await frame.locator("#simui-iterations").fill("25");
  await frame.locator("#simui-iterations").dispatchEvent("change");
  await frame.locator(".dps-action").click();
  await frame.waitForFunction(
    () =>
      !globalThis.document.querySelector(".dps-action")?.disabled &&
      /\d[\d,]*\.\d+/.test(
        globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
          "",
      ),
    null,
    { timeout: 90000 },
  );
  assert.equal(await frame.locator(".kfc-frame-notice").isVisible(), false);
}

try {
  for (const viewport of [
    { width: 1440, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    const mobile = viewport.width < 400;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (/Ignored call to 'alert/.test(message.text())) errors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.includes("/forever-sim/"))
        errors.push(`Simulator HTTP ${response.status()}: ${response.url()}`);
    });
    await page.addInitScript(() => {
      if (globalThis.location.origin !== "null")
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
    });
    await page.goto(new URL(mount + "/forever/simulator/hunter", base).href);
    let frame = await ready(page);
    await menu(frame, "Warrior");
    await frame
      .locator(`.sim-title-dropdown-root a[href="${mount}/forever/simulator/warrior"]`)
      .click();
    await page.waitForURL((url) => url.pathname === mount + "/forever/simulator/warrior");
    frame = await ready(page);
    await assertSimulatorPageScroll(frame);
    assert.match(frame.url(), /\/warrior\/?$/);
    assert.equal(await page.locator("h1").innerText(), "Warrior DPS");

    await page.evaluate(() => globalThis.history.back());
    await page.waitForURL((url) => url.pathname === mount + "/forever/simulator/hunter");
    frame = await ready(page);
    await page.evaluate(() => globalThis.history.forward());
    await page.waitForURL((url) => url.pathname === mount + "/forever/simulator/warrior");
    frame = await ready(page);
    const shared = await context.newPage();
    await shared.goto(page.url());
    assert.match((await ready(shared)).url(), /\/warrior\/?$/);
    await shared.close();

    if (mobile) await frame.getByRole("button", { name: "Build", exact: true }).click();
    let configuration = frame.locator(".preset-configuration-picker-root:visible").first();
    // Click actual button padding, not the inner span carrying upstream's handler.
    await configuration
      .getByRole("button", { name: "Arms · pre-raid tested", exact: true })
      .first()
      .click({ position: { x: 3, y: 3 } });
    assert.equal(await page.getByLabel("Choose a build").inputValue(), "arms-alliance");
    assert.equal(
      await frame.locator("#player-race").inputValue(),
      "5",
      "Preset must preserve the chosen race",
    );
    if (mobile) await frame.getByRole("button", { name: "Results", exact: true }).click();
    await frame.locator(".dps-action").click();
    await frame.locator(".kfc-frame-notice").waitFor({ state: "visible" });
    assert.match(await frame.locator(".kfc-frame-notice").innerText(), /different faction/);
    await frame.getByRole("button", { name: "Load full tested build", exact: true }).click();
    frame = await ready(page);
    assert.equal(await frame.locator("#player-race").inputValue(), "3");
    await fight(frame, mobile);
    if (mobile) await frame.getByRole("button", { name: "Build", exact: true }).click();
    configuration = frame.locator(".preset-configuration-picker-root:visible").first();
    const twoHand = configuration
      .getByRole("button", { name: "Two-hand Fury · pre-raid tested", exact: true })
      .first();
    await twoHand.focus();
    await twoHand.press("Enter");
    assert.equal(await page.getByLabel("Choose a build").inputValue(), "two-hand-fury-static");
    await page.getByRole("button", { name: "Load build", exact: true }).click();
    frame = await ready(page);
    assert.equal(
      await frame
        .locator(".preset-configuration-picker-root .active .saved-data-set-name")
        .first()
        .innerText(),
      "Two-hand Fury · pre-raid tested",
    );
    await fight(frame, mobile);
    console.log(
      JSON.stringify({ phase: "class-url-arms-and-two-hand-presets", viewport, combatFights: 50 }),
    );

    // Named links now load a complete reviewed scenario, not obsolete talent names on Fury gear.
    await menu(frame, "Warrior");
    await frame.locator('.sim-title-dropdown-root a.sim-link-build[href*="build=Arms"]').click();
    await page.waitForURL(
      (url) =>
        url.pathname === mount + "/forever/simulator/warrior" &&
        url.searchParams.get("build") === "Arms 34/17/0",
    );
    frame = await ready(page);
    assert.equal(await page.getByLabel("Choose a build").inputValue(), "arms-alliance");
    assert.equal(await frame.locator("#player-race").inputValue(), "3");
    await page.reload();
    frame = await ready(page);
    assert.equal(await page.getByLabel("Choose a build").inputValue(), "arms-alliance");
    await assertSimulatorPageScroll(frame);
    for (const [name, id, label] of [
      ["Survival 7/11/33", "hunter-survival-static", "Survival · first-pass tested"],
      ["Marksmanship 5/35/11", "hunter-marksmanship-static", "Marksmanship · first-pass tested"],
    ]) {
      await menu(frame, "Hunter");
      await frame
        .locator(`.sim-title-dropdown-root a.sim-link-build[href*="build=${name.split(" ")[0]}"]`)
        .click();
      await page.waitForURL(
        (url) =>
          url.pathname === mount + "/forever/simulator/hunter" &&
          url.searchParams.get("build") === name,
      );
      frame = await ready(page);
      assert.equal(await page.getByLabel("Choose a build").inputValue(), id);
      assert.equal(
        await frame
          .locator(".preset-configuration-picker-root .active .saved-data-set-name")
          .first()
          .innerText(),
        label,
      );
      await assertSimulatorPageScroll(frame);
    }
    console.log(JSON.stringify({ phase: "hunter-named-reviewed-builds", viewport, cases: 2 }));
    // Also exercise a non-reviewed build query which the engine intentionally consumes.
    await page.goto(new URL(mount + "/forever/simulator/mage?build=Fire+0%2F35%2F16", base).href);
    frame = await ready(page);
    assert.equal(new URL(frame.url()).search, "");
    if (!mobile) await page.waitForTimeout(31000);
    assert.equal(await page.locator(".simulator-loading").count(), 0);
    assert.equal(await frame.locator("#player-race").count(), 1);
    console.log(
      JSON.stringify({ phase: "history-share-named-links-and-consumed-query", viewport, errors }),
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
