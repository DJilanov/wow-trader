import assert from "node:assert/strict";
import { URL } from "node:url";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import console from "node:console";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: "http://127.0.0.1:3029/tools" },
    output: { type: "string" },
  },
});
assert(values.output, "Choose --output=<review directory>");
const base = new URL(values["base-url"]);
assert(["http:", "https:"].includes(base.protocol));
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const browser = await chromium.launch();
const checks = [],
  errors = [],
  assetErrors = [];
const routes = [
  { path: "/forever/tier-list", kind: "dps", count: 25 },
  { path: "/forever/tier-list/solo", kind: "dps", count: 25 },
  { path: "/forever/tier-list/tanks", kind: "tank", count: 3 },
  { path: "/forever/tier-list/tanks/solo", kind: "tank", count: 3 },
  { path: "/forever/tier-list/healers", kind: "healer", count: 13 },
];
let failure;
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      extraHTTPHeaders: { DNT: "1", "Sec-GPC": "1" },
    });
    try {
      for (const route of routes) {
        const page = await context.newPage();
        page.on("pageerror", (error) =>
          errors.push({ path: route.path, width, message: error.message }),
        );
        page.on("response", (response) => {
          if (
            response.status() >= 400 &&
            /\.(?:jpg|png|webp|svg|css|js)(?:\?|$)/.test(response.url())
          )
            assetErrors.push({ url: response.url(), status: response.status() });
        });
        try {
          const response = await page.goto(base.href.replace(/\/$/, "") + route.path, {
            waitUntil: "domcontentloaded",
            timeout: 90000,
          });
          assert.equal(response.status(), 200);
          await page
            .locator("button[data-tier-build]")
            .first()
            .waitFor({ state: "visible", timeout: 30000 });
          await page.waitForLoadState("networkidle", { timeout: 30000 });
          assert.equal(await page.locator("button[data-tier-build]").count(), route.count);
          assert.equal(await page.getByText(/rankings are being refreshed/i).count(), 0);
          await page.getByRole("link", { name: "Healers", exact: true }).waitFor();
          if (route.kind === "healer") {
            for (const label of ["Tank healing", "Burst recovery", "Group healing"]) {
              await page.getByRole("button", { name: label, exact: true }).click();
              await page.waitForFunction(
                (label) =>
                  Array.from(globalThis.document.querySelectorAll("button")).some(
                    (button) =>
                      button.textContent === label &&
                      button.getAttribute("aria-pressed") === "true",
                  ),
                label,
              );
              assert.equal(await page.locator("button[data-tier-build]").count(), 13);
            }
            await page.getByLabel("Class", { exact: true }).selectOption("paladin");
            await page.waitForFunction(
              () => globalThis.document.querySelectorAll("button[data-tier-build]").length === 3,
            );
            assert.equal(await page.locator("button[data-tier-build]").count(), 3);
            await page.locator("button[data-tier-build]").last().click();
            const selected = await page
              .locator("[data-selected-healer]")
              .getAttribute("data-selected-healer");
            assert(selected.startsWith("healing-paladin-"));
            const link = await page
              .getByRole("link", { name: "Open this build" })
              .getAttribute("href");
            assert(link.includes("healing-paladin?release=") && link.includes("&build="));
            await page.getByLabel("Class", { exact: true }).selectOption("");
          } else if (route.kind === "tank") {
            await page.getByRole("button", { name: "Damage taken", exact: true }).click();
            await page.waitForSelector('[data-selected-objective="mitigation"]');
            await page.getByText("Build details and measurement", { exact: true }).click();
            const link = await page
              .getByRole("link", { name: "Open tank workspace" })
              .getAttribute("href");
            assert(link.includes("-mitigation"));
            await page.getByRole("button", { name: "Threat generation", exact: true }).click();
            await page.waitForSelector('[data-selected-objective="threat"]');
          } else {
            await page.getByLabel("Class", { exact: true }).selectOption("paladin");
            await page.waitForFunction(
              () => globalThis.document.querySelectorAll("button[data-tier-build]").length === 2,
            );
            assert.equal(await page.locator("button[data-tier-build]").count(), 2);
            await page.locator("button[data-tier-build]").last().click();
            await page.getByLabel("Class", { exact: true }).selectOption("");
          }
          await page.locator("img").evaluateAll((images) =>
            Promise.all(
              images.map((image) =>
                image.complete
                  ? Promise.resolve()
                  : new Promise((resolve) => {
                      image.onload = resolve;
                      image.onerror = resolve;
                    }),
              ),
            ),
          );
          const broken = await page
            .locator("img")
            .evaluateAll((images) =>
              images
                .filter((image) => !image.complete || image.naturalWidth === 0)
                .map((image) => image.src),
            );
          assert.deepEqual(broken, []);
          const overflow = await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth + 1,
          );
          assert.equal(overflow, false, "Horizontal overflow: " + route.path + " at " + width);
          const title = await page.locator("h1").textContent();
          checks.push({
            path: route.path,
            width,
            builds: route.count,
            title,
            interactive: true,
            imagesLoaded: true,
            horizontalOverflow: false,
          });
          if ((route.kind === "healer" || route.kind === "tank") && width !== 390)
            await page.screenshot({
              path: join(output, route.path.replaceAll("/", "-") + "-" + width + ".png"),
              fullPage: true,
            });
          console.log(JSON.stringify(checks.at(-1)));
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
  }
  assert.equal(checks.length, 15);
  assert.deepEqual(errors, []);
  assert.deepEqual(assetErrors, []);
} catch (error) {
  failure = error;
} finally {
  await browser.close();
}
const report = {
  schema: "kfc-current-tier-browser-review.v1",
  status: failure ? "failed" : "passed",
  baseUrl: base.href,
  completedAt: new Date().toISOString(),
  checks,
  errors,
  assetErrors,
  error: failure ? String(failure.stack ?? failure) : null,
};
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
if (failure) throw failure;
console.log(JSON.stringify({ status: "passed", checks: checks.length, output }));
