import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { DUNGEON_RELEASE } from "../packages/leveling/dist/index.js";

const packagePath = process.argv
  .find((value) => value.startsWith("--playwright-package="))
  ?.slice(21);
if (!packagePath)
  throw Error("Pass --playwright-package=<installed @playwright/test/package.json>.");
const require = createRequire(resolve(packagePath));
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 30000 });
const base = new URL(process.env.LEVELING_TEST_HELPER ?? "http://127.0.0.1:3317");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
  !["http:", "https:"].includes(base.protocol) ||
  base.username ||
  base.password
)
  throw Error("Use a local preview, never production.");
const output = await mkdtemp(join(tmpdir(), "wow-trader-theoretical-xp-"));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.route("**/*", (route) =>
      ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort(),
    );
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(30000);
    const target = new URL(
      "/tools/forever/leveling/routes/alliance-human/chapters/premade-start-115?plan=premade&class=warrior#campaign-start-115-level-4-96627",
      base,
    ).href;
    const response = await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
    assert.equal(response.status(), 200);
    await page.getByRole("button", { name: "Save full leveling plan", exact: true }).click();
    const savedProgress = () =>
      page.evaluate((release) => {
        const workspace = JSON.parse(globalThis.localStorage.getItem("kfc-leveling:characters:v1"));
        return workspace.sessions.find((session) => session.id === workspace.activeId).dungeonPlans[
          release
        ].premade;
      }, DUNGEON_RELEASE);
    await page.reload({ waitUntil: "networkidle" });
    await expect(
      page.locator('[data-campaign-action="start-115-115-source-step-0073"]'),
    ).toBeVisible();
    await expect(page.locator('[data-campaign-action="start-115-level-4-96627"]')).toHaveCount(0);
    const before = await savedProgress();
    const projection = page.locator('[data-step-projection="true"]');
    await projection.locator("summary").click();
    await expect(projection).toContainText("level 4 + 1,681 XP");
    await expect(projection).toContainText("Saved bars are unchanged");
    assert.deepEqual((await savedProgress()).members, before.members);
    await projection.getByLabel("Projection starting point").selectOption("actual");
    await expect(projection).toContainText("Record fresh actual XP");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("form", {
      name: "Theoretical combat XP settings",
      exact: true,
    });
    await settings.getByLabel("Outdoor kill XP multiplier").fill("0");
    await settings.getByRole("button", { name: "Save combat planning settings" }).click();
    await expect
      .poll(async () => (await savedProgress()).combatPlanning?.outdoorXpMultiplier)
      .toBe(0);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal((await savedProgress()).combatPlanning.outdoorXpMultiplier, 0);
    assert.deepEqual(
      (await savedProgress()).members,
      before.members,
      "A forecast changed actual XP.",
    );
    await page.locator('[data-step-projection="true"] summary').click();
    await expect(projection).toContainText("Modeled known-XP gap: 20 XP");
    assert.equal(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: join(output, `${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], "The reader raised a browser error.");
    await context.close();
  }
  process.stdout.write(`${JSON.stringify({ status: "passed", widths: [1440, 390], output })}\n`);
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
      process.stderr.write(
        `${JSON.stringify({ url: page.url(), output, projection: await page.locator('[data-step-projection="true"]').allTextContents() })}\n`,
      );
    }
  throw error;
} finally {
  await browser.close();
}
