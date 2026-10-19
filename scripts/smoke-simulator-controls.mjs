import assert from "node:assert/strict";
import console from "node:console";
import { createRequire } from "node:module";
import process from "node:process";
import { URL } from "node:url";

const require = createRequire(
  new URL("../.cache/forever-sim-upstream/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const base = process.env.SIMULATOR_TEST_URL ?? "https://kfcguild.online/tools";
const browser = await chromium.launch();

async function ready(page) {
  const frame = await (await page.locator("iframe").elementHandle()).contentFrame();
  assert(frame);
  await frame.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
  await frame
    .locator(".kfc-frame-race #player-race")
    .waitFor({ state: "attached", timeout: 15000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden" });
  await page.locator("iframe").scrollIntoViewIfNeeded();
  return frame;
}

async function saved(frame) {
  return frame.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage).filter((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (keys.length !== 1) throw new Error("Expected one isolated simulator character");
    return JSON.parse(globalThis.localStorage.getItem(keys[0]));
  });
}

async function iterations(frame, count) {
  await frame.locator("#simui-iterations").fill(String(count));
  await frame.locator("#simui-iterations").dispatchEvent("change");
}

async function fight(frame) {
  await iterations(frame, 25);
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

async function stopTokenRegression(page, frame) {
  const before = await saved(frame);
  const createTokens = async () => {
    await frame.evaluate(() => {
      const fixture = globalThis.document.createElement("div");
      fixture.id = "kfc-stop-token-test";
      const first = globalThis.document.createElement("button");
      first.className = "sim-abort-button";
      first.textContent = "Old stop token";
      const second = globalThis.document.createElement("button");
      second.className = "sim-abort-button";
      second.textContent = "New stop token";
      first.addEventListener("click", () => {
        first.remove();
        fixture.append(second);
      });
      fixture.append(first);
      globalThis.document.querySelector(".sim-sidebar-actions").append(fixture);
    });
  };
  // Controlled UI tokens exercise cooperative cancellation without replacing real combat results.
  await createTokens();
  await frame.getByRole("button", { name: "Old stop token", exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(
    await frame.locator("#kfc-stop-token-test").count(),
    1,
    "A finished run's cancellation timer restarted an unrelated run",
  );
  await frame.locator("#kfc-stop-token-test").evaluate((node) => node.remove());
  await createTokens();
  await frame.getByRole("button", { name: "Old stop token", exact: true }).click();
  await frame.getByRole("button", { name: "New stop token", exact: true }).click();
  await page
    .getByText(
      "Run stopped. Results were cleared; your saved character and builds are kept. You can simulate again.",
      { exact: true },
    )
    .waitFor({ timeout: 15000 });
  frame = await ready(page);
  assert.equal(await frame.locator("#kfc-stop-token-test").count(), 0);
  assert.deepEqual(await saved(frame), before);
  console.log(JSON.stringify({ phase: "stop-timer-isolation", savedSettingsPreserved: true }));
}

try {
  for (const workers of [1, 4]) {
    const context = await browser.newContext({
      viewport: workers === 1 ? { width: 1440, height: 1080 } : { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (/Ignored call to 'alert/.test(message.text())) errors.push(message.text());
    });
    await page.addInitScript((count) => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", String(count));
      globalThis.__kfcControlsCombatRequests = 0;
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync"].includes(message.msg))
          globalThis.__kfcControlsCombatRequests++;
        return post.call(this, message, ...rest);
      };
    }, workers);
    await page.goto(base + "/forever/simulator/warrior");
    let frame = await ready(page);
    if (workers === 4) await frame.getByRole("button", { name: "Results", exact: true }).click();
    assert.equal(await frame.locator("#player-race").inputValue(), "5");
    // The exact reported path must preserve race, show the validation and provide recovery.
    if (workers === 4) await frame.getByRole("button", { name: "Build", exact: true }).click();
    await frame
      .locator(".preset-configuration-picker-root:visible")
      .getByText("Arms · pre-raid tested", { exact: true })
      .click();
    if (workers === 4) await frame.getByRole("button", { name: "Results", exact: true }).click();
    await frame.locator(".dps-action").click();
    await frame.locator(".kfc-frame-notice").waitFor({ state: "visible" });
    assert.match(await frame.locator(".kfc-frame-notice").innerText(), /different faction/);
    await frame.getByRole("button", { name: "Choose race", exact: true }).click();
    assert.equal(
      await frame
        .locator("#player-race")
        .evaluate((node) => node === node.ownerDocument.activeElement),
      true,
    );
    await frame.locator("#player-race").selectOption("3");
    assert.equal(await frame.locator(".kfc-frame-notice").isVisible(), false);
    assert.equal((await saved(frame)).player.race, "RaceHuman");
    await fight(frame);
    console.log(
      JSON.stringify({ phase: "built-in-arms-race-and-combat", workers, iterations: 25 }),
    );
    if (workers === 1) await stopTokenRegression(page, frame);

    // Load a full share, then edit it. A stuck Stop must not replay the share over those edits.
    await page.getByLabel("Choose a build").selectOption("arms-alliance");
    await page.getByRole("button", { name: "Load build", exact: true }).click();
    frame = await ready(page);
    if (workers === 4) await frame.getByRole("button", { name: "Results", exact: true }).click();
    assert((await page.locator("iframe").getAttribute("src")).includes("#"));
    await frame.locator("#player-race").selectOption("1");
    await iterations(frame, 100000);
    const before = await saved(frame);
    const settingsKey = await frame.evaluate(() =>
      Object.keys(globalThis.localStorage).find((key) => key.endsWith("__currentSettings__")),
    );
    assert.equal(before.player.race, "RaceDwarf");
    assert(settingsKey);
    const otherSettings = await frame.evaluate(
      (key) =>
        Object.fromEntries(
          Object.entries(globalThis.localStorage).filter(([entry]) => entry !== key),
        ),
      settingsKey,
    );
    const requestsBefore = await frame.evaluate(() => globalThis.__kfcControlsCombatRequests);
    await frame.locator(".dps-action").click();
    await frame.waitForFunction(
      (before) => globalThis.__kfcControlsCombatRequests > before,
      requestsBefore,
    );
    const stop = frame.locator(".sim-abort-button");
    await stop.waitFor({ state: "visible", timeout: 10000 });
    const started = Date.now();
    await stop.click();
    await page
      .getByText(
        "Run stopped. Results were cleared; your saved character and builds are kept. You can simulate again.",
        { exact: true },
      )
      .waitFor({ timeout: 30000 });
    frame = await ready(page);
    assert.deepEqual(await saved(frame), before);
    assert.deepEqual(
      await frame.evaluate(
        (key) =>
          Object.fromEntries(
            Object.entries(globalThis.localStorage).filter(([entry]) => entry !== key),
          ),
        settingsKey,
      ),
      otherSettings,
    );
    assert.equal(await frame.locator(".dps-action").isEnabled(), true);
    const recoveredMs = Date.now() - started;
    assert(recoveredMs < 15000, "Stop recovery exceeded 15 seconds including engine loading");
    await fight(frame);
    assert.equal(await frame.locator("#player-race").inputValue(), "1");
    assert.equal(await frame.locator("#player-race").count(), 1);
    assert(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        phase: "stop-recovery-and-next-combat",
        workers,
        recoveredMs,
        savedSettingsPreserved: true,
        errors,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
