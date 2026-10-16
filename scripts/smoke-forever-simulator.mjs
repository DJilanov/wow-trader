import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

// Reuse the pinned engine's browser-test dependency, rather than installing a second copy.
const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright");
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3000";
const directory = resolve(
  process.env.FOREVER_SIMULATOR_ROOT || join(root, "artifacts/forever-simulator"),
);
const manifest = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;
try {
  for (const spec of SIMULATOR_SPECS) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      errors.push(dialog.message());
      await dialog.dismiss();
    });
    page.on("request", (request) => {
      if (
        request.resourceType() === "script" &&
        new URL(request.url()).origin !== new URL(origin).origin
      )
        errors.push(`Unexpected external script: ${new URL(request.url()).host}`);
    });
    // Third-party icons are not needed to validate the local combat engine.
    await page.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
    try {
      const response = await page.goto(`${origin}/forever-sim/${manifest.release}/${spec.page}/`, {
        waitUntil: "domcontentloaded",
      });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
      await page.locator(".sim-ui").waitFor({ timeout: 45000 });
      let result = "raid builder loaded";
      if (spec.role !== "raid") {
        await page.locator(".dps-action").waitFor({ state: "visible", timeout: 45000 });
        await page.evaluate(() =>
          globalThis.window.postMessage("runOnce", globalThis.window.location.origin),
        );
        await page.waitForFunction(
          () =>
            /\d[\d,]*\.\d+/.test(
              globalThis.document.querySelector(".sim-sidebar-results")?.textContent ?? "",
            ),
          null,
          { timeout: 90000 },
        );
        result = (await page.locator(".sim-sidebar-results").innerText())
          .replace(/\s+/g, " ")
          .trim();
        if (!/[1-9]/.test(result)) throw new Error("Simulation produced no non-zero output");
      }
      if (errors.length) throw new Error(errors.join("; "));
      console.log(`PASS ${spec.slug}: ${result}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${spec.slug}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  const page = await browser.newPage();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/forever/simulator",
      "/forever/simulator/data",
      "/forever/encyclopedia/changes",
    ]) {
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      if (!response?.ok()) {
        failures++;
        console.error(`FAIL ${path}: HTTP ${response?.status()}`);
        continue;
      }
      const overflow = await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.window.innerWidth + 1,
      );
      if (overflow) {
        failures++;
        console.error(`FAIL ${path}: horizontal overflow at ${width}px`);
      } else console.log(`PASS ${path}: ${width}px layout`);
    }
  }
  await page.close();
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
