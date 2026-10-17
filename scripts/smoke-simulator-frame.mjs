import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";

const root = resolve(import.meta.dirname, "..");
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function ready(page) {
  await page
    .frameLocator(".forever-simulator-frame iframe")
    .locator(".dps-action")
    .waitFor({ state: "visible", timeout: 60000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
}
try {
  for (const slug of ["tank-warrior", "protection-paladin", "feral-tank-druid", "raid"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/forever/simulator/${slug}`, { waitUntil: "domcontentloaded" });
      await ready(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await ready(page);
      assert.deepEqual(errors, [], `${slug}: browser errors`);
      console.log(`PASS ${slug}: real wrapper loading state clears on first load and reload`);
    } finally {
      await context.close();
    }
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  let releaseChunks;
  const gate = new Promise((resolve) => {
    releaseChunks = resolve;
  });
  let heldHydrationScript = false;
  await page.route("**/_next/static/chunks/**", async (route) => {
    // Holding every chunk starves same-origin iframe requests in a production HTTP/1 preview.
    if (route.request().resourceType() === "script" && !heldHydrationScript) {
      heldHydrationScript = true;
      await gate;
    }
    await route.continue();
  });
  try {
    await page.goto(`${origin}/forever/simulator/tank-warrior`, { waitUntil: "commit" });
    await page
      .frameLocator("iframe")
      .locator('.sim-ui[data-kfc-initialized="true"]')
      .waitFor({ state: "attached", timeout: 60000 });
    await page.waitForFunction(
      () => globalThis.document.querySelector("iframe")?.contentDocument?.readyState === "complete",
    );
    assert(await page.locator(".simulator-loading").isVisible());
    releaseChunks();
    await ready(page);
    console.log("PASS iframe completes before parent hydration: missed load event recovered");
  } finally {
    releaseChunks();
    await context.close();
  }

  const retryContext = await browser.newContext();
  const retryPage = await retryContext.newPage();
  const blockEngine = (route) =>
    route.request().resourceType() === "script" ? route.abort("failed") : route.continue();
  try {
    await retryPage.goto(`${origin}/forever/simulator/tank-warrior`, {
      waitUntil: "domcontentloaded",
    });
    await ready(retryPage);
    const engine = retryPage.frameLocator("iframe");
    await engine.locator(".gear-picker-root .item-picker-name").first().waitFor();
    await engine.locator("#simui-iterations").fill("10");
    await engine.locator("#simui-iterations").dispatchEvent("change");
    const savedBefore = await retryPage.evaluate(() =>
      Object.entries(globalThis.localStorage).filter(([, raw]) => {
        try {
          return Boolean(JSON.parse(raw)?.player?.equipment);
        } catch {
          return false;
        }
      }),
    );
    assert(savedBefore.length > 0, "No persisted simulator character to protect");
    await retryPage.route("**/forever-sim/**", blockEngine);
    await retryPage.reload({ waitUntil: "domcontentloaded" });
    await retryPage
      .getByRole("button", { name: "Reload engine", exact: true })
      .waitFor({ timeout: 45000 });
    await retryPage.unroute("**/forever-sim/**", blockEngine);
    await retryPage.getByRole("button", { name: "Reload engine", exact: true }).click();
    await ready(retryPage);
    assert.deepEqual(
      await retryPage.evaluate(() =>
        Object.entries(globalThis.localStorage).filter(([, raw]) => {
          try {
            return Boolean(JSON.parse(raw)?.player?.equipment);
          } catch {
            return false;
          }
        }),
      ),
      savedBefore,
    );
    console.log("PASS blocked engine asset: visible retry recovers without clearing saved builds");
  } finally {
    await retryContext.close();
  }
} finally {
  await browser.close();
}
